import { describe, it, expect } from 'vitest';
import {
  isSchematicData,
  isImageData,
  isTabularData,
  isCodeNode,
  isInputNode,
  isSchematicNode,
  isFileNode,
  isSubflowNode,
  extractSubflowConfig,
  getDataCategory,
  getExtensionForFormat,
  detectFormatFromExtension,
  type NodeData,
  type FlowData,
} from '../types/index';

// Helper to create a minimal NodeData
function makeNode(overrides: Partial<NodeData> & { type: NodeData['type'] }): NodeData {
  return {
    id: overrides.id ?? 'node-1',
    type: overrides.type,
    position: overrides.position ?? { x: 0, y: 0 },
    data: overrides.data ?? {},
  };
}

describe('isSchematicData', () => {
  it('returns true for valid schematic data with Uint8Array', () => {
    expect(isSchematicData({ format: 'schem', data: new Uint8Array([1, 2]) })).toBe(true);
    expect(isSchematicData({ format: 'litematic', data: new Uint8Array([]) })).toBe(true);
    expect(isSchematicData({ format: 'schematic', data: new Uint8Array([1]) })).toBe(true);
    expect(isSchematicData({ format: 'nbt', data: new Uint8Array([1]) })).toBe(true);
    expect(isSchematicData({ format: 'mock', data: new Uint8Array([1]) })).toBe(true);
  });

  it('returns true for valid schematic data with string', () => {
    expect(isSchematicData({ format: 'schem', data: 'base64data' })).toBe(true);
  });

  it('returns false for invalid format', () => {
    expect(isSchematicData({ format: 'png', data: new Uint8Array([1]) })).toBe(false);
    expect(isSchematicData({ format: 'csv', data: 'data' })).toBe(false);
  });

  it('returns false for null, undefined, and non-objects', () => {
    expect(isSchematicData(null)).toBe(false);
    expect(isSchematicData(undefined)).toBe(false);
    expect(isSchematicData('string')).toBe(false);
    expect(isSchematicData(42)).toBe(false);
  });

  it('returns false for objects missing required properties', () => {
    expect(isSchematicData({ format: 'schem' })).toBe(false);
    expect(isSchematicData({ data: new Uint8Array([1]) })).toBe(false);
    expect(isSchematicData({})).toBe(false);
  });

  it('returns false when data is not binary or string', () => {
    expect(isSchematicData({ format: 'schem', data: 42 })).toBe(false);
    expect(isSchematicData({ format: 'schem', data: null })).toBe(false);
    expect(isSchematicData({ format: 'schem', data: true })).toBe(false);
  });
});

describe('isImageData', () => {
  it('returns true for valid image data', () => {
    expect(isImageData({ format: 'png', data: 'base64...' })).toBe(true);
    expect(isImageData({ format: 'jpg', data: new Uint8Array([1]) })).toBe(true);
    expect(isImageData({ format: 'jpeg', data: 'data' })).toBe(true);
    expect(isImageData({ format: 'gif', data: 'data' })).toBe(true);
    expect(isImageData({ format: 'webp', data: 'data' })).toBe(true);
    expect(isImageData({ format: 'svg', data: '<svg></svg>' })).toBe(true);
  });

  it('returns false for non-image formats', () => {
    expect(isImageData({ format: 'schem', data: new Uint8Array([1]) })).toBe(false);
    expect(isImageData({ format: 'csv', data: 'data' })).toBe(false);
  });

  it('returns false for null, undefined, and non-objects', () => {
    expect(isImageData(null)).toBe(false);
    expect(isImageData(undefined)).toBe(false);
    expect(isImageData('string')).toBe(false);
  });

  it('returns false for objects missing required properties', () => {
    expect(isImageData({ format: 'png' })).toBe(false);
    expect(isImageData({ data: 'base64' })).toBe(false);
  });
});

