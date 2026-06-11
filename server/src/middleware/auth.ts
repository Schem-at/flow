/**
 * Authentication & Authorization Middleware
 * JWT validation, API key handling, and scope checking
 */

import { createMiddleware } from 'hono/factory';
import { eq } from 'drizzle-orm';
import { db, apiKeys, type ApiKey } from '../db/index.js';
import type { ApiScope, JwtPayload, ApiErrorCode } from 'shared';

// JWT secret - in production, use env var
const JWT_SECRET = process.env.JWT_SECRET || 'polymerase-dev-secret-change-in-production';

/**
 * Hash an API key using SHA-256
 */
async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Buffer.from(hash).toString('hex');
}

/**
 * Generate a new API key
 */
export async function generateApiKey(): Promise<{ key: string; prefix: string; hash: string }> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const key = `pk_${Buffer.from(bytes).toString('base64url')}`;
  const prefix = key.slice(0, 11); // pk_xxxxxxx
  const hash = await hashApiKey(key);
  
  return { key, prefix, hash };
}

/**
 * Verify JWT token
 */
async function verifyJwt(token: string): Promise<JwtPayload | null> {
  try {
    // Simple JWT verification (in production, use a proper JWT library)
    const [headerB64, payloadB64, signatureB64] = token.split('.');
    
    if (!headerB64 || !payloadB64 || !signatureB64) {
      return null;
    }

    // Verify signature
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(JWT_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const signature = Buffer.from(signatureB64, 'base64url');
    const data = encoder.encode(`${headerB64}.${payloadB64}`);
    
    const valid = await crypto.subtle.verify('HMAC', key, signature, data);
    
    if (!valid) {
      return null;
    }

    // Decode payload
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as JwtPayload;
    
    // Check expiration
    if (payload.exp && payload.exp < Date.now() / 1000) {
      return null;
    }

    return payload;
  } catch (err) {
    console.error('JWT verification error:', err);
    return null;
  }
}

/**
 * Create JWT token
 */
export async function createJwt(payload: Omit<JwtPayload, 'iat' | 'iss' | 'aud'>): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  
  const fullPayload: JwtPayload = {
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    iss: 'polymerase',
    aud: 'api',
  };

  const encoder = new TextEncoder();
  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(JWT_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`${headerB64}.${payloadB64}`)
  );

  const signatureB64 = Buffer.from(signature).toString('base64url');
  
  return `${headerB64}.${payloadB64}.${signatureB64}`;
}

/**
 * Validated auth context
 */
export interface AuthContext {
  apiKey?: ApiKey;
  jwt?: JwtPayload;
  scopes: ApiScope[];
  flowIds?: string[];
  maxTtl?: number;
}

/**
 * API error helper
 */
function apiError(code: ApiErrorCode, message: string, status: number = 401) {
  return {
    success: false as const,
    error: { code, message },
    status,
  };
}

/**
 * Auth middleware - validates API key or JWT
 */
export const authMiddleware = createMiddleware<{
  Variables: {
    auth: AuthContext;
  };
}>(async (c, next) => {
  let auth: AuthContext = { scopes: [] };

  // Check for API key in header
  const apiKeyHeader = c.req.header('X-API-Key');
  
  // Check for Bearer token
  const authHeader = c.req.header('Authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') 
    ? authHeader.slice(7) 
    : null;

  if (apiKeyHeader) {
    // Validate API key
    const keyHash = await hashApiKey(apiKeyHeader);
    const apiKey = await db.select()
      .from(apiKeys)
      .where(eq(apiKeys.keyHash, keyHash))
      .get();

    if (!apiKey) {
      return c.json(apiError('INVALID_API_KEY', 'Invalid API key'), 401);
    }

    if (!apiKey.isActive) {
      return c.json(apiError('INVALID_API_KEY', 'API key is disabled'), 401);
    }

    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      return c.json(apiError('EXPIRED_API_KEY', 'API key has expired'), 401);
    }

    // Update last used
    await db.update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, apiKey.id));

    auth = {
      apiKey,
      scopes: JSON.parse(apiKey.scopes) as ApiScope[],
      flowIds: apiKey.flowIds ? JSON.parse(apiKey.flowIds) : undefined,
      maxTtl: apiKey.maxTtl || undefined,
    };
  } else if (bearerToken) {
    // Validate JWT
    const payload = await verifyJwt(bearerToken);
    
    if (!payload) {
      return c.json(apiError('UNAUTHORIZED', 'Invalid or expired token'), 401);
    }

    auth = {
      jwt: payload,
      scopes: payload.scopes,
      flowIds: payload.flowIds,
      maxTtl: payload.maxTtl,
    };
  }

  c.set('auth', auth);
  await next();
});

