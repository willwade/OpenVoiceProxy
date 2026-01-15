/**
 * Key Repository Port
 * Interface for API key persistence operations
 */

import type { ApiKey } from '../../domain/entities/api-key.js';

export interface KeyRepositoryPort {
  /**
   * Find an API key by its ID
   */
  findById(id: string): Promise<ApiKey | null>;

  /**
   * Find an API key by its plain key (hashes and compares)
   */
  findByKey(plainKey: string): Promise<ApiKey | null>;

  /**
   * Find all API keys
   */
  findAll(): Promise<ApiKey[]>;

  /**
   * Find all active API keys
   */
  findAllActive(): Promise<ApiKey[]>;

  /**
   * Save an API key (create or update)
   */
  save(apiKey: ApiKey): Promise<void>;

  /**
   * Delete an API key by ID
   */
  delete(id: string): Promise<boolean>;

  /**
   * Check if an API key exists by ID
   */
  exists(id: string): Promise<boolean>;

  /**
   * Increment request count and update last used
   */
  incrementUsage(id: string): Promise<void>;

  /**
   * Check if repository is available (e.g., database connected)
   */
  isAvailable(): Promise<boolean>;
}
