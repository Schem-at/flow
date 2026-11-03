import sharp from "sharp";
import {
    compileFlow,
    createDefaultRegistry,
    encodePng,
    SynthaseService,
    toolOutputPorts,
    validateToolInputs,
    type ToolOutputPort,
} from "@flow/core";
import {
    ToolRunError,
    type ToolOutputEntry,
    type ToolRunResult,
} from "./toolJobs.js";

export const MAX_TOOL_OUTPUT_BYTES = 20 * 1024 * 1024;

export interface ExecuteToolOptions {
    /** Legacy: serialize the whole result generically into `legacy`. */
    general?: boolean;
    /** Skin assets resolved by the trusted host before isolated execution. */
    skinProfiles?: Record<string, { skin: string; name: string; slim: boolean }>;
    /** Whole-run progress, 0..1, from the runtime's phases and the tool's own progress() calls. */
    onProgress?: (fraction: number, message?: string) => void;
}

/** Runtime phases own 0..0.1 and 0.9..1; the graph's own progress maps into 0.1..0.9. */
const EXECUTE_FROM = 0.1,
    EXECUTE_SPAN = 0.8;

/** Called inside the one-shot execution worker, never on the HTTP thread. */
export async function executeTool(
    graph: any,
    inputs: Record<string, unknown>,
    timeout: number,
    options: ExecuteToolOptions | boolean = {},
): Promise<ToolRunResult> {
    const opts: ExecuteToolOptions =
        typeof options === "boolean" ? { general: options } : options;
    const report = (fraction: number, message?: string) => {
        try {
            opts.onProgress?.(fraction, message);
        } catch {
            /* progress is best-effort */
        }
    };

    report(0.01, "Starting runtime");
    const context = await createDefaultRegistry().createContext({
        kind: "node",
        skinProfiles: opts.skinProfiles,
        progressCallback: (message, percent) => {
            if (typeof percent !== "number" || !Number.isFinite(percent))
                return;
            const f = Math.max(0, Math.min(100, percent)) / 100;
            report(EXECUTE_FROM + EXECUTE_SPAN * f, message);
        },
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

    report(0.04, "Compiling graph");
    let source: string;
    try {
        source = compileFlow(graph).source;
    } catch (error) {
        throw new ToolRunError(
            "execution_failed",
            `The tool graph does not compile: ${(error as Error).message}`,
        );
    }

    report(0.06, "Checking inputs");
    let values: Record<string, unknown>;
    try {
        values = validateToolInputs(graph, inputs);
    } catch (error) {
        throw new ToolRunError("validation", (error as Error).message);
    }

    report(EXECUTE_FROM, "Running");
    const service = new SynthaseService(context);
    const result = await service.executeScript(source, values, { timeout });
    if (!result.success) {
        const message = result.error?.message ?? "Tool execution failed.";
        throw new ToolRunError(
            /execution timeout/i.test(message) ? "timeout" : "execution_failed",
            message,
        );
    }

    report(0.92, "Encoding outputs");
    const blocks = context.Blocks as any;
    const outputs = serializeToolOutputs(
        graph,
        (result.result ?? {}) as Record<string, unknown>,
        values,
        blocks,
    );
    const legacy = opts.general
        ? serializeGeneric(result.result)
        : legacySchematic(result.result, values, blocks);
    report(0.99, "Done");
    return { outputs, legacy };
}

// ── outputs[] ───────────────────────────────────────────────────────────────

const SCHEMATIC_FORMATS = new Set(["schem", "litematic", "schematic", "nbt"]);
const IMAGE_FORMATS: Record<string, string> = {
    png: "png",
    jpg: "jpg",
    jpeg: "jpg",
    webp: "webp",
    gif: "gif",
};
const TEXT_FORMATS = new Set(["txt", "md", "csv", "mcfunction", "svg"]);

function isSchematic(value: any): boolean {
    const raw = value?.native ?? value;
    return (
        !!raw &&
        typeof raw === "object" &&
        (typeof raw.toSchematicB64 === "function" ||
            typeof raw.to_schematic === "function")
    );
}

function base64(bytes: Uint8Array): string {
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString(
        "base64",
    );
}

/** Uint8Array, or the numeric-keyed object a Uint8Array becomes across a structured-clone/JSON hop. */
function toBytes(value: unknown): Uint8Array | null {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value))
        return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    if (value && typeof value === "object") {
        const keys = Object.keys(value);
        if (keys.length && keys.every((k, i) => k === String(i))) {
            const values = Object.values(value as Record<string, unknown>);
            if (values.every((v) => typeof v === "number"))
                return Uint8Array.from(values as number[]);
        }
    }
    return null;
}

function schematicFormat(
    port: ToolOutputPort | undefined,
    values: Record<string, unknown>,
    graph: any,
): "schem" | "litematic" {
    const wanted =
        port?.format ??
        (typeof values.format === "string" ? values.format : undefined) ??
        graph?.metadata?.tool?.format;
    return wanted === "litematic" ? "litematic" : "schem";
}

function entry(
    name: string,
    kind: ToolOutputEntry["kind"],
    format: string,
    data: string,
): ToolOutputEntry {
    return { name, kind, format, filename: `${name}.${format}`, base64: data };
}

