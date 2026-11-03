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
    // Skin assets are prefetched by runInExecutionWorker before dispatch (skinPrefetch.ts).
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
                if (line.startsWith("TOOL_EVENT:")) {
                    try {
                        options.onEvent?.(JSON.parse(line.slice(11)));
                    } catch {
                        /* malformed progress lines are ignored */
                    }
                    continue;
                }
                if (!line.startsWith("TOOL_RESULT:")) continue;
                try {
                    const result = JSON.parse(line.slice(12));
                    if (result.ok) finish(undefined, result.payload);
                    else {
                        const error = new Error(
                            result.error?.message || "Execution failed",
                        ) as Error & { code?: string };
                        if (typeof result.error?.code === "string")
                            error.code = result.error.code;
                        finish(error);
                    }
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
