/**
 * Type-check a code block exactly as the editor's Monaco view does (same
 * compiler options and ambient libs as setupAmbientMonaco), outside Monaco:
 * the tool publish gate (lintTool) and tests use it.
 *
 * TypeScript's own lib files are read through `readLib` — `ts.sys` under
 * Node/vitest, or the lazily bundled lib .d.ts files in the browser.
 */
import ts from 'typescript';
import type { CodeDiagnostic } from '@flow/core';
import { AMBIENT_DTS, NUCLEATION_AMBIENT_DTS } from './ambient';

const BLOCK_FILE = 'file:///block.ts';
const LIB_DIR = '/ts-lib';

const COMPILER_OPTIONS: ts.CompilerOptions = {
  allowNonTsExtensions: true,
  target: ts.ScriptTarget.Latest,
  noEmit: true,
  allowJs: true,
  checkJs: false,
  strict: false,
  lib: ['lib.es2020.d.ts'],
};

const CATEGORY: Record<ts.DiagnosticCategory, CodeDiagnostic['category']> = {
  [ts.DiagnosticCategory.Error]: 'error',
  [ts.DiagnosticCategory.Warning]: 'warning',
  [ts.DiagnosticCategory.Suggestion]: 'suggestion',
  [ts.DiagnosticCategory.Message]: 'message',
};

export type BlockTypechecker = (source: string) => CodeDiagnostic[];

/** `readLib` receives a TypeScript lib file name such as `lib.es2020.d.ts`. */
export function createBlockTypechecker(readLib: (libFileName: string) => string | undefined): BlockTypechecker {
  const ambient = new Map<string, string>([
    ['file:///flow-ambient.d.ts', AMBIENT_DTS],
    ['file:///flow-nucleation.d.ts', NUCLEATION_AMBIENT_DTS],
  ]);
  let source = '';
  let version = 0;
  const read = (fileName: string): string | undefined => {
    if (fileName === BLOCK_FILE) return source;
    if (ambient.has(fileName)) return ambient.get(fileName);
    if (fileName.startsWith(`${LIB_DIR}/`)) return readLib(fileName.slice(LIB_DIR.length + 1));
    return undefined;
  };
  const host: ts.LanguageServiceHost = {
    getCompilationSettings: () => COMPILER_OPTIONS,
    getScriptFileNames: () => [...ambient.keys(), BLOCK_FILE],
    getScriptVersion: (fileName) => (fileName === BLOCK_FILE ? String(version) : '1'),
    getScriptSnapshot: (fileName) => {
      const text = read(fileName);
      return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
    },
    getCurrentDirectory: () => '/',
    getDefaultLibFileName: (options) => `${LIB_DIR}/${ts.getDefaultLibFileName(options)}`,
    fileExists: (fileName) => read(fileName) !== undefined,
    readFile: read,
  };
  const service = ts.createLanguageService(host, ts.createDocumentRegistry());
  return (code: string) => {
    source = code;
    version++;
    const all = [
      ...service.getSyntacticDiagnostics(BLOCK_FILE),
      ...service.getSemanticDiagnostics(BLOCK_FILE),
      ...service.getSuggestionDiagnostics(BLOCK_FILE),
    ];
    const file = service.getProgram()!.getSourceFile(BLOCK_FILE)!;
    return all.map((d) => ({
      code: d.code,
      category: CATEGORY[d.category],
      message: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
      line: d.start === undefined ? 0 : file.getLineAndCharacterOfPosition(d.start).line + 1,
    }));
  };
}

/** Node / vitest: TypeScript reads its lib files from disk. */
export function createNodeBlockTypechecker(): BlockTypechecker {
  const defaultLib = ts.getDefaultLibFilePath(COMPILER_OPTIONS);
  const libDir = defaultLib.slice(0, defaultLib.lastIndexOf('/'));
  return createBlockTypechecker((name) => ts.sys.readFile(`${libDir}/${name}`));
}

let browserChecker: Promise<BlockTypechecker> | null = null;
/** Browser: lib .d.ts files are code-split and fetched on first use. */
export function loadBrowserBlockTypechecker(): Promise<BlockTypechecker> {
  return (browserChecker ??= (async () => {
    const loaders = import.meta.glob('../../../node_modules/typescript/lib/lib.*.d.ts', { query: '?raw', import: 'default' });
    const libs = new Map<string, string>();
    await Promise.all(Object.entries(loaders).map(async ([path, load]) => {
      libs.set(path.slice(path.lastIndexOf('/') + 1), (await load()) as string);
    }));
    return createBlockTypechecker((name) => libs.get(name));
  })());
}
