import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';
import { loadEnv } from './load-env.js';

loadEnv(import.meta.url);

const wsBaseUrl = process.env.TTS_WS_URL ?? 'ws://localhost:3000/ws';
const apiKey = process.env.TTS_API_KEY ?? process.env.ADMIN_API_KEY ?? 'dev';
const outFile = path.resolve(process.cwd(), 'ws-test.wav');

async function run(): Promise<void> {
  console.log(`Connecting to ${wsBaseUrl}...`);

  const wsUrl = wsBaseUrl.includes('?')
    ? `${wsBaseUrl}&api_key=${apiKey}`
    : `${wsBaseUrl}?api_key=${apiKey}`;

  let meta: { sample_rate?: number; format?: string } | null = null;
  const audioParts: Buffer[] = [];

  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for audio')), 20000);

    ws.on('open', () => {
      console.log('WS connected, sending speak command...');
      ws.send(
        JSON.stringify({
          type: 'speak',
          text: 'Hello from the WebSocket audio test.',
          engine: process.env.TTS_ENGINE ?? 'espeak',
          voice: process.env.TTS_VOICE ?? 'en',
          format: process.env.TTS_FORMAT ?? 'wav',
          sample_rate: Number(process.env.TTS_SAMPLE_RATE ?? 24000),
          stream: true,
          chunk_size: 32000,
        })
      );
    });

    ws.on('message', (data) => {
      const asBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
      const asText = asBuffer.toString('utf8');
      let parsed: { type?: string } | null = null;
      try {
        parsed = JSON.parse(asText) as { type?: string };
      } catch {
        // not JSON, treat as audio
      }

      if (parsed && parsed.type === 'meta') {
        meta = parsed as { sample_rate?: number; format?: string };
        console.log('Meta received:', meta);
        return;
      }

      if (parsed && parsed.type === 'end') {
        console.log('End received:', parsed);
        clearTimeout(timeout);
        ws.close();
        resolve();
        return;
      }

      if (parsed && parsed.type) {
        console.log('Non-audio JSON message:', parsed);
        return;
      }

      audioParts.push(asBuffer);
      console.log(`Received audio buffer: ${asBuffer.length} bytes (total parts: ${audioParts.length})`);
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    ws.on('close', () => {
      if (!audioParts.length) {
        clearTimeout(timeout);
        reject(new Error('WebSocket closed before audio was received'));
      }
    });
  });

  const audio = Buffer.concat(audioParts);
  fs.writeFileSync(outFile, audio);
  console.log(`Saved audio to ${outFile}`);
  if (meta?.sample_rate) {
    console.log(`Sample rate: ${meta.sample_rate} Hz, format: ${meta.format ?? 'unknown'}`);
  }
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exitCode = 1;
});
