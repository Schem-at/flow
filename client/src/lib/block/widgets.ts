/**
 * Inline-widget support: find the editable input declarations in block source
 * (Slider / NumberField / Toggle / Block / TextField / Textarea<{ … }> and
 * string-literal-union enums) with their config + source position, so the editor
 * can render an interactive control next to each one.
 *
 * The control drives a RUNTIME value (passed to the run); it does not rewrite the
 * source. `default` here is the declared default the control starts from.
 *
 * Pure + synchronous (regex, no TS load) so it can run on every keystroke.
 */

export type WidgetKind = 'slider' | 'number' | 'toggle' | 'block' | 'text' | 'enum';

export interface InputWidget {
  name: string;
  kind: WidgetKind;
  /** Char offset where the `name:` declaration begins (to place the control). */
  declStart: number;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  default?: number | boolean | string;
  /** [start,end) of the numeric default token (legacy; numeric widgets only). */
  defaultRange?: [number, number];
}

const HELPER_KIND: Record<string, WidgetKind> = {
  Slider: 'slider',
  NumberField: 'number',
  Toggle: 'toggle',
  Block: 'block',
  TextField: 'text',
  Textarea: 'text',
};

// name : Helper<{ … }>
const HELPER_RE =
  /([A-Za-z_$][\w$]*)\s*:\s*(Slider|NumberField|Toggle|Block|TextField|Textarea)\s*<\s*\{([^}]*)\}\s*>/g;
// name : 'a' | 'b' | 'c'  (a string-literal union — at least one `|`)
const ENUM_RE = /([A-Za-z_$][\w$]*)\s*:\s*('[^']*'(?:\s*\|\s*'[^']*')+)/g;

function readNumber(config: string, key: string): number | undefined {
  const m = new RegExp(`\\b${key}\\s*:\\s*(-?\\d*\\.?\\d+)`).exec(config);
  return m ? Number(m[1]) : undefined;
}
function readString(config: string, key: string): string | undefined {
  const m = new RegExp(`\\b${key}\\s*:\\s*'([^']*)'`).exec(config);
  return m ? m[1] : undefined;
}
function readBool(config: string, key: string): boolean | undefined {
  const m = new RegExp(`\\b${key}\\s*:\\s*(true|false)`).exec(config);
  return m ? m[1] === 'true' : undefined;
}

export function parseInputWidgets(source: string): InputWidget[] {
  const out: InputWidget[] = [];

  HELPER_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = HELPER_RE.exec(source)) !== null) {
    const [full, name, type, config] = m;
    const kind = HELPER_KIND[type];
    const w: InputWidget = { name, kind, declStart: m.index };

    if (kind === 'slider' || kind === 'number') {
      w.min = readNumber(config, 'min');
      w.max = readNumber(config, 'max');
      w.step = readNumber(config, 'step');
      const dm = /\bdefault\s*:\s*(-?\d*\.?\d+)/.exec(config);
      if (dm) {
        const configStart = m.index + full.indexOf('{') + 1;
        const valStart = configStart + dm.index + (dm[0].length - dm[1].length);
        w.defaultRange = [valStart, valStart + dm[1].length];
        w.default = Number(dm[1]);
      }
    } else if (kind === 'toggle') {
      w.default = readBool(config, 'default') ?? false;
    } else {
      w.default = readString(config, 'default') ?? '';
    }
    out.push(w);
  }

  ENUM_RE.lastIndex = 0;
  while ((m = ENUM_RE.exec(source)) !== null) {
    const [, name, union] = m;
    const options = union.match(/'([^']*)'/g)?.map((s) => s.slice(1, -1)) ?? [];
    if (options.length) {
      out.push({ name, kind: 'enum', declStart: m.index, options, default: options[0] });
    }
  }

  return out.sort((a, b) => a.declStart - b.declStart);
}

/**
 * Locate each positional input's declaration in `generate(a: T, b: T, …)` →
 * Map<name, char-offset of the declaration start>. Used to place an inline
 * control (any type, incl. arrays/objects) under each input line. Object/legacy
 * forms return nothing for those inputs (they fall back to the docked form).
 */
export function findInputDeclarations(source: string): Map<string, number> {
  const map = new Map<string, number>();

  const decl = /(?:^|[\s;}])(?:async\s+)?function\s+generate\s*\(|(?:^|[\s;}])(?:const|let|var)\s+generate\s*=/.exec(source);
  if (!decl) return map;
  const gen = source.indexOf('generate', decl.index);
  const open = source.indexOf('(', gen);
  if (open < 0) return map;
  const arrow = source.indexOf('=>', gen);
  if (arrow >= 0 && arrow < open) return map; // bare-identifier arrow param

  let depth = 0;
  let listEnd = -1;
  for (let j = open; j < source.length; j++) {
    const c = source[j];
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) { listEnd = j; break; } }
  }
  if (listEnd < 0) return map;

  const listStart = open + 1;
  const text = source.slice(listStart, listEnd);
  const params: Array<{ name: string; offset: number; objectTyped: boolean }> = [];
  depth = 0;
  let start = 0;
  const collect = (s: number, e: number) => {
    const raw = text.slice(s, e);
    const trimmed = raw.replace(/^\s+/, '');
    if (!trimmed || trimmed.startsWith('{')) return; // destructure pattern → fall back to docked form
    const colon = trimmed.indexOf(':');
    const name = (colon < 0 ? trimmed : trimmed.slice(0, colon)).trim();
    if (!/^[A-Za-z_$][\w$]*$/.test(name)) return;
    const type = colon < 0 ? '' : trimmed.slice(colon + 1).trim();
    params.push({ name, offset: listStart + s + (raw.length - trimmed.length), objectTyped: type.startsWith('{') });
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '<' || c === '(' || c === '[' || c === '{') depth++;
    else if (c === '>' || c === ')' || c === ']' || c === '}') depth--;
    else if (c === ',' && depth === 0) { collect(start, i); start = i + 1; }
  }
  collect(start, text.length);

  // A single object-typed param is the `inputs: { … }` container, not an input.
  if (params.length === 1 && params[0].objectTyped) return map;
  for (const p of params) map.set(p.name, p.offset);
  return map;
}

/** Replace the numeric default at `range` with `value` (legacy; unused by the runtime model). */
export function setWidgetDefault(
  source: string,
  range: [number, number],
  value: number | boolean
): string {
  return source.slice(0, range[0]) + String(value) + source.slice(range[1]);
}
