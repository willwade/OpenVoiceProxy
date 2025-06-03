const HostManager = require('./src/host-manager');

async function main() {
    const hostManager = new HostManager();
    const args = process.argv.slice(2);
    const command = args[0];

    console.log('🔧 TTS Proxy Host Manager');
    console.log('=' .repeat(40));

    try {
        switch (command) {
            case 'status':
                await showStatus(hostManager);
                break;
            case 'add':
                await addRedirect(hostManager);
                break;
            case 'remove':
                await removeRedirect(hostManager);
                break;
            case 'restore':
                await restoreHosts(hostManager);
                break;
            default:
                showHelp();
                break;
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

async function showStatus(hostManager) {
    console.log('📊 Current Status:');
    const status = await hostManager.getStatus();
    
    console.log(`   Admin Rights: ${status.hasAdmin ? '✅ Yes' : '❌ No'}`);
    console.log(`   Redirect Active: ${status.hasRedirect ? '✅ Yes' : '❌ No'}`);
    console.log(`   Backup Exists: ${status.hasBackup ? '✅ Yes' : '❌ No'}`);
    console.log(`   Hosts File: ${status.hostsPath}`);
    
    if (status.error) {
        console.log(`   Error: ${status.error}`);
    }
    
    if (!status.hasAdmin) {
        console.log('\n⚠️  Run as Administrator to modify hosts file');
    }
    
    if (status.hasRedirect) {
        console.log('\n✅ ElevenLabs API calls will be redirected to localhost:3000');
    } else {
        console.log('\n💡 Run "node manage-hosts.js add" to enable redirection');
    }
}

async function addRedirect(hostManager) {
    console.log('➕ Adding ElevenLabs redirect...');
    
    const status = await hostManager.getStatus();
    if (!status.hasAdmin) {
        console.log('❌ Administrator privileges required');
        console.log('💡 Right-click Command Prompt and "Run as Administrator"');
        process.exit(1);
    }
    
    if (status.hasRedirect) {
        console.log('✅ Redirect already exists');
        return;
    }
    
    await hostManager.addProxyRedirect();
    console.log('✅ Successfully added ElevenLabs redirect');
    console.log('🔄 DNS cache flushed');
    console.log('📡 api.elevenlabs.io now points to localhost:3000');
}

async function removeRedirect(hostManager) {
    console.log('➖ Removing ElevenLabs redirect...');
    
    const status = await hostManager.getStatus();
    if (!status.hasAdmin) {
        console.log('❌ Administrator privileges required');
        console.log('💡 Right-click Command Prompt and "Run as Administrator"');
        process.exit(1);
    }
    
    if (!status.hasRedirect) {
        console.log('✅ No redirect to remove');
        return;
    }
    
    await hostManager.removeProxyRedirect();
    console.log('✅ Successfully removed ElevenLabs redirect');
    console.log('🔄 DNS cache flushed');
    console.log('📡 api.elevenlabs.io restored to normal');
}

async function restoreHosts(hostManager) {
    console.log('🔄 Restoring hosts file from backup...');
    
    const status = await hostManager.getStatus();
    if (!status.hasAdmin) {
        console.log('❌ Administrator privileges required');
        process.exit(1);
    }
    
    if (!status.hasBackup) {
        console.log('❌ No backup file found');
        process.exit(1);
    }
    
    await hostManager.restoreHostsFile();
    console.log('✅ Hosts file restored from backup');
    console.log('🔄 DNS cache flushed');
}

function showHelp() {
    console.log('Usage: node manage-hosts.js <command>');
    console.log('');
    console.log('Commands:');
    console.log('  status   - Show current hosts file status');
    console.log('  add      - Add ElevenLabs redirect (requires admin)');
    console.log('  remove   - Remove ElevenLabs redirect (requires admin)');
    console.log('  restore  - Restore hosts file from backup (requires admin)');
    console.log('');
    console.log('Examples:');
    console.log('  node manage-hosts.js status');
    console.log('  node manage-hosts.js add');
    console.log('  node manage-hosts.js remove');
    console.log('');
    console.log('⚠️  Admin commands must be run as Administrator');
}

main();
