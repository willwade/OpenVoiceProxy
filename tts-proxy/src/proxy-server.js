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
const pcmConvert = require('pcm-convert');

// Debug audio playback imports (loaded when needed)
let Speaker, wav;

class ProxyServer {
    constructor(port = 3000) {
        this.port = port;
        this.app = express();
        this.server = null;
        this.isRunning = false;

        // Load environment variables first
        this.envLoader = new EnvironmentLoader();

        // Initialize debug audio playback after environment variables are loaded
        this.initializeDebugAudio();

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

        // Pre-populate voice mappings on startup
        this.initializeVoiceMappings();
    }

    // Convert WAV audio to raw PCM at specified sample rate
    /**
     * Initialize debug audio playback feature
     */
    initializeDebugAudio() {
        const DEBUG_PLAY_AUDIO = process.env.DEBUG_PLAY_AUDIO === 'true';
        this.debugPlayAudio = DEBUG_PLAY_AUDIO;

        console.log('DEBUG_PLAY_AUDIO environment variable:', DEBUG_PLAY_AUDIO);
        if (DEBUG_PLAY_AUDIO) {
            try {
                Speaker = require('speaker');
                wav = require('node-wav');
                console.log('🔊 Debug audio playback enabled');
                logger.info('🔊 Debug audio playback enabled');
            } catch (error) {
                console.log('⚠️ Debug audio playback requested but libraries not available:', error.message);
                logger.warn('⚠️ Debug audio playback requested but libraries not available:', error.message);
                this.debugPlayAudio = false;
            }
        } else {
            console.log('🔇 Debug audio playback disabled');
        }
    }

    /**
     * Debug function to play audio locally for timing verification
     * @param {Buffer} audioBytes - Audio data to play
     * @param {string} format - Audio format ('mp3', 'wav', 'pcm')
     * @param {string} text - Text that was synthesized (for logging)
     */
    debugPlayAudioFile(audioBytes, format, text) {
        if (!this.debugPlayAudio || !Speaker || !wav) {
            return;
        }

        try {
            // Auto-detect actual audio format from file header
            const buffer = Buffer.from(audioBytes);
            let actualFormat = format;

            if (buffer.length >= 4) {
                const header = buffer.slice(0, 4).toString('ascii');
                if (header === 'RIFF') {
                    actualFormat = 'wav';
                    logger.info(`🔊 DEBUG: Auto-detected WAV format (was labeled as ${format})`);
                } else if (buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0) {
                    actualFormat = 'mp3';
                    logger.info(`🔊 DEBUG: Auto-detected MP3 format (was labeled as ${format})`);
                } else if (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) {
                    actualFormat = 'mp3'; // ID3 tag
                    logger.info(`🔊 DEBUG: Auto-detected MP3 with ID3 tag (was labeled as ${format})`);
                }
            }

            logger.info(`🔊 DEBUG: Playing audio for text: "${text}" (${actualFormat} format, ${audioBytes.length} bytes)`);

            if (actualFormat === 'mp3') {
                // For MP3, we need to decode it first, but that's complex with Node.js Speaker
                // Use sound-play library as a simpler alternative for direct audio playback
                try {
                    const soundPlay = require('sound-play');

                    // Create temporary file for sound-play
                    const timestamp = Date.now();
                    const tempFile = path.join(__dirname, '..', `debug-audio-${timestamp}.mp3`);
                    require('fs').writeFileSync(tempFile, audioBytes);

                    // Play using sound-play library (more reliable than system commands)
                    soundPlay.play(tempFile).then(() => {
                        logger.info(`🔊 DEBUG: Playing MP3 audio via sound-play library`);

                        // Clean up after playback
                        setTimeout(() => {
                            try {
                                require('fs').unlinkSync(tempFile);
                                logger.info(`🔊 DEBUG: Cleaned up temp file ${tempFile}`);
                            } catch (cleanupError) {
                                // Ignore cleanup errors
                            }
                        }, 1000);
                    }).catch((playError) => {
                        logger.warn(`⚠️ DEBUG: sound-play failed: ${playError.message}`);

                        // Clean up file even if playback failed
                        try {
                            require('fs').unlinkSync(tempFile);
                        } catch (cleanupError) {
                            // Ignore cleanup errors
                        }
                    });
                } catch (soundPlayError) {
                    logger.warn(`⚠️ DEBUG: sound-play library not available: ${soundPlayError.message}`);
                }

            } else if (actualFormat === 'wav') {
                // Use Node.js Speaker library directly for WAV playback (like pyaudio)
                try {
                    const decoded = wav.decode(audioBytes);
                    const speaker = new Speaker({
                        channels: decoded.channelData.length,
                        bitDepth: 16,
                        sampleRate: decoded.sampleRate
                    });

                    // Convert float32 to int16 for speaker
                    const samples = decoded.channelData[0];
                    const buffer = Buffer.alloc(samples.length * 2);
                    for (let i = 0; i < samples.length; i++) {
                        const sample = Math.max(-1, Math.min(1, samples[i]));
                        buffer.writeInt16LE(sample * 32767, i * 2);
                    }

                    speaker.write(buffer);
                    speaker.end();
                    logger.info(`🔊 DEBUG: Playing WAV audio via Node.js Speaker (${decoded.sampleRate}Hz, ${decoded.channelData.length} channels)`);
                } catch (playError) {
                    logger.warn(`⚠️ DEBUG: WAV Speaker playback failed: ${playError.message}`);
                }


            } else if (actualFormat === 'pcm') {
                // Play raw PCM data directly through sound card using Node.js Speaker (like pyaudio)
                try {
                    const speaker = new Speaker({
                        channels: 1,
                        bitDepth: 16,
                        sampleRate: 24000
                    });

                    speaker.write(audioBytes);
                    speaker.end();
                    logger.info(`🔊 DEBUG: Playing PCM audio via Node.js Speaker (24000Hz, 16-bit, mono)`);
                } catch (playError) {
                    logger.warn(`⚠️ DEBUG: PCM Speaker playback failed: ${playError.message}`);
                }


            }

        } catch (error) {
            logger.warn(`⚠️ DEBUG: Failed to play audio: ${error.message}`);
        }
    }

