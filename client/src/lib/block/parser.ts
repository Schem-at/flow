/**
 * Block contract parser — TypeScript source → BlockContract (FlowType descriptors).
 *
 * Pure AST walk (no program, no type checking). The `typescript` package is
 * heavy, so it is lazy-loaded inside parseBlockSource; never import it eagerly.
 */

import type { BlockContract, FlowType } from '@flow/core';
import type * as TS from 'typescript';

export interface ParsedBlock {
  contract: BlockContract;
  /** Verbatim source of the contract region: all top-level type aliases, interfaces, enums. */
  contractText: string;
  /** Verbatim source of everything else (helpers + generate). */
  bodyText: string;
  /** Non-fatal problems (e.g. unmappable types fell back to 'unknown'). */
  warnings: string[];
  /** Every top-level declaration named `generate` (the block entry point), in source order. */
  generateEntries: GenerateEntry[];
  /**
   * Display labels for each top-level input/output, spelled as the author
   * declared them (`Schematic`, `Schematic[][]`, `Tile`, `Grid (Schematic[][])`).
   * Display only; the contract carries the semantic kind.
   */
  typeLabels: { inputs: Record<string, string>; outputs: Record<string, string> };
}

export interface GenerateParam {
  /** Identifier name, or null for a destructuring pattern. */
  name: string | null;
  typed: boolean;
  rest: boolean;
}

export interface GenerateEntry {
  /** `function generate…`, `const generate = (…) =>`, `const generate = function…`, or a non-function value. */
  form: 'function' | 'arrow' | 'function-expression' | 'value';
  params: GenerateParam[];
  /** 1-based source line of the declaration. */
  line: number;
}

type TSModule = typeof TS;

let tsPromise: Promise<TSModule> | undefined;

/** Lazy-load the TypeScript compiler API (heavy; must stay out of eager bundles). */
async function loadTs(): Promise<TSModule> {
  if (!tsPromise) {
    tsPromise = import('typescript').then(
      (mod) => ((mod as { default?: TSModule }).default ?? mod) as TSModule
    );
  }
  return tsPromise;
}

interface ParseContext {
  ts: TSModule;
  sourceFile: TS.SourceFile;
  /** Top-level type alias / interface declarations by name. */
  declarations: Map<string, TS.TypeAliasDeclaration | TS.InterfaceDeclaration>;
  /** Top-level enum declarations by name (mapped to `enum` FlowTypes). */
  enums: Map<string, TS.EnumDeclaration>;
  warnings: string[];
  /** Cycle guard for alias resolution. */
  resolving: Set<string>;
  /**
   * The `generate` signature, used when standalone `type Inputs` / `type Outputs`
   * declarations are absent. Inputs come from the parameters (object/destructure
   * form: one object param; positional form: one param per input), Outputs from
   * the return type.
   */
  signature: { params?: readonly TS.ParameterDeclaration[]; returnType?: TS.TypeNode };
}

