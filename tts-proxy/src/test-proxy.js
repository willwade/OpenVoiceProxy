const http = require('http');
const https = require('https');

class ProxyTester {
    constructor(proxyUrl = 'http://localhost:3000') {
        this.proxyUrl = proxyUrl;
    }

    async testHealthCheck() {
        console.log('🔍 Testing health check...');
        try {
            const response = await this.makeRequest('/health');
            console.log('✅ Health check passed:', response);
            return true;
        } catch (error) {
            console.error('❌ Health check failed:', error.message);
            return false;
        }
    }

    async testVoicesEndpoint() {
        console.log('🔍 Testing voices endpoint...');
        try {
            const response = await this.makeRequest('/v1/voices');
            console.log('✅ Voices endpoint passed');
            console.log('📋 Available voices:', response.voices?.length || 0);
            if (response.voices) {
                response.voices.forEach(voice => {
                    console.log(`  - ${voice.name} (${voice.voice_id})`);
                });
            }
            return true;
        } catch (error) {
            console.error('❌ Voices endpoint failed:', error.message);
            return false;
        }
    }

    async testTextToSpeech() {
        console.log('🔍 Testing text-to-speech endpoint...');
        try {
            const testData = {
                text: "Hello, this is a test of the TTS proxy.",
                model_id: "eleven_monolingual_v1",
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.5,
                    style: 0.0
                }
            };

            const response = await this.makeRequest('/v1/text-to-speech/local-voice-1/stream/with-timestamps', 'POST', testData);
            console.log('✅ Text-to-speech endpoint responded');
            console.log('📊 Response type:', typeof response);
            return true;
        } catch (error) {
            console.error('❌ Text-to-speech endpoint failed:', error.message);
            return false;
        }
    }

    async testUserEndpoint() {
        console.log('🔍 Testing user endpoint...');
        try {
            const response = await this.makeRequest('/v1/user');
            console.log('✅ User endpoint passed');
            console.log('👤 User tier:', response.subscription?.tier);
            console.log('📊 Character limit:', response.subscription?.character_limit);
            return true;
        } catch (error) {
            console.error('❌ User endpoint failed:', error.message);
            return false;
        }
    }

    async makeRequest(path, method = 'GET', data = null) {
        return new Promise((resolve, reject) => {
            const url = new URL(path, this.proxyUrl);
            const options = {
                hostname: url.hostname,
                port: url.port,
                path: url.pathname + url.search,
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'TTS-Proxy-Tester/1.0'
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
                            resolve(parsed);
                        } else {
                            resolve(responseData);
                        }
                    } catch (error) {
                        resolve(responseData);
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

    async runAllTests() {
        console.log('🚀 Starting TTS Proxy Tests');
        console.log('=' .repeat(50));

        const tests = [
            { name: 'Health Check', fn: () => this.testHealthCheck() },
            { name: 'Voices Endpoint', fn: () => this.testVoicesEndpoint() },
            { name: 'User Endpoint', fn: () => this.testUserEndpoint() },
            { name: 'Text-to-Speech', fn: () => this.testTextToSpeech() }
        ];

        let passed = 0;
        let failed = 0;

        for (const test of tests) {
            console.log(`\n📋 Running: ${test.name}`);
            try {
                const result = await test.fn();
                if (result) {
                    passed++;
                } else {
                    failed++;
                }
            } catch (error) {
                console.error(`❌ ${test.name} threw an error:`, error.message);
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
            console.log('⚠️  Some tests failed. Check the proxy server.');
        }

        return failed === 0;
    }
}

// Run tests if this script is executed directly
if (require.main === module) {
    const tester = new ProxyTester();
    tester.runAllTests().then(success => {
        process.exit(success ? 0 : 1);
    });
}

module.exports = ProxyTester;
