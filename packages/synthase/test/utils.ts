import { expect } from "bun:test";
export function expectWarningsToInclude(warnings: string[], wanted: string) {
	expect(warnings.some((w) => w.includes(wanted))).toBe(true);
}
