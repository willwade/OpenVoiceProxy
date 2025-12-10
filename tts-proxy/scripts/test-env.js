const EnvironmentLoader = require('./src/env-loader');
const ProxyServer = require('./src/proxy-server');

console.log('🧪 Testing Environment Loading and TTS Engine Initialization');
console.log('=' .repeat(60));

// Test environment loading
console.log('\n📋 Loading environment variables...');
const envLoader = new EnvironmentLoader();
const availableEngines = envLoader.logAvailableEngines();

console.log('\n🔧 Environment Variables Status:');
console.log(`AZURE_SPEECH_KEY: ${process.env.AZURE_SPEECH_KEY ? '✅ Set' : '❌ Not set'}`);
console.log(`AZURE_SPEECH_REGION: ${process.env.AZURE_SPEECH_REGION ? '✅ Set' : '❌ Not set'}`);
console.log(`GOOGLE_APPLICATION_CREDENTIALS: ${process.env.GOOGLE_APPLICATION_CREDENTIALS ? '✅ Set' : '❌ Not set'}`);
console.log(`AWS_ACCESS_KEY_ID: ${process.env.AWS_ACCESS_KEY_ID ? '✅ Set' : '❌ Not set'}`);
console.log(`AWS_SECRET_ACCESS_KEY: ${process.env.AWS_SECRET_ACCESS_KEY ? '✅ Set' : '❌ Not set'}`);
console.log(`ELEVENLABS_API_KEY: ${process.env.ELEVENLABS_API_KEY ? '✅ Set' : '❌ Not set'}`);
console.log(`OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? '✅ Set' : '❌ Not set'}`);

console.log('\n🚀 Initializing Proxy Server...');
try {
    const proxyServer = new ProxyServer(3001); // Use different port to avoid conflicts
    console.log('✅ Proxy server created successfully');
    
    // Start the server briefly to test initialization
    proxyServer.start().then(() => {
        console.log('✅ Proxy server started successfully');
        
        // Stop the server after a moment
        setTimeout(() => {
            proxyServer.stop().then(() => {
                console.log('✅ Proxy server stopped successfully');
                console.log('\n🎉 Test completed successfully!');
                process.exit(0);
            });
        }, 2000);
    }).catch(error => {
        console.error('❌ Failed to start proxy server:', error);
        process.exit(1);
    });
    
} catch (error) {
    console.error('❌ Failed to create proxy server:', error);
    process.exit(1);
}
