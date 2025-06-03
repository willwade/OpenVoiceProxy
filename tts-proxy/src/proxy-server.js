const express = require('express');
const cors = require('cors');
const logger = require('./logger');
const { createTTSClient } = require('js-tts-wrapper');
const ConfigManager = require('./config-manager');
const EnvironmentLoader = require('./env-loader');

class ProxyServer {
    constructor(port = 3000) {
        this.port = port;
        this.app = express();
        this.server = null;
        this.isRunning = false;

        // Load environment variables first
        this.envLoader = new EnvironmentLoader();

        // Initialize configuration
        this.configManager = new ConfigManager();
        this.port = this.configManager.get('network.port') || port;

        // Initialize TTS clients
        this.ttsClients = new Map();
        this.voiceMapping = new Map();
        this.initializeTTSClients();

        this.setupMiddleware();
        this.setupRoutes();
    }

    initializeTTSClients() {
        try {
            const availableEngines = this.envLoader.getAvailableEngines();
            logger.info(`Attempting to initialize engines: ${availableEngines.join(', ')}`);

            // Initialize eSpeak (works without credentials)
            if (availableEngines.includes('espeak-wasm')) {
                try {
                    logger.info('Initializing eSpeak TTS client...');
                    const espeakClient = createTTSClient('espeak-wasm');
                    this.ttsClients.set('espeak', espeakClient);
                    logger.info('✅ eSpeak TTS client initialized');
                } catch (espeakError) {
                    logger.warn('⚠️ eSpeak initialization failed:', espeakError.message);
                }
            }

            // Initialize Azure if credentials are available
            if (availableEngines.includes('azure')) {
                try {
                    logger.info('Initializing Azure TTS client...');
                    const azureClient = createTTSClient('azure', {
                        subscriptionKey: process.env.AZURE_SPEECH_KEY,
                        region: process.env.AZURE_SPEECH_REGION
                    });
                    this.ttsClients.set('azure', azureClient);
                    logger.info('✅ Azure TTS client initialized');
                } catch (azureError) {
                    logger.warn('⚠️ Azure initialization failed:', azureError.message);
                }
            }

            // Initialize Google if credentials are available
            if (availableEngines.includes('google')) {
                try {
                    logger.info('Initializing Google TTS client...');
                    const googleClient = createTTSClient('google');
                    this.ttsClients.set('google', googleClient);
                    logger.info('✅ Google TTS client initialized');
                } catch (googleError) {
                    logger.warn('⚠️ Google initialization failed:', googleError.message);
                }
            }

            // Initialize AWS Polly if credentials are available
            if (availableEngines.includes('aws-polly')) {
                try {
                    logger.info('Initializing AWS Polly TTS client...');
                    const pollyClient = createTTSClient('aws-polly', {
                        region: process.env.AWS_REGION || 'us-east-1'
                    });
                    this.ttsClients.set('aws-polly', pollyClient);
                    logger.info('✅ AWS Polly TTS client initialized');
                } catch (pollyError) {
                    logger.warn('⚠️ AWS Polly initialization failed:', pollyError.message);
                }
            }

            // Initialize ElevenLabs if API key is available
            if (availableEngines.includes('elevenlabs')) {
                try {
                    logger.info('Initializing ElevenLabs TTS client...');
                    const elevenLabsClient = createTTSClient('elevenlabs', {
                        apiKey: process.env.ELEVENLABS_API_KEY
                    });
                    this.ttsClients.set('elevenlabs', elevenLabsClient);
                    logger.info('✅ ElevenLabs TTS client initialized');
                } catch (elevenLabsError) {
                    logger.warn('⚠️ ElevenLabs initialization failed:', elevenLabsError.message);
                }
            }

            // Initialize OpenAI if API key is available
            if (availableEngines.includes('openai')) {
                try {
                    logger.info('Initializing OpenAI TTS client...');
                    const openaiClient = createTTSClient('openai', {
                        apiKey: process.env.OPENAI_API_KEY
                    });
                    this.ttsClients.set('openai', openaiClient);
                    logger.info('✅ OpenAI TTS client initialized');
                } catch (openaiError) {
                    logger.warn('⚠️ OpenAI initialization failed:', openaiError.message);
                }
            }

            // Add fallback voices if no engines worked
            if (this.ttsClients.size === 0) {
                logger.warn('No TTS engines initialized, adding mock client');
                this.ttsClients.set('mock', {
                    getVoices: () => Promise.resolve([
                        { id: 'mock-en', name: 'Mock English Voice', language: 'en' }
                    ]),
                    setVoice: () => {},
                    synthToBytes: (text) => Promise.resolve(new Uint8Array(1024)) // 1KB of silence
                });
            }

            logger.info(`TTS clients initialized: ${Array.from(this.ttsClients.keys()).join(', ')}`);
        } catch (error) {
            logger.error('Error initializing TTS clients:', error);
        }
    }

