const logger = require('./logger');

class AuthMiddleware {
    constructor(keyManager) {
        this.keyManager = keyManager;
        this.rateLimitMap = new Map(); // Simple in-memory rate limiting
    }

    /**
     * Check if running in development/local mode
     * Development mode skips authentication for easier local testing
     *
     * Auth is SKIPPED when:
     * - NODE_ENV=development (explicit dev mode)
     * - LOCAL_MODE=true (for Electron/embedded/local use - skips auth)
     * - NODE_ENV is not set and API_KEY_REQUIRED is not set (implicit dev mode)
     *
     * Auth is REQUIRED when:
     * - NODE_ENV=production
     * - API_KEY_REQUIRED=true (explicit auth requirement)
     */
    isDevelopmentMode() {
        // Explicit development mode
        if (process.env.NODE_ENV === 'development') {
            return true;
        }

        // Local mode flag (for Electron, embedded, or local web server use)
        // This explicitly skips auth regardless of other settings
        if (process.env.LOCAL_MODE === 'true') {
            return true;
        }

        // Production mode always requires auth
        if (process.env.NODE_ENV === 'production') {
            return false;
        }

        // If API_KEY_REQUIRED is explicitly set, respect it
        if (process.env.API_KEY_REQUIRED === 'true') {
            return false;
        }

        // Default: if NODE_ENV is not set (undefined) and API_KEY_REQUIRED not set,
        // treat as development mode for easier local testing
        return true;
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

                // Skip authentication in development/local mode
                if (this.isDevelopmentMode()) {
                    logger.debug('Development mode: skipping API key authentication');
                    // Set a mock admin key for development to allow admin operations
                    req.apiKey = {
                        id: 'dev-mode',
                        name: 'Development Mode',
                        isAdmin: true,
                        active: true
                    };
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
