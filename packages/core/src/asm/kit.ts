/**
 * Assembler construction kit — ISA-agnostic primitives for building an
 * assembler for ANY instruction set, plus a declarative two-pass `define(spec)`
 * driver. Bring an `IsaSpec` (mnemonics → opcode/size/encode, aliases,
 * registers, symbol tables, directives) and get either machine-code bytes
 * (`assemble`) or a resolved, target-independent IR (`assembleIR`).
 *
 * The driver owns the scaffolding (normalise → expand macros → expand aliases →
 * offset pass → label/relative resolution → encode/IR pass) and delegates the
 * ISA-specific quirks to spec callbacks. It handles a deliberately wide panel of
 * architectures: fixed-width binary CPUs (per-instruction `encode` → bytes) and
 * portable assembly ILs with no fixed encoding (no encoders → resolved IR).
 *
 * The lower-level helpers (parseNumber, tokenizeLines, LabelTable, pack…) are
 * exported standalone so you can also hand-roll an assembler without the driver.
 */

export class AssembleError extends Error {}
export class ParseError extends Error {}

// ─── Number parsing ──────────────────────────────────────────────────────────

/**
 * Parse a numeric token: decimal, `0x` hex, `0b` binary, `0o` octal, optional
 * leading sign, underscores allowed. Throws on anything else.
 */
export function parseNumber(token: string): number {
  let t = token.replace(/_/g, '');
  let sign = 1;
  if (t.startsWith('-')) {
    sign = -1;
    t = t.slice(1);
  } else if (t.startsWith('+')) {
    t = t.slice(1);
  }
  let mag: number;
  const lower = t.toLowerCase();
  if (lower.startsWith('0x')) mag = parseInt(t.slice(2), 16);
  else if (lower.startsWith('0b')) mag = parseInt(t.slice(2), 2);
  else if (lower.startsWith('0o')) mag = parseInt(t.slice(2), 8);
  else if (/^[0-9]+$/.test(t)) mag = parseInt(t, 10);
  else throw new ParseError(`Unrecognized number "${token}"`);
  if (Number.isNaN(mag)) throw new ParseError(`Unrecognized number "${token}"`);
  return sign * mag;
}

// ─── Line / token normalisation ──────────────────────────────────────────────

/** Strip an inline line-comment (everything from `marker` onward) and trim. */
export function stripComments(line: string, marker = '//'): string {
  const index = line.indexOf(marker);
  return index !== -1 ? line.slice(0, index).trim() : line;
}

