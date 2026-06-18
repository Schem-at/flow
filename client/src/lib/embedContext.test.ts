import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ALLOWED_ORIGINS,
  EMBED_CONTEXT,
  resolveAllowedOrigins,
  isOriginAllowed,
  sanitizeContext,
  parseContextMessage,
  parseContextFromQuery,
  contextPrefillMap,
  prefillInputsFromContext,
} from './embedContext';

describe('resolveAllowedOrigins', () => {
  it('expands the "self" token to the provided self origin', () => {
    const out = resolveAllowedOrigins(['self', 'https://schemati.com'], 'https://app.local');
    expect(out).toContain('https://app.local');
    expect(out).toContain('https://schemati.com');
    expect(out).not.toContain('self');
  });

  it('drops empty entries and dedupes', () => {
    const out = resolveAllowedOrigins(['', 'https://x.com', 'https://x.com'], 'https://x.com');
    expect(out).toEqual(['https://x.com']);
  });
});

describe('isOriginAllowed', () => {
  it('allows an origin on the allowlist', () => {
    expect(isOriginAllowed('https://schemati.com', DEFAULT_ALLOWED_ORIGINS, 'https://app.local')).toBe(true);
  });

  it('allows the self origin via the "self" token', () => {
    expect(isOriginAllowed('https://app.local', ['self'], 'https://app.local')).toBe(true);
  });

  it('denies an origin not on the allowlist', () => {
    expect(isOriginAllowed('https://evil.example', DEFAULT_ALLOWED_ORIGINS, 'https://app.local')).toBe(false);
  });

  it('denies empty / null-string / undefined origins', () => {
    expect(isOriginAllowed('', DEFAULT_ALLOWED_ORIGINS, 'https://app.local')).toBe(false);
    expect(isOriginAllowed('null', DEFAULT_ALLOWED_ORIGINS, 'https://app.local')).toBe(false);
    expect(isOriginAllowed(undefined, DEFAULT_ALLOWED_ORIGINS, 'https://app.local')).toBe(false);
  });
});

describe('sanitizeContext', () => {
  it('keeps known scalar keys and preserves extra keys', () => {
    const ctx = sanitizeContext({ pageUrl: 'https://p', referrer: 'https://r', custom: 42 });
    expect(ctx).toEqual({ pageUrl: 'https://p', referrer: 'https://r', custom: 42 });
  });

  it('type-checks the user object and drops non-string permissions', () => {
    const ctx = sanitizeContext({ user: { id: 'u1', permissions: ['a', 2, 'b'] } });
    expect(ctx?.user).toEqual({ id: 'u1', permissions: ['a', 'b'] });
  });

  it('type-checks the schematic object', () => {
    const ctx = sanitizeContext({ schematic: { id: 's1', url: 'https://s', junk: true } });
    expect(ctx?.schematic).toEqual({ id: 's1', url: 'https://s' });
  });

  it('returns null for non-objects and arrays', () => {
    expect(sanitizeContext(null)).toBeNull();
    expect(sanitizeContext('str')).toBeNull();
    expect(sanitizeContext([1, 2])).toBeNull();
  });
});

describe('parseContextMessage (origin allow/deny + malformed)', () => {
  const self = 'https://app.local';
  const good = { origin: 'https://schemati.com', data: { type: EMBED_CONTEXT, context: { pageUrl: 'https://p' } } };

  it('parses a well-formed message from an allowed origin', () => {
    expect(parseContextMessage(good, DEFAULT_ALLOWED_ORIGINS, self)).toEqual({ pageUrl: 'https://p' });
  });

  it('ignores a message from a disallowed origin', () => {
    const evil = { ...good, origin: 'https://evil.example' };
    expect(parseContextMessage(evil, DEFAULT_ALLOWED_ORIGINS, self)).toBeNull();
  });

  it('ignores a message with the wrong type', () => {
    const wrong = { origin: 'https://schemati.com', data: { type: 'something-else', context: {} } };
    expect(parseContextMessage(wrong, DEFAULT_ALLOWED_ORIGINS, self)).toBeNull();
  });

  it('ignores malformed / non-object payloads', () => {
    expect(parseContextMessage({ origin: 'https://schemati.com', data: undefined }, DEFAULT_ALLOWED_ORIGINS, self)).toBeNull();
    expect(parseContextMessage({ origin: 'https://schemati.com', data: 'hello' }, DEFAULT_ALLOWED_ORIGINS, self)).toBeNull();
    expect(parseContextMessage({ origin: 'https://schemati.com', data: { type: EMBED_CONTEXT } }, DEFAULT_ALLOWED_ORIGINS, self)).toBeNull();
  });
});

describe('parseContextFromQuery', () => {
  it('parses flat keys from a query string', () => {
    const ctx = parseContextFromQuery('?pageUrl=https://p&userId=u1&permissions=a,b&schematicId=s1');
    expect(ctx.pageUrl).toBe('https://p');
    expect(ctx.user).toEqual({ id: 'u1', permissions: ['a', 'b'] });
    expect(ctx.schematic).toEqual({ id: 's1' });
  });

  it('accepts a URLSearchParams instance', () => {
    const ctx = parseContextFromQuery(new URLSearchParams({ schematicUrl: 'https://s' }));
    expect(ctx.schematic).toEqual({ url: 'https://s' });
  });

  it('returns an empty object when nothing matches', () => {
    expect(parseContextFromQuery('?foo=bar')).toEqual({});
  });

  it('trims and drops empty permission entries', () => {
    const ctx = parseContextFromQuery('?userId=u&permissions=a,,%20b%20,');
    expect(ctx.user?.permissions).toEqual(['a', 'b']);
  });
});

describe('contextPrefillMap', () => {
  it('flattens nested user/schematic into prefill aliases', () => {
    const map = contextPrefillMap({
      pageUrl: 'https://p',
      user: { id: 'u1' },
      schematic: { id: 's1', url: 'https://s' },
    });
    expect(map.pageUrl).toBe('https://p');
    expect(map.userId).toBe('u1');
    expect(map.schematicId).toBe('s1');
    expect(map.schematicUrl).toBe('https://s');
  });
});

describe('prefillInputsFromContext (auto-bind by name)', () => {
  it('overrides only inputs whose name matches a context key', () => {
    const current = { pageUrl: '', schematicId: '', untouched: 'keep' };
    const next = prefillInputsFromContext(current, { pageUrl: 'https://p', schematic: { id: 's1' } });
    expect(next).toEqual({ pageUrl: 'https://p', schematicId: 's1', untouched: 'keep' });
  });

  it('does not invent inputs that are not in the eligible names', () => {
    const next = prefillInputsFromContext({ a: 1 }, { schematic: { id: 's1' } });
    expect(next).toEqual({ a: 1 });
    expect('schematicId' in next).toBe(false);
  });

  it('respects an explicit inputNames allowlist', () => {
    const next = prefillInputsFromContext({ pageUrl: '', userId: '' }, { pageUrl: 'https://p', user: { id: 'u1' } }, ['pageUrl']);
    expect(next.pageUrl).toBe('https://p');
    expect(next.userId).toBe(''); // userId not in inputNames → untouched
  });
});
