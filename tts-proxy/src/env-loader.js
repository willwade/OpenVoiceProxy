const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const logger = require('./logger');

class EnvironmentLoader {
    constructor() {
        this.loadEnvironment();
    }

    loadEnvironment() {
        try {
            // Priority order (first found wins for each variable):
            // 1. .env.local in tts-proxy/ (local overrides)
            // 2. .env.local in project root (local overrides)
            // 3. .env in tts-proxy/ (defaults)
            // 4. .env in project root (defaults)
            const envCandidates = [
                path.join(__dirname, '..', '..', '.env.local'),  // root .env.local (highest priority)
                path.join(__dirname, '..', '.env.local'),        // tts-proxy/.env.local
                path.join(__dirname, '..', '..', '.env'),        // root .env
                path.join(__dirname, '..', '.env'),              // tts-proxy/.env
            ];

            // Load in reverse order so higher priority files override lower priority
            // Use override: true to allow .env.local to override .env values
            const loadedFiles = [];
            for (const envPath of envCandidates.reverse()) {
                if (fs.existsSync(envPath)) {
                    // Use override: true so later files (higher priority) can override
                    dotenv.config({ path: envPath, override: true });
                    loadedFiles.unshift(path.relative(process.cwd(), envPath));
                }
            }

            if (loadedFiles.length > 0) {
                logger.info(`Loaded environment files (in priority order): ${loadedFiles.join(', ')}`);
            } else {
                logger.warn('No .env/.env.local files found, using existing environment variables');
            }

            // Map your existing environment variables to expected names
            this.mapEnvironmentVariables();

            logger.info('Environment variables mapped successfully');
        } catch (error) {
            logger.error('Error loading environment:', error);
        }
    }

    mapEnvironmentVariables() {
        // Map Microsoft/Azure variables
        if (process.env.MICROSOFT_TOKEN && !process.env.AZURE_SPEECH_KEY) {
            process.env.AZURE_SPEECH_KEY = process.env.MICROSOFT_TOKEN;
            logger.info('Mapped MICROSOFT_TOKEN to AZURE_SPEECH_KEY');
        }
        
        if (process.env.MICROSOFT_REGION && !process.env.AZURE_SPEECH_REGION) {
            process.env.AZURE_SPEECH_REGION = process.env.MICROSOFT_REGION;
            logger.info('Mapped MICROSOFT_REGION to AZURE_SPEECH_REGION');
        }

        // Map Google variables
        if (process.env.GOOGLE_SA_FILE_B64 && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
            // Create temporary credentials file from base64
            try {
                const credentialsJson = Buffer.from(process.env.GOOGLE_SA_FILE_B64, 'base64').toString('utf8');
                const tempCredentialsPath = path.join(__dirname, '..', 'temp-google-credentials.json');
                fs.writeFileSync(tempCredentialsPath, credentialsJson);
                process.env.GOOGLE_APPLICATION_CREDENTIALS = tempCredentialsPath;
                logger.info('Created Google credentials file from base64');
            } catch (error) {
                logger.warn('Failed to create Google credentials file:', error.message);
            }
        }

        if (process.env.GOOGLE_KEY && !process.env.GOOGLECLOUDTTS_API_KEY) {
            process.env.GOOGLECLOUDTTS_API_KEY = process.env.GOOGLE_KEY;
            logger.info('Mapped GOOGLE_KEY to GOOGLECLOUDTTS_API_KEY (Google REST API key)');
        }

        if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
            try {
                const credentialsSource = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
                const json = typeof credentialsSource === 'string' && credentialsSource.trim().startsWith('{')
                    ? credentialsSource
                    : JSON.stringify(JSON.parse(credentialsSource));
                const tempCredentialsPath = path.join(__dirname, '..', 'temp-google-credentials.json');
                fs.writeFileSync(tempCredentialsPath, json);
                process.env.GOOGLE_APPLICATION_CREDENTIALS = tempCredentialsPath;
                logger.info('Created Google credentials file from GOOGLE_APPLICATION_CREDENTIALS_JSON');
            } catch (error) {
                logger.warn('Failed to parse GOOGLE_APPLICATION_CREDENTIALS_JSON:', error.message);
            }
        }

