import { createMiddleware } from "hono/factory";
import { timingSafeEqual } from "node:crypto";
/** Private gateway only until the public execution API is deliberately enabled. */
export const executionGate = createMiddleware(async (c, next) => {
    if (process.env.TOOLS_BACKEND_ENABLED !== "true")
        return c.json(
            {
                success: false,
                error: "Backend execution is disabled. Run this tool in your browser.",
            },
            503,
        );
    const expected = process.env.TOOLS_SERVICE_TOKEN ?? "",
        token = c.req.header("X-Tools-Service-Token") ?? "";
    if (
        !expected ||
        Buffer.byteLength(token) !== Buffer.byteLength(expected) ||
        !timingSafeEqual(Buffer.from(token), Buffer.from(expected))
    )
        return c.json(
            { success: false, error: "Authentication required." },
            401,
        );
    await next();
});
