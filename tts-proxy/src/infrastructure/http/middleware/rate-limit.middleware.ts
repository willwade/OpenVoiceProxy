/**
 * Rate Limiting Middleware
 * Per-key rate limiting using in-memory tracking
 */

import type { Context, Next } from 'hono';
import { getEnv } from '../../../config/env.js';
import { ApiKeyRateLimitedError } from '../../../domain/errors/domain-errors.js';

interface RateLimitState {
  count: number;
  windowStart: number;
}

// In-memory rate limit storage
const rateLimitStore = new Map<string, RateLimitState>();

// Cleanup interval
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start rate limit cleanup (call once at server start)
 */
export function startRateLimitCleanup(intervalMs = 60000): void {
  if (cleanupInterval) return;

  cleanupInterval = setInterval(() => {
    const env = getEnv();
    const windowMs = env.RATE_LIMIT_WINDOW_MS;
    const now = Date.now();

    for (const [key, state] of rateLimitStore.entries()) {
      if (now - state.windowStart >= windowMs) {
        rateLimitStore.delete(key);
      }
    }
  }, intervalMs);

  // Don't keep Node.js running for cleanup
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }
}

/**
 * Stop rate limit cleanup
 */
export function stopRateLimitCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

/**
 * Check rate limit for a key
 */
function checkRateLimit(
  keyId: string,
  limit: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const state = rateLimitStore.get(keyId);

  // New window or first request
  if (!state || now - state.windowStart >= windowMs) {
    rateLimitStore.set(keyId, { count: 1, windowStart: now });
    return {
      allowed: true,
      remaining: limit - 1,
      resetAt: now + windowMs,
    };
  }

  // Within current window
  const resetAt = state.windowStart + windowMs;

  if (state.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt,
    };
  }

  state.count++;
  return {
    allowed: true,
    remaining: limit - state.count,
    resetAt,
  };
}

/**
 * Rate limit middleware
 */
export async function rateLimitMiddleware(c: Context, next: Next): Promise<Response | void> {
  const env = getEnv();
  const ctx = c.get('requestContext');

  // Skip rate limiting in dev mode
  if (ctx.isDevMode) {
    return next();
  }

  // Skip rate limiting for admins
  if (ctx.isAdmin) {
    return next();
  }

  // Determine the key ID to use
  let keyId: string;
  let limit: number;

  if (ctx.apiKey) {
    keyId = ctx.apiKey.id;
    limit = ctx.apiKey.rateLimit;
  } else {
    // Use IP address for anonymous requests (limited use case)
    keyId = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? 'anonymous';
    limit = env.RATE_LIMIT_REQUESTS;
  }

  const result = checkRateLimit(keyId, limit, env.RATE_LIMIT_WINDOW_MS);

  // Set rate limit headers
  c.header('X-RateLimit-Limit', String(limit));
  c.header('X-RateLimit-Remaining', String(result.remaining));
  c.header('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)));

  if (!result.allowed) {
    const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
    c.header('Retry-After', String(retryAfter));
    throw new ApiKeyRateLimitedError(retryAfter);
  }

  // Store rate limit info in context
  ctx.rateLimitInfo = {
    remaining: result.remaining,
    limit,
    resetAt: new Date(result.resetAt),
    isLimited: false,
  };

  return next();
}

/**
 * Reset rate limit for a key (admin function)
 */
export function resetRateLimit(keyId: string): void {
  rateLimitStore.delete(keyId);
}

/**
 * Get current rate limit state for a key
 */
export function getRateLimitState(keyId: string): RateLimitState | undefined {
  return rateLimitStore.get(keyId);
}
