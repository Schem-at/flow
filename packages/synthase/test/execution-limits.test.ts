// test/execution-limits.test.ts
import { describe, it, expect, beforeEach } from "bun:test";
import { ExecutionLimits } from "../src/execution-limits";

describe("ExecutionLimits", () => {
	let limits: ExecutionLimits;

	beforeEach(() => {
		limits = new ExecutionLimits();
	});

	describe("Constructor and Configuration", () => {
		it("should use default limits", () => {
			expect(limits.timeout).toBe(30000);
			expect(limits.maxRecursionDepth).toBe(10);
			expect(limits.maxImportedScripts).toBe(50);
			expect(limits.maxMemory).toBe(100 * 1024 * 1024);
		});

		it("should accept custom limits", () => {
			const customLimits = new ExecutionLimits({
				timeout: 5000,
				maxRecursionDepth: 5,
				maxImportedScripts: 20,
				maxMemory: 50 * 1024 * 1024,
			});

			expect(customLimits.timeout).toBe(5000);
			expect(customLimits.maxRecursionDepth).toBe(5);
			expect(customLimits.maxImportedScripts).toBe(20);
			expect(customLimits.maxMemory).toBe(50 * 1024 * 1024);
		});

		it("should accept partial limits configuration", () => {
			const partialLimits = new ExecutionLimits({
				timeout: 15000,
				maxRecursionDepth: 8,
				// other limits should use defaults
			});

			expect(partialLimits.timeout).toBe(15000);
			expect(partialLimits.maxRecursionDepth).toBe(8);
			expect(partialLimits.maxImportedScripts).toBe(50); // default
			expect(partialLimits.maxMemory).toBe(100 * 1024 * 1024); // default
		});
	});

	describe("executeWithTimeout()", () => {
		it("should execute fast functions successfully", async () => {
			const fastFunction = async () => {
				await new Promise((resolve) => setTimeout(resolve, 10));
				return "completed";
			};

			const result = await limits.executeWithTimeout(fastFunction, 1000);
			expect(result).toBe("completed");
		});

		it("should timeout slow functions", async () => {
			const slowFunction = async () => {
				await new Promise((resolve) => setTimeout(resolve, 200));
				return "should not complete";
			};

			await expect(
				limits.executeWithTimeout(slowFunction, 100)
			).rejects.toThrow("Script execution timeout");
		});

		it("should use default timeout when not specified", async () => {
			const fastFunction = async () => "quick";

			const result = await limits.executeWithTimeout(fastFunction);
			expect(result).toBe("quick");
		});

		it("should handle function errors properly", async () => {
			const errorFunction = async () => {
				throw new Error("Function error");
			};

			await expect(
				limits.executeWithTimeout(errorFunction, 1000)
			).rejects.toThrow("Function error");
		});

		it("should handle synchronous functions", async () => {
			const syncFunction = async () => {
				return "sync result";
			};

			const result = await limits.executeWithTimeout(syncFunction, 1000);
			expect(result).toBe("sync result");
		});

		it("should clean up timeout on success", async () => {
			const fastFunction = async () => {
				await new Promise((resolve) => setTimeout(resolve, 10));
				return "success";
			};

			// Multiple executions should not interfere with each other
			const result1 = await limits.executeWithTimeout(fastFunction, 1000);
			const result2 = await limits.executeWithTimeout(fastFunction, 1000);

			expect(result1).toBe("success");
			expect(result2).toBe("success");
		});

		it("should clean up timeout on error", async () => {
			const errorFunction = async () => {
				await new Promise((resolve) => setTimeout(resolve, 10));
				throw new Error("Test error");
			};

			await expect(
				limits.executeWithTimeout(errorFunction, 1000)
			).rejects.toThrow("Test error");

			// Subsequent executions should still work
			const successFunction = async () => "success";
			const result = await limits.executeWithTimeout(successFunction, 1000);
			expect(result).toBe("success");
		});
	});

	describe("checkRecursionDepth()", () => {
		it("should allow depths within limits", () => {
			expect(() => limits.checkRecursionDepth(0)).not.toThrow();
			expect(() => limits.checkRecursionDepth(5)).not.toThrow();
			expect(() => limits.checkRecursionDepth(9)).not.toThrow();
		});

		it("should reject depths at or above limit", () => {
			expect(() => limits.checkRecursionDepth(10)).toThrow(
				"Recursion depth limit exceeded: 10 >= 10"
			);
			expect(() => limits.checkRecursionDepth(15)).toThrow(
				"Recursion depth limit exceeded: 15 >= 10"
			);
		});

		it("should provide helpful error messages", () => {
			try {
				limits.checkRecursionDepth(12);
			} catch (error: any) {
				expect(error.message).toContain("circular dependencies");
				expect(error.message).toContain("excessive nesting");
			}
		});

		it("should work with custom limits", () => {
			const customLimits = new ExecutionLimits({ maxRecursionDepth: 3 });

			expect(() => customLimits.checkRecursionDepth(2)).not.toThrow();
			expect(() => customLimits.checkRecursionDepth(3)).toThrow(
				"Recursion depth limit exceeded: 3 >= 3"
			);
		});
	});

	describe("checkImportCount()", () => {
		it("should allow import counts within limits", () => {
			expect(() => limits.checkImportCount(0)).not.toThrow();
			expect(() => limits.checkImportCount(25)).not.toThrow();
			expect(() => limits.checkImportCount(49)).not.toThrow();
		});

		it("should reject import counts at or above limit", () => {
			expect(() => limits.checkImportCount(50)).toThrow(
				"Import limit exceeded: 50 >= 50"
			);
			expect(() => limits.checkImportCount(75)).toThrow(
				"Import limit exceeded: 75 >= 50"
			);
		});

		it("should provide helpful error messages", () => {
			try {
				limits.checkImportCount(60);
			} catch (error: any) {
				expect(error.message).toContain("import bomb");
				expect(error.message).toContain("inefficient script design");
			}
		});

		it("should work with custom limits", () => {
			const customLimits = new ExecutionLimits({ maxImportedScripts: 5 });

			expect(() => customLimits.checkImportCount(4)).not.toThrow();
			expect(() => customLimits.checkImportCount(5)).toThrow(
				"Import limit exceeded: 5 >= 5"
			);
		});
	});

	describe("updateLimits()", () => {
		it("should update individual limits", () => {
			limits.updateLimits({ timeout: 60000 });
			expect(limits.timeout).toBe(60000);
			expect(limits.maxRecursionDepth).toBe(10); // unchanged
		});

		it("should update multiple limits", () => {
			limits.updateLimits({
				timeout: 45000,
				maxRecursionDepth: 15,
				maxMemory: 200 * 1024 * 1024,
			});

			expect(limits.timeout).toBe(45000);
			expect(limits.maxRecursionDepth).toBe(15);
			expect(limits.maxMemory).toBe(200 * 1024 * 1024);
			expect(limits.maxImportedScripts).toBe(50); // unchanged
		});

		it("should handle empty updates", () => {
			const originalTimeout = limits.timeout;
			limits.updateLimits({});
			expect(limits.timeout).toBe(originalTimeout);
		});
	});

	describe("Integration Tests", () => {
		it("should work with realistic timeout scenarios", async () => {
			// Simulate script that takes varying amounts of time
			const variableTimeFunction = async (duration: number) => {
				await new Promise((resolve) => setTimeout(resolve, duration));
				return `completed in ${duration}ms`;
			};

			// Should succeed with sufficient timeout
			const result1 = await limits.executeWithTimeout(
				() => variableTimeFunction(50),
				200
			);
			expect(result1).toBe("completed in 50ms");

			// Should fail with insufficient timeout
			await expect(
				limits.executeWithTimeout(() => variableTimeFunction(150), 100)
			).rejects.toThrow("timeout");
		});

		it("should handle complex recursion scenarios", () => {
			// Simulate nested import tracking
			const simulateNestedImports = (depth: number) => {
				for (let i = 0; i < depth; i++) {
					limits.checkRecursionDepth(i);
				}
			};

			expect(() => simulateNestedImports(5)).not.toThrow();
			expect(() => simulateNestedImports(15)).toThrow();
		});

		it("should handle rapid import count increases", () => {
			// Simulate rapid script imports
			const simulateRapidImports = (count: number) => {
				for (let i = 0; i < count; i++) {
					limits.checkImportCount(i);
				}
			};

			expect(() => simulateRapidImports(30)).not.toThrow();
			expect(() => simulateRapidImports(60)).toThrow();
		});

		it("should handle edge cases with zero values", () => {
			const zeroLimits = new ExecutionLimits({
				timeout: 0,
				maxRecursionDepth: 0,
				maxImportedScripts: 0,
			});

			expect(() => zeroLimits.checkRecursionDepth(0)).toThrow();
			expect(() => zeroLimits.checkImportCount(0)).toThrow();
		});

		it("should handle very large limit values", () => {
			const hugeLimits = new ExecutionLimits({
				timeout: Number.MAX_SAFE_INTEGER,
				maxRecursionDepth: 1000000,
				maxImportedScripts: 1000000,
			});

			expect(() => hugeLimits.checkRecursionDepth(999999)).not.toThrow();
			expect(() => hugeLimits.checkImportCount(999999)).not.toThrow();
		});
	});

	describe("Error Handling", () => {
		it("should handle timeout promise cleanup on cancellation", async () => {
			const neverResolveFunction = async () => {
				return new Promise(() => {}); // Never resolves
			};

			const timeoutPromise = limits.executeWithTimeout(
				neverResolveFunction,
				50
			);

			await expect(timeoutPromise).rejects.toThrow("timeout");
		});

		it("should distinguish between timeout and function errors", async () => {
			const errorFunction = async () => {
				throw new Error("Custom function error");
			};

			await expect(
				limits.executeWithTimeout(errorFunction, 1000)
			).rejects.toThrow("Custom function error");

			const timeoutFunction = async () => {
				await new Promise((resolve) => setTimeout(resolve, 200));
				return "too slow";
			};

			await expect(
				limits.executeWithTimeout(timeoutFunction, 100)
			).rejects.toThrow("timeout");
		});

		it("should handle limits validation edge cases", () => {
			expect(() => limits.checkRecursionDepth(-1)).not.toThrow(); // Negative values allowed
			expect(() => limits.checkImportCount(-1)).not.toThrow(); // Negative values allowed
		});
	});
});
