/**
 * API Key Domain Service
 * Business logic for API key management
 */

import { ApiKey } from '../entities/api-key.js';
import type { EngineKeyConfig } from '../../types/api-key.types.js';

export interface CreateApiKeyInput {
  name: string;
  isAdmin?: boolean;
  rateLimit?: number;
  expiresAt?: Date;
  engineConfig?: Record<string, EngineKeyConfig>;
}

export interface UpdateApiKeyInput {
  name?: string;
  isAdmin?: boolean;
  active?: boolean;
  rateLimit?: number;
  expiresAt?: Date | null;
  engineConfig?: Record<string, EngineKeyConfig>;
}

export interface ApiKeyValidationResult {
  valid: boolean;
  key?: ApiKey;
  reason?: 'not_found' | 'inactive' | 'expired' | 'rate_limited';
}

import {
  ApiKeyNotFoundError,
  ApiKeyInactiveError,
  ApiKeyExpiredError,
  ValidationError,
} from '../errors/domain-errors.js';

export interface KeyServiceDependencies {
  // Will be injected from application layer
}

export class KeyService {
  /**
   * Create a new API key
   */
  createKey(input: CreateApiKeyInput): { apiKey: ApiKey; plainKey: string } {
    // Validate input
    this.validateCreateInput(input);

    // Create the key
    return ApiKey.create({
      name: input.name,
      isAdmin: input.isAdmin,
      rateLimit: input.rateLimit,
      expiresAt: input.expiresAt,
      engineConfig: input.engineConfig,
    });
  }

  /**
   * Update an existing API key
   */
  updateKey(apiKey: ApiKey, input: UpdateApiKeyInput): ApiKey {
    let updated = apiKey;

    if (input.name !== undefined) {
      this.validateName(input.name);
      updated = updated.withUpdatedName(input.name);
    }

    if (input.active !== undefined) {
      updated = updated.withUpdatedActive(input.active);
    }

    if (input.rateLimit !== undefined) {
      this.validateRateLimit(input.rateLimit);
      updated = updated.withUpdatedRateLimit(input.rateLimit);
    }

    if (input.expiresAt !== undefined) {
      updated = updated.withUpdatedExpiresAt(input.expiresAt);
    }

    if (input.engineConfig !== undefined) {
      updated = updated.withUpdatedEngineConfig(input.engineConfig);
    }

    return updated;
  }

  /**
   * Validate an API key for authentication
   */
  validateKey(apiKey: ApiKey | null | undefined): ApiKeyValidationResult {
    if (!apiKey) {
      return { valid: false, reason: 'not_found' };
    }

    if (!apiKey.active) {
      return { valid: false, key: apiKey, reason: 'inactive' };
    }

    if (apiKey.isExpired()) {
      return { valid: false, key: apiKey, reason: 'expired' };
    }

    return { valid: true, key: apiKey };
  }

  /**
   * Validate and throw if invalid
   */
  validateKeyOrThrow(apiKey: ApiKey | null | undefined): ApiKey {
    const result = this.validateKey(apiKey);

    if (!result.valid) {
      switch (result.reason) {
        case 'not_found':
          throw new ApiKeyNotFoundError();
        case 'inactive':
          throw new ApiKeyInactiveError();
        case 'expired':
          throw new ApiKeyExpiredError();
        default:
          throw new ApiKeyNotFoundError();
      }
    }

    return result.key!;
  }

  /**
   * Check if key has admin privileges
   */
  isAdmin(apiKey: ApiKey | null | undefined): boolean {
    return apiKey?.isAdmin ?? false;
  }

  /**
   * Check if key can access a specific engine
   */
  canAccessEngine(apiKey: ApiKey | null | undefined, engineId: string): boolean {
    if (!apiKey) return false;
    return apiKey.canAccessEngine(engineId);
  }

  /**
   * Get engine credentials for a key (custom or system)
   */
  getEngineCredentials(
    apiKey: ApiKey | null | undefined,
    engineId: string
  ): Record<string, string> | undefined {
    if (!apiKey) return undefined;
    return apiKey.getEngineCredentials(engineId);
  }

  // Validation helpers
  private validateCreateInput(input: CreateApiKeyInput): void {
    this.validateName(input.name);

    if (input.rateLimit !== undefined) {
      this.validateRateLimit(input.rateLimit);
    }
  }

  private validateName(name: string): void {
    if (!name || name.trim().length === 0) {
      throw new ValidationError('Name is required', 'name');
    }

    if (name.length > 100) {
      throw new ValidationError('Name must be 100 characters or less', 'name');
    }
  }

  private validateRateLimit(rateLimit: number): void {
    if (rateLimit < 1) {
      throw new ValidationError('Rate limit must be at least 1', 'rateLimit');
    }

    if (rateLimit > 10000) {
      throw new ValidationError('Rate limit cannot exceed 10000', 'rateLimit');
    }
  }
}

// Singleton instance
let keyServiceInstance: KeyService | null = null;

export function getKeyService(): KeyService {
  if (!keyServiceInstance) {
    keyServiceInstance = new KeyService();
  }
  return keyServiceInstance;
}