export async function parseBlockSource(source: string): Promise<ParsedBlock> {
  const ts = await loadTs();

  const sourceFile = ts.createSourceFile(
    'block.ts',
    source,
    ts.ScriptTarget.ESNext,
    /* setParentNodes */ true,
    ts.ScriptKind.TS
  );

  const warnings: string[] = [];
  const declarations = new Map<string, TS.TypeAliasDeclaration | TS.InterfaceDeclaration>();
  const enums = new Map<string, TS.EnumDeclaration>();

  // Contiguous runs of same-group statements are sliced as a whole so the text
  // between statements (blank lines, comments) is preserved verbatim.
  interface Run {
    isContract: boolean;
    start: number;
    end: number;
  }
  const runs: Run[] = [];
  const signature: { params?: readonly TS.ParameterDeclaration[]; returnType?: TS.TypeNode } = {};
  const generateEntries: GenerateEntry[] = [];
  const entryOf = (
    form: GenerateEntry['form'],
    node: TS.Node,
    params: readonly TS.ParameterDeclaration[] = []
  ): GenerateEntry => ({
    form,
    line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
    params: params.map((p) => ({
      name: ts.isIdentifier(p.name) ? p.name.text : null,
      typed: !!p.type,
      rest: !!p.dotDotDotToken,
    })),
  });

  for (const statement of sourceFile.statements) {
    const isContract =
      ts.isTypeAliasDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isEnumDeclaration(statement);
    if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) {
      declarations.set(statement.name.text, statement);
    }
    if (ts.isEnumDeclaration(statement)) enums.set(statement.name.text, statement);

    // Capture the `generate` signature (parameters + return type).
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === 'generate') {
      signature.params = statement.parameters;
      signature.returnType = statement.type;
      // Overload signatures (no body) are not separate entry points.
      if (statement.body) generateEntries.push(entryOf('function', statement, statement.parameters));
    } else if (ts.isVariableStatement(statement)) {
      for (const d of statement.declarationList.declarations) {
        if (!ts.isIdentifier(d.name) || d.name.text !== 'generate') continue;
        if (d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) {
          signature.params = d.initializer.parameters;
          signature.returnType = d.initializer.type;
          generateEntries.push(
            entryOf(ts.isArrowFunction(d.initializer) ? 'arrow' : 'function-expression', d, d.initializer.parameters)
          );
        } else {
          generateEntries.push(entryOf('value', d));
        }
      }
    }
    const previous = runs[runs.length - 1];
    if (previous && previous.isContract === isContract) {
      previous.end = statement.end;
    } else {
      runs.push({ isContract, start: statement.getFullStart(), end: statement.end });
    }
  }

  const textOf = (isContract: boolean): string =>
    runs
      .filter((run) => run.isContract === isContract)
      .map((run) => source.slice(run.start, run.end).trim())
      .join('\n');

  const contractText = textOf(true);
  const bodyText = textOf(false);

  const ctx: ParseContext = { ts, sourceFile, declarations, enums, warnings, resolving: new Set(), signature };

  const inputs = resolveInputs(ctx);
  const outputs = resolveOutputs(ctx);
  const typeLabels = { inputs: labelInputs(ctx), outputs: labelOutputs(ctx) };

  return {
    contract: { inputs, outputs },
    contractText,
    bodyText,
    warnings,
    generateEntries,
    typeLabels,
  };
}

/** Resolve a named top-level declaration (`Inputs`/`Outputs`) to a field record. */
/** A standalone `type Inputs`/`type Outputs` (alias or interface) → field record. */
function recordFromDecl(
  decl: TS.TypeAliasDeclaration | TS.InterfaceDeclaration,
  name: string,
  ctx: ParseContext
): Record<string, FlowType> {
  if (ctx.ts.isInterfaceDeclaration(decl)) {
    return mapMembers(decl.members, name, ctx);
  }
  const literal = unwrapToTypeLiteral(decl.type, ctx);
  if (!literal) {
    ctx.warnings.push(`\`${name}\` must be an object type literal or interface`);
    return {};
  }
  return mapMembers(literal.members, name, ctx);
}

function resolveInputs(ctx: ParseContext): Record<string, FlowType> {
  const decl = ctx.declarations.get('Inputs');
  if (decl) return recordFromDecl(decl, 'Inputs', ctx);

  const fromSignature = inputsFromSignature(ctx);
  if (fromSignature) return fromSignature;

  ctx.warnings.push('No `Inputs` declaration found (add a `type Inputs` block or type generate\'s parameters)');
  return {};
}

function resolveOutputs(ctx: ParseContext): Record<string, FlowType> {
  const decl = ctx.declarations.get('Outputs');
  if (decl) return recordFromDecl(decl, 'Outputs', ctx);

  const rt = ctx.signature.returnType;
  if (rt) {
    const literal = unwrapToTypeLiteral(rt, ctx);
    if (literal) return mapMembers(literal.members, 'Outputs', ctx);
  }

  ctx.warnings.push('No `Outputs` declaration found (add a `type Outputs` block or annotate generate\'s return type)');
  return {};
}

/**
 * Build Inputs from the `generate` parameters. Returns null for the legacy
 * `function generate(inputs)` (untyped single arg), which has no inline contract.
 *
 * - object form:   one param whose type is an object literal, or a destructuring
 *                  pattern `{ a, b }: { … }` → the object's members are the inputs.
 * - positional:    one param per input `(size: Slider<…>, seed: number)` → each
 *                  parameter name + type is an input.
 */
