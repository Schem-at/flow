/**
 * Module API routes
 *
 * Backs the client module UI (ModuleBrowser, CodePanel, ModuleManager, TopBar).
 * Modules are versioned code blocks; each module has one or more versions and
 * exactly one version marked as latest.
 */

import { Hono } from 'hono';
import type { Module, ModuleVersion } from '../db/index.js';
import { drizzleModuleStore, type ModuleStore } from '../services/module-store.js';

const FIRST_VERSION = '1.0.0';

/**
 * Convert a module name to a URL-friendly slug
 */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'module';
}

/**
 * Compare two version strings (semver-ish, numeric segments), descending
 */
function compareVersionsDesc(a: string, b: string): number {
  const pa = a.split('.').map(n => parseInt(n, 10) || 0);
  const pb = b.split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pb[i] || 0) - (pa[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Sort versions newest first (createdAt desc, version number desc as tiebreak)
 */
function sortVersions(versions: ModuleVersion[]): ModuleVersion[] {
  return [...versions].sort((a, b) => {
    const timeDiff = b.createdAt.getTime() - a.createdAt.getTime();
    if (timeDiff !== 0) return timeDiff;
    return compareVersionsDesc(a.versionNumber, b.versionNumber);
  });
}

function latestOf(versions: ModuleVersion[]): ModuleVersion | undefined {
  return versions.find(v => v.isLatest) ?? sortVersions(versions)[0];
}

function parseIoSchema(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function toModuleListItem(module: Module, versions: ModuleVersion[]) {
  const latest = latestOf(versions);
  return {
    id: module.id,
    name: module.name,
    slug: module.slug,
    description: module.description,
    version: latest?.versionNumber ?? FIRST_VERSION,
    visibility: module.visibility,
    status: 'published',
    isOwner: true,
    canEdit: true,
    isStarred: false,
    isForked: false,
    owner: null,
    tags: [] as { id: string; name: string; color?: string }[],
    stats: { views: 0, uses: 0, stars: 0, forks: 0, runs: 0, versions: versions.length },
    createdAt: module.createdAt.getTime(),
    updatedAt: (module.updatedAt ?? module.createdAt).getTime(),
  };
}

export function createModulesRouter(store: ModuleStore = drizzleModuleStore) {
  const router = new Hono();

  /**
   * GET /api/modules - List modules (?q= or ?search= filters by name/description)
   */
  router.get('/', async (c) => {
    try {
      // Starring is a no-op stub, so the "starred" filter never matches anything
      if (c.req.query('starred') === '1') {
        return c.json({ success: true, modules: [] });
      }

      const q = (c.req.query('q') ?? c.req.query('search') ?? '').trim().toLowerCase();
      let allModules = await store.listModules();

      if (q) {
        allModules = allModules.filter(m =>
          m.name.toLowerCase().includes(q) ||
          (m.description ?? '').toLowerCase().includes(q) ||
          m.slug.toLowerCase().includes(q)
        );
      }

      const items = await Promise.all(allModules.map(async (m) => {
        const versions = await store.listVersions(m.id);
        return toModuleListItem(m, versions);
      }));

      // Newest first
      items.sort((a, b) => b.updatedAt - a.updatedAt);

      return c.json({ success: true, modules: items });
    } catch (error) {
      const err = error as Error;
      return c.json({ success: false, error: err.message }, 500);
    }
  });

  /**
   * POST /api/modules - Create a module with its first version (1.0.0)
   */
  router.post('/', async (c) => {
    try {
      const body = await c.req.json();
      const { name, code, io_schema, description, visibility = 'private' } = body;

      if (!name || typeof name !== 'string') {
        return c.json({ success: false, error: 'Name is required' }, 400);
      }
      if (typeof code !== 'string' || code.length === 0) {
        return c.json({ success: false, error: 'Code is required' }, 400);
      }

      // Slugify the name, deduping with -2, -3, ... suffixes
      const baseSlug = slugify(name);
      let slug = baseSlug;
      for (let i = 2; await store.getModuleBySlug(slug); i++) {
        slug = `${baseSlug}-${i}`;
      }

      const id = crypto.randomUUID();
      const now = new Date();

      await store.createModule({
        id,
        name,
        slug,
        description: description ?? null,
        visibility,
        createdAt: now,
        updatedAt: now,
      });

      await store.createVersion({
        id: crypto.randomUUID(),
        moduleId: id,
        versionNumber: FIRST_VERSION,
        code,
        ioSchema: io_schema != null ? JSON.stringify(io_schema) : null,
        changeNote: 'Initial version',
        isLatest: true,
        createdAt: now,
      });

      return c.json({
        success: true,
        module: { id, slug, name, version: FIRST_VERSION },
      }, 201);
    } catch (error) {
      const err = error as Error;
      return c.json({ success: false, error: err.message }, 500);
    }
  });

  /**
   * GET /api/modules/:id/resolve?version=X - Resolve module code (latest by default)
   */
  router.get('/:id/resolve', async (c) => {
    try {
      const id = c.req.param('id');
      const module = await store.getModule(id);
      if (!module) {
        return c.json({ success: false, error: 'Module not found' }, 404);
      }

      const versions = await store.listVersions(id);
      const requested = c.req.query('version');
      const version = requested
        ? versions.find(v => v.versionNumber === requested)
        : latestOf(versions);

      if (!version) {
        return c.json({ success: false, error: 'Version not found' }, 404);
      }

      return c.json({
        success: true,
        code: version.code,
        version: version.versionNumber,
        ioSchema: parseIoSchema(version.ioSchema),
      });
    } catch (error) {
      const err = error as Error;
      return c.json({ success: false, error: err.message }, 500);
    }
  });

  /**
   * GET /api/modules/:id/versions - List versions, newest first
   */
  router.get('/:id/versions', async (c) => {
    try {
      const id = c.req.param('id');
      const module = await store.getModule(id);
      if (!module) {
        return c.json({ success: false, error: 'Module not found' }, 404);
      }

      const versions = sortVersions(await store.listVersions(id));

      return c.json({
        success: true,
        versions: versions.map(v => ({
          id: v.id,
          versionNumber: v.versionNumber,
          isLatest: v.isLatest,
          changeNote: v.changeNote,
          createdAt: v.createdAt.getTime(),
        })),
      });
    } catch (error) {
      const err = error as Error;
      return c.json({ success: false, error: err.message }, 500);
    }
  });

  /**
   * PUT /api/modules/:id - Update module code
   *
   * If `version` is provided and differs from the latest version number, a new
   * version row is created and marked latest. Otherwise the latest version is
   * updated in place.
   */
  router.put('/:id', async (c) => {
    try {
      const id = c.req.param('id');
      const body = await c.req.json();
      const { code, io_schema, version, change_note } = body;

      const module = await store.getModule(id);
      if (!module) {
        return c.json({ success: false, error: 'Module not found' }, 404);
      }
      if (typeof code !== 'string') {
        return c.json({ success: false, error: 'Code is required' }, 400);
      }

      const versions = await store.listVersions(id);
      const latest = latestOf(versions);
      const now = new Date();
      const ioSchema = io_schema != null ? JSON.stringify(io_schema) : null;

      let latestNumber: string;

      if (version && version !== latest?.versionNumber) {
        // Release a new version (or re-release an existing number)
        const existing = versions.find(v => v.versionNumber === version);
        let versionId: string;
        if (existing) {
          versionId = existing.id;
          await store.updateVersion(existing.id, {
            code,
            ioSchema,
            changeNote: change_note ?? existing.changeNote,
          });
        } else {
          versionId = crypto.randomUUID();
          await store.createVersion({
            id: versionId,
            moduleId: id,
            versionNumber: version,
            code,
            ioSchema,
            changeNote: change_note ?? null,
            isLatest: false,
            createdAt: now,
          });
        }
        await store.setLatestVersion(id, versionId);
        latestNumber = version;
      } else if (latest) {
        // Update the latest version in place
        await store.updateVersion(latest.id, {
          code,
          ioSchema,
          changeNote: change_note ?? latest.changeNote,
        });
        latestNumber = latest.versionNumber;
      } else {
        // No versions exist yet (shouldn't happen) — create the first one
        const versionId = crypto.randomUUID();
        await store.createVersion({
          id: versionId,
          moduleId: id,
          versionNumber: version || FIRST_VERSION,
          code,
          ioSchema,
          changeNote: change_note ?? null,
          isLatest: true,
          createdAt: now,
        });
        latestNumber = version || FIRST_VERSION;
      }

      await store.updateModule(id, { updatedAt: now });

      return c.json({
        success: true,
        module: { id: module.id, slug: module.slug, name: module.name, version: latestNumber },
      });
    } catch (error) {
      const err = error as Error;
      return c.json({ success: false, error: err.message }, 500);
    }
  });

  /**
   * POST /api/modules/:id/star - Star a module (no-op stub)
   */
  router.post('/:id/star', async (c) => {
    return c.json({ success: true });
  });

  /**
   * DELETE /api/modules/:id - Delete a module and all its versions
   */
  router.delete('/:id', async (c) => {
    try {
      const id = c.req.param('id');
      const module = await store.getModule(id);
      if (!module) {
        return c.json({ success: false, error: 'Module not found' }, 404);
      }

      await store.deleteModule(id);

      return c.json({ success: true, message: 'Module deleted' });
    } catch (error) {
      const err = error as Error;
      return c.json({ success: false, error: err.message }, 500);
    }
  });

  return router;
}

const modulesRouter = createModulesRouter();

export default modulesRouter;
