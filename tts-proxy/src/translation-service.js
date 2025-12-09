const axios = require('axios');
const logger = require('./logger');

/**
 * Translation service supporting Google Translate and Azure Translator
 */
class TranslationService {
    constructor() {
        this.googleApiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
        this.azureKey = process.env.AZURE_TRANSLATOR_KEY;
        this.azureRegion = process.env.AZURE_TRANSLATOR_REGION || 'global';
        this.azureEndpoint = process.env.AZURE_TRANSLATOR_ENDPOINT || 'https://api.cognitive.microsofttranslator.com';
        
        // Cache for languages (they don't change often)
        this.languageCache = {
            google: { data: null, timestamp: null },
            azure: { data: null, timestamp: null }
        };
        this.cacheDuration = 24 * 60 * 60 * 1000; // 24 hours
    }

    /**
     * Get supported languages from Google Translate
     */
    async getGoogleLanguages() {
        // Check cache
        if (this.languageCache.google.data && 
            Date.now() - this.languageCache.google.timestamp < this.cacheDuration) {
            return this.languageCache.google.data;
        }

        if (!this.googleApiKey) {
            throw new Error('Google Translate API key not configured');
        }

        try {
            const response = await axios.get('https://translation.googleapis.com/language/translate/v2/languages', {
                params: {
                    key: this.googleApiKey,
                    target: 'en' // Get language names in English
                }
            });

            const languages = response.data.data.languages.map(lang => ({
                code: lang.language,
                name: lang.name
            }));

            // Cache the result
            this.languageCache.google = {
                data: languages,
                timestamp: Date.now()
            };

            logger.info(`Fetched ${languages.length} languages from Google Translate`);
            return languages;
        } catch (error) {
            logger.error('Failed to fetch Google Translate languages:', error.message);
            throw new Error(`Google Translate API error: ${error.message}`);
        }
    }

    /**
     * Get supported languages from Azure Translator
     */
    async getAzureLanguages() {
        // Check cache
        if (this.languageCache.azure.data && 
            Date.now() - this.languageCache.azure.timestamp < this.cacheDuration) {
            return this.languageCache.azure.data;
        }

        if (!this.azureKey) {
            throw new Error('Azure Translator key not configured');
        }

        try {
            const response = await axios.get(`${this.azureEndpoint}/languages`, {
                params: {
                    'api-version': '3.0'
                },
                headers: {
                    'Ocp-Apim-Subscription-Key': this.azureKey,
                    'Ocp-Apim-Subscription-Region': this.azureRegion
                }
            });

            const translationLangs = response.data.translation || {};
            const languages = Object.entries(translationLangs).map(([code, info]) => ({
                code: code,
                name: info.name,
                nativeName: info.nativeName,
                dir: info.dir
            }));

            // Cache the result
            this.languageCache.azure = {
                data: languages,
                timestamp: Date.now()
            };

            logger.info(`Fetched ${languages.length} languages from Azure Translator`);
            return languages;
        } catch (error) {
            logger.error('Failed to fetch Azure Translator languages:', error.message);
            throw new Error(`Azure Translator API error: ${error.message}`);
        }
    }

    /**
     * Get transliteration scripts from Azure
     */
    async getAzureTransliterationScripts() {
        if (!this.azureKey) {
            throw new Error('Azure Translator key not configured');
        }

        try {
            const response = await axios.get(`${this.azureEndpoint}/languages`, {
                params: {
                    'api-version': '3.0'
                },
                headers: {
                    'Ocp-Apim-Subscription-Key': this.azureKey,
                    'Ocp-Apim-Subscription-Region': this.azureRegion
                }
            });

            const transliteration = response.data.transliteration || {};
            const scripts = new Map();

            // Extract unique scripts from transliteration data
            Object.entries(transliteration).forEach(([langCode, info]) => {
                info.scripts?.forEach(script => {
                    if (!scripts.has(script.code)) {
                        scripts.set(script.code, {
                            code: script.code,
                            name: script.name,
                            nativeName: script.nativeName,
                            dir: script.dir
                        });
                    }
                });
            });

            return Array.from(scripts.values());
        } catch (error) {
            logger.error('Failed to fetch Azure transliteration scripts:', error.message);
            throw new Error(`Azure Translator API error: ${error.message}`);
        }
    }
}

module.exports = TranslationService;

