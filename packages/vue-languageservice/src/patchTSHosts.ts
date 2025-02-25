import { first } from '@vuedx/shared'
import { overrideMethod } from './overrideMethod'
import { LoggerService } from './services/LoggerService'

import type { Typescript } from './contracts/Typescript'
import type { CreateLanguageServiceOptions } from './CreateLanguageServiceOptions'
import type { FilesystemService } from './services/FilesystemService'
import type { TypescriptService } from './services/TypescriptService'

const isDebug = process.env['DEBUG_VUE_TRANSFORMS'] != null

export function patchTSHosts(
  options: CreateLanguageServiceOptions,
  fs: FilesystemService,
  ts: TypescriptService,
): void {
  const logger = LoggerService.getLogger('patch')

  // Patch: check virtual files in activeTSDocIDs of VueSFCDocument
  overrideMethod(
    options.serverHost,
    'fileExists',
    (fileExists) => (fileName) => {
      if (fs.isVueVirtualFile(fileName)) {
        const file = fs.getVueFile(fileName)
        if (file == null) return false
        const exists = file.getActiveTSDocIDs().has(fileName)
        if (exists) logger.debug(`Found ${fileName}`)
        return exists
      } else if (fs.isVueTsFile(fileName)) {
        const exists = fileExists(fileName.substr(0, fileName.length - 3))
        if (exists) logger.debug(`Found ${fileName}`)
        return exists
      }

      return fileExists(fileName)
    },
  )

  // Patch: check virtual files in activeTSDocIDs of VueSFCDocument
  overrideMethod(
    options.serverHost,
    'watchFile',
    (watchFile) => (fileName, callback) => {
      if (fs.isVueTsFile(fileName) || fs.isVueVirtualFile(fileName)) {
        return { close: () => {} }
      }

      return watchFile(fileName, callback)
    },
  )

  // Patch: get contents for virtual files from VueSFCDocument
  overrideMethod(
    options.serverHost,
    'readFile',
    (readFile) => (fileName, encoding) => {
      if (fs.isVueVirtualFile(fileName)) {
        const doc = fs.getVueFile(fileName)?.getDocById(fileName)
        if (doc != null) {
          if (doc.generated == null) {
            // Use original source when generated is null
            return doc.block.type === 'script' ? doc.source.getText() : ''
          }

          const content = doc.generated.getText()
          logger.debug(`Load ${fileName}${isDebug ? `\n${content}` : ''}`)
          return content
        }
      } else if (fs.isVueTsFile(fileName)) {
        const content = fs.getVueFile(fileName)?.getTypeScriptText()
        logger.debug(`Load ${fileName}${isDebug ? `\n${content ?? ''}` : ''}`)
        return content
      }

      return readFile(fileName, encoding)
    },
  )

  overrideMethod(
    options.project,
    'getCompilerOptions',
    (getCompilerOptions) => () => {
      const settings = getCompilerOptions()

      settings.jsx = options.typescript.JsxEmit.Preserve

      return settings
    },
  )

  overrideMethod(
    options.project,
    'getCompilationSettings',
    (getCompilationSettings) => () => {
      const settings = getCompilationSettings()

      settings.jsx = options.typescript.JsxEmit.Preserve

      return settings
    },
  )

  overrideMethod(
    options.languageServiceHost,
    'getScriptVersion',
    (getScriptVersion) => (fileName: string): string => {
      const version = getScriptVersion(fs.getRealFileName(fileName))

      if (
        fs.isVueFile(fileName) ||
        fs.isVueVirtualFile(fileName) ||
        fs.isVueTsFile(fileName)
      ) {
        logger.debug(`Version ${version} of ${fileName}`)
      }

      return version
    },
  )

  // Patch: create snapshots for virtual files from VueSFCDocument
  overrideMethod(
    options.languageServiceHost,
    'getScriptSnapshot',
    (getScriptSnapshot) => (
      fileName: string,
    ): Typescript.IScriptSnapshot | undefined => {
      if (fs.isVueTsFile(fileName)) {
        const file = fs.getVueFile(fileName)

        if (file != null) {
          return options.typescript.ScriptSnapshot.fromString(
            file.getTypeScriptText(),
          )
        }

        logger.error(`Missing snapshot: ${fileName}`)

        return undefined
      } else if (fs.isVueVirtualFile(fileName)) {
        const vueFile = fs.getVueFile(fileName)
        const blockFile = vueFile?.getDocById(fileName)

        if (blockFile?.generated != null) {
          return options.typescript.ScriptSnapshot.fromString(
            blockFile.generated.getText(),
          )
        }

        logger.error(`Missing snapshot: ${fileName}`)

        return undefined
      } else {
        return getScriptSnapshot(fileName)
      }
    },
  )

  // Patch: Add .vue.ts file for every .vue file
  overrideMethod(
    options.languageServiceHost,
    'getScriptFileNames',
    (getScriptFileNames) => () => {
      const virtuals = new Set<string>()
      const fileNames = new Set<string>()

      getScriptFileNames().forEach((fileName) => {
        if (
          fs.isVueFile(fileName) ||
          fs.isVueTsFile(fileName) ||
          fs.isVueVirtualFile(fileName)
        ) {
          virtuals.add(fs.getRealFileName(fileName))
        } else {
          fileNames.add(fileName)
        }
      })

      virtuals.forEach((fileName) => {
        fileNames.add(fileName)
        fileNames.add(`${fileName}.ts`)
      })

      logger.debug('getScriptFileNames', fileNames)

      return Array.from(fileNames)
    },
  )
  // Patch: 'vue' import it VueDX runtime types
  const project = options.project
  overrideMethod(
    options.languageServiceHost,
    'resolveModuleNames',
    (resolveModuleNames) => (
      moduleNames,
      containingFile,
      reusedNames,
      redirectedReference,
      _options,
    ) => {
      // TODO: Use runtimeTypeDir instead.
      if (containingFile === ts.getRuntimeHelperFileName('3.0')) {
        const anyProjectFile = first(project.getRootFiles())
        // Runtime dependencies have only 'vue' dependency for now.
        // TODO: Switch to resolveModuleNameFromCache
        const core = options.typescript.resolveModuleName(
          '@vue/runtime-core',
          anyProjectFile,
          _options,
          options.serverHost,
          undefined,
          redirectedReference,
        )
        const vue = options.typescript.resolveModuleName(
          'vue',
          anyProjectFile,
          _options,
          options.serverHost,
          undefined,
          redirectedReference,
        )
        const result = core.resolvedModule != null ? core : vue
        logger.debug(
          `Resolve '@vue/runtime-core' to "${
            result.resolvedModule?.resolvedFileName ?? '?'
          }" in "${containingFile}"`,
        )

        return [result.resolvedModule]
      }

      const isVueEntry = fs.isVueTsFile(containingFile)
      if (isVueEntry) {
        if (moduleNames[0] !== 'vuedx~runtime') {
          throw new Error('Expected vuedx~runtime import in .vue.ts file')
        }
        moduleNames = moduleNames.slice(1)
      }

      const result =
        resolveModuleNames != null // Very unlikely to be undefined
          ? resolveModuleNames(
              moduleNames,
              containingFile,
              reusedNames,
              redirectedReference,
              _options,
            )
          : project.resolveModuleNames(
              moduleNames,
              containingFile,
              reusedNames,
              redirectedReference,
            )
      if (isVueEntry) {
        const file = fs.getVueFile(containingFile)
        if (file != null) {
          const files = file.getActiveTSDocIDs()
          const filesArray = Array.from(files)
          result.forEach((resolved) => {
            if (resolved != null) {
              if (!files.has(resolved.resolvedFileName)) {
                const name = getFilenameWithoutExtension(
                  resolved.resolvedFileName,
                )
                resolved.resolvedFileName =
                  filesArray.find((item) => item.startsWith(name)) ??
                  resolved.resolvedFileName
              }
            }
          })
        }
        result.unshift({
          resolvedFileName: ts.getRuntimeHelperFileName('3.0'),
          isExternalLibraryImport: true,
        })
        logger.debug('RESOLVE IN: ' + containingFile, moduleNames, result)
      }
      return result
    },
  )

  function getFilenameWithoutExtension(fileName: string): string {
    return fileName.replace(/\.(ts|tsx|js|jsx|json|d\.ts)$/, '')
  }
}
