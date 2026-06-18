/**
 * BLOCKER 1 — recursive nested-schematic handle marshalling.
 *
 * WASM Schematic objects cannot be structured-cloned across postMessage, so the
 * worker replaces them with `{ _schematicHandle: id }` refs the client resolves
 * via getData(). Historically only TOP-LEVEL result schematics were handled
 * (the `returnHandles` path). A folded `{ __outputs, __trace }` result has
 * schematics NESTED inside trace values / output fields / arrays — those must
 * round-trip too.
 *
 * These tests prove the recursive worker-side EXTRACT (handle refs emitted +
 * registered for getData) and the client-side deep RESOLVE, with mock handles
 * (hermetic — no WASM). They also prove the depth/cycle guard.
 */

import { describe, it, expect, vi } from 'vitest';
import { MessageHandler } from './MessageHandler.js';
import { WorkerClient } from './WorkerClient.js';
import { workerDataStore } from './WorkerDataStore.js';

/** A minimal stand-in for a nucleation SchematicWrapper (isSchematicWrapper → true). */
function mockSchematic(tag: string): { to_schematic: () => Uint8Array; name: () => string } {
  return {
    to_schematic: () => new Uint8Array([1, 2, 3]),
    name: () => tag,
  };
}

/** Build a MessageHandler with no-op transport; expose the private extractor. */
function makeHandler(): { deepExtractSchematicHandles: (v: unknown) => unknown } {
  const handler = new MessageHandler({
    postMessage: () => {},
    postProgress: () => {},
  });
  return handler as unknown as { deepExtractSchematicHandles: (v: unknown) => unknown };
}

function isHandleRef(v: unknown): v is { _schematicHandle: string } {
  return !!v && typeof v === 'object' && typeof (v as { _schematicHandle?: unknown })._schematicHandle === 'string';
}

describe('worker: deepExtractSchematicHandles (recursive)', () => {
  it('replaces a NESTED schematic (inside an object) with a registered handle ref', () => {
    const h = makeHandler();
    const schem = mockSchematic('nested-obj');
    const out = h.deepExtractSchematicHandles({
      __outputs: { result: { wrapped: schem } },
      __trace: {},
    }) as { __outputs: { result: { wrapped: unknown } } };

    const ref = out.__outputs.result.wrapped;
    expect(isHandleRef(ref)).toBe(true);
    // The original WASM object is registered and resolvable via the store.
    expect(workerDataStore.get((ref as { _schematicHandle: string })._schematicHandle)).toBe(schem);
  });

  it('replaces schematics nested in ARRAYS and inside trace values', () => {
    const h = makeHandler();
    const a = mockSchematic('arr-0');
    const b = mockSchematic('trace-val');
    const out = h.deepExtractSchematicHandles({
      __outputs: { list: [a, 5, { deep: a }] },
      __trace: { n1: { value: b, ms: 3, status: 'ok' } },
    }) as {
      __outputs: { list: [unknown, number, { deep: unknown }] };
      __trace: { n1: { value: unknown } };
    };

    expect(isHandleRef(out.__outputs.list[0])).toBe(true);
    expect(out.__outputs.list[1]).toBe(5); // primitives untouched
    expect(isHandleRef(out.__outputs.list[2].deep)).toBe(true);
    expect(isHandleRef(out.__trace.n1.value)).toBe(true);

    // Each ref resolves back to its original object.
    const r0 = (out.__outputs.list[0] as { _schematicHandle: string })._schematicHandle;
    const rTrace = (out.__trace.n1.value as { _schematicHandle: string })._schematicHandle;
    expect(workerDataStore.get(r0)).toBe(a);
    expect(workerDataStore.get(rTrace)).toBe(b);
  });

  it('leaves typed arrays / ArrayBuffers and primitives untouched', () => {
    const h = makeHandler();
    const ta = new Uint8Array([9, 8, 7]);
    const out = h.deepExtractSchematicHandles({ bytes: ta, n: 1, s: 'x', b: true, nil: null }) as {
      bytes: Uint8Array;
      n: number;
      s: string;
      b: boolean;
      nil: null;
    };
    expect(out.bytes).toBe(ta);
    expect(out.n).toBe(1);
    expect(out.s).toBe('x');
    expect(out.b).toBe(true);
    expect(out.nil).toBe(null);
  });

  it('is bounded by a cycle guard (no infinite loop on self-referential objects)', () => {
    const h = makeHandler();
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic.self = cyclic;
    // Must return without hanging / throwing.
    const out = h.deepExtractSchematicHandles(cyclic) as Record<string, unknown>;
    expect(out.a).toBe(1);
  });
});

