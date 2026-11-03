import { expect, it } from "vitest";
import { resumeTool } from "./resumeTool";
import { compileFlow } from "@flow/core";
it("cuts upstream code out while preserving native handles for downstream nodes", () => {
    const graph = {
        nodes: [
            {
                id: "build",
                type: "code",
                data: {
                    code: 'type Outputs={world:any};function generate(){throw new Error("must not rerun");}',
                },
            },
            {
                id: "step",
                type: "code",
                data: {
                    code: "type Inputs={world:any};type Outputs={value:number};function generate(inputs){return {value:inputs.world.tickCount()};}",
                    contract: {
                        inputs: { world: { kind: "unknown" as const } },
                        outputs: { value: { kind: "number" as const } },
                    },
                },
            },
            { id: "out", type: "output", data: { label: "value" } },
        ],
        edges: [
            {
                id: "a",
                source: "build",
                sourceHandle: "world",
                target: "step",
                targetHandle: "world",
            },
            {
                id: "b",
                source: "step",
                sourceHandle: "value",
                target: "out",
                targetHandle: "input",
            },
        ],
    };
    const handle = {
        id: "native",
        format: "json",
        metadata: { nativeType: "TickSimulation" },
    };
    const resumed = resumeTool(graph, "step", {
        build: { status: "ok", value: { world: handle } },
    });
    expect(Object.values(resumed.inputs)).toEqual([handle]);
    expect(compileFlow(resumed.graph).source).not.toContain("must not rerun");
});