        // Map AWS Polly variables
        if (process.env.POLLY_AWS_KEY_ID && !process.env.AWS_ACCESS_KEY_ID) {
            process.env.AWS_ACCESS_KEY_ID = process.env.POLLY_AWS_KEY_ID;
            logger.info('Mapped POLLY_AWS_KEY_ID to AWS_ACCESS_KEY_ID');
        }
        
        if (process.env.POLLY_AWS_ACCESS_KEY && !process.env.AWS_SECRET_ACCESS_KEY) {
            process.env.AWS_SECRET_ACCESS_KEY = process.env.POLLY_AWS_ACCESS_KEY;
            logger.info('Mapped POLLY_AWS_ACCESS_KEY to AWS_SECRET_ACCESS_KEY');
        }
        
        if (process.env.POLLY_REGION && !process.env.AWS_REGION) {
            process.env.AWS_REGION = process.env.POLLY_REGION;
            logger.info('Mapped POLLY_REGION to AWS_REGION');
        }

        // ElevenLabs is already correctly named
        if (process.env.ELEVENLABS_API_KEY) {
            logger.info('ElevenLabs API key found');
        }

        // OpenAI is already correctly named
        if (process.env.OPENAI_API_KEY) {
            logger.info('OpenAI API key found');
        }

        // Watson/IBM variables (if js-tts-wrapper supports them)
        if (process.env.WATSON_API_KEY) {
            logger.info('Watson API key found');
        }

        // PlayHT variables (if js-tts-wrapper supports them)
        if (process.env.PLAYHT_API_KEY) {
            logger.info('PlayHT API key found');
        }

        if (process.env.UPLIFTAI_KEY && !process.env.UPLIFTAI_API_KEY) {
            process.env.UPLIFTAI_API_KEY = process.env.UPLIFTAI_KEY;
            logger.info('Mapped UPLIFTAI_KEY to UPLIFTAI_API_KEY');
        }
    }

    getAvailableEngines() {
        const engines = ['espeak']; // Always available (server-compatible)

        if (process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION) {
            engines.push('azure');
        }

        if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLECLOUDTTS_API_KEY) {
            engines.push('google');
        }

        if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
            engines.push('polly');
        }

        if (process.env.ELEVENLABS_API_KEY) {
            engines.push('elevenlabs');
        }

        if (process.env.OPENAI_API_KEY) {
            engines.push('openai');
        }

        if (process.env.PLAYHT_API_KEY && process.env.PLAYHT_USER_ID) {
            engines.push('playht');
        }

        if (process.env.WATSON_API_KEY && process.env.WATSON_REGION && process.env.WATSON_INSTANCE_ID) {
            engines.push('watson');
        }

        if (process.env.UPLIFTAI_API_KEY) {
            engines.push('upliftai');
        }

        if (process.env.WITAI_TOKEN) {
            engines.push('witai');
        }

        if (process.env.SHERPAONNX_DISABLED !== 'true') {
            try {
                // Only advertise sherpaonnx when the native module is available
                require.resolve('sherpa-onnx-node');
                engines.push('sherpaonnx');
            } catch (err) {
                logger.info('SherpaOnnx native module not installed, skipping sherpaonnx engine');
            }
        }

        if (process.platform === 'win32') {
            engines.push('sapi');
        }

        return engines;
    }

    logAvailableEngines() {
        const engines = this.getAvailableEngines();
        logger.info(`Available TTS engines: ${engines.join(', ')}`);
        const nodeOnlyEngines = engines.filter(engine => ['espeak', 'sherpaonnx', 'sapi'].includes(engine));
        if (nodeOnlyEngines.length) {
            logger.info(`Node-only engines (ignoring -wasm variants): ${nodeOnlyEngines.join(', ')}`);
        }
        return engines;
    }
}

module.exports = EnvironmentLoader;
