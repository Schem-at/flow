import { describe, it, expect, vi } from 'vitest';
import { saveFlow, SaveFlowError } from './saveFlow';
import { authFailureNotice } from './authToast';

// Bug #34: a logged-in user who opened someone else's flow (shared link) and
// pressed Save (button, File > Save, Ctrl+S) PUT to the other user's flow and
// got the ownership 403 "Not authorized", shown as "Authentication required".

const FLOW = { name: 'Castle', nodes: [{ id: 'n1' }], edges: [] };
const SERVER = 'https://tools.example';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function mockFetch(routes: Record<string, () => Response>) {
  const calls: Array<{ method: string; url: string; body: Record<string, unknown> }> = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    calls.push({ method, url: String(url), body: init?.body ? JSON.parse(String(init.body)) : {} });
    const handler = routes[`${method} ${String(url)}`];
    if (!handler) throw new Error(`unexpected ${method} ${String(url)}`);
    return handler();
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe('saveFlow', () => {
  it('creates a new flow when the canvas was never saved', async () => {
    const { fetchImpl, calls } = mockFetch({
      [`POST ${SERVER}/api/flows`]: () => jsonResponse(201, { success: true, flow: { id: 'new', name: 'Castle', canEdit: true } }),
    });
    const out = await saveFlow(FLOW, { flowId: null, serverUrl: SERVER, fetchImpl });
    expect(out.mode).toBe('created');
    expect(out.flow.id).toBe('new');
    expect(calls.map((c) => c.method)).toEqual(['POST']);
  });

  it('updates the flow in place when the user owns it', async () => {
    const { fetchImpl, calls } = mockFetch({
      [`PUT ${SERVER}/api/flows/mine`]: () => jsonResponse(200, { success: true, flow: { id: 'mine', name: 'Castle' } }),
    });
    const out = await saveFlow(FLOW, { flowId: 'mine', canEdit: true, serverUrl: SERVER, fetchImpl });
    expect(out.mode).toBe('updated');
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([`PUT ${SERVER}/api/flows/mine`]);
  });

  it("saves a copy (POST) instead of PUTting to someone else's flow", async () => {
    const { fetchImpl, calls } = mockFetch({
      [`POST ${SERVER}/api/flows`]: () =>
        jsonResponse(201, { success: true, flow: { id: 'copy', name: 'Castle (copy)', canEdit: true } }),
    });
    const out = await saveFlow(FLOW, { flowId: 'theirs', canEdit: false, serverUrl: SERVER, fetchImpl });
    expect(out.mode).toBe('copied');
    expect(out.flow.id).toBe('copy');
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([`POST ${SERVER}/api/flows`]);
    expect(calls[0].body.name).toBe('Castle (copy)');
    expect(calls[0].body.nodes).toEqual(FLOW.nodes);
  });

  it('falls back to a copy when ownership was unknown and the PUT is refused as not authorized', async () => {
    const { fetchImpl, calls } = mockFetch({
      [`PUT ${SERVER}/api/flows/theirs`]: () => jsonResponse(403, { success: false, error: 'Not authorized' }),
      [`POST ${SERVER}/api/flows`]: () => jsonResponse(201, { success: true, flow: { id: 'copy', name: 'Castle (copy)' } }),
    });
    const out = await saveFlow(FLOW, { flowId: 'theirs', serverUrl: SERVER, fetchImpl });
    expect(out.mode).toBe('copied');
    expect(calls.map((c) => c.method)).toEqual(['PUT', 'POST']);
  });

  it('does not copy around a ban (403 for another reason) and reports it', async () => {
    const { fetchImpl } = mockFetch({
      [`PUT ${SERVER}/api/flows/mine`]: () => jsonResponse(403, { success: false, error: 'This flow has been banned' }),
    });
    await expect(saveFlow(FLOW, { flowId: 'mine', canEdit: true, serverUrl: SERVER, fetchImpl })).rejects.toMatchObject({
      status: 403,
      message: 'This flow has been banned',
    });
  });

  it('reports a signed-out save as a 401 asking to sign in', async () => {
    const { fetchImpl } = mockFetch({
      [`POST ${SERVER}/api/flows`]: () => jsonResponse(401, { success: false, error: 'Authentication required' }),
    });
    const err = await saveFlow(FLOW, { flowId: null, serverUrl: SERVER, fetchImpl }).catch((e) => e);
    expect(err).toBeInstanceOf(SaveFlowError);
    expect(err.status).toBe(401);
    expect(err.message).toMatch(/sign in/i);
  });

  it("does not double the copy suffix", async () => {
    const { fetchImpl, calls } = mockFetch({
      [`POST ${SERVER}/api/flows`]: () => jsonResponse(201, { success: true, flow: { id: 'c2', name: 'Castle (copy)' } }),
    });
    await saveFlow({ ...FLOW, name: 'Castle (copy)' }, { flowId: 'theirs', canEdit: false, serverUrl: SERVER, fetchImpl });
    expect(calls[0].body.name).toBe('Castle (copy)');
  });
});

describe('authFailureNotice (global fetch interceptor toast)', () => {
  it('401 asks the user to sign in', () => {
    expect(authFailureNotice(401, '/api/flows/x')).toMatchObject({ signIn: true });
    expect(authFailureNotice(401, '/api/flows/x')!.message).toMatch(/sign in/i);
  });

  it('403 says the action is not permitted, not "sign in"', () => {
    const notice = authFailureNotice(403, '/api/flows/x')!;
    expect(notice.signIn).toBe(false);
    expect(notice.message).not.toMatch(/sign in|authentication required/i);
    expect(notice.message).toMatch(/permission/i);
  });

  it('ignores the auth probe and non-auth statuses', () => {
    expect(authFailureNotice(401, '/api/user')).toBeNull();
    expect(authFailureNotice(500, '/api/flows')).toBeNull();
  });
});
