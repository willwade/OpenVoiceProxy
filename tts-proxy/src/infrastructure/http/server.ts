/**
 * Hono HTTP Server
 * Main server setup and configuration
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { serveStatic } from '@hono/node-server/serve-static';
import { serve } from '@hono/node-server';
import path from 'path';
import { fileURLToPath } from 'url';

import { getEnv } from '../../config/env.js';
import type { RequestContext } from '../../types/api.types.js';

import { authMiddleware } from './middleware/auth.middleware.js';
import { errorHandler } from './middleware/error-handler.middleware.js';
import { rateLimitMiddleware } from './middleware/rate-limit.middleware.js';

import { createHealthRoutes } from './routes/health.routes.js';
import { createTtsRoutes } from './routes/tts.routes.js';
import { createAdminRoutes } from './routes/admin.routes.js';
import { createEsp32Routes } from './routes/esp32.routes.js';

// Extend Hono's context with our custom variables
declare module 'hono' {
  interface ContextVariableMap {
    requestContext: RequestContext;
  }
}

export interface ServerConfig {
  port?: number;
  host?: string;
  corsOrigin?: string;
}

export interface ServerDependencies {
  // Add dependencies as needed when implementing use cases
}

export function createServer(
  config?: ServerConfig,
  _dependencies?: ServerDependencies
): Hono {
  const env = getEnv();
  const app = new Hono();

  // Global middleware
  app.use('*', logger());

  // CORS
  app.use(
    '*',
    cors({
      origin: config?.corsOrigin ?? env.CORS_ORIGIN ?? '*',
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
      exposeHeaders: [
        'X-Request-Id',
        'X-RateLimit-Limit',
        'X-RateLimit-Remaining',
        'X-RateLimit-Reset',
        'X-Audio-Format',
        'X-Sample-Rate',
        'X-Channels',
        'X-Bit-Depth',
        'X-Duration-Ms',
      ],
      maxAge: 86400,
      credentials: true,
    })
  );

  // Security headers
  app.use(
    '*',
    secureHeaders({
      // Allow inline scripts for admin UI
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
      },
    })
  );

  // Request context initialization
  app.use('*', async (c, next) => {
    const requestId = crypto.randomUUID();
    c.set('requestContext', {
      isAdmin: false,
      isDevMode: env.NODE_ENV === 'development',
      isLocalMode: env.LOCAL_MODE,
      requestId,
      startTime: Date.now(),
    });
    c.header('X-Request-Id', requestId);
    await next();
  });

  // Error handler (must be early to catch all errors)
  app.use('*', errorHandler);

  // Mount routes
  // Health routes (no auth required)
  const healthRoutes = createHealthRoutes();
  app.route('/', healthRoutes);

  // Static files for admin UI (BEFORE auth middleware)
  // Get the directory of the current module
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const publicDir = path.resolve(__dirname, '../../../public');

  // Serve admin static files without authentication
  app.use('/admin/*', serveStatic({ root: publicDir }));

  // Redirect /admin to /admin/
  app.get('/admin', (c) => c.redirect('/admin/'));

  // Auth middleware for protected routes (admin/api requires auth)
  app.use('/v1/*', authMiddleware);
  app.use('/admin/api/*', authMiddleware);
  app.use('/api/*', authMiddleware);

  // Rate limiting for API routes
  app.use('/v1/*', rateLimitMiddleware);
  app.use('/api/*', rateLimitMiddleware);

  // TTS routes (ElevenLabs-compatible API)
  const ttsRoutes = createTtsRoutes();
  app.route('/v1', ttsRoutes);

  // Admin API routes (mounted under /admin)
  const adminRoutes = createAdminRoutes();
  app.route('/admin', adminRoutes);

  // ESP32/Embedded device routes
  const esp32Routes = createEsp32Routes();
  app.route('/api', esp32Routes);

  // 404 handler
  app.notFound((c) => {
    return c.json(
      {
        error: {
          code: 'NOT_FOUND',
          message: `Route ${c.req.method} ${c.req.path} not found`,
        },
      },
      404
    );
  });

  return app;
}

export interface RunningServer {
  close: () => Promise<void>;
  port: number;
}

export async function startServer(
  app: Hono,
  config?: ServerConfig
): Promise<RunningServer> {
  const env = getEnv();
  const port = config?.port ?? env.PORT ?? 3000;
  const host = config?.host ?? env.HOST ?? '0.0.0.0';

  return new Promise((resolve) => {
    const server = serve(
      {
        fetch: app.fetch,
        port,
        hostname: host,
      },
      (info) => {
        console.log(`Server running at http://${host}:${info.port}`);
        resolve({
          close: async () => {
            server.close();
          },
          port: info.port,
        });
      }
    );
  });
}
