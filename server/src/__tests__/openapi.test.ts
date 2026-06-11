import { describe, it, expect } from 'vitest';
import { extractFlowInputs, extractFlowOutputs, generateSlug } from '../services/openapi.js';
import type { FlowData, NodeData } from '@flow/core';

// ---------------------------------------------------------------------------
// Helpers to build minimal FlowData fixtures
// ---------------------------------------------------------------------------

function makeFlow(nodes: NodeData[]): FlowData {
  return {
    id: 'test-flow',
    name: 'Test Flow',
    version: '1.0.0',
    nodes,
    edges: [],
    createdAt: Date.now(),
  };
}

function makeNode(overrides: Partial<NodeData> & Pick<NodeData, 'id' | 'type'>): NodeData {
  return {
    position: { x: 0, y: 0 },
    data: {},
    ...overrides,
  } as NodeData;
}

// ---------------------------------------------------------------------------
// extractFlowInputs
// ---------------------------------------------------------------------------

describe('extractFlowInputs', () => {
  it('extracts a number_input node', () => {
    const flow = makeFlow([
      makeNode({
        id: 'n1',
        type: 'number_input',
        data: { label: 'Count', value: 5, config: { min: 0, max: 100, step: 1, description: 'How many' } },
      }),
    ]);

    const inputs = extractFlowInputs(flow);
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toMatchObject({
      name: 'Count',
      type: 'number',
      default: 5,
      min: 0,
      max: 100,
      step: 1,
      description: 'How many',
      nodeId: 'n1',
    });
  });

  it('extracts a text_input node', () => {
    const flow = makeFlow([
      makeNode({
        id: 't1',
        type: 'text_input',
        data: { label: 'Name', value: 'hello', config: {} },
      }),
    ]);

    const inputs = extractFlowInputs(flow);
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toMatchObject({
      name: 'Name',
      type: 'string',
      default: 'hello',
      nodeId: 't1',
    });
  });

  it('extracts a boolean_input node with default false', () => {
    const flow = makeFlow([
      makeNode({
        id: 'b1',
        type: 'boolean_input',
        data: { label: 'Enabled', config: {} },
      }),
    ]);

    const inputs = extractFlowInputs(flow);
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toMatchObject({
      name: 'Enabled',
      type: 'boolean',
      required: false,
      default: false,
      nodeId: 'b1',
    });
  });

  it('extracts a select_input node with options', () => {
    const flow = makeFlow([
      makeNode({
        id: 's1',
        type: 'select_input',
        data: { label: 'Mode', value: 'fast', config: { options: ['fast', 'slow'] } },
      }),
    ]);

    const inputs = extractFlowInputs(flow);
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toMatchObject({
      name: 'Mode',
      type: 'string',
      default: 'fast',
      options: ['fast', 'slow'],
      nodeId: 's1',
    });
  });

  it('extracts a generic input node, inferring type from config.dataType', () => {
    const flow = makeFlow([
      makeNode({
        id: 'g1',
        type: 'input',
        data: { label: 'Generic', config: { dataType: 'number' } },
      }),
    ]);

    const inputs = extractFlowInputs(flow);
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toMatchObject({
      name: 'Generic',
      type: 'number',
      nodeId: 'g1',
    });
  });

  it('infers type "any" for a generic input with no hints', () => {
    const flow = makeFlow([
      makeNode({
        id: 'g2',
        type: 'input',
        data: { config: {} },
      }),
    ]);

    const inputs = extractFlowInputs(flow);
    expect(inputs).toHaveLength(1);
    expect(inputs[0]!.type).toBe('any');
    // label falls back to node id
    expect(inputs[0]!.name).toBe('g2');
  });

  it('extracts file_input as string type', () => {
    const flow = makeFlow([
      makeNode({
        id: 'f1',
        type: 'file_input',
        data: { label: 'Upload', config: {} },
      }),
    ]);

    const inputs = extractFlowInputs(flow);
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toMatchObject({
      name: 'Upload',
      type: 'string',
      required: true,
      nodeId: 'f1',
    });
  });

  it('extracts schematic_input as string type', () => {
    const flow = makeFlow([
      makeNode({
        id: 'si1',
        type: 'schematic_input',
        data: { label: 'Schematic', config: {} },
      }),
    ]);

    const inputs = extractFlowInputs(flow);
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toMatchObject({
      name: 'Schematic',
      type: 'string',
      required: true,
      nodeId: 'si1',
    });
  });

  it('skips nodes with isConstant flag', () => {
    const flow = makeFlow([
      makeNode({
        id: 'c1',
        type: 'number_input',
        data: { label: 'Hidden', value: 42, config: { isConstant: true } },
      }),
      makeNode({
        id: 'c2',
        type: 'text_input',
        data: { label: 'Visible', value: 'hi', config: {} },
      }),
    ]);

    const inputs = extractFlowInputs(flow);
    expect(inputs).toHaveLength(1);
    expect(inputs[0]!.name).toBe('Visible');
  });

  it('skips non-input node types', () => {
    const flow = makeFlow([
      makeNode({ id: 'code1', type: 'code', data: { label: 'Script', config: {} } }),
      makeNode({ id: 'v1', type: 'viewer', data: { label: 'Preview', config: {} } }),
      makeNode({ id: 'o1', type: 'output', data: { label: 'Result', config: {} } }),
    ]);

    const inputs = extractFlowInputs(flow);
    expect(inputs).toHaveLength(0);
  });

  it('uses node id as name when label is missing', () => {
    const flow = makeFlow([
      makeNode({
        id: 'node-abc',
        type: 'text_input',
        data: { config: {} },
      }),
    ]);

    const inputs = extractFlowInputs(flow);
    expect(inputs[0]!.name).toBe('node-abc');
  });

  it('extracts multiple inputs in order', () => {
    const flow = makeFlow([
      makeNode({ id: 'a', type: 'number_input', data: { label: 'A', value: 1, config: {} } }),
      makeNode({ id: 'b', type: 'text_input', data: { label: 'B', value: 'x', config: {} } }),
      makeNode({ id: 'c', type: 'boolean_input', data: { label: 'C', config: {} } }),
    ]);

    const inputs = extractFlowInputs(flow);
    expect(inputs).toHaveLength(3);
    expect(inputs.map((i) => i.name)).toEqual(['A', 'B', 'C']);
  });

  it('marks number_input as required when no default property in config', () => {
    const flow = makeFlow([
      makeNode({
        id: 'r1',
        type: 'number_input',
        data: { label: 'Required', config: {} },
      }),
    ]);

    const inputs = extractFlowInputs(flow);
    expect(inputs[0]!.required).toBe(true);
  });

  it('marks number_input as not required when config has default', () => {
    const flow = makeFlow([
      makeNode({
        id: 'r2',
        type: 'number_input',
        data: { label: 'Optional', value: 10, config: { default: 10 } },
      }),
    ]);

    const inputs = extractFlowInputs(flow);
    expect(inputs[0]!.required).toBe(false);
  });

  it('returns empty array for a flow with no nodes', () => {
    const flow = makeFlow([]);
    expect(extractFlowInputs(flow)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// extractFlowOutputs
// ---------------------------------------------------------------------------

describe('extractFlowOutputs', () => {
  it('extracts a schematic_output node', () => {
    const flow = makeFlow([
      makeNode({
        id: 'so1',
        type: 'schematic_output',
        data: { label: 'Result Schematic', config: {} },
      }),
    ]);

    const outputs = extractFlowOutputs(flow);
    expect(outputs).toHaveLength(1);
    expect(outputs[0]).toMatchObject({
      name: 'Result Schematic',
      type: 'schematic',
      nodeId: 'so1',
    });
  });

  it('extracts a file_output node', () => {
    const flow = makeFlow([
      makeNode({
        id: 'fo1',
        type: 'file_output',
        data: { label: 'Export File', config: {} },
      }),
    ]);

    const outputs = extractFlowOutputs(flow);
    expect(outputs).toHaveLength(1);
    expect(outputs[0]).toMatchObject({
      name: 'Export File',
      type: 'file',
      nodeId: 'fo1',
    });
  });

  it('extracts a generic output node using io definition type', () => {
    const flow = makeFlow([
      makeNode({
        id: 'o1',
        type: 'output',
        data: {
          label: 'My Output',
          io: {
            inputs: {},
            outputs: { result: { type: 'number' } },
          },
          config: {},
        },
      }),
    ]);

    const outputs = extractFlowOutputs(flow);
    expect(outputs).toHaveLength(1);
    expect(outputs[0]).toMatchObject({
      name: 'My Output',
      type: 'number',
      nodeId: 'o1',
    });
  });

  it('falls back to "any" when output node has no io definition', () => {
    const flow = makeFlow([
      makeNode({
        id: 'o2',
        type: 'output',
        data: { label: 'Unknown', config: {} },
      }),
    ]);

    const outputs = extractFlowOutputs(flow);
    expect(outputs[0]!.type).toBe('any');
  });

  it('extracts viewer node with passthrough as output', () => {
    const flow = makeFlow([
      makeNode({
        id: 'v1',
        type: 'viewer',
        data: { label: 'Preview', config: { passthrough: true } },
      }),
    ]);

    const outputs = extractFlowOutputs(flow);
    expect(outputs).toHaveLength(1);
    expect(outputs[0]).toMatchObject({
      name: 'Preview',
      type: 'any',
      nodeId: 'v1',
    });
  });

  it('does NOT extract viewer node without passthrough', () => {
    const flow = makeFlow([
      makeNode({
        id: 'v2',
        type: 'viewer',
        data: { label: 'View Only', config: {} },
      }),
    ]);

    const outputs = extractFlowOutputs(flow);
    // Should return default result since no explicit output found
    expect(outputs).toHaveLength(1);
    expect(outputs[0]!.nodeId).toBe('default');
  });

  it('returns a default "result" output when no output nodes exist', () => {
    const flow = makeFlow([
      makeNode({ id: 'code1', type: 'code', data: { config: {} } }),
    ]);

    const outputs = extractFlowOutputs(flow);
    expect(outputs).toHaveLength(1);
    expect(outputs[0]).toMatchObject({
      name: 'result',
      type: 'object',
      nodeId: 'default',
    });
  });

  it('extracts multiple output nodes', () => {
    const flow = makeFlow([
      makeNode({ id: 'o1', type: 'output', data: { label: 'A', config: {} } }),
      makeNode({ id: 'o2', type: 'schematic_output', data: { label: 'B', config: {} } }),
      makeNode({ id: 'o3', type: 'file_output', data: { label: 'C', config: {} } }),
    ]);

    const outputs = extractFlowOutputs(flow);
    expect(outputs).toHaveLength(3);
    expect(outputs.map((o) => o.name)).toEqual(['A', 'B', 'C']);
  });

  it('uses node id as name when label is absent', () => {
    const flow = makeFlow([
      makeNode({ id: 'output-xyz', type: 'output', data: { config: {} } }),
    ]);

    const outputs = extractFlowOutputs(flow);
    expect(outputs[0]!.name).toBe('output-xyz');
  });

  it('includes description from config', () => {
    const flow = makeFlow([
      makeNode({
        id: 'o1',
        type: 'output',
        data: { label: 'Described', config: { description: 'Important result' } },
      }),
    ]);

    const outputs = extractFlowOutputs(flow);
    expect(outputs[0]!.description).toBe('Important result');
  });
});

// ---------------------------------------------------------------------------
// generateSlug
// ---------------------------------------------------------------------------

describe('generateSlug', () => {
  it('converts "My Flow" to "my-flow"', () => {
    expect(generateSlug('My Flow')).toBe('my-flow');
  });

  it('converts "Hello World 123" to "hello-world-123"', () => {
    expect(generateSlug('Hello World 123')).toBe('hello-world-123');
  });

  it('strips leading and trailing dashes from "---test---"', () => {
    expect(generateSlug('---test---')).toBe('test');
  });

  it('truncates to 64 characters', () => {
    const long = 'a'.repeat(100);
    const slug = generateSlug(long);
    expect(slug.length).toBe(64);
    expect(slug).toBe('a'.repeat(64));
  });

  it('handles special characters: "Special @#$ chars!" -> "special-chars"', () => {
    expect(generateSlug('Special @#$ chars!')).toBe('special-chars');
  });

  it('returns empty string for empty input', () => {
    expect(generateSlug('')).toBe('');
  });

  it('collapses multiple non-alphanumeric characters into a single dash', () => {
    expect(generateSlug('a   b')).toBe('a-b');
    expect(generateSlug('a---b')).toBe('a-b');
  });

  it('handles purely special-character input', () => {
    expect(generateSlug('@#$%^&')).toBe('');
  });

  it('handles mixed case and numbers', () => {
    expect(generateSlug('CamelCase42Name')).toBe('camelcase42name');
  });

  it('truncates after slug transformation', () => {
    // 60 chars of valid slug + some trailing special chars that become dashes then get stripped
    const input = 'a'.repeat(60) + ' ' + 'b'.repeat(60);
    const slug = generateSlug(input);
    expect(slug.length).toBeLessThanOrEqual(64);
  });
});
