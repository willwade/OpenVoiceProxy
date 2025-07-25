#!/usr/bin/env node

/**
 * Script to create the initial admin API key
 * This should be run once during deployment setup
 */

const DatabaseKeyManager = require('../src/database-key-manager');
const logger = require('../src/logger');

async function createAdminKey() {
    try {
        console.log('🔑 Creating initial admin API key...');
        
        const keyManager = new DatabaseKeyManager();
        
        // Check if admin key already exists
        const existingKeys = await keyManager.listKeys();
        const adminKeys = existingKeys.filter(key => key.isAdmin);
        
        if (adminKeys.length > 0) {
            console.log('⚠️  Admin API key already exists. Existing admin keys:');
            adminKeys.forEach(key => {
                console.log(`   - ${key.name} (Created: ${key.createdAt})`);
            });
            
            const readline = require('readline');
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });
            
            const answer = await new Promise(resolve => {
                rl.question('Do you want to create another admin key? (y/N): ', resolve);
            });
            rl.close();
            
            if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
                console.log('Cancelled.');
                process.exit(0);
            }
        }
        
        // Get admin key name from environment or use default
        const keyName = process.env.ADMIN_KEY_NAME || 'Initial Admin Key';
        
        // Create the admin key
        const adminKey = await keyManager.createKey({
            name: keyName,
            isAdmin: true,
            active: true
        });
        
        console.log('✅ Admin API key created successfully!');
        console.log('');
        console.log('🔐 IMPORTANT: Save this API key securely - it will not be shown again!');
        console.log('');
        console.log('API Key:', adminKey.key);
        console.log('');
        console.log('📋 Key Details:');
        console.log('   Name:', adminKey.name);
        console.log('   Type: Admin');
        console.log('   Created:', adminKey.createdAt);
        console.log('');
        console.log('🌐 You can now access the admin interface at:');
        console.log('   http://localhost:3000/admin');
        console.log('');
        console.log('💡 For production deployment, set this as the ADMIN_API_KEY environment variable:');
        console.log(`   ADMIN_API_KEY=${adminKey.key}`);
        
    } catch (error) {
        console.error('❌ Error creating admin API key:', error);
        process.exit(1);
    }
}

// Handle command line arguments
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
    console.log('Create Admin API Key Script');
    console.log('');
    console.log('Usage: node create-admin-key.js [options]');
    console.log('');
    console.log('Options:');
    console.log('  --help, -h     Show this help message');
    console.log('');
    console.log('Environment Variables:');
    console.log('  ADMIN_KEY_NAME    Name for the admin key (default: "Initial Admin Key")');
    console.log('');
    process.exit(0);
}

// Run the script
createAdminKey().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
