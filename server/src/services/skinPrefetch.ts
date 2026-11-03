/**
 * Resolve the skin assets a tool run needs BEFORE it enters the sandbox, on
 * the trusted host side, with fixed limits (8 lookups, 128 KB each, 10 s).
 * Inputs are keyed by the canonical API name (inputName || label || id), the
 * same key validateToolInputs and every caller use.
 */
import { getToolInputContract } from "@flow/core";
import { ToolRunError } from "./toolJobs.js";

export type SkinProfiles = Record<string, { skin: string; name: string; slim: boolean }>;

export function skinUsernames(graph: unknown, inputs: Record<string, unknown>): string[] {
    let fields;
    try {
        fields = getToolInputContract(graph as any).fields;
    } catch {
        return []; // A malformed graph fails later with a proper message.
    }
    const names = new Set<string>();
    for (const field of fields) {
        if (field.type.kind !== "username") continue;
        const value = inputs[field.name] ?? field.default;
        if (typeof value === "string" && /^[A-Za-z0-9_]{1,16}$/.test(value)) names.add(value.toLowerCase());
    }
    return [...names];
}

export async function prefetchSkinProfiles(
    graph: unknown,
    inputs: Record<string, unknown>,
    signal?: AbortSignal,
): Promise<SkinProfiles | undefined> {
    const names = skinUsernames(graph, inputs);
    if (!names.length) return undefined;
    if (names.length > 8) throw new ToolRunError("validation", "At most eight skin lookups are allowed per run.");
    const base = process.env.SCHEMATI_URL;
    if (!base) throw new ToolRunError("backend_unavailable", "Configure SCHEMATI_URL for skin assets.");
    const profiles: SkinProfiles = {};
    for (const name of names) {
        const response = await fetch(new URL(`/api/tools/assets/skins/${name}`, base), {
            redirect: "error",
            headers: { Accept: "application/json" },
            signal: AbortSignal.any([AbortSignal.timeout(10000), ...(signal ? [signal] : [])]),
        });
        if (response.status === 404) throw new ToolRunError("validation", "No Minecraft account with that username.");
        if (!response.ok) throw new ToolRunError("execution_failed", "Could not resolve the requested Minecraft skin.");
        const reader = response.body!.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
            while (true) {
                const part = await reader.read();
                if (part.done) break;
                size += part.value.byteLength;
                if (size > 128 * 1024) throw new ToolRunError("execution_failed", "Skin asset exceeds its size limit.");
                chunks.push(part.value);
            }
        } finally {
            await reader.cancel().catch(() => {});
        }
        const profile = JSON.parse(Buffer.concat(chunks).toString());
        if (typeof profile.skin !== "string") throw new ToolRunError("execution_failed", "Invalid skin asset.");
        profiles[name] = { skin: profile.skin, name: String(profile.name ?? name), slim: !!profile.slim };
    }
    return profiles;
}
