/**
 * Zod Validation Schemas
 * Reusable validation schemas for API requests
 */

import { z } from 'zod';
import type { EngineType } from '../../../types/engine.types.js';

// Voice settings schema (ElevenLabs compatible)
export const voiceSettingsSchema = z.object({
  stability: z.number().min(0).max(1).optional(),
  similarity_boost: z.number().min(0).max(1).optional(),
  style: z.number().min(0).max(1).optional(),
  use_speaker_boost: z.boolean().optional(),
  speed: z.number().min(0.25).max(4).optional(),
  pitch: z.number().min(-20).max(20).optional(),
});

// Text-to-speech request body
export const ttsRequestSchema = z.object({
  text: z.string().min(1).max(10000),
  model_id: z.string().optional(),
  voice_settings: voiceSettingsSchema.optional(),
  output_format: z
    .enum(['mp3_44100_128', 'mp3_44100_96', 'pcm_16000', 'pcm_22050', 'pcm_24000', 'pcm_44100'])
    .optional(),
  optimize_streaming_latency: z.number().min(0).max(4).optional(),
});

// API key creation
export const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  isAdmin: z.boolean().optional().default(false),
  rateLimit: z.number().min(1).max(10000).optional().default(100),
  expiresAt: z.string().datetime().optional(),
});

// API key update
export const updateApiKeySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  isAdmin: z.boolean().optional(),
  active: z.boolean().optional(),
  rateLimit: z.number().min(1).max(10000).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

// Engine configuration
export const engineConfigSchema = z.record(
  z.object({
    enabled: z.boolean(),
    useCustomCredentials: z.boolean().optional(),
    credentials: z.record(z.string()).optional(),
  })
);

// Credentials
export const credentialsSchema = z.object({
  credentials: z.record(z.string()),
});

// ESP32 speak request
export const esp32SpeakSchema = z.object({
  text: z.string().min(1).max(2000),
  engine: z.string().optional(),
  voice: z.string().optional(),
  format: z.enum(['pcm16', 'wav', 'mp3']).optional().default('pcm16'),
  sample_rate: z.number().min(8000).max(48000).optional(),
  ssml: z.boolean().optional().default(false),
});

// WebSocket message
export const wsSpeechMessageSchema = z.object({
  type: z.literal('speech'),
  data: z.object({
    text: z.string().min(1).max(10000),
    voiceId: z.string(),
    engine: z.string().optional(),
    format: z.enum(['mp3', 'wav', 'pcm', 'ogg', 'opus']).optional(),
  }),
});

// Query parameters
export const paginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

// Engine type validation
export const engineTypeSchema = z.enum([
  'espeak',
  'azure',
  'elevenlabs',
  'openai',
  'google',
  'polly',
  'watson',
  'playht',
  'witai',
  'sherpaonnx',
] as const) satisfies z.ZodType<EngineType>;

// Audio format validation
export const audioFormatSchema = z.enum(['mp3', 'wav', 'pcm', 'ogg', 'opus']);

// Type exports from schemas
export type VoiceSettingsInput = z.infer<typeof voiceSettingsSchema>;
export type TTSRequestInput = z.infer<typeof ttsRequestSchema>;
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
export type UpdateApiKeyInput = z.infer<typeof updateApiKeySchema>;
export type EngineConfigInput = z.infer<typeof engineConfigSchema>;
export type ESP32SpeakInput = z.infer<typeof esp32SpeakSchema>;
export type WSSpeechMessageInput = z.infer<typeof wsSpeechMessageSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
