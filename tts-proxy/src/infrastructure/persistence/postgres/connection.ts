/**
 * PostgreSQL Connection Manager
 * Handles database connection and schema initialization
 */

import pg from 'pg';
import { getEnv } from '../../../config/env.js';

const { Pool } = pg;

export interface DatabaseConfig {
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  ssl?: boolean | { rejectUnauthorized: boolean };
  maxConnections?: number;
  idleTimeoutMs?: number;
  connectionTimeoutMs?: number;
}

let pool: pg.Pool | null = null;

/**
 * Get or create the database connection pool
 */
export function getPool(config?: DatabaseConfig): pg.Pool {
  if (pool) return pool;

  const env = getEnv();
  const connectionString = config?.connectionString ?? env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL is not configured');
  }

  // Parse connection string to check for SSL
  const isDigitalOcean = connectionString.includes('db.ondigitalocean.com');

  pool = new Pool({
    connectionString,
    ssl: isDigitalOcean ? { rejectUnauthorized: false } : undefined,
    max: config?.maxConnections ?? 10,
    idleTimeoutMillis: config?.idleTimeoutMs ?? 30000,
    connectionTimeoutMillis: config?.connectionTimeoutMs ?? 10000,
  });

  // Handle pool errors
  pool.on('error', (err) => {
    console.error('Unexpected database pool error:', err);
  });

  return pool;
}

/**
 * Check if database is available
 */
export async function isDatabaseAvailable(): Promise<boolean> {
  try {
    const env = getEnv();
    if (!env.DATABASE_URL) return false;

    const p = getPool();
    const client = await p.connect();
    await client.query('SELECT 1');
    client.release();
    return true;
  } catch {
    return false;
  }
}

/**
 * Initialize database schema
 */
export async function initializeSchema(): Promise<void> {
  const p = getPool();

  // Create api_keys table
  await p.query(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id VARCHAR(64) PRIMARY KEY,
      key_hash VARCHAR(64) NOT NULL UNIQUE,
      key_suffix VARCHAR(8) NOT NULL,
      name VARCHAR(100) NOT NULL,
      is_admin BOOLEAN NOT NULL DEFAULT FALSE,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      rate_limit INTEGER NOT NULL DEFAULT 100,
      expires_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      last_used TIMESTAMP WITH TIME ZONE,
      request_count INTEGER NOT NULL DEFAULT 0,
      engine_config JSONB
    )
  `);

  // Create index on key_hash for fast lookups
  await p.query(`
    CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash)
  `);

  // Create index on active for filtering
  await p.query(`
    CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(active)
  `);
}

/**
 * Run migrations to update schema
 */
export async function runMigrations(): Promise<void> {
  const p = getPool();

  // Check if engine_config column exists, add if not
  const result = await p.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'api_keys' AND column_name = 'engine_config'
  `);

  if (result.rows.length === 0) {
    await p.query(`
      ALTER TABLE api_keys ADD COLUMN engine_config JSONB
    `);
  }
}

/**
 * Close the database connection pool
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * Execute a query with automatic connection handling
 */
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  const p = getPool();
  return p.query<T>(text, params);
}

/**
 * Execute multiple queries in a transaction
 */
export async function transaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const p = getPool();
  const client = await p.connect();

  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
