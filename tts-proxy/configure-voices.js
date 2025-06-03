const ConfigManager = require('./src/config-manager');
const { createTTSClient } = require('js-tts-wrapper');

class VoiceConfigurator {
    constructor() {
        this.configManager = new ConfigManager();
    }

    async discoverVoices() {
        console.log('🔍 Discovering available TTS voices...');
        console.log('=' .repeat(40));

        const engines = ['espeak-wasm'];
        const allVoices = new Map();

        // Add other engines if credentials are available
        if (process.env.AZURE_SPEECH_KEY) engines.push('azure');
        if (process.env.ELEVENLABS_API_KEY) engines.push('elevenlabs');

        for (const engineName of engines) {
            try {
                console.log(`\n📡 Checking ${engineName}...`);
                
                let client;
                if (engineName === 'azure') {
                    client = createTTSClient('azure', {
                        subscriptionKey: process.env.AZURE_SPEECH_KEY,
                        region: process.env.AZURE_SPEECH_REGION || 'westeurope'
                    });
                } else if (engineName === 'elevenlabs') {
                    client = createTTSClient('elevenlabs', {
                        apiKey: process.env.ELEVENLABS_API_KEY
                    });
                } else {
                    client = createTTSClient(engineName);
                }

                const voices = await client.getVoices();
                allVoices.set(engineName, voices);
                
                console.log(`   ✅ Found ${voices.length} voices`);
                
                // Show sample voices
                voices.slice(0, 3).forEach(voice => {
                    console.log(`      - ${voice.name} (${voice.id}) [${voice.language || 'unknown'}]`);
                });
                
                if (voices.length > 3) {
                    console.log(`      ... and ${voices.length - 3} more`);
                }

            } catch (error) {
                console.log(`   ❌ Failed: ${error.message}`);
            }
        }

        return allVoices;
    }

    async createVoiceMappings(discoveredVoices) {
        console.log('\n🎯 Creating voice mappings...');
        console.log('=' .repeat(40));

        const mappings = [];
        let mappingId = 1;

        for (const [engineName, voices] of discoveredVoices) {
            // Create mappings for different languages/types
            const englishVoices = voices.filter(v => 
                !v.language || v.language.startsWith('en') || v.id.includes('en')
            );
            
            const femaleVoices = voices.filter(v => 
                v.name.toLowerCase().includes('female') || 
                v.name.toLowerCase().includes('woman') ||
                ['aria', 'jenny', 'jane', 'sarah', 'emma'].some(name => 
                    v.name.toLowerCase().includes(name)
                )
            );
            
            const maleVoices = voices.filter(v => 
                v.name.toLowerCase().includes('male') || 
                v.name.toLowerCase().includes('man') ||
                ['david', 'john', 'mike', 'brian', 'guy'].some(name => 
                    v.name.toLowerCase().includes(name)
                )
            );

            // Create some standard mappings
            if (englishVoices.length > 0) {
                mappings.push({
                    elevenLabsId: `proxy-voice-${mappingId++}`,
                    elevenLabsName: `${engineName} English Voice`,
                    localEngine: engineName,
                    localVoiceId: englishVoices[0].id,
                    parameters: { rate: 1.0, pitch: 1.0 }
                });
            }

            if (femaleVoices.length > 0) {
                mappings.push({
                    elevenLabsId: `proxy-voice-${mappingId++}`,
                    elevenLabsName: `${engineName} Female Voice`,
                    localEngine: engineName,
                    localVoiceId: femaleVoices[0].id,
                    parameters: { rate: 1.0, pitch: 1.0 }
                });
            }

            if (maleVoices.length > 0) {
                mappings.push({
                    elevenLabsId: `proxy-voice-${mappingId++}`,
                    elevenLabsName: `${engineName} Male Voice`,
                    localEngine: engineName,
                    localVoiceId: maleVoices[0].id,
                    parameters: { rate: 1.0, pitch: 1.0 }
                });
            }

            // Add a few more diverse voices
            const otherVoices = voices.filter(v => 
                !englishVoices.includes(v) && 
                !femaleVoices.includes(v) && 
                !maleVoices.includes(v)
            ).slice(0, 2);

            otherVoices.forEach((voice, index) => {
                mappings.push({
                    elevenLabsId: `proxy-voice-${mappingId++}`,
                    elevenLabsName: `${engineName} ${voice.name}`,
                    localEngine: engineName,
                    localVoiceId: voice.id,
                    parameters: { rate: 1.0, pitch: 1.0 }
                });
            });
        }

        console.log(`\n✅ Created ${mappings.length} voice mappings:`);
        mappings.forEach(mapping => {
            console.log(`   ${mapping.elevenLabsId}: ${mapping.elevenLabsName} → ${mapping.localEngine}:${mapping.localVoiceId}`);
        });

        return mappings;
    }

