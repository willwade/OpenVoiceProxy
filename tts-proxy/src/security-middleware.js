const logger = require('./logger');

class SecurityMiddleware {
    constructor() {
        this.trustedProxies = process.env.TRUSTED_PROXIES ? 
            process.env.TRUSTED_PROXIES.split(',') : [];
    }

    /**
     * Security headers middleware
     */
    securityHeaders() {
        return (req, res, next) => {
            // Prevent MIME type sniffing
            res.setHeader('X-Content-Type-Options', 'nosniff');
            
            // Prevent clickjacking
            res.setHeader('X-Frame-Options', 'DENY');
            
            // XSS protection
            res.setHeader('X-XSS-Protection', '1; mode=block');
            
            // Referrer policy
            res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
            
            // Content Security Policy
            res.setHeader('Content-Security-Policy', 
                "default-src 'self'; " +
                "script-src 'self' 'unsafe-inline'; " +
                "style-src 'self' 'unsafe-inline'; " +
                "img-src 'self' data:; " +
                "connect-src 'self'; " +
                "font-src 'self'; " +
                "object-src 'none'; " +
                "media-src 'self'; " +
                "frame-src 'none';"
            );
            
            // Strict Transport Security (HTTPS only)
            if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
                res.setHeader('Strict-Transport-Security', 
                    'max-age=31536000; includeSubDomains; preload');
            }
            
            // Remove server information
            res.removeHeader('X-Powered-By');
            
            next();
        };
    }

    /**
     * Request validation middleware
     */
    validateRequest() {
        return (req, res, next) => {
            // Check request size
            const maxSize = process.env.MAX_REQUEST_SIZE || '10mb';
            const contentLength = req.headers['content-length'];
            
            if (contentLength && parseInt(contentLength) > this.parseSize(maxSize)) {
                logger.warn(`Request too large: ${contentLength} bytes from ${req.ip}`);
                return res.status(413).json({ 
                    error: 'Request too large',
                    maxSize: maxSize
                });
            }

            // Validate Content-Type for POST/PUT requests
            if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
                const contentType = req.headers['content-type'];
                if (contentType && !contentType.startsWith('application/json')) {
                    if (!req.path.startsWith('/admin/')) { // Allow form data for admin interface
                        logger.warn(`Invalid content type: ${contentType} from ${req.ip}`);
                        return res.status(415).json({ 
                            error: 'Unsupported Media Type',
                            expected: 'application/json'
                        });
                    }
                }
            }

            // Check for suspicious patterns in URL
            const suspiciousPatterns = [
                /\.\./,  // Path traversal
                /<script/i,  // XSS attempts
                /union.*select/i,  // SQL injection
                /javascript:/i,  // JavaScript protocol
                /data:.*base64/i  // Data URLs with base64
            ];

            const url = req.originalUrl || req.url;
            for (const pattern of suspiciousPatterns) {
                if (pattern.test(url)) {
                    logger.warn(`Suspicious request pattern detected: ${url} from ${req.ip}`);
                    return res.status(400).json({ 
                        error: 'Bad Request',
                        message: 'Invalid request format'
                    });
                }
            }

            next();
        };
    }

    /**
     * IP filtering middleware
     */
    ipFilter() {
        return (req, res, next) => {
            const allowedIPs = process.env.ALLOWED_IPS;
            const blockedIPs = process.env.BLOCKED_IPS;

            const clientIP = this.getClientIP(req);

            // Check blocked IPs first
            if (blockedIPs) {
                const blocked = blockedIPs.split(',').map(ip => ip.trim());
                if (blocked.includes(clientIP)) {
                    logger.warn(`Blocked IP attempted access: ${clientIP}`);
                    return res.status(403).json({ 
                        error: 'Forbidden',
                        message: 'Access denied'
                    });
                }
            }

            // Check allowed IPs (if configured)
            if (allowedIPs) {
                const allowed = allowedIPs.split(',').map(ip => ip.trim());
                if (!allowed.includes(clientIP) && !allowed.includes('*')) {
                    logger.warn(`Unauthorized IP attempted access: ${clientIP}`);
                    return res.status(403).json({ 
                        error: 'Forbidden',
                        message: 'IP not authorized'
                    });
                }
            }

            next();
        };
    }

    /**
     * Request logging middleware
     */
    requestLogger() {
        return (req, res, next) => {
            const start = Date.now();
            const clientIP = this.getClientIP(req);
            
            // Log request
            logger.info(`${req.method} ${req.path}`, {
                ip: clientIP,
                userAgent: req.headers['user-agent'],
                referer: req.headers.referer,
                contentLength: req.headers['content-length']
            });

            // Log response when finished
            res.on('finish', () => {
                const duration = Date.now() - start;
                logger.info(`Response: ${res.statusCode}`, {
                    method: req.method,
                    path: req.path,
                    ip: clientIP,
                    duration: `${duration}ms`,
                    contentLength: res.get('content-length')
                });
            });

            next();
        };
    }

    /**
     * Error handling middleware
     */
    errorHandler() {
        return (error, req, res, next) => {
            const clientIP = this.getClientIP(req);
            
            logger.error('Request error:', {
                error: error.message,
                stack: error.stack,
                method: req.method,
                path: req.path,
                ip: clientIP
            });

            // Don't leak error details in production
            const isDevelopment = process.env.NODE_ENV !== 'production';
            
            res.status(error.status || 500).json({
                error: 'Internal Server Error',
                message: isDevelopment ? error.message : 'Something went wrong',
                ...(isDevelopment && { stack: error.stack })
            });
        };
    }

    /**
     * Get client IP address
     */
    getClientIP(req) {
        // Check various headers for the real IP
        const forwarded = req.headers['x-forwarded-for'];
        const realIP = req.headers['x-real-ip'];
        const cfConnectingIP = req.headers['cf-connecting-ip']; // Cloudflare
        
        if (forwarded) {
            // X-Forwarded-For can contain multiple IPs, take the first one
            return forwarded.split(',')[0].trim();
        }
        
        if (realIP) {
            return realIP;
        }
        
        if (cfConnectingIP) {
            return cfConnectingIP;
        }
        
        return req.connection.remoteAddress || req.socket.remoteAddress || req.ip;
    }

    /**
     * Parse size string to bytes
     */
    parseSize(sizeStr) {
        const units = {
            'b': 1,
            'kb': 1024,
            'mb': 1024 * 1024,
            'gb': 1024 * 1024 * 1024
        };
        
        const match = sizeStr.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*([kmg]?b)$/);
        if (!match) {
            return 10 * 1024 * 1024; // Default 10MB
        }
        
        const [, size, unit] = match;
        return parseFloat(size) * (units[unit] || 1);
    }
}

module.exports = SecurityMiddleware;
