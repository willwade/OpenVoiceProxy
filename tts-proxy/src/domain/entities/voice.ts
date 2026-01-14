/**
 * Voice Domain Entity
 * Represents a TTS voice with its properties
 */

import type { Voice as VoiceData, ElevenLabsVoice } from '../../types/tts.types.js';
import type { EngineType } from '../../types/engine.types.js';

export interface VoiceProps {
  id: string;
  name: string;
  engine: EngineType;
  language: string;
  languageCode: string;
  gender?: 'male' | 'female' | 'neutral';
  style?: string;
  previewUrl?: string;
  labels?: Record<string, string>;
  nativeVoiceId: string; // The actual voice ID used by the engine
}

export class Voice {
  private readonly props: VoiceProps;

  private constructor(props: VoiceProps) {
    this.props = props;
  }

  // Getters
  get id(): string {
    return this.props.id;
  }
  get name(): string {
    return this.props.name;
  }
  get engine(): EngineType {
    return this.props.engine;
  }
  get language(): string {
    return this.props.language;
  }
  get languageCode(): string {
    return this.props.languageCode;
  }
  get gender(): 'male' | 'female' | 'neutral' | undefined {
    return this.props.gender;
  }
  get style(): string | undefined {
    return this.props.style;
  }
  get previewUrl(): string | undefined {
    return this.props.previewUrl;
  }
  get labels(): Record<string, string> | undefined {
    return this.props.labels;
  }
  get nativeVoiceId(): string {
    return this.props.nativeVoiceId;
  }

  // Business logic
  matchesLanguage(langCode: string): boolean {
    const normalizedSearch = langCode.toLowerCase();
    const normalizedCode = this.props.languageCode.toLowerCase();

    // Exact match
    if (normalizedCode === normalizedSearch) return true;

    // Prefix match (e.g., 'en' matches 'en-US')
    if (normalizedCode.startsWith(normalizedSearch + '-')) return true;
    if (normalizedSearch.startsWith(normalizedCode + '-')) return true;

    // Base language match
    const baseSearch = normalizedSearch.split('-')[0];
    const baseCode = normalizedCode.split('-')[0];
    return baseSearch === baseCode;
  }

  matchesGender(gender: 'male' | 'female' | 'neutral'): boolean {
    if (!this.props.gender) return true; // Unknown gender matches any
    return this.props.gender === gender;
  }

  // Factory methods
  static create(props: VoiceProps): Voice {
    return new Voice(props);
  }

  static fromEngineVoice(
    engine: EngineType,
    nativeVoice: {
      id: string;
      name: string;
      language?: string;
      languageCode?: string;
      gender?: string;
      labels?: Record<string, string>;
    }
  ): Voice {
    // Generate a unified voice ID that includes the engine
    const unifiedId = `${engine}:${nativeVoice.id}`;

    return new Voice({
      id: unifiedId,
      name: nativeVoice.name,
      engine,
      language: nativeVoice.language ?? 'Unknown',
      languageCode: nativeVoice.languageCode ?? 'en',
      gender: Voice.normalizeGender(nativeVoice.gender),
      labels: nativeVoice.labels,
      nativeVoiceId: nativeVoice.id,
    });
  }

  /**
   * Convert to ElevenLabs API format for compatibility
   */
  toElevenLabsFormat(): ElevenLabsVoice {
    return {
      voice_id: this.props.id,
      name: this.props.name,
      samples: null,
      category: this.props.engine,
      fine_tuning: {
        is_allowed_to_fine_tune: false,
        state: {},
      },
      labels: {
        ...(this.props.labels ?? {}),
        engine: this.props.engine,
        language: this.props.language,
        ...(this.props.gender ? { gender: this.props.gender } : {}),
      },
      description: `${this.props.engine} voice: ${this.props.name}`,
      preview_url: this.props.previewUrl ?? null,
      available_for_tiers: ['free'],
      settings: null,
      sharing: null,
      high_quality_base_model_ids: [],
    };
  }

  toData(): VoiceData {
    return {
      id: this.props.id,
      name: this.props.name,
      engine: this.props.engine,
      language: this.props.language,
      languageCode: this.props.languageCode,
      gender: this.props.gender,
      style: this.props.style,
      preview_url: this.props.previewUrl,
      labels: this.props.labels,
    };
  }

  toJSON() {
    return this.toData();
  }

  // Utility
  private static normalizeGender(gender?: string): 'male' | 'female' | 'neutral' | undefined {
    if (!gender) return undefined;

    const normalized = gender.toLowerCase();
    if (normalized === 'male' || normalized === 'm') return 'male';
    if (normalized === 'female' || normalized === 'f') return 'female';
    if (normalized === 'neutral' || normalized === 'n') return 'neutral';

    return undefined;
  }
}

/**
 * Voice Collection - utility class for working with multiple voices
 */
export class VoiceCollection {
  private readonly voices: Map<string, Voice>;

  constructor(voices: Voice[] = []) {
    this.voices = new Map(voices.map((v) => [v.id, v]));
  }

  get size(): number {
    return this.voices.size;
  }

  add(voice: Voice): void {
    this.voices.set(voice.id, voice);
  }

  get(id: string): Voice | undefined {
    return this.voices.get(id);
  }

  has(id: string): boolean {
    return this.voices.has(id);
  }

  getAll(): Voice[] {
    return Array.from(this.voices.values());
  }

  getByEngine(engine: EngineType): Voice[] {
    return this.getAll().filter((v) => v.engine === engine);
  }

  getByLanguage(languageCode: string): Voice[] {
    return this.getAll().filter((v) => v.matchesLanguage(languageCode));
  }

  getByGender(gender: 'male' | 'female' | 'neutral'): Voice[] {
    return this.getAll().filter((v) => v.matchesGender(gender));
  }

  search(query: string): Voice[] {
    const normalizedQuery = query.toLowerCase();
    return this.getAll().filter(
      (v) =>
        v.name.toLowerCase().includes(normalizedQuery) ||
        v.language.toLowerCase().includes(normalizedQuery) ||
        v.languageCode.toLowerCase().includes(normalizedQuery) ||
        v.engine.toLowerCase().includes(normalizedQuery)
    );
  }

  toElevenLabsFormat() {
    return {
      voices: this.getAll().map((v) => v.toElevenLabsFormat()),
    };
  }
}
