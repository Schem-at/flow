import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSchematiClient } from './schemati.js';
import type { RuntimeEnv } from './types.js';

const TAGS = { tags: [{ id: 'tag-door-id', name: 'door' }, { id: 'tag-farm-id', name: 'farm' }] };
const PAGE = {
  data: [
    {
      id: 'abc-123',
      short_id: 'r4oeQF',
      slug: 'dooor',
      name: 'dooor',
      description: 'a door',
      format: 'litematic',
      is_public: true,
      tags: [{ name: 'door' }],
      authors: [{ uuid: 'u1', last_seen_name: 'Nano_' }],
      preview_image_url: null,
      web_url: 'https://schemati.test/s/dooor',
    },
  ],
};

let calls: string[];
const realFetch = globalThis.fetch;

function stubFetch(handler?: (url: string) => Response | undefined) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const custom = handler?.(url);
    if (custom) return custom;
    if (url.includes('/api/tags')) return Response.json(TAGS);
    if (url.includes('/download')) {
      return new Response(new Uint8Array([1, 2, 3]).buffer, {
        headers: { 'content-disposition': 'attachment; filename="dooor.litematic"' },
      });
    }
    if (url.includes('/api/v1/schematics')) return Response.json(PAGE);
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
}

beforeEach(() => {
  calls = [];
  stubFetch();
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

const browserEnv: RuntimeEnv = { kind: 'browser' };
const nodeEnv: RuntimeEnv = { kind: 'node', schemati: { baseUrl: 'https://schemati.test', token: 'tok-1' } };

describe('createSchematiClient', () => {
  it('browser: same-origin requests, tag name resolved to id', async () => {
    const client = createSchematiClient(browserEnv, {});
    const results = await client.searchSchematics({ tag: 'door', limit: 5 });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ name: 'dooor', tags: ['door'], authors: ['Nano_'] });
    // First call resolves the tag, second filters by its id, both same-origin (no host).
    expect(calls[0]).toBe('/api/tags');
    expect(calls[1]).toContain('/api/v1/schematics?tag=tag-door-id&');
  });

  it('node: requests carry the configured base URL and bearer token', async () => {
    const fetchSpy = globalThis.fetch as ReturnType<typeof vi.fn>;
    const client = createSchematiClient(nodeEnv, {});
    await client.searchSchematics({ search: 'castle' });
    expect(calls[0]).toContain('https://schemati.test/api/v1/schematics?search=castle');
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-1');
  });

  it('node without SCHEMATI_URL: helpful error instead of broken fetches', () => {
    const stash = process.env.SCHEMATI_URL;
    delete process.env.SCHEMATI_URL;
    try {
      const client = createSchematiClient({ kind: 'node' }, {});
      expect(() => client.searchSchematics()).toThrow(/SCHEMATI_URL/);
    } finally {
      if (stash !== undefined) process.env.SCHEMATI_URL = stash;
    }
  });

  it('getSchematicData returns bytes + filename-derived format', async () => {
    const client = createSchematiClient(browserEnv, {});
    const data = await client.getSchematicData('dooor');
    expect(Array.from(data.data)).toEqual([1, 2, 3]);
    expect(data.format).toBe('litematic');
    expect(data.metadata.name).toBe('dooor.litematic');
  });

  it('getSchematic rehydrates through the context Schematic class', async () => {
    const fromData = vi.fn();
    class FakeSchematic {
      from_data(bytes: Uint8Array) {
        fromData(bytes);
      }
    }
    const client = createSchematiClient(browserEnv, { Schematic: FakeSchematic });
    const schematic = await client.getSchematic('abc-123');
    expect(schematic).toBeInstanceOf(FakeSchematic);
    expect(fromData).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]));
  });

  it('getSchematic without nucleation suggests getSchematicData', async () => {
    const client = createSchematiClient(browserEnv, {});
    await expect(client.getSchematic('abc-123')).rejects.toThrow(/getSchematicData/);
  });

  it('unknown tag lists known tags in the error', async () => {
    const client = createSchematiClient(browserEnv, {});
    await expect(client.searchSchematics({ tag: 'nope' })).rejects.toThrow(/Unknown schemati tag "nope".*door/);
  });

  it('API errors surface status and message', async () => {
    stubFetch((url) =>
      url.includes('/api/v1/schematics')
        ? Response.json({ message: 'Server exploded' }, { status: 500 })
        : undefined
    );
    const client = createSchematiClient(browserEnv, {});
    await expect(client.searchSchematics()).rejects.toThrow(/500 \(Server exploded\)/);
  });

  it('raw tag ids skip the tag lookup', async () => {
    const client = createSchematiClient(browserEnv, {});
    await client.searchSchematics({ tag: '4e10dc80-c001-441d-9da0-67effb9d9dc2' });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('tag=4e10dc80-c001-441d-9da0-67effb9d9dc2');
  });
});

