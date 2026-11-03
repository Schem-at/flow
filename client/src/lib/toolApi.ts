export async function toolApi<T = any>(
    path: string,
    method = "GET",
    body?: unknown,
): Promise<T> {
    const token = document.cookie
        .split("; ")
        .find((c) => c.startsWith("XSRF-TOKEN="))
        ?.slice(11);
    const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL || ""}/api/${path}`,
        {
            method,
            credentials: "include",
            headers: {
                Accept: "application/json",
                ...(body !== undefined
                    ? { "Content-Type": "application/json" }
                    : {}),
                ...(token ? { "X-XSRF-TOKEN": decodeURIComponent(token) } : {}),
            },
            body: body === undefined ? undefined : JSON.stringify(body),
        },
    );
    const data = await response.json();
    if (!response.ok)
        throw new Error(
            data.message || data.error || "Request failed. Please try again.",
        );
    return data;
}
