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
import AssetNode from './AssetNode';
import CommentNode from './CommentNode';
import FrameNode from './FrameNode';
import RerouteNode from './RerouteNode';
import ConstantNode from './ConstantNode';
import BundleNode from './BundleNode';
import UnbundleNode from './UnbundleNode';
import InspectNode from './InspectNode';
import GroupNode from './GroupNode';
import SwitchNode from './SwitchNode';
import MapNode from './MapNode';
import { withNodeBoundary } from './NodeErrorBoundary';

/**
 * Every node component is wrapped in a per-node error boundary
 * (`withNodeBoundary`) so a single throwing node renders a compact fallback card
 * instead of unwinding the React tree and blanking the WHOLE canvas. The
 * boundary preserves displayName and forwards all NodeProps — see
 * `NodeErrorBoundary.tsx` for the rationale and the fallback/edge tradeoff.
 *
 * `wrap()` applies the boundary so the type registered with React Flow is always
 * the boundaried component, for ALL node types (core, I/O, meta-nodes, legacy).
 */
const wrap = withNodeBoundary;

export const nodeTypes = {
  // Core nodes
  code: wrap(CodeNode),

  // Universal I/O nodes
  file_input: wrap(FileInputNode),
  output: wrap(OutputNode),

  // Unified input node - handles primitive data types
  input: wrap(InputNode),

  // Viewer node - accepts any input
  viewer: wrap(ViewerNode),

  // Bundled binary asset (saved inside the flow)
  asset: wrap(AssetNode),

  // Subflow node - embedded reusable flows
  subflow: wrap(SubflowNode),

  // Meta / visual-tidiness nodes
  comment: wrap(CommentNode),     // sticky note (decorative)
  frame: wrap(FrameNode),         // backdrop rectangle (decorative)
  reroute: wrap(RerouteNode),     // pass-through wire dot
  constant: wrap(ConstantNode),   // emits a literal value

  // Semantic "object" meta-nodes
  bundle: wrap(BundleNode),       // packs named inputs into one object
  unbundle: wrap(UnbundleNode),   // splits an object into named outputs
  inspect: wrap(InspectNode),     // transparent value tap with a live preview

  // Group / subflow meta-node (collapsed nested subgraph)
  group: wrap(GroupNode),

  // Control-flow meta-nodes
  switch: wrap(SwitchNode),       // selects one of N case inputs by a selector index
  map: wrap(MapNode),             // iterates a body subgraph over a list → list

  // Legacy support for specific input types
  static_input: wrap(InputNode),
  number_input: wrap(InputNode),
  text_input: wrap(InputNode),
  boolean_input: wrap(InputNode),
  select_input: wrap(InputNode),

  // Legacy nodes (deprecated - use output node)
  file_output: wrap(FileOutputNode),

  // Legacy schematic nodes (deprecated - use file_input/output)
  schematic_input: wrap(SchematicNode),
  schematic_output: wrap(SchematicNode),
  schematic_viewer: wrap(SchematicNode),
};

export { CodeNode, InputNode, OutputNode, SchematicNode, ViewerNode, FileInputNode, FileOutputNode, SubflowNode, AssetNode, CommentNode, FrameNode, RerouteNode, ConstantNode, BundleNode, UnbundleNode, InspectNode, GroupNode, SwitchNode, MapNode };
