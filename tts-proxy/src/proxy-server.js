const express = require('express');
const cors = require('cors');
const path = require('path');
const logger = process.env.NODE_ENV === 'production' ?
    require('./production-logger') : require('./logger');
const { createTTSClient } = require('js-tts-wrapper');
const ConfigManager = require('./config-manager');
const ProductionConfig = require('./production-config');
const EnvironmentLoader = require('./env-loader');
const DatabaseKeyManager = require('./database-key-manager');
const AuthMiddleware = require('./auth-middleware');
const SecurityMiddleware = require('./security-middleware');

class ProxyServer {
    constructor(port = 3000) {
        this.port = port;
        this.app = express();
        this.server = null;
        this.isRunning = false;

        // Load environment variables first
        this.envLoader = new EnvironmentLoader();

        // Initialize configuration (use production config in production)
        if (process.env.NODE_ENV === 'production') {
            this.configManager = new ProductionConfig();
        } else {
            this.configManager = new ConfigManager();
        }
        this.port = this.configManager.get('network.port') || port;

        // Initialize authentication and security systems
        this.keyManager = new DatabaseKeyManager();
        this.authMiddleware = new AuthMiddleware(this.keyManager);
        this.securityMiddleware = new SecurityMiddleware();

        // Initialize TTS clients
        this.ttsClients = new Map();
        this.voiceMapping = new Map();
        this.initializeTTSClients();
        this.loadVoiceMappings();

        this.setupMiddleware();
        this.setupRoutes();
    }

