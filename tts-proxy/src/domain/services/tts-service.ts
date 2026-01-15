/**
 * TTS Domain Service
 * Business logic for text-to-speech operations
 */

import type { Voice, VoiceCollection } from '../entities/voice.js';
import type { Engine, EngineRegistry } from '../entities/engine.js';
import type { EngineType } from '../../types/engine.types.js';
import type { SpeechRequest, AudioFormat, VoiceSettings } from '../../types/tts.types.js';
import {
  VoiceNotFoundError,
  EngineNotAvailableError,
  InvalidTextError,
  TextTooLongError,
  ValidationError,
} from '../errors/domain-errors.js';

// Default limits
const DEFAULT_MAX_TEXT_LENGTH = 5000;
const DEFAULT_MAX_TEXT_LENGTH_STREAMING = 10000;

export interface TTSServiceConfig {
  maxTextLength: number;
  maxTextLengthStreaming: number;
  defaultEngine: EngineType;
  defaultFormat: AudioFormat;
  defaultSampleRate: number;
}

export class TTSService {
  private readonly config: TTSServiceConfig;

  constructor(config?: Partial<TTSServiceConfig>) {
    this.config = {
      maxTextLength: config?.maxTextLength ?? DEFAULT_MAX_TEXT_LENGTH,
      maxTextLengthStreaming: config?.maxTextLengthStreaming ?? DEFAULT_MAX_TEXT_LENGTH_STREAMING,
      defaultEngine: config?.defaultEngine ?? 'espeak',
      defaultFormat: config?.defaultFormat ?? 'wav',
      defaultSampleRate: config?.defaultSampleRate ?? 22050,
    };
  }

  /**
   * Validate a speech request
   */
  validateRequest(request: SpeechRequest, isStreaming = false): void {
    // Validate text
    if (!request.text || request.text.trim().length === 0) {
      throw new InvalidTextError('Text is required');
    }

    const maxLength = isStreaming
      ? this.config.maxTextLengthStreaming
      : this.config.maxTextLength;

    if (request.text.length > maxLength) {
      throw new TextTooLongError(maxLength, request.text.length);
    }

    // Validate voice settings if provided
    if (request.voiceSettings) {
      this.validateVoiceSettings(request.voiceSettings);
    }
  }

  /**
   * Validate voice settings
   */
  validateVoiceSettings(settings: VoiceSettings): void {
    if (settings.stability !== undefined) {
      if (settings.stability < 0 || settings.stability > 1) {
        throw new ValidationError('Stability must be between 0 and 1', 'stability');
      }
    }

    if (settings.similarity_boost !== undefined) {
      if (settings.similarity_boost < 0 || settings.similarity_boost > 1) {
        throw new ValidationError('Similarity boost must be between 0 and 1', 'similarity_boost');
      }
    }

    if (settings.style !== undefined) {
      if (settings.style < 0 || settings.style > 1) {
        throw new ValidationError('Style must be between 0 and 1', 'style');
      }
    }

    if (settings.speed !== undefined) {
      if (settings.speed < 0.25 || settings.speed > 4) {
        throw new ValidationError('Speed must be between 0.25 and 4', 'speed');
      }
    }

    if (settings.pitch !== undefined) {
      if (settings.pitch < -20 || settings.pitch > 20) {
        throw new ValidationError('Pitch must be between -20 and 20', 'pitch');
      }
    }
  }

  /**
   * Resolve a voice ID to a Voice entity
   * Handles ElevenLabs-style IDs and engine-prefixed IDs
   */
  resolveVoice(voiceId: string, voices: VoiceCollection): Voice {
    // Try direct lookup first
    let voice = voices.get(voiceId);
    if (voice) return voice;

    // Try with different engine prefixes if the ID doesn't have one
    if (!voiceId.includes(':')) {
      // Search all voices for matching native ID
      for (const v of voices.getAll()) {
        if (v.nativeVoiceId === voiceId) {
          return v;
        }
      }
    }

    throw new VoiceNotFoundError(voiceId);
  }

  /**
   * Determine which engine to use for a request
   */
  resolveEngine(
    voiceId: string,
    requestedEngine: string | undefined,
    voices: VoiceCollection,
    engines: EngineRegistry
  ): { engine: Engine; voice: Voice } {
    // If voice ID contains engine prefix, use that
    if (voiceId.includes(':')) {
      const [engineId] = voiceId.split(':') as [EngineType, string];
      const engine = engines.get(engineId);
      if (!engine) {
        throw new EngineNotAvailableError(engineId, 'Unknown engine');
      }
      if (!engine.isAvailable()) {
        throw new EngineNotAvailableError(engineId, engine.getStatus().message);
      }
      const voice = this.resolveVoice(voiceId, voices);
      return { engine, voice };
    }

    // If engine explicitly requested, use that
    if (requestedEngine) {
      const engine = engines.get(requestedEngine as EngineType);
      if (!engine) {
        throw new EngineNotAvailableError(requestedEngine, 'Unknown engine');
      }
      if (!engine.isAvailable()) {
        throw new EngineNotAvailableError(requestedEngine, engine.getStatus().message);
      }
      const voice = this.resolveVoice(`${requestedEngine}:${voiceId}`, voices);
      return { engine, voice };
    }

    // Try to find the voice in any available engine
    for (const engine of engines.getAvailable()) {
      const possibleVoiceId = `${engine.id}:${voiceId}`;
      if (voices.has(possibleVoiceId)) {
        const voice = voices.get(possibleVoiceId)!;
        return { engine, voice };
      }
    }

    // Fall back to default engine
    const defaultEngine = engines.get(this.config.defaultEngine);
    if (!defaultEngine?.isAvailable()) {
      throw new EngineNotAvailableError(this.config.defaultEngine, 'Default engine not available');
    }

    throw new VoiceNotFoundError(voiceId);
  }

  /**
   * Get the output format for a request
   */
  resolveFormat(requestedFormat: AudioFormat | undefined, engine: Engine): AudioFormat {
    const format = requestedFormat ?? this.config.defaultFormat;

    if (!engine.supportsFormat(format)) {
      // Fall back to first supported format
      const supported = engine.supportedFormats[0] as AudioFormat;
      return supported ?? 'wav';
    }

    return format;
  }

  /**
   * Get content type for an audio format
   */
  getContentType(format: AudioFormat): string {
    const contentTypes: Record<AudioFormat, string> = {
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      pcm: 'audio/pcm',
      ogg: 'audio/ogg',
      opus: 'audio/opus',
    };
    return contentTypes[format] ?? 'application/octet-stream';
  }

  /**
   * Normalize text for TTS processing
   */
  normalizeText(text: string): string {
    return text
      .trim()
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      // Remove control characters except newlines
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F]/g, '');
  }

  /**
   * Estimate character count for billing
   */
  estimateCharacterCount(text: string): number {
    // Most TTS services count actual characters, not bytes
    return this.normalizeText(text).length;
  }

  // Configuration accessors
  getConfig(): Readonly<TTSServiceConfig> {
    return { ...this.config };
  }

  getDefaultEngine(): EngineType {
    return this.config.defaultEngine;
  }

  getDefaultFormat(): AudioFormat {
    return this.config.defaultFormat;
  }
}

// Singleton instance
let ttsServiceInstance: TTSService | null = null;

export function getTTSService(config?: Partial<TTSServiceConfig>): TTSService {
  if (!ttsServiceInstance) {
    ttsServiceInstance = new TTSService(config);
  }
  return ttsServiceInstance;
}
