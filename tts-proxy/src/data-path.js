const path = require('path');
const fs = require('fs');

function getDataDir() {
    // Precedence:
    // 1. OPENVOICEPROXY_DATA_DIR env var
    // 2. Electron app.getPath('userData')
    // 3. Fallback to repo-relative ../data
    let base = null;

    if (process.env.OPENVOICEPROXY_DATA_DIR) {
        base = process.env.OPENVOICEPROXY_DATA_DIR;
    } else {
        try {
            if (process.versions && process.versions.electron) {
                const { app } = require('electron');
                if (app && typeof app.getPath === 'function') {
                    base = app.getPath('userData');
                }
            }
        } catch (e) {
            // ignore
        }
    }

    let dataDir;
    if (process.env.OPENVOICEPROXY_DATA_DIR) {
        // If explicitly provided, use it directly as the data directory
        dataDir = process.env.OPENVOICEPROXY_DATA_DIR;
    } else if (base && base !== path.join(__dirname, '..', 'data')) {
        // Running inside Electron: use userData/<appName>/data
        dataDir = path.join(base, 'data');
    } else {
        // Fallback to repo-relative data folder
        dataDir = path.join(__dirname, '..', 'data');
    }

    try {
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
    } catch (e) {
        // If creation fails, throw so callers can handle/log
        throw e;
    }

    return dataDir;
}

function migrateRepoData() {
    // Copy files from repo `data/` into the runtime data dir if they don't exist
    const dataDir = getDataDir();
    const repoDataDir = path.join(__dirname, '..', 'data');
    const filesToCopy = ['api-keys.json', 'system-credentials.json', 'usage-logs.json'];

    try {
        if (!fs.existsSync(repoDataDir)) return;

        for (const fname of filesToCopy) {
            const src = path.join(repoDataDir, fname);
            const dest = path.join(dataDir, fname);
            try {
                if (fs.existsSync(src) && !fs.existsSync(dest)) {
                    fs.copyFileSync(src, dest);
                }
            } catch (e) {
                // Ignore individual file copy failures but log to console
                console.warn(`Migration: failed to copy ${src} -> ${dest}:`, e.message || e);
            }
        }
    } catch (e) {
        // If migration fails, propagate a warning via console but don't crash startup
        console.warn('Migration from repo data failed:', e.message || e);
    }
}

module.exports = { getDataDir, migrateRepoData };
