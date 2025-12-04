const { Pool } = require('pg');
const logger = require('./logger');

class Database {
    constructor() {
        this.pool = null;
        this.isConnected = false;
    }

    async connect() {
        try {
            // Use DATABASE_URL from environment (DigitalOcean provides this)
            const connectionString = process.env.DATABASE_URL;
            
            if (!connectionString) {
                logger.warn('No DATABASE_URL provided, using file-based storage');
                return false;
            }

            // DigitalOcean managed databases use self-signed certificates
            // Always use SSL in production but don't reject self-signed certs
            const sslConfig = process.env.NODE_ENV === 'production'
                ? { rejectUnauthorized: false }
                : false;

            this.pool = new Pool({
                connectionString: connectionString,
                ssl: sslConfig
            });

            logger.info('Connecting to database...');

            // Test the connection
            const client = await this.pool.connect();
            await client.query('SELECT NOW()');
            client.release();

            this.isConnected = true;
            logger.info('Database connected successfully');
            
            // Initialize schema
            await this.initializeSchema();
            
            return true;
        } catch (error) {
            logger.error('Database connection failed:', error);
            this.isConnected = false;
            return false;
        }
    }

    async initializeSchema() {
        const client = await this.pool.connect();
        
        try {
            await client.query('BEGIN');

            // Create api_keys table
            await client.query(`
                CREATE TABLE IF NOT EXISTS api_keys (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    key_hash VARCHAR(255) UNIQUE NOT NULL,
                    name VARCHAR(255) NOT NULL,
                    is_admin BOOLEAN DEFAULT FALSE,
                    active BOOLEAN DEFAULT TRUE,
                    rate_limit_requests INTEGER DEFAULT 100,
                    rate_limit_window_ms INTEGER DEFAULT 60000,
                    expires_at TIMESTAMP WITH TIME ZONE,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    last_used TIMESTAMP WITH TIME ZONE,
                    request_count INTEGER DEFAULT 0
                )
            `);

            // Create usage_logs table
            await client.query(`
                CREATE TABLE IF NOT EXISTS usage_logs (
                    id SERIAL PRIMARY KEY,
                    key_id UUID REFERENCES api_keys(id) ON DELETE CASCADE,
                    method VARCHAR(10) NOT NULL,
                    path VARCHAR(500) NOT NULL,
                    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    response_time INTEGER,
                    ip_address INET,
                    user_agent TEXT
                )
            `);

            // Create indexes for better performance
            await client.query(`
                CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash)
            `);
            
            await client.query(`
                CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(active)
            `);
            
            await client.query(`
                CREATE INDEX IF NOT EXISTS idx_usage_logs_key_id ON usage_logs(key_id)
            `);
            
            await client.query(`
                CREATE INDEX IF NOT EXISTS idx_usage_logs_timestamp ON usage_logs(timestamp)
            `);

            // Create configuration table for app settings
            await client.query(`
                CREATE TABLE IF NOT EXISTS app_config (
                    key VARCHAR(255) PRIMARY KEY,
                    value JSONB NOT NULL,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                )
            `);

            await client.query('COMMIT');
            logger.info('Database schema initialized successfully');
            
        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Error initializing database schema:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    async query(text, params) {
        if (!this.isConnected) {
            throw new Error('Database not connected');
        }
        
        const start = Date.now();
        try {
            const result = await this.pool.query(text, params);
            const duration = Date.now() - start;
            
            logger.debug('Database query executed', {
                query: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
                duration: `${duration}ms`,
                rows: result.rowCount
            });
            
            return result;
        } catch (error) {
            logger.error('Database query error:', {
                query: text,
                params: params,
                error: error.message
            });
            throw error;
        }
    }

    async getClient() {
        if (!this.isConnected) {
            throw new Error('Database not connected');
        }
        return await this.pool.connect();
    }

    async close() {
        if (this.pool) {
            await this.pool.end();
            this.isConnected = false;
            logger.info('Database connection closed');
        }
    }

    // Utility methods for common operations
    async createApiKey(keyData) {
        const result = await this.query(`
            INSERT INTO api_keys (key_hash, name, is_admin, active, rate_limit_requests, rate_limit_window_ms, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [
            keyData.keyHash,
            keyData.name,
            keyData.isAdmin,
            keyData.active,
            keyData.rateLimitRequests,
            keyData.rateLimitWindowMs,
            keyData.expiresAt
        ]);
        
        return result.rows[0];
    }

    async getApiKeyByHash(keyHash) {
        const result = await this.query(
            'SELECT * FROM api_keys WHERE key_hash = $1 AND active = true',
            [keyHash]
        );
        
        return result.rows[0] || null;
    }

    async listApiKeys() {
        const result = await this.query(
            'SELECT id, name, is_admin, active, created_at, last_used, request_count, expires_at FROM api_keys ORDER BY created_at DESC'
        );
        
        return result.rows;
    }

    async updateApiKey(keyId, updates) {
        const setClause = [];
        const values = [];
        let paramIndex = 1;

        for (const [key, value] of Object.entries(updates)) {
            setClause.push(`${key} = $${paramIndex}`);
            values.push(value);
            paramIndex++;
        }

        values.push(keyId);
        
        const result = await this.query(`
            UPDATE api_keys 
            SET ${setClause.join(', ')}, updated_at = NOW()
            WHERE id = $${paramIndex}
            RETURNING *
        `, values);
        
        return result.rows[0] || null;
    }

    async deleteApiKey(keyId) {
        const result = await this.query(
            'DELETE FROM api_keys WHERE id = $1 RETURNING *',
            [keyId]
        );
        
        return result.rows[0] || null;
    }

    async logUsage(keyId, method, path, responseTime = null, ipAddress = null, userAgent = null) {
        await this.query(`
            INSERT INTO usage_logs (key_id, method, path, response_time, ip_address, user_agent)
            VALUES ($1, $2, $3, $4, $5, $6)
        `, [keyId, method, path, responseTime, ipAddress, userAgent]);

        // Update request count
        await this.query(
            'UPDATE api_keys SET request_count = request_count + 1, last_used = NOW() WHERE id = $1',
            [keyId]
        );
    }

    async getUsageStats(keyId = null, days = 7) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        let whereClause = 'WHERE timestamp > $1';
        let params = [cutoffDate];

        if (keyId) {
            whereClause += ' AND key_id = $2';
            params.push(keyId);
        }

        // Get total requests
        const totalResult = await this.query(`
            SELECT COUNT(*) as total_requests FROM usage_logs ${whereClause}
        `, params);

        // Get requests by day
        const dailyResult = await this.query(`
            SELECT DATE(timestamp) as day, COUNT(*) as requests
            FROM usage_logs ${whereClause}
            GROUP BY DATE(timestamp)
            ORDER BY day
        `, params);

        // Get requests by path
        const pathResult = await this.query(`
            SELECT path, COUNT(*) as requests
            FROM usage_logs ${whereClause}
            GROUP BY path
            ORDER BY requests DESC
            LIMIT 10
        `, params);

        return {
            totalRequests: parseInt(totalResult.rows[0].total_requests),
            requestsByDay: dailyResult.rows.reduce((acc, row) => {
                acc[row.day] = parseInt(row.requests);
                return acc;
            }, {}),
            requestsByPath: pathResult.rows.reduce((acc, row) => {
                acc[row.path] = parseInt(row.requests);
                return acc;
            }, {})
        };
    }

    async cleanupOldLogs(days = 30) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        const result = await this.query(
            'DELETE FROM usage_logs WHERE timestamp < $1',
            [cutoffDate]
        );

        logger.info(`Cleaned up ${result.rowCount} old usage log entries`);
        return result.rowCount;
    }
}

// Singleton instance
const database = new Database();

module.exports = database;
