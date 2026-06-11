/**
 * One SchematicRendererContext for the whole app (render-and-blit):
 * the resource pack is fetched/parsed and the texture atlas built ONCE,
 * and every viewer shares a single WebGL context. Individual
 * SchematicRenderer instances become cheap viewports — creating or
 * re-running a preview swaps schematics instead of re-initializing.
 */

import { SchematicRendererContext } from 'schematic-renderer';

let packPromise: Promise<Blob> | null = null;

function getVanillaPack(): Promise<Blob> {
  if (!packPromise) {
    packPromise = fetch('/pack.zip')
      .then((r) => {
        if (!r.ok) throw new Error(`pack.zip fetch failed: ${r.status}`);
        return r.arrayBuffer();
      })
      .then((buffer) => new Blob([buffer], { type: 'application/zip' }))
      .catch((error) => {
        packPromise = null; // allow retry on transient failure
        throw error;
      });
  }
  return packPromise;
}

let contextPromise: Promise<SchematicRendererContext> | null = null;

export function getSharedRendererContext(): Promise<SchematicRendererContext> {
  if (!contextPromise) {
    contextPromise = SchematicRendererContext.create(
      { vanillaPack: () => getVanillaPack() },
      { sharedRenderer: true }
    ).catch((error) => {
      contextPromise = null; // allow retry on transient failure
      throw error;
    });
  }
  return contextPromise;
}