function inputsFromSignature(ctx: ParseContext): Record<string, FlowType> | null {
  const { ts } = ctx;
  const params = ctx.signature.params;
  if (!params || params.length === 0) return null;

  if (params.length === 1) {
    const p = params[0];
    const destructured = ts.isObjectBindingPattern(p.name);
    const objLiteral = p.type ? unwrapToTypeLiteral(p.type, ctx) : null;
    if (destructured || objLiteral) {
      return objLiteral ? mapMembers(objLiteral.members, 'Inputs', ctx) : {};
    }
    // A single positional input (non-object type). Untyped `inputs` → legacy form.
    if (!p.type || !ts.isIdentifier(p.name)) return null;
    return { [p.name.text]: mapType(p.type, `Inputs.${p.name.text}`, ctx) };
  }

  const record: Record<string, FlowType> = {};
  for (const p of params) {
    if (!ts.isIdentifier(p.name) || !p.type) continue;
    record[p.name.text] = mapType(p.type, `Inputs.${p.name.text}`, ctx);
  }
  return Object.keys(record).length ? record : null;
}

/** Follow parenthesized types and alias references until an object type literal. */
function unwrapToTypeLiteral(node: TS.TypeNode, ctx: ParseContext): TS.TypeLiteralNode | null {
  const { ts } = ctx;
  if (ts.isTypeLiteralNode(node)) return node;
  if (ts.isParenthesizedTypeNode(node)) return unwrapToTypeLiteral(node.type, ctx);
  if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) {
    const name = node.typeName.text;
    if (ctx.resolving.has(name)) return null;
    const decl = ctx.declarations.get(name);
    if (decl && ts.isTypeAliasDeclaration(decl)) {
      ctx.resolving.add(name);
      try {
        return unwrapToTypeLiteral(decl.type, ctx);
      } finally {
        ctx.resolving.delete(name);
      }
    }
  }
  return null;
}

function mapMembers(
  members: ReadonlyArray<TS.TypeElement>,
  path: string,
  ctx: ParseContext
): Record<string, FlowType> {
  const record: Record<string, FlowType> = {};
  for (const member of members) {
    if (!ctx.ts.isPropertySignature(member) || !member.name) continue;
    const key = propertyName(member.name, ctx);
    if (key === null) continue;
    const fieldPath = `${path}.${key}`;
    if (!member.type) {
      ctx.warnings.push(`${fieldPath}: missing type annotation — treated as unknown`);
      record[key] = { kind: 'unknown' };
      continue;
    }
    record[key] = mapType(member.type, fieldPath, ctx);
    const annotation = ctx.ts.getJSDocTags(member).find(tag=>tag.tagName.text==='toolField');
    if (typeof annotation?.comment==='string') { try { const options=JSON.parse(annotation.comment); if (options.kind===record[key].kind && typeof options==='object') record[key]={...record[key],...options}; } catch { ctx.warnings.push(`${fieldPath}: invalid tool field options`); } }

  }
  return record;
}

function propertyName(name: TS.PropertyName, ctx: ParseContext): string | null {
  const { ts } = ctx;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return null;
}

/** Recursive TypeNode → FlowType mapping. */
function mapType(node: TS.TypeNode, path: string, ctx: ParseContext): FlowType {
  const { ts } = ctx;

  switch (node.kind) {
    case ts.SyntaxKind.NumberKeyword:
      return { kind: 'number' };
    case ts.SyntaxKind.StringKeyword:
      return { kind: 'string' };
    case ts.SyntaxKind.BooleanKeyword:
      return { kind: 'boolean' };
    case ts.SyntaxKind.AnyKeyword:
    case ts.SyntaxKind.UnknownKeyword:
      return { kind: 'unknown' };
  }

  if (ts.isParenthesizedTypeNode(node)) {
    return mapType(node.type, path, ctx);
  }

  if (ts.isUnionTypeNode(node)) {
    return mapUnion(node, path, ctx);
  }

  if (ts.isArrayTypeNode(node)) {
    return { kind: 'list', of: mapType(node.elementType, path + '[]', ctx) };
  }

  if (ts.isTypeLiteralNode(node)) {
    return { kind: 'object', fields: mapMembers(node.members, path, ctx) };
  }

  if (ts.isTypeReferenceNode(node)) {
    if (ts.isIdentifier(node.typeName)) {
      return mapTypeReference(node, node.typeName.text, path, ctx);
    }
    // Native objects stay resident in the worker and can connect between blocks.
    const name = node.typeName.getText(ctx.sourceFile);
    if (name.startsWith('Nucleation.')) {
      return name === 'Nucleation.Schematic'
        ? { kind: 'schematic' }
        : { kind: 'native', className: name.slice('Nucleation.'.length) };
    }
  }

  ctx.warnings.push(
    `${path}: unsupported type \`${node.getText(ctx.sourceFile)}\` — treated as unknown`
  );
  return { kind: 'unknown' };
}

