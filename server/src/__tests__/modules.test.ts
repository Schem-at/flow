import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';

// Mock the db module to avoid bun:sqlite import at module level
vi.mock('../db/index.js', () => ({
  db: {},
  modules: {},
  moduleVersions: {},
}));

import { createModulesRouter, slugify } from '../routes/modules.js';
import type { ModuleStore } from '../services/module-store.js';
import type { Module, ModuleVersion } from '../db/schema.js';

// ---------------------------------------------------------------------------
// In-memory ModuleStore (bun:sqlite is unavailable under vitest)
// ---------------------------------------------------------------------------

function makeMemoryStore(): ModuleStore {
  const moduleRows = new Map<string, Module>();
  const versionRows = new Map<string, ModuleVersion>();

  return {
    async listModules() {
      return [...moduleRows.values()];
    },
    async getModule(id) {
      return moduleRows.get(id);
    },
    async getModuleBySlug(slug) {
      return [...moduleRows.values()].find(m => m.slug === slug);
    },
    async createModule(module) {
      moduleRows.set(module.id, {
        description: null,
        visibility: 'private',
        updatedAt: null,
        ...module,
      } as Module);
    },
    async updateModule(id, fields) {
      const existing = moduleRows.get(id);
      if (existing) moduleRows.set(id, { ...existing, ...fields });
    },
    async deleteModule(id) {
      moduleRows.delete(id);
      for (const [vid, v] of versionRows) {
        if (v.moduleId === id) versionRows.delete(vid);
      }
    },
    async listVersions(moduleId) {
      return [...versionRows.values()].filter(v => v.moduleId === moduleId);
    },
    async createVersion(version) {
      versionRows.set(version.id, {
        ioSchema: null,
        changeNote: null,
        isLatest: false,
        ...version,
      } as ModuleVersion);
    },
    async updateVersion(id, fields) {
      const existing = versionRows.get(id);
      if (existing) versionRows.set(id, { ...existing, ...fields });
    },
    async setLatestVersion(moduleId, versionId) {
      for (const [vid, v] of versionRows) {
        if (v.moduleId === moduleId) {
          versionRows.set(vid, { ...v, isLatest: vid === versionId });
        }
      }
    },
  };
}

function makeApp() {
  return new Hono().route('/api/modules', createModulesRouter(makeMemoryStore()));
}

async function createModule(app: Hono, overrides: Record<string, unknown> = {}) {
  const res = await app.request('/api/modules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'My Module',
      code: 'export default function run() { return 1; }',
      io_schema: { inputs: { a: { type: 'number' } }, outputs: { out: { type: 'number' } } },
      description: 'Test module',
      visibility: 'private',
      ...overrides,
    }),
  });
  return { res, json: (await res.json()) as any };
}

async function readJson(res: Response | Promise<Response>): Promise<any> {
  return (await res).json();
}

// ---------------------------------------------------------------------------
// slugify
// ---------------------------------------------------------------------------

describe('slugify', () => {
  it('lowercases and replaces non-alphanumerics with dashes', () => {
    expect(slugify('My Cool Module!')).toBe('my-cool-module');
  });

  it('collapses repeated separators and trims edges', () => {
    expect(slugify('  --Hello   World--  ')).toBe('hello-world');
  });

  it('falls back to "module" for empty input', () => {
    expect(slugify('!!!')).toBe('module');
  });
});

// ---------------------------------------------------------------------------
// POST /api/modules
// ---------------------------------------------------------------------------

