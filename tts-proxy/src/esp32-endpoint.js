/**
 * ESP32 Speak Endpoint
 * 
 * Simple REST endpoint optimized for embedded devices like ESP32.
 * Supports voice selection, engine selection, and plain text or SSML input.
 * 
 * POST /api/speak
 * Headers:
 *   X-API-Key: <api-key>
 * Content-Type: application/json
 * 
 * Body:
 * {
 *   "text": "Hello world",           // Required: text to speak (plain or SSML)
 *   "voice": "en-US-JennyNeural",    // Optional: voice ID (engine-specific)
 *   "engine": "azure",               // Optional: azure, google, elevenlabs, openai, espeak
 *   "ssml": false,                   // Optional: if true, treat text as SSML
 *   "format": "pcm16",               // Optional: pcm16 (default), wav, mp3
 *   "sample_rate": 16000             // Optional: 8000, 16000 (default), 22050, 24000, 44100
 * }
 * 
 * Response:
 *   200 OK
 *   Content-Type: audio/pcm (or audio/wav, audio/mpeg)
 *   X-Sample-Rate: 16000
 *   X-Channels: 1
 *   X-Bits-Per-Sample: 16
 *   Body: Raw audio data
 */

const logger = process.env.NODE_ENV === 'production' ?
    require('./production-logger') : require('./logger');

class ESP32Endpoint {
    constructor(proxyServer) {
        this.proxyServer = proxyServer;
        this.defaultEngine = process.env.ESP32_DEFAULT_ENGINE || 'azure';
        this.defaultVoice = process.env.ESP32_DEFAULT_VOICE || 'en-US-JennyNeural';
        this.defaultSampleRate = parseInt(process.env.ESP32_DEFAULT_SAMPLE_RATE) || 16000;
        // Cache voices per engine to avoid repeated expensive lookups
        this.voiceCache = new Map(); // key: engineName, value: { voices, timestamp }
    }

    deriveLanguages(voice) {
        // Prefer explicit languages array
        if (voice.languages && voice.languages.length > 0) {
            return voice.languages;
        }

        const candidateCodes = [];

        if (voice.language) candidateCodes.push(voice.language);
        if (voice.locale) candidateCodes.push(voice.locale);

        // Parse from Azure-style ID, e.g., ar-SA-HamedNeural -> ar-SA
        if (voice.id) {
            const match = voice.id.match(/^([a-z]{2,3}(?:-[A-Z]{2})?)/i);
            if (match && match[1]) {
                candidateCodes.push(match[1]);
            }
        }

        // Normalize and de-dupe
        const normalized = Array.from(new Set(candidateCodes
            .filter(Boolean)
            .map((c) => c.replace('_', '-'))));

        return normalized;
    }

    /**
     * Register the /api/speak endpoint
     */
    register(app, authMiddleware) {
        // Apply auth middleware to /api routes
        app.use('/api', authMiddleware.authenticate());
        
        // Main speak endpoint
        app.post('/api/speak', this.handleSpeak.bind(this));
        
        // List available voices (for config discovery)
        app.get('/api/voices', this.handleGetVoices.bind(this));
        
        // List available engines
        app.get('/api/engines', this.handleGetEngines.bind(this));
        
        logger.info('ESP32 /api/speak endpoint registered');
    }

    setupWebSocket(wss) {
        wss.on('connection', async (ws, req) => {
            // Check authentication
            const authenticated = await this.authenticateWebSocket(ws, req);
            if (!authenticated) {
                // Connection is closed in authenticateWebSocket
                return;
            }

            logger.info('ESP32 WebSocket connected and authenticated');

            ws.on('message', async (message) => {
                try {
                    // Try to parse as JSON first (command)
                    let command;
                    try {
                        command = JSON.parse(message);
                    } catch (e) {
                        logger.warn('Received non-JSON message from WebSocket client');
                        ws.send(JSON.stringify({ error: 'Invalid JSON', code: 'INVALID_JSON' }));
                        return;
                    }

                    // Handle different command types
                    if (command.type === 'speak' || !command.type) {
                        // Default to speak if no type, or explicit type 'speak'
                        await this.handleWebSocketSpeak(ws, command);
                    } else if (command.type === 'voices') {
                        await this.handleWebSocketVoices(ws, command);
                    } else if (command.type === 'engines') {
                        await this.handleWebSocketEngines(ws, command);
                    } else {
                        ws.send(JSON.stringify({ error: 'Unknown command type', code: 'UNKNOWN_COMMAND' }));
                    }

                } catch (error) {
                    logger.error('WebSocket message handling error:', error);
                    try {
                        ws.send(JSON.stringify({ error: error.message, code: 'INTERNAL_ERROR' }));
                    } catch (sendError) {
                        // Ignore if socket is closed
                    }
                }
            });

            ws.on('close', () => {
                logger.info('ESP32 WebSocket disconnected');
            });

            ws.on('error', (error) => {
                logger.error('ESP32 WebSocket error:', error);
            });
        });

        logger.info('ESP32 WebSocket handler initialized');
    }

