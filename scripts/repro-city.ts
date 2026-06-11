import { compileBlock } from '../packages/core/src/compile/index';
import { CITY_FLOW } from '../client/src/lib/exampleFlows';

const node = CITY_FLOW.nodes.find((n) => n.id === 'city-plan')!;
const compiled = compileBlock(node.data.code!, { contextKeys: ['Schematic', 'Math', 'Noise', 'Vec', 'Logger'] });

class FakeSchematic {
  blocks_: Array<{ x: number; y: number; z: number; name: string }> = [];
  set_block(x: number, y: number, z: number, name: string) { this.blocks_.push({ x, y, z, name }); }
  blocks() { return this.blocks_; }
  get_dimensions() { return [0, 0, 0]; }
}

const fn = (0, eval)(compiled.functionCode);
try {
  const result = await fn(
    { size: 64, lot: 10, density: 0.75, seed: 7 },
    { Schematic: FakeSchematic, Math: Object.assign(Object.create(Math), { TAU: Math.PI * 2 }), Logger: console }
  );
  console.log('planner OK; lots:', result.lots.length, 'sample:', JSON.stringify(result.lots[0]));
} catch (e) {
  console.log('planner FAILED:', (e as Error).message);
  console.log((e as Error).stack?.split('\n').slice(0, 4).join('\n'));
}
