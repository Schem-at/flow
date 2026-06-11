import { describe, it, expect } from 'vitest';
import { executeInCompartment, ensureLockdown } from './compartment-executor';

const wrap = (body: string) =>
	`(async function (__inputs, __ctx) {\n${body}\n})`;

describe('executeInCompartment', () => {
	it('computes with the endowed context (ambient globals + __ctx)', async () => {
		const context = {
			add: (a: number, b: number) => a + b,
			Schematic: class {
				tag = 'fake-schematic';
			},
		};

		const result = await executeInCompartment(
			wrap(`
				var { add, Schematic } = __ctx;
				const s = new Schematic();
				return { sum: add(__inputs.a, __inputs.b), ambientSum: add(1, 2), tag: s.tag };
			`),
			{ a: 2, b: 3 },
			context
		);

		expect(result).toEqual({ sum: 5, ambientSum: 3, tag: 'fake-schematic' });
	});

	it('exposes ambient context names as compartment globals', async () => {
		const result = await executeInCompartment(
			// No destructuring — `add` must be ambient via endowments.
			wrap(`return add(10, 32);`),
			{},
			{ add: (a: number, b: number) => a + b }
		);
		expect(result).toBe(42);
	});

	it('has no network or worker authority inside the compartment', async () => {
		const result = await executeInCompartment(
			wrap(`
				return {
					fetch: typeof fetch,
					xhr: typeof XMLHttpRequest,
					ws: typeof WebSocket,
					importScripts: typeof importScripts,
					process: typeof process,
				};
			`),
			{},
			{}
		);
		expect(result).toEqual({
			fetch: 'undefined',
			xhr: 'undefined',
			ws: 'undefined',
			importScripts: 'undefined',
			process: 'undefined',
		});
	});

	it('cannot reach host authority through globalThis', async () => {
		const result = await executeInCompartment(
			wrap(`
				return {
					process: typeof globalThis.process,
					fetch: typeof globalThis.fetch,
					isHostGlobal: globalThis === undefined,
				};
			`),
			{},
			{}
		);
		expect(result).toMatchObject({ process: 'undefined', fetch: 'undefined' });
	});

	it('cannot poison shared intrinsics from inside the compartment', async () => {
		await expect(
			executeInCompartment(
				wrap(`
					Object.prototype.pwned = true;
					return 'oops';
				`),
				{},
				{}
			)
		).rejects.toThrow();
		expect(({} as Record<string, unknown>).pwned).toBeUndefined();
	});

	it('still has SES-default intrinsics (Math, JSON, Uint8Array)', async () => {
		const result = await executeInCompartment(
			wrap(`
				return {
					floor: Math.floor(2.9),
					json: JSON.stringify({ ok: true }),
					bytes: new Uint8Array([1, 2, 3]).length,
				};
			`),
			{},
			{}
		);
		expect(result).toEqual({ floor: 2, json: '{"ok":true}', bytes: 3 });
	});

	it('rejects a never-resolving promise after the timeout', async () => {
		await expect(
			executeInCompartment(
				wrap(`return new Promise(() => {});`),
				{},
				{},
				{ timeout: 100 }
			)
		).rejects.toThrow(/timeout/i);
	});

	it('propagates block errors', async () => {
		await expect(
			executeInCompartment(wrap(`throw new Error('block boom');`), {}, {})
		).rejects.toThrow('block boom');
	});

	it('ensureLockdown is idempotent', () => {
		ensureLockdown();
		expect(() => ensureLockdown()).not.toThrow();
	});
});