    async handleWebSocketSpeak(ws, command) {
        const startTime = Date.now();

        try {
            const {
                text,
                voice = this.defaultVoice,
                engine = this.defaultEngine,
                ssml = false,
                format = 'pcm16',
                sample_rate = this.defaultSampleRate,
                stream = false,
                chunk_size = 32000
            } = command;

            // Validate required fields
            if (!text || typeof text !== 'string' || text.trim().length === 0) {
                ws.send(JSON.stringify({
                    error: 'Missing or empty "text" field',
                    code: 'INVALID_TEXT'
                }));
                return;
            }

            // Limit text length for embedded devices
            const maxLength = parseInt(process.env.ESP32_MAX_TEXT_LENGTH) || 500;
            if (text.length > maxLength) {
                ws.send(JSON.stringify({
                    error: `Text exceeds maximum length of ${maxLength} characters`,
                    code: 'TEXT_TOO_LONG'
                }));
                return;
            }

            logger.info(`ESP32 WS speak request: engine=${engine}, voice=${voice}, format=${format}, len=${text.length}`);

            // Get TTS client for requested engine
            const ttsClient = this.getTTSClient(engine);
            if (!ttsClient) {
                ws.send(JSON.stringify({
                    error: `Engine "${engine}" not available`,
                    code: 'ENGINE_NOT_AVAILABLE',
                    available_engines: Array.from(this.proxyServer.ttsClients.keys())
                        .filter(k => !k.includes('-mp3'))
                }));
                return;
            }

            // Set voice
            if (ttsClient.setVoice) {
                ttsClient.setVoice(voice);
            }

            // Synthesize speech
            // Ask engine for the desired sample rate when possible
            const synthOptions = {
                ssml,
                sampleRateHz: sample_rate,
                sampleRate: sample_rate
            };

            // Request appropriate format from engine
            if (format === 'wav') {
                synthOptions.format = 'wav';
            } else if (format === 'mp3') {
                synthOptions.format = 'mp3';
            } else {
                // PCM - most engines return WAV, we'll strip the header
                synthOptions.format = 'wav';
            }

            let actualSampleRate = sample_rate;
            const chunkSize = parseInt(chunk_size, 10) > 0 ? parseInt(chunk_size, 10) : 32000;
            let totalBytesSent = 0;
            let chunksSent = 0;

            const sendChunk = (buf) => {
                if (ws.readyState !== ws.OPEN) return;
                let offset = 0;
                while (offset < buf.length) {
                    const end = Math.min(offset + chunkSize, buf.length);
                    const slice = buf.slice(offset, end);
                    ws.send(slice);
                    totalBytesSent += slice.length;
                    chunksSent += 1;
                    offset = end;
                }
            };

            const sendMeta = (bytes, extra = {}) => {
                if (ws.readyState === ws.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'meta',
                        format,
                        sample_rate: actualSampleRate,
                        engine,
                        voice,
                        bytes,
                        stream: !!stream,
                        chunk_size: stream ? chunkSize : undefined,
                        chunks: bytes && stream ? Math.ceil(bytes / chunkSize) : (stream ? undefined : 1),
                        ...extra
                    }));
                }
            };

            const sendEndSummary = (elapsedMs) => {
                if (ws.readyState === ws.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'end',
                        bytes: totalBytesSent,
                        chunks: chunksSent,
                        elapsed_ms: elapsedMs
                    }));
                }
            };

            const convertIfNeeded = (audioBuf) => {
                let finalAudio = Buffer.from(audioBuf);
                if (format === 'pcm16') {
                    const pcmResult = this.extractPCM(finalAudio);
                    finalAudio = pcmResult.pcm;
                    actualSampleRate = pcmResult.sampleRate || sample_rate;
                }
                return finalAudio;
            };

            if (ws.readyState === ws.OPEN) {
                if (stream && typeof ttsClient.synthToStream === 'function') {
                    // Try wrapper streaming API (may buffer internally, but we chunk as we receive)
                    sendMeta(undefined);
                    await ttsClient.synthToStream(
                        text,
                        (audioChunk) => {
                            const buf = convertIfNeeded(audioChunk);
                            sendChunk(buf);
                        },
                        null,
                        () => {
                            sendEndSummary(Date.now() - startTime);
                            logger.info(`ESP32 WS streamed ${totalBytesSent} bytes in ${Date.now() - startTime}ms`);
                        },
                        null,
                        synthOptions
                    );
                } else {
                    // Fallback: synth then chunk or single send
                    const audioBytes = await ttsClient.synthToBytes(text, synthOptions);

                    if (!audioBytes || audioBytes.length === 0) {
                        throw new Error('No audio data generated');
                    }

                    const finalAudio = convertIfNeeded(audioBytes);

                    if (stream) {
                        sendMeta(finalAudio.length);
                        sendChunk(finalAudio);
                        sendEndSummary(Date.now() - startTime);
                        logger.info(`ESP32 WS streamed ${finalAudio.length} bytes in ${Date.now() - startTime}ms`);
                    } else {
                        // Send meta + single binary frame
                        sendMeta(finalAudio.length, { chunks: 1 });
                        ws.send(finalAudio);
                        sendEndSummary(Date.now() - startTime);
                        logger.info(`ESP32 WS speak complete: ${finalAudio.length} bytes in ${Date.now() - startTime}ms`);
                    }
                }
            }

        } catch (error) {
            logger.error('ESP32 WS speak error:', error);
            if (ws.readyState === ws.OPEN) {
                ws.send(JSON.stringify({
                    error: error.message || 'TTS synthesis failed',
                    code: 'SYNTHESIS_ERROR'
                }));
            }
        }
    }

    async handleWebSocketVoices(ws, command) {
        try {
            const { engine } = command;
            const voices = [];
            const engines = engine ? [engine] : Array.from(this.proxyServer.ttsClients.keys());

            for (const eng of engines) {
                if (eng.includes('-mp3')) continue;
                const client = this.proxyServer.ttsClients.get(eng);
                if (!client) continue;

                try {
                    const engineVoices = await client.getVoices();
                    for (const v of engineVoices) {
                        const languages = (v.languages && v.languages.length > 0)
                            ? v.languages
                            : (v.language ? [v.language] : (v.locale ? [v.locale] : []));

                        voices.push({
                            id: v.id,
                            name: v.name,
                            language: v.language || v.locale || 'en',
                            languages,
                            locale: v.locale,
                            engine: eng
                        });
                    }
                } catch (e) {
                    logger.warn(`Failed to get voices from ${eng}: ${e.message}`);
                }
            }

            if (ws.readyState === ws.OPEN) {
                ws.send(JSON.stringify({ type: 'voices', voices, count: voices.length }));
            }
        } catch (error) {
            logger.error('WS Error getting voices:', error);
            if (ws.readyState === ws.OPEN) {
                ws.send(JSON.stringify({ error: 'Failed to get voices', code: 'VOICES_ERROR' }));
            }
        }
    }

    async handleWebSocketEngines(ws, command) {
        const engines = Array.from(this.proxyServer.ttsClients.keys())
            .filter(k => !k.includes('-mp3'))
            .map(k => ({
                id: k,
                name: k.charAt(0).toUpperCase() + k.slice(1),
                available: true
            }));

        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({
                type: 'engines',
                engines,
                default: this.defaultEngine
            }));
        }
    }

    async authenticateWebSocket(ws, req) {
        try {
            // Check if we are in development mode (skip auth)
            if (this.proxyServer.authMiddleware.isDevelopmentMode()) {
                return true;
            }

            // Extract API key from query string or headers
            let apiKey = null;

            // 1. Check query string: ?api_key=...
            const url = new URL(req.url, 'http://localhost'); // Base URL needed for parsing
            apiKey = url.searchParams.get('api_key');

            // 2. Check headers (Upgrade request headers)
            if (!apiKey) {
                apiKey = req.headers['x-api-key'] || req.headers['xi-api-key'];
            }

            // 3. Check Authorization header
            if (!apiKey && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
                apiKey = req.headers.authorization.substring(7);
            }

            if (!apiKey) {
                logger.warn('WebSocket connection rejected: Missing API key');
                ws.close(1008, 'API key required'); // 1008 Policy Violation
                return false;
            }

            // Validate API key
            const keyManager = this.proxyServer.keyManager;
            const keyInfo = await keyManager.validateKey(apiKey);

            if (!keyInfo) {
                logger.warn('WebSocket connection rejected: Invalid API key');
                ws.close(1008, 'Invalid API key');
                return false;
            }

            if (!keyInfo.active) {
                logger.warn('WebSocket connection rejected: API key disabled');
                ws.close(1008, 'API key is disabled');
                return false;
            }

            // Log successful auth (optional, but good for tracking)
            logger.debug(`WebSocket authenticated for key: ${keyInfo.name} (${keyInfo.id})`);

            return true;

        } catch (error) {
            logger.error('WebSocket authentication error:', error);
            ws.close(1011, 'Internal Server Error'); // 1011 Internal Error
            return false;
        }
    }

    async handleSpeak(req, res) {
        const startTime = Date.now();
        
        try {
            const {
                text,
                voice = this.defaultVoice,
                engine = this.defaultEngine,
                ssml = false,
                format = 'pcm16',
                sample_rate = this.defaultSampleRate
            } = req.body;

            // Validate required fields
            if (!text || typeof text !== 'string' || text.trim().length === 0) {
                return res.status(400).json({
                    error: 'Missing or empty "text" field',
                    code: 'INVALID_TEXT'
                });
            }

            // Limit text length for embedded devices
            const maxLength = parseInt(process.env.ESP32_MAX_TEXT_LENGTH) || 500;
            if (text.length > maxLength) {
                return res.status(400).json({
                    error: `Text exceeds maximum length of ${maxLength} characters`,
                    code: 'TEXT_TOO_LONG'
                });
            }

            logger.info(`ESP32 speak request: engine=${engine}, voice=${voice}, format=${format}, len=${text.length}`);

            // Get TTS client for requested engine
            const ttsClient = this.getTTSClient(engine);
            if (!ttsClient) {
                return res.status(400).json({
                    error: `Engine "${engine}" not available`,
                    code: 'ENGINE_NOT_AVAILABLE',
                    available_engines: Array.from(this.proxyServer.ttsClients.keys())
                        .filter(k => !k.includes('-mp3'))
                });
            }

            // Set voice
            if (ttsClient.setVoice) {
                ttsClient.setVoice(voice);
            }

            // Synthesize speech
            let audioBytes;
            const synthOptions = { ssml };
            
            // Request appropriate format from engine
            if (format === 'wav') {
                synthOptions.format = 'wav';
            } else if (format === 'mp3') {
                synthOptions.format = 'mp3';
            } else {
                // PCM - most engines return WAV, we'll strip the header
                synthOptions.format = 'wav';
            }

            audioBytes = await ttsClient.synthToBytes(text, synthOptions);

            if (!audioBytes || audioBytes.length === 0) {
                throw new Error('No audio data generated');
            }

            // Convert to requested format
            let finalAudio = Buffer.from(audioBytes);
            let contentType = 'audio/wav';
            let actualSampleRate = sample_rate;

            if (format === 'pcm16') {
                // Strip WAV header, extract PCM
                const pcmResult = this.extractPCM(finalAudio);
                finalAudio = pcmResult.pcm;
                actualSampleRate = pcmResult.sampleRate || sample_rate;
                contentType = 'audio/pcm';
            } else if (format === 'mp3') {
                contentType = 'audio/mpeg';
            }

            // Set response headers
            res.setHeader('Content-Type', contentType);
            res.setHeader('Content-Length', finalAudio.length);
            res.setHeader('X-Sample-Rate', actualSampleRate);
            res.setHeader('X-Channels', 1);
            res.setHeader('X-Bits-Per-Sample', 16);
            res.setHeader('X-Processing-Time-Ms', Date.now() - startTime);

            res.send(finalAudio);

            logger.info(`ESP32 speak complete: ${finalAudio.length} bytes in ${Date.now() - startTime}ms`);

        } catch (error) {
            logger.error('ESP32 speak error:', error);
            res.status(500).json({
                error: error.message || 'TTS synthesis failed',
                code: 'SYNTHESIS_ERROR'
            });
        }
    }

    async handleGetVoices(req, res) {
        try {
            const { engine } = req.query;
            const voices = [];
            const seen = new Set();

            // Get voices from specified engine or all engines
            const engines = engine ? [engine] : Array.from(this.proxyServer.ttsClients.keys());

            for (const eng of engines) {
                // Skip duplicate variants (mp3/wav)
                if (eng.includes('-mp3') || eng.includes('-wav')) continue;
                
                const client = this.proxyServer.ttsClients.get(eng);
                if (!client) continue;

                try {
                    let engineVoices = [];

                    // Serve from cache if available
                    if (this.voiceCache.has(eng)) {
                        engineVoices = this.voiceCache.get(eng).voices || [];
                    } else {
                        engineVoices = await client.getVoices();
                        this.voiceCache.set(eng, { voices: engineVoices, timestamp: Date.now() });
                    }

                    for (const v of engineVoices || []) {
                        const languages = this.deriveLanguages(v);
                        const key = `${eng}:${v.id}`;
                        if (seen.has(key)) continue;
                        seen.add(key);
                        voices.push({
                            id: v.id,
                            name: v.name,
                            language: languages[0] || v.language || v.locale || 'en',
                            languages,
                            locale: v.locale,
                            engine: eng
                        });
                    }
                } catch (e) {
                    logger.warn(`Failed to get voices from ${eng}: ${e.message}`);

                    // Fallback to pre-mapped voices if available
                    for (const [mappedId, mapping] of this.proxyServer.voiceMapping.entries()) {
                        if (mapping.engine !== eng) continue;
                        const key = `${eng}:${mapping.voiceId || mappedId}`;
                        if (seen.has(key)) continue;
                        seen.add(key);
                        const languages = this.deriveLanguages(mapping);
                        voices.push({
                            id: mapping.voiceId || mappedId,
                            name: mapping.name || mapping.voiceId || mappedId,
                            language: languages[0] || mapping.language || 'en',
                            languages: languages.length > 0 ? languages : (mapping.languages || []),
                            locale: mapping.locale,
                            engine: eng
                        });
                    }
                }
            }

            res.json({ voices, count: voices.length });
        } catch (error) {
            logger.error('Error getting voices:', error);
            res.status(500).json({ error: 'Failed to get voices' });
        }
    }

    async handleGetEngines(req, res) {
        const engines = Array.from(this.proxyServer.ttsClients.keys())
            .filter(k => !k.includes('-mp3'))
            .map(k => ({
                id: k,
                name: k.charAt(0).toUpperCase() + k.slice(1),
                available: true
            }));

        res.json({
            engines,
            default: this.defaultEngine
        });
    }

    getTTSClient(engine) {
        return this.proxyServer.ttsClients.get(engine);
    }

    extractPCM(wavBuffer) {
        // Check if it's actually a WAV file
        if (wavBuffer.length < 44 ||
            wavBuffer[0] !== 0x52 || wavBuffer[1] !== 0x49 ||
            wavBuffer[2] !== 0x46 || wavBuffer[3] !== 0x46) {
            return { pcm: wavBuffer, sampleRate: null };
        }

        const sampleRate = wavBuffer.readUInt32LE(24);
        const bitsPerSample = wavBuffer.readUInt16LE(34);

        // Find data chunk
        let dataOffset = 44;
        for (let i = 36; i < Math.min(wavBuffer.length - 8, 100); i++) {
            if (wavBuffer.toString('ascii', i, i + 4) === 'data') {
                dataOffset = i + 8;
                break;
            }
        }

        let pcm = wavBuffer.slice(dataOffset);

        // Convert bit depth if needed
        if (bitsPerSample === 32) {
            pcm = this.convert32To16(pcm);
        } else if (bitsPerSample === 24) {
            pcm = this.convert24To16(pcm);
        }

        return { pcm, sampleRate };
    }

    convert32To16(pcm32) {
        const samples = pcm32.length / 4;
        const pcm16 = Buffer.alloc(samples * 2);
        for (let i = 0; i < samples; i++) {
            const sample32 = pcm32.readInt32LE(i * 4);
            pcm16.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(sample32 / 65536))), i * 2);
        }
        return pcm16;
    }

    convert24To16(pcm24) {
        const samples = pcm24.length / 3;
        const pcm16 = Buffer.alloc(samples * 2);
        for (let i = 0; i < samples; i++) {
            let sample24 = pcm24[i*3] | (pcm24[i*3+1] << 8) | (pcm24[i*3+2] << 16);
            if (sample24 & 0x800000) sample24 |= 0xFF000000;
            pcm16.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(sample24 / 256))), i * 2);
        }
        return pcm16;
    }
}

module.exports = ESP32Endpoint;