describe('isTabularData', () => {
  it('returns true for valid tabular data', () => {
    expect(isTabularData({ format: 'csv', data: 'a,b,c' })).toBe(true);
    expect(isTabularData({ format: 'json', data: '{"key":"val"}' })).toBe(true);
    expect(isTabularData({ format: 'xml', data: '<root/>' })).toBe(true);
    expect(isTabularData({ format: 'yaml', data: 'key: val' })).toBe(true);
  });

  it('returns false for non-tabular formats', () => {
    expect(isTabularData({ format: 'png', data: 'data' })).toBe(false);
    expect(isTabularData({ format: 'schem', data: new Uint8Array([1]) })).toBe(false);
  });

  it('returns false for null, undefined, and non-objects', () => {
    expect(isTabularData(null)).toBe(false);
    expect(isTabularData(undefined)).toBe(false);
    expect(isTabularData(123)).toBe(false);
  });

  it('returns false for objects missing required properties', () => {
    expect(isTabularData({ format: 'csv' })).toBe(false);
    expect(isTabularData({ data: 'something' })).toBe(false);
  });
});

describe('isCodeNode', () => {
  it('returns true for code nodes', () => {
    expect(isCodeNode(makeNode({ type: 'code' }))).toBe(true);
  });

  it('returns false for non-code nodes', () => {
    expect(isCodeNode(makeNode({ type: 'viewer' }))).toBe(false);
    expect(isCodeNode(makeNode({ type: 'number_input' }))).toBe(false);
    expect(isCodeNode(makeNode({ type: 'subflow' }))).toBe(false);
  });
});

describe('isInputNode', () => {
  it('returns true for input-type nodes', () => {
    expect(isInputNode(makeNode({ type: 'static_input' }))).toBe(true);
    expect(isInputNode(makeNode({ type: 'number_input' }))).toBe(true);
    expect(isInputNode(makeNode({ type: 'text_input' }))).toBe(true);
    expect(isInputNode(makeNode({ type: 'boolean_input' }))).toBe(true);
    expect(isInputNode(makeNode({ type: 'select_input' }))).toBe(true);
    expect(isInputNode(makeNode({ type: 'input' }))).toBe(true);
    expect(isInputNode(makeNode({ type: 'file_input' }))).toBe(true);
  });

  it('returns false for non-input nodes', () => {
    expect(isInputNode(makeNode({ type: 'code' }))).toBe(false);
    expect(isInputNode(makeNode({ type: 'viewer' }))).toBe(false);
    expect(isInputNode(makeNode({ type: 'subflow' }))).toBe(false);
  });
});

describe('isSchematicNode', () => {
  it('returns true for schematic-prefixed nodes', () => {
    expect(isSchematicNode(makeNode({ type: 'schematic_input' }))).toBe(true);
    expect(isSchematicNode(makeNode({ type: 'schematic_output' }))).toBe(true);
    expect(isSchematicNode(makeNode({ type: 'schematic_viewer' }))).toBe(true);
  });

  it('returns false for non-schematic nodes', () => {
    expect(isSchematicNode(makeNode({ type: 'code' }))).toBe(false);
    expect(isSchematicNode(makeNode({ type: 'file_input' }))).toBe(false);
  });
});

describe('isFileNode', () => {
  it('returns true for file_input and file_output', () => {
    expect(isFileNode(makeNode({ type: 'file_input' }))).toBe(true);
    expect(isFileNode(makeNode({ type: 'file_output' }))).toBe(true);
  });

  it('returns false for non-file nodes', () => {
    expect(isFileNode(makeNode({ type: 'code' }))).toBe(false);
    expect(isFileNode(makeNode({ type: 'schematic_input' }))).toBe(false);
    expect(isFileNode(makeNode({ type: 'viewer' }))).toBe(false);
  });
});

describe('isSubflowNode', () => {
  it('returns true for subflow nodes', () => {
    expect(isSubflowNode(makeNode({ type: 'subflow' }))).toBe(true);
  });

  it('returns false for non-subflow nodes', () => {
    expect(isSubflowNode(makeNode({ type: 'code' }))).toBe(false);
    expect(isSubflowNode(makeNode({ type: 'file_input' }))).toBe(false);
  });
});