    setupMiddleware() {
        // Enable CORS for all routes
        this.app.use(cors());
        
        // Parse JSON bodies
        this.app.use(express.json());
        
        // Log all requests
        this.app.use((req, res, next) => {
            logger.info(`${req.method} ${req.path}`, {
                headers: req.headers,
                body: req.body,
                query: req.query
            });
            next();
        });
    }

    setupRoutes() {
        // Health check endpoint
        this.app.get('/health', (req, res) => {
            res.json({ 
                status: 'ok', 
                service: 'tts-proxy',
                timestamp: new Date().toISOString()
            });
        });

        // ElevenLabs API v1 routes
        this.app.get('/v1/voices', this.getVoices.bind(this));
        this.app.post('/v1/text-to-speech/:voiceId/stream/with-timestamps', this.textToSpeech.bind(this));
        this.app.post('/v1/text-to-speech/:voiceId', this.textToSpeechSimple.bind(this));
        this.app.get('/v1/user', this.getUser.bind(this));

        // Catch-all for unhandled routes
        this.app.use('*', (req, res) => {
            logger.warn(`Unhandled route: ${req.method} ${req.originalUrl}`);
            res.status(404).json({ 
                error: 'Route not found',
                method: req.method,
                path: req.originalUrl
            });
        });
    }

