/**
 * Build CallTTS.exe using Node's SEA (Single Executable Application) flow.
 * Must be run on Windows with a Windows `node.exe` on the PATH (or via `node` directly).
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

if (process.platform !== 'win32') {
    console.error('SEA build must be run on Windows (needs node.exe)');
    process.exit(1);
}

const projectRoot = path.resolve(__dirname, '..');
const cliEntry = path.join(projectRoot, 'cli', 'CallTTS.js');
const distDir = path.join(projectRoot, 'dist');
const blobPath = path.join(distDir, 'calltts.blob');
const seaConfigPath = path.join(distDir, 'sea-config.json');
const outputExe = path.join(distDir, 'CallTTS.exe');

// Basic SEA config
const seaConfig = {
    main: cliEntry,
    output: blobPath,
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: true,
    execArgv: ['--no-warnings'],
    execArgvExtension: 'env'
};

fs.mkdirSync(distDir, { recursive: true });
fs.writeFileSync(seaConfigPath, JSON.stringify(seaConfig, null, 2));

console.log('[SEA] Writing blob...');
const blobResult = spawnSync('node', ['--experimental-sea-config', seaConfigPath], {
    cwd: projectRoot,
    stdio: 'inherit'
});
if (blobResult.status !== 0 || !fs.existsSync(blobPath)) {
    console.error('[SEA] Failed to create blob');
    process.exit(1);
}

console.log('[SEA] Preparing executable...');
const nodeExe = process.execPath; // Windows node.exe
fs.copyFileSync(nodeExe, outputExe);

console.log('[SEA] Injecting blob with postject...');
const postjectCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const postjectResult = spawnSync(postjectCmd, [
    'postject',
    outputExe,
    'NODE_SEA_BLOB',
    blobPath,
    '--sentinel-fuse',
    'NODE_SEA'
], {
    cwd: projectRoot,
    stdio: 'inherit'
});

if (postjectResult.status !== 0) {
    console.error('[SEA] postject failed');
    process.exit(1);
}

console.log(`[SEA] Done. Output: ${outputExe}`);
