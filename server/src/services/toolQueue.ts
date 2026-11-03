import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { runInContainer } from "./containerExecutor.js";
import type { ExecutionWorkerRequest } from "./workerExecutor.js";
/** Single scheduler per service process. SQLite preserves terminal status across restarts. */
export class ToolQueue {
    private db: Database;
    private running = new Map<string, () => void>();
    constructor(path = process.env.TOOLS_QUEUE_PATH || "./data/tool-jobs.db") {
        mkdirSync(dirname(path), { recursive: true });
        this.db = new Database(path);
        this.db.exec(
            "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS tool_jobs(id TEXT PRIMARY KEY, owner TEXT NOT NULL, status TEXT NOT NULL, request TEXT, output TEXT, error TEXT, created INTEGER NOT NULL);",
        );
        this.db
            .query(
                "UPDATE tool_jobs SET status='failed',request=NULL,error='Execution service restarted; please retry.' WHERE status IN ('queued','running')",
            )
            .run();
        this.db
            .query("DELETE FROM tool_jobs WHERE created < ?")
            .run(Date.now() - 86400000);
    }
    submit(owner: string, request: ExecutionWorkerRequest) {
        this.db
            .query(
                "DELETE FROM tool_jobs WHERE created < ? AND status NOT IN ('queued','running')",
            )
            .run(Date.now() - 86400000);
        const encoded = JSON.stringify(request);
        if (Buffer.byteLength(encoded) > 16 * 1024 * 1024)
            throw new Error("Input exceeds 16 MB.");
        const counts = this.db
            .query(
                "SELECT COUNT(*) AS total,SUM(owner=?) AS own FROM tool_jobs WHERE status IN ('queued','running')",
            )
            .get(owner) as { total: number; own: number };
        if (counts.total >= 16 || counts.own >= 2)
            throw new Error(
                "Execution queue is full. Retry after your current jobs finish.",
            );
        const id = crypto.randomUUID();
        this.db
            .query("INSERT INTO tool_jobs VALUES(?,?,'queued',?,NULL,NULL,?)")
            .run(id, owner, encoded, Date.now());
        void this.drain();
        return id;
    }
    get(id: string, owner: string) {
        return this.db
            .query(
                "SELECT id,status,output,error,created FROM tool_jobs WHERE id=? AND owner=?",
            )
            .get(id, owner) as {
            id: string;
            status: string;
            output: string | null;
            error: string | null;
            created: number;
        } | null;
    }
    cancel(id: string, owner: string) {
        const job = this.get(id, owner);
        if (!job || !["queued", "running"].includes(job.status)) return false;
        this.db
            .query(
                "UPDATE tool_jobs SET status='cancelled',request=NULL WHERE id=?",
            )
            .run(id);
        this.running.get(id)?.();
        return true;
    }
    private async drain() {
        while (this.running.size < 2) {
            const job = this.db
                .query(
                    "SELECT id,request FROM tool_jobs WHERE status='queued' ORDER BY created LIMIT 1",
                )
                .get() as { id: string; request: string } | null;
            if (!job) return;
            this.db
                .query("UPDATE tool_jobs SET status='running' WHERE id=?")
                .run(job.id);
            this.running.set(job.id, () => {});
            const req = JSON.parse(job.request);
            void runInContainer(req, {
                timeoutMs:
                    Math.min(300000, Number(req.timeout) || 60000) + 15000,
                registerKill: (kill) => this.running.set(job.id, kill),
            })
                .then((output) => {
                    this.db
                        .query(
                            "UPDATE tool_jobs SET status='completed',output=?,request=NULL WHERE id=? AND status='running'",
                        )
                        .run(JSON.stringify(output), job.id);
                })
                .catch((error) => {
                    this.db
                        .query(
                            "UPDATE tool_jobs SET status='failed',error=?,request=NULL WHERE id=? AND status='running'",
                        )
                        .run(String(error.message), job.id);
                })
                .finally(() => {
                    this.running.delete(job.id);
                    void this.drain();
                });
        }
    }
}