/** Strip the earliest-occurring of several inline comment markers. */
function stripInline(line: string, markers: string[]): string {
  let cut = -1;
  for (const m of markers) {
    const i = line.indexOf(m);
    if (i !== -1 && (cut === -1 || i < cut)) cut = i;
  }
  return cut === -1 ? line : line.slice(0, cut);
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface NormalizeOptions {
  /** One or more inline/whole-line comment markers. Default '//'. */
  comment?: string | string[];
  /** Block-comment delimiters as an [open, close] pair (C-style). */
  blockComment?: [string, string];
}

/**
 * Normalise a source program to clean, non-empty lines: strip block comments,
 * trim, drop inline/whole-line comments, collapse runs of spaces, drop blanks.
 */
export function normalizeLines(src: string, opts: NormalizeOptions = {}): string[] {
  const markers = opts.comment === undefined ? ['//'] : Array.isArray(opts.comment) ? opts.comment : [opts.comment];
  let text = src;
  if (opts.blockComment) {
    const [open, close] = opts.blockComment;
    text = text.replace(new RegExp(`${escapeRe(open)}[\\s\\S]*?${escapeRe(close)}`, 'g'), ' ');
  }
  return text
    .split('\n')
    .map((l) => l.trim())
    .map((l) => stripInline(l, markers))
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .filter((l) => l !== '');
}

/** Normalise then tokenize each line by whitespace. */
export function tokenizeLines(src: string, opts: NormalizeOptions = {}): string[][] {
  return normalizeLines(src, opts).map((l) => l.split(' '));
}

// ─── Label table (two-pass) ──────────────────────────────────────────────────

export class LabelTable {
  private readonly table = new Map<string, number>();
  constructor(private readonly prefix = '.') {}
  /** Register `label → value` (typically a byte offset). */
  define(label: string, value: number): void {
    this.table.set(label, value);
  }
  has(label: string): boolean {
    return this.table.has(label);
  }
  isLabel(token: string): boolean {
    return token.startsWith(this.prefix);
  }
  resolve(label: string): number {
    const v = this.table.get(label);
    if (v === undefined) throw new AssembleError(`Unresolved label "${label}"`);
    return v;
  }
}

// ─── Bit-field packing ───────────────────────────────────────────────────────

export interface PackField {
  value: number;
  bits: number;
}

/**
 * Pack bit-fields into a single integer. `order: 'lsb'` (default) places the
 * first field in the lowest bits — so `pack([{opcode,4},{op1,2},{op2,2}])`
 * yields `(op2<<6)|(op1<<4)|opcode`. `order: 'msb'` places the first field in
 * the highest bits.
 */
export function pack(fields: PackField[], opts: { order?: 'msb' | 'lsb' } = {}): number {
  const order = opts.order ?? 'lsb';
  if (order === 'lsb') {
    let result = 0;
    let shift = 0;
    for (const f of fields) {
      result |= (f.value & ((1 << f.bits) - 1)) << shift;
      shift += f.bits;
    }
    return result >>> 0;
  }
  let result = 0;
  for (const f of fields) {
    result = (result << f.bits) | (f.value & ((1 << f.bits) - 1));
  }
  return result >>> 0;
}

/** Split a value into `byteCount` bytes, little- or big-endian (default big). */
export function packBytes(value: number, byteCount: number, opts: { endian?: 'le' | 'be' } = {}): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < byteCount; i++) bytes.push((value >>> (8 * i)) & 0xff);
  return (opts.endian ?? 'be') === 'le' ? bytes : bytes.reverse();
}

// ─── Resolved operands & IR (the target-independent back-end) ─────────────────

export type OperandKind =
  | 'register'
  | 'symbol'
  | 'immediate'
  | 'label'
  | 'relative'
  | 'port'
  | 'memory'
  | 'char';

/** A fully-resolved operand: a numeric `value` plus the kind/source metadata. */
export interface ResolvedOperand {
  kind: OperandKind;
  /** Resolved numeric value (NaN if a named port/symbol couldn't be resolved in IR mode). */
  value: number;
  /** Original source token. */
  raw: string;
  /** Symbol namespace (for `symbol`/`port` kinds), e.g. 'conditions'. */
  symbol?: string;
}

/** One resolved instruction in the IR back-end. */
export interface AsmInstruction {
  mnemonic: string;
  operands: ResolvedOperand[];
  /** Instruction index / offset in the resolved stream. */
  offset: number;
  /** Label attached to this instruction, if any. */
  label?: string;
  /** Data values, for data-directive (DW) lines. */
  data?: number[];
}

/** The resolved, target-independent assembly IR (used by e.g. URCL). */
export interface AsmIR {
  instructions: AsmInstruction[];
  /** label name → offset. */
  labels: Record<string, number>;
  /** Parsed program headers/pragmas (e.g. BITS, MINREG). */
  headers: Record<string, number | string>;
}

// ─── Declarative two-pass driver ─────────────────────────────────────────────

export interface EncodeContext {
  mnemonic: string;
  /** opcode from the matched InstructionDef. */
  opcode: number;
  /** Resolved operand integers, in source order (registers, immediates, labels). */
  operands: number[];
  /** Resolved operands with kind/source metadata (for richer encoders). */
  operandInfo: ResolvedOperand[];
  /** This instruction's own byte offset. */
  offset: number;
  size: number;
}

export interface InstructionDef {
  opcode: number;
  /** Bytes this instruction occupies. Number, or a fn of the operand count. */
  size?: number | ((operandCount: number) => number);
  /** Per-instruction encoder override (else `spec.encode` is used). */
  encode?: (ctx: EncodeContext) => number[];
}

export interface AliasDef {
  /** Real mnemonic this pseudo-instruction expands to. */
  mnemonic: string;
  /** Operand template; `aliasOperand` ('%') slots are filled from the user's operands. */
  operandTokens: string[];
}

