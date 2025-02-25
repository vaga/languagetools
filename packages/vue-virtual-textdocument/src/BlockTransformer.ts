import type {
  RawSourceMap,
  SFCBlock,
  SFCDescriptor,
  SFCScriptBlock,
  SFCStyleBlock,
  SFCTemplateBlock,
} from '@vuedx/compiler-sfc'
import { annotations, compile } from '@vuedx/compiler-tsx'
import { pascalCase } from '@vuedx/shared'
import { isRootNode } from '@vuedx/template-ast-types'
import {
  createExportDeclarationForComponents,
  createExportDeclarationForDirectives,
  createExportDeclarationForScriptSetup,
  findScopeBindings,
  toAST,
  toCode,
} from '@vuedx/transforms'
import * as Path from 'path'
import type { VueSFCDocument } from './VueSFCDocument'

export { annotations }
export type Annotations = typeof annotations

export interface BlockTransformerOptions {
  block: SFCBlock | SFCScriptBlock | SFCStyleBlock | SFCTemplateBlock
  document: VueSFCDocument
  descriptor: SFCDescriptor
  annotations: Annotations
}

export interface TransformerError {
  message: string
  code: number | string | undefined
  codeDescription?: {
    href: string
  }
  start: number | undefined
  length: number | undefined
  source?: string
  severity: 'error' | 'warning' | 'info' | 'hint' | 'unused' | 'deprecated'
}

export type BlockTransformerFn = (
  source: string,
  id: string,
  options: BlockTransformerOptions,
) => {
  code: string
  map?: RawSourceMap
  errors?: TransformerError[]
  ast?: any
}

export interface BlockTransformer {
  transform: BlockTransformerFn
  output(block: SFCBlock): 'js' | 'jsx' | 'ts' | 'tsx'
}

function isSupportedLang(lang?: string): lang is 'js' | 'jsx' | 'ts' | 'tsx' {
  return ['js', 'jsx', 'ts', 'tsx'].includes(lang ?? '')
}

export const builtins: Record<'script' | 'template', BlockTransformer> = {
  script: {
    output: (block) => (isSupportedLang(block.lang) ? block.lang : 'js'),
    transform: (source, _id, { block, document }) => {
      const isScriptSetup =
        'setup' in block && block.setup != null && block.setup !== false
      const ast = toAST(source, {
        sourceFilename: document.fileName,
        startLine: block.loc.start.line,
        isScriptSetup: isScriptSetup,
        lang: block.lang,
      })

      const usedIdentifiers = new Set<string>()
      const usedDirectives = new Set<string>()
      const usedComponents = new Set<string>()

      if (document.descriptor.template != null && isScriptSetup) {
        const ast = document.getDoc(document.descriptor.template)?.ast

        if (isRootNode(ast)) {
          ast.scope.globals.forEach((id) => {
            usedIdentifiers.add(id)
          })

          ast.components.forEach((name) => {
            const id = pascalCase(name.split('.').shift() ?? name)
            usedComponents.add(id)
          })

          ast.directives.forEach((name) => {
            const id = 'v' + pascalCase(name)
            usedDirectives.add(id)
          })
        }
      }

      const nodes: any[] = [
        createExportDeclarationForComponents(ast, {
          isScriptSetup,
          shouldIncludeScriptSetup: (id) => usedComponents.has(id),
        }),
        createExportDeclarationForDirectives(ast, {
          isScriptSetup,
          shouldIncludeScriptSetup: (id) => usedDirectives.has(id),
        }),
      ]

      if (isScriptSetup) {
        document.declarations.identifiers = new Set(findScopeBindings(ast))

        nodes.push(
          createExportDeclarationForScriptSetup(ast, {
            shouldIncludeBinding: (id) => usedIdentifiers.has(id),
          }),
        )

        const code = [
          source,
          annotations.diagnosticsIgnore.start,
          toCode(nodes).code,
          annotations.diagnosticsIgnore.end,
          '',
        ].join('\n')

        return {
          ast,
          code,
        }
      } else {
        // TODO: Handle plain object exports.
        const code = [
          source,
          annotations.diagnosticsIgnore.start,
          toCode(nodes).code,
          annotations.diagnosticsIgnore.end,
          '',
        ].join('\n')

        return {
          ast,
          code,
        }
      }
    },
  },
  template: {
    output: () => 'tsx',
    transform: (source, _, { document, descriptor, block }) => {
      try {
        const selfSrcFileName = document.getBlockId(
          descriptor.scriptSetup ??
            descriptor.script ??
            document.fallbackScript,
        )

        const { code, ast, map, errors } = compile(source, {
          sourceMap: true,
          filename: document.fileName,

          selfSrc: `./${Path.posix.basename(
            selfSrcFileName.substr(
              0,
              selfSrcFileName.length -
                Path.posix.extname(selfSrcFileName).length,
            ),
          )}`,

          onError(_error) {
            // TODO: Support error reporting
          },
        })

        document.templateAST = ast

        return {
          code,
          map,
          ast,
          errors: errors.map((error) => {
            const diag: TransformerError = {
              message: error.message,
              code: error.code,
              severity: 'error',
              source: 'TemplateCompiler',
              start: undefined,
              length: undefined,
            }

            if (error.loc != null) {
              diag.start = error.loc.start.offset
              diag.length = error.loc.end.offset - error.loc.start.offset
            }

            return diag
          }),
        }
      } catch (error) {
        return {
          code: '',

          errors: [
            {
              message: `Error processing template: ${String(
                error.message,
              )}\n${String(error.stack)}`,
              code: -1,
              source: 'TemplateCompiler',
              severity: 'error',
              start: 0,
              length: block.loc.source.length,
            },
          ],
        }
      }
    },
  },
}
