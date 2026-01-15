import WebSocket from 'ws';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { loadEnv } from './load-env.js';

/**
 * Test script to validate the WebSocket API used by CallTTS.exe.
 */

loadEnv(import.meta.url);

const config = {
  serverUrl: process.env.TTS_WS_URL ?? 'ws://localhost:3000/ws',
  apiKey: process.env.TTS_API_KEY ?? process.env.ADMIN_API_KEY ?? 'dev',
  engine: process.env.TTS_ENGINE ?? 'azure',
  voice: process.env.TTS_VOICE ?? 'en-US-JennyNeural',
  format: process.env.TTS_FORMAT ?? 'wav',
  sampleRate: Number(process.env.TTS_SAMPLE_RATE ?? 24000),
};

const testText =
  process.env.TTS_TEST_TEXT ??
  'Hello, this is a test of the WebSocket API for CallTTS.exe';

console.log('Starting WebSocket test for CallTTS...');
console.log(`Server: ${config.serverUrl}`);
console.log(`Engine: ${config.engine}`);
console.log(`Voice: ${config.voice}`);

let wsUrl = config.serverUrl;
if (wsUrl.includes('?')) {
  wsUrl += `&api_key=${config.apiKey}`;
} else {
  wsUrl += `?api_key=${config.apiKey}`;
}

const ws = new WebSocket(wsUrl);
let audioBuffer = Buffer.alloc(0);
let hasStarted = false;
const startTime = Date.now();

ws.on('open', () => {
  console.log('WebSocket connection established');

  const request = {
    type: 'speak',
    text: testText,
    engine: config.engine,
    voice: config.voice,
    format: config.format,
    sample_rate: config.sampleRate,
  };

  console.log(`Sending request: ${JSON.stringify(request)}`);
  ws.send(JSON.stringify(request));
});

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());
    const type = message.type ?? message.code ?? 'unknown';

    if (type === 'start') {
      hasStarted = true;
      console.log('Started receiving audio data');
    } else if (type === 'meta') {
      console.log(`Metadata: ${JSON.stringify(message)}`);
    } else if (type === 'error' || message.error) {
      console.error(`Server error: ${message.error ?? message.message ?? 'Unknown error'}`);
      ws.close();
      process.exit(1);
    } else if (type === 'end') {
      const duration = Date.now() - startTime;
      console.log(`Finished receiving audio data (${audioBuffer.length} bytes) in ${duration}ms`);

      const filename = `test-cli-audio-${Date.now()}.wav`;
      fs.writeFileSync(filename, audioBuffer);
      console.log(`Audio saved to ${filename}`);

      playAudio(filename);
      ws.close();
    } else if (type) {
      console.log(`Received message: ${type}`);
    }
  } catch {
    if (hasStarted) {
      audioBuffer = Buffer.concat([audioBuffer, Buffer.from(data as Buffer)]);
    }
  }
});

ws.on('error', (error) => {
  console.error(`WebSocket error: ${error.message}`);
  process.exit(1);
});

ws.on('close', (code, reason) => {
  if (!hasStarted) {
    console.error(`WebSocket closed before receiving data: ${code} ${reason}`);
    process.exit(1);
  } else {
    console.log('WebSocket connection closed normally');
  }
});

setTimeout(() => {
  console.error('Test timed out after 30 seconds');
  process.exit(1);
}, 30000);

function playAudio(filename: string): void {
  if (process.platform === 'win32') {
    const command = `powershell -Command "(New-Object Media.SoundPlayer '${filename}').PlaySync();"`;
    console.log(`Playing audio with: ${command}`);

    const child = spawn(command, { shell: true });

    child.on('exit', (code) => {
      console.log(`Audio player exited with code ${code}`);
      try {
        fs.unlinkSync(filename);
        console.log(`Removed temporary file ${filename}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`Failed to remove temp file: ${message}`);
      }
    });

    child.on('error', (error) => {
      console.error(`Failed to play audio: ${error.message}`);
    });
  } else if (process.platform === 'darwin') {
    console.log(`Playing audio with: afplay "${filename}"`);
    spawn(`afplay "${filename}"`, { shell: true });
  } else {
    console.log(`Playing audio with: aplay "${filename}"`);
    spawn(`aplay "${filename}"`, { shell: true });
  }
}
