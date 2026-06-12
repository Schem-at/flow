/**
 * schemati provider — endows blocks with a `Schemati` ambient for talking to
 * the schemati.test platform API (search schematics by tag, download files).
 *
 * Environment branching lives HERE, not in blocks:
 * - browser: same-origin fetch (the flow client is served behind the platform
 *   proxy, so '/api/v1/…' rides the page's session cookies — no config).
 * - node (server worker): base URL from env.schemati.baseUrl or SCHEMATI_URL,
 *   optional bearer token from env.schemati.token or SCHEMATI_API_TOKEN.
 *
 * Blocks call the same `Schemati.searchSchematics(...)` either way.
 */

import type { RuntimeProvider, RuntimeEnv } from './types.js';
import { schematicPreviewPng } from '../utils/schematic-preview.js';

export interface SchematiSummary {
  id: string;
  shortId: string;
  slug: string;
  name: string;
  description: string;
  format: string;
  isPublic: boolean;
  tags: string[];
  authors: string[];
  previewImageUrl: string | null;
  webUrl: string | null;
}

interface SearchOptions {
  /** Tag NAME (resolved to the platform's tag id) or tag id. */
  tag?: string;
  /** Free-text search over name/description. */
  search?: string;
  /** Max results (1–50). */
  limit?: number;
  page?: number;
}

interface RawTag {
  id: string;
  name: string;
}

function summarize(raw: Record<string, unknown>): SchematiSummary {
  const tags = (raw.tags as Array<{ name: string }> | undefined) ?? [];
  const authors = (raw.authors as Array<{ last_seen_name?: string; uuid: string }> | undefined) ?? [];
  return {
    id: String(raw.id),
    shortId: String(raw.short_id ?? ''),
    slug: String(raw.slug ?? ''),
    name: String(raw.name ?? ''),
    description: String(raw.description ?? ''),
    format: String(raw.format ?? ''),
    isPublic: Boolean(raw.is_public),
    tags: tags.map((t) => t.name),
    authors: authors.map((a) => a.last_seen_name ?? a.uuid),
    previewImageUrl: (raw.preview_image_url as string | null) ?? null,
    webUrl: (raw.web_url as string | null) ?? null,
  };
}

