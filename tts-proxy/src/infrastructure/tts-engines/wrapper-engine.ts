/**
 * JS-TTS-Wrapper Engine Adapter
 * Bridges the js-tts-wrapper library to our TTSEnginePort interface
 */

import { BaseEngine, type BaseEngineConfig } from './base-engine.js';
import type { Voice } from '../../domain/entities/voice.js';
import { Voice as VoiceEntity } from '../../domain/entities/voice.js';
import type { EngineType, EngineCredentials } from '../../types/engine.types.js';
import type { SpeechRequest, StreamingChunk } from '../../types/tts.types.js';

import { createTTSClient, type SupportedTTS } from 'js-tts-wrapper';

// Map our engine IDs to js-tts-wrapper engine names
const ENGINE_MAP: Record<EngineType, SupportedTTS> = {
  espeak: 'espeak',
  azure: 'azure',
  elevenlabs: 'elevenlabs',
  openai: 'openai',
  google: 'google',
  polly: 'polly',
  watson: 'watson',
  playht: 'playht',
  witai: 'witai',
  sherpaonnx: 'sherpaonnx',
};

// Credential key mapping for js-tts-wrapper
const CREDENTIAL_MAP: Record<EngineType, Record<string, string>> = {
  azure: {
    AZURE_SPEECH_KEY: 'subscriptionKey',
    AZURE_SPEECH_REGION: 'region',
  },
  elevenlabs: {
    ELEVENLABS_API_KEY: 'apiKey',
  },
  openai: {
    OPENAI_API_KEY: 'apiKey',
  },
  google: {
    GOOGLE_API_KEY: 'apiKey',
    GOOGLE_APPLICATION_CREDENTIALS_JSON: 'credentials',
  },
  polly: {
    AWS_ACCESS_KEY_ID: 'accessKeyId',
    AWS_SECRET_ACCESS_KEY: 'secretAccessKey',
    AWS_REGION: 'region',
  },
  watson: {
    WATSON_API_KEY: 'apiKey',
    WATSON_SERVICE_URL: 'serviceUrl',
  },
  playht: {
    PLAYHT_API_KEY: 'apiKey',
    PLAYHT_USER_ID: 'userId',
  },
  witai: {
    WITAI_API_KEY: 'apiKey',
  },
  espeak: {},
  sherpaonnx: {},
};

export class JsTtsWrapperEngine extends BaseEngine {
  readonly engineId: EngineType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any = null;

  constructor(engineId: EngineType, config: BaseEngineConfig) {
    super(config);
    this.engineId = engineId;
  }

  protected async doInitialize(): Promise<void> {
    const wrapperEngine = ENGINE_MAP[this.engineId];
    if (!wrapperEngine) {
      throw new Error(`Unsupported engine: ${this.engineId}`);
    }

    // Convert our credentials format to js-tts-wrapper format
    const wrapperCredentials = this.mapCredentials();

    try {
      this.client = await createTTSClient(wrapperEngine, wrapperCredentials);
    } catch (error) {
      // Some engines (like espeak) might not need initialization
      if (this.engineId === 'espeak' || this.engineId === 'sherpaonnx') {
        this.client = await createTTSClient(wrapperEngine, {});
      } else {
        throw error;
      }
    }
  }

  protected async fetchVoices(): Promise<Voice[]> {
    if (!this.client) {
      return [];
    }

    try {
      const voices = await this.client.getVoices();
      return voices.map((v: {
        id?: string;
        voiceId?: string;
        name?: string;
        language?: string;
        languageCode?: string;
        locale?: string;
        gender?: string;
        labels?: Record<string, string>;
      }) =>
        VoiceEntity.fromEngineVoice(this.engineId, {
          id: v.id ?? v.voiceId ?? v.name ?? 'unknown',
          name: v.name ?? v.id ?? 'Unknown',
          language: v.language ?? v.locale ?? 'Unknown',
          languageCode: v.languageCode ?? v.locale ?? 'en',
          gender: v.gender,
          labels: v.labels,
        })
      );
    } catch (error) {
      console.warn(`Failed to fetch voices for ${this.engineId}:`, error);
      return [];
    }
  }

