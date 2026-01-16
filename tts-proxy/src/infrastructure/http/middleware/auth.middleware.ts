/**
 * Authentication Middleware
 * Extracts and validates API keys from requests
 */

import type { Context, Next } from 'hono';
import { getEnv, isAuthRequired } from '../../../config/env.js';
import { ApiKey } from '../../../domain/entities/api-key.js';
import type { KeyRepositoryPort } from '../../../application/ports/key-repository-port.js';
import { UnauthorizedError, ForbiddenError } from '../../../domain/errors/domain-errors.js';

// This will be set by the server initialization
let keyRepository: KeyRepositoryPort | null = null;

export function setKeyRepository(repo: KeyRepositoryPort): void {
  keyRepository = repo;
}

/**
 * Extract API key from request
 */
function extractApiKey(c: Context): string | null {
  // Check X-API-Key header
  const xApiKey = c.req.header('X-API-Key');
  if (xApiKey) return xApiKey;

  // Check xi-api-key header (ElevenLabs compatibility)
  const xiApiKey = c.req.header('xi-api-key');
  if (xiApiKey) return xiApiKey;

  // Check Authorization header (Bearer token)
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // Check query parameter
  const queryKey = c.req.query('api_key');
  if (queryKey) return queryKey;

  return null;
}

/**
 * Authentication middleware
 */
export async function authMiddleware(c: Context, next: Next): Promise<Response | void> {
  const env = getEnv();
  const ctx = c.get('requestContext');

  // Skip auth in development mode unless explicitly required
  if (!isAuthRequired()) {
    ctx.isDevMode = true;
    ctx.isAdmin = true;
    return next();
  }

  // Skip auth in local mode (Electron desktop app)
  if (env.LOCAL_MODE) {
    ctx.isLocalMode = true;
    ctx.isAdmin = true;
    return next();
  }

  // Extract API key
  const plainKey = extractApiKey(c);

  if (!plainKey) {
    throw new UnauthorizedError('API key required');
  }

  // Check admin key first (quick path)
  if (env.ADMIN_API_KEY && plainKey === env.ADMIN_API_KEY) {
    ctx.isAdmin = true;
    return next();
  }

  // Look up key in repository
  if (!keyRepository) {
    throw new UnauthorizedError('Authentication service unavailable');
  }

  const apiKey = await keyRepository.findByKey(plainKey);

  if (!apiKey) {
    throw new UnauthorizedError('Invalid API key');
  }

  // Validate key state
  if (!apiKey.active) {
    throw new ForbiddenError('API key is inactive');
  }

  if (apiKey.isExpired()) {
    throw new ForbiddenError('API key has expired');
  }

  // Set context
  ctx.apiKey = apiKey;
  ctx.isAdmin = apiKey.isAdmin;

  return next();
}

/**
 * Admin-only middleware
 */
export async function adminOnlyMiddleware(c: Context, next: Next): Promise<Response | void> {
  const ctx = c.get('requestContext');

  if (!ctx.isAdmin) {
    throw new ForbiddenError('Admin access required');
  }

  return next();
}

/**
 * Optional auth middleware (doesn't require key, but extracts if present)
 */
export async function optionalAuthMiddleware(c: Context, next: Next): Promise<Response | void> {
  const env = getEnv();
  const ctx = c.get('requestContext');

  const plainKey = extractApiKey(c);

  if (!plainKey) {
    return next();
  }

  // Check admin key
  if (env.ADMIN_API_KEY && plainKey === env.ADMIN_API_KEY) {
    ctx.isAdmin = true;
    return next();
  }

  // Look up in repository if available
  if (keyRepository) {
    const apiKey = await keyRepository.findByKey(plainKey);
    if (apiKey && apiKey.active && !apiKey.isExpired()) {
      ctx.apiKey = apiKey;
      ctx.isAdmin = apiKey.isAdmin;
    }
  }

  return next();
}
