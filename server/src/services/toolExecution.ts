import sharp from "sharp";
import { compileFlow, SynthaseService, validateToolInputs } from "@flow/core";
import { createDefaultRegistry } from "@flow/core";

/** Called inside the one-shot execution worker, never on the HTTP thread. */
export async function executeTool(
    graph: any,
    inputs: Record<string, unknown>,
    timeout: number,
    general = false,
    skinProfiles?: Record<
        string,
        { skin: string; name: string; slim: boolean }
    >,
) {
    const context = await createDefaultRegistry().createContext({
        kind: "node",
        skinProfiles,
        decodeImage: async (bytes, width) => {
            const image = sharp(bytes, { limitInputPixels: 67108864 });
            const meta = await image.metadata();
            if (
                !["png", "jpeg", "webp"].includes(meta.format ?? "") ||
                !meta.width ||
                !meta.height
            )
                throw new Error("Unsupported image.");
            const w = width ?? meta.width,
                h = Math.max(1, Math.round((w * meta.height) / meta.width));
            if (w * h > 262144)
                throw new Error(
                    "The image is too tall at this width. Reduce the width or crop it.",
                );
            const result = await image
                .resize(w, h, { fit: "fill" })
                .ensureAlpha()
                .raw()
                .toBuffer({ resolveWithObject: true });
            return {
                width: result.info.width,
                height: result.info.height,
                data: new Uint8Array(result.data),
            };
        },
    });
    // Community computation cannot inherit the server's platform upload token.
    context.Schemati = {
        ...(context.Schemati as object),
        uploadSchematic: () => {
            throw new Error(
                "Upload results using the explicit sharing action.",
            );
        },
    };
    const service = new SynthaseService(context);
    const result = await service.executeScript(
        compileFlow(graph).source,
        validateToolInputs(graph, inputs),
        { timeout },
    );
    if (!result.success)
        throw new Error(result.error?.message ?? "Tool execution failed.");
    if (general) {
        const serialize = (value: any, depth = 0): any => {
            if (depth > 20)
                throw new Error("Result nesting exceeds 20 levels.");
            if (value == null || typeof value !== "object") return value;
            if (typeof value.toSchematicB64 === "function")
                return { format: "schem", base64: value.toSchematicB64() };
            if (typeof value.toSchemB64 === "function")
                return { format: "schem", base64: value.toSchemB64() };
            if (typeof value.to_schematic === "function")
                return {
                    format: "schem",
                    base64: Buffer.from(value.to_schematic()).toString(
                        "base64",
                    ),
                };
            if (value instanceof Uint8Array)
                return {
                    format: "bin",
                    base64: Buffer.from(value).toString("base64"),
                };
            if (typeof value.worldSnapshotJson === "function")
                return {
                    format: "json",
                    value: JSON.parse(value.worldSnapshotJson()),
                };
            if (Array.isArray(value))
                return value.map((v) => serialize(v, depth + 1));
            if (
                Object.getPrototypeOf(value) !== Object.prototype &&
                Object.getPrototypeOf(value) !== null
            )
                throw new Error(
                    `Native result ${value.constructor?.name} needs an explicit export node for API use.`,
                );
            return Object.fromEntries(
                Object.entries(value).map(([k, v]) => [
                    k,
                    serialize(v, depth + 1),
                ]),
            );
        };
        return serialize(result.result);
    }
    const schematic = result.result?.schematic;
    if (!schematic) throw new Error("The tool has no schematic output.");
    const blocks = context.Blocks as any;
    return {
        ...blocks.export(schematic, inputs.format ?? "schem"),
        metadata: {
            ...((result.result?.metadata as object) ?? {}),
            ...blocks.measure(schematic),
        },
    };
}