describe('extractSubflowConfig', () => {
  function makeFlow(nodes: NodeData[], edges: any[] = []): FlowData {
    return {
      id: 'flow-1',
      name: 'Test Flow',
      version: '1.0.0',
      nodes,
      edges,
      createdAt: Date.now(),
    };
  }

  it('extracts config from a flow with input and output nodes', () => {
    const flow = makeFlow([
      makeNode({ id: 'in-1', type: 'number_input', data: { label: 'Width', value: 10 } }),
      makeNode({ id: 'in-2', type: 'text_input', data: { label: 'Name' } }),
      makeNode({ id: 'code-1', type: 'code', data: { label: 'Process' } }),
      makeNode({ id: 'out-1', type: 'output', data: { label: 'Result' } }),
    ]);

    const result = extractSubflowConfig(flow);
    expect(result.valid).toBe(true);
    expect(result.config).toBeDefined();
    expect(result.config!.nodeName).toBe('Test Flow');
    expect(result.config!.inputs).toHaveLength(2);
    expect(result.config!.outputs).toHaveLength(1);
    expect(result.inputNodes).toHaveLength(2);
    expect(result.outputNodes).toHaveLength(1);
  });

  it('infers port types from node types', () => {
    const flow = makeFlow([
      makeNode({ id: 'in-1', type: 'number_input', data: { label: 'Num' } }),
      makeNode({ id: 'in-2', type: 'text_input', data: { label: 'Text' } }),
      makeNode({ id: 'in-3', type: 'boolean_input', data: { label: 'Flag' } }),
      makeNode({ id: 'in-4', type: 'file_input', data: { label: 'File' } }),
      makeNode({ id: 'out-1', type: 'output', data: { label: 'Out' } }),
    ]);

    const result = extractSubflowConfig(flow);
    expect(result.valid).toBe(true);
    const types = result.config!.inputs.map(i => i.type);
    expect(types).toEqual(['number', 'string', 'boolean', 'file']);
  });

  it('returns invalid when no input nodes exist', () => {
    const flow = makeFlow([
      makeNode({ id: 'code-1', type: 'code', data: { label: 'Process' } }),
      makeNode({ id: 'out-1', type: 'output', data: { label: 'Result' } }),
    ]);

    const result = extractSubflowConfig(flow);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('input');
  });

  it('returns invalid when no output nodes exist', () => {
    const flow = makeFlow([
      makeNode({ id: 'in-1', type: 'number_input', data: { label: 'Width' } }),
      makeNode({ id: 'code-1', type: 'code', data: { label: 'Process' } }),
    ]);

    const result = extractSubflowConfig(flow);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('output');
  });

  it('recognizes file_output as an output node', () => {
    const flow = makeFlow([
      makeNode({ id: 'in-1', type: 'number_input', data: { label: 'Width' } }),
      makeNode({ id: 'out-1', type: 'file_output', data: { label: 'Export' } }),
    ]);

    const result = extractSubflowConfig(flow);
    expect(result.valid).toBe(true);
    expect(result.config!.outputs).toHaveLength(1);
  });

  it('recognizes viewer with passthrough as an output node', () => {
    const flow = makeFlow([
      makeNode({ id: 'in-1', type: 'number_input', data: { label: 'Width' } }),
      makeNode({ id: 'view-1', type: 'viewer', data: { label: 'Preview', config: { passthrough: true } } }),
    ]);

    const result = extractSubflowConfig(flow);
    expect(result.valid).toBe(true);
    expect(result.config!.outputs).toHaveLength(1);
  });

  it('does not count viewer without passthrough as output', () => {
    const flow = makeFlow([
      makeNode({ id: 'in-1', type: 'number_input', data: { label: 'Width' } }),
      makeNode({ id: 'view-1', type: 'viewer', data: { label: 'Preview' } }),
    ]);

    const result = extractSubflowConfig(flow);
    expect(result.valid).toBe(false);
  });

  it('uses the first tag as category', () => {
    const flow: FlowData = {
      id: 'flow-1',
      name: 'Test Flow',
      version: '1.0.0',
      nodes: [
        makeNode({ id: 'in-1', type: 'number_input', data: { label: 'Width' } }),
        makeNode({ id: 'out-1', type: 'output', data: { label: 'Out' } }),
      ],
      edges: [],
      createdAt: Date.now(),
      metadata: { tags: ['Generators', 'Terrain'] },
    };

    const result = extractSubflowConfig(flow);
    expect(result.config!.category).toBe('Generators');
  });

  it('defaults category to Custom when no tags', () => {
    const flow = makeFlow([
      makeNode({ id: 'in-1', type: 'number_input', data: { label: 'Width' } }),
      makeNode({ id: 'out-1', type: 'output', data: { label: 'Out' } }),
    ]);

    const result = extractSubflowConfig(flow);
    expect(result.config!.category).toBe('Custom');
  });
});