export interface LabelResolveContext {
  /** The (post-alias-expansion) mnemonic doing the referencing. */
  mnemonic: string;
  /** Whether the referenced label is attached to a data-directive line. */
  targetIsData: boolean;
}

export interface IsaSpec {
  /** Informational word width in bits (e.g. 8). */
  wordBits?: number;
  /** Back-end: 'binary' (default, needs encoders) or 'ir' (resolved IR). */
  mode?: 'binary' | 'ir';
  /** Line/inline comment marker(s). Default '//'. */
  comment?: string | string[];
  /** Block-comment delimiters as an [open, close] pair (C-style). */
  blockComment?: [string, string];
  /** Label prefix. Default '.'. */
  labelPrefix?: string;
  /** Relative-address prefix (e.g. '~' for `~+n`/`~-n`); omit to disable. */
  relativePrefix?: string;
  /** Port/MMIO prefix (e.g. '%'); resolved via `symbols.ports` or a trailing number. */
  portPrefix?: string;
  /** Memory-operand prefix(es) (e.g. ['M','#']); value = trailing number. */
  memPrefix?: string | string[];
  /** Character-literal delimiters (e.g. ["'", '"']); value via `symbols.chars` or charCode. */
  charDelims?: string[];
  /** Macro-definition keyword (e.g. '@DEFINE'); omit to disable macros. */
  macroKeyword?: string;
  /** Macro-reference prefix (e.g. '@'). Default '@'. */
  macroPrefix?: string;
  /** Header/pragma keywords (e.g. ['BITS','MINREG','RUN']); parsed into `headers`, not emitted. */
  headers?: string[];
  /** Data-word directive (e.g. 'DW'); its lines carry value(s) but occupy `dataSize` bytes each. */
  dataMnemonic?: string;
  /** Bytes a single data value occupies in the instruction stream. Default 0. */
  dataSize?: number;
  /** Placeholder token in alias operand templates. Default '%'. */
  aliasOperand?: string;
  /** Instruction set: mnemonic → definition. */
  mnemonics: Record<string, InstructionDef>;
  /** Pseudo-instructions. */
  aliases?: Record<string, AliasDef>;
  /** Named symbol namespaces: { registers, conditions, ports, chars, … } → token→value. */
  symbols?: Record<string, Record<string, number>>;
  /** Match symbol/register tokens case-insensitively. Default true. */
  symbolCaseInsensitive?: boolean;
  /** Parse a register token → its index, or undefined if not a register. */
  parseRegister?: (token: string) => number | undefined;
  /** Override numeric token parsing (default {@link parseNumber}). */
  parseNumber?: (token: string) => number;
  /** Default instruction encoder (per-instruction `encode` wins). Required for binary mode. */
  encode?: (ctx: EncodeContext) => number[];
  /** Default size for instructions without an explicit `size`. Default `() => 1`. */
  instructionSize?: (operandCount: number) => number;
  /**
   * Label resolution policy. Return 'value' to resolve a label reference to the
   * target line's data value, or 'offset' (default) for its byte offset.
   */
  resolveLabel?: (ctx: LabelResolveContext) => 'offset' | 'value';
}

export interface Assembler {
  /** Assemble to machine-code words/bytes (binary mode; throws if no encoders). */
  assemble(src: string): number[];
  /** Assemble to a resolved, target-independent IR (works without encoders). */
  assembleIR(src: string): AsmIR;
}

interface Operand {
  token: string;
  raw: string;
  kind: OperandKind;
  label?: string;
  /** For relative operands: the signed delta. */
  relative?: number;
  /** Resolved numeric value (filled in pass 2 for labels/relatives). */
  immediate?: number;
  /** Symbol namespace, for symbol/port kinds. */
  symbol?: string;
}

interface Line {
  mnemonic: string;
  operands: Operand[];
  isData: boolean;
  size: number;
  opcode: number;
  encode?: (ctx: EncodeContext) => number[];
  offset: number;
  label?: string;
  dataValue?: number;
  dataValues?: number[];
}

