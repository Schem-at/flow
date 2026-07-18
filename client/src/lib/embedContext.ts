/**
 * embedContext — pure, unit-testable helpers for the run-as-tool / embed player.
 *
 * Responsibilities (all side-effect free so they can be tested in isolation):
 *   1. Validate the `event.origin` of an incoming postMessage against an allowlist.
 *   2. Parse a trusted `EmbedContext` out of an inbound postMessage payload.
 *   3. Parse a (smaller) `EmbedContext` out of URL query params (fallback path).
 *   4. Prefill flow inputs whose name matches a top-level context key.
 *
 * SECURITY MODEL (read me):
 *   - `user` / `permissions` arriving via postMessage OR URL are UNTRUSTED.
 *     They are *display hints only*. NEVER gate real data access on them in the
 *     client — actual authorization must happen server-side inside the flow's
 *     authenticated API calls. We deliberately do not expose any "isAdmin"-style
 *     boolean derived from these hints.
 *   - The origin allowlist is the real trust boundary for postMessage: a message
 *     from a disallowed origin is ignored entirely (never parsed, never applied).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EmbedUser {
  id?: string;
  /** Display hints only — see SECURITY MODEL above. Never authz on these. */
  permissions?: string[];
}

export interface EmbedSchematic {
  id?: string;
  url?: string;
}

/** Extensible context bag passed from the embedding page into the flow. */
export interface EmbedContext {
  pageUrl?: string;
  referrer?: string;
  user?: EmbedUser;
  schematic?: EmbedSchematic;
  [k: string]: unknown;
}

/** postMessage protocol message names. */
export const EMBED_READY = 'flow-embed:ready' as const;
export const EMBED_CONTEXT = 'flow-embed:context' as const;

export interface EmbedReadyMessage {
  type: typeof EMBED_READY;
}

export interface EmbedContextMessage {
  type: typeof EMBED_CONTEXT;
  context: EmbedContext;
}

// ---------------------------------------------------------------------------
// Origin allowlist
// ---------------------------------------------------------------------------

/**
 * Default trusted parent origins. The embedding schemati page lives on one of
 * these. `'self'` is resolved at call time to the current `window.location.origin`
 * so a same-origin parent (e.g. local dev / preview) is always trusted.
 */
export const DEFAULT_ALLOWED_ORIGINS: string[] = [
  'self',
  'https://schemati.com',
  'https://www.schemati.com',
  'https://schemat.io',
  'https://www.schemat.io',
  // local dev hosts
  'https://schemati.test',
  'https://flow.schemati.test',
  'http://localhost:5173',
];

/**
 * Resolve the configured allowlist into concrete origins, expanding the special
 * `'self'` token to the current origin. Empty / falsy entries are dropped.
 */
export function resolveAllowedOrigins(
  allowed: string[] = DEFAULT_ALLOWED_ORIGINS,
  selfOrigin?: string,
): string[] {
  const self =
    selfOrigin ??
    (typeof window !== 'undefined' && window.location ? window.location.origin : undefined);
  const out = new Set<string>();
  for (const entry of allowed) {
    if (!entry) continue;
    if (entry === 'self') {
      if (self) out.add(self);
    } else {
      out.add(entry);
    }
  }
  return [...out];
}

/**
 * True iff `origin` is in the (resolved) allowlist. `'null'` (the string the
 * browser sends for sandboxed/file origins) and empty origins are always denied.
 */
export function isOriginAllowed(
  origin: string | undefined | null,
  allowed: string[] = DEFAULT_ALLOWED_ORIGINS,
  selfOrigin?: string,
): boolean {
  if (!origin || origin === 'null') return false;
  return resolveAllowedOrigins(allowed, selfOrigin).includes(origin);
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function asStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x): x is string => typeof x === 'string');
  return out.length ? out : undefined;
}

/**
 * Narrow an arbitrary value into a sanitized `EmbedContext`. Unknown keys are
 * preserved (the shape is intentionally extensible) but the *known* keys are
 * type-checked so a malformed `user`/`schematic` can't smuggle in garbage.
 * Returns `null` when the value isn't a plain object.
 */
