const fs = require('fs');
const path = require('path');
const logger = require('./logger');

class ConfigManager {
    constructor() {
        this.configPath = path.join(__dirname, '..', 'config.json');
        this.defaultConfig = {
            general: {
                autoStart: false,
                minimizeToTray: true,
                logLevel: 'info'
            },
            network: {
                port: 3000,
                modifyHostFile: false
            },
            voiceMapping: [
                {
                    elevenLabsId: 'local-voice-1',
                    elevenLabsName: 'Local Voice 1',
                    localEngine: 'espeak',
                    localVoiceId: 'en',
                    parameters: {
                        rate: 1.0,
                        pitch: 1.0
                    }
                },
                {
                    elevenLabsId: 'local-voice-2',
                    elevenLabsName: 'Local Voice 2',
                    localEngine: 'espeak',
                    localVoiceId: 'en-us',
                    parameters: {
                        rate: 1.0,
                        pitch: 1.0
                    }
                }
            ],
            audio: {
                format: 'wav',
                quality: 'medium',
                cacheEnabled: false,
                cachePath: './cache'
            },
            engines: {
                espeak: {
                    enabled: true,
                    priority: 1
                },
                azure: {
                    enabled: false,
                    priority: 2,
                    credentials: {
                        subscriptionKey: '',
                        region: 'westeurope'
                    }
                },
                elevenlabs: {
                    enabled: false,
                    priority: 3,
                    credentials: {
                        apiKey: ''
                    }
                }
            }
        };
        
        this.config = this.loadConfig();
    }

    loadConfig() {
        try {
            if (fs.existsSync(this.configPath)) {
                const configData = fs.readFileSync(this.configPath, 'utf8');
                const config = JSON.parse(configData);
                
                // Merge with defaults to ensure all properties exist
                return this.mergeWithDefaults(config);
            } else {
                logger.info('No config file found, creating default configuration');
                this.saveConfig(this.defaultConfig);
                return this.defaultConfig;
            }
        } catch (error) {
            logger.error('Error loading config:', error);
            return this.defaultConfig;
        }
    }

    mergeWithDefaults(config) {
        const merged = JSON.parse(JSON.stringify(this.defaultConfig));
        
        // Deep merge function
        function deepMerge(target, source) {
            for (const key in source) {
                if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                    if (!target[key]) target[key] = {};
                    deepMerge(target[key], source[key]);
                } else {
                    target[key] = source[key];
                }
            }
        }
        
        deepMerge(merged, config);
        return merged;
    }

    saveConfig(config = null) {
        try {
            const configToSave = config || this.config;
            fs.writeFileSync(this.configPath, JSON.stringify(configToSave, null, 2), 'utf8');
            logger.info('Configuration saved successfully');
            return true;
        } catch (error) {
            logger.error('Error saving config:', error);
            return false;
        }
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
        this.saveConfig();
    }

    getVoiceMappings() {
        return this.config.voiceMapping || [];
    }

    addVoiceMapping(mapping) {
        if (!this.config.voiceMapping) {
            this.config.voiceMapping = [];
        }
        
        this.config.voiceMapping.push(mapping);
        this.saveConfig();
    }

    removeVoiceMapping(elevenLabsId) {
        if (this.config.voiceMapping) {
            this.config.voiceMapping = this.config.voiceMapping.filter(
                mapping => mapping.elevenLabsId !== elevenLabsId
            );
            this.saveConfig();
        }
    }

    getEnabledEngines() {
        const engines = this.config.engines || {};
        return Object.keys(engines).filter(engine => engines[engine].enabled);
    }

    getEngineCredentials(engineName) {
        const engine = this.config.engines?.[engineName];
        return engine?.credentials || {};
    }

    updateEngineCredentials(engineName, credentials) {
        if (!this.config.engines[engineName]) {
            this.config.engines[engineName] = { enabled: false, priority: 10 };
        }
        
        this.config.engines[engineName].credentials = credentials;
        this.saveConfig();
    }

    enableEngine(engineName, enabled = true) {
        if (!this.config.engines[engineName]) {
            this.config.engines[engineName] = { priority: 10 };
        }
        
        this.config.engines[engineName].enabled = enabled;
        this.saveConfig();
    }

    exportConfig() {
        return JSON.stringify(this.config, null, 2);
    }

    importConfig(configJson) {
        try {
            const importedConfig = JSON.parse(configJson);
            this.config = this.mergeWithDefaults(importedConfig);
            this.saveConfig();
            return true;
        } catch (error) {
            logger.error('Error importing config:', error);
            return false;
        }
    }

    resetToDefaults() {
        this.config = JSON.parse(JSON.stringify(this.defaultConfig));
        this.saveConfig();
        logger.info('Configuration reset to defaults');
    }
}

module.exports = ConfigManager;
