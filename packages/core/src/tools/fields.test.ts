import { it, expect } from 'vitest';
import { validateToolInputs } from './validate';
import { inputFieldType } from './fields';
it('validates canonical file fields independently of old tool metadata',()=>{const graph={nodes:[{type:'input',id:'f',data:{label:'file',fieldType:{kind:'file',accept:['png'],maxBytes:4}}}]};expect(()=>validateToolInputs(graph,{file:{data:new Uint8Array(5),format:'png'}})).toThrow('too large');expect(()=>validateToolInputs(graph,{file:{data:new Uint8Array(3),format:'exe'}})).toThrow('format');expect(validateToolInputs(graph,{file:{data:new Uint8Array(3),format:'png'}}).file).toBeTruthy();});
it('rejects invalid choices, usernames and palette content',()=>{for(const [type,value] of [[{kind:'username'},'a/b'],[{kind:'set',options:['head']},['foot']],[{kind:'palette'},{preset:'solid',include:['bad name'],exclude:[],replace:{}}]])expect(()=>validateToolInputs({nodes:[{type:'input',id:'x',data:{fieldType:type}}]},{x:value})).toThrow();});
it('normalizes legacy skin fields into reusable widgets',()=>{expect(inputFieldType({type:'input',data:{toolField:{kind:'username'},value:'Notch'}})).toEqual({kind:'username',default:'Notch'});});
it('preserves legacy file category restrictions in the common file contract', () => {
  expect(inputFieldType({ type: 'file_input', data: { acceptedTypes: ['schematic'] } })).toMatchObject({ kind: 'file', accept: ['.litematic', '.schematic', '.schem', '.nbt'] });
  expect(inputFieldType({ type: 'file_input', data: { acceptedTypes: ['binary'] } })).toMatchObject({ accept: [] });
});

it('accepts empty palette maps after the Laravel graph JSON round trip', () => {
  const graph = {nodes: [{id: 'palette', type: 'input', data: {fieldType: {kind: 'palette'}, value: {preset: 'solid', include: [], exclude: [], replace: []}}}]};
  expect(validateToolInputs(graph, {}).palette).toEqual({preset: 'solid', include: [], exclude: [], replace: {}});
  expect(() => validateToolInputs(graph, {palette: {preset: 'solid', replace: ['invalid']}})).toThrow('invalid palette');
});

it('enforces form field contracts and defaults in the execution service', () => {
  const graph = {nodes: [{id:'form', type:'form', data:{fields:[{name:'layers', fieldType:{kind:'set', options:['hat'], default:['hat']}}]}}], edges:[]};
  expect(validateToolInputs(graph, {}).layers).toEqual(['hat']);
  expect(() => validateToolInputs(graph, {layers:['invalid']})).toThrow('Select valid options');
});
