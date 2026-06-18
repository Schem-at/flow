/**
 * Structured error propagation across the worker boundary.
 *
 * Block code runs in a Web Worker (SES compartment). When it throws, the only
 * thing the main thread historically saw was `Error: <message>` with a stack
 * pointing at the WorkerClient's own `onmessage` — the real in-sandbox stack,
 * the failing node, and the cause were all dropped. These helpers serialize a
 * rich error on the worker side and reconstruct it (preserving the sandbox
 * stack) on the client side.
 */

import { PROVIDER_ENDOWMENT_KEYS } from '../runtime-types.js';

/** Wire shape of an execution error sent worker → client as the ERROR payload. */
export interface SerializedWorkerError {
  message: string;
  stack?: string;
  name?: string;
  nodeId?: string;
  label?: string;
}

let cachedGlobals: Set<string> | null = null;

/** Every ambient global name endowed by the providers (Schematic, Field, Asm, Rom, …). */
export function knownAmbientGlobals(): Set<string> {
  if (!cachedGlobals) {
    cachedGlobals = new Set(Object.values(PROVIDER_ENDOWMENT_KEYS).flat());
  }
  return cachedGlobals;
}

/**
 * If an error message looks like a missing ambient global (the classic symptom
 * of a STALE worker bundle — e.g. `Asm`/`Rom` undefined after @flow/core was
 * rebuilt but the cached worker wasn't refreshed), return a one-line hint.
 * Returns null when the message isn't recognisably global-related.
 */
export function ambientGlobalHint(message: string): string | null {
  if (!message) return null;
  const known = knownAmbientGlobals();

  // ReferenceError: "Asm is not defined" → the identifier IS the global name.
  const ref = message.match(/\b([A-Za-z_$][\w$]*) is not defined\b/);
  if (ref && known.has(ref[1])) {
    return `ambient global '${ref[1]}' is undefined — the @flow/core worker bundle may be stale; hard-reload (Cmd+Shift+R) or restart the flow dev server`;
  }

  // TypeError: "Cannot read properties of undefined (reading 'define')" → the
  // captured token is a METHOD on a global that resolved to undefined. This is
  // exactly how a stale worker surfaces (e.g. `Asm.define`, `Rom.layout`).
  const read = message.match(/Cannot read properties of undefined \(reading '([\w$]+)'\)/);
  if (read) {
    return `a value was undefined while reading '.${read[1]}' — if it's an ambient primitive (e.g. Schematic, Field, Asm, Rom), the @flow/core worker bundle may be stale; hard-reload (Cmd+Shift+R) or restart the flow dev server`;
  }

  return null;
}

/** Build the structured ERROR payload from a thrown value (worker side). */
export function shapeWorkerError(
  err: unknown,
  extra: { nodeId?: string; label?: string } = {}
): SerializedWorkerError {
  const e =
    err && typeof err === 'object'
      ? (err as Error & { nodeId?: string; label?: string })
      : undefined;
  const baseMessage = e?.message ?? String(err);
  const hint = ambientGlobalHint(baseMessage);
  return {
    message: hint ? `${baseMessage} (${hint})` : baseMessage,
    stack: e?.stack,
    name: e?.name,
    nodeId: extra.nodeId ?? e?.nodeId,
    label: extra.label ?? e?.label,
  };
}

/**
 * Reconstruct a real Error on the client from an ERROR payload (client side).
 * Preserves the in-sandbox stack so DevTools shows the failing block frames
 * instead of the WorkerClient's onmessage. Falls back to the legacy
 * string-payload behaviour for backward compatibility.
 */
export function reconstructError(payload: unknown): Error {
  if (payload && typeof payload === 'object' && typeof (payload as SerializedWorkerError).message === 'string') {
    const p = payload as SerializedWorkerError;
    const prefix = p.label || p.nodeId;
    const err = new Error(prefix ? `${prefix}: ${p.message}` : p.message) as Error & {
      nodeId?: string;
      label?: string;
    };
    if (p.name) err.name = p.name;
    if (p.stack) err.stack = p.stack; // surface the real in-sandbox frames
    if (p.nodeId) err.nodeId = p.nodeId;
    if (p.label) err.label = p.label;
    return err;
  }
  return new Error(typeof payload === 'string' ? payload : String(payload));
}
