/**
 * API request/response types
 */

import type { ApiKey, RateLimitInfo } from './api-key.types.js';
import type { EngineType, EngineStatus } from './engine.types.js';
import type { AudioFormat, VoiceSettings } from './tts.types.js';

// Request context passed through middleware
export interface RequestContext {
  apiKey?: ApiKey;
  isAdmin: boolean;
  isDevMode: boolean;
  isLocalMode: boolean;
  rateLimitInfo?: RateLimitInfo;
  requestId: string;
  startTime: number;
}

// Health check response
export interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  version: string;
  uptime: number;
  timestamp: string;
  engines: {
    available: string[];
    unavailable: string[];
  };
}

// Readiness check response
export interface ReadyResponse {
  ready: boolean;
  checks: {
    database: boolean;
    engines: boolean;
  };
}

// Metrics response
export interface MetricsResponse {
  requests: {
    total: number;
    success: number;
    errors: number;
  };
  latency: {
    avg: number;
    p50: number;
    p95: number;
    p99: number;
  };
  engines: Record<string, {
    requests: number;
    errors: number;
    avgLatency: number;
  }>;
}

// TTS API request body
export interface TTSRequestBody {
  text: string;
  model_id?: string;
  voice_settings?: VoiceSettings;
  output_format?: AudioFormat;
  optimize_streaming_latency?: number;
}

// Admin API types
export interface AdminKeyCreateRequest {
  name: string;
  isAdmin?: boolean;
  rateLimit?: number;
  expiresAt?: string;
}

export interface AdminKeyUpdateRequest {
  name?: string;
  isAdmin?: boolean;
  active?: boolean;
  rateLimit?: number;
  expiresAt?: string | null;
}

export interface AdminKeyResponse {
  id: string;
  name: string;
  keySuffix: string;
  isAdmin: boolean;
  active: boolean;
  createdAt: string;
  lastUsed: string | null;
  requestCount: number;
  expiresAt: string | null;
  key?: string; // Only on creation
}

export interface AdminKeysListResponse {
  keys: AdminKeyResponse[];
  total: number;
}

export interface AdminEngineConfigRequest {
  [engineId: string]: {
    enabled: boolean;
    useCustomCredentials?: boolean;
    credentials?: Record<string, string>;
  };
}

export interface AdminEnginesStatusResponse {
  engines: Record<EngineType, EngineStatus>;
  timestamp: string;
}

export interface AdminCredentialsRequest {
  credentials: Record<string, string>;
}

export interface AdminCredentialsTestResponse {
  valid: boolean; // For frontend compatibility
  success: boolean;
  engine: string;
  message: string;
  voiceCount?: number;
}

export interface AdminUsageResponse {
  totalRequests: number;
  byKey: Record<string, number>;
  byEngine: Record<string, number>;
  byPath: Record<string, number>;
  period: {
    start: string;
    end: string;
  };
}

export interface AdminModeResponse {
  mode: 'development' | 'production';
  requiresAuth: boolean;
  isDevelopmentMode?: boolean; // For frontend compatibility
  localMode?: boolean;
}

// ESP32 endpoint types
export interface ESP32SpeakRequest {
  text: string;
  engine?: EngineType;
  voice?: string;
  format?: 'pcm16' | 'wav' | 'mp3';
  sample_rate?: number;
  ssml?: boolean;
}

export interface ESP32SpeakResponse {
  audio: Buffer;
  headers: {
    'Content-Type': string;
    'X-Audio-Format': string;
    'X-Sample-Rate': string;
    'X-Channels': string;
    'X-Bit-Depth': string;
    'X-Duration-Ms'?: string;
  };
}

// Error response types
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  requestId?: string;
}

export interface ValidationErrorResponse extends ErrorResponse {
  error: {
    code: 'VALIDATION_ERROR';
    message: string;
    details: {
      fields: Array<{
        field: string;
        message: string;
      }>;
    };
  };
}

// WebSocket message types
export interface WSMessage {
  type: 'speech' | 'chunk' | 'error' | 'done' | 'ping' | 'pong';
  data?: unknown;
  error?: string;
}

export interface WSSpeechMessage extends WSMessage {
  type: 'speech';
  data: {
    text: string;
    voiceId: string;
    engine?: string;
    format?: AudioFormat;
  };
}

export interface WSChunkMessage extends WSMessage {
  type: 'chunk';
  data: {
    audio: string; // base64 encoded
    isFinal: boolean;
  };
}

export interface WSErrorMessage extends WSMessage {
  type: 'error';
  error: string;
  code?: string;
}

export interface WSDoneMessage extends WSMessage {
  type: 'done';
  data: {
    characterCount: number;
    duration?: number;
  };
}
