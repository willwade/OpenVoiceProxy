/**
 * API Key related types
 */

import type { Timestamps, Nullable } from './index.js';

export interface ApiKeyData {
  id: string;
  name: string;
  keyHash: string;
  keySuffix: string;
  isAdmin: boolean;
  active: boolean;
  rateLimit: number;
  expiresAt: Nullable<Date>;
  lastUsed: Nullable<Date>;
  requestCount: number;
  engineConfig: Nullable<Record<string, EngineKeyConfig>>;
}

export interface ApiKey extends ApiKeyData, Timestamps {}

export interface EngineKeyConfig {
  enabled: boolean;
  useCustomCredentials?: boolean;
  credentials?: Record<string, string>;
}

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
  expiresAt?: Nullable<Date>;
  engineConfig?: Record<string, EngineKeyConfig>;
}

export interface ApiKeyWithPlainKey extends ApiKey {
  plainKey: string; // Only available at creation time
}

export interface ApiKeyValidationResult {
  valid: boolean;
  key?: ApiKey;
  reason?: 'not_found' | 'inactive' | 'expired' | 'rate_limited';
}

export interface RateLimitInfo {
  remaining: number;
  limit: number;
  resetAt: Date;
  isLimited: boolean;
}
