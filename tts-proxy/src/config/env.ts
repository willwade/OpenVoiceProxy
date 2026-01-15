/**
 * Environment configuration with Zod validation
 */

import { z } from 'zod';

// Environment schema
const envSchema = z.object({
  // Node environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Server configuration
  PORT: z.coerce.number().min(1).max(65535).default(3000),
  HOST: z.string().default('0.0.0.0'),

  // Authentication
  ADMIN_API_KEY: z.string().optional(),
  API_KEY_REQUIRED: z
    .string()
    .transform((v) => v === 'true' || v === '1')
    .default('false'),
  LOCAL_MODE: z
    .string()
    .transform((v) => v === 'true' || v === '1')
    .default('false'),

  // Database
  DATABASE_URL: z.string().url().optional(),

  // CORS
  CORS_ORIGIN: z.string().default('*'),

  // Rate limiting
  RATE_LIMIT_REQUESTS: z.coerce.number().min(1).default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().min(1000).default(60000),

  // Request limits
  MAX_REQUEST_SIZE: z.string().default('10mb'),

  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  LOG_TO_CONSOLE: z
    .string()
    .transform((v) => v === 'true' || v === '1')
    .default('true'),
  LOG_TO_FILE: z
    .string()
    .transform((v) => v === 'true' || v === '1')
    .default('false'),
  LOG_DIR: z.string().default('./logs'),
  OPENVOICEPROXY_DATA_DIR: z.string().optional(),
  DATA_DIR: z.string().optional(),

  // TTS Engine credentials (all optional)
  AZURE_SPEECH_KEY: z.string().optional(),
  AZURE_SPEECH_REGION: z.string().optional(),
  ELEVENLABS_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  GOOGLE_APPLICATION_CREDENTIALS_JSON: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION: z.string().default('us-east-1'),
  WATSON_API_KEY: z.string().optional(),
  WATSON_SERVICE_URL: z.string().optional(),
  PLAYHT_API_KEY: z.string().optional(),
  PLAYHT_USER_ID: z.string().optional(),
  WITAI_API_KEY: z.string().optional(),

  // ESP32 defaults
  ESP32_DEFAULT_ENGINE: z.string().default('espeak'),
  ESP32_DEFAULT_VOICE: z.string().default('en'),
  ESP32_DEFAULT_SAMPLE_RATE: z.coerce.number().default(16000),

  // Audio defaults
  AUDIO_FORMAT: z.enum(['mp3', 'wav', 'pcm', 'ogg']).default('wav'),
  CACHE_ENABLED: z
    .string()
    .transform((v) => v === 'true' || v === '1')
    .default('false'),

  // Security
  TRUSTED_PROXIES: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

/**
 * Parse and validate environment variables
 */
export function parseEnv(): Env {
  if (cachedEnv) {
    return cachedEnv;
  }

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.errors
      .map((e) => `  ${e.path.join('.')}: ${e.message}`)
      .join('\n');
    throw new Error(`Environment validation failed:\n${errors}`);
  }

  cachedEnv = result.data;
  return cachedEnv;
}

/**
 * Get validated environment (throws if invalid)
 */
export function getEnv(): Env {
  return parseEnv();
}

/**
 * Check if running in production mode
 */
export function isProduction(): boolean {
  return getEnv().NODE_ENV === 'production';
}

/**
 * Check if running in development mode
 */
export function isDevelopment(): boolean {
  return getEnv().NODE_ENV === 'development';
}

/**
 * Check if authentication is required
 */
export function isAuthRequired(): boolean {
  const env = getEnv();
  // Auth is required if:
  // 1. API_KEY_REQUIRED is explicitly true, OR
  // 2. We're in production mode AND not in LOCAL_MODE
  return env.API_KEY_REQUIRED || (isProduction() && !env.LOCAL_MODE);
}

/**
 * Get engine credentials from environment
 */
export function getEngineCredentials(engine: string): Record<string, string> {
  const env = getEnv();
  const credentials: Record<string, string> = {};

  switch (engine) {
    case 'azure':
      if (env.AZURE_SPEECH_KEY) credentials['AZURE_SPEECH_KEY'] = env.AZURE_SPEECH_KEY;
      if (env.AZURE_SPEECH_REGION) credentials['AZURE_SPEECH_REGION'] = env.AZURE_SPEECH_REGION;
      break;
    case 'elevenlabs':
      if (env.ELEVENLABS_API_KEY) credentials['ELEVENLABS_API_KEY'] = env.ELEVENLABS_API_KEY;
      break;
    case 'openai':
      if (env.OPENAI_API_KEY) credentials['OPENAI_API_KEY'] = env.OPENAI_API_KEY;
      break;
    case 'google':
      if (env.GOOGLE_API_KEY) credentials['GOOGLE_API_KEY'] = env.GOOGLE_API_KEY;
      if (env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
        credentials['GOOGLE_APPLICATION_CREDENTIALS_JSON'] = env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
      }
      break;
    case 'polly':
      if (env.AWS_ACCESS_KEY_ID) credentials['AWS_ACCESS_KEY_ID'] = env.AWS_ACCESS_KEY_ID;
      if (env.AWS_SECRET_ACCESS_KEY) credentials['AWS_SECRET_ACCESS_KEY'] = env.AWS_SECRET_ACCESS_KEY;
      if (env.AWS_REGION) credentials['AWS_REGION'] = env.AWS_REGION;
      break;
    case 'watson':
      if (env.WATSON_API_KEY) credentials['WATSON_API_KEY'] = env.WATSON_API_KEY;
      if (env.WATSON_SERVICE_URL) credentials['WATSON_SERVICE_URL'] = env.WATSON_SERVICE_URL;
      break;
    case 'playht':
      if (env.PLAYHT_API_KEY) credentials['PLAYHT_API_KEY'] = env.PLAYHT_API_KEY;
      if (env.PLAYHT_USER_ID) credentials['PLAYHT_USER_ID'] = env.PLAYHT_USER_ID;
      break;
    case 'witai':
      if (env.WITAI_API_KEY) credentials['WITAI_API_KEY'] = env.WITAI_API_KEY;
      break;
  }

  return credentials;
}

/**
 * Check if engine has credentials configured
 */
export function hasEngineCredentials(engine: string): boolean {
  const credentials = getEngineCredentials(engine);
  return Object.keys(credentials).length > 0;
}
