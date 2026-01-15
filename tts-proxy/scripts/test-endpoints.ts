import http from 'node:http';
import { loadEnv } from './load-env.js';

type TestResult =
  | { status: number | undefined; data: unknown; headers?: http.IncomingHttpHeaders }
  | { status: number | undefined; data: string; headers?: http.IncomingHttpHeaders };

loadEnv(import.meta.url);

const baseUrl = process.env.TTS_BASE_URL ?? 'http://localhost:3000';
const apiKey = process.env.TTS_API_KEY ?? process.env.ADMIN_API_KEY;

function buildHeaders(hasBody: boolean, bodyLength = 0): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'TTS-Proxy-Test/1.0',
  };

  if (apiKey) {
    headers['xi-api-key'] = apiKey;
  }

  if (hasBody) {
    headers['Content-Length'] = String(bodyLength);
  }

  return headers;
}

async function testEndpoint(
  path: string,
  method: 'GET' | 'POST',
  data: unknown = null
): Promise<TestResult> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const body = data && method !== 'GET' ? JSON.stringify(data) : null;

    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: buildHeaders(Boolean(body), body ? Buffer.byteLength(body) : 0),
    };

    const req = http.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          if (res.headers['content-type']?.includes('application/json')) {
            const parsed = JSON.parse(responseData);
            resolve({ status: res.statusCode, data: parsed, headers: res.headers });
          } else {
            resolve({ status: res.statusCode, data: responseData, headers: res.headers });
          }
        } catch {
          resolve({ status: res.statusCode, data: responseData, headers: res.headers });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (body) {
      req.write(body);
    }

    req.end();
  });
}

async function runTests(): Promise<boolean> {
  console.log('Testing TTS Proxy Endpoints');
  console.log('='.repeat(50));

  const tests = [
    { name: 'Health Check', path: '/health', method: 'GET' as const },
    { name: 'Get Voices', path: '/v1/voices', method: 'GET' as const },
    { name: 'Get User Info', path: '/v1/user', method: 'GET' as const },
    {
      name: 'Text-to-Speech',
      path: '/v1/text-to-speech/espeak-en/stream/with-timestamps',
      method: 'POST' as const,
      data: {
        text: 'Hello, this is a test of the TTS proxy.',
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.5,
          style: 0.0,
        },
      },
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    console.log(`\nTesting: ${test.name}`);
    try {
      const result = await testEndpoint(test.path, test.method, test.data);

      if (result.status && result.status >= 200 && result.status < 300) {
        console.log(`${test.name}: OK (${result.status})`);

        if (test.name === 'Get Voices' && typeof result.data === 'object' && result.data) {
          const voices = (result.data as { voices?: Array<{ name: string; voice_id: string }> }).voices;
          if (voices) {
            console.log(`  Found ${voices.length} voices`);
            voices.slice(0, 3).forEach((voice) => {
              console.log(`    - ${voice.name} (${voice.voice_id})`);
            });
          }
        }

        if (test.name === 'Text-to-Speech') {
          const audioSize = typeof result.data === 'string' ? result.data.length : 0;
          console.log(`  Generated ${audioSize} bytes of audio`);
        }

        passed++;
      } else {
        console.log(`${test.name}: Failed (${result.status})`);
        console.log(`  Error: ${JSON.stringify(result.data)}`);
        failed++;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`${test.name}: Error - ${message}`);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('Test Results:');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Success Rate: ${Math.round((passed / (passed + failed)) * 100)}%`);

  if (failed === 0) {
    console.log('All tests passed! The proxy is working correctly.');
  } else {
    console.log('Some tests failed. Make sure the proxy server is running.');
  }

  return failed === 0;
}

async function checkServer(): Promise<boolean> {
  try {
    await testEndpoint('/health', 'GET');
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  console.log(`Checking if TTS Proxy server is running at ${baseUrl}...`);

  const serverRunning = await checkServer();
  if (!serverRunning) {
    console.log(`TTS Proxy server is not running at ${baseUrl}`);
    console.log('Start it with: npm run start:ts');
    process.exit(1);
  }

  console.log('Server is running, starting tests...\n');
  const success = await runTests();
  process.exit(success ? 0 : 1);
}

main().catch((error) => {
  console.error('Test runner failed:', error);
  process.exit(1);
});
