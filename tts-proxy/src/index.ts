/**
 * OpenVoiceProxy Server Entry Point
 * TypeScript/Hono-based TTS proxy server
 */

import { ProxyServer } from './proxy-server.js';

// Global error handlers to prevent crashes
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit - just log the error
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // For uncaught exceptions, we may want to exit after logging
  // but give a moment for logs to flush
  setTimeout(() => process.exit(1), 1000);
});

async function main(): Promise<void> {
  const server = new ProxyServer();
  await server.start();

  const shutdown = async () => {
    console.log('\nShutting down...');
    await server.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
