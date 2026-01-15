/**
 * ESP32/Embedded Device Routes
 * Simple REST API for embedded devices
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { TTSEngineFactoryPort } from '../../../application/ports/tts-engine-port.js';
import type { EngineType } from '../../../types/engine.types.js';
import { getEnv } from '../../../config/env.js';

// Dependencies
let engineFactory: TTSEngineFactoryPort | null = null;

export function setEsp32Dependencies(deps: {
  engineFactory?: TTSEngineFactoryPort;
}): void {
  if (deps.engineFactory) {
    engineFactory = deps.engineFactory;
  }
}

// Request validation schema
const speakSchema = z.object({
  text: z.string().min(1).max(2000),
  engine: z.string().optional(),
  voice: z.string().optional(),
  format: z.enum(['pcm16', 'wav', 'mp3']).optional().default('pcm16'),
  sample_rate: z.number().min(8000).max(48000).optional(),
  ssml: z.boolean().optional().default(false),
});

export function createEsp32Routes(): Hono {
  const routes = new Hono();

  /**
   * Text to speech for embedded devices
   * POST /api/speak
   *
   * Returns raw audio data with metadata headers
   */
  routes.post('/speak', zValidator('json', speakSchema), async (c) => {
    const body = c.req.valid('json');
    const env = getEnv();

    if (!engineFactory) {
      return c.json(
        { error: { code: 'SERVICE_UNAVAILABLE', message: 'TTS service not initialized' } },
        503
      );
    }

    // Use defaults from environment
    const engineId = (body.engine ?? env.ESP32_DEFAULT_ENGINE) as EngineType;
    const voiceId = body.voice ?? env.ESP32_DEFAULT_VOICE;
    const sampleRate = body.sample_rate ?? env.ESP32_DEFAULT_SAMPLE_RATE;

    try {
      // Get engine
      const engine = await engineFactory.createEngine(engineId);

      // Determine output format
      let outputFormat: 'wav' | 'mp3' | 'pcm';
      switch (body.format) {
        case 'pcm16':
          outputFormat = 'pcm';
          break;
        case 'wav':
          outputFormat = 'wav';
          break;
        case 'mp3':
          outputFormat = 'mp3';
          break;
        default:
          outputFormat = 'pcm';
      }

      // Synthesize
      const result = await engine.synthesize({
        text: body.text,
        voiceId,
        outputFormat,
        sampleRate,
      });

      // Set headers with audio metadata
      c.header('Content-Type', getContentType(body.format));
      c.header('X-Audio-Format', body.format);
      c.header('X-Sample-Rate', String(sampleRate));
      c.header('X-Channels', '1'); // Mono for embedded devices
      c.header('X-Bit-Depth', '16');
      c.header('X-Character-Count', String(result.characterCount));

      if (result.duration) {
        c.header('X-Duration-Ms', String(Math.round(result.duration * 1000)));
      }

      return new Response(result.audio, {
        headers: c.res.headers,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return c.json(
        { error: { code: 'SPEECH_GENERATION_FAILED', message } },
        500
      );
    }
  });

  /**
   * Get available voices (simplified for embedded devices)
   * GET /api/voices
   */
  routes.get('/voices', async (c) => {
    if (!engineFactory) {
      return c.json(
        { error: { code: 'SERVICE_UNAVAILABLE', message: 'TTS service not initialized' } },
        503
      );
    }

    const voices: Array<{
      id: string;
      name: string;
      engine: string;
      language: string;
    }> = [];

    for (const engineId of engineFactory.getAvailableEngines()) {
      try {
        const engine = await engineFactory.createEngine(engineId);
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

    return c.json({ voices, count: voices.length });
  });

  /**
   * Get available engines
   * GET /api/engines
   */
  routes.get('/engines', async (c) => {
    if (!engineFactory) {
      return c.json(
        { error: { code: 'SERVICE_UNAVAILABLE', message: 'TTS service not initialized' } },
        503
      );
    }

    const engines: Array<{
      id: string;
      available: boolean;
      voiceCount: number;
    }> = [];

    for (const engineId of engineFactory.getAvailableEngines()) {
      try {
        const engine = await engineFactory.createEngine(engineId);
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

    return c.json({ engines, count: engines.length });
  });

  /**
   * Ping endpoint for connectivity check
   * GET /api/ping
   */
  routes.get('/ping', (c) => {
    return c.json({
      status: 'ok',
      timestamp: Date.now(),
    });
  });

  return routes;
}

function getContentType(format: string): string {
  switch (format) {
    case 'pcm16':
      return 'audio/pcm';
    case 'wav':
      return 'audio/wav';
    case 'mp3':
      return 'audio/mpeg';
    default:
      return 'application/octet-stream';
  }
}
