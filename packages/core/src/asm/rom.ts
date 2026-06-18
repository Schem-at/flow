/**
 * Generic ROM serialisation — ISA-agnostic. A pure port of the schematic-api
 * Basic ROM Generator (roms.py): turn an array of word values (any byte/word
 * producer — an assembler, a data table, raw numbers) into either the flat
 * base-N digit string that roms.py's `data` parameter consumes, or an explicit
 * list of (x, y, z, value, role) block placements laid out with the exact same
 * spatial math, ready to drive a Schematic builder or an in-editor preview.
 *
 * Nothing here knows about ARPU or any particular CPU — feed it bytes.
 */

/** Digits needed to represent one 8-bit word in the given base (2→8, 4→4, 16→2). */
export function digitsPerByte(base: number): number {
  return Math.ceil(8 / Math.log2(base));
}

export interface RomStringOptions {
  /** Numeric base each digit is written in (2–16). Default 16. */
  base?: number;
  /** Characters per word; defaults to `digitsPerByte(base)`. Override only to pad words wider. */
  bitWidth?: number;
  /** Pad the total word count up to this many words. */
  padTo?: number;
  /** Value used for padding words. Default 0. */
  fill?: number;
}

/**
 * Serialise word values into the flat base-N digit string that roms.py's `data`
 * parameter consumes. Each value is one 8-bit word rendered as `bitWidth`
 * base-`base` digits, most-significant digit first, words concatenated in order.
 * Pass the same `base` + `bit_width` to the Basic ROM Generator.
 */
export function romString(bytes: number[], opts: RomStringOptions = {}): string {
  const base = opts.base ?? 16;
  const width = opts.bitWidth ?? digitsPerByte(base);
  const fill = opts.fill ?? 0;
  const words = bytes.slice();
  if (opts.padTo !== undefined) {
    while (words.length < opts.padTo) words.push(fill);
  }
  return words
    .map((b) => (b & 0xff).toString(base).toUpperCase().padStart(width, '0'))
    .join('');
}

/** Clearer alias for {@link romString} — the canonical roms.py `data` artifact. */
export const romData = romString;

export type RomBlockRole = 'data' | 'zero' | 'fifteen' | 'invalid';

export interface RomPlacement {
  x: number;
  y: number;
  z: number;
  /** Parsed digit value (0..base-1), or -1 for an invalid character. */
  value: number;
  /** How roms.py would render this cell. */
  role: RomBlockRole;
}

export interface RomLayoutConfig {
  base?: number;
  bitWidth?: number;
  xWordCount?: number;
  zWordCount?: number;
  xOffsets?: number[];
  zOffsets?: number[];
  yOffsets?: number[];
  xStagger?: 'none' | 'even' | 'odd';
  zStagger?: 'none' | 'even' | 'odd';
  invertWord?: boolean;
  solidBlockOn0?: boolean;
  redstoneBlockOn15?: boolean;
  staggerIntersectionMode?: 'xor' | 'min' | 'max';
  /** Pad the word stream up to this many words before laying out. */
  padTo?: number;
  fill?: number;
}

const STAGGER_INTERSECTION: Record<string, (a: number, b: number) => number> = {
  xor: (a, b) => (a !== b ? 1 : 0),
  min: (a, b) => Math.min(a, b),
  max: (a, b) => Math.max(a, b),
};

/**
 * Pure port of roms.py `BasicROMGenerator.generate` coordinate math: maps the
 * serialised ROM digit string to explicit (x, y, z, value, role) block
 * placements. No schematic dependency — feed the result to a Schematic builder
 * (or a preview) to render the ROM exactly as the schematic-api would.
 */
export function romLayout(bytes: number[], cfg: RomLayoutConfig = {}): RomPlacement[] {
  const base = cfg.base ?? 2;
  const bitWidth = cfg.bitWidth ?? digitsPerByte(base);
  const data = romString(bytes, { base, bitWidth, padTo: cfg.padTo, fill: cfg.fill });
  return romLayoutData(data, cfg);
}

/**
 * Like {@link romLayout} but takes a pre-made base-N digit string directly (e.g.
 * the output of {@link romString} / the `rom-data` node / roms.py's `data`
 * param), skipping the bytes→string step. Same coordinate math. `base`/`bitWidth`
 * in `cfg` describe how to read the string back into digit values + word height.
 */
export function romLayoutData(data: string, cfg: RomLayoutConfig = {}): RomPlacement[] {
  const base = cfg.base ?? 2;
  const bitWidth = cfg.bitWidth ?? digitsPerByte(base);
  const xWordCount = cfg.xWordCount ?? 16;
  const zWordCount = cfg.zWordCount ?? 4;
  const xOffsets = cfg.xOffsets ?? [2];
  const zOffsets = cfg.zOffsets ?? [4];
  const yOffsets = cfg.yOffsets ?? [2];
  const xStagger = cfg.xStagger ?? 'none';
  const zStagger = cfg.zStagger ?? 'none';
  const invertWord = cfg.invertWord ?? true;
  const solidBlockOn0 = cfg.solidBlockOn0 ?? true;
  const redstoneBlockOn15 = cfg.redstoneBlockOn15 ?? true;
  const staggerFn = STAGGER_INTERSECTION[cfg.staggerIntersectionMode ?? 'xor'] ?? STAGGER_INTERSECTION.min;

  const xOffsetsSum = xOffsets.reduce((a, b) => a + b, 0);
  const yOffsetsSum = yOffsets.reduce((a, b) => a + b, 0);
  const zOffsetsSum = zOffsets.reduce((a, b) => a + b, 0);
  const sumPrefix = (arr: number[], n: number) => arr.slice(0, n).reduce((a, b) => a + b, 0);
  const totalDataCount = bitWidth * xWordCount * zWordCount;

  const placements: RomPlacement[] = [];
  for (let dataIndex = 0; dataIndex < data.length; dataIndex++) {
    if (dataIndex >= totalDataCount) break;

    const dataMy = dataIndex % bitWidth;
    const dataMx = Math.floor(dataIndex / bitWidth) % xWordCount;
    const dataMz = Math.floor(Math.floor(dataIndex / bitWidth) / xWordCount);

    const dataX =
      Math.floor(dataMx / xOffsets.length) * xOffsetsSum + sumPrefix(xOffsets, dataMx % xOffsets.length);
    const dataZ =
      Math.floor(dataMz / zOffsets.length) * zOffsetsSum + sumPrefix(zOffsets, dataMz % zOffsets.length);

    const xParity = dataMx % 2;
    const xStaggered = xStagger === 'none' ? 0 : xStagger === 'odd' ? xParity : 1 - xParity;
    const zParity = dataMz % 2;
    const zStaggered = zStagger === 'none' ? 0 : zStagger === 'odd' ? zParity : 1 - zParity;
    const stagger = staggerFn(xStaggered, zStaggered);
    const dataY =
      (invertWord ? -1 : 1) *
        (Math.floor(dataMy / yOffsets.length) * yOffsetsSum + sumPrefix(yOffsets, dataMy % yOffsets.length)) +
      stagger;

    const char = data[dataIndex].toLowerCase();
    const value = parseInt(char, base);
    let role: RomBlockRole;
    if (Number.isNaN(value)) role = 'invalid';
    else if (solidBlockOn0 && value === 0) role = 'zero';
    else if (redstoneBlockOn15 && value === 15) role = 'fifteen';
    else role = 'data';

    placements.push({ x: dataX, y: dataY, z: dataZ, value: Number.isNaN(value) ? -1 : value, role });
  }
  return placements;
}