describe('uploadSchematic', () => {
  const SCHEMATIC = {
    to_schematic: () => new Uint8Array([7, 7, 7]),
    blocks: () => [{ x: 0, y: 0, z: 0, name: 'minecraft:stone' }],
  };

  function stubUploadFetch(opts: { tokenStatus?: number; uploadStatus?: number; uploadBody?: unknown } = {}) {
    stubFetch((url) => {
      if (url.includes('/api/user/flow-token')) {
        return opts.tokenStatus && opts.tokenStatus !== 200
          ? new Response('{}', { status: opts.tokenStatus })
          : Response.json({ token: 'minted-token', playerUuid: 'player-1' });
      }
      if (url.endsWith('/api/v1/schematics')) {
        return Response.json(
          (opts.uploadBody as object) ?? { data: { id: 'up-1', name: 'Uploaded', slug: 'uploaded', tags: [], authors: [] } },
          { status: opts.uploadStatus ?? 201 }
        );
      }
      return undefined;
    });
  }

  it('browser: mints a session token and posts multipart with preview + tags', async () => {
    stubUploadFetch();
    const fetchSpy = globalThis.fetch as ReturnType<typeof vi.fn>;
    const client = createSchematiClient(browserEnv, {});
    const result = await client.uploadSchematic(SCHEMATIC, {
      name: 'My Door',
      tags: ['door'],
      isPublic: false,
    });
    expect(result.id).toBe('up-1');

    const uploadCall = fetchSpy.mock.calls.find(([u]) => String(u).endsWith('/api/v1/schematics'))!;
    const init = uploadCall[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer minted-token');
    const form = init.body as FormData;
    expect(form.get('name')).toBe('My Door');
    expect(form.get('author_id')).toBe('player-1');
    expect(form.get('is_public')).toBe('0');
    expect(form.getAll('tags[]')).toEqual(['tag-door-id']);
    const file = form.get('schematic_file') as Blob;
    expect(await file.bytes().then((b) => Array.from(b))).toEqual([7, 7, 7]);
    const preview = form.get('preview_image') as Blob;
    expect(preview.type).toBe('image/png');
    expect((await preview.bytes())[1]).toBe(0x50); // 'P' of PNG signature
  });

  it('browser: signed-out users get a clear error', async () => {
    stubUploadFetch({ tokenStatus: 401 });
    const client = createSchematiClient(browserEnv, {});
    await expect(client.uploadSchematic(SCHEMATIC, { name: 'x' })).rejects.toThrow(/signed in to schemati/);
  });

  it('node: uses SCHEMATI_API_TOKEN and its sub claim as author', async () => {
    stubUploadFetch();
    const payload = btoa(JSON.stringify({ sub: 'server-player' }));
    const env: RuntimeEnv = {
      kind: 'node',
      schemati: { baseUrl: 'https://schemati.test', token: `h.${payload}.s` },
    };
    const fetchSpy = globalThis.fetch as ReturnType<typeof vi.fn>;
    const client = createSchematiClient(env, {});
    await client.uploadSchematic(SCHEMATIC, { name: 'Server Build' });
    const uploadCall = fetchSpy.mock.calls.find(([u]) => String(u).includes('/api/v1/schematics'))!;
    const form = (uploadCall[1] as RequestInit).body as FormData;
    expect(form.get('author_id')).toBe('server-player');
    expect(calls.some((u) => u.includes('/api/user/flow-token'))).toBe(false);
  });

  it('duplicate uploads surface the existing schematic', async () => {
    stubUploadFetch({ uploadStatus: 409, uploadBody: { error: 'dup', existing: { id: 'old-1', name: 'Original' } } });
    const client = createSchematiClient(browserEnv, {});
    await expect(client.uploadSchematic(SCHEMATIC, { name: 'x' })).rejects.toThrow(/already exists.*Original.*old-1/);
  });
});
