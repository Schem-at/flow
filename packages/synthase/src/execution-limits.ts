// execution-limits.ts
/**
 * Manages execution limits and timeouts for script execution
 */
export class ExecutionLimits {
	public readonly timeout: number = 30000; // 30 seconds max execution
	public readonly maxRecursionDepth: number = 10; // Max import recursion depth
	public readonly maxImportedScripts: number = 50; // Max total imported scripts per execution
	public readonly maxMemory: number = 100 * 1024 * 1024; // 100MB memory limit

	constructor(
		limits?: Partial<{
			timeout: number;
			maxRecursionDepth: number;
			maxImportedScripts: number;
			maxMemory: number;
		}>
	) {
		if (limits) {
			Object.assign(this, limits);
		}

		
	}

	/**
	 * Execute a function with timeout protection
	 */
	async executeWithTimeout<T>(
		fn: () => Promise<T>,
		timeoutMs: number = this.timeout
	): Promise<T> {
		let timeoutId!: ReturnType<typeof setTimeout>;

		const timeoutPromise: Promise<never> = new Promise((_, reject) => {
			timeoutId = setTimeout(() => {
				reject(new Error(`Script execution timeout after ${timeoutMs}ms`));
			}, timeoutMs);
		});

		(timeoutPromise as any)._timeoutId = timeoutId;

		try {
			const result = await Promise.race([fn(), timeoutPromise]);
			clearTimeout(timeoutId); // success → clean up
			return result;
		} catch (error: any) {
			clearTimeout(timeoutId); // failure → clean up

			if (error.message.toLowerCase().includes("timeout")) {
				throw error;
			}
			throw error;
		}
	}

	/**
	 * Check if recursion depth is within limits
	 */
	checkRecursionDepth(currentDepth: number): void {
		if (currentDepth >= this.maxRecursionDepth) {
			throw new Error(
				`Recursion depth limit exceeded: ${currentDepth} >= ${this.maxRecursionDepth}. ` +
					`This may indicate circular dependencies or excessive nesting.`
			);
		}
	}

	/**
	 * Check if import count is within limits
	 */
	checkImportCount(currentCount: number): void {
		if (currentCount >= this.maxImportedScripts) {
			throw new Error(
				`Import limit exceeded: ${currentCount} >= ${this.maxImportedScripts}. ` +
					`This may indicate an import bomb or inefficient script design.`
			);
		}
	}

	/**
	 * Update limits configuration
	 */
	updateLimits(
		newLimits: Partial<{
			timeout: number;
			maxRecursionDepth: number;
			maxImportedScripts: number;
			maxMemory: number;
		}>
	): void {
		Object.assign(this, newLimits);
	}
}
