// script-validator.ts
/**
 * Validates script content for safety and correctness
 */
export class ScriptValidator {
	private dangerousPatterns = [
		// Infinite loops
		{
			pattern: /while\s*\(\s*true\s*\)/,
			message: "Potential infinite while loop detected",
		},
		{
			pattern: /for\s*\(\s*;\s*;\s*\)/,
			message: "Potential infinite for loop detected",
		},
		{
			pattern: /for\s*\(\s*;[^;]*;\s*\)/,
			message: "Potential infinite for loop (no increment) detected",
		},

		// Dangerous globals access
		{ pattern: /eval\s*\(/, message: "Use of eval() is prohibited" },
		{
			pattern: /Function\s*\(/,
			message: "Use of Function constructor is prohibited",
		},
		{
			pattern: /setTimeout\s*\([^,]*,\s*0\s*\)/,
			message: "Zero-delay setTimeout may cause performance issues",
		},
		{
			pattern: /setInterval\s*\(/,
			message: "Use of setInterval is discouraged",
		},

		// File system access (in browser context)
		{
			pattern: /require\s*\(\s*['"]fs['"]/,
			message: "File system access is not allowed",
		},
		{
			pattern: /import.*['"]fs['"]/,
			message: "File system access is not allowed",
		},

		// Network access patterns that might be suspicious
		{
			pattern: /fetch\s*\([^)]*document\.location/,
			message: "Fetching from document.location may be suspicious",
		},
		{
			pattern: /XMLHttpRequest/,
			message: "Direct XMLHttpRequest usage is discouraged - use fetch instead",
		},

		// Prototype pollution attempts
		{ pattern: /__proto__/, message: "Prototype manipulation is prohibited" },
		{
			pattern: /constructor\.prototype/,
			message: "Prototype manipulation is prohibited",
		},
		// Add missing Object.prototype pattern
		{
			pattern: /Object\.prototype/,
			message: "Prototype manipulation is prohibited",
		},

		// Very large loops (potential DoS)
		{
			pattern: /for\s*\([^)]*[0-9]{6,}/,
			message: "Very large loop detected - potential DoS",
		},
		{
			pattern: /while\s*\([^)]*[0-9]{6,}/,
			message: "Very large loop detected - potential DoS",
		},
	];

	private requiredPatterns = [
		{
			pattern: /export\s+const\s+io\s*=/,
			message: "Missing required 'export const io = ...' declaration",
		},
		{
			pattern: /export\s+default/,
			message: "Missing required 'export default function' declaration",
		},
	];

	/**
	 * Remove comments from code
	 */
	private stripComments(content: string): string {
		let result = "";
		let inString = false;
		let stringChar = "";
		let inSingleLineComment = false;
		let inMultiLineComment = false;
		let escapeNext = false; // <<< FIX: Use a stateful flag for escapes

		for (let i = 0; i < content.length; i++) {
			const char = content[i];
			const nextChar = content[i + 1];

			if (escapeNext) {
				escapeNext = false;
			} else if (char === "\\") {
				escapeNext = true;
			} else if (!inSingleLineComment && !inMultiLineComment) {
				if (char === '"' || char === "'" || char === "`") {
					if (!inString) {
						inString = true;
						stringChar = char;
					} else if (char === stringChar) {
						inString = false;
						stringChar = "";
					}
				}
			}

			if (!inString && !escapeNext) {
				if (char === "/" && nextChar === "/" && !inMultiLineComment) {
					inSingleLineComment = true;
					i++;
					continue;
				}
				if (char === "/" && nextChar === "*" && !inSingleLineComment) {
					inMultiLineComment = true;
					i++;
					continue;
				}
			}

			if (inMultiLineComment && char === "*" && nextChar === "/") {
				inMultiLineComment = false;
				i++;
				continue;
			}

			if (inSingleLineComment && char === "\n") {
				inSingleLineComment = false;
			}

			if (!inSingleLineComment && !inMultiLineComment) {
				result += char;
			} else if (char === "\n") {
				result += char;
			}
		}
		return result;
	}

	/**
	 * Replace string content with spaces to maintain structure
	 */
	private maskStrings(content: string): string {
		let result = "";
		let inString = false;
		let stringChar = "";
		let escapeNext = false;

		for (let i = 0; i < content.length; i++) {
			const char = content[i];

			if (escapeNext) {
				result += inString ? " " : char;
				escapeNext = false;
				continue;
			}

			if (char === "\\") {
				escapeNext = true;
				result += inString ? " " : char;
				continue;
			}

			if ((char === '"' || char === "'" || char === "`") && !inString) {
				inString = true;
				stringChar = char;
				result += char;
			} else if (inString && char === stringChar) {
				inString = false;
				stringChar = "";
				result += char;
			} else if (inString) {
				result += " ";
			} else {
				result += char;
			}
		}

		return result;
	}

	/**
	 * Validate script content
	 */
	validateScript(content: string): {
		valid: boolean;
		errors: string[];
		warnings: string[];
	} {
		const errors: string[] = [];
		const warnings: string[] = [];

		const strippedContent = this.stripComments(content);
		const maskedContent = this.maskStrings(strippedContent);

		for (const required of this.requiredPatterns) {
			if (!required.pattern.test(strippedContent)) {
				errors.push(required.message);
			}
		}

		for (const danger of this.dangerousPatterns) {
			if (danger.pattern.test(maskedContent)) {
				errors.push(danger.message);
			}
		}

		this.validateStructure(content, errors, warnings);

		this.validateIOSchema(strippedContent, errors, warnings);

		return {
			valid: errors.length === 0,
			errors: [...errors],
			warnings: [...warnings],
		};
	}

	/**
	 * Validate script structure
	 */
	private validateStructure(
		content: string,
		errors: string[],
		warnings: string[]
	): void {
		if (!this.hasMatchedQuotes(content)) {
			errors.push("Unmatched quotes detected");
			return;
		}

		if (!content.includes("export")) {
			errors.push("No export statements found - scripts must be ES6 modules");
			return;
		}

		const braceBalance = this.checkBraceBalance(content);
		if (braceBalance !== 0) {
			errors.push("Unmatched braces detected");
		}

		const lines = content.split("\n");
		for (let i = 0; i < lines.length; i++) {
			if (lines[i].length > 1000) {
				if (
					lines[i].includes("options:") &&
					lines[i].includes("[") &&
					lines[i].includes("]")
				) {
					continue;
				}
				if (lines[i].includes("accept:") && lines[i].includes("'")) {
					continue; // Allow long accept strings for file inputs
				}

				warnings.push(
					`Very long line detected at line ${i + 1} - possible minified code`
				);
				break;
			}
		}

		const maxNesting = this.getMaxNestingLevel(content);
		if (maxNesting > 10) {
			warnings.push(
				`High nesting level (${maxNesting}) detected - consider refactoring`
			);
		}

		if (content.length > 100000) {
			warnings.push(
				"Script is very large - consider breaking into smaller modules"
			);
		}
	}

	/**
	 * Check if quotes are properly matched in code
	 */
	private hasMatchedQuotes(content: string): boolean {
		let inString = false;
		let stringChar: '"' | "'" | "`" | "" = "";
		let inComment = false;

		for (let i = 0; i < content.length; i++) {
			const ch = content[i];
			const nxt = content[i + 1];

			/* ---- comment state machine ---- */
			if (!inString) {
				if (!inComment && ch === "/" && nxt === "/") {
					inComment = true;
					i++;
					continue;
				}
				if (!inComment && ch === "/" && nxt === "*") {
					inComment = true;
					i++;
					continue;
				}
				if (inComment && ch === "\n") {
					inComment = false;
					continue;
				}
				if (inComment && ch === "*" && nxt === "/") {
					inComment = false;
					i++;
					continue;
				}
			}
			if (inComment) continue;

			/* ---- string state machine ---- */
			if (!inString && (ch === '"' || ch === "'" || ch === "`")) {
				inString = true;
				stringChar = ch;
				continue;
			}
			if (inString && ch === stringChar && content[i - 1] !== "\\") {
				inString = false;
				stringChar = "";
				continue;
			}
		}

		// We're valid if we closed every open string (and comment)
		return !inString && !inComment;
	}

	/**
	 * Validate IO schema structure
	 */
	private validateIOSchema(
		content: string,
		errors: string[],
		warnings: string[]
	): void {
		try {
			const stringIoMatch = content.match(
				/export\s+const\s+io\s*=\s*["'`][^"'`]*["'`]/
			);
			if (stringIoMatch) {
				errors.push("IO schema must be an object");
				return;
			}

			const ioMatch = content.match(
				/export\s+const\s+io\s*=\s*(\{[\s\S]*?\});/
			);
			if (!ioMatch) {
				const altMatch = content.match(
					/export\s+const\s+io\s*=\s*(\{[\s\S]*?\})/
				);
				if (!altMatch) return;
			}

			const ioText = ioMatch
				? ioMatch[1]
				: content.match(/export\s+const\s+io\s*=\s*(\{[\s\S]*?\})/)?.[1];
			if (!ioText) return;

			// DANGEROUS: but it's the whole point of this project
			const ioSchema = (0, eval)(`(${ioText})`);

			if (typeof ioSchema !== "object" || ioSchema === null) {
				errors.push("IO schema must be an object");
				return;
			}

			if (!ioSchema.inputs || typeof ioSchema.inputs !== "object") {
				errors.push("IO schema must have an 'inputs' object");
			}

			if (!ioSchema.outputs || typeof ioSchema.outputs !== "object") {
				errors.push("IO schema must have an 'outputs' object");
			}

			if (ioSchema.inputs) {
				this.validateParameterDefinitions(
					ioSchema.inputs,
					"inputs",
					errors,
					warnings
				);
			}

			if (ioSchema.outputs) {
				this.validateParameterDefinitions(
					ioSchema.outputs,
					"outputs",
					errors,
					warnings
				);
			}
		} catch (ioError: any) {
			errors.push(`Invalid IO schema: ${ioError.message}`);
		}
	}

	/**
	 * Validate parameter definitions in IO schema
	 */
	private validateParameterDefinitions(
		params: any,
		section: string,
		errors: string[],
		warnings: string[]
	): void {
		const validTypes = [
			"int",
			"integer", // Allow both int and integer
			"float",
			"number", // Allow both float and number
			"string",
			"text", // Allow both string and text
			"boolean",
			"bool", // Allow both boolean and bool
			"object",
			"array",
			"file", // NEW: File input support
			"BlockId", // Keep existing custom type
		];

		for (const [key, param] of Object.entries(params)) {
			if (typeof param === "string") {
				if (!validTypes.includes(param)) {
					errors.push(
						`Invalid parameter type '${param}' for ${section}.${key}`
					);
				}
			} else if (typeof param === "object" && param !== null) {
				const paramObj = param as any;

				if (!paramObj.type || !validTypes.includes(paramObj.type)) {
					errors.push(
						`Invalid parameter type '${
							paramObj.type || "undefined"
						}' for ${section}.${key}`
					);
				}

				// Numeric validation (support both int/integer and float/number)
				if (paramObj.type === "int" || paramObj.type === "integer" || 
					paramObj.type === "float" || paramObj.type === "number") {
					if (
						paramObj.min !== undefined &&
						paramObj.max !== undefined &&
						paramObj.min > paramObj.max
					) {
						errors.push(
							`Invalid range for ${section}.${key}: min (${paramObj.min}) > max (${paramObj.max})`
						);
					}
				}

				// String validation (support both string and text)
				if (paramObj.type === "string" || paramObj.type === "text") {
					if (paramObj.options && !Array.isArray(paramObj.options)) {
						errors.push(`Options for ${section}.${key} must be an array`);
					}

					if (
						paramObj.options &&
						Array.isArray(paramObj.options) &&
						paramObj.options.length > 100
					) {
						warnings.push(
							`Large options list (${paramObj.options.length}) for ${section}.${key} - consider using autocomplete`
						);
					}
				}

				// NEW: File input validation
				if (paramObj.type === "file") {
					if (paramObj.accept && typeof paramObj.accept !== "string") {
						errors.push(`Accept property for ${section}.${key} must be a string`);
					}
					if (paramObj.maxSize !== undefined) {
						if (typeof paramObj.maxSize !== "number" || paramObj.maxSize <= 0) {
							errors.push(`maxSize for ${section}.${key} must be a positive number`);
						}
						// Warn about very large file sizes
						if (paramObj.maxSize > 100 * 1024 * 1024) { // 100MB
							warnings.push(`Very large maxSize (${Math.round(paramObj.maxSize / 1024 / 1024)}MB) for ${section}.${key} - consider smaller limits`);
						}
					}
					if (paramObj.readAs) {
						const validReadModes = ["text", "json", "dataURL", "arrayBuffer", "binaryString"];
						if (!validReadModes.includes(paramObj.readAs)) {
							errors.push(`Invalid readAs mode '${paramObj.readAs}' for ${section}.${key}. Valid modes: ${validReadModes.join(', ')}`);
						}
					}
				}

				// NEW: Basic conditional dependency validation
				if (paramObj.dependsOn && typeof paramObj.dependsOn === "object") {
					const allInputKeys = Object.keys(params);
					for (const depKey of Object.keys(paramObj.dependsOn)) {
						if (!allInputKeys.includes(depKey)) {
							errors.push(`Input '${key}' depends on non-existent input '${depKey}'`);
						}
					}
				}

			} else {
				errors.push(
					`Invalid parameter definition for ${section}.${key} - must be string or object`
				);
			}
		}
	}

	/**
	 * Check brace balance in code
	 */
	private checkBraceBalance(content: string): number {
		let balance = 0;
		let inString = false;
		let inComment = false;
		let stringChar = "";

		for (let i = 0; i < content.length; i++) {
			const char = content[i];
			const nextChar = content[i + 1];

			if (!inComment && (char === '"' || char === "'" || char === "`")) {
				if (!inString) {
					inString = true;
					stringChar = char;
				} else if (char === stringChar && content[i - 1] !== "\\") {
					inString = false;
					stringChar = "";
				}
				continue;
			}

			if (!inString) {
				if (char === "/" && nextChar === "/") {
					inComment = true;
					continue;
				}
				if (char === "/" && nextChar === "*") {
					inComment = true;
					continue;
				}
				if (inComment && char === "\n") {
					inComment = false;
					continue;
				}
				if (inComment && char === "*" && nextChar === "/") {
					inComment = false;
					i++;
					continue;
				}
			}

			if (!inString && !inComment) {
				if (char === "{") balance++;
				if (char === "}") balance--;
			}
		}

		return balance;
	}

	/**
	 * Get maximum nesting level in code
	 */
	private getMaxNestingLevel(content: string): number {
		let maxNesting = 0;
		let currentNesting = 0;
		let inString = false;
		let inComment = false;
		let stringChar = "";

		for (let i = 0; i < content.length; i++) {
			const char = content[i];
			const nextChar = content[i + 1];

			if (!inComment && (char === '"' || char === "'" || char === "`")) {
				if (!inString) {
					inString = true;
					stringChar = char;
				} else if (char === stringChar && content[i - 1] !== "\\") {
					inString = false;
					stringChar = "";
				}
				continue;
			}

			if (!inString) {
				if (char === "/" && nextChar === "/") {
					inComment = true;
					continue;
				}
				if (char === "/" && nextChar === "*") {
					inComment = true;
					continue;
				}
				if (inComment && char === "\n") {
					inComment = false;
					continue;
				}
				if (inComment && char === "*" && nextChar === "/") {
					inComment = false;
					i++;
					continue;
				}
			}

			if (!inString && !inComment) {
				if (char === "{") {
					currentNesting++;
					maxNesting = Math.max(maxNesting, currentNesting);
				}
				if (char === "}") {
					currentNesting--;
				}
			}
		}

		return maxNesting;
	}

	/**
	 * Add custom validation rule
	 */
	addDangerousPattern(pattern: RegExp, message: string): void {
		this.dangerousPatterns.push({ pattern, message });
		console.log(`⚠️ Added dangerous pattern: ${message}`);
	}

	/**
	 * Remove validation rule
	 */
	removeDangerousPattern(message: string): void {
		const index = this.dangerousPatterns.findIndex(
			(p) => p.message === message
		);
		if (index >= 0) {
			this.dangerousPatterns.splice(index, 1);
			console.log(`✅ Removed dangerous pattern: ${message}`);
		}
	}
}