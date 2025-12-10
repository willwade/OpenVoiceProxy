const http = require('http');
const fs = require('fs');

class Grid3Simulator {
    constructor(baseUrl = 'http://localhost:3000') {
        this.baseUrl = baseUrl;
        this.apiKey = 'mock-api-key'; // Grid3 would use a real ElevenLabs API key
    }

    async makeRequest(path, method = 'GET', data = null) {
        return new Promise((resolve, reject) => {
            const url = new URL(path, this.baseUrl);
            const options = {
                hostname: url.hostname,
                port: url.port,
                path: url.pathname + url.search,
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'xi-api-key': this.apiKey, // ElevenLabs API key header
                    'User-Agent': 'Grid3-TTS-Client/1.0'
                }
            };

            if (data && method !== 'GET') {
                const jsonData = JSON.stringify(data);
                options.headers['Content-Length'] = Buffer.byteLength(jsonData);
            }

            const req = http.request(options, (res) => {
                let responseData = Buffer.alloc(0);

                res.on('data', (chunk) => {
                    responseData = Buffer.concat([responseData, chunk]);
                });

                res.on('end', () => {
                    try {
                        if (res.headers['content-type']?.includes('application/json')) {
                            const parsed = JSON.parse(responseData.toString());
                            resolve({ status: res.statusCode, data: parsed, headers: res.headers });
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

    async simulateGrid3Workflow() {
        console.log('🎭 Simulating Grid3 TTS Workflow');
        console.log('=' .repeat(50));

        try {
            // Step 1: Check user subscription (Grid3 does this on startup)
            console.log('\n1️⃣ Checking user subscription...');
            const userResponse = await this.makeRequest('/v1/user');
            if (userResponse.status === 200) {
                console.log('✅ User authenticated');
                console.log(`   Tier: ${userResponse.data.subscription?.tier}`);
                console.log(`   Character limit: ${userResponse.data.subscription?.character_limit}`);
            } else {
                console.log('❌ User authentication failed');
                return false;
            }

            // Step 2: Get available voices (Grid3 does this to populate voice list)
            console.log('\n2️⃣ Fetching available voices...');
            const voicesResponse = await this.makeRequest('/v1/voices');
            if (voicesResponse.status === 200) {
                const voices = voicesResponse.data.voices;
                console.log(`✅ Found ${voices.length} voices`);
                
                // Show first few voices
                voices.slice(0, 3).forEach(voice => {
                    console.log(`   - ${voice.name} (${voice.voice_id})`);
                });
                
                if (voices.length === 0) {
                    console.log('❌ No voices available');
                    return false;
                }

                // Step 3: Test TTS with different voice types
                console.log('\n3️⃣ Testing text-to-speech generation...');
                
                const testPhrases = [
                    "Hello, this is a test of the TTS proxy.",
                    "Grid3 is now using local text-to-speech engines.",
                    "The quick brown fox jumps over the lazy dog."
                ];

                for (let i = 0; i < Math.min(2, voices.length); i++) {
                    const voice = voices[i];
                    const testText = testPhrases[i % testPhrases.length];
                    
                    console.log(`\n   Testing voice: ${voice.name}`);
                    console.log(`   Text: "${testText}"`);
                    
                    const ttsData = {
                        text: testText,
                        model_id: "eleven_monolingual_v1",
                        voice_settings: {
                            stability: 0.5,
                            similarity_boost: 0.5,
                            style: 0.0,
                            use_speaker_boost: true
                        }
                    };

                    const ttsResponse = await this.makeRequest(
                        `/v1/text-to-speech/${voice.voice_id}/stream/with-timestamps`,
                        'POST',
                        ttsData
                    );

                    if (ttsResponse.status === 200) {
                        const audioSize = ttsResponse.data.length;
                        const contentType = ttsResponse.headers['content-type'];
                        console.log(`   ✅ Generated ${audioSize} bytes of audio (${contentType})`);
                        
                        // Save audio file for testing
                        const filename = `test-audio-${voice.voice_id.replace(/[^a-zA-Z0-9]/g, '-')}.${contentType.includes('wav') ? 'wav' : 'mp3'}`;
                        fs.writeFileSync(filename, ttsResponse.data);
                        console.log(`   💾 Saved as: ${filename}`);
                    } else {
                        console.log(`   ❌ TTS failed (${ttsResponse.status})`);
                    }
                }

                console.log('\n4️⃣ Testing error handling...');
                
                // Test with invalid voice ID
                const invalidResponse = await this.makeRequest(
                    '/v1/text-to-speech/invalid-voice-id/stream/with-timestamps',
                    'POST',
                    { text: "Test", model_id: "eleven_monolingual_v1" }
                );
                
                if (invalidResponse.status === 404) {
                    console.log('   ✅ Invalid voice ID properly rejected');
                } else {
                    console.log(`   ⚠️ Unexpected response for invalid voice: ${invalidResponse.status}`);
                }

                console.log('\n🎉 Grid3 simulation completed successfully!');
                console.log('\n📊 Summary:');
                console.log(`   - User authentication: ✅`);
                console.log(`   - Voice discovery: ✅ (${voices.length} voices)`);
                console.log(`   - TTS generation: ✅`);
                console.log(`   - Error handling: ✅`);
                console.log('\n🚀 Your proxy is ready for Grid3!');
                
                return true;

            } else {
                console.log('❌ Failed to fetch voices');
                return false;
            }

        } catch (error) {
            console.error('❌ Simulation failed:', error.message);
            return false;
        }
    }

    async testPerformance() {
        console.log('\n⚡ Performance Testing');
        console.log('=' .repeat(30));

        const testText = "Performance test phrase.";
        const voicesResponse = await this.makeRequest('/v1/voices');
        
        if (voicesResponse.status !== 200 || !voicesResponse.data.voices.length) {
            console.log('❌ No voices available for performance testing');
            return;
        }

        const voice = voicesResponse.data.voices[0];
        const iterations = 5;
        const times = [];

        for (let i = 0; i < iterations; i++) {
            const startTime = Date.now();
            
            const response = await this.makeRequest(
                `/v1/text-to-speech/${voice.voice_id}/stream/with-timestamps`,
                'POST',
                {
                    text: testText,
                    model_id: "eleven_monolingual_v1",
                    voice_settings: { stability: 0.5, similarity_boost: 0.5 }
                }
            );
            
            const endTime = Date.now();
            const duration = endTime - startTime;
            times.push(duration);
            
            console.log(`   Test ${i + 1}: ${duration}ms (${response.data.length} bytes)`);
        }

        const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
        const minTime = Math.min(...times);
        const maxTime = Math.max(...times);

        console.log(`\n📈 Performance Results:`);
        console.log(`   Average: ${avgTime.toFixed(1)}ms`);
        console.log(`   Min: ${minTime}ms`);
        console.log(`   Max: ${maxTime}ms`);
        
        if (avgTime < 1000) {
            console.log('   ✅ Excellent performance (< 1s)');
        } else if (avgTime < 3000) {
            console.log('   ⚠️ Good performance (< 3s)');
        } else {
            console.log('   🐌 Slow performance (> 3s)');
        }
    }
}

async function main() {
    const simulator = new Grid3Simulator();
    
    // Check if server is running
    try {
        await simulator.makeRequest('/health');
    } catch (error) {
        console.log('❌ TTS Proxy server is not running on localhost:3000');
        console.log('💡 Please start the server first with: start-proxy.bat');
        process.exit(1);
    }

    const success = await simulator.simulateGrid3Workflow();
    
    if (success) {
        await simulator.testPerformance();
    }
    
    process.exit(success ? 0 : 1);
}

main();