function mapUnion(node: TS.UnionTypeNode, path: string, ctx: ParseContext): FlowType {
  const { ts } = ctx;
  const options: Array<string | number> = [];
  for (const member of node.types) {
    if (ts.isLiteralTypeNode(member)) {
      const literal = member.literal;
      if (ts.isStringLiteral(literal)) {
        options.push(literal.text);
        continue;
      }
      const num = numericLiteralValue(literal, ctx);
      if (num !== null) {
        options.push(num);
        continue;
      }
    }
    ctx.warnings.push(
      `${path}: union \`${node.getText(ctx.sourceFile)}\` is not all string/number literals — treated as unknown`
    );
    return { kind: 'unknown' };
  }
  return { kind: 'enum', options };
}

function mapTypeReference(
  node: TS.TypeReferenceNode,
  name: string,
  path: string,
  ctx: ParseContext
): FlowType {
  const domains = { BlockPalette: 'palette', MinecraftUsername: 'username', ToolFile: 'file', BuildTimeline: 'animation', SimulationView: 'simulation', ChartData: 'chart' } as const;
  if (name in domains) return { kind: domains[name as keyof typeof domains] } as FlowType;
  if (name === 'MultiSelect') {
    const inner = node.typeArguments?.[0];
    const mapped = inner ? mapType(inner, path, ctx) : null;
    return { kind: 'set', options: mapped?.kind === 'enum' ? mapped.options.map(String) : [] };
  }

  const config = () => widgetConfig(node, path, ctx);

  switch (name) {
    case 'Slider': {
      const c = config();
      return pruned({
        kind: 'number',
        widget: 'slider',
        min: asNumber(c.min),
        max: asNumber(c.max),
        step: asNumber(c.step),
        default: asNumber(c.default),
      });
    }
    case 'NumberField': {
      const c = config();
      return pruned({
        kind: 'number',
        widget: 'input',
        min: asNumber(c.min),
        max: asNumber(c.max),
        step: asNumber(c.step),
        default: asNumber(c.default),
      });
    }
    case 'Textarea': {
      const c = config();
      return pruned({
        kind: 'string',
        multiline: true,
        default: asString(c.default),
        required: asBoolean(c.required),
      });
    }
    case 'TextField': {
      const c = config();
      return pruned({ kind: 'string', default: asString(c.default), required: asBoolean(c.required) });
    }
    case 'Toggle': {
      const c = config();
      return pruned({ kind: 'boolean', default: asBoolean(c.default) });
    }
    case 'Block': {
      const c = config();
      return pruned({ kind: 'block', default: asString(c.default) });
    }
    case 'Schematic':
      return { kind: 'schematic' };
    case 'Image':
      return { kind: 'image' };
    case 'Vec3':
      return { kind: 'vec3' };
    case 'Array': {
      const arg = node.typeArguments?.[0];
      if (!arg) {
        ctx.warnings.push(`${path}: \`Array\` without a type argument — treated as unknown`);
        return { kind: 'unknown' };
      }
      return { kind: 'list', of: mapType(arg, path + '[]', ctx) };
    }
    case 'Matrix': {
      // Number matrix; `rows`/`cols` (when given) fix that dimension.
      const c = config();
      return pruned({
        kind: 'list',
        length: asNumber(c.rows),
        of: pruned({ kind: 'list', length: asNumber(c.cols), of: { kind: 'number' } }),
      });
    }
  }

  // Local enum → its member values.
  const enumDecl = ctx.enums.get(name);
  if (enumDecl) return mapEnum(enumDecl, path, ctx);

  // Local alias / interface reference → resolve recursively (with cycle guard).
  const decl = ctx.declarations.get(name);
  if (decl) {
    if (ctx.resolving.has(name)) {
      ctx.warnings.push(`${path}: circular type reference \`${name}\` — treated as unknown`);
      return { kind: 'unknown' };
    }
    ctx.resolving.add(name);
    try {
      if (ctx.ts.isInterfaceDeclaration(decl)) {
        return { kind: 'object', fields: mapMembers(decl.members, path, ctx) };
      }
      return mapType(decl.type, path, ctx);
    } finally {
      ctx.resolving.delete(name);
    }
  }

  ctx.warnings.push(`${path}: unknown type \`${name}\` — treated as unknown`);
  return { kind: 'unknown' };
}