export function createSchematiClient(env: RuntimeEnv, context: Record<string, unknown>) {
  const isNode = env.kind === 'node';
  const procEnv =
    (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};

  if (isNode && procEnv.SCHEMATI_TLS_INSECURE === '1') {
    // Dev convenience for self-signed schemati.test certificates.
    procEnv.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  }

  // Browser: same-origin ('' base) unless explicitly overridden.
  const base = (env.schemati?.baseUrl ?? (isNode ? procEnv.SCHEMATI_URL : '') ?? '').replace(/\/$/, '');
  const token = env.schemati?.token ?? (isNode ? procEnv.SCHEMATI_API_TOKEN : undefined);

  if (isNode && !base) {
    const unconfigured = () => {
      throw new Error(
        'Schemati API is not configured on this server — set SCHEMATI_URL (and optionally SCHEMATI_API_TOKEN) in the flow server environment.'
      );
    };
    return {
      searchSchematics: unconfigured,
      getSchematic: unconfigured,
      getSchematicData: unconfigured,
      getTags: unconfigured,
      uploadSchematic: unconfigured,
    };
  }

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const request = async (path: string): Promise<Response> => {
    const res = await fetch(`${base}${path}`, {
      headers,
      credentials: isNode ? undefined : 'include',
    });
    if (!res.ok) {
      let detail = '';
      try {
        const body = (await res.json()) as { message?: string; error?: string };
        detail = body.message || body.error || '';
      } catch {
        /* non-JSON error body */
      }
      throw new Error(`Schemati API ${path} failed: ${res.status}${detail ? ` (${detail})` : ''}`);
    }
    return res;
  };

  let tagCache: RawTag[] | null = null;
  const resolveTagId = async (tag: string): Promise<string> => {
    // Accept a raw tag id directly (uuid-ish), otherwise resolve by name.
    if (/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(tag)) return tag;
    if (!tagCache) {
      const json = (await (await request('/api/tags')).json()) as { tags: RawTag[] };
      tagCache = json.tags ?? [];
    }
    const match = tagCache.find((t) => t.name.toLowerCase() === tag.toLowerCase());
    if (!match) {
      const known = tagCache.slice(0, 20).map((t) => t.name).join(', ');
      throw new Error(`Unknown schemati tag "${tag}". Known tags include: ${known}…`);
    }
    return match.id;
  };

  const searchSchematics = async (options: SearchOptions = {}): Promise<SchematiSummary[]> => {
    const params = new URLSearchParams();
    if (options.tag) params.set('tag', await resolveTagId(options.tag));
    if (options.search) params.set('search', options.search);
    params.set('per_page', String(Math.max(1, Math.min(50, options.limit ?? 15))));
    if (options.page) params.set('page', String(options.page));
    const json = (await (await request(`/api/v1/schematics?${params}`)).json()) as {
      data?: Array<Record<string, unknown>>;
    };
    return (json.data ?? []).map(summarize);
  };

  const getSchematicData = async (
    idOrSlug: string,
    options: { format?: string } = {}
  ): Promise<{ format: string; data: Uint8Array; metadata: { name: string } }> => {
    const suffix = options.format ? `?format=${encodeURIComponent(options.format)}` : '';
    const res = await request(`/api/v1/schematics/${encodeURIComponent(idOrSlug)}/download${suffix}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const disposition = res.headers.get('content-disposition') ?? '';
    const fileName = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? String(idOrSlug);
    const ext = fileName.split('.').pop() ?? options.format ?? 'schem';
    return { format: ext, data: bytes, metadata: { name: fileName } };
  };

  const getSchematic = async (idOrSlug: string, options: { format?: string } = {}) => {
    const SchematicClass = context.Schematic as (new () => { from_data(data: Uint8Array): void }) | undefined;
    if (!SchematicClass) {
      throw new Error('Schemati.getSchematic needs the nucleation provider (Schematic class) — use getSchematicData for raw bytes.');
    }
    const { data } = await getSchematicData(idOrSlug, options);
    const schematic = new SchematicClass();
    schematic.from_data(data);
    return schematic;
  };

  const getTags = async (): Promise<string[]> => {
    const json = (await (await request('/api/tags')).json()) as { tags: RawTag[] };
    tagCache = json.tags ?? [];
    return tagCache.map((t) => t.name);
  };

  /** Player JWT + uuid for write operations (upload needs `upload_schematic`). */
  const writeCredentials = async (): Promise<{ token: string; playerUuid: string }> => {
    if (!isNode) {
      // Coupled mode: mint a short-lived scoped token from the session.
      const res = await fetch(`${base}/api/user/flow-token`, {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        throw new Error(
          res.status === 401
            ? 'Uploading requires being signed in to schemati (with a linked player).'
            : `Could not get an upload token (${res.status}).`
        );
      }
      const json = (await res.json()) as { token: string; playerUuid: string };
      return { token: json.token, playerUuid: json.playerUuid };
    }
    if (!token) {
      throw new Error('Uploading from the server requires SCHEMATI_API_TOKEN (a player JWT with upload_schematic permission).');
    }
    // Player uuid comes from the JWT's sub claim.
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (!payload.sub) throw new Error('no sub');
      return { token, playerUuid: String(payload.sub) };
    } catch {
      throw new Error('SCHEMATI_API_TOKEN is not a decodable JWT (expected a player token with a sub claim).');
    }
  };

  const uploadSchematic = async (
    schematic: unknown,
    options: {
      name: string;
      description?: string;
      tags?: string[];
      isPublic?: boolean;
      format?: 'schem' | 'litematic' | 'schematic';
    }
  ): Promise<SchematiSummary> => {
    if (!options?.name) throw new Error('uploadSchematic needs a name');
    const source = schematic as {
      to_schematic?: () => Uint8Array;
      blocks?: () => Iterable<{ x: number; y: number; z: number; name: string }>;
      data?: Uint8Array;
    };
    const bytes = source?.to_schematic?.() ?? source?.data;
    if (!(bytes instanceof Uint8Array)) {
      throw new Error('uploadSchematic expects a Schematic (or {data: Uint8Array}) as its first argument');
    }
    const format = options.format ?? 'schem';
    const preview = source.blocks
      ? schematicPreviewPng(source as { blocks(): Iterable<{ x: number; y: number; z: number; name: string }> })
      : schematicPreviewPng({ blocks: () => [] });

    const creds = await writeCredentials();
    const form = new FormData();
    form.set('name', options.name);
    form.set('description', options.description || options.name);
    form.set('author_id', creds.playerUuid);
    form.set('is_public', options.isPublic === false ? '0' : '1');
    form.set('format', format);
    form.set(
      'schematic_file',
      new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer]),
      `${options.name}.${format}`
    );
    form.set('preview_image', new Blob([preview.buffer as ArrayBuffer], { type: 'image/png' }), 'preview.png');
    for (const tag of options.tags ?? []) {
      form.append('tags[]', await resolveTagId(tag));
    }

    const res = await fetch(`${base}/api/v1/schematics`, {
      method: 'POST',
      headers: { Accept: 'application/json', Authorization: `Bearer ${creds.token}` },
      credentials: isNode ? undefined : 'include',
      body: form,
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.status === 409) {
      const existing = json.existing as { id?: string; name?: string } | undefined;
      throw new Error(
        `Duplicate: this exact schematic already exists on the platform${existing ? ` as "${existing.name}" (${existing.id})` : ''}.`
      );
    }
    if (!res.ok) {
      const message = (json.message as string) || (json.error as string) || JSON.stringify(json).slice(0, 200);
      throw new Error(`Upload failed (${res.status}): ${message}`);
    }
    return summarize((json.data as Record<string, unknown>) ?? json);
  };

  return { searchSchematics, getSchematic, getSchematicData, getTags, uploadSchematic };
}

export const schematiProvider: RuntimeProvider = {
  name: 'schemati',
  version: '1.0.0',

  async create(env: RuntimeEnv, context: Record<string, unknown> = {}) {
    return { Schemati: createSchematiClient(env, context) };
  },
};
