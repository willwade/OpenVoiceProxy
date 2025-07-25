const logger = require('./logger');

class ProductionConfig {
    constructor() {
        this.isProduction = process.env.NODE_ENV === 'production';
        this.config = this.buildConfig();
    }

    buildConfig() {
        const config = {
            general: {
                autoStart: false,
                minimizeToTray: false, // No tray in production
                logLevel: process.env.LOG_LEVEL || 'info'
            },
            network: {
                port: parseInt(process.env.PORT) || 3000,
                modifyHostFile: false // Never modify hosts in production
            },
            security: {
                apiKeyRequired: process.env.API_KEY_REQUIRED === 'true',
                corsOrigin: process.env.CORS_ORIGIN || '*',
                rateLimiting: {
                    enabled: true,
                    requests: parseInt(process.env.RATE_LIMIT_REQUESTS) || 100,
                    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000
                }
            },
            voiceMapping: this.getVoiceMappingFromEnv(),
            audio: {
                format: process.env.AUDIO_FORMAT || 'wav',
                quality: process.env.AUDIO_QUALITY || 'medium',
                cacheEnabled: process.env.CACHE_ENABLED === 'true',
                cachePath: process.env.CACHE_PATH || '/tmp/tts-cache'
            },
            engines: this.getEngineConfigFromEnv()
        };

        logger.info('Production configuration built', {
            port: config.network.port,
            apiKeyRequired: config.security.apiKeyRequired,
            enabledEngines: Object.keys(config.engines).filter(e => config.engines[e].enabled)
        });

        return config;
    }

    getVoiceMappingFromEnv() {
        // Try to get voice mapping from environment variable
        const voiceMappingEnv = process.env.VOICE_MAPPING;
        if (voiceMappingEnv) {
            try {
                return JSON.parse(voiceMappingEnv);
            } catch (error) {
                logger.warn('Invalid VOICE_MAPPING environment variable, using defaults');
            }
        }

        // Default voice mappings
        return [
            {
                elevenLabsId: 'local-voice-1',
                elevenLabsName: 'Local Voice 1 (eSpeak)',
                localEngine: 'espeak',
                localVoiceId: 'en',
                parameters: {
                    rate: 1.0,
                    pitch: 1.0
                }
            },
            {
                elevenLabsId: 'local-voice-2',
                elevenLabsName: 'Local Voice 2 (Azure)',
                localEngine: 'azure',
                localVoiceId: 'en-US-AvaNeural',
                parameters: {
                    rate: 1.0,
                    pitch: 1.0
                }
            }
        ];
    }

    getEngineConfigFromEnv() {
        const engines = {
            espeak: {
                enabled: true, // Always enable eSpeak as fallback
                priority: 10
            }
        };

        // Azure Speech Services
        if (process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION) {
            engines.azure = {
                enabled: true,
                priority: 1,
                credentials: {
                    subscriptionKey: process.env.AZURE_SPEECH_KEY,
                    region: process.env.AZURE_SPEECH_REGION
                }
            };
        }

        // ElevenLabs
        if (process.env.ELEVENLABS_API_KEY) {
            engines.elevenlabs = {
                enabled: true,
                priority: 2,
                credentials: {
                    apiKey: process.env.ELEVENLABS_API_KEY
                }
            };
        }

        // OpenAI
        if (process.env.OPENAI_API_KEY) {
            engines.openai = {
                enabled: true,
                priority: 3,
                credentials: {
                    apiKey: process.env.OPENAI_API_KEY
                }
            };
        }

        // AWS Polly
        if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
            engines.polly = {
                enabled: true,
                priority: 4,
                credentials: {
                    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                    region: process.env.AWS_REGION || 'us-east-1'
                }
            };
        }

        // Google Cloud Text-to-Speech
        if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
            try {
                const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
                engines.google = {
                    enabled: true,
                    priority: 5,
                    credentials: credentials
                };
            } catch (error) {
                logger.warn('Invalid GOOGLE_APPLICATION_CREDENTIALS_JSON, skipping Google TTS');
            }
        }

        return engines;
    }

    get(path) {
        const keys = path.split('.');
        let value = this.config;
        
        for (const key of keys) {
            if (value && typeof value === 'object' && key in value) {
                value = value[key];
            } else {
                return undefined;
            }
        }
        
        return value;
    }

    set(path, value) {
        // In production, we don't allow runtime config changes
        if (this.isProduction) {
            logger.warn(`Attempted to modify config in production: ${path}`);
            return false;
        }

        const keys = path.split('.');
        let current = this.config;
        
        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (!current[key] || typeof current[key] !== 'object') {
                current[key] = {};
            }
            current = current[key];
        }
        
        current[keys[keys.length - 1]] = value;
        return true;
    }

    getVoiceMappings() {
        return this.config.voiceMapping || [];
    }

    addVoiceMapping(mapping) {
        if (this.isProduction) {
            logger.warn('Cannot add voice mapping in production mode');
            return false;
        }

        if (!this.config.voiceMapping) {
            this.config.voiceMapping = [];
        }
        
        this.config.voiceMapping.push(mapping);
        return true;
    }

    getEngineConfig(engineName) {
        return this.config.engines[engineName] || null;
    }

    isEngineEnabled(engineName) {
        const engineConfig = this.getEngineConfig(engineName);
        return engineConfig && engineConfig.enabled === true;
    }

    getEnabledEngines() {
        return Object.keys(this.config.engines)
            .filter(engine => this.isEngineEnabled(engine))
            .sort((a, b) => {
                const priorityA = this.config.engines[a].priority || 10;
                const priorityB = this.config.engines[b].priority || 10;
                return priorityA - priorityB;
            });
    }

    exportConfig() {
        return JSON.stringify(this.config, null, 2);
    }

    // Health check for configuration
    validateConfig() {
        const issues = [];

        // Check if at least one TTS engine is enabled
        const enabledEngines = this.getEnabledEngines();
        if (enabledEngines.length === 0) {
            issues.push('No TTS engines are enabled');
        }

        // Check if API key authentication is properly configured
        if (this.config.security.apiKeyRequired && !process.env.ADMIN_API_KEY) {
            issues.push('API key authentication is enabled but no ADMIN_API_KEY is set');
        }

        // Check voice mappings
        if (!this.config.voiceMapping || this.config.voiceMapping.length === 0) {
            issues.push('No voice mappings configured');
        }

        return {
            valid: issues.length === 0,
            issues: issues
        };
    }
}

module.exports = ProductionConfig;
