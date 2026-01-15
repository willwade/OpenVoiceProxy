/**
 * API Key Domain Entity
 * Represents an API key with its associated data and business rules
 */

import { createHash, randomBytes } from 'crypto';
import type { ApiKeyData, EngineKeyConfig, ApiKeyWithPlainKey } from '../../types/api-key.types.js';

export interface ApiKeyProps {
  id: string;
  name: string;
  keyHash: string;
  keySuffix: string;
  isAdmin: boolean;
  active: boolean;
  rateLimit: number;
  expiresAt: Date | null;
  lastUsed: Date | null;
  requestCount: number;
  engineConfig: Record<string, EngineKeyConfig> | null;
  createdAt: Date;
  updatedAt?: Date;
}

export class ApiKey {
  private readonly props: ApiKeyProps;

  private constructor(props: ApiKeyProps) {
    this.props = props;
  }

  // Getters
  get id(): string {
    return this.props.id;
  }
  get name(): string {
    return this.props.name;
  }
  get keyHash(): string {
    return this.props.keyHash;
  }
  get keySuffix(): string {
    return this.props.keySuffix;
  }
  get isAdmin(): boolean {
    return this.props.isAdmin;
  }
  get active(): boolean {
    return this.props.active;
  }
  get rateLimit(): number {
    return this.props.rateLimit;
  }
  get expiresAt(): Date | null {
    return this.props.expiresAt;
  }
  get lastUsed(): Date | null {
    return this.props.lastUsed;
  }
  get requestCount(): number {
    return this.props.requestCount;
  }
  get engineConfig(): Record<string, EngineKeyConfig> | null {
    return this.props.engineConfig;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date | undefined {
    return this.props.updatedAt;
  }

  // Business logic methods
  isExpired(): boolean {
    if (!this.props.expiresAt) return false;
    return new Date() > this.props.expiresAt;
  }

  isValid(): boolean {
    return this.props.active && !this.isExpired();
  }

  canAccessEngine(engineId: string): boolean {
    // Admins can access all engines
    if (this.props.isAdmin) return true;

    // If no engine config, allow all by default
    if (!this.props.engineConfig) return true;

    const config = this.props.engineConfig[engineId];
    // If engine not in config, allow by default
    if (!config) return true;

    return config.enabled;
  }

  getEngineCredentials(engineId: string): Record<string, string> | undefined {
    if (!this.props.engineConfig) return undefined;

    const config = this.props.engineConfig[engineId];
    if (!config?.useCustomCredentials || !config.credentials) {
      return undefined;
    }

    return config.credentials;
  }

  // Factory methods
  static create(params: {
    name: string;
    isAdmin?: boolean;
    rateLimit?: number;
    expiresAt?: Date | null;
    engineConfig?: Record<string, EngineKeyConfig> | null;
  }): { apiKey: ApiKey; plainKey: string } {
    const plainKey = ApiKey.generateKey();
    const keyHash = ApiKey.hashKey(plainKey);
    const keySuffix = plainKey.slice(-8);

    const apiKey = new ApiKey({
      id: randomBytes(16).toString('hex'),
      name: params.name,
      keyHash,
      keySuffix,
      isAdmin: params.isAdmin ?? false,
      active: true,
      rateLimit: params.rateLimit ?? 100,
      expiresAt: params.expiresAt ?? null,
      lastUsed: null,
      requestCount: 0,
      engineConfig: params.engineConfig ?? null,
      createdAt: new Date(),
    });

    return { apiKey, plainKey };
  }

  static fromData(data: ApiKeyData & { createdAt: Date; updatedAt?: Date }): ApiKey {
    return new ApiKey({
      id: data.id,
      name: data.name,
      keyHash: data.keyHash,
      keySuffix: data.keySuffix,
      isAdmin: data.isAdmin,
      active: data.active,
      rateLimit: data.rateLimit,
      expiresAt: data.expiresAt,
      lastUsed: data.lastUsed,
      requestCount: data.requestCount,
      engineConfig: data.engineConfig,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    });
  }

  // Mutation methods (return new instance)
  withUpdatedName(name: string): ApiKey {
    return new ApiKey({ ...this.props, name, updatedAt: new Date() });
  }

  withUpdatedActive(active: boolean): ApiKey {
    return new ApiKey({ ...this.props, active, updatedAt: new Date() });
  }

  withUpdatedRateLimit(rateLimit: number): ApiKey {
    return new ApiKey({ ...this.props, rateLimit, updatedAt: new Date() });
  }

  withUpdatedExpiresAt(expiresAt: Date | null): ApiKey {
    return new ApiKey({ ...this.props, expiresAt, updatedAt: new Date() });
  }

  withUpdatedEngineConfig(engineConfig: Record<string, EngineKeyConfig> | null): ApiKey {
    return new ApiKey({ ...this.props, engineConfig, updatedAt: new Date() });
  }

  withIncrementedRequestCount(): ApiKey {
    return new ApiKey({
      ...this.props,
      requestCount: this.props.requestCount + 1,
      lastUsed: new Date(),
    });
  }

  // Static utility methods
  static generateKey(): string {
    // Generate a 32-byte (256-bit) random key, base64url encoded
    const bytes = randomBytes(32);
    return bytes.toString('base64url');
  }

  static hashKey(plainKey: string): string {
    return createHash('sha256').update(plainKey).digest('hex');
  }

  static verifyKey(plainKey: string, keyHash: string): boolean {
    const hash = ApiKey.hashKey(plainKey);
    return hash === keyHash;
  }

  // Serialization
  toData(): ApiKeyData & { createdAt: Date; updatedAt?: Date } {
    return {
      id: this.props.id,
      name: this.props.name,
      keyHash: this.props.keyHash,
      keySuffix: this.props.keySuffix,
      isAdmin: this.props.isAdmin,
      active: this.props.active,
      rateLimit: this.props.rateLimit,
      expiresAt: this.props.expiresAt,
      lastUsed: this.props.lastUsed,
      requestCount: this.props.requestCount,
      engineConfig: this.props.engineConfig,
      createdAt: this.props.createdAt,
      updatedAt: this.props.updatedAt,
    };
  }

  toJSON() {
    return {
      id: this.props.id,
      name: this.props.name,
      keySuffix: this.props.keySuffix,
      isAdmin: this.props.isAdmin,
      active: this.props.active,
      rateLimit: this.props.rateLimit,
      expiresAt: this.props.expiresAt?.toISOString() ?? null,
      lastUsed: this.props.lastUsed?.toISOString() ?? null,
      requestCount: this.props.requestCount,
      createdAt: this.props.createdAt.toISOString(),
    };
  }
}
