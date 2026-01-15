import http from 'node:http';
import https from 'node:https';
import { loadEnv } from './load-env.js';

function getArg(name: string): string | undefined {
  const index = process.argv.findIndex((arg) => arg === name);
  if (index !== -1 && process.argv[index + 1]) {
    return process.argv[index + 1];
  }
  return undefined;
}

loadEnv(import.meta.url);

const urlArg = getArg('--url');
const insecure = process.argv.includes('--insecure');
const target = urlArg ?? process.env.HTTPS_URL ?? 'https://localhost:3443/health';
const apiKey = process.env.TTS_API_KEY ?? process.env.ADMIN_API_KEY;

console.log('Testing HTTPS endpoint');
console.log('='.repeat(50));
console.log(`URL: ${target}`);
console.log(`Insecure TLS: ${insecure ? 'true' : 'false'}`);

const url = new URL(target);
const transport = url.protocol === 'https:' ? https : http;

const options: http.RequestOptions = {
  hostname: url.hostname,
  port: url.port,
  path: url.pathname + url.search,
  method: 'GET',
  headers: apiKey ? { 'X-API-Key': apiKey } : undefined,
};

if (url.protocol === 'https:' && insecure) {
  (options as https.RequestOptions).rejectUnauthorized = false;
}

const req = transport.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    console.log(`Status: ${res.statusCode}`);
    console.log('Headers:', res.headers);
    console.log(`Body (${data.length} bytes):`);
    console.log(data);
  });
});

req.on('error', (error) => {
  console.error('Request failed:', error.message);
  process.exit(1);
});

req.end();
