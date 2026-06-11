import { compileBlock } from '../packages/core/src/compile/index';
import { executeInCompartment } from '../packages/synthase/src/compartment-executor';
import { CITY_FLOW, MAZE_FLOW } from '../client/src/lib/exampleFlows';

class FakeSchematic {
  blocks_: Array<{ x: number; y: number; z: number; name: string }> = [];
  set_block(x: number, y: number, z: number, name: string) { this.blocks_.push({ x, y, z, name }); }
  blocks() { return this.blocks_; }
}

const ctx = { Schematic: FakeSchematic, Math: Object.assign(Object.create(Math), { TAU: Math.PI * 2 }), Logger: console };

for (const [flow, nodeId, inputs] of [
  [MAZE_FLOW, 'maze-gen', { width: 21, height: 21, wall: 'minecraft:stone_bricks', seed: 7 }],
  [CITY_FLOW, 'city-plan', { size: 64, lot: 10, density: 0.75, seed: 7 }],
] as const) {
  const node = flow.nodes.find((n) => n.id === nodeId)!;
  const compiled = compileBlock(node.data.code!, { contextKeys: Object.keys(ctx) });
  try {
    const result = (await executeInCompartment(compiled.functionCode, inputs as any, ctx, { timeout: 10000 })) as any;
    console.log(`${nodeId}: OK keys=${Object.keys(result)}`);
  } catch (e) {
    console.log(`${nodeId}: FAILED -> ${(e as Error).message}`);
    console.log((e as Error).stack?.split('\n').slice(0, 5).join('\n'));
  }
}
