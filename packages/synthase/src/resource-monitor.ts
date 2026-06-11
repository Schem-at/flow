// resource-monitor.ts
/**
 * Monitors resource usage during script execution
 */
export class ResourceMonitor {
	private startMemory: number = 0;
	private startTime: number = 0;
	private maxMemoryUsed: number = 0;
	private checkInterval: number | null = null;
	private memoryCheckCount: number = 0;
	private readonly maxMemory: number = 100 * 1024 * 1024; // 100MB
	private readonly checkIntervalMs: number = 1000; // Check every second

	constructor(options?: { maxMemory?: number; checkIntervalMs?: number }) {
		if (options?.maxMemory) {
			(this as any).maxMemory = options.maxMemory;
		}
		if (options?.checkIntervalMs) {
			(this as any).checkIntervalMs = options.checkIntervalMs;
		}
	}

	/**
	 * Start monitoring resources
	 */
	start(): void {
		this.startTime = performance.now();
		this.maxMemoryUsed = 0;
		this.memoryCheckCount = 0;

		// Get baseline memory if available
		if (this.isMemoryAPIAvailable()) {
			this.startMemory = (performance as any).memory.usedJSHeapSize;
		} else {
			this.startMemory = 0;
			console.log("💡 Memory monitoring not available in this environment");
		}

		// Start periodic memory checking
		this.checkInterval = setInterval(() => {
			this.performMemoryCheck();
		}, this.checkIntervalMs) as any;

		console.log(
			`📊 Resource monitoring started (max memory: ${Math.round(
				this.maxMemory / 1024 / 1024
			)}MB)`
		);
	}

	/**
	 * Stop monitoring resources
	 */
	stop(): void {
		if (this.checkInterval) {
			clearInterval(this.checkInterval);
			this.checkInterval = null;
		}

		const duration = performance.now() - this.startTime;
		const finalMemoryUsed = this.getCurrentMemoryUsed();

		console.log(`📊 Resource monitoring stopped:`, {
			duration: `${Math.round(duration)}ms`,
			memoryUsed: `${Math.round(finalMemoryUsed / 1024 / 1024)}MB`,
			maxMemoryUsed: `${Math.round(this.maxMemoryUsed / 1024 / 1024)}MB`,
			memoryChecks: this.memoryCheckCount,
		});
	}

	/**
	 * Manual memory check (can be called during execution)
	 */
	check(): void {
		this.performMemoryCheck();
	}

	/**
	 * Get current memory usage statistics
	 */
	getStats(): {
		memoryUsed: number;
		maxMemoryUsed: number;
		memoryLimit: number;
		memoryPercentage: number;
		duration: number;
		checksPerformed: number;
	} {
		const memoryUsed = this.getCurrentMemoryUsed();
		const duration = performance.now() - this.startTime;

		return {
			memoryUsed,
			maxMemoryUsed: this.maxMemoryUsed,
			memoryLimit: this.maxMemory,
			memoryPercentage: (memoryUsed / this.maxMemory) * 100,
			duration,
			checksPerformed: this.memoryCheckCount,
		};
	}

	/**
	 * Dispose of resources
	 */
	dispose(): void {
		if (this.checkInterval) {
			clearInterval(this.checkInterval);
			this.checkInterval = null;
		}
	}

	/**
	 * Perform a memory check
	 */
	private performMemoryCheck(): void {
		this.memoryCheckCount++;

		if (!this.isMemoryAPIAvailable()) {
			return; // Can't check memory in this environment
		}

		const currentMemoryUsed = this.getCurrentMemoryUsed();
		this.maxMemoryUsed = Math.max(this.maxMemoryUsed, currentMemoryUsed);

		// Check if memory limit exceeded
		if (currentMemoryUsed > this.maxMemory) {
			const memoryMB = Math.round(currentMemoryUsed / 1024 / 1024);
			const limitMB = Math.round(this.maxMemory / 1024 / 1024);

			console.error(`❌ Memory limit exceeded: ${memoryMB}MB > ${limitMB}MB`);

			throw new Error(
				`Script exceeded memory limit: ${memoryMB}MB used, ${limitMB}MB allowed. ` +
					`Consider optimizing your script or reducing data size.`
			);
		}

		// Warn if approaching memory limit
		const memoryPercentage = (currentMemoryUsed / this.maxMemory) * 100;
		if (memoryPercentage > 80 && this.memoryCheckCount % 5 === 0) {
			// Warn every 5 checks when >80%
			console.warn(
				`⚠️ High memory usage: ${Math.round(memoryPercentage)}% of limit`
			);
		}
	}

	/**
	 * Get current memory usage
	 */
	private getCurrentMemoryUsed(): number {
		if (!this.isMemoryAPIAvailable()) {
			return 0;
		}

		const currentMemory = (performance as any).memory.usedJSHeapSize;
		return Math.max(0, currentMemory - this.startMemory);
	}

	/**
	 * Check if memory API is available
	 */
	private isMemoryAPIAvailable(): boolean {
		return (
			typeof performance !== "undefined" &&
			"memory" in performance &&
			typeof (performance as any).memory === "object" &&
			"usedJSHeapSize" in (performance as any).memory
		);
	}

	/**
	 * Force garbage collection if available (for testing)
	 */
	forceGC(): void {
		if (typeof window !== "undefined" && "gc" in window) {
			console.log("🗑️ Forcing garbage collection");
			(window as any).gc();
		} else if (typeof global !== "undefined" && "gc" in global) {
			console.log("🗑️ Forcing garbage collection");
			(global as any).gc();
		} else {
			console.log("💡 Garbage collection not available");
		}
	}

	/**
	 * Create a memory pressure test
	 */
	static createMemoryPressureTest(sizeInMB: number = 10): () => void {
		return () => {
			console.log(`🧪 Creating ${sizeInMB}MB memory pressure test`);
			const arraySize = (sizeInMB * 1024 * 1024) / 8; // 8 bytes per number
			const testArray = new Array(arraySize);

			// Fill array with data to actually allocate memory
			for (let i = 0; i < arraySize; i++) {
				testArray[i] = Math.random();
			}

			console.log(`💾 Created array with ${testArray.length} elements`);

			// Return cleanup function
			return () => {
				testArray.length = 0;
				console.log("🗑️ Cleaned up memory pressure test");
			};
		};
	}
}
