import { describe, it, expect } from 'vitest';
import { compileBlock, compileFlow } from '@flow/core';
import {
  define,
  parseNumber,
  pack,
  packBytes,
  stripComments,
  normalizeLines,
  tokenizeLines,
  LabelTable,
  romData,
  romString,
  romLayout,
  romLayoutData,
} from '@flow/core';
import { EXAMPLE_FLOWS, SHOWCASE_FLOW } from './exampleFlows';
import { parseBlockSource } from './block/parser';

/**
 * Compile a flow then EXECUTE its folded source through a bare eval shim.
 * `extraCtx` lets a flow that uses a runtime endowment (e.g. the `Asm`/`Rom`
 * providers) run hermetically with a faithful pure-JS stub.
 */
async function runFolded(
  flow: Parameters<typeof compileFlow>[0],
  extraCtx: Record<string, unknown> = {}
) {
  const folded = compileFlow(flow);
  const ctx = { Progress: { report: () => {} }, ...extraCtx } as Record<string, unknown>;
  const compiled = compileBlock(folded.source, { contextKeys: Object.keys(ctx) });
  const fn = (0, eval)(compiled.functionCode) as (
    i: Record<string, unknown>,
    c: Record<string, unknown>
  ) => Promise<Record<string, unknown>>;
  return { folded, result: await fn({}, ctx) };
}

// ── ASM → ROM Studio showcase: folds AND executes the pure data outputs ──────
describe('SHOWCASE_FLOW (ASM → ROM Studio) folds and runs the meta-node pipeline', () => {
  // Endow the real Asm/Rom providers from core so the assembler + ROM
  // serialiser run faithfully. The rom-schematic block reaches for the WASM
  // `Schematic` global, which a node test can't supply — stub it so the flow
  // executes end-to-end while we assert only the deterministic PURE outputs.
  const Asm = { define, parseNumber, stripComments, normalizeLines, tokenizeLines, LabelTable, pack, packBytes };
  const Rom = {
    data: (b: number[], o?: Parameters<typeof romData>[1]) => romData(b, o),
    string: (b: number[], o?: Parameters<typeof romString>[1]) => romString(b, o),
    layout: (b: number[], o: Parameters<typeof romLayout>[1]) => romLayout(b, o),
    layoutData: (d: string, o: Parameters<typeof romLayoutData>[1]) => romLayoutData(d, o),
  };
  class SchematicStub {
    set_block() {}
  }

  it('folds with Constant/Switch/Bundle/Unbundle/Group/Map/Reroute/Inspect markers', () => {
    const folded = compileFlow(SHOWCASE_FLOW);
    // Every meta-node leaves a marker in the folded source.
    expect(folded.source).toContain('__sw_'); // Switch (base 16 vs 2)
    expect(folded.source).toContain('__bundle_'); // Bundle config
    expect(folded.source).toContain('__unbundle_'); // Unbundle inside the Group
    expect(folded.source).toContain('__group_'); // Group "ROM Layout"
    expect(folded.source).toContain('__map_'); // Map hex-per-byte
    // Pure data outputs are typed; the schematic preview is a schematic edge.
    expect(folded.contract.outputs.romData?.kind).toBe('string');
    expect(folded.contract.outputs.hexBytes?.kind).toBe('list');
    expect(folded.contract.outputs.romPreview?.kind).toBe('schematic');
  });

  it('executes the assembler → ROM pipeline and produces the expected pure data', async () => {
    const { result } = await runFolded(SHOWCASE_FLOW, {
      Asm,
      Rom,
      Schematic: SchematicStub,
    });

    // The verified ARPU fibonacci program assembles to 16 machine-code bytes.
    const EXPECTED_HEX = ['0a', '00', '1a', '01', '2a', '06', '40', '0d', '4f', '5d', 'a4', 'ce', '06', '08', '0e', '0e'];
    // Map: each byte → two-char hex string (16 words).
    expect(result.hexBytes).toEqual(EXPECTED_HEX);
    expect((result.hexBytes as unknown[]).length).toBe(16);

    // Switch selects base 16 (selector=0) → rom-data emits a 2-digit-per-byte
    // hex digit string; Inspect leaves it untouched on the way to romData.
    expect(result.romData).toBe('0A001A012A06400D4F5DA4CE06080E0E');

    // rom-schematic ran through the WASM stub without throwing; we do NOT assert
    // its value (it needs the real Schematic kernel), only that it's present.
    expect(result).toHaveProperty('romPreview');
  });

  it('the program selector Switch picks a different program (selector=2 → arithmetic)', async () => {
    // Clone the showcase with the program selector set to case 2 (the small
    // arithmetic program) instead of the default fibonacci (case 0). The Switch
    // output should now feed the assembler a DIFFERENT program → different bytes.
    const flow = {
      ...SHOWCASE_FLOW,
      nodes: SHOWCASE_FLOW.nodes.map((n) =>
        n.id === 'c-prog-sel' ? { ...n, data: { ...n.data, value: 2 } } : n
      ),
    };

    const { result } = await runFolded(flow, { Asm, Rom, Schematic: SchematicStub });

    // The arithmetic program assembles to 10 bytes (verified against Asm.define).
    const ARITH_HEX = ['0a', '07', '1a', '03', '40', '1f', '40', '08', '0e', '08'];
    expect(result.hexBytes).toEqual(ARITH_HEX);
    expect((result.hexBytes as unknown[]).length).toBe(10);
    // And the ROM digit string differs from the fibonacci case.
    expect(result.romData).toBe('0A071A0340 1F40080E08'.replace(/ /g, ''));
  });
});

describe('EXAMPLE_FLOWS', () => {
  it('lists the built-in flows', () => {
    expect(EXAMPLE_FLOWS.map((f) => f.id)).toEqual([
      'example-julia-stitch',
      'example-worldgen',
      'example-asm-rom-studio',
    ]);
  });

  for (const flow of EXAMPLE_FLOWS) {
    describe(flow.name, () => {
      const codeNodes = flow.nodes.filter((n) => n.type === 'code');

      it('has unique node and edge ids, and edges reference real nodes/ports', () => {
        const nodeIds = new Set(flow.nodes.map((n) => n.id));
        expect(nodeIds.size).toBe(flow.nodes.length);
        expect(new Set(flow.edges.map((e) => e.id)).size).toBe(flow.edges.length);

        for (const edge of flow.edges) {
          expect(nodeIds.has(edge.source)).toBe(true);
          expect(nodeIds.has(edge.target)).toBe(true);
          const target = flow.nodes.find((n) => n.id === edge.target)!;
          if (target.type === 'code') {
            expect(Object.keys(target.data.contract!.inputs)).toContain(edge.targetHandle);
          }
          const source = flow.nodes.find((n) => n.id === edge.source)!;
          if (source.type === 'code') {
            expect(Object.keys(source.data.contract!.outputs)).toContain(edge.sourceHandle);
          }
        }
      });

      for (const node of codeNodes) {
        describe(`node ${node.data.label}`, () => {
          it('compiles with the core pipeline', () => {
            expect(() => compileBlock(node.data.code!)).not.toThrow();
          });

          it('embedded contract matches what the parser derives from the source', async () => {
            const parsed = await parseBlockSource(node.data.code!);
            expect(parsed.warnings).toEqual([]);
            expect(parsed.contract).toEqual(node.data.contract);
          });
        });
      }
    });
  }
});