/**
 * Require authentication middleware
 */
export const requireAuth = createMiddleware<{
  Variables: {
    auth: AuthContext;
  };
}>(async (c, next) => {
  const auth = c.get('auth');
  
  if (!auth?.apiKey && !auth?.jwt) {
    return c.json(apiError('UNAUTHORIZED', 'Authentication required'), 401);
  }

  await next();
});

/**
 * Require specific scopes middleware
 * If auth is provided, check scopes. If no auth, allow if scopes would be satisfied by default.
 */
export function requireScopes(...requiredScopes: ApiScope[]) {
  return createMiddleware<{
    Variables: {
      auth: AuthContext;
    };
  }>(async (c, next) => {
    const auth = c.get('auth');
    
    // If no auth provided, grant default scopes for anonymous access
    if (!auth?.apiKey && !auth?.jwt) {
      // Allow anonymous access with default scopes
      const defaultScopes: ApiScope[] = ['flow:read', 'flow:execute', 'flow:execute:async', 'run:read'];
      c.set('auth', { scopes: defaultScopes });
      await next();
      return;
    }

    const hasAllScopes = requiredScopes.every(scope => auth.scopes.includes(scope));
    
    if (!hasAllScopes) {
      return c.json(
        apiError(
          'INSUFFICIENT_SCOPE',
          `Missing required scopes: ${requiredScopes.filter(s => !auth.scopes.includes(s)).join(', ')}`
        ),
        403
      );
    }

    await next();
  });
}

/**
 * Check if auth context allows access to a specific flow
 */
export function canAccessFlow(auth: AuthContext, flowId: string): boolean {
  // No flow restriction
  if (!auth.flowIds) return true;
  
  // Check if flow is in allowed list
  return auth.flowIds.includes(flowId);
}

/**
 * Get effective TTL (respects maxTtl from auth)
 */
export function getEffectiveTtl(requestedTtl: number | undefined, defaultTtl: number, auth: AuthContext): number {
  let ttl = requestedTtl ?? defaultTtl;
  
  if (auth.maxTtl && ttl > auth.maxTtl) {
    ttl = auth.maxTtl;
  }
  
  return ttl;
}

// Rate limiting state (in-memory, use Redis in production)
const rateLimitState = new Map<string, { count: number; resetAt: number }>();

/**
 * Simple rate limiting middleware
 */
export function rateLimit(requests: number, windowMs: number) {
  return createMiddleware<{
    Variables: {
      auth: AuthContext;
    };
  }>(async (c, next) => {
    // Get rate limit key (API key ID, JWT subject, or IP)
    const auth = c.get('auth');
    const key = auth?.apiKey?.id || auth?.jwt?.sub || c.req.header('x-forwarded-for') || 'anonymous';
    
    const now = Date.now();
    const state = rateLimitState.get(key);
    
    if (!state || state.resetAt < now) {
      // New window
      rateLimitState.set(key, { count: 1, resetAt: now + windowMs });
    } else if (state.count >= requests) {
      // Rate limited
      c.header('X-RateLimit-Limit', String(requests));
      c.header('X-RateLimit-Remaining', '0');
      c.header('X-RateLimit-Reset', String(Math.ceil(state.resetAt / 1000)));
      
      return c.json(
        apiError('RATE_LIMITED', 'Rate limit exceeded', 429),
        429
      );
    } else {
      // Increment count
      state.count++;
    }

    // Set rate limit headers
    const currentState = rateLimitState.get(key)!;
    c.header('X-RateLimit-Limit', String(requests));
    c.header('X-RateLimit-Remaining', String(Math.max(0, requests - currentState.count)));
    c.header('X-RateLimit-Reset', String(Math.ceil(currentState.resetAt / 1000)));
    
    await next();
  });
}
