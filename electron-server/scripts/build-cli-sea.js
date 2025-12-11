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
const tempExe = path.join(distDir, 'CallTTS.tmp.exe');
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
const originalExeBuffer = fs.readFileSync(nodeExe);

console.log('[SEA] Injecting blob with postject (trying all sentinel offsets)...');
let injected = false;
let lastError = null;
try {
    const blobBuffer = fs.readFileSync(blobPath);

    // Find sentinel occurrences to avoid "multiple occurrences" error on Windows Node bins
    const exeBuffer = Buffer.from(originalExeBuffer);
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

    for (const offset of offsets) {
        console.log(`[SEA] Trying sentinel offset ${offset}...`);
        fs.writeFileSync(tempExe, originalExeBuffer);

        try {
            inject(tempExe, 'NODE_SEA_BLOB', blobBuffer, {
                sentinelFuse: 'NODE_SEA',
                sentinelOffset: offset
            });
        } catch (err) {
            lastError = err;
            console.warn(`[SEA] Injection failed at offset ${offset}: ${err.message || err}`);
            continue;
        }

        // Quick smoke-test: ensure the embedded CLI runs (not raw node.exe)
        const validate = spawnSync(tempExe, ['--help'], { encoding: 'utf8' });
        if (validate.status !== 0) {
            console.warn(`[SEA] Validation failed at offset ${offset}:`, validate.stderr || validate.stdout);
            lastError = new Error(`Validation failed at offset ${offset}`);
            continue;
        }
        if ((validate.stdout || '').includes('Usage: node')) {
            console.warn(`[SEA] Offset ${offset} produced plain Node help. Trying next offset...`);
            lastError = new Error(`Plain node help at offset ${offset}`);
            continue;
        }

        fs.copyFileSync(tempExe, outputExe);
        injected = true;
        console.log(`[SEA] Injection and validation succeeded at offset ${offset}`);
        break;
    }
} catch (err) {
    lastError = err;
}

if (!injected) {
    console.error('[SEA] Failed to inject SEA blob', lastError ? `(${lastError.message || lastError})` : '');
    process.exit(1);
}

if (fs.existsSync(tempExe)) {
    fs.unlinkSync(tempExe);
}

console.log(`[SEA] Done. Output: ${outputExe}`);
console.log(validationMarker);
