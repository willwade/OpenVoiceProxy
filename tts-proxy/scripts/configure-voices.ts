import fs from 'node:fs';
import path from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './load-env.js';
import { createTTSClient } from 'js-tts-wrapper';

loadEnv(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

interface VoiceMapping {
  elevenLabsId: string;
  elevenLabsName: string;
  localEngine: string;
  localVoiceId: string;
  parameters?: { rate?: number; pitch?: number };
}

interface ConfigFile {
  voiceMapping?: VoiceMapping[];
  engines?: Record<string, { enabled?: boolean; priority?: number; credentials?: Record<string, string> }>;
  [key: string]: unknown;
}

class VoiceConfigurator {
  private readonly configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath ?? path.resolve(__dirname, '../config.json');
  }

  private readConfig(): ConfigFile {
    if (!fs.existsSync(this.configPath)) {
      return {};
    }
    const raw = fs.readFileSync(this.configPath, 'utf-8');
    return JSON.parse(raw) as ConfigFile;
  }

  private writeConfig(config: ConfigFile): void {
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf-8');
  }

  async discoverVoices(): Promise<Map<string, Array<{ id: string; name: string; language?: string }>>> {
    console.log('Discovering available TTS voices...');
    console.log('='.repeat(40));

    const engines = ['espeak'];
    const allVoices = new Map<string, Array<{ id: string; name: string; language?: string }>>();

    if (process.env.AZURE_SPEECH_KEY) engines.push('azure');
    if (process.env.ELEVENLABS_API_KEY) engines.push('elevenlabs');

    for (const engineName of engines) {
      try {
        console.log(`\nChecking ${engineName}...`);
        let client;
        if (engineName === 'azure') {
          client = createTTSClient('azure', {
            subscriptionKey: process.env.AZURE_SPEECH_KEY,
            region: process.env.AZURE_SPEECH_REGION || 'westeurope',
          });
        } else if (engineName === 'elevenlabs') {
          client = createTTSClient('elevenlabs', {
            apiKey: process.env.ELEVENLABS_API_KEY,
          });
        } else {
          client = createTTSClient(engineName);
        }

        const voices = await client.getVoices();
        const normalized = voices.map((voice) => ({
          id: voice.id,
          name: voice.name,
          language: voice.language,
        }));

        allVoices.set(engineName, normalized);

        console.log(`  Found ${voices.length} voices`);
        normalized.slice(0, 3).forEach((voice) => {
          console.log(`    - ${voice.name} (${voice.id}) [${voice.language ?? 'unknown'}]`);
        });
        if (voices.length > 3) {
          console.log(`    ... and ${voices.length - 3} more`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(`  Failed: ${message}`);
      }
    }

    return allVoices;
  }

  async createVoiceMappings(
    discoveredVoices: Map<string, Array<{ id: string; name: string; language?: string }>>
  ): Promise<VoiceMapping[]> {
    console.log('\nCreating voice mappings...');
    console.log('='.repeat(40));

    const mappings: VoiceMapping[] = [];
    let mappingId = 1;

    for (const [engineName, voices] of discoveredVoices) {
      const englishVoices = voices.filter(
        (v) => !v.language || v.language.startsWith('en') || v.id.includes('en')
      );
      const femaleVoices = voices.filter((v) =>
        ['female', 'woman', 'aria', 'jenny', 'jane', 'sarah', 'emma'].some((name) =>
          v.name.toLowerCase().includes(name)
        )
      );
      const maleVoices = voices.filter((v) =>
        ['male', 'man', 'david', 'john', 'mike', 'brian', 'guy'].some((name) =>
          v.name.toLowerCase().includes(name)
        )
      );

      if (englishVoices.length > 0) {
        mappings.push({
          elevenLabsId: `proxy-voice-${mappingId++}`,
          elevenLabsName: `${engineName} English Voice`,
          localEngine: engineName,
          localVoiceId: englishVoices[0].id,
          parameters: { rate: 1.0, pitch: 1.0 },
        });
      }

      if (femaleVoices.length > 0) {
        mappings.push({
          elevenLabsId: `proxy-voice-${mappingId++}`,
          elevenLabsName: `${engineName} Female Voice`,
          localEngine: engineName,
          localVoiceId: femaleVoices[0].id,
          parameters: { rate: 1.0, pitch: 1.0 },
        });
      }

      if (maleVoices.length > 0) {
        mappings.push({
          elevenLabsId: `proxy-voice-${mappingId++}`,
          elevenLabsName: `${engineName} Male Voice`,
          localEngine: engineName,
          localVoiceId: maleVoices[0].id,
          parameters: { rate: 1.0, pitch: 1.0 },
        });
      }

      const otherVoices = voices
        .filter((v) => !englishVoices.includes(v) && !femaleVoices.includes(v) && !maleVoices.includes(v))
        .slice(0, 2);

      for (const voice of otherVoices) {
        mappings.push({
          elevenLabsId: `proxy-voice-${mappingId++}`,
          elevenLabsName: `${engineName} ${voice.name}`,
          localEngine: engineName,
          localVoiceId: voice.id,
          parameters: { rate: 1.0, pitch: 1.0 },
        });
      }
    }

    console.log(`\nCreated ${mappings.length} voice mappings:`);
    mappings.forEach((mapping) => {
      console.log(`  ${mapping.elevenLabsId}: ${mapping.elevenLabsName} -> ${mapping.localEngine}:${mapping.localVoiceId}`);
    });

    return mappings;
  }

  async saveConfiguration(mappings: VoiceMapping[]): Promise<boolean> {
    console.log('\nSaving configuration...');

    const config = this.readConfig();
    config.voiceMapping = mappings;

    const engines = [...new Set(mappings.map((m) => m.localEngine))];
    config.engines = config.engines ?? {};
    for (const engine of engines) {
      config.engines[engine] = {
        ...(config.engines[engine] ?? {}),
        enabled: true,
      };
    }

    this.writeConfig(config);
    console.log('Configuration saved successfully');
    console.log(`Config file: ${this.configPath}`);
    return true;
  }

  async showCurrentConfiguration(): Promise<void> {
    console.log('\nCurrent Configuration:');
    console.log('='.repeat(40));

    const config = this.readConfig();
    const mappings = config.voiceMapping ?? [];
    const enabledEngines = Object.entries(config.engines ?? {})
      .filter(([, value]) => value?.enabled)
      .map(([engine]) => engine);

    console.log(`Enabled engines: ${enabledEngines.join(', ') || 'none'}`);
    console.log(`Voice mappings: ${mappings.length}`);

    if (mappings.length > 0) {
      console.log('\nVoice Mappings:');
      mappings.forEach((mapping) => {
        console.log(`  ${mapping.elevenLabsId}:`);
        console.log(`    Name: ${mapping.elevenLabsName}`);
        console.log(`    Engine: ${mapping.localEngine}`);
        console.log(`    Voice: ${mapping.localVoiceId}`);
        console.log(`    Rate: ${mapping.parameters?.rate ?? 1.0}, Pitch: ${mapping.parameters?.pitch ?? 1.0}`);
      });
    }
  }

  async testVoiceMapping(elevenLabsId: string): Promise<boolean> {
    console.log(`\nTesting voice mapping: ${elevenLabsId}`);

    const config = this.readConfig();
    const mappings = config.voiceMapping ?? [];
    const mapping = mappings.find((m) => m.elevenLabsId === elevenLabsId);

    if (!mapping) {
      console.log('Voice mapping not found');
      return false;
    }

    try {
      let client;
      if (mapping.localEngine === 'azure') {
        client = createTTSClient('azure', {
          subscriptionKey: process.env.AZURE_SPEECH_KEY,
          region: process.env.AZURE_SPEECH_REGION || 'westeurope',
        });
      } else if (mapping.localEngine === 'elevenlabs') {
        client = createTTSClient('elevenlabs', {
          apiKey: process.env.ELEVENLABS_API_KEY,
        });
      } else {
        client = createTTSClient(mapping.localEngine);
      }

      client.setVoice(mapping.localVoiceId);
      const audioBytes = await client.synthToBytes('Hello, this is a test of the voice mapping.');

      console.log(`Generated ${audioBytes.length} bytes of audio`);
      console.log(`Engine: ${mapping.localEngine}`);
      console.log(`Voice: ${mapping.localVoiceId}`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`Test failed: ${message}`);
      return false;
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  const configurator = new VoiceConfigurator();

  console.log('TTS Proxy Voice Configurator');
  console.log('='.repeat(50));

  switch (command) {
    case 'discover': {
      const voices = await configurator.discoverVoices();
      const mappings = await configurator.createVoiceMappings(voices);
      await configurator.saveConfiguration(mappings);
      break;
    }
    case 'show':
      await configurator.showCurrentConfiguration();
      break;
    case 'test': {
      const voiceId = args[1];
      if (!voiceId) {
        console.log('Usage: npx tsx scripts/configure-voices.ts test <voice-id>');
        process.exit(1);
      }
      await configurator.testVoiceMapping(voiceId);
      break;
    }
    default:
      console.log('Usage: npx tsx scripts/configure-voices.ts <command>');
      console.log('');
      console.log('Commands:');
      console.log('  discover  - Discover available voices and create mappings');
      console.log('  show      - Show current voice configuration');
      console.log('  test <id> - Test a specific voice mapping');
      console.log('');
      break;
  }
}

main().catch((error) => {
  console.error('Voice configurator failed:', error);
  process.exit(1);
});
