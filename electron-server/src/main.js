const { app, BrowserWindow, Tray, Menu, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

let logFilePath = null;
function log(message, level = 'info') {
    const line = `[${new Date().toISOString()}] [${level}] ${message}`;
    if (level === 'error') {
        console.error(line);
    } else {
        console.log(line);
    }
    if (logFilePath) {
        try {
            fs.appendFileSync(logFilePath, `${line}\n`, 'utf8');
        } catch {
            // Ignore logging failures.
        }
    }
}

class TtsProxyApp {
    constructor() {
        this.proxyServer = null;
        this.tray = null;
        this.mainWindow = null;
        this.keepAliveWindow = null;
    }

    async initialize() {
        log('Initializing TTS Proxy App');

        process.env.LOCAL_MODE = 'true';
        process.env.OPENVOICEPROXY_DATA_DIR = app.getPath('userData');
        log('Running in LOCAL_MODE - authentication disabled for desktop app');

        // Create proxy server
        const { ProxyServer } = await loadProxyServer();
        this.proxyServer = new ProxyServer({
            dataDir: process.env.OPENVOICEPROXY_DATA_DIR,
            localMode: true
        });
        await this.proxyServer.start();

        // Create system tray
        this.createTray();

        log('TTS Proxy App initialized successfully');
    }

    createTray() {
        // Create a simple icon for the tray (we'll use a basic icon for now)
        const icon = nativeImage.createFromPath(path.join(__dirname, '../assets/icon.png'));
        if (icon.isEmpty()) {
            log('Tray icon failed to load; keeping app alive without tray.', 'error');
            this.ensureKeepAliveWindow();
            return;
        }
        this.tray = new Tray(icon.resize({ width: 16, height: 16 }));
        
        const contextMenu = Menu.buildFromTemplate([
            {
                label: 'TTS Proxy Status',
                type: 'normal',
                enabled: false
            },
            {
                label: `Server: ${this.proxyServer?.isRunning ? 'Running' : 'Stopped'}`,
                type: 'normal',
                enabled: false
            },
            {
                label: `Port: ${this.proxyServer?.port || 'N/A'}`,
                type: 'normal',
                enabled: false
            },
            { type: 'separator' },
            {
                label: 'Open Admin Interface',
                type: 'normal',
                click: () => this.openUrl(this.getAdminUrl('/admin/'))
            },
            {
                label: 'Open CLI Configuration',
                type: 'normal',
                click: () => this.openUrl(this.getAdminUrl('/admin/cli-config'))
            },
            { type: 'separator' },
            {
                label: 'Show Local Config',
                type: 'normal',
                click: () => this.showConfigWindow()
            },
            {
                label: 'View Logs',
                type: 'normal',
                click: () => this.showLogs()
            },
            { type: 'separator' },
            {
                label: 'Quit',
                type: 'normal',
                click: () => app.quit()
            }
        ]);
        
        this.tray.setContextMenu(contextMenu);
        this.tray.setToolTip('Grid3 TTS Proxy');
    }

    ensureKeepAliveWindow() {
        if (this.keepAliveWindow) return;
        this.keepAliveWindow = new BrowserWindow({
            width: 1,
            height: 1,
            show: false,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true
            }
        });
        this.keepAliveWindow.on('closed', () => {
            this.keepAliveWindow = null;
        });
    }

    showConfigWindow() {
        if (this.mainWindow) {
            this.mainWindow.focus();
            return;
        }

        this.mainWindow = new BrowserWindow({
            width: 800,
            height: 600,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            },
            icon: path.join(__dirname, '../assets/icon.png')
        });

        this.mainWindow.loadFile(path.join(__dirname, '../ui/config.html'));
        
        this.mainWindow.on('closed', () => {
            this.mainWindow = null;
        });
    }

    showLogs() {
        log('Opening logs (placeholder - will implement log viewer)');
    }

    openUrl(url) {
        const { shell } = require('electron');
        shell.openExternal(url);
    }

    async shutdown() {
        log('Shutting down TTS Proxy App');
        
        if (this.proxyServer) {
            await this.proxyServer.stop();
        }
        
        if (this.tray) {
            this.tray.destroy();
        }

        if (this.keepAliveWindow) {
            this.keepAliveWindow.close();
        }
    }

    getAdminUrl(pathname) {
        const port = this.proxyServer?.port || 3000;
        return `http://localhost:${port}${pathname}`;
    }
}

async function loadProxyServer() {
    try {
        return await import('openvoiceproxy/dist/proxy-server.js');
    } catch (error) {
        const packagedPath = path.join(process.resourcesPath, 'openvoiceproxy', 'dist', 'proxy-server.js');
        log(`Falling back to packaged proxy server at ${packagedPath}`, 'warn');
        return await import(pathToFileURL(packagedPath).href);
    }
}

// App event handlers
app.whenReady().then(async () => {
    const logsDir = path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    logFilePath = path.join(logsDir, 'main.log');
    log(`Logging to ${logFilePath}`);

    const ttsProxyApp = new TtsProxyApp();
    try {
        await ttsProxyApp.initialize();
    } catch (error) {
        log(`Failed to initialize: ${error && error.stack ? error.stack : String(error)}`, 'error');
        throw error;
    }
    
    // Store reference for cleanup
    app.ttsProxyApp = ttsProxyApp;
});

app.on('window-all-closed', () => {
    // Don't quit on macOS when all windows are closed
    if (process.platform !== 'darwin') {
        // Keep running in system tray
    }
});

app.on('before-quit', async () => {
    if (app.ttsProxyApp) {
        await app.ttsProxyApp.shutdown();
    }
});

// Handle second instance
app.on('second-instance', () => {
    if (app.ttsProxyApp && app.ttsProxyApp.mainWindow) {
        if (app.ttsProxyApp.mainWindow.isMinimized()) {
            app.ttsProxyApp.mainWindow.restore();
        }
        app.ttsProxyApp.mainWindow.focus();
    }
});

// Ensure single instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    log('Another instance is already running, exiting.');
    app.quit();
}

process.on('unhandledRejection', (reason) => {
    log(`Unhandled rejection: ${reason && reason.stack ? reason.stack : String(reason)}`, 'error');
});

process.on('uncaughtException', (error) => {
    log(`Uncaught exception: ${error && error.stack ? error.stack : String(error)}`, 'error');
});
