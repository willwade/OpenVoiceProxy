const ProxyServer = require('./src/proxy-server');

console.log('🧪 Testing HTTPS Proxy Server');
console.log('=' .repeat(50));

async function testHttpsServer() {
    try {
        // Create server on different port to avoid conflicts
        const proxyServer = new ProxyServer(3001);
        await proxyServer.start();
        
        console.log('✅ Proxy server started successfully');
        
        // Wait a moment for HTTPS to initialize
        setTimeout(async () => {
            console.log('\n🔍 Testing HTTPS connection...');
            
            // Test if HTTPS server is responding
            try {
                const https = require('https');
                const options = {
                    hostname: 'api.elevenlabs.io',
                    port: 443,
                    path: '/v1/voices',
                    method: 'GET',
                    headers: {
                        'xi-api-key': 'test-key'
                    },
                    rejectUnauthorized: false // Accept self-signed cert
                };

                const req = https.request(options, (res) => {
                    console.log(`✅ HTTPS Response Status: ${res.statusCode}`);
                    console.log(`✅ HTTPS Headers:`, res.headers);
                    
                    let data = '';
                    res.on('data', (chunk) => {
                        data += chunk;
                    });
                    
                    res.on('end', () => {
                        console.log(`✅ HTTPS Response received (${data.length} bytes)`);
                        if (data.length > 0) {
                            try {
                                const voices = JSON.parse(data);
                                console.log(`✅ Found ${voices.voices?.length || 0} voices via HTTPS`);
                            } catch (e) {
                                console.log('✅ Response received but not JSON');
                            }
                        }
                        
                        // Stop the server
                        proxyServer.stop().then(() => {
                            console.log('\n🎉 HTTPS test completed successfully!');
                            process.exit(0);
                        });
                    });
                });

                req.on('error', (error) => {
                    console.log(`❌ HTTPS Request failed: ${error.message}`);
                    console.log(`   Code: ${error.code}`);
                    
                    // Stop the server
                    proxyServer.stop().then(() => {
                        console.log('\n❌ HTTPS test failed');
                        process.exit(1);
                    });
                });

                req.end();
                
            } catch (error) {
                console.error('❌ HTTPS test error:', error);
                process.exit(1);
            }
        }, 2000);
        
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

testHttpsServer();
