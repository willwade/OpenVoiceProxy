#!/usr/bin/env node

/**
 * Production Setup Script
 * Run this script after deployment to initialize the production environment
 */

const DatabaseKeyManager = require('../src/database-key-manager');
const logger = require('../src/production-logger');

async function setupProduction() {
    try {
        console.log('🚀 Setting up OpenVoiceProxy for production...');
        console.log('');

        // Initialize key manager
        console.log('📋 Initializing key manager...');
        const keyManager = new DatabaseKeyManager();
        await keyManager.initialize();
        console.log('✅ Key manager initialized');

        // Check if admin key exists
        console.log('');
        console.log('🔑 Checking admin API key...');
        
        const adminApiKey = process.env.ADMIN_API_KEY;
        if (!adminApiKey) {
            console.error('❌ ADMIN_API_KEY environment variable is not set');
            console.log('');
            console.log('Please set the ADMIN_API_KEY environment variable and try again.');
            process.exit(1);
        }

        // Validate admin key format
        if (!adminApiKey.startsWith('tts_')) {
            console.warn('⚠️  Admin API key should start with "tts_" for consistency');
        }

        console.log('✅ Admin API key is configured');

        // Check existing keys
        const existingKeys = await keyManager.listKeys();
        const adminKeys = existingKeys.filter(key => key.isAdmin);

        console.log('');
        console.log('📊 Current API key status:');
        console.log(`   Total keys: ${existingKeys.length}`);
        console.log(`   Admin keys: ${adminKeys.length}`);
        console.log(`   Regular keys: ${existingKeys.length - adminKeys.length}`);

        // Create initial admin key if none exist
        if (adminKeys.length === 0) {
            console.log('');
            console.log('🔧 Creating initial admin API key...');
            
            const adminKey = await keyManager.createKey({
                name: 'Production Admin Key',
                isAdmin: true,
                active: true
            });

            console.log('✅ Initial admin key created');
            console.log('');
            console.log('🔐 IMPORTANT: Save this API key securely!');
            console.log('');
            console.log(`API Key: ${adminKey.key}`);
            console.log('');
            console.log('This key will not be shown again. Use it to access the admin interface.');
        }

        // Check TTS engines
        console.log('');
        console.log('🎤 Checking TTS engine configuration...');
        
        const engines = [];
        
        if (process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION) {
            engines.push('Azure Speech Services');
        }
        
        if (process.env.ELEVENLABS_API_KEY) {
            engines.push('ElevenLabs');
        }
        
        if (process.env.OPENAI_API_KEY) {
            engines.push('OpenAI');
        }
        
        if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
            engines.push('AWS Polly');
        }
        
        if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
            engines.push('Google Cloud TTS');
        }

        if (engines.length === 0) {
            console.warn('⚠️  No TTS engines configured - only eSpeak fallback will be available');
            console.log('');
            console.log('Consider configuring at least one cloud TTS service:');
            console.log('   - Azure Speech Services (AZURE_SPEECH_KEY, AZURE_SPEECH_REGION)');
            console.log('   - ElevenLabs (ELEVENLABS_API_KEY)');
            console.log('   - OpenAI (OPENAI_API_KEY)');
            console.log('   - AWS Polly (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)');
            console.log('   - Google Cloud TTS (GOOGLE_APPLICATION_CREDENTIALS_JSON)');
        } else {
            console.log('✅ TTS engines configured:');
            engines.forEach(engine => {
                console.log(`   - ${engine}`);
            });
        }

        // Database check
        console.log('');
        console.log('🗄️  Checking database connection...');
        
        if (process.env.DATABASE_URL) {
            console.log('✅ Database URL configured');
            console.log('✅ Database tables will be created automatically');
        } else {
            console.warn('⚠️  No database configured - using file-based storage');
            console.log('   This is not recommended for production use');
        }

        // Security check
        console.log('');
        console.log('🔒 Security configuration:');
        console.log(`   API Key Required: ${process.env.API_KEY_REQUIRED || 'true'}`);
        console.log(`   CORS Origin: ${process.env.CORS_ORIGIN || '*'}`);
        console.log(`   Rate Limiting: ${process.env.RATE_LIMIT_REQUESTS || '100'} requests per ${process.env.RATE_LIMIT_WINDOW_MS || '60000'}ms`);
        console.log(`   Max Request Size: ${process.env.MAX_REQUEST_SIZE || '10mb'}`);

        // Final summary
        console.log('');
        console.log('🎉 Production setup complete!');
        console.log('');
        console.log('📋 Next steps:');
        console.log('1. Access the admin interface at: /admin');
        console.log('2. Create API keys for your applications');
        console.log('3. Test the TTS endpoints');
        console.log('4. Monitor the application logs and metrics');
        console.log('');
        console.log('📊 Monitoring endpoints:');
        console.log('   - Health check: /health');
        console.log('   - Readiness check: /ready');
        console.log('   - Metrics: /metrics');
        console.log('');
        console.log('📖 Documentation: https://github.com/willwade/TTSElevenLabsProxy/blob/main/DEPLOYMENT.md');

    } catch (error) {
        console.error('❌ Setup failed:', error);
        logger.error('Production setup failed', { error: error.message, stack: error.stack });
        process.exit(1);
    }
}

// Handle command line arguments
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
    console.log('Production Setup Script');
    console.log('');
    console.log('This script initializes the TTS Proxy for production use.');
    console.log('It checks configuration, creates initial admin keys, and validates the setup.');
    console.log('');
    console.log('Usage: node setup-production.js');
    console.log('');
    console.log('Environment Variables Required:');
    console.log('  ADMIN_API_KEY    Admin API key for management');
    console.log('');
    console.log('Optional TTS Engine Variables:');
    console.log('  AZURE_SPEECH_KEY, AZURE_SPEECH_REGION');
    console.log('  ELEVENLABS_API_KEY');
    console.log('  OPENAI_API_KEY');
    console.log('  AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY');
    console.log('  GOOGLE_APPLICATION_CREDENTIALS_JSON');
    console.log('');
    process.exit(0);
}

// Run the setup
setupProduction().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
