/** Runs as an unprivileged PID inside a disposable, network-disabled container. */
import { runInExecutionWorker } from "../services/workerExecutor.js";
const text = await Bun.stdin.text();
try {
    if (Buffer.byteLength(text) > 16 * 1024 * 1024)
        throw new Error("Input limit exceeded.");
    const request = JSON.parse(text, (_key, value) =>
        value?.__toolBytes
            ? new Uint8Array(Buffer.from(value.__toolBytes, "base64"))
            : value,
    );
    process.env.TOOLS_ISOLATED_JOB = "1";
    const result = await runInExecutionWorker(request, {
        timeoutMs: Math.min(300000, Number(request.timeout) || 60000) + 1000,
    });
    console.log("TOOL_RESULT:" + JSON.stringify({ ok: true, payload: result }));
} catch (error) {
    console.log(
        "TOOL_RESULT:" +
            JSON.stringify({
                ok: false,
                error: { message: (error as Error).message },
            }),
    );
    process.exitCode = 1;
}
