import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { loadEnv } from './config/load-env.js';
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
import { getPostgresKeyRepository } from './infrastructure/persistence/postgres/key-repository.js';
import { isDatabaseAvailable, initializeSchema } from './infrastructure/persistence/postgres/connection.js';
import type { RunningServer } from './infrastructure/http/server.js';
import type { KeyRepositoryPort } from './application/ports/key-repository-port.js';
import type { EngineType } from './types/engine.types.js';

export interface ProxyServerOptions {
  port?: number;
  host?: string;
  dataDir?: string;
  localMode?: boolean;
}

export class ProxyServer {
  private readonly options: ProxyServerOptions;
  private runningServer: RunningServer | null = null;
  private portValue: number | null = null;

  constructor(options: ProxyServerOptions = {}) {
    this.options = options;
  }

  get isRunning(): boolean {
    return this.runningServer !== null;
  }

  get port(): number | null {
    return this.portValue;
  }

  async start(): Promise<void> {
    if (this.runningServer) return;

    loadEnv(import.meta.url);

    if (this.options.localMode) {
      process.env['LOCAL_MODE'] = 'true';
    }

    const env = getEnv();
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const dataDir =
      this.options.dataDir ??
      env.OPENVOICEPROXY_DATA_DIR ??
      env.DATA_DIR ??
      resolve(__dirname, '../data');

    console.log('OpenVoiceProxy Server');
    console.log('=====================');
    console.log(`Environment: ${env.NODE_ENV}`);
    console.log(`Port: ${this.options.port ?? env.PORT}`);

    const fileStorage = new FileStorage({ dataDir });
    const credentialsStorage = new FileCredentialsStorage(fileStorage);

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

    console.log('Initializing TTS engines...');
    const engineFactory = getEngineFactory();
    const engineTypes: EngineType[] = [
      'espeak',
      'azure',
      'elevenlabs',
      'openai',
      'google',
      'polly',
      'watson',
      'playht',
      'witai',
      'sherpaonnx',
    ];

    for (const engineId of engineTypes) {
      if (hasEngineCredentials(engineId)) {
        const creds = getEngineCredentials(engineId);
        engineFactory.setDefaultCredentials(engineId, creds);
        console.log(`  - ${engineId}: credentials loaded`);
      }
    }

    try {
      await engineFactory.createEngine('espeak');
      console.log('  - espeak: initialized');
    } catch {
      console.log('  - espeak: not available');
    }

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

    startRateLimitCleanup();

    const app = createServer();
    const server = await startServer(
      app,
      {
        port: this.options.port ?? env.PORT,
        host: this.options.host ?? env.HOST,
      },
      {
        engineFactory,
        keyRepository,
      }
    );

    this.runningServer = server;
    this.portValue = server.port;

    console.log('=====================');
    console.log(`Server ready at http://${this.options.host ?? env.HOST}:${server.port}`);
    console.log(`Admin UI at http://${this.options.host ?? env.HOST}:${server.port}/admin`);
    console.log(`WebSocket at ws://${this.options.host ?? env.HOST}:${server.port}/ws`);
  }

  async stop(): Promise<void> {
    if (!this.runningServer) return;
    await this.runningServer.close();
    this.runningServer = null;
    this.portValue = null;
  }
}
