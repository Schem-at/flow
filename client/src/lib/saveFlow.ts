/**
 * Save the editor's flow to the platform API (`/api/flows`).
 */

export interface SavedFlow {
  id: string;
  name: string;
  status?: string;
  canEdit?: boolean;
  [key: string]: unknown;
}

export interface FlowPayload {
  name: string;
  nodes: unknown[];
  edges: unknown[];
  [key: string]: unknown;
}

export interface SaveFlowOptions {
  /** Backend id of the loaded flow, or null for a never-saved canvas. */
  flowId: string | null;
  /** Whether the current user may edit the loaded flow (from GET /api/flows/:id `canEdit`); undefined = unknown. */
  canEdit?: boolean;
  serverUrl: string;
  fetchImpl?: typeof fetch;
}

export type SaveMode = 'created' | 'updated' | 'copied';

export interface SaveOutcome {
  flow: SavedFlow;
  mode: SaveMode;
}

export class SaveFlowError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'SaveFlowError';
  }
}

/**
 * Requests made here handle their own 401/403 (fallback to a copy, specific
 * toast), so the global fetch interceptor must not also toast for them.
 */
export const SELF_HANDLED_AUTH = new WeakSet<object>();

function copyName(name: string): string {
  return /\(copy\)\s*$/.test(name) ? name : `${name} (copy)`;
}

async function send(
  fetchImpl: typeof fetch,
  method: 'POST' | 'PUT',
  url: string,
  body: unknown
): Promise<{ status: number; json: { success?: boolean; error?: string; flow?: SavedFlow } }> {
  const init: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  };
  SELF_HANDLED_AUTH.add(init);
  const res = await fetchImpl(url, init);
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function failure(status: number, error: string | undefined, fallback: string): SaveFlowError {
  if (status === 401) return new SaveFlowError('Sign in to save flows.', 401);
  return new SaveFlowError(error || fallback, status);
}

/**
 * Save the canvas:
 * - never saved             -> POST (create)
 * - loaded and editable     -> PUT (update in place)
 * - loaded, NOT yours       -> POST a copy under your account (the editor then
 *                              switches to the new id). Also used when ownership
 *                              was unknown and the PUT is refused as "Not authorized".
 */
export async function saveFlow(flowData: FlowPayload, options: SaveFlowOptions): Promise<SaveOutcome> {
  const { flowId, canEdit, serverUrl } = options;
  const fetchImpl = options.fetchImpl ?? fetch;

  const create = async (mode: 'created' | 'copied'): Promise<SaveOutcome> => {
    const body = mode === 'copied' ? { ...flowData, name: copyName(flowData.name) } : flowData;
    const { status, json } = await send(fetchImpl, 'POST', `${serverUrl}/api/flows`, body);
    if (!json.success || !json.flow) throw failure(status, json.error, 'Save failed');
    return { flow: json.flow, mode };
  };

  if (!flowId) return create('created');
  if (canEdit === false) return create('copied');

  // Safety check: Don't overwrite existing flow with empty nodes
  if (flowData.nodes.length === 0) {
    throw new SaveFlowError(
      'Safety Lock: Cannot save empty flow over existing flow. Please refresh and try again.',
      0
    );
  }

  const { status, json } = await send(fetchImpl, 'PUT', `${serverUrl}/api/flows/${flowId}`, flowData);
  if (json.success && json.flow) return { flow: json.flow, mode: 'updated' };
  // Ownership refusal (not a ban or other 403): keep the user's work as their own copy.
  if (status === 403 && json.error === 'Not authorized') return create('copied');
  throw failure(status, json.error, 'Save failed');
}