/** Build an assembler from a declarative ISA spec. */
export function define(spec: IsaSpec): Assembler {
  const comment = spec.comment ?? '//';
  const labelPrefix = spec.labelPrefix ?? '.';
  const macroPrefix = spec.macroPrefix ?? '@';
  const aliasOperand = spec.aliasOperand ?? '%';
  const dataMnemonic = spec.dataMnemonic;
  const dataSize = spec.dataSize ?? 0;
  const aliases = spec.aliases ?? {};
  const num = spec.parseNumber ?? parseNumber;
  const sizeOf = spec.instructionSize ?? (() => 1);
  const resolvePolicy = spec.resolveLabel ?? (() => 'offset' as const);
  const caseInsensitive = spec.symbolCaseInsensitive ?? true;
  const relativePrefix = spec.relativePrefix;
  const portPrefix = spec.portPrefix;
  const memPrefixes = spec.memPrefix === undefined ? [] : Array.isArray(spec.memPrefix) ? spec.memPrefix : [spec.memPrefix];
  const charDelims = spec.charDelims ?? [];
  const symbolTables = spec.symbols ?? {};

  const mnemonicSet = new Set(Object.keys(spec.mnemonics).map((m) => m.toUpperCase()));
  const headerSet = new Set((spec.headers ?? []).map((h) => h.toUpperCase()));

  // Flatten symbol namespaces into one lookup (last namespace wins on collisions).
  const symbolMap = new Map<string, { value: number; symbol: string }>();
  for (const [ns, table] of Object.entries(symbolTables)) {
    for (const [name, val] of Object.entries(table)) {
      symbolMap.set(caseInsensitive ? name.toLowerCase() : name, { value: val, symbol: ns });
    }
  }
  const portTable = symbolTables.ports;
  const charTable = symbolTables.chars;

  const firstToken = (line: string) => line.split(' ')[0];
  const isMnemonicLine = (line: string) => mnemonicSet.has(firstToken(line).toUpperCase());
  const isDataLine = (line: string) => dataMnemonic !== undefined && firstToken(line).toUpperCase() === dataMnemonic;
  const isHeaderLine = (line: string) => headerSet.has(firstToken(line).toUpperCase());
  const isLabelLine = (line: string) => line.startsWith(labelPrefix);
  const isMacroLine = (line: string) =>
    spec.macroKeyword !== undefined && line.toUpperCase().startsWith(spec.macroKeyword.toUpperCase());

  function isAliasLine(line: string): boolean {
    const tokens = line.split(' ');
    const mnemonic = tokens[0].toUpperCase();
    const alias = aliases[mnemonic];
    if (alias === undefined) return false;
    // An alias whose surface name == its target is only an alias when the operand
    // count differs from the template (otherwise it's the plain instruction).
    if (mnemonic === alias.mnemonic) return tokens.length - 1 !== alias.operandTokens.length;
    return true;
  }

  function parseDefinitions(lines: string[]): Record<string, string> {
    const out: Record<string, string> = {};
    if (spec.macroKeyword === undefined) return out;
    for (const line of lines) {
      if (!isMacroLine(line)) continue;
      const tokens = line.split(' ');
      if (tokens.length !== 3) {
        throw new ParseError(`Invalid macro: "${line}". Expected: ${spec.macroKeyword} NAME VALUE`);
      }
      out[tokens[1]] = tokens[2];
    }
    return out;
  }

  function lookupChar(token: string): number | undefined {
    for (const d of charDelims) {
      if (token.length >= 2 * d.length && token.startsWith(d) && token.endsWith(d)) {
        const inner = token.slice(d.length, token.length - d.length);
        if (charTable) {
          if (charTable[inner] !== undefined) return charTable[inner];
          if (caseInsensitive) {
            const f = Object.entries(charTable).find(([k]) => k.toLowerCase() === inner.toLowerCase());
            if (f) return f[1];
          }
        }
        // Decode common escape sequences (\n, \t, \r, \0, \\, \', \").
        if (inner.length === 2 && inner[0] === '\\') {
          const esc: Record<string, number> = { n: 10, t: 9, r: 13, '0': 0, '\\': 92, "'": 39, '"': 34 };
          const v = esc[inner[1]];
          if (v !== undefined) return v;
        }
        return inner.charCodeAt(0);
      }
    }
    return undefined;
  }

  function parseOperand(token: string, defs: Record<string, string>): Operand {
    // Macro reference → expand and re-resolve.
    if (spec.macroKeyword !== undefined && token.startsWith(macroPrefix)) {
      const value = defs[token.slice(macroPrefix.length)];
      if (value !== undefined) return parseOperand(value, defs);
      throw new ParseError(`Undefined macro "${token}"`);
    }
    // Label.
    if (token.startsWith(labelPrefix)) return { token, raw: token, kind: 'label', label: token };
    // Relative address (~+n / ~-n).
    if (relativePrefix && token.startsWith(relativePrefix)) {
      const rest = token.slice(relativePrefix.length);
      const delta = rest === '' ? 0 : num(rest);
      return { token, raw: token, kind: 'relative', relative: delta };
    }
    // Port / MMIO.
    if (portPrefix && token.startsWith(portPrefix)) {
      const name = token.slice(portPrefix.length);
      let value: number | undefined;
      if (portTable && portTable[name] !== undefined) value = portTable[name];
      else if (caseInsensitive && portTable) {
        const f = Object.entries(portTable).find(([k]) => k.toLowerCase() === name.toLowerCase());
        value = f ? f[1] : undefined;
      }
      if (value === undefined && /^[+-]?[0-9]/.test(name)) value = num(name);
      return { token, raw: token, kind: 'port', immediate: value, symbol: name };
    }
    // Memory operand.
    for (const mp of memPrefixes) {
      if (mp && token.startsWith(mp) && /^[+-]?[0-9]/.test(token.slice(mp.length))) {
        return { token, raw: token, kind: 'memory', immediate: num(token.slice(mp.length)) };
      }
    }
    // Character literal.
    const c = lookupChar(token);
    if (c !== undefined) return { token, raw: token, kind: 'char', immediate: c };
    // Register.
    const reg = spec.parseRegister?.(token);
    if (reg !== undefined) return { token, raw: token, kind: 'register', immediate: reg };
    // Named symbol (conditions, ports-by-name, chars-by-name, …).
    const sym = symbolMap.get(caseInsensitive ? token.toLowerCase() : token);
    if (sym !== undefined) return { token, raw: token, kind: 'symbol', immediate: sym.value, symbol: sym.symbol };
    // Numeric immediate (throws if unrecognised).
    return { token, raw: token, kind: 'immediate', immediate: num(token) };
  }

  function makeLine(mnemonic: string, operands: Operand[], dataValues?: number[]): Line {
    const isData = dataMnemonic !== undefined && mnemonic.toUpperCase() === dataMnemonic;
    const def = spec.mnemonics[mnemonic];
    const opcode = def ? def.opcode : -1;
    const count = dataValues ? dataValues.length : operands.length;
    const size = isData
      ? dataSize * Math.max(1, count)
      : typeof def?.size === 'number'
        ? def.size
        : typeof def?.size === 'function'
          ? def.size(operands.length)
          : sizeOf(operands.length);
    return {
      mnemonic,
      operands,
      isData,
      size,
      opcode,
      encode: def?.encode ?? spec.encode,
      offset: 0,
      dataValue: isData ? dataValues?.[0] : undefined,
      dataValues: isData ? dataValues : undefined,
    };
  }

  function parseDataLine(line: string, defs: Record<string, string>): Line {
    const rest = line.split(' ').slice(1).join(' ').trim();
    let valueTokens: string[];
    if (rest.startsWith('[')) {
      valueTokens = rest.replace(/^\[/, '').replace(/\]$/, '').trim().split(/\s+/).filter(Boolean);
    } else {
      valueTokens = rest === '' ? [] : rest.split(' ');
    }
    const ops = valueTokens.map((t) => parseOperand(t, defs));
    const values = ops.map((o) => o.immediate ?? 0);
    return makeLine(dataMnemonic as string, ops, values);
  }

  function parseLine(line: string, defs: Record<string, string>): Line {
    if (isDataLine(line)) return parseDataLine(line, defs);
    const mnemonic = line.split(' ')[0].toUpperCase();
    const operands = line.split(' ').slice(1).map((t) => parseOperand(t, defs));

    if (isAliasLine(line)) {
      const alias = aliases[mnemonic];
      const target: Operand[] = [];
      let idx = 0;
      for (const t of alias.operandTokens) {
        if (t === aliasOperand) {
          target.push(operands[idx]);
          if (idx < operands.length - 1) idx += 1;
        } else {
          target.push(parseOperand(t, defs));
        }
      }
      return makeLine(alias.mnemonic, target);
    }
    return makeLine(mnemonic, operands);
  }

  function parseLines(lines: string[], defs: Record<string, string>): Line[] {
    const out: Line[] = [];
    let pendingLabel: string | null = null;
    for (const line of lines) {
      if (isMnemonicLine(line) || isDataLine(line) || isAliasLine(line)) {
        const parsed = parseLine(line, defs);
        if (pendingLabel !== null) {
          parsed.label = pendingLabel;
          pendingLabel = null;
        }
        out.push(parsed);
      } else if (isLabelLine(line)) {
        pendingLabel = line;
      } else {
        throw new ParseError(`Unrecognized line "${line}"`);
      }
    }
    return out;
  }

  function fillOffsets(lines: Line[]): void {
    let offset = 0;
    for (const line of lines) {
      line.offset = offset;
      offset += line.size; // data lines contribute `dataSize` * count (default 0)
    }
  }

  function fillImmediates(lines: Line[]): void {
    for (const line of lines) {
      for (const operand of line.operands) {
        if (operand.kind === 'label') {
          const target = lines.find((l) => l.label === operand.label);
          if (target === undefined) {
            throw new AssembleError(`Cannot resolve label "${operand.label}" referenced by "${line.mnemonic}"`);
          }
          const policy = resolvePolicy({ mnemonic: line.mnemonic, targetIsData: target.isData });
          operand.immediate = policy === 'value' && target.isData ? target.dataValue ?? 0 : target.offset;
        } else if (operand.kind === 'relative') {
          operand.immediate = line.offset + (operand.relative ?? 0);
        }
      }
    }
  }

  function toResolved(o: Operand): ResolvedOperand {
    return { kind: o.kind, value: o.immediate ?? Number.NaN, raw: o.raw, symbol: o.symbol };
  }

  /** Shared front-end: normalise → macros → headers → parse → resolve offsets/labels. */
  function frontend(src: string): { parsed: Line[]; headers: Record<string, number | string>; labels: Record<string, number> } {
    const lines = normalizeLines(src, { comment, blockComment: spec.blockComment });
    const defs = parseDefinitions(lines);
    const headers: Record<string, number | string> = {};
    const code: string[] = [];
    for (const line of lines) {
      if (isMacroLine(line)) continue;
      if (isHeaderLine(line)) {
        const toks = line.split(' ').filter((t) => t !== '==' && t !== '=');
        const key = toks[0].toUpperCase();
        const rawVal = toks.slice(1).join(' ');
        let val: number | string = rawVal;
        try {
          val = num(rawVal);
        } catch {
          val = rawVal;
        }
        headers[key] = val;
        continue;
      }
      code.push(line);
    }
    const parsed = parseLines(code, defs);
    fillOffsets(parsed);
    const labels: Record<string, number> = {};
    for (const l of parsed) if (l.label) labels[l.label] = l.offset;
    fillImmediates(parsed);
    return { parsed, headers, labels };
  }

  function assemble(src: string): number[] {
    const { parsed } = frontend(src);
    return parsed
      .filter((l) => !l.isData)
      .flatMap((l) => {
        if (l.encode === undefined) {
          throw new AssembleError(`No encoder for mnemonic "${l.mnemonic}" (set spec.encode or def.encode, or use assembleIR)`);
        }
        return l.encode({
          mnemonic: l.mnemonic,
          opcode: l.opcode,
          operands: l.operands.map((o) => {
            if (o.immediate === undefined) throw new AssembleError(`Operand "${o.token}" has no value`);
            return o.immediate;
          }),
          operandInfo: l.operands.map(toResolved),
          offset: l.offset,
          size: l.size,
        });
      });
  }

  function assembleIR(src: string): AsmIR {
    const { parsed, headers, labels } = frontend(src);
    const instructions: AsmInstruction[] = parsed.map((l) => ({
      mnemonic: l.mnemonic,
      operands: l.operands.map(toResolved),
      offset: l.offset,
      label: l.label,
      data: l.isData ? l.dataValues : undefined,
    }));
    return { instructions, labels, headers };
  }

  return { assemble, assembleIR };
}