describe('client: WorkerClient.resolveSchematicHandles (recursive)', () => {
  function makeClient(): WorkerClient {
    // No real worker needed — we only exercise the pure deep-resolver with an
    // injected resolver, so construct with a stub worker object.
    const stub = {
      postMessage: () => {},
      terminate: () => {},
      onmessage: null,
      onerror: null,
      onmessageerror: null,
    } as unknown as Worker;
    return new WorkerClient({ worker: stub });
  }

  it('deep-resolves every nested { _schematicHandle } ref via the resolver', async () => {
    const client = makeClient();
    const resolver = vi.fn(async (id: string) => ({ resolved: id, format: 'schem' }));

    const input = {
      __outputs: { a: { _schematicHandle: 'h1' }, list: [{ _schematicHandle: 'h2' }, 7] },
      __trace: { n: { value: { _schematicHandle: 'h3' }, ms: 2, status: 'ok' } },
    };

    const out = (await client.resolveSchematicHandles(input, resolver)) as {
      __outputs: { a: { resolved: string }; list: [{ resolved: string }, number] };
      __trace: { n: { value: { resolved: string } } };
    };

    expect(out.__outputs.a).toEqual({ resolved: 'h1', format: 'schem' });
    expect(out.__outputs.list[0]).toEqual({ resolved: 'h2', format: 'schem' });
    expect(out.__outputs.list[1]).toBe(7);
    expect(out.__trace.n.value).toEqual({ resolved: 'h3', format: 'schem' });
    expect(resolver).toHaveBeenCalledTimes(3);
  });

  it('leaves plain values and typed arrays untouched, never throws on cycles', async () => {
    const client = makeClient();
    const resolver = vi.fn(async (id: string) => ({ resolved: id }));
    const ta = new Uint8Array([1, 2]);
    const cyclic: Record<string, unknown> = { keep: 'x', bytes: ta };
    cyclic.self = cyclic;

    const out = (await client.resolveSchematicHandles(cyclic, resolver)) as Record<string, unknown>;
    expect(out.keep).toBe('x');
    expect(out.bytes).toBe(ta);
    expect(resolver).not.toHaveBeenCalled();
  });
});

describe('worker ↔ client round-trip via the real data store', () => {
  it('extracted refs resolve back to the original objects through getData semantics', async () => {
    const h = makeHandler();
    const schem = mockSchematic('round-trip');
    const extracted = h.deepExtractSchematicHandles({ out: { s: schem } }) as {
      out: { s: { _schematicHandle: string } };
    };
    const id = extracted.out.s._schematicHandle;

    // Simulate the client resolving via getData (workerDataStore.get is what the
    // GET_DATA handler reads).
    const client = (() => {
      const stub = { postMessage: () => {}, terminate: () => {} } as unknown as Worker;
      return new WorkerClient({ worker: stub });
    })();
    const resolved = await client.resolveSchematicHandles(extracted, async (hid) =>
      workerDataStore.get(hid)
    );
    expect((resolved as { out: { s: unknown } }).out.s).toBe(schem);
    expect((resolved as { out: { s: unknown } }).out.s).not.toHaveProperty('_schematicHandle');
    expect(id).toBeTypeOf('string');
  });
});
