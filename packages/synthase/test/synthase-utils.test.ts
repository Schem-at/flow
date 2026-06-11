// test/synthase-utils.test.ts
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
	execute,
	executeWithValidation,
	validate,
	executeBatch,
	createReusable,
	createHotReloadable,
	benchmark,
} from "../src/synthase-utils";
import { InMemoryScriptRegistry } from "../src/script-registry";

describe("SynthaseUtils", () => {
	const simpleScript = `
    export const io = {
      inputs: {
        message: { type: 'string', default: 'Hello' },
        count: { type: 'int', default: 1, min: 1, max: 5 }
      },
      outputs: {
        result: { type: 'string' }
      }
    };

    export default async function({ message, count }, { Logger }) {
      Logger.info(\`Processing: \${message} x\${count}\`);
      return { result: Array(count).fill(message).join(' ') };
    }
  `;

	describe("execute()", () => {
		it("should execute a script and return results", async () => {
			const result = await execute(simpleScript, { message: "Hi", count: 3 });
			expect(result).toEqual({ result: "Hi Hi Hi" });
		});

		it("should apply default values", async () => {
			const result = await execute(simpleScript, {});
			expect(result).toEqual({ result: "Hello" });
		});

		it("should inject custom context", async () => {
			const script = `
        export const io = {
          inputs: { value: { type: 'int' } },
          outputs: { doubled: { type: 'int' } }
        };
        export default async function({ value }, { Doubler }) {
          return { doubled: Doubler.double(value) };
        }
      `;

			const context = {
				Doubler: {
					double: (x: number) => x * 2,
				},
			};

			const result = await execute(
				script,
				{ value: 21 },
				{ contextProviders: context }
			);
			expect(result).toEqual({ doubled: 42 });
		});

		it("should handle script errors", async () => {
			const errorScript = `
        export const io = {
          inputs: {},
          outputs: { result: { type: 'string' } }
        };
        export default async function() {
          throw new Error('Test error');
        }
      `;

			await expect(execute(errorScript, {})).rejects.toThrow("Test error");
		});

		it("should respect execution limits", async () => {
			const slowScript = `
        export const io = {
          inputs: {},
          outputs: { result: { type: 'string' } }
        };
        export default async function({}, { Utils }) {
          await Utils.delay(200);
          return { result: 'slow' };
        }
      `;

			await expect(
				execute(
					slowScript,
					{},
					{
						limits: { timeout: 100 },
					}
				)
			).rejects.toThrow("timeout");
		});
	});

	describe("executeWithValidation()", () => {
		it("should validate inputs against schema", async () => {
			const result = await executeWithValidation(simpleScript, {
				message: "Test",
				count: 2,
			});
			expect(result).toEqual({ result: "Test Test" });
		});

		it("should reject invalid inputs", async () => {
			await expect(
				executeWithValidation(simpleScript, {
					message: "Test",
					count: 10, // exceeds max of 5
				})
			).rejects.toThrow("must be <= 5");
		});

		it("should handle invalid script", async () => {
			const invalidScript = `
      export const io = {
        inputs: {},
        outputs: {}
      };
      // missing export default
    `;

			await expect(executeWithValidation(invalidScript, {})).rejects.toThrow(
				"Script validation failed"
			);
		});
	});

	describe("benchmark()", () => {
		it("should benchmark script performance", async () => {
			const fastScript = `
      export const io = {
        inputs: { x: { type: 'int' } },
        outputs: { result: { type: 'int' } }
      };
      export default async function({ x }) {
        return { result: x + 1 };
      }
    `;

			const results = await benchmark(fastScript, { x: 5 }, 3);

			expect(results.times).toHaveLength(3);
			expect(results.results).toHaveLength(3);
			expect(results.averageTime).toBeGreaterThan(0);
			expect(results.minTime).toBeGreaterThan(0);
			expect(results.maxTime).toBeGreaterThanOrEqual(results.minTime);

			// All results should be the same
			results.results.forEach((result) => {
				expect(result).toEqual({ result: 6 });
			});
		});

		it("should handle benchmark errors", async () => {
			const errorScript = `
      export const io = {
        inputs: {},
        outputs: { result: { type: 'string' } }
      };
      export default async function() {
        throw new Error('Benchmark error');
      }
    `;

			await expect(benchmark(errorScript, {}, 2)).rejects.toThrow();
		});
	});

	describe("validate()", () => {
		it("should validate script and return IO schema", async () => {
			const validation = await validate(simpleScript);

			expect(validation.valid).toBe(true);
			expect(validation.io).toBeDefined();
			expect(validation.io.inputs).toHaveProperty("message");
			expect(validation.io.inputs).toHaveProperty("count");
			expect(validation.io.outputs).toHaveProperty("result");
			expect(validation.dependencies).toEqual([]);
		});

		it("should detect script with dependencies", async () => {
			const scriptWithDeps = `
        export const io = {
          inputs: { x: { type: 'int' } },
          outputs: { result: { type: 'int' } }
        };
        export default async function({ x }, { importScript }) {
          await importScript('helper1');
          await importScript('helper2');
          return { result: x };
        }
      `;

			const validation = await validate(scriptWithDeps);
			expect(validation.valid).toBe(true);
			expect(validation.dependencies).toEqual(["helper1", "helper2"]);
		});
		it("should detect invalid scripts", async () => {
			const invalidScript = `
    // Missing io export
    export default async function() {
      return {};
    }
  `;

			const validation = await validate(invalidScript);
			expect(validation.valid).toBe(false);
			expect(validation.errors?.[0]).toContain(
				"Missing required 'export const io = ...' declaration"
			);
		});

		it("should validate with custom context", async () => {
			const validation = await validate(simpleScript, {
				contextProviders: { CustomUtil: { test: () => {} } },
			});

			expect(validation.valid).toBe(true);
		});
	});

	describe("executeBatch()", () => {
		it("should execute multiple scripts", async () => {
			const scripts = [
				{
					content: simpleScript,
					inputs: { message: "First", count: 1 },
					id: "script1",
				},
				{
					content: simpleScript,
					inputs: { message: "Second", count: 2 },
					id: "script2",
				},
			];

			const results = await executeBatch(scripts);

			expect(results).toHaveLength(2);
			expect(results[0]).toMatchObject({
				id: "script1",
				success: true,
				result: { result: "First" },
			});
			expect(results[1]).toMatchObject({
				id: "script2",
				success: true,
				result: { result: "Second Second" },
			});
		});

		it("should handle partial failures", async () => {
			const errorScript = `
        export const io = {
          inputs: {},
          outputs: { result: { type: 'string' } }
        };
        export default async function() {
          throw new Error('Batch error');
        }
      `;

			const scripts = [
				{
					content: simpleScript,
					inputs: { message: "Success" },
					id: "good",
				},
				{
					content: errorScript,
					inputs: {},
					id: "bad",
				},
			];

			const results = await executeBatch(scripts);

			expect(results).toHaveLength(2);
			expect(results[0].success).toBe(true);
			expect(results[1].success).toBe(false);
			expect(results[1].error).toContain("Batch error");
		});

		it("should assign default IDs", async () => {
			const scripts = [
				{ content: simpleScript, inputs: {} },
				{ content: simpleScript, inputs: {} },
			];

			const results = await executeBatch(scripts);

			expect(results[0].id).toBe("script-0");
			expect(results[1].id).toBe("script-1");
		});
	});

	describe("createReusable()", () => {
		it("should create reusable script executor", async () => {
			const reusable = await createReusable(simpleScript);

			try {
				const result1 = await reusable.execute({ message: "First", count: 1 });
				const result2 = await reusable.execute({ message: "Second", count: 2 });

				expect(result1).toEqual({ result: "First" });
				expect(result2).toEqual({ result: "Second Second" });

				// Should provide IO access
				const io = reusable.getIO();
				expect(io).toBeDefined();
				expect(io.inputs).toHaveProperty("message");
			} finally {
				reusable.dispose();
			}
		});

		it("should provide dependencies info", async () => {
			const scriptWithDeps = `
        export const io = {
          inputs: {},
          outputs: { result: { type: 'string' } }
        };
        export default async function({}, { importScript }) {
          await importScript('dependency');
          return { result: 'done' };
        }
      `;

			const reusable = await createReusable(scriptWithDeps);

			try {
				const deps = reusable.getDependencies();
				expect(deps).toEqual(["dependency"]);
			} finally {
				reusable.dispose();
			}
		});
	});

	describe("createHotReloadable()", () => {
		it("should support hot reloading", async () => {
			let version = 1;
			const getScript = () => `
        export const io = {
          inputs: {},
          outputs: { version: { type: 'int' } }
        };
        export default async function() {
          return { version: ${version} };
        }
      `;

			const hotReloadable = await createHotReloadable(getScript);

			try {
				const result1 = await hotReloadable.execute({});
				expect(result1).toEqual({ version: 1 });

				// Update script
				version = 2;
				await hotReloadable.reload();

				const result2 = await hotReloadable.execute({});
				expect(result2).toEqual({ version: 2 });
			} finally {
				hotReloadable.dispose();
			}
		});

		it("should handle reload errors", async () => {
			let shouldError = false;
			const getScript = () => {
				if (shouldError) {
					return "invalid script syntax";
				}
				return simpleScript;
			};

			const hotReloadable = await createHotReloadable(getScript);

			try {
				// First execution should work
				await hotReloadable.execute({});

				// Reload with error
				shouldError = true;
				await expect(hotReloadable.reload()).rejects.toThrow(
					"Script validation failed"
				);
			} finally {
				hotReloadable.dispose();
			}
		});
	});

	describe("Configuration Options", () => {
		it("should work with script registries", async () => {
			const registry = new InMemoryScriptRegistry();
			registry.register(
				"helper",
				`
        export const io = {
          inputs: { value: { type: 'int' } },
          outputs: { doubled: { type: 'int' } }
        };
        export default async function({ value }) {
          return { doubled: value * 2 };
        }
      `
			);

			const mainScript = `
        export const io = {
          inputs: { number: { type: 'int' } },
          outputs: { result: { type: 'int' } }
        };
        export default async function({ number }, { importScript }) {
          const helper = await importScript('helper');
          const result = await helper({ value: number });
          return { result: result.doubled };
        }
      `;

			const result = await execute(mainScript, { number: 21 }, { registry });
			expect(result).toEqual({ result: 42 });
		});

		it("should respect cache policy", async () => {
			const script = `
        export const io = {
          inputs: {},
          outputs: { timestamp: { type: 'string' } }
        };
        export default async function() {
          return { timestamp: Date.now().toString() };
        }
      `;

			const result1 = await execute(
				script,
				{},
				{
					cachePolicy: { maxAge: 1000, maxSize: 10 },
				}
			);

			const result2 = await execute(
				script,
				{},
				{
					cachePolicy: { maxAge: 1000, maxSize: 10 },
				}
			);

			// Results should be different since each execute creates new instance
			expect(result1.timestamp).toBeDefined();
			expect(result2.timestamp).toBeDefined();
		});

		it("should handle resource limits", async () => {
			const memoryHeavyScript = `
        export const io = {
          inputs: {},
          outputs: { result: { type: 'string' } }
        };
        export default async function() {
          // This might trigger memory monitoring
          const bigArray = new Array(1000000).fill('x');
          return { result: 'done' };
        }
      `;

			// Should complete normally with reasonable limits
			const result = await execute(
				memoryHeavyScript,
				{},
				{
					resourceMonitor: { maxMemory: 200 * 1024 * 1024 }, // 200MB
				}
			);

			expect(result).toEqual({ result: "done" });
		});
	});
});
