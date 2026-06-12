/**
 * toolkit provider — the DX ambients from docs/dx-audit.md: Field (height-
 * fields), Image (RGBA builders), Random (deterministic hashing/RNG),
 * Table (CSV), Mcfunction (command builder).
 *
 * Registered after standard + nucleation so the context-coupled builders
 * (Field.fromNoise uses Noise, Field.toTerrain uses Schematic) can reach
 * earlier endowments.
 */

import type { RuntimeProvider, RuntimeEnv } from './types.js';
import { FieldOps, type FieldData } from '../utils/field.js';
import { FlowImage } from '../utils/image.js';
import { Random } from '../utils/random.js';
import { Table } from '../utils/table.js';
import { Mcfunction, McfunctionBuilder } from '../utils/mcfunction.js';

interface NoiseLike {
  getFractal2D_01(x: number, y: number, options?: Record<string, unknown>): number;
}

interface SchematicLike {
  set_block(x: number, y: number, z: number, name: string): void;
}

export const toolkitProvider: RuntimeProvider = {
  name: 'toolkit',
  version: '1.0.0',

  async create(_env: RuntimeEnv, context: Record<string, unknown> = {}) {
    const Field = {
      ...FieldOps,

      /**
       * width×height fractal-noise field in [0, 1] — the opening line of
       * every worldgen flow. Options pass through to Noise.getFractal2D_01.
       */
      fromNoise(
        width: number,
        height: number,
        options: Record<string, unknown> = {}
      ): FieldData {
        const noise = context.Noise as NoiseLike | undefined;
        if (!noise) throw new Error('Field.fromNoise needs the Noise provider');
        return FieldOps.create(width, height, (x, z) => noise.getFractal2D_01(x, z, options));
      },

      /**
       * Paint a heightfield into a NEW schematic: columns of `fill` capped
       * with `surface`, heights scaled into [1, maxHeight].
       */
      toTerrain(
        field: FieldData,
        options: {
          maxHeight?: number;
          surface?: string;
          fill?: string;
        } = {}
      ): SchematicLike {
        const SchematicClass = context.Schematic as (new () => SchematicLike) | undefined;
        if (!SchematicClass) throw new Error('Field.toTerrain needs the nucleation provider');
        const { maxHeight = 32, surface = 'minecraft:grass_block', fill = 'minecraft:dirt' } = options;
        const normalized = FieldOps.normalize(field);
        const terrain = new SchematicClass();
        for (let z = 0; z < normalized.length; z++) {
          for (let x = 0; x < (normalized[z]?.length ?? 0); x++) {
            const h = Math.max(1, Math.round(normalized[z][x] * (maxHeight - 1)) + 1);
            for (let y = 0; y < h - 1; y++) terrain.set_block(x, y, z, fill);
            terrain.set_block(x, h - 1, z, surface);
          }
        }
        return terrain;
      },

      /** Render through a palette (viridis/terrain/grayscale/magma) as an Image. */
      toImage(field: FieldData, palette?: Parameters<typeof FlowImage.fromField>[1]) {
        return FlowImage.fromField(field, palette);
      },
    };

    return {
      Field,
      Image: FlowImage,
      Random,
      Table,
      Mcfunction,
      McfunctionBuilder,
    };
  },
};