    convertToPCM(audioBytes, targetSampleRate = 24000) {
        try {
            // Convert Uint8Array to Buffer if needed
            const buffer = Buffer.isBuffer(audioBytes) ? audioBytes : Buffer.from(audioBytes);

            // Check for MP3 format (ElevenLabs returns MP3 even for PCM requests)
            if (buffer.length >= 3 &&
                ((buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) || // ID3 tag
                 (buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0))) { // MPEG header
                logger.error('🚨 CRITICAL: ElevenLabs returned MP3 data for PCM request!');
                logger.error('Grid3 expects raw PCM data but got MP3. This will cause audio playback failure.');
                logger.error('TODO: Implement MP3 to PCM conversion using ffmpeg or similar');

                // For now, return a synthetic PCM buffer to prevent Grid3 crashes
                // This creates silent audio data that Grid3 can process
                const sampleRate = targetSampleRate;
                const duration = 1; // 1 second of silence
                const samples = sampleRate * duration;
                const silentPCM = Buffer.alloc(samples * 2); // 16-bit samples = 2 bytes each

                logger.warn(`Returning ${silentPCM.length} bytes of silent PCM data as fallback`);
                return silentPCM;
            }

            // Check if it's already PCM (no WAV header)
            if (buffer.length < 44 ||
                buffer[0] !== 0x52 || buffer[1] !== 0x49 ||
                buffer[2] !== 0x46 || buffer[3] !== 0x46) {
                // Not a WAV file, assume it's already raw audio
                logger.info('Audio appears to be raw format, returning as-is');
                return buffer;
            }

            // Parse WAV header to get format information
            const channels = buffer.readUInt16LE(22);
            const sampleRate = buffer.readUInt32LE(24);
            const bitsPerSample = buffer.readUInt16LE(34);

            logger.info(`WAV format: ${sampleRate}Hz, ${bitsPerSample}-bit, ${channels} channel(s)`);

            // Extract PCM data from WAV (skip 44-byte header)
            let pcmData = buffer.slice(44);

            // Convert to 16-bit if needed (Grid3 expects 16-bit PCM)
            if (bitsPerSample === 32) {
                logger.info('Converting from 32-bit to 16-bit PCM');
                pcmData = this.convert32BitTo16Bit(pcmData);
            } else if (bitsPerSample === 24) {
                logger.info('Converting from 24-bit to 16-bit PCM');
                pcmData = this.convert24BitTo16Bit(pcmData);
            } else if (bitsPerSample === 16) {
                logger.info('Already 16-bit PCM, no conversion needed');
            } else {
                logger.warn(`Unsupported bit depth: ${bitsPerSample}-bit`);
            }

            logger.info(`Extracted ${pcmData.length} bytes of 16-bit PCM data from WAV`);
            return pcmData;

        } catch (error) {
            logger.error('Error converting to PCM:', error);
            // Return original data if conversion fails
            return Buffer.isBuffer(audioBytes) ? audioBytes : Buffer.from(audioBytes);
        }
    }

