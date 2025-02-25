## API Report File for "@vuedx/compiler-tsx"

> Do not edit this file. It is a report generated by [API Extractor](https://api-extractor.com/).

```ts

import { CodegenResult as CodegenResult_2 } from '@vue/compiler-core';
import { CompilerError } from '@vue/compiler-core';
import { CompilerOptions } from '@vue/compiler-core';
import { ParserOptions } from '@vue/compiler-core';
import { RootNode } from '@vue/compiler-core';

// @public (undocumented)
export interface CodegenResult extends CodegenResult_2 {
    // (undocumented)
    errors: CompilerError[];
    expressions: Array<[number, number]>;
    mappings: Array<[number, number, number, number, number]>;
}

// @public (undocumented)
export function compile(template: string, options: Options & CompilerOptions): CodegenResult;

// @public (undocumented)
export interface ComponentImport {
    // (undocumented)
    name?: string;
    // (undocumented)
    named?: boolean;
    // (undocumented)
    path: string;
}

// Warning: (ae-internal-missing-underscore) The name "getTopLevelIdentifiers" should be prefixed with an underscore because the declaration is marked as @internal
//
// @internal (undocumented)
export function getTopLevelIdentifiers(source: string, ignoreImportsFrom: string[]): {
    identifiers: Set<string>;
    components: Set<string>;
    directives: Set<string>;
    propsIdentifier: string | undefined;
    emitIdentifier: string | undefined;
};

// @public (undocumented)
export interface Options {
    // (undocumented)
    components?: Record<string, ComponentImport>;
    // (undocumented)
    filename: string;
}

// @public (undocumented)
export function parse(template: string, options: ParserOptions): RootNode;


// (No @packageDocumentation comment for this package)

```
