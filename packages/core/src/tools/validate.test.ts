import { expect, it } from 'vitest';
import { validateToolInputs } from './validate';
import image from '../../../../tools/image-to-schematic.json';
import sdf from '../../../../tools/sdf-playground.json';

it('normalizes multipart numeric and boolean fields before graph execution', () => {
  expect(validateToolInputs(image, { file: new Uint8Array(1), width: '8', dither: '0' })).toMatchObject({ width: 8, dither: false });
});
it('rejects non-finite or oversized values independently of the form widget', () => {
  expect(() => validateToolInputs(image, { width: 'Infinity', file: new Uint8Array(1) })).toThrow('allowed range');
  expect(() => validateToolInputs(sdf, { radius: 100000 })).toThrow('allowed range');
});

it('checks visibility against defaults even when the dependency follows the field', () => {
  const graph = { nodes: [
    { id: 'light', type: 'input', data: { label: 'light', value: 100, fieldType: { kind: 'number', max: 1 }, toolField: { when: { field: 'shading', is: 'directional' } } } },
    { id: 'shading', type: 'input', data: { label: 'shading', value: 'directional' } },
  ] };
  expect(() => validateToolInputs(graph, {})).toThrow('light is outside the allowed range');
  expect(() => validateToolInputs(graph, { shading: 'flat' })).not.toThrow();
});
