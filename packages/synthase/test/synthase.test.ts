// test/synthase.test.ts
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Synthase } from "../src/synthase";
import { InMemoryScriptRegistry } from "../src/script-registry";

describe("SynthaseCore", () => {
	let synthase: Synthase;

	afterEach(() => {
		synthase?.dispose();
	});

	describe("Basic Execution", () => {
		it("should execute a simple script", async () => {
			const script = `
        export const io = {
          inputs: {
            message: { type: 'string', default: 'Hello' }
          },
          outputs: {
            result: { type: 'string' }
          }
        };

        export default async function({ message }, { Logger }) {
          Logger.info('Processing message');
          return { result: \`\${message}, World!\` };
        }
      `;

			synthase = new Synthase(script);
			const result = await synthase.call({ message: "Hello" });

			expect(result).toEqual({ result: "Hello, World!" });
    });
    
    it("should be able to execute a simple script that calls functions", async () => {
      const script = `
        export const io = {
          inputs: {
            name: { type: 'string', default: 'World' }
          },
          outputs: {
            greeting: { type: 'string' }
          }
        };

        function greet(name) {
          return \`Hello, \${name}!\`;
        }
        export default async function({ name }) {
          return { greeting: greet(name) };
        }
      `;

			synthase = new Synthase(script);
			const result = await synthase.call({ name: "Alice" });

			expect(result).toEqual({ greeting: "Hello, Alice!" });
		});

		it("should apply default values for missing inputs", async () => {
			const script = `
        export const io = {
          inputs: {
            message: { type: 'string', default: 'Default Message' },
            count: { type: 'int', default: 3 }
          },
          outputs: {
            result: { type: 'string' }
          }
        };

        export default async function({ message, count }) {
          return { result: \`\${message} x\${count}\` };
        }
      `;

			synthase = new Synthase(script);
			const result = await synthase.call({});

			expect(result).toEqual({ result: "Default Message x3" });
		});

		it("should validate input types", async () => {
			const script = `
        export const io = {
          inputs: {
            count: { type: 'int', min: 1, max: 10 }
          },
          outputs: {
            result: { type: 'int' }
          }
        };

        export default async function({ count }) {
          return { result: count * 2 };
        }
      `;

			synthase = new Synthase(script);

			// Valid input
			const result = await synthase.call({ count: 5 });
			expect(result).toEqual({ result: 10 });

			// Invalid type
			await expect(synthase.call({ count: "not a number" })).rejects.toThrow(
				"must be an integer"
			);

			// Out of range
			await expect(synthase.call({ count: 15 })).rejects.toThrow(
				"must be <= 10"
			);
		});
	});

	describe("Context Injection", () => {
		it("should inject custom context providers", async () => {
			const script = `
        export const io = {
          inputs: {
            numbers: { type: 'array' }
          },
          outputs: {
            stats: { type: 'object' }
          }
        };

        export default async function({ numbers }, { Statistics, Logger }) {
          Logger.info('Calculating statistics');
          return {
            stats: {
              mean: Statistics.mean(numbers),
              max: Statistics.max(numbers)
            }
          };
        }
      `;

			const customContext = {
				Statistics: {
					mean: (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length,
					max: (arr: number[]) => Math.max(...arr),
				},
			};

			synthase = new Synthase(script, { contextProviders: customContext });
			const result = await synthase.call({ numbers: [1, 2, 3, 4, 5] });

			expect(result).toEqual({
				stats: {
					mean: 3,
					max: 5,
				},
			});
		});

		it("should provide base context utilities", async () => {
			const script = `
        export const io = {
          inputs: {
            value: { type: 'float' }
          },
          outputs: {
            enhanced: { type: 'float' },
            formatted: { type: 'float' },
            capitalized: { type: 'string' }
          }
        };

        export default async function({ value }, { Calculator, Utils }) {
          return {
            enhanced: Calculator.enhance(value),
            formatted: Utils.formatNumber(Calculator.enhance(value), 2),
            capitalized: Utils.capitalize('hello world')
          };
        }
      `;

			synthase = new Synthase(script);
			const result = await synthase.call({ value: 10 });

			expect(result.enhanced).toBe(11); // 10 * 1.1
			expect(result.formatted).toBe(11);
			expect(result.capitalized).toBe("Hello world");
		});
	});

	describe("Script Import System", () => {
		it("should support importing other scripts", async () => {
			const script = `
        export const io = {
          inputs: {
            number: { type: 'int' }
          },
          outputs: {
            doubled: { type: 'int' },
            quadrupled: { type: 'int' }
          }
        };

        export default async function({ number }, { importScript }) {
          const doubler = await importScript(\`
            export const io = {
              inputs: { value: { type: 'int' } },
              outputs: { result: { type: 'int' } }
            };
            export default async function({ value }) {
              return { result: value * 2 };
            }
          \`);
          
          const doubled = await doubler({ value: number });
          const quadrupled = await doubler({ value: doubled.result });
          
          return { 
            doubled: doubled.result, 
            quadrupled: quadrupled.result 
          };
        }
      `;

			synthase = new Synthase(script);
			const result = await synthase.call({ number: 5 });

			expect(result).toEqual({
				doubled: 10,
				quadrupled: 20,
			});
		});

		it("should prevent recursive imports", async () => {
			const sharedScriptContent = `
    export const io = {
      inputs: {},
      outputs: { result: { type: 'string' } }
    };
    export default async function() {
      return { result: 'shared' };
    }
  `;

			const recursiveScript = `
    export const io = {
      inputs: {},
      outputs: { result: { type: 'string' } }
    };

    export default async function({}, { importScript }) {
      // Import the same script content twice - should detect recursion
      const first = await importScript(\`${sharedScriptContent}\`);
      const second = await importScript(\`${sharedScriptContent}\`);
      
      return { result: 'should not reach here' };
    }
  `;

			synthase = new Synthase(recursiveScript);
			await expect(synthase.call({})).rejects.toThrow(
				/Recursive import detected|script content already imported/
			);
		});
	});

	describe("Caching", () => {
		it("should cache compiled scripts", async () => {
			const script = `
        export const io = {
          inputs: { x: { type: 'int' } },
          outputs: { result: { type: 'int' } }
        };
        export default async function({ x }) {
          return { result: x + 1 };
        }
      `;

			synthase = new Synthase(script);

			// First call should compile and cache
			const result1 = await synthase.call({ x: 5 });
			expect(result1).toEqual({ result: 6 });

			// Second call should use cache
			const result2 = await synthase.call({ x: 10 });
			expect(result2).toEqual({ result: 11 });

			// Check cache stats
			const stats = synthase.getCacheStats();
			expect(stats.totalEntries).toBe(1);
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

			synthase = new Synthase(script);
			synthase.setCachePolicy({ maxAge: 100, maxSize: 5 });

			await synthase.call({});

			// Wait for cache to expire
			await new Promise((resolve) => setTimeout(resolve, 150));

			// This should work even with expired cache
			await synthase.call({});
		});
	});

	describe("Configuration", () => {
		it("should accept execution limits configuration", async () => {
			const script = `
        export const io = {
          inputs: {},
          outputs: { result: { type: 'string' } }
        };
        export default async function({}, { Utils }) {
          await Utils.delay(100);
          return { result: 'completed' };
        }
      `;

			synthase = new Synthase(script, {
				limits: {
					timeout: 50, // 50ms timeout
				},
			});

			await expect(synthase.call({})).rejects.toThrow("timeout");
		});

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

			synthase = new Synthase(mainScript, { registry });
			const result = await synthase.call({ number: 21 });

			expect(result).toEqual({ result: 42 });
		});
	});

	describe("Error Handling", () => {
		it("should handle script syntax errors", async () => {
			const invalidScript = `
      export const io = {
        inputs: {},
        outputs: {}
      };
      // Missing export default function
    `;

			await expect(
				(async () => {
					synthase = new Synthase(invalidScript);
					await synthase.waitForInitialization();
				})()
			).rejects.toThrow(
				/No default function export found|Missing required.*export default function/
			);
		});

		it("should handle runtime errors gracefully", async () => {
			const script = `
        export const io = {
          inputs: {},
          outputs: { result: { type: 'string' } }
        };
        export default async function() {
          throw new Error('Runtime error');
        }
      `;

			synthase = new Synthase(script);
			await expect(synthase.call({})).rejects.toThrow("Runtime error");
		});

		it("should handle missing IO schema", async () => {
			const invalidScript = `
      export default async function() {
        return { result: 'no io schema' };
      }
    `;

			await expect(
				(async () => {
					synthase = new Synthase(invalidScript);
					await synthase.waitForInitialization();
				})()
			).rejects.toThrow(
				/No.*io.*export found|Missing required.*export const io/
			);
		});
	});

	describe("Lifecycle Management", () => {
		it("should support hot reloading", async () => {
			let scriptContent = `
        export const io = {
          inputs: {},
          outputs: { version: { type: 'int' } }
        };
        export default async function() {
          return { version: 1 };
        }
      `;

			const getScript = () => scriptContent;
			synthase = new Synthase(getScript);

			const result1 = await synthase.call({});
			expect(result1).toEqual({ version: 1 });

			// Update script
			scriptContent = `
        export const io = {
          inputs: {},
          outputs: { version: { type: 'int' } }
        };
        export default async function() {
          return { version: 2 };
        }
      `;

			await synthase.reload();
			const result2 = await synthase.call({});
			expect(result2).toEqual({ version: 2 });
		});

		it("should clean up resources on dispose", async () => {
			const script = `
        export const io = {
          inputs: {},
          outputs: { result: { type: 'string' } }
        };
        export default async function() {
          return { result: 'test' };
        }
      `;

			synthase = new Synthase(script);
			await synthase.call({});

			const statsBefore = synthase.getCacheStats();
			expect(statsBefore.totalEntries).toBeGreaterThan(0);

			synthase.dispose();

			const statsAfter = synthase.getCacheStats();
			expect(statsAfter.totalEntries).toBe(0);
		});

		it("should handle initialization failures", async () => {
			const scriptResolver = async () => {
				throw new Error("Failed to load script");
			};

			synthase = new Synthase(scriptResolver);
			await expect(synthase.call({})).rejects.toThrow("Failed to load script");
		});
	});

	describe("IO Schema Access", () => {
		it("should provide access to IO schema", async () => {
			const script = `
        export const io = {
          inputs: {
            name: { type: 'string', default: 'test' },
            count: { type: 'int', min: 1, max: 10 }
          },
          outputs: {
            greeting: { type: 'string' }
          }
        };
        export default async function({ name, count }) {
          return { greeting: \`Hello \${name} x\${count}\` };
        }
      `;

			synthase = new Synthase(script);
			await synthase.waitForInitialization();

			const io = synthase.getIO();
			expect(io).toBeDefined();
			expect(io?.inputs).toHaveProperty("name");
			expect(io?.inputs).toHaveProperty("count");
			expect(io?.outputs).toHaveProperty("greeting");
		});

		it("should provide access to dependencies", async () => {
			const script = `
        export const io = {
          inputs: {},
          outputs: { result: { type: 'string' } }
        };
        export default async function({}, { importScript }) {
          await importScript('dependency1');
          await importScript('dependency2');
          return { result: 'done' };
        }
      `;

			synthase = new Synthase(script);
			await synthase.waitForInitialization();

			const deps = synthase.getDependencies();
			expect(deps).toEqual(["dependency1", "dependency2"]);
		});
	});
});
