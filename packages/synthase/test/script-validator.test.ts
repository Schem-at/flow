// test/script-validator.test.ts
import { describe, it, expect, beforeEach } from "bun:test";
import { ScriptValidator } from "../src/script-validator";
import { expectWarningsToInclude } from "./utils";
describe("ScriptValidator", () => {
	let validator: ScriptValidator;

	beforeEach(() => {
		validator = new ScriptValidator();
	});

	describe("Valid Scripts", () => {
		it("should validate a basic script", () => {
			const script = `
        export const io = {
          inputs: {
            message: { type: 'string', default: 'Hello' }
          },
          outputs: {
            result: { type: 'string' }
          }
        };

        export default async function({ message }) {
          return { result: message };
        }
      `;

			const result = validator.validateScript(script);
			expect(result.valid).toBe(true);
			expect(result.errors).toHaveLength(0);
		});

		it("should validate scripts with complex IO schemas", () => {
			const script = `
        export const io = {
          inputs: {
            count: { type: 'int', min: 1, max: 100, default: 10 },
            mode: { type: 'string', options: ['fast', 'slow'], default: 'fast' },
            advanced: { type: 'boolean', default: false },
            threshold: { type: 'float', dependsOn: { advanced: true } }
          },
          outputs: {
            result: { type: 'array' },
            metadata: { type: 'object' }
          }
        };

        export default async function({ count, mode, advanced, threshold }) {
          return { 
            result: Array(count).fill(mode),
            metadata: { advanced, threshold }
          };
        }
      `;

			const result = validator.validateScript(script);
			expect(result.valid).toBe(true);
			expect(result.errors).toHaveLength(0);
		});

		it("should allow arrow function syntax", () => {
			const script = `
        export const io = {
          inputs: { x: { type: 'int' } },
          outputs: { result: { type: 'int' } }
        };

        export default async ({ x }) => {
          return { result: x * 2 };
        }
      `;

			const result = validator.validateScript(script);
			expect(result.valid).toBe(true);
		});
	});

	describe("Missing Required Elements", () => {
		it("should reject scripts without io export", () => {
			const script = `
        export default async function() {
          return { result: 'no io' };
        }
      `;

			const result = validator.validateScript(script);
			expect(result.valid).toBe(false);
			expect(result.errors).toContain(
				"Missing required 'export const io = ...' declaration"
			);
		});

		it("should reject scripts without default export", () => {
			const script = `
        export const io = {
          inputs: {},
          outputs: {}
        };
        // Missing export default function
      `;

			const result = validator.validateScript(script);
			expect(result.valid).toBe(false);
			expect(result.errors).toContain(
				"Missing required 'export default function' declaration"
			);
		});
	});

	describe("Dangerous Patterns", () => {
		it("should detect eval usage", () => {
			const script = `
        export const io = { inputs: {}, outputs: {} };
        export default async function() {
          eval('console.log("dangerous")');
          return {};
        }
      `;

			const result = validator.validateScript(script);
			expect(result.valid).toBe(false);
			expect(result.errors).toContain("Use of eval() is prohibited");
		});

		it("should detect Function constructor", () => {
			const script = `
        export const io = { inputs: {}, outputs: {} };
        export default async function() {
          const fn = new Function('return 1');
          return {};
        }
      `;

			const result = validator.validateScript(script);
			expect(result.valid).toBe(false);
			expect(result.errors).toContain(
				"Use of Function constructor is prohibited"
			);
		});

		it("should detect infinite loops", () => {
			const script = `
        export const io = { inputs: {}, outputs: {} };
        export default async function() {
          while (true) {
            // infinite loop
          }
          return {};
        }
      `;

			const result = validator.validateScript(script);
			expect(result.valid).toBe(false);
			expect(result.errors).toContain("Potential infinite while loop detected");
		});

		it("should detect prototype manipulation", () => {
			const script = `
        export const io = { inputs: {}, outputs: {} };
        export default async function() {
          Object.prototype.polluted = true;
          return {};
        }
      `;

			const result = validator.validateScript(script);
			expect(result.valid).toBe(false);
			expect(result.errors).toContain("Prototype manipulation is prohibited");
		});

		it("should detect very large loops", () => {
			const script = `
        export const io = { inputs: {}, outputs: {} };
        export default async function() {
          for (let i = 0; i < 1000000; i++) {
            // potentially dangerous
          }
          return {};
        }
      `;

			const result = validator.validateScript(script);
			expect(result.valid).toBe(false);
			expect(result.errors).toContain(
				"Very large loop detected - potential DoS"
			);
		});

		it("should detect setInterval usage", () => {
			const script = `
        export const io = { inputs: {}, outputs: {} };
        export default async function() {
          setInterval(() => {}, 1000);
          return {};
        }
      `;

			const result = validator.validateScript(script);
			expect(result.valid).toBe(false);
			expect(result.errors).toContain("Use of setInterval is discouraged");
		});
	});

	describe("Structural Validation", () => {
		it("should detect unmatched braces", () => {
			const script = `
        export const io = { inputs: {}, outputs: {} };
        export default async function() {
          if (true) {
            // missing closing brace
          return {};
        }
      `;

			const result = validator.validateScript(script);
			expect(result.valid).toBe(false);
			expect(result.errors).toContain("Unmatched braces detected");
		});

		it("should detect unmatched quotes", () => {
			const script = `
        export const io = { inputs: {}, outputs: {} };
        export default async function() {
          const message = "unmatched quote;
          return { result: message };
        }
      `;

			const result = validator.validateScript(script);
			expect(result.valid).toBe(false);
			expect(result.errors).toContain("Unmatched quotes detected");
		});

		it("should warn about very long lines", () => {
			const longLine = "a".repeat(1500);
			const script = `
        export const io = { inputs: {}, outputs: {} };
        export default async function() {
          const longString = "${longLine}";
          return { result: longString };
        }
      `;

			const result = validator.validateScript(script);
			// expect(result.warnings).toContain(
			// 	expect.stringContaining("Very long line detected")
			// );
			expectWarningsToInclude(result.warnings, "Very long line detected");
		});

		it("should warn about high nesting levels", () => {
			const script = `
        export const io = { inputs: {}, outputs: {} };
        export default async function() {
          if (true) {
            if (true) {
              if (true) {
                if (true) {
                  if (true) {
                    if (true) {
                      if (true) {
                        if (true) {
                          if (true) {
                            if (true) {
                              if (true) {
                                // deeply nested
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
          return {};
        }
      `;

			const result = validator.validateScript(script);
			expectWarningsToInclude(result.warnings, "High nesting level");
		});

		it("should warn about very large scripts", () => {
			const largeContent = 'console.log("padding");\n'.repeat(5000);
			const script = `
        export const io = { inputs: {}, outputs: {} };
        export default async function() {
          ${largeContent}
          return {};
        }
      `;

			const result = validator.validateScript(script);
			expect(result.warnings).toContain(
				"Script is very large - consider breaking into smaller modules"
			);
		});
	});

	describe("IO Schema Validation", () => {
		it("should validate correct IO schemas", () => {
			const script = `
        export const io = {
          inputs: {
            name: { type: 'string', default: 'test' },
            count: { type: 'int', min: 1, max: 10 },
            options: { type: 'array', itemType: 'string' }
          },
          outputs: {
            result: { type: 'object' }
          }
        };
        export default async function() { return {}; }
      `;

			const result = validator.validateScript(script);
			expect(result.valid).toBe(true);
		});

		it("should reject invalid parameter types", () => {
			const script = `
        export const io = {
          inputs: {
            invalid: { type: 'invalid_type' }
          },
          outputs: {}
        };
        export default async function() { return {}; }
      `;

			const result = validator.validateScript(script);
			expect(result.valid).toBe(false);
			expect(result.errors).toContain(
				"Invalid parameter type 'invalid_type' for inputs.invalid"
			);
		});

		it("should reject invalid ranges", () => {
			const script = `
        export const io = {
          inputs: {
            bad_range: { type: 'int', min: 10, max: 5 }
          },
          outputs: {}
        };
        export default async function() { return {}; }
      `;

			const result = validator.validateScript(script);
			expect(result.valid).toBe(false);
			expect(result.errors).toContain(
				"Invalid range for inputs.bad_range: min (10) > max (5)"
			);
		});

		it("should reject non-array options", () => {
			const script = `
        export const io = {
          inputs: {
            mode: { type: 'string', options: 'not an array' }
          },
          outputs: {}
        };
        export default async function() { return {}; }
      `;

			const result = validator.validateScript(script);
			expect(result.valid).toBe(false);
			expect(result.errors).toContain(
				"Options for inputs.mode must be an array"
			);
		});

		it("should warn about large option lists", () => {
			const manyOptions = Array.from({ length: 150 }, (_, i) => `option${i}`);
			const script = `
        export const io = {
          inputs: {
            choice: { type: 'string', options: ${JSON.stringify(manyOptions)} }
          },
          outputs: {}
        };
        export default async function() { return {}; }
      `;

			const result = validator.validateScript(script);

			expectWarningsToInclude(result.warnings, "Large options list (150)");
		});

		it("should require inputs and outputs objects", () => {
			const script = `
        export const io = {
          // missing inputs and outputs
        };
        export default async function() { return {}; }
      `;

			const result = validator.validateScript(script);
			expect(result.valid).toBe(false);
			expect(result.errors).toContain("IO schema must have an 'inputs' object");
			expect(result.errors).toContain(
				"IO schema must have an 'outputs' object"
			);
		});

		it("should handle legacy string type definitions", () => {
			const script = `
        export const io = {
          inputs: {
            message: 'string',
            count: 'int'
          },
          outputs: {
            result: 'string'
          }
        };
        export default async function() { return {}; }
      `;

			const result = validator.validateScript(script);
			expect(result.valid).toBe(true);
		});
	});

	describe("Custom Validation Rules", () => {
		it("should allow adding custom dangerous patterns", () => {
			validator.addDangerousPattern(
				/badFunction\s*\(/,
				"Use of badFunction is prohibited"
			);

			const script = `
        export const io = { inputs: {}, outputs: {} };
        export default async function() {
          badFunction();
          return {};
        }
      `;

			const result = validator.validateScript(script);
			expect(result.valid).toBe(false);
			expect(result.errors).toContain("Use of badFunction is prohibited");
		});

		it("should allow removing dangerous patterns", () => {
			validator.addDangerousPattern(/testPattern/, "Test pattern");
			validator.removeDangerousPattern("Test pattern");

			const script = `
        export const io = { inputs: {}, outputs: {} };
        export default async function() {
          testPattern();
          return {};
        }
      `;

			const result = validator.validateScript(script);
			// Should not fail for the removed pattern (but might fail for other reasons)
			expect(result.errors).not.toContain("Test pattern");
		});
	});

	describe("Comment Handling", () => {
		it("should ignore patterns inside comments", () => {
			const script = `
        export const io = { inputs: {}, outputs: {} };
        export default async function() {
          // This eval('test') is in a comment
          /* 
           * This while(true) is also in a comment
           * eval('another one')
           */
          return {};
        }
      `;

			const result = validator.validateScript(script);
			expect(result.valid).toBe(true);
		});

		it("should ignore patterns inside strings", () => {
			const script = `
        export const io = { inputs: {}, outputs: {} };
        export default async function() {
          const message = "This contains eval() but it's in a string";
          const template = \`while(true) in template\`;
          return { message };
        }
      `;

			const result = validator.validateScript(script);
			expect(result.valid).toBe(true);
		});
	});

	describe("Edge Cases", () => {
		it("should handle empty scripts", () => {
			const result = validator.validateScript("");
			expect(result.valid).toBe(false);
			expect(result.errors.length).toBeGreaterThan(0);
		});

		it("should handle scripts with only whitespace", () => {
			const result = validator.validateScript("   \n\t  \n  ");
			expect(result.valid).toBe(false);
		});

		it("should handle malformed IO schemas", () => {
			const script = `
        export const io = "not an object";
        export default async function() { return {}; }
      `;

			const result = validator.validateScript(script);
			expect(result.valid).toBe(false);
			expect(result.errors).toContain("IO schema must be an object");
		});

		it("should handle scripts without ES6 modules", () => {
			const script = `
        function regularFunction() {
          return { result: 'not a module' };
        }
      `;

			const result = validator.validateScript(script);
			expect(result.valid).toBe(false);
			expect(result.errors).toContain(
				"No export statements found - scripts must be ES6 modules"
			);
		});
	});
});
