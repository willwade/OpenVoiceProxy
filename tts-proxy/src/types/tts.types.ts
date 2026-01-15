/**
 * TTS (Text-to-Speech) related types
 */

export type AudioFormat = 'mp3' | 'wav' | 'pcm' | 'ogg' | 'opus';
export type AudioEncoding = 'mp3' | 'pcm_16000' | 'pcm_22050' | 'pcm_24000' | 'pcm_44100';

export interface Voice {
  id: string;
  name: string;
  engine: string;
  language: string;
  languageCode: string;
  gender?: 'male' | 'female' | 'neutral';
  style?: string;
  preview_url?: string;
  labels?: Record<string, string>;
}

export interface VoiceMapping {
  voiceId: string;
  engine: string;
  actualVoiceId: string;
  name: string;
}

export interface SpeechRequest {
  text: string;
  voiceId: string;
  engine?: string;
  modelId?: string;
  voiceSettings?: VoiceSettings;
  outputFormat?: AudioFormat;
  sampleRate?: number;
}

export interface VoiceSettings {
  stability?: number;
  similarity_boost?: number;
  style?: number;
  use_speaker_boost?: boolean;
  speed?: number;
  pitch?: number;
}

export interface SpeechResponse {
  audio: Buffer;
  format: AudioFormat;
  sampleRate: number;
  duration?: number;
  characterCount: number;
}

export interface StreamingChunk {
  audio: Buffer;
  isFinal: boolean;
  alignment?: AlignmentData;
}

export interface AlignmentData {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

export interface TimestampedSpeechResponse extends SpeechResponse {
  alignment: AlignmentData;
  normalized_alignment?: AlignmentData;
}

// ElevenLabs API compatibility types
export interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  samples: null;
  category: string;
  fine_tuning: {
    is_allowed_to_fine_tune: boolean;
    state: Record<string, unknown>;
  };
  labels: Record<string, string>;
  description: string | null;
  preview_url: string | null;
  available_for_tiers: string[];
  settings: VoiceSettings | null;
  sharing: null;
  high_quality_base_model_ids: string[];
}

export interface ElevenLabsVoicesResponse {
  voices: ElevenLabsVoice[];
}

export interface ElevenLabsModel {
  model_id: string;
  name: string;
  can_be_finetuned: boolean;
  can_do_text_to_speech: boolean;
  can_do_voice_conversion: boolean;
  can_use_style: boolean;
  can_use_speaker_boost: boolean;
  serves_pro_voices: boolean;
  token_cost_factor: number;
  description: string;
  requires_alpha_access: boolean;
  max_characters_request_free_user: number;
  max_characters_request_subscribed_user: number;
  maximum_text_length_per_request: number;
  languages: Array<{
    language_id: string;
    name: string;
  }>;
}

export interface ElevenLabsUser {
  subscription: {
    tier: string;
    character_count: number;
    character_limit: number;
    can_extend_character_limit: boolean;
    allowed_to_extend_character_limit: boolean;
    next_character_count_reset_unix: number;
    voice_limit: number;
    max_voice_add_edits: number;
    voice_add_edit_counter: number;
    professional_voice_limit: number;
    can_extend_voice_limit: boolean;
    can_use_instant_voice_cloning: boolean;
    can_use_professional_voice_cloning: boolean;
    currency: string;
    status: string;
  };
  is_new_user: boolean;
  xi_api_key: string;
  can_use_delayed_payment_methods: boolean;
  is_onboarding_completed: boolean;
  first_name: string;
}
