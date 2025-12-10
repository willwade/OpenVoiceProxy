const crypto = require('crypto');
const database = require('./database');
const KeyManager = require('./key-manager'); // Fallback to file-based storage
const logger = require('./logger');

class DatabaseKeyManager {
    constructor() {
        this.useDatabase = false;
        this.fileKeyManager = null;
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) {
            return;
        }

        try {
            // Try to connect to database
            this.useDatabase = await database.connect();
            
            if (!this.useDatabase) {
                logger.info('Using file-based key storage as fallback');
                this.fileKeyManager = new KeyManager();
            } else {
                logger.info('Using database for key storage');
            }
            
            this.initialized = true;
        } catch (error) {
            logger.error('Error initializing key manager:', error);
            this.useDatabase = false;
            this.fileKeyManager = new KeyManager();
            this.initialized = true;
        }
    }

    /**
     * Generate a new API key
     */
    generateApiKey() {
        return 'tts_' + crypto.randomBytes(32).toString('hex');
    }

    /**
     * Hash an API key for storage
     */
    hashApiKey(apiKey) {
        return crypto.createHash('sha256').update(apiKey).digest('hex');
    }

    /**
     * Create a new API key
     */
    async createKey(options = {}) {
        await this.initialize();

        const {
            name = 'Unnamed Key',
            isAdmin = false,
            active = true,
            rateLimit = { requests: 100, windowMs: 60000 },
            expiresAt = null
        } = options;

        const apiKey = this.generateApiKey();
        const keySuffix = apiKey.slice(-8); // Store last 8 characters for identification

        if (this.useDatabase) {
            try {
                const keyData = await database.createApiKey({
                    keyHash: this.hashApiKey(apiKey),
                    keySuffix,
                    name,
                    isAdmin,
                    active,
                    rateLimitRequests: rateLimit.requests,
                    rateLimitWindowMs: rateLimit.windowMs,
                    expiresAt
                });

                logger.info(`Created new API key in database: ${name} (Admin: ${isAdmin})`);
                
                return {
                    id: keyData.id,
                    key: apiKey, // Only return the actual key on creation
                    name: keyData.name,
                    isAdmin: keyData.is_admin,
                    active: keyData.active,
                    createdAt: keyData.created_at,
                    lastUsed: keyData.last_used,
                    requestCount: keyData.request_count,
                    expiresAt: keyData.expires_at,
                    rateLimit: {
                        requests: keyData.rate_limit_requests,
                        windowMs: keyData.rate_limit_window_ms
                    }
                };
            } catch (error) {
                logger.error('Error creating API key in database:', error);
                throw error;
            }
        } else {
            return await this.fileKeyManager.createKey(options);
        }
    }

    /**
     * Validate an API key
     */
    async validateKey(apiKey) {
        await this.initialize();

        // Check for master admin key from environment variable first
        // This allows bootstrap access even before database keys are created
        const envAdminKey = process.env.ADMIN_API_KEY;
        if (envAdminKey && apiKey === envAdminKey) {
            logger.debug('Authenticated with environment ADMIN_API_KEY');
            return {
                id: 'env-admin',
                name: 'Environment Admin Key',
                isAdmin: true,
                active: true,
                createdAt: new Date().toISOString(),
                lastUsed: null,
                requestCount: 0
            };
        }

        if (this.useDatabase) {
            try {
                const keyHash = this.hashApiKey(apiKey);
                const keyData = await database.getApiKeyByHash(keyHash);
                
                if (!keyData) {
                    return null;
                }

                // Check if key is expired
                if (keyData.expires_at && new Date() > new Date(keyData.expires_at)) {
                    logger.warn(`API key expired: ${keyData.name}`);
                    return null;
                }

                return {
                    id: keyData.id,
                    name: keyData.name,
                    isAdmin: keyData.is_admin,
                    active: keyData.active,
                    createdAt: keyData.created_at,
                    lastUsed: keyData.last_used,
                    requestCount: keyData.request_count,
                    expiresAt: keyData.expires_at,
                    rateLimit: {
                        requests: keyData.rate_limit_requests,
                        windowMs: keyData.rate_limit_window_ms
                    }
                };
            } catch (error) {
                logger.error('Error validating API key:', error);
                return null;
            }
        } else {
            return await this.fileKeyManager.validateKey(apiKey);
        }
    }

    /**
     * List all API keys (without the actual key values)
     */
    async listKeys() {
        await this.initialize();

        if (this.useDatabase) {
            try {
                const keys = await database.listApiKeys();
                return keys.map(key => ({
                    id: key.id,
                    keySuffix: key.key_suffix,
                    name: key.name,
                    isAdmin: key.is_admin,
                    active: key.active,
                    createdAt: key.created_at,
                    lastUsed: key.last_used,
                    requestCount: key.request_count,
                    expiresAt: key.expires_at
                }));
            } catch (error) {
                logger.error('Error listing API keys:', error);
                return [];
            }
        } else {
            return this.fileKeyManager.listKeys();
        }
    }

    /**
     * Export keys (only supported in file-based mode)
     */
    async exportKeys() {
        await this.initialize();
        if (this.useDatabase) {
            throw new Error('Export not supported when using database-backed keys');
        }
        return this.fileKeyManager.exportKeys();
    }

    /**
     * Import keys (only supported in file-based mode)
     */
    async importKeys(importedKeys) {
        await this.initialize();
        if (this.useDatabase) {
            throw new Error('Import not supported when using database-backed keys');
        }
        return this.fileKeyManager.importKeys(importedKeys);
    }

    /**
     * Update an API key
     */
    async updateKey(keyId, updates) {
        await this.initialize();

        if (this.useDatabase) {
            try {
                // Convert camelCase to snake_case for database
                const dbUpdates = {};
                const fieldMap = {
                    name: 'name',
                    active: 'active',
                    isAdmin: 'is_admin',
                    expiresAt: 'expires_at'
                };

                for (const [key, value] of Object.entries(updates)) {
                    if (fieldMap[key]) {
                        dbUpdates[fieldMap[key]] = value;
                    }
                    if (key === 'rateLimit' && value) {
                        dbUpdates.rate_limit_requests = value.requests;
                        dbUpdates.rate_limit_window_ms = value.windowMs;
                    }
                }

                const updatedKey = await database.updateApiKey(keyId, dbUpdates);
                
                if (!updatedKey) {
                    throw new Error('API key not found');
                }

                logger.info(`Updated API key: ${updatedKey.name}`);
                
                return {
                    id: updatedKey.id,
                    name: updatedKey.name,
                    isAdmin: updatedKey.is_admin,
                    active: updatedKey.active,
                    createdAt: updatedKey.created_at,
                    lastUsed: updatedKey.last_used,
                    requestCount: updatedKey.request_count,
                    expiresAt: updatedKey.expires_at
                };
            } catch (error) {
                logger.error('Error updating API key:', error);
                throw error;
            }
        } else {
            return await this.fileKeyManager.updateKey(keyId, updates);
        }
    }

    /**
     * Delete an API key
     */
    async deleteKey(keyId) {
        await this.initialize();

        if (this.useDatabase) {
            try {
                const deletedKey = await database.deleteApiKey(keyId);

                if (!deletedKey) {
                    throw new Error('API key not found');
                }

                logger.info(`Deleted API key: ${deletedKey.name}`);
                return true;
            } catch (error) {
                logger.error('Error deleting API key:', error);
                throw error;
            }
        } else {
            return await this.fileKeyManager.deleteKey(keyId);
        }
    }

    /**
     * Get engine configuration for an API key
     */
    async getEngineConfig(keyId) {
        await this.initialize();

        if (this.useDatabase) {
            try {
                const config = await database.getEngineConfig(keyId);
                if (!config) {
                    throw new Error('API key not found');
                }
                return config;
            } catch (error) {
                logger.error('Error getting engine config:', error);
                throw error;
            }
        } else {
            // File-based storage doesn't support engine config
            return { engineConfig: {}, allowedVoices: null };
        }
    }

    /**
     * Update engine configuration for an API key
     */
    async updateEngineConfig(keyId, engineConfig, allowedVoices = null) {
        await this.initialize();

        if (this.useDatabase) {
            try {
                const result = await database.updateEngineConfig(keyId, engineConfig, allowedVoices);
                if (!result) {
                    throw new Error('API key not found');
                }
                logger.info(`Updated engine config for key: ${keyId}`);
                return {
                    engineConfig: result.engine_config,
                    allowedVoices: result.allowed_voices
                };
            } catch (error) {
                logger.error('Error updating engine config:', error);
                throw error;
            }
        } else {
            // File-based storage doesn't support engine config
            throw new Error('Engine configuration requires database storage');
        }
    }

    /**
     * Export custom credentials for a key (only custom creds, not system defaults)
     */
    async exportEngineConfig(keyId) {
        await this.initialize();
        if (!this.useDatabase) {
            throw new Error('Engine credential export requires database storage');
        }
        const full = await database.getEngineConfig(keyId);
        if (!full || !full.engineConfig) {
            return {};
        }
        const exported = {};
        for (const [engineId, cfg] of Object.entries(full.engineConfig)) {
            if (cfg && cfg.useCustomCredentials && cfg.credentials && Object.keys(cfg.credentials).length) {
                exported[engineId] = {
                    useCustomCredentials: true,
                    credentials: cfg.credentials
                };
            }
        }
        return exported;
    }

    /**
     * Import custom credentials for a key
     */
    async importEngineConfig(keyId, importConfig) {
        await this.initialize();
        if (!this.useDatabase) {
            throw new Error('Engine credential import requires database storage');
        }
        const full = await database.getEngineConfig(keyId);
        if (!full) {
            throw new Error('API key not found');
        }
        const engineConfig = full.engineConfig || {};
        for (const [engineId, cfg] of Object.entries(importConfig || {})) {
            if (cfg && cfg.credentials && Object.keys(cfg.credentials).length) {
                engineConfig[engineId] = {
                    ...(engineConfig[engineId] || {}),
                    enabled: engineConfig[engineId]?.enabled ?? true,
                    useCustomCredentials: true,
                    credentials: cfg.credentials
                };
            }
        }
        const result = await database.updateEngineConfig(keyId, engineConfig, full.allowedVoices || null);
        return {
            engineConfig: result.engine_config,
            allowedVoices: result.allowed_voices
        };
    }

    /**
     * Get full key details including engine config (for TTS request handling)
     */
    async getKeyDetails(keyId) {
        await this.initialize();

        if (this.useDatabase) {
            try {
                const key = await database.getApiKeyById(keyId);
                if (!key) {
                    return null;
                }
                return {
                    id: key.id,
                    name: key.name,
                    isAdmin: key.is_admin,
                    active: key.active,
                    engineConfig: key.engine_config || {},
                    allowedVoices: key.allowed_voices || null
                };
            } catch (error) {
                logger.error('Error getting key details:', error);
                return null;
            }
        } else {
            return null;
        }
    }

    /**
     * Log API request
     */
    async logRequest(keyId, method, path, responseTime = null, ipAddress = null, userAgent = null) {
        await this.initialize();

        // Skip logging for the environment admin key (not a valid UUID)
        if (keyId === 'env-admin') {
            logger.debug('Skipping usage logging for environment admin key');
            return;
        }

        if (this.useDatabase) {
            try {
                await database.logUsage(keyId, method, path, responseTime, ipAddress, userAgent);
            } catch (error) {
                logger.error('Error logging request:', error);
            }
        } else {
            await this.fileKeyManager.logRequest(keyId, method, path, responseTime);
        }
    }

    /**
     * Get usage statistics
     */
    async getUsageStats(keyId = null, days = 7) {
        await this.initialize();

        if (this.useDatabase) {
            try {
                return await database.getUsageStats(keyId, days);
            } catch (error) {
                logger.error('Error getting usage stats:', error);
                return {
                    totalRequests: 0,
                    requestsByDay: {},
                    requestsByPath: {}
                };
            }
        } else {
            return this.fileKeyManager.getUsageStats(keyId, days);
        }
    }

    /**
     * Cleanup old usage logs
     */
    async cleanupUsageLogs() {
        await this.initialize();

        if (this.useDatabase) {
            try {
                await database.cleanupOldLogs(30);
            } catch (error) {
                logger.error('Error cleaning up usage logs:', error);
            }
        } else {
            this.fileKeyManager.cleanupUsageLogs();
        }
    }

    /**
     * Get system credentials (masked for display)
     */
    async getSystemCredentials() {
        await this.initialize();

        if (this.useDatabase) {
            try {
                return await database.getSystemCredentials();
            } catch (error) {
                logger.error('Error getting system credentials from database:', error);
                // Fall back to file-based
                if (this.fileKeyManager) {
                    return await this.fileKeyManager.getSystemCredentials();
                }
                return {};
            }
        } else {
            return await this.fileKeyManager.getSystemCredentials();
        }
    }

    /**
     * Set system credentials for an engine
     */
    async setSystemCredentials(engineId, credentials) {
        await this.initialize();

        if (this.useDatabase) {
            try {
                await database.setSystemCredentials(engineId, credentials);
            } catch (error) {
                logger.error('Error setting system credentials in database:', error);
                // Fall back to file-based
                if (this.fileKeyManager) {
                    await this.fileKeyManager.setSystemCredentials(engineId, credentials);
                }
            }
        } else {
            await this.fileKeyManager.setSystemCredentials(engineId, credentials);
        }
    }

    /**
     * Get raw (unmasked) system credentials for an engine
     */
    async getRawSystemCredentials(engineId) {
        await this.initialize();

        if (this.useDatabase) {
            try {
                return await database.getRawSystemCredentials(engineId);
            } catch (error) {
                logger.error('Error getting raw system credentials from database:', error);
                // Fall back to file-based
                if (this.fileKeyManager) {
                    return await this.fileKeyManager.getRawSystemCredentials(engineId);
                }
                return null;
            }
        } else {
            return await this.fileKeyManager.getRawSystemCredentials(engineId);
        }
    }
}

module.exports = DatabaseKeyManager;
