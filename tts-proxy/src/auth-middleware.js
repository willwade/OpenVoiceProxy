const logger = require('./logger');

class AuthMiddleware {
    constructor(keyManager) {
        this.keyManager = keyManager;
        this.rateLimitMap = new Map(); // Simple in-memory rate limiting
    }

    /**
     * Middleware to authenticate API requests
     */
    authenticate(options = {}) {
        const { 
            skipPaths = ['/health', '/admin/login'], 
            adminOnly = false,
            rateLimit = { requests: 100, windowMs: 60000 } // 100 requests per minute
        } = options;

        return async (req, res, next) => {
            try {
                // Skip authentication for certain paths
                if (skipPaths.some(path => req.path.startsWith(path))) {
                    return next();
                }

                // Skip if API key authentication is disabled
                if (process.env.API_KEY_REQUIRED !== 'true') {
                    logger.debug('API key authentication disabled');
                    return next();
                }

                // Extract API key from headers
                const apiKey = this.extractApiKey(req);
                if (!apiKey) {
                    return this.sendUnauthorized(res, 'API key required');
                }

                // Validate API key
                const keyInfo = await this.keyManager.validateKey(apiKey);
                if (!keyInfo) {
                    return this.sendUnauthorized(res, 'Invalid API key');
                }

                // Check if key is active
                if (!keyInfo.active) {
                    return this.sendUnauthorized(res, 'API key is disabled');
                }

                // Check admin-only endpoints
                if (adminOnly && !keyInfo.isAdmin) {
                    return this.sendForbidden(res, 'Admin access required');
                }

                // Rate limiting
                if (!this.checkRateLimit(apiKey, rateLimit)) {
                    return this.sendRateLimited(res);
                }

                // Add key info to request for later use
                req.apiKey = keyInfo;
                
                // Log the request
                await this.keyManager.logRequest(keyInfo.id, req.method, req.path);

                next();
            } catch (error) {
                logger.error('Authentication error:', error);
                res.status(500).json({ error: 'Authentication service error' });
            }
        };
    }

    /**
     * Extract API key from request headers
     */
    extractApiKey(req) {
        // Check Authorization header (Bearer token)
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            return authHeader.substring(7);
        }

        // Check X-API-Key header
        const apiKeyHeader = req.headers['x-api-key'];
        if (apiKeyHeader) {
            return apiKeyHeader;
        }

        // Check query parameter (less secure, but sometimes needed)
        const queryKey = req.query.api_key;
        if (queryKey) {
            return queryKey;
        }

        return null;
    }

    /**
     * Simple rate limiting check
     */
    checkRateLimit(apiKey, rateLimit) {
        const now = Date.now();
        const windowStart = now - rateLimit.windowMs;
        
        if (!this.rateLimitMap.has(apiKey)) {
            this.rateLimitMap.set(apiKey, []);
        }
        
        const requests = this.rateLimitMap.get(apiKey);
        
        // Remove old requests outside the window
        const validRequests = requests.filter(timestamp => timestamp > windowStart);
        
        // Check if limit exceeded
        if (validRequests.length >= rateLimit.requests) {
            return false;
        }
        
        // Add current request
        validRequests.push(now);
        this.rateLimitMap.set(apiKey, validRequests);
        
        return true;
    }

    /**
     * Send unauthorized response
     */
    sendUnauthorized(res, message = 'Unauthorized') {
        res.status(401).json({
            error: 'Unauthorized',
            message: message,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Send forbidden response
     */
    sendForbidden(res, message = 'Forbidden') {
        res.status(403).json({
            error: 'Forbidden',
            message: message,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Send rate limited response
     */
    sendRateLimited(res) {
        res.status(429).json({
            error: 'Rate Limit Exceeded',
            message: 'Too many requests, please try again later',
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Cleanup old rate limit entries (call periodically)
     */
    cleanupRateLimits() {
        const now = Date.now();
        const maxAge = 60000; // 1 minute
        
        for (const [key, requests] of this.rateLimitMap.entries()) {
            const validRequests = requests.filter(timestamp => now - timestamp < maxAge);
            if (validRequests.length === 0) {
                this.rateLimitMap.delete(key);
            } else {
                this.rateLimitMap.set(key, validRequests);
            }
        }
    }
}

module.exports = AuthMiddleware;
