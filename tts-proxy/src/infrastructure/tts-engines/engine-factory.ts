/**
 * TTS Engine Factory
 * Creates and manages TTS engine instances using js-tts-wrapper
 */

import type { TTSEnginePort, TTSEngineFactoryPort } from '../../application/ports/tts-engine-port.js';
import type { EngineType, EngineCredentials } from '../../types/engine.types.js';
import { ENGINE_DEFINITIONS } from '../../types/engine.types.js';
import { EngineNotAvailableError } from '../../domain/errors/domain-errors.js';

// Import js-tts-wrapper
import { createTTSClient, type SupportedTTS } from 'js-tts-wrapper';

import { JsTtsWrapperEngine } from './wrapper-engine.js';
import { NativeEspeakEngine } from './espeak-engine.js';

/**
 * Supported engine types
 */
const SUPPORTED_ENGINES: EngineType[] = [
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
];

export class TTSEngineFactory implements TTSEngineFactoryPort {
  private readonly engines: Map<EngineType, TTSEnginePort> = new Map();
  private readonly defaultCredentials: Map<EngineType, EngineCredentials> = new Map();

  /**
   * Set default credentials for an engine
   */
  setDefaultCredentials(engineId: EngineType, credentials: EngineCredentials): void {
    this.defaultCredentials.set(engineId, credentials);
  }

  /**
   * Create or get an engine instance
   */
  async createEngine(
    engineId: EngineType,
    credentials?: EngineCredentials
  ): Promise<TTSEnginePort> {
    // Check if engine is supported
    if (!this.isEngineSupported(engineId)) {
      throw new EngineNotAvailableError(engineId, 'Engine type not supported');
    }

    // Use provided credentials or fall back to defaults
    const creds = credentials ?? this.defaultCredentials.get(engineId);

    // Check if we have a cached instance with the same credentials
    const existing = this.engines.get(engineId);
    if (existing && existing.isAvailable()) {
      return existing;
    }

    // Create new engine instance
    const engine = await this.instantiateEngine(engineId, creds);
    this.engines.set(engineId, engine);

    return engine;
  }

  /**
   * Get all available engine IDs
   */
  getAvailableEngines(): EngineType[] {
    return SUPPORTED_ENGINES.filter((id) => {
      const def = ENGINE_DEFINITIONS[id];
      // Free engines are always "available"
      // Paid engines need credentials
      if (!def.requiresCredentials) return true;
      return this.defaultCredentials.has(id);
    });
  }

  /**
   * Check if an engine type is supported
   */
  isEngineSupported(engineId: EngineType): boolean {
    return SUPPORTED_ENGINES.includes(engineId);
  }

  /**
   * Get cached engine instance
   */
  getCachedEngine(engineId: EngineType): TTSEnginePort | undefined {
    return this.engines.get(engineId);
  }

  /**
   * Clear engine cache
   */
  async clearCache(): Promise<void> {
    for (const engine of this.engines.values()) {
      await engine.dispose?.();
    }
    this.engines.clear();
  }

  /**
   * Get all initialized engines
   */
  getInitializedEngines(): Map<EngineType, TTSEnginePort> {
    return new Map(this.engines);
  }

  /**
   * Create the appropriate engine wrapper
   */
  private async instantiateEngine(
    engineId: EngineType,
    credentials?: EngineCredentials
  ): Promise<TTSEnginePort> {
    const definition = ENGINE_DEFINITIONS[engineId];
    if (!definition) {
      throw new EngineNotAvailableError(engineId, 'Unknown engine');
    }

    let engine: TTSEnginePort;

    // Use native espeak engine instead of js-tts-wrapper
    // js-tts-wrapper plays audio via aplay instead of returning buffer
    if (engineId === 'espeak') {
      engine = new NativeEspeakEngine({
        supportedFormats: ['wav'] as Array<'mp3' | 'wav' | 'pcm' | 'ogg' | 'opus'>,
        supportsStreaming: false,
        supportsTimestamps: false,
        supportsSSML: false,
      });
    } else {
      // Create wrapper around js-tts-wrapper for other engines
      engine = new JsTtsWrapperEngine(engineId, {
        supportedFormats: definition.supportedFormats as Array<'mp3' | 'wav' | 'pcm' | 'ogg' | 'opus'>,
        supportsStreaming: definition.supportsStreaming,
        supportsTimestamps: false, // js-tts-wrapper doesn't support timestamps
        supportsSSML: definition.supportsSSML,
      });
    }

    await engine.initialize(credentials);

    return engine;
  }
}

// Singleton instance
let factoryInstance: TTSEngineFactory | null = null;

export function getEngineFactory(): TTSEngineFactory {
  if (!factoryInstance) {
    factoryInstance = new TTSEngineFactory();
  }
  return factoryInstance;
}

// Re-export for convenience
export { createTTSClient, type SupportedTTS };
