/**
 * Error Handler Middleware
 * Catches and formats all errors
 */

import type { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';
import { isDomainError, type DomainError } from '../../../domain/errors/domain-errors.js';
import { isDevelopment } from '../../../config/env.js';
import type { ErrorResponse } from '../../../types/api.types.js';

/**
 * Format error for response
 */
function formatError(error: unknown, requestId?: string): { response: ErrorResponse; status: number } {
  // Domain errors
  if (isDomainError(error)) {
    return {
      response: {
        error: {
          code: error.code,
          message: error.message,
        },
        requestId,
      },
      status: error.statusCode,
    };
  }

  // Hono HTTP exceptions
  if (error instanceof HTTPException) {
    return {
      response: {
        error: {
          code: `HTTP_${error.status}`,
          message: error.message,
        },
        requestId,
      },
      status: error.status,
    };
  }

  // Zod validation errors
  if (error instanceof ZodError) {
    return {
      response: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: {
            errors: error.errors.map((e) => ({
              path: e.path.join('.'),
              message: e.message,
            })),
          },
        },
        requestId,
      },
      status: 400,
    };
  }

  // Generic errors
  if (error instanceof Error) {
    const isDev = isDevelopment();
    return {
      response: {
        error: {
          code: 'INTERNAL_ERROR',
          message: isDev ? error.message : 'An internal error occurred',
          ...(isDev && error.stack ? { details: { stack: error.stack } } : {}),
        },
        requestId,
      },
      status: 500,
    };
  }

  // Unknown errors
  return {
    response: {
      error: {
        code: 'UNKNOWN_ERROR',
        message: 'An unknown error occurred',
      },
      requestId,
    },
    status: 500,
  };
}

/**
 * Error handler middleware
 */
export async function errorHandler(c: Context, next: Next): Promise<Response | void> {
  try {
    await next();
  } catch (error) {
    const ctx = c.get('requestContext');
    const { response, status } = formatError(error, ctx?.requestId);

    // Log the error
    console.error(`[${ctx?.requestId ?? 'unknown'}] Error:`, error);

    return c.json(response, { status: status as 400 | 401 | 403 | 404 | 429 | 500 | 503 });
  }
}

/**
 * Create a not found error response
 */
export function notFoundResponse(c: Context, message?: string): Response {
  const ctx = c.get('requestContext');
  return c.json(
    {
      error: {
        code: 'NOT_FOUND',
        message: message ?? 'Resource not found',
      },
      requestId: ctx?.requestId,
    } as ErrorResponse,
    { status: 404 }
  );
}

/**
 * Create a bad request error response
 */
export function badRequestResponse(c: Context, message: string, details?: Record<string, unknown>): Response {
  const ctx = c.get('requestContext');
  return c.json(
    {
      error: {
        code: 'BAD_REQUEST',
        message,
        ...(details ? { details } : {}),
      },
      requestId: ctx?.requestId,
    } as ErrorResponse,
    { status: 400 }
  );
}
