/**
 * File-based Storage Implementation
 * Stores data as JSON files on disk
 */

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import type { StoragePort, CredentialsStoragePort } from '../../../application/ports/storage-port.js';

export interface FileStorageConfig {
  dataDir: string;
}

export class FileStorage implements StoragePort {
  private readonly dataDir: string;

  constructor(config: FileStorageConfig) {
    this.dataDir = config.dataDir;
  }

  async readJson<T>(key: string): Promise<T | null> {
    const filePath = this.getPath(key);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async writeJson<T>(key: string, data: T): Promise<void> {
    const filePath = this.getPath(key);
    const dir = dirname(filePath);

    // Ensure directory exists
    await fs.mkdir(dir, { recursive: true });

    // Write atomically using temp file
    const tempPath = `${filePath}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    await fs.rename(tempPath, filePath);
  }

  async exists(key: string): Promise<boolean> {
    const filePath = this.getPath(key);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<boolean> {
    const filePath = this.getPath(key);
    try {
      await fs.unlink(filePath);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }

  async list(pattern?: string): Promise<string[]> {
    try {
      const files = await fs.readdir(this.dataDir);
      let result = files.filter((f) => f.endsWith('.json'));

      if (pattern) {
        const regex = new RegExp(pattern.replace('*', '.*'));
        result = result.filter((f) => regex.test(f));
      }

      return result.map((f) => f.replace('.json', ''));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  getPath(key: string): string {
    // Sanitize key to prevent path traversal
    const sanitized = key.replace(/[^a-zA-Z0-9-_]/g, '_');
    return join(this.dataDir, `${sanitized}.json`);
  }

  async isAvailable(): Promise<boolean> {
    try {
      await fs.access(this.dataDir);
      return true;
    } catch {
      // Try to create the directory
      try {
        await fs.mkdir(this.dataDir, { recursive: true });
        return true;
      } catch {
        return false;
      }
    }
  }
}

/**
 * Credentials storage using file system
 */
export class FileCredentialsStorage implements CredentialsStoragePort {
  private readonly storage: FileStorage;
  private readonly credentialsKey = 'system-credentials';

  constructor(storage: FileStorage) {
    this.storage = storage;
  }

  async getCredentials(engineId: string): Promise<Record<string, string> | null> {
    const all = await this.getAllCredentials();
    return all[engineId] ?? null;
  }

  async saveCredentials(engineId: string, credentials: Record<string, string>): Promise<void> {
    const all = await this.getAllCredentials();
    all[engineId] = credentials;
    await this.storage.writeJson(this.credentialsKey, all);
  }

  async deleteCredentials(engineId: string): Promise<boolean> {
    const all = await this.getAllCredentials();
    if (!(engineId in all)) return false;

    delete all[engineId];
    await this.storage.writeJson(this.credentialsKey, all);
    return true;
  }

  async getAllCredentials(): Promise<Record<string, Record<string, string>>> {
    const data = await this.storage.readJson<Record<string, Record<string, string>>>(
      this.credentialsKey
    );
    return data ?? {};
  }

  async hasCredentials(engineId: string): Promise<boolean> {
    const creds = await this.getCredentials(engineId);
    return creds !== null && Object.keys(creds).length > 0;
  }
}

// Factory function
export function createFileStorage(dataDir: string): {
  storage: FileStorage;
  credentials: FileCredentialsStorage;
} {
  const storage = new FileStorage({ dataDir });
  const credentials = new FileCredentialsStorage(storage);
  return { storage, credentials };
}
