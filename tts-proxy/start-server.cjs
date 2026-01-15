#!/usr/bin/env node

/**
 * OpenVoiceProxy Server Starter
 * Launches the TypeScript Hono server using tsx
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting OpenVoiceProxy Server');
console.log('='.repeat(50));

const tsxPath = path.join(__dirname, 'node_modules', '.bin', 'tsx');
const indexPath = path.join(__dirname, 'src', 'index.ts');

const server = spawn(tsxPath, [indexPath], {
    stdio: 'inherit',
    env: { ...process.env }
});

server.on('error', (error) => {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
});

server.on('close', (code) => {
    process.exit(code || 0);
});

// Forward signals to child process
process.on('SIGINT', () => server.kill('SIGINT'));
process.on('SIGTERM', () => server.kill('SIGTERM'));
