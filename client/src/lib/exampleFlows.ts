/**
 * Built-in example FLOWS for the node editor — complete node/edge graphs that
 * exercise multi-step execution. The Julia flow chains two v2 blocks: one
 * generates a Schematic[][] grid of Julia-set tiles, the next stitches them
 * into a single schematic, previewed by a viewer and exposed via an output
 * node (so the same flow works through POST /api/execute and the FlowRunner).
 */

import type { FlowData, BlockContract } from '@flow/core';
import { EXAMPLE_BLOCKS } from './block/examples';
import { contractToIO } from './block/io-compat';

const JULIA_SOURCE = EXAMPLE_BLOCKS.find((b) => b.id === 'julia-grid')!.source;

const JULIA_CONTRACT: BlockContract = {
  inputs: {
    cols: { kind: 'number', widget: 'slider', min: 1, max: 8, default: 4 },
    rows: { kind: 'number', widget: 'slider', min: 1, max: 6, default: 3 },
    tile: { kind: 'number', widget: 'slider', min: 8, max: 32, default: 16 },
    iterations: { kind: 'number', widget: 'slider', min: 8, max: 64, default: 32 },
  },
  outputs: {
    tiles: { kind: 'list', of: { kind: 'list', of: { kind: 'schematic' } } },
  },
};

export const STITCH_SOURCE = `type Inputs = {
  tiles: Schematic[][];
  spacing: Slider<{ min: 0; max: 8; default: 2 }>;
};

type Outputs = {
  stitched: Schematic;
};

function generate(inputs) {
  const stitched = new Schematic();
  const tiles = inputs.tiles || [];
  const spacing = inputs.spacing ?? 2;

  let offsetZ = 0;
  for (let r = 0; r < tiles.length; r++) {
    const row = tiles[r] || [];
    let offsetX = 0;
    let rowDepth = 0;
    for (let c = 0; c < row.length; c++) {
      const tile = row[c];
      if (!tile || typeof tile.blocks !== 'function') continue;
      const dims = tile.get_dimensions();
      for (const b of tile.blocks()) {
        stitched.set_block(offsetX + b.x, b.y, offsetZ + b.z, b.name);
      }
      offsetX += (dims[0] | 0) + spacing;
      rowDepth = Math.max(rowDepth, dims[2] | 0);
    }
    offsetZ += rowDepth + spacing;
  }

  return { stitched };
}
`;

const STITCH_CONTRACT: BlockContract = {
  inputs: {
    tiles: { kind: 'list', of: { kind: 'list', of: { kind: 'schematic' } } },
    spacing: { kind: 'number', widget: 'slider', min: 0, max: 8, default: 2 },
  },
  outputs: {
    stitched: { kind: 'schematic' },
  },
};

export const JULIA_STITCH_FLOW: FlowData = {
  id: 'example-julia-stitch',
  name: 'Julia Set Mosaic',
  version: '1.0.0',
  createdAt: 0,
  nodes: [
    {
      id: 'cols-input',
      type: 'input',
      position: { x: 0, y: 40 },
      data: {
        label: 'cols',
        value: 4,
        dataType: 'number',
        widgetType: 'slider',
        min: 1,
        max: 8,
        step: 1,
        description: 'Grid columns',
      },
    },
    {
      id: 'julia-gen',
      type: 'code',
      position: { x: 320, y: 0 },
      data: {
        label: 'Julia Grid',
        code: JULIA_SOURCE,
        contract: JULIA_CONTRACT,
        io: contractToIO(JULIA_CONTRACT),
      },
    },
    {
      id: 'stitcher',
      type: 'code',
      position: { x: 780, y: 60 },
      data: {
        label: 'Stitch Tiles',
        code: STITCH_SOURCE,
        contract: STITCH_CONTRACT,
        io: contractToIO(STITCH_CONTRACT),
      },
    },
    {
      id: 'tiles-viewer',
      type: 'viewer',
      position: { x: 780, y: 420 },
      data: { label: 'Tile gallery', isResizable: true },
    },
    {
      id: 'mosaic-viewer',
      type: 'viewer',
      position: { x: 1240, y: 0 },
      data: { label: 'Mosaic preview', isResizable: true },
    },
    {
      id: 'mosaic-output',
      type: 'output',
      position: { x: 1240, y: 380 },
      data: { label: 'mosaic' },
    },
  ],
  edges: [
    {
      id: 'e-cols',
      source: 'cols-input',
      target: 'julia-gen',
      sourceHandle: 'output',
      targetHandle: 'cols',
    },
    {
      id: 'e-tiles',
      source: 'julia-gen',
      target: 'stitcher',
      sourceHandle: 'tiles',
      targetHandle: 'tiles',
    },
    {
      id: 'e-tiles-view',
      source: 'julia-gen',
      target: 'tiles-viewer',
      sourceHandle: 'tiles',
      targetHandle: 'input',
    },
    {
      id: 'e-view',
      source: 'stitcher',
      target: 'mosaic-viewer',
      sourceHandle: 'stitched',
      targetHandle: 'input',
    },
    {
      id: 'e-out',
      source: 'stitcher',
      target: 'mosaic-output',
      sourceHandle: 'stitched',
      targetHandle: 'input',
    },
  ],
};

export const EXAMPLE_FLOWS: FlowData[] = [JULIA_STITCH_FLOW];
