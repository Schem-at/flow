/**
 * Produce a small real .schem file to use as a bundled-asset fixture:
 * a 5x3x5 stone platform with a gold block marker.
 */
const nucleation = await import('nucleation');
// @ts-ignore - node entry inits on import or via default()
if (typeof (nucleation as any).default === 'function') {
  try { await (nucleation as any).default(); } catch { /* node entry may auto-init */ }
}

const { SchematicWrapper } = nucleation as any;
const s = new SchematicWrapper();
for (let x = 0; x < 5; x++) {
  for (let z = 0; z < 5; z++) {
    s.set_block(x, 0, z, 'minecraft:stone');
  }
}
s.set_block(2, 1, 2, 'minecraft:gold_block');
s.set_block(2, 2, 2, 'minecraft:torch');

const bytes: Uint8Array = s.to_schematic();
await Bun.write('/tmp/flow-asset-base.schem', bytes);
console.log(`wrote /tmp/flow-asset-base.schem (${bytes.length} bytes)`);
