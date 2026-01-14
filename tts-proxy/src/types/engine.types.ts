/**
 * TTS Engine related types
 */

export type EngineType =
  | 'espeak'
  | 'azure'
  | 'elevenlabs'
  | 'openai'
  | 'google'
  | 'polly'
  | 'watson'
  | 'playht'
  | 'witai'
  | 'sherpaonnx';

export type EngineCategory = 'free' | 'paid';

export interface EngineCredentialField {
  name: string;
  envVar: string;
  required: boolean;
  secret: boolean;
  description?: string;
}

export interface EngineDefinition {
  id: EngineType;
  name: string;
  category: EngineCategory;
  requiresCredentials: boolean;
  credentialFields: EngineCredentialField[];
  description: string;
  supportedFormats: string[];
  supportsStreaming: boolean;
  supportsSSML: boolean;
}

export interface EngineCredentials {
  [key: string]: string;
}

export interface EngineStatus {
  engine: EngineType;
  available: boolean;
  hasCredentials: boolean;
  voiceCount: number;
  message: string;
  error?: string;
  lastChecked: Date;
}

export interface EngineConfig {
  enabled: boolean;
  credentials?: EngineCredentials;
  defaultVoice?: string;
  defaultFormat?: string;
  options?: Record<string, unknown>;
}

export interface SystemCredentials {
  [engineId: string]: EngineCredentials;
}

// Engine-specific credential types
export interface AzureCredentials {
  AZURE_SPEECH_KEY: string;
  AZURE_SPEECH_REGION: string;
}

export interface ElevenLabsCredentials {
  ELEVENLABS_API_KEY: string;
}

export interface OpenAICredentials {
  OPENAI_API_KEY: string;
}

export interface GoogleCredentials {
  GOOGLE_API_KEY?: string;
  GOOGLE_APPLICATION_CREDENTIALS_JSON?: string;
}

export interface AWSPollyCredentials {
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  AWS_REGION?: string;
}

export interface WatsonCredentials {
  WATSON_API_KEY: string;
  WATSON_SERVICE_URL: string;
}

export interface PlayHTCredentials {
  PLAYHT_API_KEY: string;
  PLAYHT_USER_ID: string;
}

export interface WitAICredentials {
  WITAI_API_KEY: string;
}

// Engine definitions constant
export const ENGINE_DEFINITIONS: Record<EngineType, EngineDefinition> = {
  espeak: {
    id: 'espeak',
    name: 'eSpeak',
    category: 'free',
    requiresCredentials: false,
    credentialFields: [],
    description: 'Free, open-source speech synthesizer with 100+ languages',
    supportedFormats: ['wav', 'mp3'],
    supportsStreaming: false,
    supportsSSML: true,
  },
  azure: {
    id: 'azure',
    name: 'Azure TTS',
    category: 'paid',
    requiresCredentials: true,
    credentialFields: [
      { name: 'Speech Key', envVar: 'AZURE_SPEECH_KEY', required: true, secret: true },
      { name: 'Region', envVar: 'AZURE_SPEECH_REGION', required: true, secret: false },
    ],
    description: 'Microsoft Azure Cognitive Services Text-to-Speech',
    supportedFormats: ['wav', 'mp3', 'ogg'],
    supportsStreaming: true,
    supportsSSML: true,
  },
  elevenlabs: {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    category: 'paid',
    requiresCredentials: true,
    credentialFields: [
      { name: 'API Key', envVar: 'ELEVENLABS_API_KEY', required: true, secret: true },
    ],
    description: 'High-quality AI voices with emotional range',
    supportedFormats: ['mp3', 'wav', 'pcm'],
    supportsStreaming: true,
    supportsSSML: false,
  },
  openai: {
    id: 'openai',
    name: 'OpenAI TTS',
    category: 'paid',
    requiresCredentials: true,
    credentialFields: [
      { name: 'API Key', envVar: 'OPENAI_API_KEY', required: true, secret: true },
    ],
    description: 'OpenAI text-to-speech with natural voices',
    supportedFormats: ['mp3', 'wav', 'opus', 'ogg'],
    supportsStreaming: true,
    supportsSSML: false,
  },
  google: {
    id: 'google',
    name: 'Google Cloud TTS',
    category: 'paid',
    requiresCredentials: true,
    credentialFields: [
      { name: 'API Key', envVar: 'GOOGLE_API_KEY', required: false, secret: true },
      { name: 'Service Account JSON', envVar: 'GOOGLE_APPLICATION_CREDENTIALS_JSON', required: false, secret: true },
    ],
    description: 'Google Cloud Text-to-Speech with WaveNet voices',
    supportedFormats: ['mp3', 'wav', 'ogg'],
    supportsStreaming: false,
    supportsSSML: true,
  },
  polly: {
    id: 'polly',
    name: 'AWS Polly',
    category: 'paid',
    requiresCredentials: true,
    credentialFields: [
      { name: 'Access Key ID', envVar: 'AWS_ACCESS_KEY_ID', required: true, secret: true },
      { name: 'Secret Access Key', envVar: 'AWS_SECRET_ACCESS_KEY', required: true, secret: true },
      { name: 'Region', envVar: 'AWS_REGION', required: false, secret: false },
    ],
    description: 'Amazon Polly with neural and standard voices',
    supportedFormats: ['mp3', 'wav', 'ogg', 'pcm'],
    supportsStreaming: true,
    supportsSSML: true,
  },
  watson: {
    id: 'watson',
    name: 'IBM Watson',
    category: 'paid',
    requiresCredentials: true,
    credentialFields: [
      { name: 'API Key', envVar: 'WATSON_API_KEY', required: true, secret: true },
      { name: 'Service URL', envVar: 'WATSON_SERVICE_URL', required: true, secret: false },
    ],
    description: 'IBM Watson Text to Speech',
    supportedFormats: ['mp3', 'wav', 'ogg'],
    supportsStreaming: true,
    supportsSSML: true,
  },
  playht: {
    id: 'playht',
    name: 'PlayHT',
    category: 'paid',
    requiresCredentials: true,
    credentialFields: [
      { name: 'API Key', envVar: 'PLAYHT_API_KEY', required: true, secret: true },
      { name: 'User ID', envVar: 'PLAYHT_USER_ID', required: true, secret: false },
    ],
    description: 'PlayHT voice generation platform',
    supportedFormats: ['mp3', 'wav'],
    supportsStreaming: true,
    supportsSSML: false,
  },
  witai: {
    id: 'witai',
    name: 'Wit.ai',
    category: 'free',
    requiresCredentials: true,
    credentialFields: [
      { name: 'API Key', envVar: 'WITAI_API_KEY', required: true, secret: true },
    ],
    description: 'Facebook Wit.ai TTS (free tier available)',
    supportedFormats: ['wav', 'mp3'],
    supportsStreaming: false,
    supportsSSML: false,
  },
  sherpaonnx: {
    id: 'sherpaonnx',
    name: 'SherpaOnnx',
    category: 'free',
    requiresCredentials: false,
    credentialFields: [],
    description: 'Local neural TTS with Kokoro and other models',
    supportedFormats: ['wav'],
    supportsStreaming: false,
    supportsSSML: false,
  },
};
