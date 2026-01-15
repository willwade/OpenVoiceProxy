/**
 * File-based API Key Repository
 * Implements KeyRepositoryPort for JSON file storage
 */

import type { KeyRepositoryPort } from '../../../application/ports/key-repository-port.js';
import { ApiKey } from '../../../domain/entities/api-key.js';
import type { FileStorage } from './file-storage.js';

interface StoredApiKey {
  id: string;
  name: string;
  keyHash?: string;
  key?: string; // Legacy: plaintext key
  keySuffix?: string;
  isAdmin: boolean;
  active: boolean;
  rateLimit?: number | { requests: number; windowMs: number };
  expiresAt: string | null;
  createdAt: string;
  lastUsed: string | null;
  requestCount: number;
  engineConfig?: Record<string, unknown> | null;
}

// Can be either new format or legacy array
type ApiKeysFile = { keys: StoredApiKey[]; version: number } | StoredApiKey[];

const KEYS_FILE = 'api-keys';

function storedToApiKey(stored: StoredApiKey): { apiKey: ApiKey; plainKey?: string } {
  // Handle legacy format with plaintext key
  const keyHash = stored.keyHash ?? (stored.key ? ApiKey.hashKey(stored.key) : '');
  const keySuffix = stored.keySuffix ?? (stored.key ? stored.key.slice(-8) : '');

  // Handle legacy rateLimit format
  let rateLimit = 100; // default
  if (typeof stored.rateLimit === 'number') {
    rateLimit = stored.rateLimit;
  } else if (stored.rateLimit && typeof stored.rateLimit === 'object') {
    rateLimit = stored.rateLimit.requests;
  }

  return {
    apiKey: ApiKey.fromData({
      id: stored.id,
      name: stored.name,
      keyHash,
      keySuffix,
      isAdmin: stored.isAdmin,
      active: stored.active,
      rateLimit,
      expiresAt: stored.expiresAt ? new Date(stored.expiresAt) : null,
      lastUsed: stored.lastUsed ? new Date(stored.lastUsed) : null,
      requestCount: stored.requestCount,
      engineConfig: stored.engineConfig as ApiKey['engineConfig'],
      createdAt: new Date(stored.createdAt),
    }),
    plainKey: stored.key, // Pass plaintext key for legacy lookup
  };
}

function apiKeyToStored(apiKey: ApiKey): StoredApiKey {
  const data = apiKey.toData();
  return {
    id: data.id,
    name: data.name,
    keyHash: data.keyHash,
    keySuffix: data.keySuffix,
    isAdmin: data.isAdmin,
    active: data.active,
    rateLimit: data.rateLimit,
    expiresAt: data.expiresAt?.toISOString() ?? null,
    createdAt: data.createdAt.toISOString(),
    lastUsed: data.lastUsed?.toISOString() ?? null,
    requestCount: data.requestCount,
    engineConfig: data.engineConfig,
  };
}

export class FileKeyRepository implements KeyRepositoryPort {
  private readonly storage: FileStorage;
  private cache: Map<string, ApiKey> | null = null;
  private cacheByHash: Map<string, ApiKey> | null = null;
  private cacheByPlainKey: Map<string, ApiKey> | null = null; // For legacy format

  constructor(storage: FileStorage) {
    this.storage = storage;
  }

  private async loadKeys(): Promise<Map<string, ApiKey>> {
    if (this.cache) return this.cache;

    const data = await this.storage.readJson<ApiKeysFile>(KEYS_FILE);
    this.cache = new Map();
    this.cacheByHash = new Map();
    this.cacheByPlainKey = new Map();

    // Handle both formats: array or { keys: [], version }
    const keysArray = Array.isArray(data) ? data : data?.keys ?? [];

    for (const stored of keysArray) {
      const { apiKey, plainKey } = storedToApiKey(stored);
      this.cache.set(apiKey.id, apiKey);
      this.cacheByHash.set(apiKey.keyHash, apiKey);
      // Also store by plaintext key for legacy lookup
      if (plainKey) {
        this.cacheByPlainKey.set(plainKey, apiKey);
      }
    }

    return this.cache;
  }

  private async saveKeys(): Promise<void> {
    if (!this.cache) return;

    const data: ApiKeysFile = {
      keys: Array.from(this.cache.values()).map(apiKeyToStored),
      version: 1,
    };

    await this.storage.writeJson(KEYS_FILE, data);
  }

  private invalidateCache(): void {
    this.cache = null;
    this.cacheByHash = null;
    this.cacheByPlainKey = null;
  }

  async findById(id: string): Promise<ApiKey | null> {
    const keys = await this.loadKeys();
    return keys.get(id) ?? null;
  }

  async findByKey(plainKey: string): Promise<ApiKey | null> {
    await this.loadKeys();

    // First try plaintext key lookup (for legacy format)
    if (this.cacheByPlainKey?.has(plainKey)) {
      return this.cacheByPlainKey.get(plainKey) ?? null;
    }

    // Then try hash lookup
    if (this.cacheByHash) {
      const keyHash = ApiKey.hashKey(plainKey);
      return this.cacheByHash.get(keyHash) ?? null;
    }

    return null;
  }

  async findAll(): Promise<ApiKey[]> {
    const keys = await this.loadKeys();
    return Array.from(keys.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  }

  async findAllActive(): Promise<ApiKey[]> {
    const all = await this.findAll();
    const now = new Date();
    return all.filter(
      (key) => key.active && (!key.expiresAt || key.expiresAt > now)
    );
  }

  async save(apiKey: ApiKey): Promise<void> {
    const keys = await this.loadKeys();
    keys.set(apiKey.id, apiKey);
    if (this.cacheByHash) {
      this.cacheByHash.set(apiKey.keyHash, apiKey);
    }
    await this.saveKeys();
  }

  async delete(id: string): Promise<boolean> {
    const keys = await this.loadKeys();
    const apiKey = keys.get(id);
    if (!apiKey) return false;

    keys.delete(id);
    if (this.cacheByHash) {
      this.cacheByHash.delete(apiKey.keyHash);
    }
    await this.saveKeys();
    return true;
  }

  async exists(id: string): Promise<boolean> {
    const keys = await this.loadKeys();
    return keys.has(id);
  }

  async incrementUsage(id: string): Promise<void> {
    const keys = await this.loadKeys();
    const apiKey = keys.get(id);
    if (!apiKey) return;

    const updated = apiKey.withIncrementedRequestCount();
    keys.set(id, updated);
    if (this.cacheByHash) {
      this.cacheByHash.set(updated.keyHash, updated);
    }
    await this.saveKeys();
  }

  async isAvailable(): Promise<boolean> {
    return this.storage.isAvailable();
  }

  /**
   * Reload keys from disk (useful if file was modified externally)
   */
  async reload(): Promise<void> {
    this.invalidateCache();
    await this.loadKeys();
  }
}

// Factory function
export function createFileKeyRepository(storage: FileStorage): FileKeyRepository {
  return new FileKeyRepository(storage);
}
