const winston = require('winston');
const path = require('path');

class ProductionLogger {
    constructor() {
        this.logger = this.createLogger();
        this.metrics = {
            requests: 0,
            errors: 0,
            warnings: 0,
            startTime: Date.now()
        };
    }

    createLogger() {
        const isProduction = process.env.NODE_ENV === 'production';
        const logLevel = process.env.LOG_LEVEL || 'info';
        
        // Create custom format for structured logging
        const customFormat = winston.format.combine(
            winston.format.timestamp(),
            winston.format.errors({ stack: true }),
            winston.format.json(),
            winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
                const logEntry = {
                    timestamp,
                    level,
                    message,
                    service: service || 'openvoiceproxy',
                    ...meta
                };
                
                // Add request ID if available
                if (meta.requestId) {
                    logEntry.requestId = meta.requestId;
                }
                
                return JSON.stringify(logEntry);
            })
        );

        const transports = [];

        // Console transport - ALWAYS enabled in production for cloud log aggregation
        // In production, use JSON format for structured logging
        // In development, use colorized simple format
        if (isProduction) {
            transports.push(new winston.transports.Console({
                format: customFormat  // JSON format for cloud log aggregation
            }));
        } else {
            transports.push(new winston.transports.Console({
                format: winston.format.combine(
                    winston.format.colorize(),
                    winston.format.simple()
                )
            }));
        }

        // File transports (only in development or when LOG_TO_FILE is enabled)
        if (!isProduction && process.env.LOG_TO_FILE !== 'false') {
            const logDir = process.env.LOG_DIR || './logs';
            
            // Ensure log directory exists
            const fs = require('fs');
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }

            // Error log file
            transports.push(new winston.transports.File({
                filename: path.join(logDir, 'error.log'),
                level: 'error',
                format: customFormat,
                maxsize: 10 * 1024 * 1024, // 10MB
                maxFiles: 5
            }));

            // Combined log file
            transports.push(new winston.transports.File({
                filename: path.join(logDir, 'combined.log'),
                format: customFormat,
                maxsize: 10 * 1024 * 1024, // 10MB
                maxFiles: 5
            }));
        }

        return winston.createLogger({
            level: logLevel,
            format: customFormat,
            defaultMeta: {
                service: 'openvoiceproxy',
                version: process.env.npm_package_version || '1.0.0',
                environment: process.env.NODE_ENV || 'development'
            },
            transports
        });
    }

    // Wrapper methods that also update metrics
    info(message, meta = {}) {
        this.metrics.requests++;
        this.logger.info(message, meta);
    }

    warn(message, meta = {}) {
        this.metrics.warnings++;
        this.logger.warn(message, meta);
    }

    error(message, meta = {}) {
        this.metrics.errors++;
        this.logger.error(message, meta);
    }

    debug(message, meta = {}) {
        this.logger.debug(message, meta);
    }

    // Request logging middleware
    requestLogger() {
        return (req, res, next) => {
            const start = Date.now();
            const requestId = this.generateRequestId();
            
            // Add request ID to request object
            req.requestId = requestId;
            
            // Log incoming request
            this.info('Incoming request', {
                requestId,
                method: req.method,
                url: req.originalUrl || req.url,
                ip: req.ip || req.connection.remoteAddress,
                userAgent: req.headers['user-agent'],
                contentLength: req.headers['content-length']
            });

            // Log response when finished
            res.on('finish', () => {
                const duration = Date.now() - start;
                const level = res.statusCode >= 400 ? 'warn' : 'info';
                
                this.logger.log(level, 'Request completed', {
                    requestId,
                    method: req.method,
                    url: req.originalUrl || req.url,
                    statusCode: res.statusCode,
                    duration: `${duration}ms`,
                    contentLength: res.get('content-length')
                });
            });

            next();
        };
    }

    // Generate unique request ID
    generateRequestId() {
        return Math.random().toString(36).substring(2, 15) + 
               Math.random().toString(36).substring(2, 15);
    }

    // Get current metrics
    getMetrics() {
        const uptime = Date.now() - this.metrics.startTime;
        return {
            ...this.metrics,
            uptime: uptime,
            uptimeFormatted: this.formatUptime(uptime)
        };
    }

    // Format uptime in human readable format
    formatUptime(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) {
            return `${days}d ${hours % 24}h ${minutes % 60}m`;
        } else if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }

    // Health check information
    getHealthInfo() {
        const metrics = this.getMetrics();
        const memUsage = process.memoryUsage();
        
        return {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: metrics.uptimeFormatted,
            metrics: {
                requests: metrics.requests,
                errors: metrics.errors,
                warnings: metrics.warnings,
                errorRate: metrics.requests > 0 ? (metrics.errors / metrics.requests * 100).toFixed(2) + '%' : '0%'
            },
            memory: {
                rss: Math.round(memUsage.rss / 1024 / 1024) + 'MB',
                heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + 'MB',
                heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
                external: Math.round(memUsage.external / 1024 / 1024) + 'MB'
            },
            process: {
                pid: process.pid,
                version: process.version,
                platform: process.platform,
                arch: process.arch
            }
        };
    }

    // Log application startup
    logStartup(port) {
        this.info('OpenVoiceProxy Server starting up', {
            port,
            nodeVersion: process.version,
            platform: process.platform,
            environment: process.env.NODE_ENV || 'development',
            pid: process.pid
        });
    }

    // Log application shutdown
    logShutdown() {
        const metrics = this.getMetrics();
        this.info('OpenVoiceProxy Server shutting down', {
            uptime: metrics.uptimeFormatted,
            totalRequests: metrics.requests,
            totalErrors: metrics.errors
        });
    }

    // Error tracking for unhandled exceptions
    setupErrorTracking() {
        process.on('uncaughtException', (error) => {
            this.error('Uncaught Exception', {
                error: error.message,
                stack: error.stack
            });
        });

        process.on('unhandledRejection', (reason, promise) => {
            this.error('Unhandled Promise Rejection', {
                reason: reason?.message || reason,
                stack: reason?.stack
            });
        });
    }
}

// Create singleton instance
const productionLogger = new ProductionLogger();

// Setup error tracking
productionLogger.setupErrorTracking();

module.exports = productionLogger;
