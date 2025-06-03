const http = require('http');

async function testEndpoint(path, method = 'GET', data = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'TTS-Proxy-Test/1.0'
            }
        };

        if (data && method !== 'GET') {
            const jsonData = JSON.stringify(data);
            options.headers['Content-Length'] = Buffer.byteLength(jsonData);
        }

        const req = http.request(options, (res) => {
            let responseData = '';

            res.on('data', (chunk) => {
                responseData += chunk;
            });

            res.on('end', () => {
                try {
                    if (res.headers['content-type']?.includes('application/json')) {
                        const parsed = JSON.parse(responseData);
                        resolve({ status: res.statusCode, data: parsed });
                    } else {
                        resolve({ status: res.statusCode, data: responseData, headers: res.headers });
                    }
                } catch (error) {
                    resolve({ status: res.statusCode, data: responseData, headers: res.headers });
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        if (data && method !== 'GET') {
            req.write(JSON.stringify(data));
        }

        req.end();
    });
}

async function runTests() {
    console.log('🧪 Testing TTS Proxy Endpoints');
    console.log('=' .repeat(50));

    const tests = [
        {
            name: 'Health Check',
            path: '/health',
            method: 'GET'
        },
        {
            name: 'Get Voices',
            path: '/v1/voices',
            method: 'GET'
        },
        {
            name: 'Get User Info',
            path: '/v1/user',
            method: 'GET'
        },
        {
            name: 'Text-to-Speech',
            path: '/v1/text-to-speech/espeak-en/stream/with-timestamps',
            method: 'POST',
            data: {
                text: "Hello, this is a test of the TTS proxy.",
                model_id: "eleven_monolingual_v1",
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.5,
                    style: 0.0
                }
            }
        }
    ];

    let passed = 0;
    let failed = 0;

    for (const test of tests) {
        console.log(`\n🔍 Testing: ${test.name}`);
        try {
            const result = await testEndpoint(test.path, test.method, test.data);
            
            if (result.status >= 200 && result.status < 300) {
                console.log(`✅ ${test.name}: OK (${result.status})`);
                
                if (test.name === 'Get Voices' && result.data.voices) {
                    console.log(`   📋 Found ${result.data.voices.length} voices`);
                    result.data.voices.slice(0, 3).forEach(voice => {
                        console.log(`      - ${voice.name} (${voice.voice_id})`);
                    });
                }
                
                if (test.name === 'Text-to-Speech') {
                    const audioSize = result.data.length || 0;
                    console.log(`   🎵 Generated ${audioSize} bytes of audio`);
                    console.log(`   📄 Content-Type: ${result.headers['content-type']}`);
                }
                
                passed++;
            } else {
                console.log(`❌ ${test.name}: Failed (${result.status})`);
                console.log(`   Error: ${JSON.stringify(result.data)}`);
                failed++;
            }
        } catch (error) {
            console.log(`❌ ${test.name}: Error - ${error.message}`);
            failed++;
        }
    }

    console.log('\n' + '=' .repeat(50));
    console.log('📊 Test Results:');
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📈 Success Rate: ${Math.round((passed / (passed + failed)) * 100)}%`);

    if (failed === 0) {
        console.log('🎉 All tests passed! The proxy is working correctly.');
    } else {
        console.log('⚠️  Some tests failed. Make sure the proxy server is running.');
    }

    return failed === 0;
}

// Check if server is running first
async function checkServer() {
    try {
        await testEndpoint('/health');
        return true;
    } catch (error) {
        return false;
    }
}

async function main() {
    console.log('Checking if TTS Proxy server is running...');
    
    const serverRunning = await checkServer();
    if (!serverRunning) {
        console.log('❌ TTS Proxy server is not running on localhost:3000');
        console.log('💡 Please start the server first with: start-proxy.bat');
        process.exit(1);
    }
    
    console.log('✅ Server is running, starting tests...\n');
    const success = await runTests();
    process.exit(success ? 0 : 1);
}

main();
