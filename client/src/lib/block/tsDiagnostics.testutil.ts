/**
 * Test-only: run a block source through the same TypeScript diagnostics the
 * Monaco editor shows (see `setupAmbientMonaco` in ./ambient.ts).
 *
 * Same compiler options (strict off, lib es2020, no DOM), same ambient libs
 * (AMBIENT_DTS + NUCLEATION_AMBIENT_DTS), and the same three diagnostic
 * channels Monaco surfaces: syntactic, semantic and suggestion. Suggestion
 * diagnostics are where "Parameter 'inputs' implicitly has an 'any' type, but
 * a better type may be inferred from usage." (7044) shows up when
 * noImplicitAny is off, which is the warning users reported.
 */

import ts from 'typescript';
import { AMBIENT_DTS, NUCLEATION_AMBIENT_DTS } from './ambient';

export interface BlockDiagnostic {
  code: number;
  category: 'error' | 'warning' | 'suggestion' | 'message';
  message: string;
  line: number;
}

const BLOCK_FILE = 'file:///block.ts';

const COMPILER_OPTIONS: ts.CompilerOptions = {
  // Monaco's typescriptDefaults baseline...
  allowNonTsExtensions: true,
  target: ts.ScriptTarget.Latest,
  // ...plus what setupAmbientMonaco sets.
  noEmit: true,
  allowJs: true,
  checkJs: false,
  strict: false,
  lib: ['lib.es2020.d.ts'],
};

const CATEGORY: Record<ts.DiagnosticCategory, BlockDiagnostic['category']> = {
  [ts.DiagnosticCategory.Error]: 'error',
  [ts.DiagnosticCategory.Warning]: 'warning',
  [ts.DiagnosticCategory.Suggestion]: 'suggestion',
  [ts.DiagnosticCategory.Message]: 'message',
};

export function blockDiagnostics(source: string): BlockDiagnostic[] {
  const files = new Map<string, string>([
    ['file:///flow-ambient.d.ts', AMBIENT_DTS],
    ['file:///flow-nucleation.d.ts', NUCLEATION_AMBIENT_DTS],
    [BLOCK_FILE, source],
  ]);
  const defaultLib = ts.getDefaultLibFilePath(COMPILER_OPTIONS);
  const libDir = defaultLib.slice(0, defaultLib.lastIndexOf('/'));
  const read = (fileName: string): string | undefined =>
    files.get(fileName) ?? ts.sys.readFile(fileName);

  const host: ts.LanguageServiceHost = {
    getCompilationSettings: () => COMPILER_OPTIONS,
    getScriptFileNames: () => [...files.keys()],
    getScriptVersion: () => '1',
    getScriptSnapshot: (fileName) => {
      const text = read(fileName);
      return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
    },
    getCurrentDirectory: () => '/',
    getDefaultLibFileName: (options) => `${libDir}/${ts.getDefaultLibFileName(options)}`,
    fileExists: (fileName) => files.has(fileName) || ts.sys.fileExists(fileName),
    readFile: read,
  };

  const service = ts.createLanguageService(host, ts.createDocumentRegistry());
  const all = [
    ...service.getSyntacticDiagnostics(BLOCK_FILE),
    ...service.getSemanticDiagnostics(BLOCK_FILE),
    ...service.getSuggestionDiagnostics(BLOCK_FILE),
  ];
  const sourceFile = service.getProgram()!.getSourceFile(BLOCK_FILE)!;
  return all.map((d) => ({
    code: d.code,
    category: CATEGORY[d.category],
    message: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
    line: d.start === undefined ? 0 : sourceFile.getLineAndCharacterOfPosition(d.start).line + 1,
  }));
}

/** Implicit-any diagnostics, in either their error (7006/7031) or suggestion (7044/7045) form. */
export const IMPLICIT_ANY_CODES = new Set([7005, 7006, 7008, 7010, 7011, 7019, 7031, 7034, 7043, 7044, 7045, 7046, 7047, 7048, 7049, 7050]);

export function implicitAnyDiagnostics(source: string): BlockDiagnostic[] {
  return blockDiagnostics(source).filter((d) => IMPLICIT_ANY_CODES.has(d.code));
}

export function errorDiagnostics(source: string): BlockDiagnostic[] {
  return blockDiagnostics(source).filter((d) => d.category === 'error');
}
