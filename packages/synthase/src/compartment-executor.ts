// compartment-executor.ts
/**
 * SES Compartment-based executor for compiled block functions.
 *
 * Runs a bare function expression (produced by @flow/core's compileBlock —
 * `(async function (__inputs, __ctx) { … })`) inside a hardened SES
 * Compartment. The ONLY authority available inside the compartment is the
 * endowed context: no fetch, no XMLHttpRequest, no WebSocket, no
 * importScripts, no process. Shared intrinsics (Math, JSON, Uint8Array, …)
 * are available per SES defaults.
 *
 * IMPORTANT ordering note: `lockdown()` freezes the host's intrinsics, so
 * `ensureLockdown()` must be called lazily — at first block execution —
 * AFTER trusted setup (e.g. nucleation/WASM context-provider init) has run.
 * This module only calls it from `executeInCompartment`.
 */
import 'ses';

/** Module-level flag: lockdown() throws if called twice. */
let lockdownApplied = false;

/** Cross-module/global flag in case two copies of this module are loaded. */
const LOCKDOWN_SENTINEL = '__FLOW_SES_LOCKDOWN_DONE__';

/**
 * Heuristic for environments where lockdown has already been applied
 * (by another copy of this module, a test harness, or the host).
 */
function isAlreadyLockedDown(): boolean {
	if ((globalThis as Record<string, unknown>)[LOCKDOWN_SENTINEL]) return true;
	// After lockdown, shared intrinsics are frozen and `harden` exists.
	return (
		typeof (globalThis as { harden?: unknown }).harden === 'function' &&
		Object.isFrozen(Object.prototype) &&
		Object.isFrozen(Array.prototype)
	);
}

/**
 * Idempotently apply SES lockdown.
 *
 * - errorTaming 'unsafe' keeps useful stack traces for block authors.
 * - consoleTaming 'unsafe' leaves the host console alone (workers pipe
 *   console output through progress messages).
 * - overrideTaming 'severe' maximises compatibility with code that assigns
 *   to inherited properties (e.g. `obj.constructor = …` patterns in
 *   transpiled/wasm-bindgen output).
 * - evalTaming 'unsafe-eval' leaves the host's eval intact, which keeps
 *   bundlers, WASM glue and dev tooling working; Compartment isolation does
 *   not depend on taming the host eval.
 */
export function ensureLockdown(): void {
	if (lockdownApplied) return;
	if (isAlreadyLockedDown()) {
		lockdownApplied = true;
		return;
	}

	try {
		lockdown({
			errorTaming: 'unsafe',
			consoleTaming: 'unsafe',
			overrideTaming: 'severe',
			evalTaming: 'unsafe-eval',
		});
	} catch (error) {
		// lockdown() throws if it (or another ses instance) already ran.
		// If intrinsics are locked down by anyone, we are good to go.
		if (!isAlreadyLockedDown() && typeof Compartment !== 'function') {
			throw error;
		}
	}

	try {
		Object.defineProperty(globalThis, LOCKDOWN_SENTINEL, {
			value: true,
			configurable: false,
			enumerable: false,
			writable: false,
		});
	} catch {
		// globalThis may itself be frozen — the intrinsic check still works.
	}
	lockdownApplied = true;
}

/** Minimal console shim endowed to compartments (delegates to host console). */
function makeConsoleShim(): Console {
	const host = console;
	const shim = {
		log: (...args: unknown[]) => host.log(...args),
		info: (...args: unknown[]) => host.info(...args),
		warn: (...args: unknown[]) => host.warn(...args),
		error: (...args: unknown[]) => host.error(...args),
		debug: (...args: unknown[]) => host.debug(...args),
	};
	// harden exists after lockdown; freeze the shim so compartment code
	// cannot redefine methods observed by other executions.
	return harden(shim) as unknown as Console;
}

export interface CompartmentExecuteOptions {
	/** Soft timeout in ms for the block's returned promise (default 30s). */
	timeout?: number;
}

const DEFAULT_TIMEOUT = 30_000;

/**
 * Evaluate a compiled block function inside a SES Compartment and run it.
 *
 * @param functionCode - Bare function expression, e.g.
 *   `(async function (__inputs, __ctx) { … })`
 * @param inputs - Block inputs (passed as `__inputs`)
 * @param context - Trusted context providers (endowed as compartment globals
 *   AND passed as `__ctx`). Built OUTSIDE the compartment.
 * @param opts - { timeout } in milliseconds
 * @returns Whatever the block function returns
 */
export async function executeInCompartment(
	functionCode: string,
	inputs: Record<string, unknown> = {},
	context: Record<string, unknown> = {},
	opts: CompartmentExecuteOptions = {}
): Promise<unknown> {
	ensureLockdown();

	const timeout = opts.timeout ?? DEFAULT_TIMEOUT;

	const compartment = new Compartment({
		globals: {
			...context,
			console: makeConsoleShim(),
		},
		__options__: true,
	});

	const fn = compartment.evaluate(functionCode) as unknown;
	if (typeof fn !== 'function') {
		throw new TypeError(
			'executeInCompartment: functionCode must evaluate to a function expression'
		);
	}

	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	const timeoutPromise = new Promise<never>((_, reject) => {
		timeoutId = setTimeout(() => {
			reject(new Error(`Script execution timeout after ${timeout}ms`));
		}, timeout);
	});

	try {
		return await Promise.race([
			Promise.resolve(
				(fn as (i: unknown, c: unknown) => unknown)(inputs, context)
			),
			timeoutPromise,
		]);
	} finally {
		clearTimeout(timeoutId);
	}
}
