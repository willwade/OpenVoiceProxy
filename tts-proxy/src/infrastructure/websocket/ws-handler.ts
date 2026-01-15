/**
 * WebSocket Handler for ESP32/Embedded Devices
 * Provides real-time TTS streaming over WebSocket
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { Server } from 'http';
import type { TTSEngineFactoryPort } from '../../application/ports/tts-engine-port.js';
import type { KeyRepositoryPort } from '../../application/ports/key-repository-port.js';
import type { EngineType } from '../../types/engine.types.js';
import { getEnv } from '../../config/env.js';

interface WSCommand {
  type?: 'speak' | 'voices' | 'engines';
  text?: string;
  voice?: string;
  engine?: string;
  format?: 'pcm16' | 'wav' | 'mp3';
  sample_rate?: number;
  ssml?: boolean;
  stream?: boolean;
  chunk_size?: number;
}

interface WSDependencies {
  engineFactory: TTSEngineFactoryPort;
  keyRepository: KeyRepositoryPort;
}

let deps: WSDependencies | null = null;

export function setWebSocketDependencies(dependencies: WSDependencies): void {
  deps = dependencies;
}

export function setupWebSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({
    server,
    path: '/ws'
  });

  wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    // Authenticate the connection
    const authenticated = await authenticateWebSocket(ws, req);
    if (!authenticated) {
      return;
    }

    console.log('[WS] Client connected and authenticated');

    ws.on('message', async (message: Buffer | string) => {
      try {
        const data = message.toString();
        let command: WSCommand;

        try {
          command = JSON.parse(data);
        } catch {
          sendError(ws, 'Invalid JSON', 'INVALID_JSON');
          return;
        }

        // Handle different command types
        const type = command.type ?? 'speak';

        switch (type) {
          case 'speak':
            await handleSpeak(ws, command);
            break;
          case 'voices':
            await handleVoices(ws);
            break;
          case 'engines':
            await handleEngines(ws);
            break;
          default:
            sendError(ws, 'Unknown command type', 'UNKNOWN_COMMAND');
        }
      } catch (error) {
        console.error('[WS] Message handling error:', error);
        sendError(ws, error instanceof Error ? error.message : 'Internal error', 'INTERNAL_ERROR');
      }
    });

    ws.on('close', () => {
      console.log('[WS] Client disconnected');
    });

    ws.on('error', (error) => {
      console.error('[WS] Error:', error);
    });
  });

  console.log('[WS] WebSocket server initialized on /ws');
  return wss;
}

async function authenticateWebSocket(ws: WebSocket, req: IncomingMessage): Promise<boolean> {
  if (!deps) {
    sendError(ws, 'Service not initialized', 'SERVICE_UNAVAILABLE');
    ws.close();
    return false;
  }

  const env = getEnv();

  // Skip auth in development mode if API key not required
  if (env.NODE_ENV === 'development' && !env.API_KEY_REQUIRED) {
    return true;
  }

  // Get API key from query string or headers
  const url = new URL(req.url ?? '', `http://${req.headers.host}`);
  const apiKey = url.searchParams.get('api_key') ??
                 url.searchParams.get('key') ??
                 req.headers['x-api-key'] as string ??
                 req.headers['xi-api-key'] as string;

  if (!apiKey) {
    sendError(ws, 'API key required', 'AUTH_REQUIRED');
    ws.close();
    return false;
  }

  // Validate API key
  const keyData = await deps.keyRepository.findByKey(apiKey);
  if (!keyData || !keyData.active) {
    sendError(ws, 'Invalid API key', 'INVALID_KEY');
    ws.close();
    return false;
  }

  return true;
}

async function handleSpeak(ws: WebSocket, command: WSCommand): Promise<void> {
  if (!deps) {
    sendError(ws, 'Service not initialized', 'SERVICE_UNAVAILABLE');
    return;
  }

  const env = getEnv();
  const {
    text,
    voice = env.ESP32_DEFAULT_VOICE,
    engine = env.ESP32_DEFAULT_ENGINE,
    format = 'pcm16',
    sample_rate = env.ESP32_DEFAULT_SAMPLE_RATE,
    stream = false,
    chunk_size = 32000,
  } = command;

  // Validate text
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    sendError(ws, 'Missing or empty "text" field', 'INVALID_TEXT');
    return;
  }

  const maxLength = 500; // Max text length for embedded devices
  if (text.length > maxLength) {
    sendError(ws, `Text exceeds maximum length of ${maxLength} characters`, 'TEXT_TOO_LONG');
    return;
  }

  console.log(`[WS] Speak request: engine=${engine}, voice=${voice}, format=${format}, len=${text.length}`);

  try {
    // Get engine
    const ttsEngine = await deps.engineFactory.createEngine(engine as EngineType);

    // Determine output format for engine
    let outputFormat: 'wav' | 'mp3' | 'pcm' = format === 'mp3' ? 'mp3' : 'wav';

    // Synthesize
    const result = await ttsEngine.synthesize({
      text,
      voiceId: voice,
      outputFormat,
      sampleRate: sample_rate,
    });

    let audioData = result.audio;
    let actualSampleRate = sample_rate;

    // Extract PCM if requested
    if (format === 'pcm16' && outputFormat === 'wav') {
      const pcmResult = extractPCM(audioData);
      audioData = pcmResult.pcm;
      actualSampleRate = pcmResult.sampleRate ?? sample_rate;
    }

    // Send metadata
    sendJson(ws, {
      type: 'meta',
      format,
      sample_rate: actualSampleRate,
      engine,
      voice,
      bytes: audioData.length,
      stream,
      chunk_size: stream ? chunk_size : undefined,
      chunks: stream ? Math.ceil(audioData.length / chunk_size) : 1,
    });

    // Send audio data
    if (stream) {
      // Send in chunks
      let offset = 0;
      let chunksSent = 0;

      while (offset < audioData.length && ws.readyState === WebSocket.OPEN) {
        const end = Math.min(offset + chunk_size, audioData.length);
        const chunk = audioData.subarray(offset, end);
        ws.send(chunk);
        chunksSent++;
        offset = end;
      }

      // Send end message
      sendJson(ws, {
        type: 'end',
        bytes: audioData.length,
        chunks: chunksSent,
      });
    } else {
      // Send all at once
      ws.send(audioData);

      sendJson(ws, {
        type: 'end',
        bytes: audioData.length,
        chunks: 1,
      });
    }
  } catch (error) {
    console.error('[WS] Speak error:', error);
    sendError(ws, error instanceof Error ? error.message : 'Speech generation failed', 'SPEECH_FAILED');
  }
}

async function handleVoices(ws: WebSocket): Promise<void> {
  if (!deps) {
    sendError(ws, 'Service not initialized', 'SERVICE_UNAVAILABLE');
    return;
  }

  const voices: Array<{ id: string; name: string; engine: string; language: string }> = [];

  for (const engineId of deps.engineFactory.getAvailableEngines()) {
    try {
      const engine = await deps.engineFactory.createEngine(engineId);
      const engineVoices = await engine.getVoices();

      for (const voice of engineVoices) {
        voices.push({
          id: voice.id,
          name: voice.name,
          engine: voice.engine,
          language: voice.languageCode,
        });
      }
    } catch {
      // Skip unavailable engines
    }
  }

  sendJson(ws, {
    type: 'voices',
    voices,
    count: voices.length,
  });
}

async function handleEngines(ws: WebSocket): Promise<void> {
  if (!deps) {
    sendError(ws, 'Service not initialized', 'SERVICE_UNAVAILABLE');
    return;
  }

  const engines: Array<{ id: string; available: boolean; voiceCount: number }> = [];

  for (const engineId of deps.engineFactory.getAvailableEngines()) {
    try {
      const engine = await deps.engineFactory.createEngine(engineId);
      const status = engine.getStatus();

      engines.push({
        id: engineId,
        available: status.available,
        voiceCount: status.voiceCount,
      });
    } catch {
      engines.push({
        id: engineId,
        available: false,
        voiceCount: 0,
      });
    }
  }

  sendJson(ws, {
    type: 'engines',
    engines,
    count: engines.length,
  });
}

function sendJson(ws: WebSocket, data: object): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function sendError(ws: WebSocket, message: string, code: string): void {
  sendJson(ws, { error: message, code });
}

/**
 * Extract PCM data from WAV buffer
 */
