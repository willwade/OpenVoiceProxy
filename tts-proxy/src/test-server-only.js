const ProxyServer = require('./proxy-server');
const logger = require('./logger');

async function testProxyServer() {
    console.log('🚀 Starting TTS Proxy Server Test');
    console.log('=' .repeat(50));

    try {
        // Create and start the proxy server
        const proxyServer = new ProxyServer(3000);
        await proxyServer.start();

        console.log('✅ Proxy server started successfully');
        console.log('📋 Server is running on http://localhost:3000');
        console.log('🔍 You can test the endpoints:');
        console.log('   - Health: http://localhost:3000/health');
        console.log('   - Voices: http://localhost:3000/v1/voices');
        console.log('');
        console.log('Press Ctrl+C to stop the server');

        // Keep the server running
        process.on('SIGINT', async () => {
            console.log('\n🛑 Shutting down server...');
            await proxyServer.stop();
            console.log('✅ Server stopped');
            process.exit(0);
        });

    } catch (error) {
        console.error('❌ Failed to start proxy server:', error);
        process.exit(1);
    }
}

// Run the test
testProxyServer();
