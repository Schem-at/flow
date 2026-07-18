import type { BlockContract, BoundaryPort, FlowType, GroupSubgraph } from '@flow/core';

/**
 * Module consolidation: a "module" is a published, versioned group-subgraph. This
 * pure helper turns a `/api/modules/:id/resolve` payload into the `data` of a
 * `group` node so a module instance folds statically like any other group.
 *
 * - If the payload carries a `subgraph`, it is used directly and the boundary
 *   contract is derived from `ioSchema`.
 * - If it only carries a legacy `code` blob, the code is wrapped into a
 *   single-code-node subgraph (the back-compat path for old modules).
 */

export interface ModuleRef {
  id: string;
  slug: string;
  version: string;
  pinned: boolean;
}

/**
 * A published group's subgraph, optionally carrying its exact boundary
 * (`groupInputs`/`groupOutputs`). When the boundary is embedded it round-trips
 * verbatim; otherwise it's derived from `ioSchema` (single-node / legacy case).
 */
export interface ModuleSubgraphPayload extends GroupSubgraph {
  groupInputs?: BoundaryPort[];
  groupOutputs?: BoundaryPort[];
}

export interface ModuleResolvePayload {
  subgraph?: ModuleSubgraphPayload;
  ioSchema: BlockContract;
  code?: string;
  version: string;
}

export interface HydratedGroup {
  label?: string;
  subgraph: GroupSubgraph;
  groupInputs: BoundaryPort[];
  groupOutputs: BoundaryPort[];
  moduleRef: ModuleRef;
}

/** Build boundary ports from an io contract, all anchored to one internal node. */
function boundaryFromContract(
  io: BlockContract,
  internalNodeId: string
): { inputs: BoundaryPort[]; outputs: BoundaryPort[] } {
  const port = (name: string, type: FlowType): BoundaryPort => ({
    name,
    internalNodeId,
    internalHandle: name,
    externalNodeId: '',
    externalHandle: null,
    type,
  });
  const inputs = Object.entries(io.inputs ?? {}).map(([name, type]) => port(name, type as FlowType));
  const outputs = Object.entries(io.outputs ?? {}).map(([name, type]) => port(name, type as FlowType));
  return { inputs, outputs };
}

export function hydrateModuleToGroup(
  payload: ModuleResolvePayload,
  ref: { id: string; slug: string }
): HydratedGroup {
  const moduleRef: ModuleRef = { id: ref.id, slug: ref.slug, version: payload.version, pinned: false };

  if (payload.subgraph) {
    const { groupInputs, groupOutputs, ...subgraph } = payload.subgraph;
    // Prefer the published boundary (exact round-trip for multi-node groups);
    // fall back to deriving it from ioSchema for boundary-less subgraphs.
    if (groupInputs && groupOutputs) {
      return { subgraph, groupInputs, groupOutputs, moduleRef };
    }
    const codeNode = subgraph.nodes.find((n) => n.type === 'code') ?? subgraph.nodes[0];
    const { inputs, outputs } = boundaryFromContract(payload.ioSchema, codeNode?.id ?? 'body');
    return { subgraph, groupInputs: inputs, groupOutputs: outputs, moduleRef };
  }

  // Legacy: wrap the code blob into a single-code-node subgraph.
  const bodyId = 'mod-body';
  const subgraph: GroupSubgraph = {
    nodes: [
      {
        id: bodyId,
        type: 'code',
        data: { code: payload.code ?? '', contract: payload.ioSchema },
      },
    ],
    edges: [],
  };
  const { inputs, outputs } = boundaryFromContract(payload.ioSchema, bodyId);
  return { subgraph, groupInputs: inputs, groupOutputs: outputs, moduleRef };
}
