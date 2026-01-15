#!/usr/bin/env node

/**
 * Production OpenVoiceProxy Server
 * Launches the TypeScript Hono server for production deployment
 */

const { spawn } = require('child_process');
const path = require('path');

class ProductionServer {
    constructor() {
        this.serverProcess = null;
        this.isShuttingDown = false;
    }

    async start() {
        const port = process.env.PORT || process.env.HTTP_PORT || 3000;

        console.log('OpenVoiceProxy Production Server');
        console.log('================================');
        console.log(`Environment: ${process.env.NODE_ENV || 'production'}`);
        console.log(`Port: ${port}`);
        console.log('');

        const tsxPath = path.join(__dirname, 'node_modules', '.bin', 'tsx');
        const indexPath = path.join(__dirname, 'src', 'index.ts');

        this.serverProcess = spawn(tsxPath, [indexPath], {
            stdio: 'inherit',
            env: {
                ...process.env,
                NODE_ENV: process.env.NODE_ENV || 'production',
                PORT: port
            }
        });

        this.serverProcess.on('error', (error) => {
            console.error('❌ Failed to start production server:', error.message);
            process.exit(1);
        });

        this.serverProcess.on('close', (code) => {
            if (!this.isShuttingDown) {
                console.log(`Server exited with code ${code}`);
                process.exit(code || 0);
            }
        });

        this.setupGracefulShutdown();
    }

    setupGracefulShutdown() {
        const shutdown = (signal) => {
            if (this.isShuttingDown) {
                console.warn('⚠️ Shutdown already in progress, forcing exit');
                process.exit(1);
            }

            this.isShuttingDown = true;
            console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);

            if (this.serverProcess) {
                this.serverProcess.kill(signal);
            }

            // Force exit after 10 seconds
            setTimeout(() => {
                console.error('⚠️ Graceful shutdown timeout, forcing exit');
                process.exit(1);
            }, 10000);
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGUSR2', () => shutdown('SIGUSR2'));

        process.on('uncaughtException', (error) => {
            console.error('💥 Uncaught Exception:', error);
            shutdown('uncaughtException');
        });

        process.on('unhandledRejection', (reason, promise) => {
            console.error('💥 Unhandled Rejection:', reason);
            shutdown('unhandledRejection');
        });
    }
}

// Start if run directly
if (require.main === module) {
    const server = new ProductionServer();
    server.start().catch((error) => {
        console.error('💥 Fatal error:', error);
        process.exit(1);
    });
}

module.exports = ProductionServer;