describe('getDataCategory', () => {
  it('classifies schematic formats', () => {
    expect(getDataCategory('schem')).toBe('schematic');
    expect(getDataCategory('litematic')).toBe('schematic');
    expect(getDataCategory('schematic')).toBe('schematic');
    expect(getDataCategory('nbt')).toBe('schematic');
    expect(getDataCategory('mock')).toBe('schematic');
  });

  it('classifies image formats', () => {
    expect(getDataCategory('png')).toBe('image');
    expect(getDataCategory('jpg')).toBe('image');
    expect(getDataCategory('svg')).toBe('image');
  });

  it('classifies data formats', () => {
    expect(getDataCategory('csv')).toBe('data');
    expect(getDataCategory('json')).toBe('data');
    expect(getDataCategory('xml')).toBe('data');
    expect(getDataCategory('yaml')).toBe('data');
  });

  it('classifies text formats', () => {
    expect(getDataCategory('text')).toBe('text');
    expect(getDataCategory('markdown')).toBe('text');
  });

  it('classifies unknown/binary as binary', () => {
    expect(getDataCategory('binary')).toBe('binary');
    expect(getDataCategory('unknown')).toBe('binary');
  });
});

describe('getExtensionForFormat', () => {
  it('returns correct extensions', () => {
    expect(getExtensionForFormat('schem')).toBe('.schem');
    expect(getExtensionForFormat('png')).toBe('.png');
    expect(getExtensionForFormat('csv')).toBe('.csv');
    expect(getExtensionForFormat('text')).toBe('.txt');
    expect(getExtensionForFormat('markdown')).toBe('.md');
    expect(getExtensionForFormat('unknown')).toBe('');
  });
});

describe('detectFormatFromExtension', () => {
  it('detects schematic formats', () => {
    expect(detectFormatFromExtension('build.schem')).toBe('schem');
    expect(detectFormatFromExtension('world.litematic')).toBe('litematic');
  });

  it('detects image formats', () => {
    expect(detectFormatFromExtension('photo.png')).toBe('png');
    expect(detectFormatFromExtension('photo.jpg')).toBe('jpg');
  });

  it('detects data formats', () => {
    expect(detectFormatFromExtension('data.csv')).toBe('csv');
    expect(detectFormatFromExtension('config.yaml')).toBe('yaml');
    expect(detectFormatFromExtension('config.yml')).toBe('yaml');
  });

  it('returns unknown for unrecognized extensions', () => {
    expect(detectFormatFromExtension('file.xyz')).toBe('unknown');
    expect(detectFormatFromExtension('noext')).toBe('unknown');
  });

  it('is case insensitive', () => {
    expect(detectFormatFromExtension('FILE.PNG')).toBe('png');
    expect(detectFormatFromExtension('data.CSV')).toBe('csv');
  });
});
