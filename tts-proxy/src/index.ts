/**
 * OpenVoiceProxy Server Entry Point
 * TypeScript/Hono-based TTS proxy server
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Global error handlers to prevent crashes
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit - just log the error
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // For uncaught exceptions, we may want to exit after logging
  // but give a moment for logs to flush
  setTimeout(() => process.exit(1), 1000);
});

// Load environment variables
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });
config({ path: resolve(__dirname, '../../.env.local') });
config({ path: resolve(__dirname, '../.env') });
config({ path: resolve(__dirname, '../.env.local') });

import { getEnv, getEngineCredentials, hasEngineCredentials } from './config/env.js';
import { createServer, startServer } from './infrastructure/http/server.js';
import { setKeyRepository } from './infrastructure/http/middleware/auth.middleware.js';
import { setHealthDependencies } from './infrastructure/http/routes/health.routes.js';
import { setTtsDependencies } from './infrastructure/http/routes/tts.routes.js';
import { setAdminDependencies } from './infrastructure/http/routes/admin.routes.js';
import { setEsp32Dependencies } from './infrastructure/http/routes/esp32.routes.js';
import { startRateLimitCleanup } from './infrastructure/http/middleware/rate-limit.middleware.js';
import { getEngineFactory } from './infrastructure/tts-engines/engine-factory.js';
import { FileStorage, FileCredentialsStorage } from './infrastructure/persistence/file/file-storage.js';
import { FileKeyRepository } from './infrastructure/persistence/file/key-repository.js';
import { PostgresKeyRepository, getPostgresKeyRepository } from './infrastructure/persistence/postgres/key-repository.js';
import { isDatabaseAvailable, initializeSchema } from './infrastructure/persistence/postgres/connection.js';
import type { KeyRepositoryPort } from './application/ports/key-repository-port.js';
import type { EngineType } from './types/engine.types.js';

async function main(): Promise<void> {
  const env = getEnv();

  console.log('OpenVoiceProxy Server');
  console.log('=====================');
  console.log(`Environment: ${env.NODE_ENV}`);
  console.log(`Port: ${env.PORT}`);

  // Initialize storage
  const dataDir = resolve(__dirname, '../data');
  const fileStorage = new FileStorage({ dataDir });
  const credentialsStorage = new FileCredentialsStorage(fileStorage);

  // Initialize key repository (try database first, fall back to file)
  let keyRepository: KeyRepositoryPort;

  if (env.DATABASE_URL) {
    console.log('Checking database connection...');
    const dbAvailable = await isDatabaseAvailable();

    if (dbAvailable) {
      console.log('Using PostgreSQL for key storage');
      await initializeSchema();
      keyRepository = getPostgresKeyRepository();
    } else {
      console.log('Database not available, using file storage');
      keyRepository = new FileKeyRepository(fileStorage);
    }
  } else {
    console.log('Using file storage for keys');
    keyRepository = new FileKeyRepository(fileStorage);
  }

  // Initialize TTS engine factory
  console.log('Initializing TTS engines...');
  const engineFactory = getEngineFactory();

  // Load engine credentials from environment
  const engineTypes: EngineType[] = [
    'espeak', 'azure', 'elevenlabs', 'openai',
    'google', 'polly', 'watson', 'playht', 'witai', 'sherpaonnx'
  ];

  for (const engineId of engineTypes) {
    if (hasEngineCredentials(engineId)) {
      const creds = getEngineCredentials(engineId);
      engineFactory.setDefaultCredentials(engineId, creds);
      console.log(`  - ${engineId}: credentials loaded`);
    }
  }

  // Try to initialize free engines
  try {
    await engineFactory.createEngine('espeak');
    console.log('  - espeak: initialized');
  } catch (error) {
    console.log('  - espeak: not available');
  }

  // Inject dependencies into modules
  setKeyRepository(keyRepository);
  setHealthDependencies({
    engineFactory,
    keyRepository,
  });
  setTtsDependencies({
    engineFactory,
  });
  setAdminDependencies({
    keyRepository,
    credentialsStorage,
    engineFactory,
  });
  setEsp32Dependencies({
    engineFactory,
  });

  // Start rate limit cleanup
  startRateLimitCleanup();

  // Create and start server
  const app = createServer();
  const server = await startServer(
    app,
    {
      port: env.PORT,
      host: env.HOST,
    },
    {
      engineFactory,
      keyRepository,
    }
  );

  console.log('=====================');
  console.log(`Server ready at http://${env.HOST}:${server.port}`);
  console.log(`Admin UI at http://${env.HOST}:${server.port}/admin`);
  console.log(`WebSocket at ws://${env.HOST}:${server.port}/ws`);

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\nShutting down...');
    await server.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// Run
main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
