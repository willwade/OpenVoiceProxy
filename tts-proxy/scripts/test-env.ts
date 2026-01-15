import { loadEnv } from './load-env.js';

import { getEnv, getEngineCredentials, hasEngineCredentials } from '../src/config/env.js';
import { getEngineFactory } from '../src/infrastructure/tts-engines/engine-factory.js';
import type { EngineType } from '../src/types/engine.types.js';

loadEnv(import.meta.url);

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

console.log('Testing environment loading and TTS engine initialization');
console.log('='.repeat(60));

const env = getEnv();

console.log('\nEnvironment variables:');
console.log(`NODE_ENV: ${env.NODE_ENV}`);
console.log(`API_KEY_REQUIRED: ${env.API_KEY_REQUIRED}`);
console.log(`LOCAL_MODE: ${env.LOCAL_MODE}`);

console.log('\nCredentials status:');
const credentialsChecks: Array<[string, string | undefined]> = [
  ['AZURE_SPEECH_KEY', env.AZURE_SPEECH_KEY],
  ['AZURE_SPEECH_REGION', env.AZURE_SPEECH_REGION],
  ['GOOGLE_API_KEY', env.GOOGLE_API_KEY],
  ['GOOGLE_APPLICATION_CREDENTIALS_JSON', env.GOOGLE_APPLICATION_CREDENTIALS_JSON],
  ['AWS_ACCESS_KEY_ID', env.AWS_ACCESS_KEY_ID],
  ['AWS_SECRET_ACCESS_KEY', env.AWS_SECRET_ACCESS_KEY],
  ['ELEVENLABS_API_KEY', env.ELEVENLABS_API_KEY],
  ['OPENAI_API_KEY', env.OPENAI_API_KEY],
  ['PLAYHT_API_KEY', env.PLAYHT_API_KEY],
  ['WATSON_API_KEY', env.WATSON_API_KEY],
  ['WITAI_API_KEY', env.WITAI_API_KEY],
];

for (const [label, value] of credentialsChecks) {
  console.log(`${label}: ${value ? 'Set' : 'Not set'}`);
}

console.log('\nInitializing engine factory...');
const engineFactory = getEngineFactory();

const includeAll = process.argv.includes('--all');
const includeSherpa = includeAll || process.argv.includes('--sherpa');

const engineTypes: EngineType[] = ['espeak'];
const optionalEngines: EngineType[] = [
  'azure',
  'elevenlabs',
  'openai',
  'google',
  'polly',
  'watson',
  'playht',
  'witai',
];

for (const engineId of optionalEngines) {
  if (includeAll || hasEngineCredentials(engineId)) {
    engineTypes.push(engineId);
  }
}

if (includeSherpa) {
  engineTypes.push('sherpaonnx');
}

for (const engineId of engineTypes) {
  if (hasEngineCredentials(engineId)) {
    const creds = getEngineCredentials(engineId);
    engineFactory.setDefaultCredentials(engineId, creds);
  }
}

console.log('\nEngine availability:');
for (const engineId of engineTypes) {
  try {
    const engine = await engineFactory.createEngine(engineId);
    const status = engine.getStatus();
    console.log(`- ${engineId}: ${status.available ? 'available' : 'unavailable'} (${status.message})`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`- ${engineId}: unavailable (${message})`);
  }
}

console.log('\nDone.');
