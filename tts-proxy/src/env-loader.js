const fs = require('fs');
const path = require('path');
const logger = require('./logger');

class EnvironmentLoader {
    constructor() {
        this.loadEnvironment();
    }

    loadEnvironment() {
        try {
            // Try to load dotenv first
            try {
                require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
                logger.info('Loaded .env.local file');
            } catch (error) {
                logger.warn('dotenv not available or .env.local not found, using existing environment');
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
    }

    getAvailableEngines() {
        const engines = ['espeak']; // Always available (server-compatible)

        if (process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION) {
            engines.push('azure');
        }

        if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
            engines.push('google');
        }

        if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
            engines.push('aws-polly');
        }

        if (process.env.ELEVENLABS_API_KEY) {
            engines.push('elevenlabs');
        }

        if (process.env.OPENAI_API_KEY) {
            engines.push('openai');
        }

        return engines;
    }

    logAvailableEngines() {
        const engines = this.getAvailableEngines();
        logger.info(`Available TTS engines: ${engines.join(', ')}`);
        return engines;
    }
}

module.exports = EnvironmentLoader;
