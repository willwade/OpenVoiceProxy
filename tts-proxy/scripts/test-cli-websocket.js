const WebSocket = require('ws');
const { spawn } = require('child_process');

/**
 * Test script to validate the WebSocket API that will be used by CallTTS.exe
 * This script simulates what the CLI tool will do
 */

// Configuration
const config = {
  serverUrl: 'ws://localhost:3000/api/ws',
  apiKey: 'dev',
  engine: 'azure',
  voice: 'en-US-JennyNeural',
  format: 'wav',
  sampleRate: 24000
};

// Test text
const testText = "Hello, this is a test of the WebSocket API for CallTTS.exe";

console.log('Starting WebSocket test for CallTTS...');
console.log(`Server: ${config.serverUrl}`);
console.log(`Engine: ${config.engine}`);
console.log(`Voice: ${config.voice}`);

// Build WebSocket URL with API key
let wsUrl = config.serverUrl;
if (wsUrl.includes('?')) {
  wsUrl += `&api_key=${config.apiKey}`;
} else {
  wsUrl += `?api_key=${config.apiKey}`;
}

// Create WebSocket connection
const ws = new WebSocket(wsUrl);
let audioBuffer = Buffer.alloc(0);
let hasStarted = false;
let startTime = Date.now();

// Event handlers
ws.on('open', () => {
  console.log('✅ WebSocket connection established');

  // Send TTS request
  const request = {
    type: 'speak',
    text: testText,
    engine: config.engine,
    voice: config.voice,
    format: config.format,
    sampleRate: config.sampleRate
  };

  console.log(`📤 Sending request: ${JSON.stringify(request)}`);
  ws.send(JSON.stringify(request));
});

ws.on('message', (data) => {
  try {
    // Try to parse as JSON
    const message = JSON.parse(data.toString());

    console.log(`📥 Received message: ${message.type}`);

    if (message.type === 'start') {
      hasStarted = true;
      console.log('🔊 Started receiving audio data');
    } else if (message.type === 'metadata') {
      console.log(`📄 Metadata: ${JSON.stringify(message)}`);
    } else if (message.type === 'error') {
      console.error(`❌ Server error: ${message.error}`);
      ws.close();
      process.exit(1);
    } else if (message.type === 'end') {
      const duration = Date.now() - startTime;
      console.log(`✅ Finished receiving audio data (${audioBuffer.length} bytes) in ${duration}ms`);

      // Save audio to file
      const filename = `test-cli-audio-${Date.now()}.wav`;
      require('fs').writeFileSync(filename, audioBuffer);
      console.log(`💾 Audio saved to ${filename}`);

      // Test playing audio (optional)
      playAudio(filename);

      ws.close();
    }
  } catch (e) {
    // Binary data
    if (hasStarted) {
      audioBuffer = Buffer.concat([audioBuffer, data]);
    }
  }
});

ws.on('error', (error) => {
  console.error(`❌ WebSocket error: ${error.message}`);
  process.exit(1);
});

ws.on('close', (code, reason) => {
  if (!hasStarted) {
    console.error(`❌ WebSocket closed before receiving data: ${code} ${reason}`);
    process.exit(1);
  } else {
    console.log('🔌 WebSocket connection closed normally');
  }
});

// Timeout after 30 seconds
setTimeout(() => {
  console.error('❌ Test timed out after 30 seconds');
  process.exit(1);
}, 30000);

// Function to play audio
function playAudio(filename) {
  if (process.platform === 'win32') {
    const command = `powershell -Command "(New-Object Media.SoundPlayer '${filename}').PlaySync();"`;
    console.log(`🎵 Playing audio with: ${command}`);

    const child = spawn(command, { shell: true });

    child.on('exit', (code) => {
      console.log(`🔇 Audio player exited with code ${code}`);

      // Clean up temp file
      try {
        require('fs').unlinkSync(filename);
        console.log(`🗑️ Removed temporary file ${filename}`);
      } catch (error) {
        console.warn(`⚠️ Failed to remove temp file: ${error.message}`);
      }
    });

    child.on('error', (error) => {
      console.error(`❌ Failed to play audio: ${error.message}`);
    });
  } else if (process.platform === 'darwin') {
    console.log(`🎵 Playing audio with: afplay "${filename}"`);
    spawn(`afplay "${filename}"`, { shell: true });
  } else {
    console.log(`🎵 Playing audio with: aplay "${filename}"`);
    spawn(`aplay "${filename}"`, { shell: true });
  }
}