  protected async doSynthesize(request: SpeechRequest): Promise<Buffer> {
    if (!this.client) {
      throw new Error('Engine not initialized');
    }

    // Extract the native voice ID (remove engine prefix if present)
    let voiceId = request.voiceId;
    if (voiceId.includes(':')) {
      const parts = voiceId.split(':');
      voiceId = parts[1] ?? voiceId;
    }

    // Build options for js-tts-wrapper
    const options: Record<string, unknown> = {
      voice: voiceId,
      format: request.outputFormat ?? 'wav',
    };

    if (request.sampleRate) {
      options['sampleRate'] = request.sampleRate;
    }

    // Map voice settings
    if (request.voiceSettings) {
      if (request.voiceSettings.speed !== undefined) {
        options['rate'] = request.voiceSettings.speed;
      }
      if (request.voiceSettings.pitch !== undefined) {
        options['pitch'] = request.voiceSettings.pitch;
      }
      // ElevenLabs-specific settings
      if (request.voiceSettings.stability !== undefined) {
        options['stability'] = request.voiceSettings.stability;
      }
      if (request.voiceSettings.similarity_boost !== undefined) {
        options['similarity_boost'] = request.voiceSettings.similarity_boost;
      }
    }

    let result;

    // For espeak (and similar engines that save to temp files but don't return audio),
    // we need to use toFile method that keeps the output file
    if (this.engineId === 'espeak' || this.engineId === 'sherpaonnx') {
      const { readFileSync, unlinkSync, existsSync } = await import('fs');
      const tmpPath = `/tmp/tts-output-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`;

      // Try toFile method which should save to our specified path
      if (this.client.toFile) {
        try {
          await this.client.toFile(tmpPath, request.text, options);
          if (existsSync(tmpPath)) {
            const audioBuffer = readFileSync(tmpPath);
            try { unlinkSync(tmpPath); } catch { /* cleanup */ }
            console.log(`[espeak] Got audio via toFile, size: ${audioBuffer.length}`);
            return audioBuffer;
          }
        } catch (e) {
          console.warn(`[espeak] toFile failed:`, e);
        }
      }

      // Try synth method which might return raw audio
      if (this.client.synth) {
        try {
          const audio = await this.client.synth(request.text, options);
          if (audio) {
            console.log(`[espeak] Got audio via synth, type: ${typeof audio}`);
            if (Buffer.isBuffer(audio)) return audio;
            if (audio instanceof Uint8Array) return Buffer.from(audio);
            if (typeof audio === 'object' && audio.audio) {
              return Buffer.isBuffer(audio.audio) ? audio.audio : Buffer.from(audio.audio);
            }
          }
        } catch (e) {
          console.warn(`[espeak] synth failed:`, e);
        }
      }

      // Try getAudio method
      if (this.client.getAudio) {
        try {
          const audio = await this.client.getAudio(request.text, options);
          if (audio) {
            console.log(`[espeak] Got audio via getAudio`);
            if (Buffer.isBuffer(audio)) return audio;
            if (audio instanceof Uint8Array) return Buffer.from(audio);
          }
        } catch (e) {
          console.warn(`[espeak] getAudio failed:`, e);
        }
      }
    }

    // Try getAudioBuffer or synthToBuffer first
    if (this.client.getAudioBuffer) {
      try {
        result = await this.client.getAudioBuffer(request.text, options);
        if (result) return Buffer.isBuffer(result) ? result : Buffer.from(result);
      } catch (e) {
        console.warn(`getAudioBuffer failed for ${this.engineId}:`, e);
      }
    }

    // Try synthToBuffer
    if (this.client.synthToBuffer) {
      try {
        result = await this.client.synthToBuffer(request.text, options);
        if (result) return Buffer.isBuffer(result) ? result : Buffer.from(result);
      } catch (e) {
        console.warn(`synthToBuffer failed for ${this.engineId}:`, e);
      }
    }

    // Try synthesize method
    if (this.client.synthesize) {
      result = await this.client.synthesize(request.text, options);
    } else {
      result = await this.client.speak(request.text, options);
    }

    // Result might be a Buffer, ArrayBuffer, or object with audio property
    if (Buffer.isBuffer(result)) {
      return result;
    }
    if (result instanceof ArrayBuffer) {
      return Buffer.from(result);
    }
    if (result?.audio) {
      if (Buffer.isBuffer(result.audio)) {
        return result.audio;
      }
      if (result.audio instanceof ArrayBuffer) {
        return Buffer.from(result.audio);
      }
      // Handle Uint8Array
      if (result.audio instanceof Uint8Array) {
        return Buffer.from(result.audio);
      }
    }
    // Some engines return a Uint8Array directly
    if (result instanceof Uint8Array) {
      return Buffer.from(result);
    }
    // Handle string path (read file)
    if (typeof result === 'string' && result.endsWith('.wav')) {
      const { readFileSync } = await import('fs');
      return readFileSync(result);
    }
    // Handle result.filePath
    if (result?.filePath && typeof result.filePath === 'string') {
      const { readFileSync } = await import('fs');
      return readFileSync(result.filePath);
    }

    throw new Error(`Unexpected response format from TTS engine: ${typeof result}`);
  }

  // Override for streaming support
  async synthesizeStream(
    request: SpeechRequest,
    onChunk: (chunk: StreamingChunk) => void
  ): Promise<void> {
    if (!this.client || !this.config.supportsStreaming) {
      throw new Error(`Streaming not supported by ${this.engineId}`);
    }

    // Extract voice ID
    let voiceId = request.voiceId;
    if (voiceId.includes(':')) {
      const parts = voiceId.split(':');
      voiceId = parts[1] ?? voiceId;
    }

    const options: Record<string, unknown> = {
      voice: voiceId,
      format: request.outputFormat ?? 'wav',
    };

    if (this.client.speakStream) {
      const stream = await this.client.speakStream(request.text, options);

      for await (const chunk of stream) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        onChunk({
          audio: buffer,
          isFinal: false,
        });
      }

      onChunk({
        audio: Buffer.alloc(0),
        isFinal: true,
      });
    } else {
      // Fall back to non-streaming
      const audio = await this.doSynthesize(request);
      onChunk({
        audio,
        isFinal: true,
      });
    }
  }

  private mapCredentials(): Record<string, unknown> {
    const mapping = CREDENTIAL_MAP[this.engineId] ?? {};
    const result: Record<string, unknown> = {};

    for (const [ourKey, theirKey] of Object.entries(mapping)) {
      const value = this.credentials?.[ourKey];
      if (value) {
        result[theirKey] = value;
      }
    }

    return result;
  }

  async dispose(): Promise<void> {
    if (this.client?.dispose) {
      await this.client.dispose();
    }
    this.client = null;
    await super.dispose?.();
  }
}