    async saveConfiguration(mappings) {
        console.log('\n💾 Saving configuration...');
        
        // Update voice mappings
        this.configManager.config.voiceMapping = mappings;
        
        // Enable discovered engines
        const engines = [...new Set(mappings.map(m => m.localEngine))];
        engines.forEach(engine => {
            this.configManager.enableEngine(engine, true);
        });

        const success = this.configManager.saveConfig();
        
        if (success) {
            console.log('✅ Configuration saved successfully');
            console.log(`📁 Config file: ${this.configManager.configPath}`);
        } else {
            console.log('❌ Failed to save configuration');
        }

        return success;
    }

    async showCurrentConfiguration() {
        console.log('\n📋 Current Configuration:');
        console.log('=' .repeat(40));

        const mappings = this.configManager.getVoiceMappings();
        const enabledEngines = this.configManager.getEnabledEngines();

        console.log(`Enabled engines: ${enabledEngines.join(', ')}`);
        console.log(`Voice mappings: ${mappings.length}`);
        
        if (mappings.length > 0) {
            console.log('\nVoice Mappings:');
            mappings.forEach(mapping => {
                console.log(`  ${mapping.elevenLabsId}:`);
                console.log(`    Name: ${mapping.elevenLabsName}`);
                console.log(`    Engine: ${mapping.localEngine}`);
                console.log(`    Voice: ${mapping.localVoiceId}`);
                console.log(`    Rate: ${mapping.parameters?.rate || 1.0}, Pitch: ${mapping.parameters?.pitch || 1.0}`);
                console.log('');
            });
        }
    }

    async testVoiceMapping(elevenLabsId) {
        console.log(`\n🧪 Testing voice mapping: ${elevenLabsId}`);
        
        const mappings = this.configManager.getVoiceMappings();
        const mapping = mappings.find(m => m.elevenLabsId === elevenLabsId);
        
        if (!mapping) {
            console.log('❌ Voice mapping not found');
            return false;
        }

        try {
            let client;
            if (mapping.localEngine === 'azure') {
                client = createTTSClient('azure', {
                    subscriptionKey: process.env.AZURE_SPEECH_KEY,
                    region: process.env.AZURE_SPEECH_REGION || 'westeurope'
                });
            } else if (mapping.localEngine === 'elevenlabs') {
                client = createTTSClient('elevenlabs', {
                    apiKey: process.env.ELEVENLABS_API_KEY
                });
            } else {
                client = createTTSClient(mapping.localEngine);
            }

            client.setVoice(mapping.localVoiceId);
            const audioBytes = await client.synthToBytes('Hello, this is a test of the voice mapping.');
            
            console.log(`✅ Generated ${audioBytes.length} bytes of audio`);
            console.log(`   Engine: ${mapping.localEngine}`);
            console.log(`   Voice: ${mapping.localVoiceId}`);
            
            return true;
        } catch (error) {
            console.log(`❌ Test failed: ${error.message}`);
            return false;
        }
    }
}

async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    
    const configurator = new VoiceConfigurator();

    console.log('🎤 TTS Proxy Voice Configurator');
    console.log('=' .repeat(50));

    switch (command) {
        case 'discover':
            const voices = await configurator.discoverVoices();
            const mappings = await configurator.createVoiceMappings(voices);
            await configurator.saveConfiguration(mappings);
            break;
            
        case 'show':
            await configurator.showCurrentConfiguration();
            break;
            
        case 'test':
            const voiceId = args[1];
            if (!voiceId) {
                console.log('Usage: node configure-voices.js test <voice-id>');
                process.exit(1);
            }
            await configurator.testVoiceMapping(voiceId);
            break;
            
        default:
            console.log('Usage: node configure-voices.js <command>');
            console.log('');
            console.log('Commands:');
            console.log('  discover  - Discover available voices and create mappings');
            console.log('  show      - Show current voice configuration');
            console.log('  test <id> - Test a specific voice mapping');
            console.log('');
            console.log('Examples:');
            console.log('  node configure-voices.js discover');
            console.log('  node configure-voices.js show');
            console.log('  node configure-voices.js test proxy-voice-1');
            break;
    }
}

main();
