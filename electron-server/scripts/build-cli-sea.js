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
const staticSentinels = ['NODE_SEA']; // fallback; dynamic fuse strings will be detected from node.exe

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

// Remove Authenticode signature if signtool is available (recommended by Node SEA docs)
try {
    const signtool = spawnSync('signtool', ['/?' ], { stdio: 'ignore' });
    if (signtool.status === 0) {
        console.log('[SEA] Stripping Authenticode signature with signtool (if present)...');
        const remove = spawnSync('signtool', ['remove', '/s', nodeExe], { stdio: 'inherit' });
        if (remove.status !== 0) {
            console.warn('[SEA] signtool remove failed (continuing with unsigned copy).');
        } else {
            // Reload the unsigned exe buffer
            console.log('[SEA] Signature removal succeeded, reloading node.exe bytes...');
            const unsigned = fs.readFileSync(nodeExe);
            originalExeBuffer.set(unsigned);
        }
    } else {
        console.log('[SEA] signtool not available; continuing without signature stripping.');
    }
} catch (err) {
    console.log('[SEA] signtool check failed; continuing without signature stripping.', err.message || err);
}

console.log('[SEA] Injecting blob with postject (trying all sentinel offsets)...');
let injected = false;
let lastError = null;
try {
    const blobBuffer = fs.readFileSync(blobPath);

    const exeBufferFull = Buffer.from(originalExeBuffer);

    // Discover fuse strings baked into node.exe (e.g., NODE_SEA_FUSE_<hash>)
    const dynamicSentinels = [];
    let searchFuse = 0;
    const fusePrefix = 'NODE_SEA_FUSE';
    const fusePrefixBuf = Buffer.from(fusePrefix, 'ascii');
    while (true) {
        const idx = exeBufferFull.indexOf(fusePrefixBuf, searchFuse);
        if (idx === -1) break;
        // Extract the full ascii word starting at idx (letters, digits, underscore)
        let end = idx + fusePrefix.length;
        while (end < exeBufferFull.length) {
            const ch = exeBufferFull[end];
            if (
                (ch >= 48 && ch <= 57) || // 0-9
                (ch >= 65 && ch <= 90) || // A-Z
                (ch >= 97 && ch <= 122) || // a-z
                ch === 95 // _
            ) {
                end++;
            } else {
                break;
            }
        }
        const sentinelStr = exeBufferFull.toString('ascii', idx, end);
        if (!dynamicSentinels.includes(sentinelStr)) {
            dynamicSentinels.push(sentinelStr);
        }
        searchFuse = end;
    }

    const sentinelCandidates = [...dynamicSentinels, ...staticSentinels];
    console.log(`[SEA] Sentinel candidates: ${sentinelCandidates.join(', ') || 'none found'}`);

    for (const sentinelName of sentinelCandidates) {
        const exeBuffer = Buffer.from(originalExeBuffer);
        const sentinel = Buffer.from(sentinelName, 'ascii');
        let offsets = [];
        let search = 0;
        while (true) {
            const idx = exeBuffer.indexOf(sentinel, search);
            if (idx === -1) break;
            offsets.push(idx);
            search = idx + sentinel.length;
        }

        if (offsets.length === 0) {
            console.warn(`[SEA] Sentinel ${sentinelName} not found in node.exe, skipping.`);
            continue;
        }

        console.log(`[SEA] Found ${offsets.length} sentinel occurrence(s) for ${sentinelName}: ${offsets.join(', ')}`);

        for (const offset of offsets) {
            console.log(`[SEA] Trying sentinel ${sentinelName} at offset ${offset}...`);
            fs.writeFileSync(tempExe, originalExeBuffer);

            try {
                inject(tempExe, 'NODE_SEA_BLOB', blobBuffer, {
                    sentinelFuse: sentinelName,
                    sentinelOffset: offset
                });
            } catch (err) {
                lastError = err;
                console.warn(`[SEA] Injection failed at offset ${offset} for ${sentinelName}: ${err.message || err}`);
                continue;
            }

            const validate = spawnSync(tempExe, ['--help'], { encoding: 'utf8' });
            if (validate.status !== 0) {
                console.warn(`[SEA] Validation failed at offset ${offset} for ${sentinelName}:`, validate.stderr || validate.stdout);
                lastError = new Error(`Validation failed at offset ${offset} for ${sentinelName}`);
                continue;
            }
            if ((validate.stdout || '').includes('Usage: node')) {
                console.warn(`[SEA] Offset ${offset} for ${sentinelName} produced plain Node help. Trying next...`);
                lastError = new Error(`Plain node help at offset ${offset} for ${sentinelName}`);
                continue;
            }

            fs.copyFileSync(tempExe, outputExe);
            injected = true;
            console.log(`[SEA] Injection and validation succeeded at offset ${offset} using ${sentinelName}`);
            break;
        }

        if (injected) break;
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
