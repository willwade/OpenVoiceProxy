const { app, BrowserWindow, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const ProxyServer = require('./proxy-server');
const logger = require('./logger');
const { migrateRepoData } = require('./data-path');

class TtsProxyApp {
    constructor() {
        this.proxyServer = null;
        this.tray = null;
        this.mainWindow = null;
    }

    async initialize() {
        logger.info('Initializing TTS Proxy App');

        // Set local mode for Electron app (skip authentication)
        process.env.LOCAL_MODE = 'true';
        logger.info('Running in LOCAL_MODE - authentication disabled for desktop app');

        // Migrate any existing repo `data/` files into the runtime userData location
        try {
            migrateRepoData();
            logger.info('Repository data migration (if any) completed');
        } catch (e) {
            logger.warn('Repository data migration failed:', e.message || e);
        }

        // Create proxy server
        this.proxyServer = new ProxyServer();
        await this.proxyServer.start();

        // Create system tray
        this.createTray();

        logger.info('TTS Proxy App initialized successfully');
    }

    createTray() {
        // Create a simple icon for the tray (we'll use a basic icon for now)
        const icon = nativeImage.createFromPath(path.join(__dirname, '../assets/icon.png'));
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
                click: () => this.openUrl('http://localhost:3000/admin/')
            },
            {
                label: 'Open Configuration',
                type: 'normal',
                click: () => this.openUrl('http://localhost:3000/admin/config')
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
        logger.info('Opening logs (placeholder - will implement log viewer)');
    }

    openUrl(url) {
        const { shell } = require('electron');
        shell.openExternal(url);
    }

    async shutdown() {
        logger.info('Shutting down TTS Proxy App');
        
        if (this.proxyServer) {
            await this.proxyServer.stop();
        }
        
        if (this.tray) {
            this.tray.destroy();
        }
    }
}

// App event handlers
app.whenReady().then(async () => {
    const ttsProxyApp = new TtsProxyApp();
    await ttsProxyApp.initialize();
    
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
    app.quit();
}