/** `enum Mode { A = 'a', B = 'b' }` → enum FlowType of the member values. */
function mapEnum(decl: TS.EnumDeclaration, path: string, ctx: ParseContext): FlowType {
  const { ts } = ctx;
  const options: Array<string | number> = [];
  let next: number | null = 0;
  for (const member of decl.members) {
    const init = member.initializer;
    if (!init) {
      if (next === null) break;
      options.push(next++);
      continue;
    }
    if (ts.isStringLiteral(init)) {
      options.push(init.text);
      next = null;
      continue;
    }
    const num = numericLiteralValue(init, ctx);
    if (num !== null) {
      options.push(num);
      next = num + 1;
      continue;
    }
    ctx.warnings.push(
      `${path}: enum \`${decl.name.text}\` has a computed member — treated as unknown`
    );
    return { kind: 'unknown' };
  }
  return { kind: 'enum', options };
}

// ── Display labels ─────────────────────────────────────────────────────────

function labelInputs(ctx: ParseContext): Record<string, string> {
  const { ts } = ctx;
  const decl = ctx.declarations.get('Inputs');
  if (decl) return labelDecl(decl, ctx);
  const params = ctx.signature.params;
  if (!params || params.length === 0) return {};
  if (params.length === 1) {
    const p = params[0];
    const literal = p.type ? unwrapToTypeLiteral(p.type, ctx) : null;
    if (literal) return labelMembers(literal.members, ctx);
    if (ts.isObjectBindingPattern(p.name) || !p.type || !ts.isIdentifier(p.name)) return {};
    return { [p.name.text]: typeLabel(p.type, ctx) };
  }
  const labels: Record<string, string> = {};
  for (const p of params) {
    if (ts.isIdentifier(p.name) && p.type) labels[p.name.text] = typeLabel(p.type, ctx);
  }
  return labels;
}

function labelOutputs(ctx: ParseContext): Record<string, string> {
  const decl = ctx.declarations.get('Outputs');
  if (decl) return labelDecl(decl, ctx);
  const rt = ctx.signature.returnType;
  const literal = rt ? unwrapToTypeLiteral(rt, ctx) : null;
  return literal ? labelMembers(literal.members, ctx) : {};
}

function labelDecl(
  decl: TS.TypeAliasDeclaration | TS.InterfaceDeclaration,
  ctx: ParseContext
): Record<string, string> {
  if (ctx.ts.isInterfaceDeclaration(decl)) return labelMembers(decl.members, ctx);
  const literal = unwrapToTypeLiteral(decl.type, ctx);
  return literal ? labelMembers(literal.members, ctx) : {};
}

function labelMembers(members: ReadonlyArray<TS.TypeElement>, ctx: ParseContext): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const member of members) {
    if (!ctx.ts.isPropertySignature(member) || !member.name) continue;
    const key = propertyName(member.name, ctx);
    if (key === null) continue;
    labels[key] = member.type ? typeLabel(member.type, ctx) : 'unknown';
  }
  return labels;
}

