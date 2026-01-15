#!/usr/bin/env node

/**
 * Production setup script for OpenVoiceProxy.
 */

import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import { loadEnv } from './load-env.js';
import { getEnv } from '../src/config/env.js';
import { getKeyService } from '../src/domain/services/key-service.js';
import { FileStorage } from '../src/infrastructure/persistence/file/file-storage.js';
import { FileKeyRepository } from '../src/infrastructure/persistence/file/key-repository.js';
import { getPostgresKeyRepository } from '../src/infrastructure/persistence/postgres/key-repository.js';
import {
  initializeSchema,
  isDatabaseAvailable,
} from '../src/infrastructure/persistence/postgres/connection.js';
import type { KeyRepositoryPort } from '../src/application/ports/key-repository-port.js';

loadEnv(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

async function getKeyRepository(dataDir: string): Promise<KeyRepositoryPort> {
  const env = getEnv();

  if (env.DATABASE_URL) {
    const dbAvailable = await isDatabaseAvailable();
    if (dbAvailable) {
      await initializeSchema();
      return getPostgresKeyRepository();
    }
  }

  const storage = new FileStorage({ dataDir });
  return new FileKeyRepository(storage);
}

async function setupProduction(): Promise<void> {
  const env = getEnv();

  console.log('Setting up OpenVoiceProxy for production...');
  console.log('');

  const dataDir = resolve(__dirname, '../data');
  const keyRepository = await getKeyRepository(dataDir);
  console.log('Key repository initialized');

  console.log('');
  console.log('Checking admin API key...');
  if (!env.ADMIN_API_KEY) {
    console.error('ADMIN_API_KEY environment variable is not set');
    console.log('Set ADMIN_API_KEY and run setup again.');
    process.exit(1);
  }

  if (!env.ADMIN_API_KEY.startsWith('tts_')) {
    console.warn('Admin API key should start with "tts_" for consistency');
  }

  console.log('Admin API key is configured');

  const existingKeys = await keyRepository.findAll();
  const adminKeys = existingKeys.filter((key) => key.isAdmin);

  console.log('');
  console.log('Current API key status:');
  console.log(`  Total keys: ${existingKeys.length}`);
  console.log(`  Admin keys: ${adminKeys.length}`);
  console.log(`  Regular keys: ${existingKeys.length - adminKeys.length}`);

  if (adminKeys.length === 0) {
    console.log('');
    console.log('Creating initial admin API key...');
    const keyService = getKeyService();
    const { apiKey, plainKey } = keyService.createKey({
      name: 'Production Admin Key',
      isAdmin: true,
      rateLimit: env.RATE_LIMIT_REQUESTS,
    });
    await keyRepository.save(apiKey);

    console.log('Initial admin key created');
    console.log('');
    console.log('IMPORTANT: Save this API key securely.');
    console.log(`API Key: ${plainKey}`);
  }

  console.log('');
  console.log('Checking TTS engine configuration...');
  const engines: string[] = [];

  if (env.AZURE_SPEECH_KEY && env.AZURE_SPEECH_REGION) engines.push('Azure Speech Services');
  if (env.ELEVENLABS_API_KEY) engines.push('ElevenLabs');
  if (env.OPENAI_API_KEY) engines.push('OpenAI');
  if (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) engines.push('AWS Polly');
  if (env.GOOGLE_APPLICATION_CREDENTIALS_JSON || env.GOOGLE_API_KEY) {
    engines.push('Google Cloud TTS');
  }

  if (engines.length === 0) {
    console.warn('No TTS engines configured - only eSpeak fallback will be available');
    console.log('Configure at least one cloud TTS service:');
    console.log('  - Azure Speech Services (AZURE_SPEECH_KEY, AZURE_SPEECH_REGION)');
    console.log('  - ElevenLabs (ELEVENLABS_API_KEY)');
    console.log('  - OpenAI (OPENAI_API_KEY)');
    console.log('  - AWS Polly (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)');
    console.log('  - Google Cloud TTS (GOOGLE_APPLICATION_CREDENTIALS_JSON or GOOGLE_API_KEY)');
  } else {
    console.log('TTS engines configured:');
    engines.forEach((engine) => console.log(`  - ${engine}`));
  }

  console.log('');
  console.log('Database configuration:');
  if (env.DATABASE_URL) {
    console.log('Database URL configured');
    console.log('Database tables will be created automatically');
  } else {
    console.warn('No database configured - using file-based storage');
  }

  console.log('');
  console.log('Security configuration:');
  console.log(`  API Key Required: ${env.API_KEY_REQUIRED}`);
  console.log(`  CORS Origin: ${env.CORS_ORIGIN}`);
  console.log(`  Rate Limiting: ${env.RATE_LIMIT_REQUESTS} requests per ${env.RATE_LIMIT_WINDOW_MS}ms`);
  console.log(`  Max Request Size: ${env.MAX_REQUEST_SIZE}`);

  console.log('');
  console.log('Production setup complete!');
  console.log('');
  console.log('Next steps:');
  console.log('1. Access the admin interface at: /admin');
  console.log('2. Create API keys for your applications');
  console.log('3. Test the TTS endpoints');
  console.log('4. Monitor the application logs and metrics');
}

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log('Production Setup Script');
  console.log('');
  console.log('Usage: npx tsx scripts/setup-production.ts');
  console.log('');
  console.log('Environment Variables Required:');
  console.log('  ADMIN_API_KEY    Admin API key for management');
  console.log('');
  process.exit(0);
}

setupProduction().catch((error) => {
  console.error('Setup failed:', error);
  process.exit(1);
});