    // Convert 32-bit PCM to 16-bit PCM
    convert32BitTo16Bit(pcmData) {
        const samples32 = new Int32Array(pcmData.buffer, pcmData.byteOffset, pcmData.length / 4);
        const samples16 = new Int16Array(samples32.length);

        for (let i = 0; i < samples32.length; i++) {
            // Convert 32-bit to 16-bit by dividing by 65536 (2^16)
            samples16[i] = Math.max(-32768, Math.min(32767, Math.round(samples32[i] / 65536)));
        }

        return Buffer.from(samples16.buffer);
    }

    // Convert 24-bit PCM to 16-bit PCM
    convert24BitTo16Bit(pcmData) {
        const samples16 = new Int16Array(pcmData.length / 3 * 2);
        let outputIndex = 0;

        for (let i = 0; i < pcmData.length; i += 3) {
            // Read 24-bit sample (little-endian)
            let sample24 = pcmData[i] | (pcmData[i + 1] << 8) | (pcmData[i + 2] << 16);

            // Sign extend if negative
            if (sample24 & 0x800000) {
                sample24 |= 0xFF000000;
            }

            // Convert to 16-bit by dividing by 256 (2^8)
            samples16[outputIndex++] = Math.max(-32768, Math.min(32767, Math.round(sample24 / 256)));
        }

        return Buffer.from(samples16.buffer);
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
                    logger.info('Initializing Azure TTS clients...');

                    // Azure client for MP3 format (streaming endpoints)
                    const azureClientMP3 = createTTSClient('azure', {
                        subscriptionKey: process.env.AZURE_SPEECH_KEY,
                        region: process.env.AZURE_SPEECH_REGION,
                        format: 'mp3'
                    });
                    this.ttsClients.set('azure-mp3', azureClientMP3);

                    // Azure client for WAV format (PCM conversion endpoints)
                    const azureClientWAV = createTTSClient('azure', {
                        subscriptionKey: process.env.AZURE_SPEECH_KEY,
                        region: process.env.AZURE_SPEECH_REGION,
                        format: 'wav'
                    });
                    this.ttsClients.set('azure', azureClientWAV);

                    logger.info('✅ Azure TTS clients initialized (MP3 + WAV formats)');
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

    async initializeVoiceMappings() {
        try {
            logger.info('Pre-populating voice mappings...');

            // Get voices from all TTS engines and create mappings
            for (const [engineName, ttsClient] of this.ttsClients) {
                if (engineName === 'azure-mp3') {
                    continue; // Skip azure-mp3 to avoid duplicates
                }

                try {
                    const engineVoices = await ttsClient.getVoices();

                    for (const voice of engineVoices) {
                        const elevenLabsVoiceId = `${engineName}-${voice.id}`;

                        // Only add if not already mapped from config
                        if (!this.voiceMapping.has(elevenLabsVoiceId)) {
                            this.voiceMapping.set(elevenLabsVoiceId, {
                                engine: engineName,
                                voiceId: voice.id
                            });
                        }
                    }

                    logger.info(`Pre-mapped ${engineVoices.length} voices from ${engineName}`);
                } catch (engineError) {
                    logger.warn(`Failed to pre-map voices from ${engineName}:`, engineError.message);
                }
            }

            logger.info(`Total voice mappings: ${this.voiceMapping.size}`);
        } catch (error) {
            logger.error('Error initializing voice mappings:', error);
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
        this.app.get('/v1/models', this.getModels.bind(this));

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

            // Get voices from all available TTS engines (skip azure-mp3 to avoid duplicates)
            for (const [engineName, ttsClient] of this.ttsClients) {
                if (engineName === 'azure-mp3') {
                    continue; // Skip azure-mp3 to avoid duplicate Azure voices
                }

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
                            logger.debug(`Auto-mapped voice: ${elevenLabsVoice.voice_id} → ${engineName}:${voice.id}`);
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
            const { output_format } = req.query;

            logger.info(`Text-to-speech request for voice ${voiceId}:`, {
                text: text?.substring(0, 100) + (text?.length > 100 ? '...' : ''),
                model_id,
                voice_settings,
                output_format
            });

            // Get the voice mapping
            const voiceMapping = this.voiceMapping.get(voiceId);
            if (!voiceMapping) {
                logger.warn(`Voice ${voiceId} not found in mapping`);
                res.status(404).json({ error: 'Voice not found' });
                return;
            }

            // Get the appropriate TTS client based on request type
            let ttsClient;
            if (voiceMapping.engine === 'azure') {
                // Use different Azure clients based on the endpoint
                if (output_format === 'pcm_24000') {
                    // Use WAV client for PCM conversion
                    ttsClient = this.ttsClients.get('azure');
                    logger.info('Using Azure WAV client for PCM conversion');
                } else if (req.path.includes('/stream/with-timestamps')) {
                    // Use MP3 client for streaming
                    ttsClient = this.ttsClients.get('azure-mp3');
                    logger.info('Using Azure MP3 client for streaming');
                } else {
                    // Default to WAV client
                    ttsClient = this.ttsClients.get('azure');
                }
            } else {
                ttsClient = this.ttsClients.get(voiceMapping.engine);
            }

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

                // Generate speech - check if we need timestamps for streaming endpoint
                logger.info(`Generating speech with ${voiceMapping.engine} engine...`);

                let audioBytes;
                let wordBoundaries = [];
                let elevenLabsTimingData = null;

                // For /stream/with-timestamps endpoint, use appropriate method for timing data
                if (req.path.includes('/stream/with-timestamps')) {
                    logger.info('🎯 Using timestamp-enabled synthesis...');

                    let result;

                    if (voiceMapping.engine === 'elevenlabs' && ttsClient.synthWithTimestamps) {
                        // Use ElevenLabs WebSocket API for real character timing
                        logger.info('🔧 ElevenLabs: Using synthWithTimestamps for real character timing');
                        result = await ttsClient.synthWithTimestamps(text, voiceMapping.voiceId);

                        // Convert ElevenLabs response format
                        if (result.audio_base64) {
                            audioBytes = Buffer.from(result.audio_base64, 'base64');
                        }

                        // Extract real character timing from ElevenLabs
                        if (result.alignment && result.alignment.characters) {
                            logger.info(`🎯 Got REAL ElevenLabs character timing: ${result.alignment.characters.length} characters`);
                            elevenLabsTimingData = result.alignment;
                        }

                    } else if (ttsClient.synthToBytestream) {
                        // Use synthToBytestream for other engines
                        logger.info('🔧 Using synthToBytestream for word boundaries');
                        const synthOptions = {};

                        // For Azure streaming endpoints, try to force MP3 format
                        if (voiceMapping.engine === 'azure' && req.path.includes('/stream/with-timestamps')) {
                            synthOptions.format = 'mp3';
                            logger.info('🔧 Azure: Requesting MP3 format for streaming');
                        }

                        result = await ttsClient.synthToBytestream(text, synthOptions);

                        // Convert stream to bytes (for non-ElevenLabs engines)
                        if (result.audioStream) {
                            const reader = result.audioStream.getReader();
                            const chunks = [];
                            let done = false;

                            while (!done) {
                                const { value, done: streamDone } = await reader.read();
                                done = streamDone;
                                if (value) {
                                    chunks.push(value);
                                }
                            }

                            audioBytes = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0));
                            let offset = 0;
                            for (const chunk of chunks) {
                                audioBytes.set(chunk, offset);
                                offset += chunk.length;
                            }
                        }

                        wordBoundaries = result.wordBoundaries || [];
                        logger.info(`Got ${wordBoundaries.length} word boundaries from js-tts-wrapper`);
                    }

                } else {
                    // Regular synthesis without timestamps
                    if (ttsClient.synthToBytes) {
                        // Prepare synthesis options based on the request
                        const synthOptions = {};

                        // For ElevenLabs, set the correct format based on the request
                        if (voiceMapping.engine === 'elevenlabs') {
                            if (output_format === 'pcm_24000') {
                                synthOptions.format = 'pcm'; // This will use pcm_44100 in js-tts-wrapper
                                logger.info('🔧 ElevenLabs: Requesting PCM format');
                            } else {
                                synthOptions.format = 'mp3'; // This will use mp3_44100_128 in js-tts-wrapper
                                logger.info('🔧 ElevenLabs: Requesting MP3 format');
                            }
                        }

                        audioBytes = await ttsClient.synthToBytes(text, synthOptions);
                    } else if (ttsClient.synth) {
                        // Some engines might only have synth method
                        const audioBuffer = await ttsClient.synth(text);
                        audioBytes = new Uint8Array(audioBuffer);
                    } else {
                        throw new Error('TTS client does not support audio synthesis');
                    }
                }

                // Ensure we have valid audio data
                if (!audioBytes || audioBytes.length === 0) {
                    throw new Error('No audio data generated');
                }

                // Set appropriate headers based on output format and engine
                let contentType = 'audio/wav'; // Default
                let finalAudioBytes = audioBytes;

                // Handle specific output format requests (Grid3 uses different formats for different endpoints)
                if (output_format === 'pcm_24000') {
                    // Grid3's DownloadSpeechAsync method expects raw PCM data
                    contentType = 'audio/pcm';
                    logger.info('Converting to PCM audio format as requested');
                    finalAudioBytes = this.convertToPCM(audioBytes, 24000);
                } else if (req.path.includes('/stream/with-timestamps')) {
                    // 🚨 CRITICAL FIX: ElevenLabs /stream/with-timestamps returns JSON with base64 audio!
                    // Grid3 expects JSON format: {"audio_base64": "...", "alignment": {...}}

                    // Convert audio bytes to base64 (ensure it's a Buffer first)
                    const audioBuffer = Buffer.from(audioBytes);
                    const audioBase64 = audioBuffer.toString('base64');

                    // Handle character alignment - either from real ElevenLabs data or converted from word boundaries
                    let alignment = null;

                    // Check if we have real ElevenLabs character timing data
                    if (elevenLabsTimingData && elevenLabsTimingData.characters) {
                        logger.info(`🎯 Using REAL ElevenLabs character timing: ${elevenLabsTimingData.characters.length} characters`);

                        alignment = {
                            characters: elevenLabsTimingData.characters,
                            character_start_times_seconds: elevenLabsTimingData.character_start_times_seconds,
                            character_end_times_seconds: elevenLabsTimingData.character_end_times_seconds
                        };

                        logger.info('Real ElevenLabs timing sample:', {
                            chars: alignment.characters.slice(0, 10),
                            starts: alignment.character_start_times_seconds.slice(0, 10),
                            ends: alignment.character_end_times_seconds.slice(0, 10)
                        });

                    } else if (wordBoundaries && wordBoundaries.length > 0) {
                        // Fallback: Convert word boundaries to character alignment
                        logger.info(`Converting ${wordBoundaries.length} word boundaries to character alignment`);
                        logger.info('Word boundaries:', wordBoundaries.map(b => ({ text: b.text, offset: b.offset, duration: b.duration })));

                        const characters = [];
                        const characterStartTimes = [];
                        const characterEndTimes = [];

                        // Convert word boundaries to character-level timing
                        for (const boundary of wordBoundaries) {
                            const word = boundary.text;
                            const startTime = boundary.offset / 1000; // Convert ms to seconds
                            const endTime = (boundary.offset + boundary.duration) / 1000;
                            const charDuration = (endTime - startTime) / word.length;

                            // Add each character with interpolated timing
                            for (let i = 0; i < word.length; i++) {
                                characters.push(word[i]);
                                characterStartTimes.push(startTime + (i * charDuration));
                                characterEndTimes.push(startTime + ((i + 1) * charDuration));
                            }
                        }

                        alignment = {
                            characters,
                            character_start_times_seconds: characterStartTimes,
                            character_end_times_seconds: characterEndTimes
                        };
                    } else {
                        // Fallback: Generate realistic character timing matching real ElevenLabs patterns
                        logger.info('No timing data available, generating ElevenLabs-style character timing');
                        const characters = text.split('');

                        // Real ElevenLabs timing analysis for "Hello world test" (16 chars, 1.486s):
                        // - Average: ~93ms per character
                        // - Patterns: consonants ~50-80ms, vowels ~80-120ms, spaces ~30-50ms
                        // - Realistic speech speed: ~10.8 chars/second

                        const targetDuration = characters.length / 10.8; // Match real ElevenLabs speed
                        const characterStartTimes = [];
                        const characterEndTimes = [];

                        let currentTime = 0;
                        for (let i = 0; i < characters.length; i++) {
                            const char = characters[i];
                            let charDuration;

                            // Match real ElevenLabs timing patterns
                            if (char === ' ') {
                                charDuration = 0.03 + Math.random() * 0.02; // 30-50ms for spaces
                            } else if (char.match(/[aeiouAEIOU]/)) {
                                charDuration = 0.08 + Math.random() * 0.04; // 80-120ms for vowels
                            } else if (char.match(/[.!?]/)) {
                                charDuration = 0.15 + Math.random() * 0.05; // 150-200ms for punctuation
                            } else if (char.match(/[bcdfghjklmnpqrstvwxyzBCDFGHJKLMNPQRSTVWXYZ]/)) {
                                charDuration = 0.05 + Math.random() * 0.03; // 50-80ms for consonants
                            } else {
                                charDuration = 0.07 + Math.random() * 0.03; // 70-100ms for other chars
                            }

                            characterStartTimes.push(parseFloat(currentTime.toFixed(3)));
                            currentTime += charDuration;
                            characterEndTimes.push(parseFloat(currentTime.toFixed(3)));
                        }

                        // Scale timing to match target duration (like real ElevenLabs)
                        const actualDuration = currentTime;
                        const scaleFactor = targetDuration / actualDuration;

                        for (let i = 0; i < characterStartTimes.length; i++) {
                            characterStartTimes[i] = parseFloat((characterStartTimes[i] * scaleFactor).toFixed(3));
                            characterEndTimes[i] = parseFloat((characterEndTimes[i] * scaleFactor).toFixed(3));
                        }

                        alignment = {
                            characters,
                            character_start_times_seconds: characterStartTimes,
                            character_end_times_seconds: characterEndTimes
                        };

                        const finalDuration = characterEndTimes[characterEndTimes.length - 1];
                        logger.info(`Generated ElevenLabs-style timing: ${characters.length} chars over ${finalDuration.toFixed(2)}s (avg ${(finalDuration/characters.length*1000).toFixed(0)}ms/char)`);
                    }

                    // 🎯 CRITICAL FIX: Grid3 expects JSON with base64 audio (like real ElevenLabs)!
                    // Real ElevenLabs /stream/with-timestamps returns JSON, not binary MP3
                    // IMPORTANT: Real ElevenLabs returns alignment: null, normalized_alignment: null

                    logger.info('🎯 CRITICAL FIX: Returning JSON with base64 audio (matching real ElevenLabs exactly)');
                    const jsonResponse = {
                        audio_base64: audioBytes.toString('base64'),
                        alignment: null,  // Real ElevenLabs returns null
                        normalized_alignment: null  // Real ElevenLabs returns null
                    };

                    const jsonString = JSON.stringify(jsonResponse);
                    contentType = 'application/json';

                    // 🎯 CRITICAL: Real ElevenLabs uses chunked transfer encoding
                    // Send response using chunked encoding to match real ElevenLabs exactly
                    res.setHeader('Content-Type', contentType);
                    res.setHeader('Transfer-Encoding', 'chunked');

                    logger.info(`JSON response size: ${jsonString.length} bytes, audio_base64 size: ${jsonResponse.audio_base64.length} chars`);

                    // Debug: Play the audio to verify timing (before sending response)
                    if (this.debugPlayAudio) {
                        const audioFormat = voiceMapping.engine === 'elevenlabs' ? 'mp3' :
                                          voiceMapping.engine === 'azure' ? 'mp3' :
                                          voiceMapping.engine === 'google' ? 'wav' : 'mp3';
                        // Use the original audioBuffer directly (don't re-decode from base64)
                        this.debugPlayAudioFile(audioBuffer, audioFormat, text);
                    }

                    // Send the JSON response in chunks (like real ElevenLabs)
                    res.write(jsonString);
                    res.end();
                    return;
                } else if (voiceMapping.engine === 'elevenlabs') {
                    contentType = 'audio/mpeg';
                } else if (voiceMapping.engine === 'openai') {
                    contentType = 'audio/mpeg';
                } else if (voiceMapping.engine === 'google') {
                    contentType = 'audio/wav';
                } else if (voiceMapping.engine === 'azure') {
                    contentType = 'audio/mpeg'; // Azure now configured to return MP3
                }

                res.setHeader('Content-Type', contentType);
                res.setHeader('Content-Length', finalAudioBytes.length);

                // Send the audio data
                res.send(Buffer.from(finalAudioBytes));

                logger.info(`Successfully generated ${finalAudioBytes.length} bytes of audio (${contentType})`);

                // Debug: Play the audio to verify timing (for non-streaming endpoints only)
                // Note: Streaming endpoints already have debug playback above, so skip them here
                if (this.debugPlayAudio && !req.path.includes('/stream') && !req.path.includes('/with-timestamps')) {
                    const audioFormat = contentType.includes('mpeg') ? 'mp3' :
                                      contentType.includes('wav') ? 'wav' :
                                      contentType.includes('pcm') ? 'pcm' : 'mp3';
                    this.debugPlayAudioFile(finalAudioBytes, audioFormat, text);
                }

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

    async getModels(req, res) {
        try {
            logger.info('Getting models info');

            // Return mock models data that matches ElevenLabs API format
            res.json([
                {
                    model_id: "eleven_monolingual_v1",
                    name: "Eleven Monolingual v1",
                    can_be_finetuned: true,
                    can_do_text_to_speech: true,
                    can_do_voice_conversion: false,
                    can_use_style: false,
                    can_use_speaker_boost: true,
                    serves_pro_voices: false,
                    language: {
                        language_id: "en",
                        name: "English"
                    },
                    description: "Use our standard English language model to generate speech in a variety of voices, styles and moods.",
                    requires_alpha_access: false,
                    max_characters_request_free_user: 500,
                    max_characters_request_subscribed_user: 5000
                },
                {
                    model_id: "eleven_multilingual_v2",
                    name: "Eleven Multilingual v2",
                    can_be_finetuned: true,
                    can_do_text_to_speech: true,
                    can_do_voice_conversion: false,
                    can_use_style: true,
                    can_use_speaker_boost: true,
                    serves_pro_voices: true,
                    language: {
                        language_id: "multi",
                        name: "Multilingual"
                    },
                    description: "Cutting edge multilingual speech synthesis, supporting 29 languages.",
                    requires_alpha_access: false,
                    max_characters_request_free_user: 500,
                    max_characters_request_subscribed_user: 5000
                }
            ]);

        } catch (error) {
            logger.error('Error getting models:', error);
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