function serializeOne(
    name: string,
    value: unknown,
    port: ToolOutputPort | undefined,
    values: Record<string, unknown>,
    graph: any,
    blocks: any,
): ToolOutputEntry | null {
    if (value === undefined || value === null) return null;
    if (isSchematic(value)) {
        const format = schematicFormat(port, values, graph);
        return entry(name, "schematic", format, blocks.export(value, format).base64);
    }
    // Ports typed as native editor values (animations, simulations …) are
    // interactive previews in the editor, not files a remote caller can use.
    if (port?.dataType === "native") return null;
    if (typeof value === "string") {
        return entry(name, "text", "txt", Buffer.from(value, "utf8").toString("base64"));
    }
    if (typeof value === "number" || typeof value === "boolean") {
        return entry(name, "json", "json", Buffer.from(JSON.stringify(value)).toString("base64"));
    }
    const v = value as any;
    // Pixel images ({ width, height, data: RGBA }) — Blocks.image, Image.create …
    if (
        Number.isInteger(v.width) &&
        Number.isInteger(v.height) &&
        v.data !== undefined
    ) {
        const rgba = toBytes(v.data);
        if (rgba && rgba.byteLength === v.width * v.height * 4)
            return entry(name, "image", "png", base64(encodePng(v.width, v.height, new Uint8Array(rgba))));
    }
    // File-like values ({ base64 | data, format }) — Blocks.export, file assets …
    if (typeof v.format === "string" && (typeof v.base64 === "string" || v.data !== undefined)) {
        const format = v.format.toLowerCase().replace(/^\./, "");
        const bytes = typeof v.base64 === "string" ? null : toBytes(v.data);
        const data = typeof v.base64 === "string" ? v.base64 : bytes ? base64(bytes) : null;
        if (data !== null) {
            if (SCHEMATIC_FORMATS.has(format)) return entry(name, "schematic", format === "litematic" ? "litematic" : format, data);
            if (IMAGE_FORMATS[format]) return entry(name, "image", IMAGE_FORMATS[format], data);
            if (format === "json") return entry(name, "json", "json", data);
            if (TEXT_FORMATS.has(format)) return entry(name, "text", format === "md" ? "txt" : format === "svg" ? "txt" : format, data);
            // Other binary formats (glb, …) have no output kind yet.
            return null;
        }
    }
    const bytes = toBytes(v);
    if (bytes) {
        if (port?.dataType === "schematic") return entry(name, "schematic", "schem", base64(bytes));
        return null;
    }
    try {
        return entry(name, "json", "json", Buffer.from(JSON.stringify(serializeGeneric(value))).toString("base64"));
    } catch {
        // Native editor-only values (animations, simulations …) are previews, not API outputs.
        return null;
    }
}

/** Every output node of the graph becomes one outputs[] entry (§9). */
export function serializeToolOutputs(
    graph: any,
    result: Record<string, unknown>,
    values: Record<string, unknown>,
    blocks: any,
): ToolOutputEntry[] {
    const ports = new Map(toolOutputPorts(graph).map((p) => [p.name, p]));
    const outputs: ToolOutputEntry[] = [];
    let total = 0;
    for (const [name, value] of Object.entries(result)) {
        const out = serializeOne(name, value, ports.get(name), values, graph, blocks);
        if (!out) continue;
        total += Math.floor((out.base64.length * 3) / 4);
        if (total > MAX_TOOL_OUTPUT_BYTES)
            throw new ToolRunError(
                "output_too_large",
                "The tool's outputs exceed 20 MB. Try a smaller size.",
            );
        outputs.push(out);
    }
    if (!outputs.length)
        throw new ToolRunError(
            "execution_failed",
            "The tool produced no outputs that can be returned.",
        );
    return outputs;
}

// ── legacy payloads ─────────────────────────────────────────────────────────

function legacySchematic(result: any, values: Record<string, unknown>, blocks: any) {
    const schematic = result?.schematic;
    if (!schematic || !isSchematic(schematic)) return null;
    return {
        ...blocks.export(schematic, values.format === "litematic" ? "litematic" : "schem"),
        metadata: {
            ...((result?.metadata as object) ?? {}),
            ...blocks.measure(schematic),
        },
    };
}

function serializeGeneric(value: any, depth = 0): any {
    if (depth > 20) throw new Error("Result nesting exceeds 20 levels.");
    if (value == null || typeof value !== "object") return value;
    if (typeof value.toSchematicB64 === "function")
        return { format: "schem", base64: value.toSchematicB64() };
    if (typeof value.toSchemB64 === "function")
        return { format: "schem", base64: value.toSchemB64() };
    if (typeof value.to_schematic === "function")
        return { format: "schem", base64: Buffer.from(value.to_schematic()).toString("base64") };
    if (value instanceof Uint8Array)
        return { format: "bin", base64: Buffer.from(value).toString("base64") };
    if (typeof value.worldSnapshotJson === "function")
        return { format: "json", value: JSON.parse(value.worldSnapshotJson()) };
    if (Array.isArray(value)) return value.map((v) => serializeGeneric(v, depth + 1));
    if (
        Object.getPrototypeOf(value) !== Object.prototype &&
        Object.getPrototypeOf(value) !== null
    )
        throw new Error(
            `Native result ${value.constructor?.name} needs an explicit export node for API use.`,
        );
    return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, serializeGeneric(v, depth + 1)]),
    );
}