    async getVoices(req, res) {
        try {
            logger.info('Getting available voices');

            const voices = [];

            // Get voices from all available TTS engines
            for (const [engineName, ttsClient] of this.ttsClients) {
                try {
                    logger.info(`Getting voices from ${engineName}...`);
                    const engineVoices = await ttsClient.getVoices();

                    // Convert to ElevenLabs format
                    for (const voice of engineVoices) {
                        const elevenLabsVoice = {
                            voice_id: `${engineName}-${voice.id}`,
                            name: `${voice.name} (${engineName})`,
                            samples: null,
                            category: "premade",
                            fine_tuning: {
                                model_id: null,
                                is_allowed_to_fine_tune: false,
                                finetuning_state: "not_started",
                                verification_attempts: null,
                                verification_failures: [],
                                verification_attempts_count: 0,
                                slice_ids: null
                            },
                            labels: {
                                engine: engineName,
                                language: voice.language || 'en'
                            },
                            description: `${voice.name} voice from ${engineName} engine`,
                            preview_url: null,
                            available_for_tiers: [],
                            settings: {
                                stability: 0.5,
                                similarity_boost: 0.5,
                                style: 0.0,
                                use_speaker_boost: true
                            },
                            sharing: null,
                            high_quality_base_model_ids: []
                        };

                        voices.push(elevenLabsVoice);

                        // Update voice mapping
                        this.voiceMapping.set(elevenLabsVoice.voice_id, {
                            engine: engineName,
                            voiceId: voice.id
                        });
                    }
                } catch (engineError) {
                    logger.warn(`Failed to get voices from ${engineName}:`, engineError.message);
                }
            }

            // Add fallback voices if no engines worked
            if (voices.length === 0) {
                logger.warn('No TTS engines available, returning fallback voices');
                voices.push({
                    voice_id: "fallback-voice-1",
                    name: "Fallback Voice 1",
                    samples: null,
                    category: "premade",
                    fine_tuning: {
                        model_id: null,
                        is_allowed_to_fine_tune: false,
                        finetuning_state: "not_started",
                        verification_attempts: null,
                        verification_failures: [],
                        verification_attempts_count: 0,
                        slice_ids: null
                    },
                    labels: { engine: "fallback" },
                    description: "Fallback voice when no TTS engines are available",
                    preview_url: null,
                    available_for_tiers: [],
                    settings: {
                        stability: 0.5,
                        similarity_boost: 0.5,
                        style: 0.0,
                        use_speaker_boost: true
                    },
                    sharing: null,
                    high_quality_base_model_ids: []
                });
            }

            logger.info(`Returning ${voices.length} voices`);
            res.json({ voices });

        } catch (error) {
            logger.error('Error getting voices:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    async textToSpeech(req, res) {
        try {
            const { voiceId } = req.params;
            const { text, model_id, voice_settings } = req.body;

            logger.info(`Text-to-speech request for voice ${voiceId}:`, {
                text: text?.substring(0, 100) + (text?.length > 100 ? '...' : ''),
                model_id,
                voice_settings
            });

            // Get the voice mapping
            const voiceMapping = this.voiceMapping.get(voiceId);
            if (!voiceMapping) {
                logger.warn(`Voice ${voiceId} not found in mapping`);
                res.status(404).json({ error: 'Voice not found' });
                return;
            }

            // Get the TTS client
            const ttsClient = this.ttsClients.get(voiceMapping.engine);
            if (!ttsClient) {
                logger.error(`TTS engine ${voiceMapping.engine} not available`);
                res.status(500).json({ error: 'TTS engine not available' });
                return;
            }

            try {
                // Set the voice
                if (ttsClient.setVoice) {
                    ttsClient.setVoice(voiceMapping.voiceId);
                }

                // Generate speech - ensure we get bytes, not play audio
                logger.info(`Generating speech with ${voiceMapping.engine} engine...`);

                let audioBytes;
                if (ttsClient.synthToBytes) {
                    audioBytes = await ttsClient.synthToBytes(text);
                } else if (ttsClient.synth) {
                    // Some engines might only have synth method
                    const audioBuffer = await ttsClient.synth(text);
                    audioBytes = new Uint8Array(audioBuffer);
                } else {
                    throw new Error('TTS client does not support audio synthesis');
                }

                // Ensure we have valid audio data
                if (!audioBytes || audioBytes.length === 0) {
                    throw new Error('No audio data generated');
                }

                // Set appropriate headers based on engine
                let contentType = 'audio/wav'; // Default
                if (voiceMapping.engine === 'elevenlabs') {
                    contentType = 'audio/mpeg';
                } else if (voiceMapping.engine === 'openai') {
                    contentType = 'audio/mpeg';
                } else if (voiceMapping.engine === 'google') {
                    contentType = 'audio/wav';
                } else if (voiceMapping.engine === 'azure') {
                    contentType = 'audio/wav';
                }

                res.setHeader('Content-Type', contentType);
                res.setHeader('Content-Length', audioBytes.length);

                // Send the audio data
                res.send(Buffer.from(audioBytes));

                logger.info(`Successfully generated ${audioBytes.length} bytes of audio`);

            } catch (ttsError) {
                logger.error(`TTS generation failed:`, ttsError);

                // Fallback to silent audio
                logger.info('Falling back to silent audio');
                res.setHeader('Content-Type', 'audio/mpeg');
                const silentMp3 = Buffer.from([
                    0xFF, 0xFB, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
                ]);
                res.send(silentMp3);
            }

        } catch (error) {
            logger.error('Error in text-to-speech:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    async textToSpeechSimple(req, res) {
        // Handle the simpler endpoint without timestamps
        return this.textToSpeech(req, res);
    }

    async getUser(req, res) {
        try {
            logger.info('Getting user info');
            
            // Return mock user data
            res.json({
                subscription: {
                    tier: "starter",
                    character_count: 10000,
                    character_limit: 10000,
                    can_extend_character_limit: true,
                    allowed_to_extend_character_limit: true,
                    next_character_count_reset_unix: Math.floor(Date.now() / 1000) + 86400,
                    voice_limit: 10,
                    max_voice_add_edits: 10,
                    voice_add_edit_counter: 0,
                    professional_voice_limit: 1,
                    can_extend_voice_limit: true,
                    can_use_instant_voice_cloning: true,
                    can_use_professional_voice_cloning: true,
                    currency: "usd",
                    status: "active"
                },
                is_new_user: false,
                xi_api_key: "mock-api-key",
                can_use_delayed_payment_methods: false
            });
            
        } catch (error) {
            logger.error('Error getting user:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    async start() {
        return new Promise((resolve, reject) => {
            this.server = this.app.listen(this.port, (err) => {
                if (err) {
                    logger.error(`Failed to start proxy server on port ${this.port}:`, err);
                    reject(err);
                    return;
                }
                
                this.isRunning = true;
                logger.info(`TTS Proxy server started on port ${this.port}`);
                logger.info(`Health check: http://localhost:${this.port}/health`);
                logger.info(`Voices endpoint: http://localhost:${this.port}/v1/voices`);
                resolve();
            });
        });
    }

    async stop() {
        return new Promise((resolve) => {
            if (this.server) {
                this.server.close(() => {
                    this.isRunning = false;
                    logger.info('TTS Proxy server stopped');
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }
}

module.exports = ProxyServer;
