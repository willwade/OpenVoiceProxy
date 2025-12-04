// API Key types
export interface ApiKey {
  id: string
  name: string
  keySuffix?: string
  isAdmin: boolean
  active: boolean
  createdAt: string
  lastUsed: string | null
  requestCount: number
  expiresAt: string | null
}

export interface CreateKeyRequest {
  name: string
  isAdmin: boolean
}

export interface CreateKeyResponse extends ApiKey {
  key: string // Only returned on creation
}

// Engine types
export interface EngineConfig {
  enabled: boolean
  credentials?: Record<string, string>
}

export interface EngineStatus {
  valid: boolean
  engine: string
  environment: string
  requiresCredentials: boolean
  credentialTypes: string[]
  message: string
  details?: {
    voiceCount: number
    hasCredentials: boolean
  }
  error?: string
}

export interface EnginesStatusResponse {
  engines: Record<string, EngineStatus>
  timestamp: string
}

// Engine definitions
export interface EngineDefinition {
  name: string
  type: 'free' | 'paid'
  requiresKey: boolean
  keyFields?: string[]
  description: string
}

export const ENGINE_DEFINITIONS: Record<string, EngineDefinition> = {
  espeak: { name: 'eSpeak', type: 'free', requiresKey: false, description: 'Free, open-source speech synthesizer' },
  azure: { name: 'Azure TTS', type: 'paid', requiresKey: true, keyFields: ['AZURE_SPEECH_KEY', 'AZURE_SPEECH_REGION'], description: 'Microsoft Azure Cognitive Services' },
  elevenlabs: { name: 'ElevenLabs', type: 'paid', requiresKey: true, keyFields: ['ELEVENLABS_API_KEY'], description: 'High-quality AI voices' },
  openai: { name: 'OpenAI TTS', type: 'paid', requiresKey: true, keyFields: ['OPENAI_API_KEY'], description: 'OpenAI text-to-speech' },
  google: { name: 'Google Cloud TTS', type: 'paid', requiresKey: true, keyFields: ['GOOGLE_API_KEY'], description: 'Google Cloud Text-to-Speech' },
  polly: { name: 'AWS Polly', type: 'paid', requiresKey: true, keyFields: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION'], description: 'Amazon Polly TTS' },
  watson: { name: 'IBM Watson', type: 'paid', requiresKey: true, keyFields: ['WATSON_API_KEY', 'WATSON_SERVICE_URL'], description: 'IBM Watson Text to Speech' },
  playht: { name: 'PlayHT', type: 'paid', requiresKey: true, keyFields: ['PLAYHT_API_KEY', 'PLAYHT_USER_ID'], description: 'PlayHT voice generation' },
  witai: { name: 'Wit.ai', type: 'free', requiresKey: true, keyFields: ['WITAI_API_KEY'], description: 'Facebook Wit.ai TTS' },
  sherpaonnx: { name: 'SherpaOnnx', type: 'free', requiresKey: false, description: 'Local neural TTS (Kokoro voices)' }
}

// Usage types
export interface UsageStats {
  totalRequests: number
  byKey?: Record<string, number>
  byPath?: Record<string, number>
}

// Auth types
export interface User {
  id: string
  name: string
  isAdmin: boolean
}

