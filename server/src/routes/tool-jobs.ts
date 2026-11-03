import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { executionGate } from "../services/executionGate.js";
import { ToolQueue } from "../services/toolQueue.js";
const router = new Hono();
let queue: ToolQueue;
router.use("*", executionGate, bodyLimit({ maxSize: 16 * 1024 * 1024 }));
router.use("*", async (c, next) => {
    if (!c.req.header("X-Tools-Owner"))
        return c.json({ error: "Owner is required." }, 422);
    queue ??= new ToolQueue();
    await next();
});
router.post("/", async (c) => {
    const body = await c.req.json();
    if (!Array.isArray(body.graph?.nodes) || !Array.isArray(body.graph?.edges))
        return c.json({ error: "A tool graph is required." }, 422);
    try {
        return c.json(
            {
                id: queue.submit(c.req.header("X-Tools-Owner")!, {
                    kind: "tool",
                    graph: body.graph,
                    inputs: body.inputs ?? {},
                    timeout: Math.min(
                        300000,
                        Math.max(1000, Number(body.timeout) || 60000),
                    ),
                    general: true,
                }),
                status: "queued",
            },
            202,
        );
    } catch (error) {
        return c.json({ error: (error as Error).message }, 429);
    }
});
router.get("/:id", (c) => {
    const job = queue.get(c.req.param("id"), c.req.header("X-Tools-Owner")!);
    return job
        ? c.json({ ...job, output: job.output ? JSON.parse(job.output) : null })
        : c.json({ error: "Job not found." }, 404);
});
router.delete("/:id", (c) =>
    c.json({
        cancelled: queue.cancel(
            c.req.param("id"),
            c.req.header("X-Tools-Owner")!,
        ),
    }),
);
export default router;
