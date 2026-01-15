/**
 * TTS Routes
 * ElevenLabs-compatible API endpoints
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type {
  ElevenLabsVoicesResponse,
  ElevenLabsModel,
  ElevenLabsUser,
} from '../../../types/tts.types.js';
import type { TTSEngineFactoryPort } from '../../../application/ports/tts-engine-port.js';
import { VoiceCollection } from '../../../domain/entities/voice.js';

// Dependencies - set during server initialization
let engineFactory: TTSEngineFactoryPort | null = null;
let voiceCache: VoiceCollection | null = null;

export function setTtsDependencies(deps: {
  engineFactory?: TTSEngineFactoryPort;
}): void {
  if (deps.engineFactory) {
    engineFactory = deps.engineFactory;
  }
}

// Request validation schemas
const textToSpeechBodySchema = z.object({
  text: z.string().min(1).max(10000),
  model_id: z.string().optional(),
  voice_settings: z
    .object({
      stability: z.number().min(0).max(1).optional(),
      similarity_boost: z.number().min(0).max(1).optional(),
      style: z.number().min(0).max(1).optional(),
      use_speaker_boost: z.boolean().optional(),
      speed: z.number().min(0.25).max(4).optional(),
      pitch: z.number().min(-20).max(20).optional(),
    })
    .optional(),
  output_format: z.enum(['mp3_44100_128', 'mp3_44100_96', 'pcm_16000', 'pcm_22050', 'pcm_24000', 'pcm_44100']).optional(),
});

export function createTtsRoutes(): Hono {
  const routes = new Hono();

  /**
   * Get all voices
   * GET /v1/voices
   */
  routes.get('/voices', async (c) => {
    // Build voice list from all available engines
    if (!voiceCache) {
      voiceCache = new VoiceCollection();

      if (engineFactory) {
        for (const engineId of engineFactory.getAvailableEngines()) {
          try {
            const engine = await engineFactory.createEngine(engineId);
            // Wrap getVoices in additional try-catch for engines that throw during voice fetching
            try {
              const voices = await engine.getVoices();
              for (const voice of voices) {
                voiceCache.add(voice);
              }
            } catch (voiceError) {
              console.warn(`Failed to get voices from ${engineId}:`, voiceError instanceof Error ? voiceError.message : voiceError);
            }
          } catch (error) {
            console.warn(`Failed to initialize engine ${engineId}:`, error instanceof Error ? error.message : error);
          }
        }
      }
    }

    const response: ElevenLabsVoicesResponse = voiceCache.toElevenLabsFormat();
    return c.json(response);
  });

  /**
   * Get voice by ID
   * GET /v1/voices/:voiceId
   */
  routes.get('/voices/:voiceId', async (c) => {
    const voiceId = c.req.param('voiceId');

    if (!voiceCache) {
      // Trigger cache build
      await fetch(`${c.req.url.replace(/\/voices\/.*/, '/voices')}`);
    }

    const voice = voiceCache?.get(voiceId);
    if (!voice) {
      return c.json(
        { error: { code: 'VOICE_NOT_FOUND', message: `Voice not found: ${voiceId}` } },
        404
      );
    }

    return c.json(voice.toElevenLabsFormat());
  });

  /**
   * Text to speech
   * POST /v1/text-to-speech/:voiceId
   */
  routes.post(
    '/text-to-speech/:voiceId',
    zValidator('json', textToSpeechBodySchema),
    async (c) => {
      const voiceId = c.req.param('voiceId');
      const body = c.req.valid('json');

      if (!engineFactory) {
        return c.json(
          { error: { code: 'SERVICE_UNAVAILABLE', message: 'TTS service not initialized' } },
          503
        );
      }

      // Find the voice
      if (!voiceCache) {
        voiceCache = new VoiceCollection();
        for (const engineId of engineFactory.getAvailableEngines()) {
          try {
            const engine = await engineFactory.createEngine(engineId);
            const voices = await engine.getVoices();
            for (const voice of voices) {
              voiceCache.add(voice);
            }
          } catch {
            // Ignore engine errors during voice loading
          }
        }
      }

      const voice = voiceCache.get(voiceId);
      if (!voice) {
        return c.json(
          { error: { code: 'VOICE_NOT_FOUND', message: `Voice not found: ${voiceId}` } },
          404
        );
      }

      // Get the engine for this voice
      const engine = await engineFactory.createEngine(voice.engine);

      // Synthesize
      const result = await engine.synthesize({
        text: body.text,
        voiceId: voice.nativeVoiceId,
        voiceSettings: body.voice_settings,
        outputFormat: body.output_format?.startsWith('mp3') ? 'mp3' : 'wav',
      });

      // Return audio
      c.header('Content-Type', `audio/${result.format}`);
      c.header('X-Audio-Format', result.format);
      c.header('X-Sample-Rate', String(result.sampleRate));
      c.header('X-Character-Count', String(result.characterCount));

      return new Response(result.audio, {
        headers: c.res.headers,
      });
    }
  );

  /**
   * Text to speech with timestamps
   * POST /v1/text-to-speech/:voiceId/stream/with-timestamps
   */
  routes.post(
    '/text-to-speech/:voiceId/stream/with-timestamps',
    zValidator('json', textToSpeechBodySchema),
    async (c) => {
      // This endpoint is for ElevenLabs compatibility
      // Most engines don't support timestamps, so we'll return a basic response
      const voiceId = c.req.param('voiceId');
      const body = c.req.valid('json');

      if (!engineFactory) {
        return c.json(
          { error: { code: 'SERVICE_UNAVAILABLE', message: 'TTS service not initialized' } },
          503
        );
      }

      // Find voice and synthesize (same as above, but return with empty alignment)
      if (!voiceCache) {
        voiceCache = new VoiceCollection();
        for (const engineId of engineFactory.getAvailableEngines()) {
          try {
            const engine = await engineFactory.createEngine(engineId);
            const voices = await engine.getVoices();
            for (const voice of voices) {
              voiceCache.add(voice);
            }
          } catch {
            // Ignore
          }
        }
      }

      const voice = voiceCache.get(voiceId);
      if (!voice) {
        return c.json(
          { error: { code: 'VOICE_NOT_FOUND', message: `Voice not found: ${voiceId}` } },
          404
        );
      }

      const engine = await engineFactory.createEngine(voice.engine);
      const result = await engine.synthesize({
        text: body.text,
        voiceId: voice.nativeVoiceId,
        voiceSettings: body.voice_settings,
        outputFormat: body.output_format?.startsWith('mp3') ? 'mp3' : 'wav',
      });

      // Return as JSON with audio base64 encoded
      return c.json({
        audio_base64: result.audio.toString('base64'),
        alignment: {
          characters: [],
          character_start_times_seconds: [],
          character_end_times_seconds: [],
        },
        normalized_alignment: {
          characters: [],
          character_start_times_seconds: [],
          character_end_times_seconds: [],
        },
      });
    }
  );

  /**
   * Get available models
   * GET /v1/models
   */
  routes.get('/models', async (c) => {
    const models: ElevenLabsModel[] = [
      {
        model_id: 'eleven_multilingual_v2',
        name: 'Eleven Multilingual v2',
        can_be_finetuned: false,
        can_do_text_to_speech: true,
        can_do_voice_conversion: false,
        can_use_style: true,
        can_use_speaker_boost: true,
        serves_pro_voices: false,
        token_cost_factor: 1,
        description: 'Default model (proxied through OpenVoiceProxy)',
        requires_alpha_access: false,
        max_characters_request_free_user: 5000,
        max_characters_request_subscribed_user: 10000,
        maximum_text_length_per_request: 10000,
        languages: [
          { language_id: 'en', name: 'English' },
          { language_id: 'es', name: 'Spanish' },
          { language_id: 'fr', name: 'French' },
          { language_id: 'de', name: 'German' },
        ],
      },
    ];

    return c.json(models);
  });

  /**
   * Get user info
   * GET /v1/user
   */
  routes.get('/user', async (c) => {
    const ctx = c.get('requestContext');

    const response: ElevenLabsUser = {
      subscription: {
        tier: ctx.isAdmin ? 'admin' : 'free',
        character_count: 0,
        character_limit: ctx.isAdmin ? 1000000 : 10000,
        can_extend_character_limit: false,
        allowed_to_extend_character_limit: false,
        next_character_count_reset_unix: Math.floor(Date.now() / 1000) + 86400 * 30,
        voice_limit: 100,
        max_voice_add_edits: 10,
        voice_add_edit_counter: 0,
        professional_voice_limit: 0,
        can_extend_voice_limit: false,
        can_use_instant_voice_cloning: false,
        can_use_professional_voice_cloning: false,
        currency: 'usd',
        status: 'active',
      },
      is_new_user: false,
      xi_api_key: ctx.apiKey?.keySuffix ?? '****',
      can_use_delayed_payment_methods: false,
      is_onboarding_completed: true,
      first_name: 'OpenVoiceProxy User',
    };

    return c.json(response);
  });

  return routes;
}

/**
 * Clear the voice cache (useful after engine configuration changes)
 */
export function clearVoiceCache(): void {
  voiceCache = null;
}