    initializeTTSClients() {
        try {
            const availableEngines = this.envLoader.getAvailableEngines();
            logger.info(`Attempting to initialize engines: ${availableEngines.join(', ')}`);

            // Initialize eSpeak (works without credentials)
            if (availableEngines.includes('espeak')) {
                try {
                    logger.info('Initializing eSpeak TTS client...');
                    const espeakClient = createTTSClient('espeak');
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

    loadVoiceMappings() {
        try {
            // Load static mappings from config
            const configMappings = this.configManager.getVoiceMappings();
            for (const mapping of configMappings) {
                this.voiceMapping.set(mapping.elevenLabsId, {
                    engine: mapping.localEngine,
                    voiceId: mapping.localVoiceId
                });
            }

            logger.info(`Loaded ${configMappings.length} voice mappings from config`);
        } catch (error) {
            logger.error('Error loading voice mappings:', error);
        }
    }

    setupMiddleware() {
        // Trust proxy if configured (for DigitalOcean App Platform)
        if (process.env.TRUST_PROXY === 'true') {
            this.app.set('trust proxy', true);
        }

        // Security middleware
        this.app.use(this.securityMiddleware.securityHeaders());
        this.app.use(this.securityMiddleware.validateRequest());
        this.app.use(this.securityMiddleware.ipFilter());
        this.app.use(this.securityMiddleware.requestLogger());

        // Enable CORS for all routes
        this.app.use(cors({
            origin: process.env.CORS_ORIGIN || '*',
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
        }));

        // Parse JSON bodies with size limit
        this.app.use(express.json({
            limit: process.env.MAX_REQUEST_SIZE || '10mb',
            strict: true
        }));

        // Parse URL-encoded bodies (for admin forms)
        this.app.use(express.urlencoded({
            extended: true,
            limit: process.env.MAX_REQUEST_SIZE || '10mb'
        }));

        // Serve static files for admin interface
        this.app.use('/admin', express.static(path.join(__dirname, '..', 'public')));

        // Authentication middleware for API routes
        this.app.use('/v1', this.authMiddleware.authenticate());
    }

    setupRoutes() {
        // Health check endpoint
        this.app.get('/health', (req, res) => {
            const healthInfo = logger.getHealthInfo ? logger.getHealthInfo() : {
                status: 'ok',
                service: 'openvoiceproxy',
                timestamp: new Date().toISOString()
            };
            res.json(healthInfo);
        });

        // Metrics endpoint (basic monitoring)
        this.app.get('/metrics', (req, res) => {
            const metrics = logger.getMetrics ? logger.getMetrics() : {};
            const memUsage = process.memoryUsage();

            res.json({
                service: 'openvoiceproxy',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                memory: {
                    rss: memUsage.rss,
                    heapTotal: memUsage.heapTotal,
                    heapUsed: memUsage.heapUsed,
                    external: memUsage.external
                },
                ...metrics
            });
        });

        // Ready endpoint (for deployment health checks)
        this.app.get('/ready', async (req, res) => {
            try {
                // Check if key manager is initialized
                await this.keyManager.initialize();

                // Check if at least one TTS engine is available
                const hasEngines = this.ttsClients.size > 0;

                if (hasEngines) {
                    res.json({
                        status: 'ready',
                        engines: Array.from(this.ttsClients.keys()),
                        timestamp: new Date().toISOString()
                    });
                } else {
                    res.status(503).json({
                        status: 'not ready',
                        reason: 'No TTS engines available',
                        timestamp: new Date().toISOString()
                    });
                }
            } catch (error) {
                res.status(503).json({
                    status: 'not ready',
                    reason: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        });

        // Admin interface redirect
        this.app.get('/admin', (req, res) => {
            res.redirect('/admin/admin.html');
        });

        // ElevenLabs API v1 routes
        this.app.get('/v1/voices', this.getVoices.bind(this));
        this.app.post('/v1/text-to-speech/:voiceId/stream/with-timestamps', this.textToSpeech.bind(this));
        this.app.post('/v1/text-to-speech/:voiceId', this.textToSpeechSimple.bind(this));
        this.app.get('/v1/user', this.getUser.bind(this));

        // Admin routes (require admin API key)
        this.app.use('/admin/api', this.authMiddleware.authenticate({ adminOnly: true }));
        this.app.get('/admin/api/keys', this.adminListKeys.bind(this));
        this.app.post('/admin/api/keys', this.adminCreateKey.bind(this));
        this.app.put('/admin/api/keys/:keyId', this.adminUpdateKey.bind(this));
        this.app.delete('/admin/api/keys/:keyId', this.adminDeleteKey.bind(this));
        this.app.get('/admin/api/usage', this.adminGetUsage.bind(this));

        // Catch-all for unhandled routes
        this.app.use('*', (req, res) => {
            logger.warn(`Unhandled route: ${req.method} ${req.originalUrl}`);
            res.status(404).json({
                error: 'Route not found',
                method: req.method,
                path: req.originalUrl
            });
        });

        // Error handling middleware (must be last)
        this.app.use(this.securityMiddleware.errorHandler());
    }

    async getVoices(req, res) {
        try {
            logger.info('Getting available voices');

            const voices = [];

            // Add static voices from config first
            const configMappings = this.configManager.getVoiceMappings();
            for (const mapping of configMappings) {
                const staticVoice = {
                    voice_id: mapping.elevenLabsId,
                    name: mapping.elevenLabsName,
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
                        engine: mapping.localEngine,
                        language: 'en'
                    },
                    description: `${mapping.elevenLabsName} from ${mapping.localEngine} engine`,
                    preview_url: null,
                    available_for_tiers: [],
                    settings: {
                        stability: mapping.parameters?.stability || 0.5,
                        similarity_boost: mapping.parameters?.similarity_boost || 0.5,
                        style: 0.0,
                        use_speaker_boost: true
                    },
                    sharing: null,
                    high_quality_base_model_ids: []
                };
                voices.push(staticVoice);
            }

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

                        // Update voice mapping (only if not already mapped from config)
                        if (!this.voiceMapping.has(elevenLabsVoice.voice_id)) {
                            this.voiceMapping.set(elevenLabsVoice.voice_id, {
                                engine: engineName,
                                voiceId: voice.id
                            });
                        }
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

    // Admin API endpoints
    async adminListKeys(req, res) {
        try {
            const keys = this.keyManager.listKeys();
            res.json({ keys });
        } catch (error) {
            logger.error('Error listing API keys:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    async adminCreateKey(req, res) {
        try {
            const { name, isAdmin, active, rateLimit, expiresAt } = req.body;
            const keyData = await this.keyManager.createKey({
                name,
                isAdmin: isAdmin || false,
                active: active !== false,
                rateLimit,
                expiresAt
            });

            res.status(201).json({
                message: 'API key created successfully',
                key: {
                    id: keyData.id,
                    key: keyData.key, // Only return the key on creation
                    name: keyData.name,
                    isAdmin: keyData.isAdmin,
                    active: keyData.active,
                    createdAt: keyData.createdAt
                }
            });
        } catch (error) {
            logger.error('Error creating API key:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    async adminUpdateKey(req, res) {
        try {
            const { keyId } = req.params;
            const updates = req.body;

            const updatedKey = await this.keyManager.updateKey(keyId, updates);
            res.json({
                message: 'API key updated successfully',
                key: {
                    id: updatedKey.id,
                    name: updatedKey.name,
                    isAdmin: updatedKey.isAdmin,
                    active: updatedKey.active
                }
            });
        } catch (error) {
            if (error.message === 'API key not found') {
                res.status(404).json({ error: 'API key not found' });
            } else {
                logger.error('Error updating API key:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        }
    }

    async adminDeleteKey(req, res) {
        try {
            const { keyId } = req.params;
            await this.keyManager.deleteKey(keyId);
            res.json({ message: 'API key deleted successfully' });
        } catch (error) {
            if (error.message === 'API key not found') {
                res.status(404).json({ error: 'API key not found' });
            } else {
                logger.error('Error deleting API key:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        }
    }

    async adminGetUsage(req, res) {
        try {
            const { keyId, days } = req.query;
            const stats = this.keyManager.getUsageStats(keyId, days ? parseInt(days) : 7);
            res.json({ usage: stats });
        } catch (error) {
            logger.error('Error getting usage stats:', error);
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
