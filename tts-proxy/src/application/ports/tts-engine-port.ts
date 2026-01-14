/**
 * TTS Engine Port
 * Interface for TTS engine adapters
 */

import type { Voice } from '../../domain/entities/voice.js';
import type { EngineType, EngineCredentials } from '../../types/engine.types.js';
import type {
  SpeechRequest,
  SpeechResponse,
  StreamingChunk,
  TimestampedSpeechResponse,
  AudioFormat,
} from '../../types/tts.types.js';

export interface TTSEnginePort {
  /**
   * Engine identifier
   */
  readonly engineId: EngineType;

  /**
   * Initialize the engine with credentials
   */
  initialize(credentials?: EngineCredentials): Promise<void>;

  /**
   * Check if the engine is available
   */
  isAvailable(): boolean;

  /**
   * Get available voices from this engine
   */
  getVoices(): Promise<Voice[]>;

  /**
   * Generate speech from text
   */
  synthesize(request: SpeechRequest): Promise<SpeechResponse>;

  /**
   * Generate speech with streaming (if supported)
   */
  synthesizeStream?(
    request: SpeechRequest,
    onChunk: (chunk: StreamingChunk) => void
  ): Promise<void>;

  /**
   * Generate speech with timestamps (if supported)
   */
  synthesizeWithTimestamps?(request: SpeechRequest): Promise<TimestampedSpeechResponse>;

  /**
   * Check if streaming is supported
   */
  supportsStreaming(): boolean;

  /**
   * Check if timestamps are supported
   */
  supportsTimestamps(): boolean;

  /**
   * Check if a specific audio format is supported
   */
  supportsFormat(format: AudioFormat): boolean;

  /**
   * Get the default voice for this engine
   */
  getDefaultVoice(): string | null;

  /**
   * Get engine status information
   */
  getStatus(): {
    available: boolean;
    voiceCount: number;
    message: string;
    error?: string;
  };

  /**
   * Cleanup resources
   */
  dispose?(): Promise<void>;
}

/**
 * Factory interface for creating TTS engines
 */
export interface TTSEngineFactoryPort {
  /**
   * Create an engine instance
   */
  createEngine(engineId: EngineType, credentials?: EngineCredentials): Promise<TTSEnginePort>;

  /**
   * Get all available engine IDs
   */
  getAvailableEngines(): EngineType[];

  /**
   * Check if an engine type is supported
   */
  isEngineSupported(engineId: EngineType): boolean;

  /**
   * Get a cached engine instance (if available)
   */
  getCachedEngine?(engineId: EngineType): TTSEnginePort | undefined;

  /**
   * Get all initialized engines
   */
  getInitializedEngines?(): Map<EngineType, TTSEnginePort>;
}
