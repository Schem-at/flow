import { inputFieldType } from "@flow/core";
import { spawn } from "node:child_process";
import type {
    ExecutionWorkerRequest,
    RunInWorkerOptions,
} from "./workerExecutor.js";
/** Fixed image and arguments: no graph-controlled mounts, environment or networking. */
export function containerArguments(name: string, timeoutMs: number) {
    return [
        "run",
        "--rm",
        "--name",
        name,
        "--label",
        "schemati.tool-job=true",
        "--network=none",
        "--read-only",
        "--memory=768m",
        "--memory-swap=768m",
        "--cpus=1",
        "--pids-limit=64",
        "--cap-drop=ALL",
        "--security-opt=no-new-privileges",
        "--user=1000:1000",
        "--tmpfs=/tmp:rw,noexec,nosuid,size=64m",
        "-i",
        process.env.TOOLS_EXECUTION_IMAGE || "schemati-tools-executor:local",
        "timeout",
        "-s",
        "KILL",
        String(Math.ceil(Math.min(timeoutMs, 315000) / 1000)),
        "bun",
        "run",
        "server/src/worker/container-entry.ts",
    ];
}
async function executeContainer<T>(
    request: ExecutionWorkerRequest,
    options: RunInWorkerOptions,
): Promise<T> {
    if (request.kind === "tool") {
        const names = new Set<string>();
        for (const node of (request.graph as any)?.nodes ?? [])
            if (inputFieldType(node).kind === "username") {
                const name =
                    request.inputs[node.data.label ?? node.id] ??
                    node.data.value;
                if (
                    typeof name === "string" &&
                    /^[A-Za-z0-9_]{1,16}$/.test(name)
                )
                    names.add(name.toLowerCase());
            }
        if (names.size > 8)
            throw new Error(
                "At most eight skin lookups are allowed per API job.",
            );
        if (names.size) {
            const profiles: Record<
                string,
                { skin: string; name: string; slim: boolean }
            > = {};
            const base = process.env.SCHEMATI_URL;
            if (!base)
                throw new Error("Configure SCHEMATI_URL for API skin assets.");
            for (const name of names) {
                const response = await fetch(
                    new URL(`/api/tools/assets/skins/${name}`, base),
                    {
                        redirect: "error",
                        signal: AbortSignal.any([
                            AbortSignal.timeout(10000),
                            ...(options.signal ? [options.signal] : []),
                        ]),
                    },
                );
                if (!response.ok)
                    throw new Error(
                        "Could not resolve the requested Minecraft skin.",
                    );
                const reader = response.body!.getReader();
                const chunks: Uint8Array[] = [];
                let size = 0;
                try {
                    while (true) {
                        const part = await reader.read();
                        if (part.done) break;
                        size += part.value.byteLength;
                        if (size > 128 * 1024)
                            throw new Error(
                                "Skin asset exceeds its size limit.",
                            );
                        chunks.push(part.value);
                    }
                } finally {
                    await reader.cancel();
                }
                const profile = JSON.parse(Buffer.concat(chunks).toString());
                if (typeof profile.skin !== "string")
                    throw new Error("Invalid skin asset.");
                profiles[name] = {
                    skin: profile.skin,
                    name: String(profile.name ?? name),
                    slim: !!profile.slim,
                };
            }
            request = { ...request, skinProfiles: profiles };
        }
    }
    options.signal?.throwIfAborted();
    const timeout = Math.min(315000, Math.max(1000, options.timeoutMs)),
        name = `schemati-tool-${crypto.randomUUID()}`;
    return new Promise((resolve, reject) => {
        let settled = false,
            total = 0,
            buffer = "";
        const process = spawn("docker", containerArguments(name, timeout), {
            stdio: ["pipe", "pipe", "pipe"],
        });
        const finish = (error?: Error, result?: T) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            process.stdin.destroy();
            process.kill();
            const cleanup = spawn("docker", ["rm", "-f", name], {
                stdio: "ignore",
            });
            cleanup.on("error", () => {});
            error ? reject(error) : resolve(result as T);
        };
        const timer = setTimeout(
            () => finish(new Error("Execution exceeded its time limit.")),
            timeout + 3000,
        );
        options.registerKill?.(() => finish(new Error("Execution cancelled")));
        process.on("error", (e) => finish(e));
        process.stdin.on("error", (e) => finish(e));
        process.stderr.on("data", (chunk) => {
            total += chunk.length;
            if (total > 20 * 1024 * 1024)
                finish(new Error("Execution output limit exceeded."));
        });
        process.stdout.on("data", (chunk) => {
            total += chunk.length;
            if (total > 20 * 1024 * 1024) {
                finish(new Error("Execution output limit exceeded."));
                return;
            }
            buffer += chunk.toString();
            let newline;
            while ((newline = buffer.indexOf("\n")) >= 0) {
                const line = buffer.slice(0, newline);
                buffer = buffer.slice(newline + 1);
                if (!line.startsWith("TOOL_RESULT:")) continue;
                try {
                    const result = JSON.parse(line.slice(12));
                    result.ok
                        ? finish(undefined, result.payload)
                        : finish(
                              new Error(
                                  result.error?.message || "Execution failed",
                              ),
                          );
                } catch {
                    finish(new Error("Invalid executor result"));
                }
            }
        });
        process.on("close", (code) => {
            if (!settled)
                finish(
                    new Error(
                        code === 137
                            ? "Execution exceeded its memory limit."
                            : `Executor exited without a result (${code}).`,
                    ),
                );
        });
        const payload = JSON.stringify(request, (_k, v) =>
            v instanceof Uint8Array
                ? { __toolBytes: Buffer.from(v).toString("base64") }
                : v,
        );
        if (Buffer.byteLength(payload) > 16 * 1024 * 1024) {
            finish(new Error("Execution input exceeds 16 MB."));
            return;
        }
        process.stdin.end(payload);
    });
}

let active = 0;
const waiting: Array<() => void> = [];
/** A global admission budget also covers the legacy synchronous execution routes. */
export function runInContainer<T>(
    request: ExecutionWorkerRequest,
    options: RunInWorkerOptions,
): Promise<T> {
    return new Promise((resolve, reject) => {
        let cancelled = false;
        const abort = new AbortController();
        let innerKill: (() => void) | undefined;
        const start = () => {
            if (cancelled) return;
            active++;
            executeContainer<T>(request, {
                ...options,
                signal: abort.signal,
                registerKill: (kill) => {
                    innerKill = kill;
                    if (cancelled) kill();
                },
            })
                .then(resolve, reject)
                .finally(() => {
                    active--;
                    waiting.shift()?.();
                });
        };
        options.registerKill?.(() => {
            cancelled = true;
            abort.abort();
            innerKill?.();
            const index = waiting.indexOf(start);
            if (index >= 0) waiting.splice(index, 1);
            reject(new Error("Execution cancelled"));
        });
        if (cancelled) return;
        if (active < 2) start();
        else if (waiting.length < 16) waiting.push(start);
        else reject(new Error("Execution capacity exhausted. Retry later."));
    });
}