function extractPCM(wavBuffer: Buffer): { pcm: Buffer; sampleRate?: number } {
  // WAV header is typically 44 bytes
  // Check for RIFF header
  if (wavBuffer.length < 44) {
    return { pcm: wavBuffer };
  }

  const riff = wavBuffer.toString('ascii', 0, 4);
  if (riff !== 'RIFF') {
    return { pcm: wavBuffer };
  }

  // Find 'data' chunk
  let offset = 12; // Skip RIFF header
  let sampleRate: number | undefined;

  while (offset < wavBuffer.length - 8) {
    const chunkId = wavBuffer.toString('ascii', offset, offset + 4);
    const chunkSize = wavBuffer.readUInt32LE(offset + 4);

    if (chunkId === 'fmt ') {
      // Read sample rate from fmt chunk
      if (offset + 12 <= wavBuffer.length) {
        sampleRate = wavBuffer.readUInt32LE(offset + 12);
      }
    }

    if (chunkId === 'data') {
      // Found data chunk - return PCM data
      const dataStart = offset + 8;
      const dataEnd = Math.min(dataStart + chunkSize, wavBuffer.length);
      return {
        pcm: wavBuffer.subarray(dataStart, dataEnd),
        sampleRate,
      };
    }

    offset += 8 + chunkSize;
  }

  // Fallback: skip standard 44-byte header
  return {
    pcm: wavBuffer.subarray(44),
    sampleRate,
  };
}
