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
  type CompileFlowOptions,
  type NodeTraceEntry,
  type TracedResult,
  type FlowLike,
} from './flow-compiler.js';

export {
  deriveBoundary,
  groupNodes,
  ungroup,
  nextGroupId,
  isGroupNodeData,
  isMapNodeData,
  type BoundaryPort,
  type GroupBoundary,
  type GroupNodeData,
  type MapNodeData,
  type GroupSubgraph,
  type GroupNodeLike,
  type GroupEdge,
  type GroupResult,
  type UngroupResult,
} from './group.js';

export { contractToTypeScript, composeBlockSource } from './codegen.js';

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

/** The raw text inside generate's parameter parens, or null (e.g. bare-arrow param). */
function generateParamList(source: string): string | null {
  const decl = GENERATE_DECL_RE.exec(source);
  if (!decl) return null;
  const gen = source.indexOf('generate', decl.index);
  if (gen < 0) return null;
  const open = source.indexOf('(', gen);
  if (open < 0) return null;
  const arrow = source.indexOf('=>', gen);
  if (arrow >= 0 && arrow < open) return null; // `const generate = inputs =>` (no parens)
  let depth = 0;
  for (let j = open; j < source.length; j++) {
    const c = source[j];
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) return source.slice(open + 1, j);
    }
  }
  return null;
}

/** Split a parameter list on top-level commas (depth-aware over <> () [] {}). */
function splitTopLevel(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (c === '<' || c === '(' || c === '[' || c === '{') depth++;
    else if (c === '>' || c === ')' || c === ']' || c === '}') depth--;
    else if (c === ',' && depth === 0) {
      out.push(list.slice(start, i));
      start = i + 1;
    }
  }
  if (start < list.length) out.push(list.slice(start));
  return out.map((p) => p.trim()).filter(Boolean);
}

/**
 * Ordered input names when `generate` uses positional parameters
 *   function generate(size: Slider<…>, seed: number): { … } { … }
 * or null for the object/destructure/legacy forms (a single object arg). Analysed
 * on the ORIGINAL (typed) source so the single-input case can be told apart from
 * the legacy `function generate(inputs)`.
 */
export function positionalInputNames(source: string): string[] | null {
  const list = generateParamList(source);
  if (list === null) return null;
  const params = splitTopLevel(list);
  if (params.length === 0) return null;

  if (params.length === 1) {
    const p = params[0];
    if (p.startsWith('{')) return null; // destructured object arg
    const colon = p.indexOf(':');
    if (colon < 0) return null; // `inputs` — legacy single object arg
    if (p.slice(colon + 1).trim().startsWith('{')) return null; // `inputs: { … }` object arg
    const name = p.slice(0, colon).trim();
    return IDENTIFIER_RE.test(name) ? [name] : null;
  }

  const names = params.map((p) => {
    const colon = p.indexOf(':');
    return (colon < 0 ? p : p.slice(0, colon)).trim();
  });
  return names.every((n) => IDENTIFIER_RE.test(n)) ? names : null;
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

function buildBody(
  strippedSource: string,
  contextKeys: string[],
  positional: string[] | null
): string {
  // Positional form: spread named values in declared order; object form: one arg.
  const call = positional
    ? `generate(${positional.map((n) => `__inputs[${JSON.stringify(n)}]`).join(', ')})`
    : 'generate(__inputs)';

  // The user code lives in an inner scope so user-declared names may freely
  // shadow context names without redeclaration errors.
  return [
    buildContextDestructure(contextKeys),
    'return await (async () => {',
    strippedSource,
    '',
    'if (typeof generate !== "function") {',
    '  throw new Error("Block must define a function named generate");',
    '}',
    `return await ${call};`,
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
  // Analyse the ORIGINAL (typed) source so positional params can be told apart
  // from the legacy single `inputs` argument.
  const positional = positionalInputNames(source);
  const body = buildBody(stripped, contextKeys, positional);

  return {
    moduleCode: `export default async function (__inputs, __ctx) {\n${body}\n}\n`,
    functionCode: `(async function (__inputs, __ctx) {\n${body}\n})`,
    strippedSource: stripped,
    warnings,
  };
}
