/**
 * Build CallTTS.exe using Node's SEA (Single Executable Application) flow.
 * Must be run on Windows with a Windows `node.exe` on the PATH (or via `node` directly).
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { inject } = require('postject');

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
const validationMarker = '[CallTTS CLI ready]';

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
try {
    const blobBuffer = fs.readFileSync(blobPath);

    // Find sentinel occurrences to avoid "multiple occurrences" error on Windows Node bins
    const exeBuffer = fs.readFileSync(outputExe);
    const sentinel = Buffer.from('NODE_SEA', 'ascii');
    let offsets = [];
    let search = 0;
    while (true) {
        const idx = exeBuffer.indexOf(sentinel, search);
        if (idx === -1) break;
        offsets.push(idx);
        search = idx + sentinel.length;
    }

    if (offsets.length === 0) {
        throw new Error('Sentinel NODE_SEA not found in node.exe');
    }

    console.log(`[SEA] Found ${offsets.length} sentinel occurrence(s): ${offsets.join(', ')}`);
    const keepOffset = offsets[0]; // first occurrence is the supported fuse

    inject(outputExe, 'NODE_SEA_BLOB', blobBuffer, {
        sentinelFuse: 'NODE_SEA',
        sentinelOffset: keepOffset
    });
} catch (err) {
    console.error('[SEA] postject failed:', err.message || err);
    process.exit(1);
}

console.log(`[SEA] Done. Output: ${outputExe}`);

// Quick smoke-test: ensure the embedded CLI runs (not raw node.exe)
console.log('[SEA] Validating CLI entrypoint...');
const validate = spawnSync(outputExe, ['--help'], { encoding: 'utf8' });
if (validate.status !== 0) {
    console.error('[SEA] Validation failed to execute CallTTS.exe', validate.stderr || validate.stdout);
    process.exit(1);
}
if ((validate.stdout || '').includes('Usage: node')) {
    console.error('[SEA] Validation detected plain node usage output. The blob was not injected correctly.');
    process.exit(1);
}
console.log(validationMarker);