/**
 * The declared type as the author wrote it, normalised for display: alias and
 * interface names kept (object shapes show by name), non-object aliases show
 * their target (`Grid (Schematic[][])`), arrays keep their element type, and
 * widget helpers drop their config generic (`Slider<{…}>` → `Slider`).
 */
function typeLabel(node: TS.TypeNode, ctx: ParseContext, seen: Set<string> = new Set()): string {
  const { ts } = ctx;
  if (ts.isParenthesizedTypeNode(node)) return `(${typeLabel(node.type, ctx, seen)})`;
  if (ts.isArrayTypeNode(node)) return `${typeLabel(node.elementType, ctx, seen)}[]`;
  if (ts.isUnionTypeNode(node)) return node.types.map((t) => typeLabel(t, ctx, seen)).join(' | ');
  if (ts.isTypeLiteralNode(node)) {
    const fields = node.members
      .filter(ts.isPropertySignature)
      .map((m) => {
        const key = propertyName(m.name, ctx) ?? m.name.getText(ctx.sourceFile);
        return `${key}${m.questionToken ? '?' : ''}: ${m.type ? typeLabel(m.type, ctx, seen) : 'unknown'}`;
      });
    return fields.length ? `{ ${fields.join('; ')} }` : '{}';
  }
  if (ts.isTypeReferenceNode(node)) {
    if (!ts.isIdentifier(node.typeName)) return node.typeName.getText(ctx.sourceFile);
    const name = node.typeName.text;
    const arg = node.typeArguments?.[0];
    if (name === 'Array' && arg) {
      const inner = typeLabel(arg, ctx, seen);
      return ts.isUnionTypeNode(arg) ? `(${inner})[]` : `${inner}[]`;
    }
    const decl = ctx.declarations.get(name);
    if (decl && ts.isTypeAliasDeclaration(decl) && !seen.has(name)) {
      // Object shapes read best by name; other aliases show what they stand for.
      if (unwrapToTypeLiteral(decl.type, ctx)) return name;
      seen.add(name);
      try {
        return `${name} (${typeLabel(decl.type, ctx, seen)})`;
      } finally {
        seen.delete(name);
      }
    }
    return name;
  }
  return node.getText(ctx.sourceFile).replace(/\s+/g, ' ');
}

type WidgetConfig = Record<string, string | number | boolean>;

/** Read the `{ min: 0; max: 64; default: 8 }` type-literal generic argument of a widget helper. */
function widgetConfig(node: TS.TypeReferenceNode, path: string, ctx: ParseContext): WidgetConfig {
  const { ts } = ctx;
  const arg = node.typeArguments?.[0];
  if (!arg) return {};
  if (!ts.isTypeLiteralNode(arg)) {
    ctx.warnings.push(
      `${path}: widget config must be an inline object literal type — ignored`
    );
    return {};
  }
  const config: WidgetConfig = {};
  for (const member of arg.members) {
    if (!ts.isPropertySignature(member) || !member.name || !member.type) continue;
    const key = propertyName(member.name, ctx);
    if (key === null || !ts.isLiteralTypeNode(member.type)) continue;
    const literal = member.type.literal;
    if (ts.isStringLiteral(literal)) {
      config[key] = literal.text;
    } else if (literal.kind === ts.SyntaxKind.TrueKeyword) {
      config[key] = true;
    } else if (literal.kind === ts.SyntaxKind.FalseKeyword) {
      config[key] = false;
    } else {
      const num = numericLiteralValue(literal, ctx);
      if (num !== null) config[key] = num;
    }
  }
  return config;
}

/** Numeric literal value, handling negatives (`-5` is a PrefixUnaryExpression). */
function numericLiteralValue(node: TS.Node, ctx: ParseContext): number | null {
  const { ts } = ctx;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(node.operand)
  ) {
    return -Number(node.operand.text);
  }
  return null;
}

function asNumber(value: string | number | boolean | undefined): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function asString(value: string | number | boolean | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asBoolean(value: string | number | boolean | undefined): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

/** Drop undefined props so descriptors stay clean for deep-equality and JSON. */
function pruned<T extends FlowType>(type: T): T {
  for (const key of Object.keys(type) as Array<keyof T>) {
    if (type[key] === undefined) delete type[key];
  }
  return type;
}
