/**
 * Base TTS Engine Implementation
 * Abstract base class for TTS engine adapters
 */

import type { TTSEnginePort } from '../../application/ports/tts-engine-port.js';
import type { Voice } from '../../domain/entities/voice.js';
import { Voice as VoiceEntity } from '../../domain/entities/voice.js';
import type { EngineType, EngineCredentials } from '../../types/engine.types.js';
import type {
  SpeechRequest,
  SpeechResponse,
  StreamingChunk,
  TimestampedSpeechResponse,
  AudioFormat,
} from '../../types/tts.types.js';
import { SpeechGenerationError, EngineCredentialsMissingError } from '../../domain/errors/domain-errors.js';

export interface BaseEngineConfig {
  supportedFormats: AudioFormat[];
  supportsStreaming: boolean;
  supportsTimestamps: boolean;
  supportsSSML: boolean;
  defaultVoice?: string;
}

export abstract class BaseEngine implements TTSEnginePort {
  abstract readonly engineId: EngineType;

  protected credentials?: EngineCredentials;
  protected voices: Voice[] = [];
  protected initialized = false;
  protected lastError?: string;
  protected config: BaseEngineConfig;

  constructor(config: BaseEngineConfig) {
    this.config = config;
  }

  async initialize(credentials?: EngineCredentials): Promise<void> {
    this.credentials = credentials;

    try {
      await this.doInitialize();
      this.voices = await this.fetchVoices();
      this.initialized = true;
      this.lastError = undefined;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  /**
   * Subclass-specific initialization logic
   */
  protected abstract doInitialize(): Promise<void>;

  /**
   * Fetch voices from the engine
   */
  protected abstract fetchVoices(): Promise<Voice[]>;

  /**
   * Perform the actual speech synthesis
   */
  protected abstract doSynthesize(request: SpeechRequest): Promise<Buffer>;

  isAvailable(): boolean {
    return this.initialized && !this.lastError;
  }

  async getVoices(): Promise<Voice[]> {
    if (!this.initialized) {
      await this.initialize(this.credentials);
    }
    return this.voices;
  }

  async synthesize(request: SpeechRequest): Promise<SpeechResponse> {
    if (!this.initialized) {
      throw new SpeechGenerationError(this.engineId, 'Engine not initialized');
    }

    try {
      const audio = await this.doSynthesize(request);

      return {
        audio,
        format: request.outputFormat ?? 'wav',
        sampleRate: request.sampleRate ?? 22050,
        characterCount: request.text.length,
      };
    } catch (error) {
      throw new SpeechGenerationError(
        this.engineId,
        error instanceof Error ? error.message : String(error),
        error instanceof Error ? error : undefined
      );
    }
  }

  // Default implementations for optional features
  async synthesizeStream?(
    _request: SpeechRequest,
    _onChunk: (chunk: StreamingChunk) => void
  ): Promise<void> {
    throw new Error(`Streaming not supported by ${this.engineId}`);
  }

  async synthesizeWithTimestamps?(_request: SpeechRequest): Promise<TimestampedSpeechResponse> {
    throw new Error(`Timestamps not supported by ${this.engineId}`);
  }

  supportsStreaming(): boolean {
    return this.config.supportsStreaming;
  }

  supportsTimestamps(): boolean {
    return this.config.supportsTimestamps;
  }

  supportsFormat(format: AudioFormat): boolean {
    return this.config.supportedFormats.includes(format);
  }

  getDefaultVoice(): string | null {
    if (this.config.defaultVoice) return this.config.defaultVoice;
    return this.voices[0]?.id ?? null;
  }

  getStatus(): {
    available: boolean;
    voiceCount: number;
    message: string;
    error?: string;
  } {
    if (!this.initialized) {
      return {
        available: false,
        voiceCount: 0,
        message: 'Not initialized',
      };
    }

    if (this.lastError) {
      return {
        available: false,
        voiceCount: this.voices.length,
        message: 'Error',
        error: this.lastError,
      };
    }

    return {
      available: true,
      voiceCount: this.voices.length,
      message: `Ready (${this.voices.length} voices)`,
    };
  }

  async dispose?(): Promise<void> {
    this.initialized = false;
    this.voices = [];
  }

  /**
   * Helper to create Voice entities from raw engine data
   */
  protected createVoice(data: {
    id: string;
    name: string;
    language?: string;
    languageCode?: string;
    gender?: string;
    labels?: Record<string, string>;
  }): Voice {
    return VoiceEntity.fromEngineVoice(this.engineId, data);
  }

  /**
   * Helper to check credentials
   */
  protected requireCredential(key: string): string {
    const value = this.credentials?.[key];
    if (!value) {
      throw new EngineCredentialsMissingError(this.engineId);
    }
    return value;
  }
}
