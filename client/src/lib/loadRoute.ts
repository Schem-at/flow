/** Retry transient module downloads without reloading the page or losing editor state. */
export async function loadRoute<T>(load: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await load(); }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt >= 2 || !/Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk .* failed/i.test(message)) throw error;
      await new Promise(resolve => setTimeout(resolve, 300 * (attempt + 1)));
    }
  }
}
