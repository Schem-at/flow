/**
 * Helpers for working with a single code-block unit:
 *
 *   export const io = { inputs: {...}, outputs: {...} };
 *   export default async function({ ...inputs }, { Schematic }) { ... }
 *
 * NOTE: io extraction here is intentionally the *existing* best-effort
 * regex + eval approach, isolated into one place. It is fragile (it breaks
 * on `};` inside strings or deeply nested structures) and is the seam we
 * plan to replace with real parsing. The workbench only uses it to seed
 * default input values, which the user can override by hand.
 */

export interface IoInputDef {
  type?: string;
  default?: unknown;
  description?: string;
  options?: unknown[];
}

export interface IoSchema {
  inputs?: Record<string, IoInputDef>;
  outputs?: Record<string, { type?: string }>;
}

/** Extract the evaluated `io` object from code text, or null if absent/unparseable. */
export function extractIo(code: string): IoSchema | null {
  try {
    const match = code.match(/export\s+const\s+io\s*=\s*(\{[\s\S]*?\});\s/);
    if (!match) return null;
    // eslint-disable-next-line no-new-func
    const io = new Function(`return (${match[1]})`)() as IoSchema;
    return io && typeof io === 'object' ? io : null;
  } catch {
    return null;
  }
}

/** Build a default inputs object from io.inputs[*].default. Returns {} on failure. */
export function extractIoDefaults(code: string): Record<string, unknown> {
  const io = extractIo(code);
  const inputs = io?.inputs;
  if (!inputs) return {};
  const result: Record<string, unknown> = {};
  for (const [key, def] of Object.entries(inputs)) {
    if (def && typeof def === 'object' && 'default' in def) {
      result[key] = def.default;
    }
  }
  return result;
}
