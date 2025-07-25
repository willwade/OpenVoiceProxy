#!/usr/bin/env node

/**
 * Production OpenVoiceProxy Server
 * Optimized for cloud deployment without Electron dependencies
 */

const ProxyServer = require('./src/proxy-server');
const logger = require('./src/production-logger');

class ProductionServer {
    constructor() {
        this.proxyServer = null;
        this.isShuttingDown = false;
    }

    async start() {
        try {
            // Get port from environment or default to 3000
            const port = process.env.PORT || process.env.HTTP_PORT || 3000;

            // Log startup
            logger.logStartup(port);

            // Create and start the proxy server
            this.proxyServer = new ProxyServer(port);
            await this.proxyServer.start();

            logger.info(`✅ Production server started successfully on port ${port}`);
            logger.info('📋 Available endpoints:', {
                health: `http://localhost:${port}/health`,
                ready: `http://localhost:${port}/ready`,
                metrics: `http://localhost:${port}/metrics`,
                voices: `http://localhost:${port}/v1/voices`,
                admin: `http://localhost:${port}/admin`
            });

            // Setup graceful shutdown handlers
            this.setupGracefulShutdown();

        } catch (error) {
            logger.error('❌ Failed to start production server:', { error: error.message, stack: error.stack });
            process.exit(1);
        }
    }

    setupGracefulShutdown() {
        const shutdown = async (signal) => {
            if (this.isShuttingDown) {
                logger.warn('⚠️ Shutdown already in progress, forcing exit');
                process.exit(1);
            }
            
            this.isShuttingDown = true;
            logger.info(`🛑 Received ${signal}, shutting down gracefully...`);

            try {
                if (this.proxyServer) {
                    await this.proxyServer.stop();
                }
                logger.logShutdown();
                process.exit(0);
            } catch (error) {
                logger.error('❌ Error during shutdown:', { error: error.message, stack: error.stack });
                process.exit(1);
            }
        };

        // Handle various shutdown signals
        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGUSR2', () => shutdown('SIGUSR2')); // nodemon restart
        
        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            logger.error('💥 Uncaught Exception:', error);
            shutdown('uncaughtException');
        });
        
        process.on('unhandledRejection', (reason, promise) => {
            logger.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
            shutdown('unhandledRejection');
        });
    }
}

// Start the production server if this file is run directly
if (require.main === module) {
    const server = new ProductionServer();
    server.start().catch((error) => {
        logger.error('💥 Fatal error starting server:', error);
        process.exit(1);
    });
}

module.exports = ProductionServer;
