import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toolApi } from "../lib/toolApi";
import { useAuth } from "../hooks/useAuth";
interface Comment {
    id: string;
    content: string;
    author: string;
    createdAt: string;
    likes: number;
    liked: boolean;
    canDelete: boolean;
    replies: Comment[];
}
export function ToolComments({ tool }: { tool: string }) {
    const { isAuthenticated, loginUrl } = useAuth();
    const cache = useQueryClient(),
        [page, setPage] = useState(1),
        [content, setContent] = useState(""),
        [reply, setReply] = useState<Comment | null>(null),
        [error, setError] = useState(""),
        [pending, setPending] = useState(false),
        [report, setReport] = useState<Comment | null>(null),
        [reason, setReason] = useState("");
    const path = `tools/${encodeURIComponent(tool)}/comments`;
    const query = useQuery({
        queryKey: ["tool-comments", tool, page],
        queryFn: () =>
            toolApi<{ comments: Comment[]; nextPage: number | null }>(
                `${path}?page=${page}`,
            ),
    });
    async function mutate(url: string, method: string, body?: unknown) {
        setPending(true);
        setError("");
        try {
            await toolApi(url, method, body);
            await cache.invalidateQueries({
                queryKey: ["tool-comments", tool],
            });
            return true;
        } catch (e) {
            setError(String(e));
            return false;
        } finally {
            setPending(false);
        }
    }
    function render(c: Comment) {
        return (
            <article key={c.id} className="border-t border-white/10 py-4">
                <div className="flex gap-3 text-xs">
                    <strong>{c.author}</strong>
                    <time className="text-neutral-500" dateTime={c.createdAt}>
                        {new Date(c.createdAt).toLocaleString()}
                    </time>
                </div>
                <p className="my-3 whitespace-pre-wrap break-words text-sm text-neutral-300">
                    {c.content}
                </p>
                <div className="flex gap-4 text-xs text-neutral-500">
                    <button
                        disabled={!isAuthenticated || pending}
                        onClick={() => mutate(`${path}/${c.id}/like`, "POST")}
                    >
                        {c.liked ? "♥" : "♡"} {c.likes}
                    </button>
                    {isAuthenticated && (
                        <button
                            onClick={() => {
                                setReply(c);
                                document
                                    .getElementById("tool-comment")
                                    ?.focus();
                            }}
                        >
                            Reply
                        </button>
                    )}
                    {isAuthenticated && (
                        <button onClick={() => setReport(c)}>Report</button>
                    )}
                    {c.canDelete && (
                        <button
                            disabled={pending}
                            onClick={() => mutate(`${path}/${c.id}`, "DELETE")}
                        >
                            Delete
                        </button>
                    )}
                </div>
                {c.replies?.length > 0 && (
                    <div className="ml-5 mt-3 border-l border-white/10 pl-4">
                        {c.replies.map(render)}
                    </div>
                )}
            </article>
        );
    }
    return (
        <section className="mt-12 max-w-3xl text-neutral-200">
            <h2 className="mb-4 text-xl">Discussion</h2>
            {isAuthenticated ? (
                <form
                    onSubmit={async (e) => {
                        e.preventDefault();
                        if (
                            await mutate(path, "POST", {
                                content,
                                parentId: reply?.id,
                            })
                        ) {
                            setContent("");
                            setReply(null);
                            setPage(1);
                        }
                    }}
                >
                    {reply && (
                        <p className="mb-2 text-xs">
                            Replying to {reply.author}{" "}
                            <button
                                type="button"
                                onClick={() => setReply(null)}
                            >
                                · Cancel
                            </button>
                        </p>
                    )}
                    <textarea
                        id="tool-comment"
                        aria-label="Comment"
                        required
                        minLength={3}
                        maxLength={1000}
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder="Share feedback or ask a question…"
                        className="min-h-24 w-full rounded border border-white/15 bg-neutral-950 p-3 text-sm"
                    />
                    <button
                        disabled={pending}
                        className="my-3 rounded bg-fuchsia-500 px-4 py-2 text-sm text-black"
                    >
                        Post comment
                    </button>
                </form>
            ) : (
                <a href={loginUrl} className="text-sm text-fuchsia-300">
                    Sign in to join the discussion
                </a>
            )}
            {(error || query.error) && (
                <p role="alert" className="my-3 text-sm text-red-400">
                    {error || String(query.error)}
                </p>
            )}
            {report && (
                <form
                    className="my-4 rounded border border-white/15 p-4"
                    onSubmit={async (e) => {
                        e.preventDefault();
                        if (
                            await mutate(
                                `${path}/${report.id}/report`,
                                "POST",
                                { reason },
                            )
                        ) {
                            setReport(null);
                            setReason("");
                        }
                    }}
                >
                    <label className="text-sm">
                        Report comment by {report.author}
                        <textarea
                            aria-label="Report reason"
                            required
                            minLength={5}
                            maxLength={2000}
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            className="my-2 w-full rounded border border-white/15 bg-neutral-950 p-2"
                            placeholder="Explain the issue for the moderation team…"
                        />
                    </label>
                    <button
                        disabled={pending}
                        className="mr-4 text-sm text-fuchsia-300"
                    >
                        Submit report
                    </button>
                    <button type="button" onClick={() => setReport(null)}>
                        Cancel
                    </button>
                </form>
            )}
            {query.data?.comments.map(render)}
            <div className="flex gap-4 text-sm">
                {page > 1 && (
                    <button onClick={() => setPage(page - 1)}>Previous</button>
                )}
                {query.data?.nextPage && (
                    <button onClick={() => setPage(query.data!.nextPage!)}>
                        More comments
                    </button>
                )}
            </div>
        </section>
    );
}
