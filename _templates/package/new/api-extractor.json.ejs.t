---
to: packages/<%= name %>/api-extractor.json
---
//  Config file for API Extractor.  For more info, please visit: https://api-extractor.com
{
  "$schema": "https://developer.microsoft.com/json-schemas/api-extractor/v7/api-extractor.schema.json",
  "projectFolder": ".",
  "mainEntryPointFilePath": "<projectFolder>/lib/index.d.ts",
  "bundledPackages": [],
  "compiler": {
    "tsconfigFilePath": "<projectFolder>/tsconfig.json",
    "overrideTsconfig": {},
    "skipLibCheck": true
  },
  "apiReport": {
    "enabled": true,
    "reportFileName": "<unscopedPackageName>.api.md",
    "reportFolder": "<projectFolder>/"
  },
  "docModel": {
    "enabled": true
  },

  "dtsRollup": {
    "enabled": false
  },

  "tsdocMetadata": {},
  "messages": {
    "compilerMessageReporting": {
      "default": {
        "logLevel": "warning"
      }
    },

    "extractorMessageReporting": {
      "default": {
        "logLevel": "warning"
      }
    },

    "tsdocMessageReporting": {
      "default": {
        "logLevel": "warning"
      }
    }
  }
}
