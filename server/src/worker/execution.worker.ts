/**
 * Execution worker — runs user code (single scripts and full flows) OFF the
 * main server thread, so the server can hard-kill runaway executions by
 * terminating the worker. Never run user code on the main server thread.
 *
 * Protocol: the spawner posts ONE ExecutionWorkerRequest; the worker streams
 * `{ kind: 'event' }` messages (logs / node progress) and finishes with a
 * single `{ kind: 'result' }` message. Workers are one-shot: the spawner
 * terminates them after the result (or on timeout/cancellation).
 *
 * All payloads posted back are JSON-safe — WASM schematic wrappers are
 * serialized to base64 here, inside the worker, because they cannot cross
 * the worker boundary.
 */

import {
  PolymeraseEngine,
  createContextProviders,
  type FlowData,
} from '@flow/core';

declare const self: Worker;

// ============================================================================
// Protocol types (imported type-only by the spawner)
// ============================================================================

export type ExecutionWorkerRequest =
  | { kind: 'script'; code: string; inputs: Record<string, unknown>; timeout: number }
  | { kind: 'flow'; flow: FlowData; timeout: number }
  | { kind: 'validate'; code: string };

export type ExecutionWorkerEventName =
  | 'log'
  | 'progress'
  | 'node:start'
  | 'node:finish'
  | 'node:error';

export interface ExecutionWorkerEvent {
  kind: 'event';
  event: ExecutionWorkerEventName;
  payload: Record<string, unknown>;
}

export type ExecutionWorkerResult =
  | { kind: 'result'; ok: true; payload: unknown }
  | { kind: 'result'; ok: false; error: { message: string; stack?: string } };

export type ExecutionWorkerResponse = ExecutionWorkerEvent | ExecutionWorkerResult;

/** One serialized entry of a flow's final output. */
export interface FlowOutputEntry {
  key: string;
  kind: 'schem' | 'binary' | 'value';
  /** base64 payload for 'schem' / 'binary' entries */
  base64?: string;
  size?: number;
  /** JSON-safe value for 'value' entries */
  value?: unknown;
}

export interface FlowWorkerResult {
  status: 'pending' | 'running' | 'completed' | 'error' | 'cancelled';
  startTime: number;
  endTime?: number;
  errorNode: { nodeId: string; message: string; stack?: string } | null;
  /** JSON-safe snapshot of the full FlowExecutionState (for persistence). */
  resultSnapshot: unknown;
  outputs: FlowOutputEntry[];
}

export interface ScriptWorkerResult {
  success: boolean;
  result: Record<string, unknown>;
  /** base64-encoded .schem data per output key */
  schematics: Record<string, string> | null;
  hasSchematic: boolean;
  executionTime?: number;
  error?: string;
}

// ============================================================================
// Helpers
// ============================================================================

function post(message: ExecutionWorkerResponse): void {
  self.postMessage(message);
}

function emit(event: ExecutionWorkerEventName, payload: Record<string, unknown>): void {
  post({ kind: 'event', event, payload });
}

/** Force a value through JSON so it is safe to postMessage / persist. */
function safeJson<T = unknown>(value: unknown): T | undefined {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return String(value) as unknown as T;
  }
}

function isSchematicWrapper(value: unknown): value is { to_schematic: () => Uint8Array } {
  return Boolean(
    value && typeof value === 'object' && 'to_schematic' in value &&
    typeof (value as { to_schematic: unknown }).to_schematic === 'function'
  );
}

