import { describe, it, expect, vi } from 'vitest';

// Mock the db module to avoid bun:sqlite import at module level
vi.mock('../db/index.js', () => ({
  db: {},
  apiKeys: {},
}));

import { canAccessFlow, getEffectiveTtl, generateApiKey } from '../middleware/auth.js';
import type { AuthContext } from '../middleware/auth.js';

// ---------------------------------------------------------------------------
// Helper to build minimal AuthContext
// ---------------------------------------------------------------------------

function makeAuth(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    scopes: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// canAccessFlow
// ---------------------------------------------------------------------------

describe('canAccessFlow', () => {
  it('returns true when flowIds is undefined (no restriction)', () => {
    const auth = makeAuth({ flowIds: undefined });
    expect(canAccessFlow(auth, 'any-flow')).toBe(true);
  });

  it('returns true when flowIds is not set at all', () => {
    const auth = makeAuth();
    expect(canAccessFlow(auth, 'any-flow')).toBe(true);
  });

  it('returns true when flowId is in the allowed list', () => {
    const auth = makeAuth({ flowIds: ['flow-1', 'flow-2'] });
    expect(canAccessFlow(auth, 'flow-1')).toBe(true);
  });

  it('returns true for second item in allowed list', () => {
    const auth = makeAuth({ flowIds: ['flow-1', 'flow-2'] });
    expect(canAccessFlow(auth, 'flow-2')).toBe(true);
  });

  it('returns false when flowId is NOT in the allowed list', () => {
    const auth = makeAuth({ flowIds: ['flow-1'] });
    expect(canAccessFlow(auth, 'flow-99')).toBe(false);
  });

  it('returns false when flowIds is an empty array', () => {
    const auth = makeAuth({ flowIds: [] });
    expect(canAccessFlow(auth, 'flow-1')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getEffectiveTtl
// ---------------------------------------------------------------------------

describe('getEffectiveTtl', () => {
  it('uses defaultTtl when requestedTtl is undefined', () => {
    const auth = makeAuth();
    expect(getEffectiveTtl(undefined, 3600, auth)).toBe(3600);
  });

  it('uses requestedTtl when no maxTtl is set', () => {
    const auth = makeAuth();
    expect(getEffectiveTtl(7200, 3600, auth)).toBe(7200);
  });

  it('caps to maxTtl when requestedTtl exceeds it', () => {
    const auth = makeAuth({ maxTtl: 3600 });
    expect(getEffectiveTtl(7200, 1800, auth)).toBe(3600);
  });

  it('returns requestedTtl when it is under maxTtl', () => {
    const auth = makeAuth({ maxTtl: 3600 });
    expect(getEffectiveTtl(1800, 900, auth)).toBe(1800);
  });

  it('caps defaultTtl to maxTtl when requestedTtl is undefined', () => {
    const auth = makeAuth({ maxTtl: 1000 });
    expect(getEffectiveTtl(undefined, 5000, auth)).toBe(1000);
  });

  it('returns requestedTtl exactly at maxTtl boundary', () => {
    const auth = makeAuth({ maxTtl: 3600 });
    expect(getEffectiveTtl(3600, 1800, auth)).toBe(3600);
  });

  it('ignores maxTtl of 0 (falsy)', () => {
    const auth = makeAuth({ maxTtl: 0 });
    expect(getEffectiveTtl(7200, 3600, auth)).toBe(7200);
  });
});

// ---------------------------------------------------------------------------
// generateApiKey
// ---------------------------------------------------------------------------

describe('generateApiKey', () => {
  it('returns an object with key, prefix, and hash', async () => {
    const result = await generateApiKey();
    expect(result).toHaveProperty('key');
    expect(result).toHaveProperty('prefix');
    expect(result).toHaveProperty('hash');
  });

  it('key starts with "pk_"', async () => {
    const result = await generateApiKey();
    expect(result.key.startsWith('pk_')).toBe(true);
  });

  it('prefix is the first 11 characters of the key', async () => {
    const result = await generateApiKey();
    expect(result.prefix).toBe(result.key.slice(0, 11));
  });

  it('hash is a 64-character hex string (SHA-256)', async () => {
    const result = await generateApiKey();
    expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('generates unique keys on each call', async () => {
    const a = await generateApiKey();
    const b = await generateApiKey();
    expect(a.key).not.toBe(b.key);
    expect(a.hash).not.toBe(b.hash);
  });

  it('different keys produce different hashes', async () => {
    const results = await Promise.all([generateApiKey(), generateApiKey(), generateApiKey()]);
    const hashes = results.map((r) => r.hash);
    const unique = new Set(hashes);
    expect(unique.size).toBe(3);
  });
});
