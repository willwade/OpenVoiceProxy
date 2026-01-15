#!/usr/bin/env node

/**
 * Script to create the initial admin API key.
 * Run with: npx tsx scripts/create-admin-key.ts
 */

import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'node:readline/promises';
import process from 'node:process';

import { loadEnv } from './load-env.js';
import { getEnv } from '../src/config/env.js';
import { FileStorage } from '../src/infrastructure/persistence/file/file-storage.js';
import { FileKeyRepository } from '../src/infrastructure/persistence/file/key-repository.js';
import { getPostgresKeyRepository } from '../src/infrastructure/persistence/postgres/key-repository.js';
import {
  initializeSchema,
  isDatabaseAvailable,
} from '../src/infrastructure/persistence/postgres/connection.js';
import type { KeyRepositoryPort } from '../src/application/ports/key-repository-port.js';
import { getKeyService } from '../src/domain/services/key-service.js';

async function getKeyRepository(
  dataDir: string
): Promise<KeyRepositoryPort> {
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

async function promptYesNo(question: string): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const answer = (await rl.question(question)).trim().toLowerCase();
  rl.close();
  return answer === 'y' || answer === 'yes';
}

async function createAdminKey(): Promise<void> {
  loadEnv(import.meta.url);
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const env = getEnv();

  console.log('Creating admin API key...');

  const dataDir = resolve(__dirname, '../data');
  const keyRepository = await getKeyRepository(dataDir);

  const existingKeys = await keyRepository.findAll();
  const adminKeys = existingKeys.filter((key) => key.isAdmin);

  if (adminKeys.length > 0) {
    console.log('Admin API key already exists. Existing admin keys:');
    for (const key of adminKeys) {
      console.log(`- ${key.name} (Created: ${key.createdAt.toISOString()})`);
    }

    const shouldCreate = await promptYesNo(
      'Do you want to create another admin key? (y/N): '
    );
    if (!shouldCreate) {
      console.log('Cancelled.');
      process.exit(0);
    }
  }

  const keyName = process.env.ADMIN_KEY_NAME || 'Initial Admin Key';
  const keyService = getKeyService();

  const { apiKey, plainKey } = keyService.createKey({
    name: keyName,
    isAdmin: true,
    rateLimit: env.RATE_LIMIT_REQUESTS,
  });

  await keyRepository.save(apiKey);

  console.log('Admin API key created successfully.');
  console.log('');
  console.log('IMPORTANT: Save this API key securely - it will not be shown again.');
  console.log('');
  console.log('API Key:', plainKey);
  console.log('');
  console.log('Key Details:');
  console.log('  Name:', apiKey.name);
  console.log('  Type: Admin');
  console.log('  Created:', apiKey.createdAt.toISOString());
  console.log('');
  console.log('You can now access the admin interface at:');
  console.log('  http://localhost:3000/admin');
  console.log('');
  console.log('For production deployment, set this as the ADMIN_API_KEY env var:');
  console.log(`  ADMIN_API_KEY=${plainKey}`);
}

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log('Create Admin API Key Script');
  console.log('');
  console.log('Usage: npx tsx scripts/create-admin-key.ts [options]');
  console.log('');
  console.log('Options:');
  console.log('  --help, -h     Show this help message');
  console.log('');
  console.log('Environment Variables:');
  console.log(
    '  ADMIN_KEY_NAME    Name for the admin key (default: "Initial Admin Key")'
  );
  process.exit(0);
}

createAdminKey().catch((error) => {
  console.error('Error creating admin API key:', error);
  process.exit(1);
});