function toBytes(value: Uint8Array | ArrayBufferView): Uint8Array {
  return value instanceof Uint8Array
    ? value
    : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

// ============================================================================
// Handlers
// ============================================================================

async function handleScript(
  req: Extract<ExecutionWorkerRequest, { kind: 'script' }>
): Promise<ScriptWorkerResult> {
  const contextProviders = await createContextProviders({
    logCallback: (entry: { level: string; message: string }) => {
      console.log(`[Script] [${entry.level}] ${entry.message}`);
      emit('log', { level: entry.level, message: entry.message, timestamp: Date.now() });
    },
  });

  const engine = new PolymeraseEngine({ contextProviders, timeout: req.timeout });

  try {
    const result = await engine.executeScript(req.code, req.inputs);

    // Convert schematic outputs to base64 (WASM objects cannot leave the worker)
    const schematicData: Record<string, string> = {};

    if (result.result) {
      for (const [key, value] of Object.entries(result.result)) {
        if (isSchematicWrapper(value)) {
          try {
            const bytes = value.to_schematic();
            schematicData[key] = Buffer.from(bytes).toString('base64');
            console.log(`[Execute] Converted schematic "${key}" to base64 (${bytes.length} bytes)`);
          } catch (err) {
            console.error(`[Execute] Failed to convert schematic "${key}":`, err);
          }
        }
      }
    }

    if (result.schematics) {
      for (const [key, schem] of Object.entries(result.schematics)) {
        if (isSchematicWrapper(schem)) {
          try {
            const bytes = schem.to_schematic();
            schematicData[key] = Buffer.from(bytes).toString('base64');
            console.log(`[Execute] Converted schematic "${key}" from schematics field to base64 (${bytes.length} bytes)`);
          } catch (err) {
            console.error(`[Execute] Failed to convert schematic from schematics field "${key}":`, err);
          }
        } else if (schem instanceof Uint8Array || ArrayBuffer.isView(schem)) {
          schematicData[key] = Buffer.from(toBytes(schem as ArrayBufferView)).toString('base64');
        }
      }
    }

    // Build a JSON-safe result without schematic wrapper objects
    const processedResult: Record<string, unknown> = {};
    if (result.result) {
      for (const [key, value] of Object.entries(result.result)) {
        if (isSchematicWrapper(value)) {
          processedResult[key] = '[Schematic Object]';
        } else {
          processedResult[key] = safeJson(value);
        }
      }
    }

    const hasSchematic = Object.keys(schematicData).length > 0;

    return {
      success: result.success,
      result: processedResult,
      schematics: hasSchematic ? schematicData : null,
      hasSchematic,
      executionTime: result.executionTime,
      error: result.error?.message,
    };
  } finally {
    engine.destroy();
  }
}

async function handleFlow(
  req: Extract<ExecutionWorkerRequest, { kind: 'flow' }>
): Promise<FlowWorkerResult> {
  const contextProviders = await createContextProviders({
    logCallback: (entry: { level: string; message: string }) => {
      console.log(`[${entry.level}] ${entry.message}`);
      emit('log', { level: entry.level, message: entry.message, timestamp: Date.now() });
    },
  });

  const engine = new PolymeraseEngine({ contextProviders, timeout: req.timeout });

  // Stream engine events back to the spawner (JSON-safe payloads only)
  engine.events.on('node:start', (e) => {
    emit('node:start', { nodeId: e.nodeId, flowId: e.flowId });
  });
  engine.events.on('node:finish', (e) => {
    emit('node:finish', { nodeId: e.nodeId, flowId: e.flowId, output: safeJson(e.output) });
  });
  engine.events.on('node:error', (e) => {
    emit('node:error', {
      nodeId: e.nodeId,
      error: { message: e.error.message, type: e.error.type, stack: e.error.stack },
    });
  });
  engine.events.on('progress', (e) => {
    emit('progress', safeJson<Record<string, unknown>>(e) ?? {});
  });

  try {
    const result = await engine.executeFlow(req.flow);

    // Serialize final outputs (schematic wrappers -> base64) inside the worker
    const outputs: FlowOutputEntry[] = [];
    if (result.finalOutput) {
      for (const [key, value] of Object.entries(result.finalOutput)) {
        if (isSchematicWrapper(value)) {
          try {
            const bytes = value.to_schematic();
            outputs.push({
              key,
              kind: 'schem',
              base64: Buffer.from(bytes).toString('base64'),
              size: bytes.length,
            });
          } catch (err) {
            console.error(`Failed to convert schematic "${key}":`, err);
            outputs.push({ key, kind: 'value', value: safeJson(value) });
          }
        } else if (value instanceof Uint8Array || ArrayBuffer.isView(value)) {
          const bytes = toBytes(value as ArrayBufferView);
          outputs.push({
            key,
            kind: 'binary',
            base64: Buffer.from(bytes).toString('base64'),
            size: bytes.length,
          });
        } else {
          outputs.push({ key, kind: 'value', value: safeJson(value) });
        }
      }
    }

    const errorEntry =
      result.status === 'error'
        ? Object.entries(result.nodeStates).find(([, s]) => s.error)
        : undefined;

    return {
      status: result.status,
      startTime: result.startTime,
      endTime: result.endTime,
      errorNode: errorEntry?.[1].error
        ? {
            nodeId: errorEntry[0],
            message: errorEntry[1].error.message,
            stack: errorEntry[1].error.stack,
          }
        : null,
      resultSnapshot: safeJson(result),
      outputs,
    };
  } finally {
    engine.destroy();
  }
}

async function handleValidate(
  req: Extract<ExecutionWorkerRequest, { kind: 'validate' }>
): Promise<unknown> {
  const contextProviders = await createContextProviders();
  const engine = new PolymeraseEngine({ contextProviders });
  try {
    const validation = await engine.validateScript(req.code);
    return safeJson(validation);
  } finally {
    engine.destroy();
  }
}

// ============================================================================
// Entry point
// ============================================================================

self.onmessage = async (event: MessageEvent<ExecutionWorkerRequest>) => {
  const req = event.data;
  try {
    let payload: unknown;
    switch (req.kind) {
      case 'script':
        payload = await handleScript(req);
        break;
      case 'flow':
        payload = await handleFlow(req);
        break;
      case 'validate':
        payload = await handleValidate(req);
        break;
      default:
        throw new Error(`Unknown execution worker request: ${(req as { kind?: string }).kind}`);
    }
    post({ kind: 'result', ok: true, payload });
  } catch (error) {
    const err = error as Error;
    post({ kind: 'result', ok: false, error: { message: err.message, stack: err.stack } });
  }
};
