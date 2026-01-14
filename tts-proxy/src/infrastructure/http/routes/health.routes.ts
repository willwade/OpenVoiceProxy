/**
 * Health Check Routes
 * Endpoints for monitoring and load balancer health checks
 */

import { Hono } from 'hono';
import type { HealthResponse, ReadyResponse, MetricsResponse } from '../../../types/api.types.js';

// These will be set during server initialization
let startTime = Date.now();
let engineFactory: { getInitializedEngines: () => Map<string, { isAvailable: () => boolean }> } | null = null;
let keyRepository: { isAvailable: () => Promise<boolean> } | null = null;

export function setHealthDependencies(deps: {
  engineFactory?: typeof engineFactory;
  keyRepository?: typeof keyRepository;
}): void {
  if (deps.engineFactory) engineFactory = deps.engineFactory;
  if (deps.keyRepository) keyRepository = deps.keyRepository;
}

export function createHealthRoutes(): Hono {
  const routes = new Hono();

  /**
   * Basic health check
   * GET /health
   */
  routes.get('/health', async (c) => {
    const uptime = Math.floor((Date.now() - startTime) / 1000);

    const availableEngines: string[] = [];
    const unavailableEngines: string[] = [];

    if (engineFactory) {
      for (const [id, engine] of engineFactory.getInitializedEngines()) {
        if (engine.isAvailable()) {
          availableEngines.push(id);
        } else {
          unavailableEngines.push(id);
        }
      }
    }

    const response: HealthResponse = {
      status: unavailableEngines.length > 0 ? 'degraded' : 'ok',
      version: process.env['npm_package_version'] ?? '1.0.0',
      uptime,
      timestamp: new Date().toISOString(),
      engines: {
        available: availableEngines,
        unavailable: unavailableEngines,
      },
    };

    return c.json(response);
  });

  /**
   * Readiness check (for Kubernetes/load balancers)
   * GET /ready
   */
  routes.get('/ready', async (c) => {
    const checks = {
      database: false,
      engines: false,
    };

    // Check database
    if (keyRepository) {
      try {
        checks.database = await keyRepository.isAvailable();
      } catch {
        checks.database = false;
      }
    } else {
      // No database configured - that's OK for file-based storage
      checks.database = true;
    }

    // Check at least one engine is available
    if (engineFactory) {
      for (const [, engine] of engineFactory.getInitializedEngines()) {
        if (engine.isAvailable()) {
          checks.engines = true;
          break;
        }
      }
    }

    const ready = checks.engines; // At minimum, need one engine

    const response: ReadyResponse = {
      ready,
      checks,
    };

    return c.json(response, ready ? 200 : 503);
  });

  /**
   * Metrics endpoint
   * GET /metrics
   */
  routes.get('/metrics', async (c) => {
    // Basic metrics - would be enhanced with actual tracking
    const response: MetricsResponse = {
      requests: {
        total: 0,
        success: 0,
        errors: 0,
      },
      latency: {
        avg: 0,
        p50: 0,
        p95: 0,
        p99: 0,
      },
      engines: {},
    };

    return c.json(response);
  });

  /**
   * Liveness probe
   * GET /live
   */
  routes.get('/live', (c) => {
    return c.json({ status: 'alive' });
  });

  return routes;
}
