/**
 * Storage Port
 * Interface for file and data storage operations
 */

export interface StoragePort {
  /**
   * Read JSON data from storage
   */
  readJson<T>(key: string): Promise<T | null>;

  /**
   * Write JSON data to storage
   */
  writeJson<T>(key: string, data: T): Promise<void>;

  /**
   * Check if a key exists
   */
  exists(key: string): Promise<boolean>;

  /**
   * Delete data by key
   */
  delete(key: string): Promise<boolean>;

  /**
   * List all keys matching a pattern
   */
  list(pattern?: string): Promise<string[]>;

  /**
   * Get the storage path for a key
   */
  getPath(key: string): string;

  /**
   * Check if storage is available
   */
  isAvailable(): Promise<boolean>;
}

/**
 * Credentials storage specifically for TTS engine credentials
 */
export interface CredentialsStoragePort {
  /**
   * Get credentials for an engine
   */
  getCredentials(engineId: string): Promise<Record<string, string> | null>;

  /**
   * Save credentials for an engine
   */
  saveCredentials(engineId: string, credentials: Record<string, string>): Promise<void>;

  /**
   * Delete credentials for an engine
   */
  deleteCredentials(engineId: string): Promise<boolean>;

  /**
   * Get all stored engine credentials
   */
  getAllCredentials(): Promise<Record<string, Record<string, string>>>;

  /**
   * Check if credentials exist for an engine
   */
  hasCredentials(engineId: string): Promise<boolean>;
}

/**
 * Usage log storage
 */
export interface UsageStoragePort {
  /**
   * Append a usage record
   */
  appendUsage(record: {
    timestamp: Date;
    keyId: string;
    engine: string;
    path: string;
    characterCount: number;
    durationMs: number;
    statusCode: number;
  }): Promise<void>;

  /**
   * Get usage records within a time range
   */
  getUsage(since?: Date, until?: Date): Promise<Array<{
    timestamp: Date;
    keyId: string;
    engine: string;
    path: string;
    characterCount: number;
    durationMs: number;
    statusCode: number;
  }>>;

  /**
   * Clear old usage records
   */
  clearOldRecords(olderThan: Date): Promise<number>;

  /**
   * Get aggregated statistics
   */
  getStats(since?: Date): Promise<{
    totalRequests: number;
    totalCharacters: number;
    byKey: Record<string, number>;
    byEngine: Record<string, number>;
    byPath: Record<string, number>;
  }>;
}
