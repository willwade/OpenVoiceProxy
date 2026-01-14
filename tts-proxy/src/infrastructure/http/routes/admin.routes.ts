/**
 * Admin Routes
 * Dashboard and management API endpoints
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { adminOnlyMiddleware } from '../middleware/auth.middleware.js';
import { ApiKey } from '../../../domain/entities/api-key.js';
import { getKeyService } from '../../../domain/services/key-service.js';
import type { KeyRepositoryPort } from '../../../application/ports/key-repository-port.js';
import type { CredentialsStoragePort } from '../../../application/ports/storage-port.js';
import type { TTSEngineFactoryPort } from '../../../application/ports/tts-engine-port.js';
import { ENGINE_DEFINITIONS } from '../../../types/engine.types.js';
import { isAuthRequired, isDevelopment } from '../../../config/env.js';
import type {
  AdminKeyResponse,
  AdminKeysListResponse,
  AdminModeResponse,
  AdminEnginesStatusResponse,
} from '../../../types/api.types.js';

// Dependencies
let keyRepository: KeyRepositoryPort | null = null;
let credentialsStorage: CredentialsStoragePort | null = null;
let engineFactory: TTSEngineFactoryPort | null = null;

export function setAdminDependencies(deps: {
  keyRepository?: KeyRepositoryPort;
  credentialsStorage?: CredentialsStoragePort;
  engineFactory?: TTSEngineFactoryPort;
}): void {
  if (deps.keyRepository) keyRepository = deps.keyRepository;
  if (deps.credentialsStorage) credentialsStorage = deps.credentialsStorage;
  if (deps.engineFactory) engineFactory = deps.engineFactory;
}

// Validation schemas
const createKeySchema = z.object({
  name: z.string().min(1).max(100),
  isAdmin: z.boolean().optional().default(false),
  rateLimit: z.number().min(1).max(10000).optional(),
  expiresAt: z.string().datetime().optional(),
});

const updateKeySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  isAdmin: z.boolean().optional(),
  active: z.boolean().optional(),
  rateLimit: z.number().min(1).max(10000).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

const engineConfigSchema = z.record(
  z.object({
    enabled: z.boolean(),
    useCustomCredentials: z.boolean().optional(),
    credentials: z.record(z.string()).optional(),
  })
);

const credentialsSchema = z.object({
  credentials: z.record(z.string()),
});

function apiKeyToResponse(apiKey: ApiKey, plainKey?: string): AdminKeyResponse {
  return {
    id: apiKey.id,
    name: apiKey.name,
    keySuffix: apiKey.keySuffix,
    isAdmin: apiKey.isAdmin,
    active: apiKey.active,
    createdAt: apiKey.createdAt.toISOString(),
    lastUsed: apiKey.lastUsed?.toISOString() ?? null,
    requestCount: apiKey.requestCount,
    expiresAt: apiKey.expiresAt?.toISOString() ?? null,
    ...(plainKey ? { key: plainKey } : {}),
  };
}

export function createAdminRoutes(): Hono {
  const routes = new Hono();

  // All admin routes require admin authentication
  routes.use('/*', adminOnlyMiddleware);

  /**
   * Get authentication mode
   * GET /admin/api/mode
   */
  routes.get('/api/mode', (c) => {
    const response: AdminModeResponse = {
      mode: isDevelopment() ? 'development' : 'production',
      requiresAuth: isAuthRequired(),
    };
    return c.json(response);
  });

  /**
   * List all API keys
   * GET /admin/api/keys
   */
  routes.get('/api/keys', async (c) => {
    if (!keyRepository) {
      return c.json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Key service not available' } }, 503);
    }

    const keys = await keyRepository.findAll();
    const response: AdminKeysListResponse = {
      keys: keys.map((k) => apiKeyToResponse(k)),
      total: keys.length,
    };

    return c.json(response);
  });

  /**
   * Create a new API key
   * POST /admin/api/keys
   */
  routes.post('/api/keys', zValidator('json', createKeySchema), async (c) => {
    if (!keyRepository) {
      return c.json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Key service not available' } }, 503);
    }

    const body = c.req.valid('json');
    const keyService = getKeyService();

    const { apiKey, plainKey } = keyService.createKey({
      name: body.name,
      isAdmin: body.isAdmin,
      rateLimit: body.rateLimit,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
    });

    await keyRepository.save(apiKey);

    return c.json(apiKeyToResponse(apiKey, plainKey), 201);
  });

  /**
   * Get a specific API key
   * GET /admin/api/keys/:keyId
   */
  routes.get('/api/keys/:keyId', async (c) => {
    if (!keyRepository) {
      return c.json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Key service not available' } }, 503);
    }

    const keyId = c.req.param('keyId');
    const apiKey = await keyRepository.findById(keyId);

    if (!apiKey) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'API key not found' } }, 404);
    }

    return c.json(apiKeyToResponse(apiKey));
  });

  /**
   * Update an API key
   * PUT /admin/api/keys/:keyId
   */
  routes.put('/api/keys/:keyId', zValidator('json', updateKeySchema), async (c) => {
    if (!keyRepository) {
      return c.json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Key service not available' } }, 503);
    }

    const keyId = c.req.param('keyId');
    const body = c.req.valid('json');

    const apiKey = await keyRepository.findById(keyId);
    if (!apiKey) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'API key not found' } }, 404);
    }

    const keyService = getKeyService();
    const updated = keyService.updateKey(apiKey, {
      name: body.name,
      isAdmin: body.isAdmin,
      active: body.active,
      rateLimit: body.rateLimit,
      expiresAt: body.expiresAt === null ? null : body.expiresAt ? new Date(body.expiresAt) : undefined,
    });

    await keyRepository.save(updated);

    return c.json(apiKeyToResponse(updated));
  });

  /**
   * Delete an API key
   * DELETE /admin/api/keys/:keyId
   */
  routes.delete('/api/keys/:keyId', async (c) => {
    if (!keyRepository) {
      return c.json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Key service not available' } }, 503);
    }

    const keyId = c.req.param('keyId');
    const deleted = await keyRepository.delete(keyId);

    if (!deleted) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'API key not found' } }, 404);
    }

    return c.json({ success: true });
  });

  /**
   * Get engine config for a key
   * GET /admin/api/keys/:keyId/engines
   */
  routes.get('/api/keys/:keyId/engines', async (c) => {
    if (!keyRepository) {
      return c.json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Key service not available' } }, 503);
    }

    const keyId = c.req.param('keyId');
    const apiKey = await keyRepository.findById(keyId);

    if (!apiKey) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'API key not found' } }, 404);
    }

    return c.json({ engineConfig: apiKey.engineConfig ?? {} });
  });

  /**
   * Update engine config for a key
   * PUT /admin/api/keys/:keyId/engines
   */
  routes.put('/api/keys/:keyId/engines', zValidator('json', engineConfigSchema), async (c) => {
    if (!keyRepository) {
      return c.json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Key service not available' } }, 503);
    }

    const keyId = c.req.param('keyId');
    const body = c.req.valid('json');

    const apiKey = await keyRepository.findById(keyId);
    if (!apiKey) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'API key not found' } }, 404);
    }

    const updated = apiKey.withUpdatedEngineConfig(body);
    await keyRepository.save(updated);

    return c.json({ engineConfig: updated.engineConfig ?? {} });
  });

  /**
   * Get engine status
   * GET /admin/api/engines/status
   */
  routes.get('/api/engines/status', async (c) => {
    const engines: Record<string, unknown> = {};

    for (const [engineId, def] of Object.entries(ENGINE_DEFINITIONS)) {
      let status = {
        valid: false,
        engine: engineId,
        environment: 'unknown',
        requiresCredentials: def.requiresCredentials,
        credentialTypes: def.credentialFields.map((f) => f.envVar),
        message: 'Not initialized',
        details: {
          voiceCount: 0,
          hasCredentials: false,
        },
      };

      if (engineFactory && engineFactory.getCachedEngine) {
        try {
          const engine = engineFactory.getCachedEngine(engineId as keyof typeof ENGINE_DEFINITIONS);
          if (engine) {
            const engineStatus = engine.getStatus();
            status = {
              valid: engineStatus.available,
              engine: engineId,
              environment: 'system',
              requiresCredentials: def.requiresCredentials,
              credentialTypes: def.credentialFields.map((f) => f.envVar),
              message: engineStatus.message,
              details: {
                voiceCount: engineStatus.voiceCount,
                hasCredentials: true,
              },
              ...(engineStatus.error ? { error: engineStatus.error } : {}),
            };
          }
        } catch {
          // Engine not available
        }
      }

      engines[engineId] = status;
    }

    const response: AdminEnginesStatusResponse = {
      engines: engines as AdminEnginesStatusResponse['engines'],
      timestamp: new Date().toISOString(),
    };

    return c.json(response);
  });

  /**
   * Get system credentials
   * GET /admin/api/settings/credentials
   */
  routes.get('/api/settings/credentials', async (c) => {
    if (!credentialsStorage) {
      return c.json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Credentials service not available' } }, 503);
    }

    const all = await credentialsStorage.getAllCredentials();

    // Mask sensitive values
    const masked: Record<string, Record<string, string>> = {};
    for (const [engineId, creds] of Object.entries(all)) {
      masked[engineId] = {};
      for (const [key, value] of Object.entries(creds)) {
        masked[engineId][key] = value.length > 8 ? `${value.slice(0, 4)}...${value.slice(-4)}` : '****';
      }
    }

    return c.json({ credentials: masked });
  });

  /**
   * Update credentials for an engine
   * PUT /admin/api/settings/credentials/:engineId
   */
  routes.put('/api/settings/credentials/:engineId', zValidator('json', credentialsSchema), async (c) => {
    if (!credentialsStorage) {
      return c.json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Credentials service not available' } }, 503);
    }

    const engineId = c.req.param('engineId');
    const body = c.req.valid('json');

    await credentialsStorage.saveCredentials(engineId, body.credentials);

    return c.json({ success: true });
  });

  /**
   * Test credentials for an engine
   * POST /admin/api/settings/credentials/:engineId/test
   */
  routes.post('/api/settings/credentials/:engineId/test', async (c) => {
    if (!engineFactory) {
      return c.json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Engine service not available' } }, 503);
    }

    const engineId = c.req.param('engineId') as keyof typeof ENGINE_DEFINITIONS;

    try {
      const engine = await engineFactory.createEngine(engineId);
      const voices = await engine.getVoices();

      return c.json({
        success: true,
        engine: engineId,
        message: `Successfully connected. ${voices.length} voices available.`,
        voiceCount: voices.length,
      });
    } catch (error) {
      return c.json({
        success: false,
        engine: engineId,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * Get usage statistics
   * GET /admin/api/usage
   */
  routes.get('/api/usage', async (c) => {
    // Placeholder - would integrate with UsageService
    return c.json({
      totalRequests: 0,
      byKey: {},
      byEngine: {},
      byPath: {},
      period: {
        start: new Date(Date.now() - 86400000).toISOString(),
        end: new Date().toISOString(),
      },
    });
  });

  return routes;
}
