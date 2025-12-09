const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const { getDataDir } = require('./data-path');

class KeyManager {
    constructor() {
        const dataDir = getDataDir();
        this.keysFile = path.join(dataDir, 'api-keys.json');
        this.usageFile = path.join(dataDir, 'usage-logs.json');
        this.credentialsFile = path.join(dataDir, 'system-credentials.json');
        this.keys = new Map();
        this.usageLogs = [];
        
        this.ensureDataDirectory();
        this.loadKeys();
        this.loadUsageLogs();
        
        // Cleanup old usage logs periodically
        setInterval(() => this.cleanupUsageLogs(), 60000 * 60); // Every hour
    }

    /**
     * Ensure data directory exists
     */
    ensureDataDirectory() {
        const dataDir = path.dirname(this.keysFile);
        try {
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
                logger.info('Created data directory:', dataDir);
            }
        } catch (e) {
            logger.error('Failed to ensure data directory exists:', e);
            throw e;
        }
    }

    /**
     * Generate a new API key
     */
    generateApiKey() {
        return 'tts_' + crypto.randomBytes(32).toString('hex');
    }

    /**
     * Create a new API key
     */
    async createKey(options = {}) {
        const {
            name = 'Unnamed Key',
            isAdmin = false,
            active = true,
            rateLimit = { requests: 100, windowMs: 60000 },
            expiresAt = null
        } = options;

        const apiKey = this.generateApiKey();
        const keyData = {
            id: crypto.randomUUID(),
            key: apiKey,
            name,
            isAdmin,
            active,
            rateLimit,
            expiresAt,
            createdAt: new Date().toISOString(),
            lastUsed: null,
            requestCount: 0
        };

        this.keys.set(apiKey, keyData);
        await this.saveKeys();
        
        logger.info(`Created new API key: ${name} (Admin: ${isAdmin})`);
        return keyData;
    }

    /**
     * Validate an API key
     */
    async validateKey(apiKey) {
        const keyData = this.keys.get(apiKey);
        if (!keyData) {
            return null;
        }

        // Check if key is expired
        if (keyData.expiresAt && new Date() > new Date(keyData.expiresAt)) {
            logger.warn(`API key expired: ${keyData.name}`);
            return null;
        }

        // Update last used timestamp
        keyData.lastUsed = new Date().toISOString();
        await this.saveKeys();

        return keyData;
    }

    /**
     * List all API keys (without the actual key values)
     */
    listKeys() {
        return Array.from(this.keys.values()).map(key => ({
            id: key.id,
            name: key.name,
            isAdmin: key.isAdmin,
            active: key.active,
            createdAt: key.createdAt,
            lastUsed: key.lastUsed,
            requestCount: key.requestCount,
            expiresAt: key.expiresAt
        }));
    }

    /**
     * Update an API key
     */
    async updateKey(keyId, updates) {
        const keyData = Array.from(this.keys.values()).find(k => k.id === keyId);
        if (!keyData) {
            throw new Error('API key not found');
        }

        // Update allowed fields
        const allowedUpdates = ['name', 'active', 'isAdmin', 'rateLimit', 'expiresAt'];
        for (const field of allowedUpdates) {
            if (updates.hasOwnProperty(field)) {
                keyData[field] = updates[field];
            }
        }

        await this.saveKeys();
        logger.info(`Updated API key: ${keyData.name}`);
        return keyData;
    }

    /**
     * Delete an API key
     */
    async deleteKey(keyId) {
        const keyData = Array.from(this.keys.values()).find(k => k.id === keyId);
        if (!keyData) {
            throw new Error('API key not found');
        }

        this.keys.delete(keyData.key);
        await this.saveKeys();
        
        logger.info(`Deleted API key: ${keyData.name}`);
        return true;
    }

    /**
     * Log API request
     */
    async logRequest(keyId, method, path, responseTime = null) {
        const keyData = Array.from(this.keys.values()).find(k => k.id === keyId);
        if (keyData) {
            keyData.requestCount++;
        }

        const logEntry = {
            keyId,
            method,
            path,
            timestamp: new Date().toISOString(),
            responseTime
        };

        this.usageLogs.push(logEntry);
        
        // Save periodically to avoid too many writes
        if (this.usageLogs.length % 10 === 0) {
            await this.saveUsageLogs();
        }
        
        if (keyData) {
            await this.saveKeys();
        }
    }

    /**
     * Get usage statistics
     */
    getUsageStats(keyId = null, days = 7) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);

        let logs = this.usageLogs.filter(log => new Date(log.timestamp) > cutoff);
        
        if (keyId) {
            logs = logs.filter(log => log.keyId === keyId);
        }

        const stats = {
            totalRequests: logs.length,
            requestsByDay: {},
            requestsByPath: {},
            requestsByKey: {}
        };

        logs.forEach(log => {
            const day = log.timestamp.split('T')[0];
            stats.requestsByDay[day] = (stats.requestsByDay[day] || 0) + 1;
            stats.requestsByPath[log.path] = (stats.requestsByPath[log.path] || 0) + 1;
            stats.requestsByKey[log.keyId] = (stats.requestsByKey[log.keyId] || 0) + 1;
        });

        return stats;
    }

    /**
     * Load keys from file
     */
    loadKeys() {
        try {
            if (fs.existsSync(this.keysFile)) {
                const data = fs.readFileSync(this.keysFile, 'utf8');
                const keysArray = JSON.parse(data);
                
                this.keys.clear();
                keysArray.forEach(keyData => {
                    this.keys.set(keyData.key, keyData);
                });
                
                logger.info(`Loaded ${this.keys.size} API keys`);
            } else {
                logger.info('No existing API keys file found');
            }
        } catch (error) {
            logger.error('Error loading API keys:', error);
        }
    }

    /**
     * Save keys to file
     */
    async saveKeys() {
        try {
            const keysArray = Array.from(this.keys.values());
            fs.writeFileSync(this.keysFile, JSON.stringify(keysArray, null, 2));
        } catch (error) {
            logger.error('Error saving API keys:', error);
            throw error;
        }
    }

    /**
     * Load usage logs from file
     */
    loadUsageLogs() {
        try {
            if (fs.existsSync(this.usageFile)) {
                const data = fs.readFileSync(this.usageFile, 'utf8');
                this.usageLogs = JSON.parse(data);
                logger.info(`Loaded ${this.usageLogs.length} usage log entries`);
            }
        } catch (error) {
            logger.error('Error loading usage logs:', error);
        }
    }

    /**
     * Save usage logs to file
     */
    async saveUsageLogs() {
        try {
            fs.writeFileSync(this.usageFile, JSON.stringify(this.usageLogs, null, 2));
        } catch (error) {
            logger.error('Error saving usage logs:', error);
        }
    }

    /**
     * Cleanup old usage logs (keep last 30 days)
     */
    cleanupUsageLogs() {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 30);
        
        const originalLength = this.usageLogs.length;
        this.usageLogs = this.usageLogs.filter(log => new Date(log.timestamp) > cutoff);
        
        if (this.usageLogs.length < originalLength) {
            logger.info(`Cleaned up ${originalLength - this.usageLogs.length} old usage log entries`);
            this.saveUsageLogs();
        }
    }

    /**
     * Get system credentials (masked for display)
     */
    async getSystemCredentials() {
        try {
            if (fs.existsSync(this.credentialsFile)) {
                const data = JSON.parse(fs.readFileSync(this.credentialsFile, 'utf8'));
                // Return masked credentials for display
                const masked = {};
                for (const [engineId, creds] of Object.entries(data)) {
                    masked[engineId] = {};
                    for (const [field, value] of Object.entries(creds)) {
                        // Show that a value exists but mask it
                        masked[engineId][field] = value ? '••••••••' : '';
                    }
                }
                return masked;
            }
        } catch (error) {
            logger.error('Error reading system credentials:', error);
        }
        return {};
    }

    /**
     * Set system credentials for an engine
     */
    async setSystemCredentials(engineId, credentials) {
        let data = {};

        try {
            if (fs.existsSync(this.credentialsFile)) {
                data = JSON.parse(fs.readFileSync(this.credentialsFile, 'utf8'));
            }
        } catch (error) {
            logger.warn('Could not read existing credentials file:', error);
        }

        // Update credentials for this engine
        data[engineId] = credentials;

        // Save to file
        try {
            fs.writeFileSync(this.credentialsFile, JSON.stringify(data, null, 2));
            logger.info(`System credentials updated for engine: ${engineId}`);
        } catch (e) {
            logger.error('Failed to write system credentials file:', e);
            throw e;
        }
    }

    /**
     * Get raw system credentials for an engine (for internal use)
     */
    async getRawSystemCredentials(engineId) {
        try {
            if (fs.existsSync(this.credentialsFile)) {
                const data = JSON.parse(fs.readFileSync(this.credentialsFile, 'utf8'));
                return data[engineId] || null;
            }
        } catch (error) {
            logger.error('Error reading system credentials:', error);
        }
        return null;
    }
}

module.exports = KeyManager;