describe('POST /api/modules', () => {
  it('creates a module with first version 1.0.0', async () => {
    const app = makeApp();
    const { res, json } = await createModule(app);

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.module.id).toBeTruthy();
    expect(json.module.slug).toBe('my-module');
    expect(json.module.name).toBe('My Module');
    expect(json.module.version).toBe('1.0.0');
  });

  it('dedupes slugs with a -2 suffix', async () => {
    const app = makeApp();
    await createModule(app);
    const { json } = await createModule(app);
    expect(json.module.slug).toBe('my-module-2');
  });

  it('rejects a module without a name', async () => {
    const app = makeApp();
    const { res, json } = await createModule(app, { name: undefined });
    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
  });

  it('rejects a module without code', async () => {
    const app = makeApp();
    const { res, json } = await createModule(app, { code: undefined });
    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// GET /api/modules
// ---------------------------------------------------------------------------

describe('GET /api/modules', () => {
  it('lists created modules with the fields the client expects', async () => {
    const app = makeApp();
    await createModule(app);

    const res = await app.request('/api/modules');
    const json = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.modules).toHaveLength(1);

    const mod = json.modules[0];
    expect(mod.name).toBe('My Module');
    expect(mod.slug).toBe('my-module');
    expect(mod.description).toBe('Test module');
    expect(mod.version).toBe('1.0.0');
    expect(mod.visibility).toBe('private');
    expect(mod.isOwner).toBe(true);
    expect(mod.canEdit).toBe(true);
    expect(mod.isStarred).toBe(false);
    expect(mod.tags).toEqual([]);
    expect(mod.stats).toEqual({ views: 0, uses: 0, stars: 0, forks: 0, runs: 0, versions: 1 });
    expect(typeof mod.createdAt).toBe('number');
    expect(typeof mod.updatedAt).toBe('number');
  });

  it('filters by ?q= search on name', async () => {
    const app = makeApp();
    await createModule(app, { name: 'Alpha Block' });
    await createModule(app, { name: 'Beta Block' });

    const res = await app.request('/api/modules?q=alpha');
    const json = (await res.json()) as any;
    expect(json.modules).toHaveLength(1);
    expect(json.modules[0].name).toBe('Alpha Block');
  });

  it('returns an empty list for ?starred=1 (star is a stub)', async () => {
    const app = makeApp();
    await createModule(app);
    const res = await app.request('/api/modules?starred=1');
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(json.modules).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// GET /api/modules/:id/resolve
// ---------------------------------------------------------------------------

describe('GET /api/modules/:id/resolve', () => {
  it('resolves the latest version code and ioSchema', async () => {
    const app = makeApp();
    const { json: created } = await createModule(app);

    const res = await app.request(`/api/modules/${created.module.id}/resolve`);
    const json = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.code).toBe('export default function run() { return 1; }');
    expect(json.version).toBe('1.0.0');
    expect(json.ioSchema).toEqual({ inputs: { a: { type: 'number' } }, outputs: { out: { type: 'number' } } });
  });

  it('404s for an unknown module', async () => {
    const app = makeApp();
    const res = await app.request('/api/modules/nope/resolve');
    expect(res.status).toBe(404);
  });

  it('404s for an unknown version', async () => {
    const app = makeApp();
    const { json: created } = await createModule(app);
    const res = await app.request(`/api/modules/${created.module.id}/resolve?version=9.9.9`);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/modules/:id + versions
// ---------------------------------------------------------------------------

describe('PUT /api/modules/:id', () => {
  it('updates the latest version in place when no version is given', async () => {
    const app = makeApp();
    const { json: created } = await createModule(app);
    const id = created.module.id;

    const res = await app.request(`/api/modules/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: 'updated code',
        io_schema: { inputs: {}, outputs: {} },
        change_note: 'Updated from flow editor',
      }),
    });
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(json.module.version).toBe('1.0.0');

    // Still a single version, with updated code
    const versions = await readJson(app.request(`/api/modules/${id}/versions`));
    expect(versions.versions).toHaveLength(1);

    const resolved = await readJson(app.request(`/api/modules/${id}/resolve`));
    expect(resolved.code).toBe('updated code');
  });

  it('creates a new latest version when a different version is given', async () => {
    const app = makeApp();
    const { json: created } = await createModule(app);
    const id = created.module.id;

    const res = await app.request(`/api/modules/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: 'v1.0.1 code',
        io_schema: { inputs: {}, outputs: {} },
        version: '1.0.1',
        change_note: 'Release v1.0.1',
      }),
    });
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(json.module.version).toBe('1.0.1');

    // Versions list: newest first, new one marked latest
    const versions = await readJson(app.request(`/api/modules/${id}/versions`));
    expect(versions.success).toBe(true);
    expect(versions.versions).toHaveLength(2);
    expect(versions.versions[0].versionNumber).toBe('1.0.1');
    expect(versions.versions[0].isLatest).toBe(true);
    expect(versions.versions[1].versionNumber).toBe('1.0.0');
    expect(versions.versions[1].isLatest).toBe(false);

    // Resolve latest → new code; resolve pinned → old code
    const latest = await readJson(app.request(`/api/modules/${id}/resolve`));
    expect(latest.code).toBe('v1.0.1 code');
    expect(latest.version).toBe('1.0.1');

    const pinned = await readJson(app.request(`/api/modules/${id}/resolve?version=1.0.0`));
    expect(pinned.code).toBe('export default function run() { return 1; }');
    expect(pinned.version).toBe('1.0.0');
  });

  it('404s for an unknown module', async () => {
    const app = makeApp();
    const res = await app.request('/api/modules/nope', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'x' }),
    });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /api/modules/:id/star
// ---------------------------------------------------------------------------

describe('POST /api/modules/:id/star', () => {
  it('returns success (no-op stub)', async () => {
    const app = makeApp();
    const { json: created } = await createModule(app);
    const res = await app.request(`/api/modules/${created.module.id}/star`, { method: 'POST' });
    const json = (await res.json()) as any;
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/modules/:id
// ---------------------------------------------------------------------------

describe('DELETE /api/modules/:id', () => {
  let app: Hono;

  beforeEach(() => {
    app = makeApp();
  });

  it('deletes a module and its versions', async () => {
    const { json: created } = await createModule(app);
    const id = created.module.id;

    const res = await app.request(`/api/modules/${id}`, { method: 'DELETE' });
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);

    const list = await readJson(app.request('/api/modules'));
    expect(list.modules).toEqual([]);

    const resolved = await app.request(`/api/modules/${id}/resolve`);
    expect(resolved.status).toBe(404);
  });

  it('404s for an unknown module', async () => {
    const res = await app.request('/api/modules/nope', { method: 'DELETE' });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Full lifecycle (create → list → resolve → release → versions → delete)
// ---------------------------------------------------------------------------

describe('module lifecycle', () => {
  it('walks the full create/list/resolve/release/delete flow', async () => {
    const app = makeApp();

    const { json: created } = await createModule(app, { name: 'Lifecycle' });
    const id = created.module.id;

    let list = await readJson(app.request('/api/modules'));
    expect(list.modules.map((m: { name: string }) => m.name)).toContain('Lifecycle');

    await app.request(`/api/modules/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'v2', io_schema: {}, version: '2.0.0' }),
    });

    list = await readJson(app.request('/api/modules'));
    expect(list.modules[0].version).toBe('2.0.0');
    expect(list.modules[0].stats.versions).toBe(2);

    await app.request(`/api/modules/${id}`, { method: 'DELETE' });
    list = await readJson(app.request('/api/modules'));
    expect(list.modules).toEqual([]);
  });
});
