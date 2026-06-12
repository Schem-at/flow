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
  warnings: string[];
  /** Cycle guard for alias resolution. */
  resolving: Set<string>;
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

  // Contiguous runs of same-group statements are sliced as a whole so the text
  // between statements (blank lines, comments) is preserved verbatim.
  interface Run {
    isContract: boolean;
    start: number;
    end: number;
  }
  const runs: Run[] = [];

  for (const statement of sourceFile.statements) {
    const isContract =
      ts.isTypeAliasDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isEnumDeclaration(statement);
    if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) {
      declarations.set(statement.name.text, statement);
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

  const ctx: ParseContext = { ts, sourceFile, declarations, warnings, resolving: new Set() };

  const inputs = resolveRecord('Inputs', ctx);
  const outputs = resolveRecord('Outputs', ctx);

  return {
    contract: { inputs, outputs },
    contractText,
    bodyText,
    warnings,
  };
}

/** Resolve a named top-level declaration (`Inputs`/`Outputs`) to a field record. */
function resolveRecord(name: string, ctx: ParseContext): Record<string, FlowType> {
  const decl = ctx.declarations.get(name);
  if (!decl) {
    ctx.warnings.push(`No top-level \`${name}\` declaration found`);
    return {};
  }
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

  if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) {
    return mapTypeReference(node, node.typeName.text, path, ctx);
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
  }

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
