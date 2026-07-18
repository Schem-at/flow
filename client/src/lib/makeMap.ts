/**
 * Map meta-node helpers.
 *
 * A Map node embeds a BODY subgraph (identical shape to a Group) that is run
 * once per element of the incoming `list`. The body's boundary is constrained by
 * convention: an `item` input (required), an optional `index` input, and a
 * `result` output that is collected into the output list.
 *
 * `defaultMapData()` produces a sensible 1-node body (item → Double → result) so
 * dropping a Map from the palette yields a working node out of the box.
 *
 * `makeMap(selectedIds, nodes, edges)` — collapse a selection into a Map body —
 * is INTENTIONALLY left as a thin programmatic seam for now: the full
 * collapse-to-map UX (designating which boundary becomes `item`, wiring the
 * `result`) is fiddly and FLAGGED for visual review. See MORNING-REVIEW Fork 4.
 */

import type { MapNodeData, BoundaryPort } from '@flow/core';

/** A body block that doubles its `item` input. */
const DEFAULT_DOUBLE_SOURCE = `type Inputs = {
  item: number;
};

type Outputs = {
  result: number;
};

function generate(inputs) {
  return { result: inputs.item * 2 };
}`;

const DEFAULT_DOUBLE_CONTRACT = {
  inputs: { item: { kind: 'number' as const } },
  outputs: { result: { kind: 'number' as const } },
};

/** A ready-to-run Map body: each element is doubled (item → Double → result). */
export function defaultMapData(): MapNodeData {
  const itemPort: BoundaryPort = {
    name: 'item',
    internalNodeId: 'map-body-double',
    internalHandle: 'item',
    externalNodeId: '',
    externalHandle: null,
    type: { kind: 'number' },
  };
  const resultPort: BoundaryPort = {
    name: 'result',
    internalNodeId: 'map-body-double',
    internalHandle: 'result',
    externalNodeId: '',
    externalHandle: null,
    type: { kind: 'number' },
  };
  return {
    label: 'Map',
    subgraph: {
      nodes: [
        {
          id: 'map-body-double',
          type: 'code',
          // position kept for the (deferred) nested editor / ungroup-style flows
          ...( { position: { x: 0, y: 0 } } as Record<string, unknown> ),
          data: {
            label: 'Double',
            code: DEFAULT_DOUBLE_SOURCE,
            contract: DEFAULT_DOUBLE_CONTRACT,
          },
        },
      ],
      edges: [],
    },
    bodyInputs: [itemPort],
    bodyOutputs: [resultPort],
    resultPort: 'result',
    expanded: false,
  };
}
