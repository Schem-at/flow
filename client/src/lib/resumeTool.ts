import type { FlowLike } from "@flow/core";
/** Cut a graph at a node and bind the cut edges to the previous run's resident values. */
export function resumeTool(
    graph: FlowLike,
    nodeId: string,
    trace: Record<string, { value: any; status: string }>,
) {
    const included = new Set([nodeId]);
    for (let changed = true; changed; ) {
        changed = false;
        for (const e of graph.edges)
            if (included.has(e.source) && !included.has(e.target)) {
                included.add(e.target);
                changed = true;
            }
    }
    const nodes = graph.nodes.filter((n) => included.has(n.id)),
        edges = graph.edges
            .filter((e) => included.has(e.target))
            .map((e) => ({ ...e })),
        inputs: Record<string, unknown> = {};
    for (const edge of edges) {
        if (included.has(edge.source)) continue;
        const entry = trace[edge.source];
        if (!entry || entry.status !== "ok")
            throw new Error(
                "Run the whole tool successfully before resuming this section.",
            );
        const source = graph.nodes.find((n) => n.id === edge.source)!;
        const key = `resume_${nodes.length}`;
        const value =
            source.type === "code" || source.type === "group"
                ? entry.value?.[edge.sourceHandle ?? "default"]
                : entry.value;
        inputs[key] = value;
        nodes.push({
            id: key,
            type: "input",
            data: { label: key, value: null, fieldType: { kind: "unknown" } },
        });
        edge.source = key;
        edge.sourceHandle = "value";
    }
    return { graph: { ...graph, nodes, edges }, inputs };
}
