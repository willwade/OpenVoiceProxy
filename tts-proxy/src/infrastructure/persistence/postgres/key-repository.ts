/**
 * PostgreSQL API Key Repository
 * Implements KeyRepositoryPort for PostgreSQL storage
 */

import type { KeyRepositoryPort } from '../../../application/ports/key-repository-port.js';
import { ApiKey } from '../../../domain/entities/api-key.js';
import { query, isDatabaseAvailable } from './connection.js';

interface ApiKeyRow {
  id: string;
  key_hash: string;
  key_suffix: string;
  name: string;
  is_admin: boolean;
  active: boolean;
  rate_limit: number;
  expires_at: Date | null;
  created_at: Date;
  last_used: Date | null;
  request_count: number;
  engine_config: Record<string, unknown> | null;
}

function rowToApiKey(row: ApiKeyRow): ApiKey {
  return ApiKey.fromData({
    id: row.id,
    name: row.name,
    keyHash: row.key_hash,
    keySuffix: row.key_suffix,
    isAdmin: row.is_admin,
    active: row.active,
    rateLimit: row.rate_limit,
    expiresAt: row.expires_at,
    lastUsed: row.last_used,
    requestCount: row.request_count,
    engineConfig: row.engine_config as ApiKey['engineConfig'],
    createdAt: row.created_at,
  });
}

export class PostgresKeyRepository implements KeyRepositoryPort {
  async findById(id: string): Promise<ApiKey | null> {
    const result = await query<ApiKeyRow>(
      'SELECT * FROM api_keys WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) return null;
    return rowToApiKey(result.rows[0]!);
  }

  async findByKey(plainKey: string): Promise<ApiKey | null> {
    const keyHash = ApiKey.hashKey(plainKey);
    const result = await query<ApiKeyRow>(
      'SELECT * FROM api_keys WHERE key_hash = $1',
      [keyHash]
    );

    if (result.rows.length === 0) return null;
    return rowToApiKey(result.rows[0]!);
  }

  async findAll(): Promise<ApiKey[]> {
    const result = await query<ApiKeyRow>(
      'SELECT * FROM api_keys ORDER BY created_at DESC'
    );
    return result.rows.map(rowToApiKey);
  }

  async findAllActive(): Promise<ApiKey[]> {
    const result = await query<ApiKeyRow>(
      `SELECT * FROM api_keys
       WHERE active = true
       AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY created_at DESC`
    );
    return result.rows.map(rowToApiKey);
  }

  async save(apiKey: ApiKey): Promise<void> {
    const data = apiKey.toData();
    await query(
      `INSERT INTO api_keys (
        id, key_hash, key_suffix, name, is_admin, active,
        rate_limit, expires_at, created_at, last_used,
        request_count, engine_config
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        is_admin = EXCLUDED.is_admin,
        active = EXCLUDED.active,
        rate_limit = EXCLUDED.rate_limit,
        expires_at = EXCLUDED.expires_at,
        last_used = EXCLUDED.last_used,
        request_count = EXCLUDED.request_count,
        engine_config = EXCLUDED.engine_config`,
      [
        data.id,
        data.keyHash,
        data.keySuffix,
        data.name,
        data.isAdmin,
        data.active,
        data.rateLimit,
        data.expiresAt,
        data.createdAt,
        data.lastUsed,
        data.requestCount,
        data.engineConfig ? JSON.stringify(data.engineConfig) : null,
      ]
    );
  }

  async delete(id: string): Promise<boolean> {
    const result = await query(
      'DELETE FROM api_keys WHERE id = $1',
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async exists(id: string): Promise<boolean> {
    const result = await query<{ exists: boolean }>(
      'SELECT EXISTS(SELECT 1 FROM api_keys WHERE id = $1) as exists',
      [id]
    );
    return result.rows[0]?.exists ?? false;
  }

  async incrementUsage(id: string): Promise<void> {
    await query(
      `UPDATE api_keys
       SET request_count = request_count + 1,
           last_used = NOW()
       WHERE id = $1`,
      [id]
    );
  }

  async isAvailable(): Promise<boolean> {
    return isDatabaseAvailable();
  }
}

// Singleton instance
let instance: PostgresKeyRepository | null = null;

export function getPostgresKeyRepository(): PostgresKeyRepository {
  if (!instance) {
    instance = new PostgresKeyRepository();
  }
  return instance;
}
