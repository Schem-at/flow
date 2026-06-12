/**
 * Mcfunction — a small builder for .mcfunction files (docs/dx-audit.md §1.7).
 * Replaces inline string formatting of setblock/summon commands.
 */

type Pos = [number, number, number] | { x: number; y: number; z: number };

function xyz(pos: Pos): [number, number, number] {
  return Array.isArray(pos) ? pos : [pos.x, pos.y, pos.z];
}

export class McfunctionBuilder {
  private lines: string[] = [];

  comment(text: string): this {
    this.lines.push(`# ${text}`);
    return this;
  }

  raw(command: string): this {
    this.lines.push(command);
    return this;
  }

  setblock(pos: Pos, block: string, relative = true): this {
    const [x, y, z] = xyz(pos);
    const p = relative ? `~${x} ~${y} ~${z}` : `${x} ${y} ${z}`;
    this.lines.push(`setblock ${p} ${block}`);
    return this;
  }

  fill(from: Pos, to: Pos, block: string, relative = true): this {
    const [x1, y1, z1] = xyz(from);
    const [x2, y2, z2] = xyz(to);
    const f = (x: number, y: number, z: number) =>
      relative ? `~${x} ~${y} ~${z}` : `${x} ${y} ${z}`;
    this.lines.push(`fill ${f(x1, y1, z1)} ${f(x2, y2, z2)} ${block}`);
    return this;
  }

  /**
   * Summon a block_display: a miniature block hologram at a relative offset
   * with a uniform scale. The pattern the hologram example hand-rolled.
   */
  summonBlockDisplay(pos: Pos, block: string, scale = 0.1, tag?: string): this {
    const [x, y, z] = xyz(pos);
    const nbt = {
      block_state: { Name: block },
      transformation: {
        left_rotation: [0, 0, 0, 1],
        right_rotation: [0, 0, 0, 1],
        translation: [x, y, z],
        scale: [scale, scale, scale],
      },
      ...(tag ? { Tags: [tag] } : {}),
    };
    this.lines.push(`summon block_display ~ ~ ~ ${serializeNbt(nbt)}`);
    return this;
  }

  /** Kill every entity carrying `tag` (cleanup line for holograms). */
  killTagged(tag: string): this {
    this.lines.push(`kill @e[tag=${tag}]`);
    return this;
  }

  size(): number {
    return this.lines.length;
  }

  toString(): string {
    return this.lines.join('\n') + '\n';
  }
}

/** Minimal SNBT serializer (objects, arrays, numbers, strings). */
function serializeNbt(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(serializeNbt).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value).map(([k, v]) => `${k}:${serializeNbt(v)}`);
    return `{${entries.join(',')}}`;
  }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : `${value}f`;
  }
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

export const Mcfunction = {
  builder(): McfunctionBuilder {
    return new McfunctionBuilder();
  },
};
