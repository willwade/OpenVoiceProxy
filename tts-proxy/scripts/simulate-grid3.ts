import http from 'node:http';
import fs from 'node:fs';
import { loadEnv } from './load-env.js';

loadEnv(import.meta.url);

class Grid3Simulator {
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;

  constructor(baseUrl = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
    this.apiKey = process.env.TTS_API_KEY ?? process.env.ADMIN_API_KEY;
  }

  async makeRequest(
    requestPath: string,
    method: 'GET' | 'POST' = 'GET',
    data: unknown = null
  ): Promise<{ status: number | undefined; data: Buffer | unknown; headers: http.IncomingHttpHeaders }> {
    return new Promise((resolve, reject) => {
      const url = new URL(requestPath, this.baseUrl);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'Grid3-TTS-Client/1.0',
      };

      if (this.apiKey) {
        headers['xi-api-key'] = this.apiKey;
      }

      const body = data && method !== 'GET' ? JSON.stringify(data) : null;
      if (body) {
        headers['Content-Length'] = String(Buffer.byteLength(body));
      }

      const options: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers,
      };

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
          } catch {
            resolve({ status: res.statusCode, data: responseData, headers: res.headers });
          }
        });
      });

      req.on('error', (error) => reject(error));

      if (body) {
        req.write(body);
      }

      req.end();
    });
  }

  async simulateGrid3Workflow(): Promise<boolean> {
    console.log('Simulating Grid3 TTS Workflow');
    console.log('='.repeat(50));

    try {
      console.log('\n1) Checking user subscription...');
      const userResponse = await this.makeRequest('/v1/user');
      if (userResponse.status === 200 && typeof userResponse.data === 'object') {
        const data = userResponse.data as { subscription?: { tier?: string; character_limit?: number } };
        console.log('User authenticated');
        console.log(`  Tier: ${data.subscription?.tier ?? 'unknown'}`);
        console.log(`  Character limit: ${data.subscription?.character_limit ?? 'unknown'}`);
      } else {
        console.log('User authentication failed');
        return false;
      }

      console.log('\n2) Fetching available voices...');
      const voicesResponse = await this.makeRequest('/v1/voices');
      if (voicesResponse.status === 200 && typeof voicesResponse.data === 'object') {
        const voices = (voicesResponse.data as { voices?: Array<{ name: string; voice_id: string }> }).voices ?? [];
        console.log(`Found ${voices.length} voices`);

        voices.slice(0, 3).forEach((voice) => {
          console.log(`  - ${voice.name} (${voice.voice_id})`);
        });

        if (voices.length === 0) {
          console.log('No voices available');
          return false;
        }

        console.log('\n3) Testing text-to-speech generation...');
        const testPhrases = [
          'Hello, this is a test of the TTS proxy.',
          'Grid3 is now using local text-to-speech engines.',
          'The quick brown fox jumps over the lazy dog.',
        ];

        for (let i = 0; i < Math.min(2, voices.length); i++) {
          const voice = voices[i];
          const testText = testPhrases[i % testPhrases.length];

          console.log(`\n  Testing voice: ${voice.name}`);
          console.log(`  Text: "${testText}"`);

          const ttsData = {
            text: testText,
            model_id: 'eleven_monolingual_v1',
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.5,
              style: 0.0,
              use_speaker_boost: true,
            },
          };

          const ttsResponse = await this.makeRequest(
            `/v1/text-to-speech/${voice.voice_id}`,
            'POST',
            ttsData
          );

          if (ttsResponse.status === 200 && Buffer.isBuffer(ttsResponse.data)) {
            const audioSize = ttsResponse.data.length;
            const contentType = ttsResponse.headers['content-type'] ?? '';
            console.log(`  Generated ${audioSize} bytes of audio (${contentType})`);

            const ext = contentType.includes('wav') ? 'wav' : 'mp3';
            const filename = `test-audio-${voice.voice_id.replace(/[^a-zA-Z0-9]/g, '-')}.${ext}`;
            fs.writeFileSync(filename, ttsResponse.data);
            console.log(`  Saved as: ${filename}`);
          } else {
            console.log(`  TTS failed (${ttsResponse.status})`);
          }
        }

        console.log('\n4) Testing error handling...');
        const invalidResponse = await this.makeRequest(
          '/v1/text-to-speech/invalid-voice-id',
          'POST',
          { text: 'Test', model_id: 'eleven_monolingual_v1' }
        );

        if (invalidResponse.status === 404) {
          console.log('  Invalid voice ID properly rejected');
        } else {
          console.log(`  Unexpected response for invalid voice: ${invalidResponse.status}`);
        }

        console.log('\nGrid3 simulation completed successfully!');
        return true;
      }

      console.log('Failed to fetch voices');
      return false;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Simulation failed:', message);
      return false;
    }
  }

  async testPerformance(): Promise<void> {
    console.log('\nPerformance Testing');
    console.log('='.repeat(30));

    const testText = 'Performance test phrase.';
    const voicesResponse = await this.makeRequest('/v1/voices');

    if (
      voicesResponse.status !== 200 ||
      typeof voicesResponse.data !== 'object' ||
      !(voicesResponse.data as { voices?: Array<{ voice_id: string }> }).voices?.length
    ) {
      console.log('No voices available for performance testing');
      return;
    }

    const voice = (voicesResponse.data as { voices: Array<{ voice_id: string }> }).voices[0];
    const iterations = 5;
    const times: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const startTime = Date.now();
      const response = await this.makeRequest(`/v1/text-to-speech/${voice.voice_id}`, 'POST', {
        text: testText,
        model_id: 'eleven_monolingual_v1',
        voice_settings: { stability: 0.5, similarity_boost: 0.5 },
      });
      const endTime = Date.now();
      times.push(endTime - startTime);

      const size = Buffer.isBuffer(response.data) ? response.data.length : 0;
      console.log(`  Test ${i + 1}: ${endTime - startTime}ms (${size} bytes)`);
    }

    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);

    console.log('\nPerformance Results:');
    console.log(`  Average: ${avgTime.toFixed(1)}ms`);
    console.log(`  Min: ${minTime}ms`);
    console.log(`  Max: ${maxTime}ms`);
  }
}

async function main(): Promise<void> {
  const simulator = new Grid3Simulator(process.env.TTS_BASE_URL ?? 'http://localhost:3000');

  try {
    await simulator.makeRequest('/health');
  } catch {
    console.log('TTS Proxy server is not running on localhost:3000');
    console.log('Start it with: npm run start:ts');
    process.exit(1);
  }

  const success = await simulator.simulateGrid3Workflow();
  if (success) {
    await simulator.testPerformance();
  }

  process.exit(success ? 0 : 1);
}

main().catch((error) => {
  console.error('Simulation failed:', error);
  process.exit(1);
});
