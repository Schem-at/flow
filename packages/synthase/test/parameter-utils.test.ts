// test/parameter-utils.test.ts
import { describe, it, expect } from "bun:test";
import {
	ParameterUtils,
	type ParameterSpec,
	type ParameterDef,
} from "../src/types";

describe("ParameterUtils", () => {
	describe("normalize()", () => {
		it("should normalize string types to ParameterDef", () => {
			const result = ParameterUtils.normalize("string");
			expect(result).toEqual({ type: "string" });
		});

		it("should return ParameterDef as-is", () => {
			const param: ParameterDef = {
				type: "int",
				default: 5,
				min: 1,
				max: 10,
			};

			const result = ParameterUtils.normalize(param);
			expect(result).toEqual(param);
		});
	});

	describe("getDefault()", () => {
		it("should return explicit default values", () => {
			const param: ParameterDef = { type: "string", default: "custom" };
			expect(ParameterUtils.getDefault(param)).toBe("custom");
		});

		it("should return sensible defaults for basic types", () => {
			expect(ParameterUtils.getDefault({ type: "int" })).toBe(0);
			expect(ParameterUtils.getDefault({ type: "float" })).toBe(0.0);
			expect(ParameterUtils.getDefault({ type: "string" })).toBe("");
			expect(ParameterUtils.getDefault({ type: "boolean" })).toBe(false);
			expect(ParameterUtils.getDefault({ type: "object" })).toEqual({});
			expect(ParameterUtils.getDefault({ type: "array" })).toEqual([]);
		});

		it("should handle string type specs", () => {
			expect(ParameterUtils.getDefault("string")).toBe("");
			expect(ParameterUtils.getDefault("int")).toBe(0);
		});
	});

	describe("applyDefaults()", () => {
		it("should apply defaults for missing inputs", () => {
			const schema = {
				name: { type: "string", default: "Anonymous" },
				age: { type: "int", default: 18 },
				active: { type: "boolean", default: true },
			} as Record<string, ParameterSpec>;

			const inputs = { name: "John" };
			const result = ParameterUtils.applyDefaults(inputs, schema);

			expect(result).toEqual({
				name: "John",
				age: 18,
				active: true,
			});
		});

		it("should not override provided values", () => {
			const schema = {
				count: { type: "int", default: 1 },
			} as Record<string, ParameterSpec>;

			const inputs = { count: 5 };
			const result = ParameterUtils.applyDefaults(inputs, schema);

			expect(result).toEqual({ count: 5 });
		});

		it("should handle empty inputs", () => {
			const schema = {
				message: { type: "string", default: "Hello" },
				enabled: { type: "boolean", default: false },
			} as Record<string, ParameterSpec>;

			const result = ParameterUtils.applyDefaults({}, schema);

			expect(result).toEqual({
				message: "Hello",
				enabled: false,
			});
		});
	});

	describe("validateParameter()", () => {
		describe("integer validation", () => {
			it("should validate integer values", () => {
				const spec: ParameterDef = { type: "int", min: 1, max: 10 };

				expect(() =>
					ParameterUtils.validateParameter(5, spec, "count")
				).not.toThrow();
				expect(() =>
					ParameterUtils.validateParameter(1, spec, "count")
				).not.toThrow();
				expect(() =>
					ParameterUtils.validateParameter(10, spec, "count")
				).not.toThrow();
			});

			it("should reject non-integer values", () => {
				const spec: ParameterDef = { type: "int" };

				expect(() =>
					ParameterUtils.validateParameter(3.14, spec, "count")
				).toThrow("count must be an integer");
				expect(() =>
					ParameterUtils.validateParameter("5", spec, "count")
				).toThrow("count must be an integer");
			});

			it("should validate min/max constraints", () => {
				const spec: ParameterDef = { type: "int", min: 1, max: 10 };

				expect(() =>
					ParameterUtils.validateParameter(0, spec, "count")
				).toThrow("count must be >= 1");
				expect(() =>
					ParameterUtils.validateParameter(11, spec, "count")
				).toThrow("count must be <= 10");
			});
		});

		describe("float validation", () => {
			it("should validate float values", () => {
				const spec: ParameterDef = { type: "float", min: 0.0, max: 1.0 };

				expect(() =>
					ParameterUtils.validateParameter(0.5, spec, "ratio")
				).not.toThrow();
				expect(() =>
					ParameterUtils.validateParameter(5, spec, "ratio")
				).toThrow(); // exceeds max
			});

			it("should reject non-numeric values", () => {
				const spec: ParameterDef = { type: "float" };

				expect(() =>
					ParameterUtils.validateParameter("not a number", spec, "value")
				).toThrow("value must be a number");
			});
		});

		describe("string validation", () => {
			it("should validate string values", () => {
				const spec: ParameterDef = { type: "string" };

				expect(() =>
					ParameterUtils.validateParameter("hello", spec, "message")
				).not.toThrow();
				expect(() =>
					ParameterUtils.validateParameter("", spec, "message")
				).not.toThrow();
			});

			it("should validate string options", () => {
				const spec: ParameterDef = {
					type: "string",
					options: ["red", "green", "blue"],
				};

				expect(() =>
					ParameterUtils.validateParameter("red", spec, "color")
				).not.toThrow();
				expect(() =>
					ParameterUtils.validateParameter("yellow", spec, "color")
				).toThrow("color must be one of: red, green, blue");
			});

			it("should reject non-string values", () => {
				const spec: ParameterDef = { type: "string" };

				expect(() =>
					ParameterUtils.validateParameter(123, spec, "message")
				).toThrow("message must be a string");
			});
		});

		describe("boolean validation", () => {
			it("should validate boolean values", () => {
				const spec: ParameterDef = { type: "boolean" };

				expect(() =>
					ParameterUtils.validateParameter(true, spec, "enabled")
				).not.toThrow();
				expect(() =>
					ParameterUtils.validateParameter(false, spec, "enabled")
				).not.toThrow();
			});

			it("should reject non-boolean values", () => {
				const spec: ParameterDef = { type: "boolean" };

				expect(() =>
					ParameterUtils.validateParameter(1, spec, "enabled")
				).toThrow("enabled must be a boolean");
				expect(() =>
					ParameterUtils.validateParameter("true", spec, "enabled")
				).toThrow("enabled must be a boolean");
			});
		});

		describe("object validation", () => {
			it("should validate object values", () => {
				const spec: ParameterDef = { type: "object" };

				expect(() =>
					ParameterUtils.validateParameter({}, spec, "config")
				).not.toThrow();
				expect(() =>
					ParameterUtils.validateParameter({ key: "value" }, spec, "config")
				).not.toThrow();
			});

			it("should reject non-object values", () => {
				const spec: ParameterDef = { type: "object" };

				expect(() =>
					ParameterUtils.validateParameter(null, spec, "config")
				).toThrow("config must be an object");
				expect(() =>
					ParameterUtils.validateParameter("{}", spec, "config")
				).toThrow("config must be an object");
			});
		});

		describe("array validation", () => {
			it("should validate array values", () => {
				const spec: ParameterDef = { type: "array" };

				expect(() =>
					ParameterUtils.validateParameter([], spec, "items")
				).not.toThrow();
				expect(() =>
					ParameterUtils.validateParameter([1, 2, 3], spec, "items")
				).not.toThrow();
			});

			it("should reject non-array values", () => {
				const spec: ParameterDef = { type: "array" };

				expect(() =>
					ParameterUtils.validateParameter({}, spec, "items")
				).toThrow("items must be an array");
				expect(() =>
					ParameterUtils.validateParameter("[]", spec, "items")
				).toThrow("items must be an array");
			});
		});
	});

	describe("shouldShowParameter()", () => {
		it("should show parameters without dependencies", () => {
			const spec: ParameterDef = { type: "string" };
			const inputs = { other: "value" };

			expect(ParameterUtils.shouldShowParameter(spec, inputs)).toBe(true);
		});

		it("should show parameters when dependencies are met", () => {
			const spec: ParameterDef = {
				type: "string",
				dependsOn: { advanced: true },
			};
			const inputs = { advanced: true, other: "value" };

			expect(ParameterUtils.shouldShowParameter(spec, inputs)).toBe(true);
		});

		it("should hide parameters when dependencies are not met", () => {
			const spec: ParameterDef = {
				type: "string",
				dependsOn: { advanced: true },
			};
			const inputs = { advanced: false };

			expect(ParameterUtils.shouldShowParameter(spec, inputs)).toBe(false);
		});

		it("should handle multiple dependencies", () => {
			const spec: ParameterDef = {
				type: "string",
				dependsOn: { advanced: true, enabled: "yes" },
			};

			// All dependencies met
			expect(
				ParameterUtils.shouldShowParameter(spec, {
					advanced: true,
					enabled: "yes",
				})
			).toBe(true);

			// Not all dependencies met
			expect(
				ParameterUtils.shouldShowParameter(spec, {
					advanced: true,
					enabled: "no",
				})
			).toBe(false);
		});

		it("should handle missing dependency values", () => {
			const spec: ParameterDef = {
				type: "string",
				dependsOn: { advanced: true },
			};
			const inputs = { other: "value" }; // missing 'advanced'

			expect(ParameterUtils.shouldShowParameter(spec, inputs)).toBe(false);
		});
	});

	describe("groupParameters()", () => {
		it("should group parameters by group property", () => {
			const schema = {
				name: { type: "string", group: "basic" },
				description: { type: "string", group: "basic" },
				advanced: { type: "boolean", group: "advanced" },
				threshold: { type: "float", group: "advanced" },
				ungrouped: { type: "string" },
			} as Record<string, ParameterSpec>;

			const groups = ParameterUtils.groupParameters(schema);

			expect(groups).toEqual({
				basic: ["name", "description"],
				advanced: ["advanced", "threshold"],
				default: ["ungrouped"],
			});
		});

		it("should handle parameters without groups", () => {
			const schema = {
				param1: { type: "string" },
				param2: { type: "int" },
			} as Record<string, ParameterSpec>;

			const groups = ParameterUtils.groupParameters(schema);

			expect(groups).toEqual({
				default: ["param1", "param2"],
			});
		});

		it("should handle empty schema", () => {
			const groups = ParameterUtils.groupParameters({});

			expect(groups).toEqual({
				default: [],
			});
		});

		it("should handle string type specs", () => {
			const schema = {
				name: "string",
				count: "int",
			} as Record<string, ParameterSpec>;

			const groups = ParameterUtils.groupParameters(schema);

			expect(groups).toEqual({
				default: ["name", "count"],
			});
		});
	});

	describe("Integration tests", () => {
		it("should work with complex parameter definitions", () => {
			const schema = {
				mode: {
					type: "string",
					options: ["simple", "advanced"],
					default: "simple",
				},
				complexity: {
					type: "int",
					min: 1,
					max: 10,
					default: 5,
					dependsOn: { mode: "advanced" },
				},
				settings: {
					type: "object",
					default: {},
				},
			} as Record<string, ParameterSpec>;

			// Test with simple mode
			const simpleInputs = { mode: "simple" };
			const simpleWithDefaults = ParameterUtils.applyDefaults(
				simpleInputs,
				schema
			);

			expect(simpleWithDefaults).toEqual({
				mode: "simple",
				complexity: 5,
				settings: {},
			});

			// complexity should be hidden in simple mode
			expect(
				ParameterUtils.shouldShowParameter(
					schema.complexity,
					simpleWithDefaults
				)
			).toBe(false);

			// Test with advanced mode
			const advancedInputs = { mode: "advanced", complexity: 8 };
			const advancedWithDefaults = ParameterUtils.applyDefaults(
				advancedInputs,
				schema
			);

			expect(
				ParameterUtils.shouldShowParameter(
					schema.complexity,
					advancedWithDefaults
				)
			).toBe(true);

			// Validate the complexity value
			expect(() =>
				ParameterUtils.validateParameter(8, schema.complexity, "complexity")
			).not.toThrow();
			expect(() =>
				ParameterUtils.validateParameter(15, schema.complexity, "complexity")
			).toThrow();
		});

		it("should handle validation errors gracefully", () => {
			const schema = {
				email: {
					type: "string",
					// This would be a custom validation in a real implementation
				},
				age: {
					type: "int",
					min: 0,
					max: 150,
				},
			} as Record<string, ParameterSpec>;

			const inputs = { email: "valid@email.com", age: 25 };
			const withDefaults = ParameterUtils.applyDefaults(inputs, schema);

			// Validate each parameter
			expect(() =>
				ParameterUtils.validateParameter(
					withDefaults.email,
					schema.email,
					"email"
				)
			).not.toThrow();
			expect(() =>
				ParameterUtils.validateParameter(withDefaults.age, schema.age, "age")
			).not.toThrow();

			// Test invalid age
			expect(() =>
				ParameterUtils.validateParameter(200, schema.age, "age")
			).toThrow("must be <= 150");
		});
	});
});