export function sanitizeContext(raw: unknown): EmbedContext | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;
  const ctx: EmbedContext = {};

  for (const [k, v] of Object.entries(src)) {
    switch (k) {
      case 'pageUrl':
      case 'referrer': {
        const s = asString(v);
        if (s !== undefined) ctx[k] = s;
        break;
      }
      case 'user': {
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          const u = v as Record<string, unknown>;
          const user: EmbedUser = {};
          const id = asString(u.id);
          if (id !== undefined) user.id = id;
          const perms = asStringArray(u.permissions);
          if (perms !== undefined) user.permissions = perms;
          ctx.user = user;
        }
        break;
      }
      case 'schematic': {
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          const s = v as Record<string, unknown>;
          const schematic: EmbedSchematic = {};
          const id = asString(s.id);
          if (id !== undefined) schematic.id = id;
          const url = asString(s.url);
          if (url !== undefined) schematic.url = url;
          ctx.schematic = schematic;
        }
        break;
      }
      default:
        // Preserve extra keys verbatim (extensible shape).
        ctx[k] = v;
    }
  }
  return ctx;
}

/**
 * Validate + parse an inbound postMessage event. Returns the sanitized context
 * ONLY when (a) the origin is allowed and (b) the payload is a well-formed
 * `flow-embed:context` message. Otherwise returns `null` (caller ignores it).
 */
export function parseContextMessage(
  event: { origin?: string | null; data?: unknown },
  allowed: string[] = DEFAULT_ALLOWED_ORIGINS,
  selfOrigin?: string,
): EmbedContext | null {
  if (!isOriginAllowed(event.origin, allowed, selfOrigin)) return null;
  const data = event.data;
  if (!data || typeof data !== 'object') return null;
  const msg = data as Record<string, unknown>;
  if (msg.type !== EMBED_CONTEXT) return null;
  return sanitizeContext(msg.context);
}

/**
 * URL-param fallback: read simple context from a query string when the parent
 * does not use postMessage. Supports the flat keys `pageUrl`, `referrer`,
 * `userId`, `permissions` (comma-separated), `schematicId`, `schematicUrl`.
 * Accepts a `URLSearchParams`, a query string, or `''`.
 */
export function parseContextFromQuery(
  search: string | URLSearchParams,
): EmbedContext {
  const params =
    typeof search === 'string' ? new URLSearchParams(search) : search;
  const ctx: EmbedContext = {};

  const pageUrl = params.get('pageUrl');
  if (pageUrl) ctx.pageUrl = pageUrl;
  const referrer = params.get('referrer');
  if (referrer) ctx.referrer = referrer;

  const userId = params.get('userId');
  const permsRaw = params.get('permissions');
  if (userId || permsRaw) {
    ctx.user = {};
    if (userId) ctx.user.id = userId;
    if (permsRaw) {
      const perms = permsRaw.split(',').map((p) => p.trim()).filter(Boolean);
      if (perms.length) ctx.user.permissions = perms;
    }
  }

  const schematicId = params.get('schematicId');
  const schematicUrl = params.get('schematicUrl');
  if (schematicId || schematicUrl) {
    ctx.schematic = {};
    if (schematicId) ctx.schematic.id = schematicId;
    if (schematicUrl) ctx.schematic.url = schematicUrl;
  }

  return ctx;
}

// ---------------------------------------------------------------------------
// Input prefill (auto-bind)
// ---------------------------------------------------------------------------

/**
 * Flat map of the context's top-level scalar keys that can prefill an input by
 * name. Nested objects (`user`, `schematic`) are flattened to a few convenient
 * aliases so an input named e.g. `schematicId` or `userId` binds automatically.
 */
export function contextPrefillMap(ctx: EmbedContext): Record<string, unknown> {
  const map: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(ctx)) {
    if (k === 'user' || k === 'schematic') continue;
    if (v !== undefined && v !== null) map[k] = v;
  }

  if (ctx.user) {
    if (ctx.user.id !== undefined) {
      map.userId = ctx.user.id;
      map.user = ctx.user.id;
    }
  }
  if (ctx.schematic) {
    if (ctx.schematic.id !== undefined) {
      map.schematicId = ctx.schematic.id;
      map.schematic = ctx.schematic.id;
    }
    if (ctx.schematic.url !== undefined) {
      map.schematicUrl = ctx.schematic.url;
    }
  }

  return map;
}

/**
 * Given the current input values (keyed by input name/label) and a context,
 * return a NEW map with any input whose name matches a context prefill key
 * overridden by the context value. Inputs with no matching key are untouched.
 *
 * `inputNames` may be passed to restrict which keys are considered valid inputs
 * (so we never invent inputs that don't exist on the flow); when omitted, every
 * key already present in `current` is eligible.
 */
export function prefillInputsFromContext(
  current: Record<string, unknown>,
  ctx: EmbedContext,
  inputNames?: string[],
): Record<string, unknown> {
  const prefill = contextPrefillMap(ctx);
  const names = inputNames ?? Object.keys(current);
  const nameSet = new Set(names);
  const next = { ...current };
  for (const [key, value] of Object.entries(prefill)) {
    if (nameSet.has(key)) next[key] = value;
  }
  return next;
}
