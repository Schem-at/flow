/**
 * Node type exports
 */

import CodeNode from './CodeNode';
import InputNode from './InputNode';
import OutputNode from './OutputNode';
import SchematicNode from './SchematicNode';
import ViewerNode from './ViewerNode';
import FileInputNode from './FileInputNode';
import FileOutputNode from './FileOutputNode';
import SubflowNode from './SubflowNode';

export const nodeTypes = {
  // Core nodes
  code: CodeNode,
  
  // Universal I/O nodes
  file_input: FileInputNode,
  output: OutputNode,
  
  // Unified input node - handles primitive data types
  input: InputNode,
  
  // Viewer node - accepts any input
  viewer: ViewerNode,
  
  // Subflow node - embedded reusable flows
  subflow: SubflowNode,
  
  // Legacy support for specific input types
  static_input: InputNode,
  number_input: InputNode,
  text_input: InputNode,
  boolean_input: InputNode,
  select_input: InputNode,
  
  // Legacy nodes (deprecated - use output node)
  file_output: FileOutputNode,
  
  // Legacy schematic nodes (deprecated - use file_input/output)
  schematic_input: SchematicNode,
  schematic_output: SchematicNode,
  schematic_viewer: SchematicNode,
};

export { CodeNode, InputNode, OutputNode, SchematicNode, ViewerNode, FileInputNode, FileOutputNode, SubflowNode };
