/**
 * Block compile pipeline — turns a block source file (TypeScript, `generate(inputs)`
 * entry, ambient context) into runnable JS for both the browser worker and the backend.
 *
 * Types are stripped with sucrase (no typecheck); the result is wrapped so that
 * synthase's `default(inputs, context)` convention still works and the runtime
 * context (Schematic, Vec, Noise, …) is ambient inside `generate` and all helpers.
 */

import { transform } from 'sucrase';

export {
  compileFlow,
  hashFlow,
  FlowCompileError,
  type CompiledFlow,
  type FlowLike,
} from './flow-compiler.js';

export class BlockCompileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BlockCompileError';
  }
}

export interface CompileOptions {
  /**
   * Names made ambient inside the block (the assembled context keys).
   * Unknown at authoring time, known by the engine at compile time.
   */
  contextKeys?: string[];
}

export interface CompiledBlock {
  /** ES module: `export default async function(__inputs, __ctx) { … }` */
  moduleCode: string;
  /** Bare function expression `(async function(__inputs, __ctx){…})` for Compartment eval. */
  functionCode: string;
  /** Type-stripped user source (helpers + generate, no wrapper). */
  strippedSource: string;
  warnings: string[];
}

/** Context keys synthase itself always provides, in addition to the providers. */
export const SYNTHASE_BASE_CONTEXT_KEYS = [
  'Logger',
  'Calculator',
  'Utils',
  'importScript',
] as const;

const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

const GENERATE_DECL_RE =
  /(^|[\s;}])(async\s+)?function\s+generate\s*\(|(^|[\s;}])(const|let|var)\s+generate\s*=/;

/**
 * Heuristic: is this source a v2 block (a `generate` entry, no module exports)?
 * Legacy `export default` scripts are not blocks.
 */
export function isBlockSource(source: string): boolean {
  return GENERATE_DECL_RE.test(source) && !/export\s+default/.test(source);
}

/** Strip TypeScript types; the body runs as plain JS. Does not typecheck. */
export function stripTypes(source: string): string {
  try {
    return transform(source, {
      transforms: ['typescript'],
      disableESTransforms: true,
    }).code;
  } catch (error) {
    throw new BlockCompileError(
      `Type stripping failed: ${(error as Error).message}`
    );
  }
}

function buildContextDestructure(contextKeys: string[]): string {
  const keys = [...new Set(contextKeys)].filter((k) => IDENTIFIER_RE.test(k));
  if (keys.length === 0) return '';
  return `var { ${keys.join(', ')} } = __ctx;`;
}

function buildBody(strippedSource: string, contextKeys: string[]): string {
  // The user code lives in an inner scope so user-declared names may freely
  // shadow context names without redeclaration errors.
  return [
    buildContextDestructure(contextKeys),
    'return await (async () => {',
    strippedSource,
    '',
    'if (typeof generate !== "function") {',
    '  throw new Error("Block must define a function named generate(inputs)");',
    '}',
    'return await generate(__inputs);',
    '})();',
  ].join('\n');
}

/**
 * Compile a block source file into runnable JS.
 * Throws BlockCompileError on a structurally invalid block.
 */
export function compileBlock(
  source: string,
  options: CompileOptions = {}
): CompiledBlock {
  const warnings: string[] = [];
  const stripped = stripTypes(source);

  if (/^\s*export\s/m.test(stripped)) {
    throw new BlockCompileError(
      'Blocks must not contain export statements — define `function generate(inputs)` and helpers only'
    );
  }
  if (/^\s*import\s/m.test(stripped)) {
    throw new BlockCompileError(
      'Blocks must not contain import statements — the runtime context (Schematic, Vec, Noise, …) is ambient'
    );
  }
  if (!GENERATE_DECL_RE.test(stripped)) {
    throw new BlockCompileError(
      'Block must define exactly one entry `function generate(inputs)`'
    );
  }

  const contextKeys = [
    ...(options.contextKeys ?? []),
    ...SYNTHASE_BASE_CONTEXT_KEYS,
  ];
  const body = buildBody(stripped, contextKeys);

  return {
    moduleCode: `export default async function (__inputs, __ctx) {\n${body}\n}\n`,
    functionCode: `(async function (__inputs, __ctx) {\n${body}\n})`,
    strippedSource: stripped,
    warnings,
  };
}
