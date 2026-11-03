import { describe, it, expect } from "vitest";
import { methodNode } from "./methodNode";
import { parseBlockSource } from "./parser";
import { composeBlockSource, type BlockContract } from "@flow/core";
const group = {
    name: "Sdf",
    source: "nucleation" as const,
    doc: "",
    members: [],
};
describe("native tool authoring", () => {
    it("creates static nodes directly from native signatures", async () => {
        const node = await methodNode(
            group,
            {
                name: "sphere",
                kind: "method",
                doc: "",
                signature: "static sphere(radius: number): Sdf",
            },
            [group],
        );
        expect(node.code).toContain("Nucleation.Sdf.sphere(inputs.radius)");
        expect(node.contract.outputs.result).toEqual({
            kind: "native",
            className: "Sdf",
        });
        expect(node.contract.inputs.radius.kind).toBe("number");
    });
    it("adds a typed native receiver for instance methods", async () => {
        const node = await methodNode(
            group,
            {
                name: "translate",
                kind: "method",
                doc: "",
                signature: "translate(x: number, y: number, z: number): Sdf",
            },
            [group],
        );
        expect(node.contract.inputs.instance).toEqual({
            kind: "native",
            className: "Sdf",
        });
        expect(node.code).toContain("inputs.instance.translate");
    });
    it("preserves standard tool widget constraints through code editing", async () => {
        const contract: BlockContract = {
            inputs: {
                palette: {
                    kind: "palette",
                    default: {
                        preset: "wool",
                        include: [],
                        exclude: [],
                        replace: {},
                    },
                },
                file: { kind: "file", accept: [".png"], maxBytes: 10000 },
                layers: {
                    kind: "set",
                    options: ["head", "body"],
                    labels: { head: "Head" },
                    default: ["head"],
                },
            },
            outputs: { animation: { kind: "animation" } },
        };
        expect(
            (
                await parseBlockSource(
                    composeBlockSource(
                        contract,
                        "function generate() {return {};}",
                    ),
                )
            ).contract,
        ).toEqual(contract);
    });
});
