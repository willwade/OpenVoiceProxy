const winston = require('winston');
const path = require('path');

// Try to get electron app for user data path, fall back to ./logs for production
let userDataPath = './logs';
try {
    if (process.env.NODE_ENV !== 'production') {
        const { app } = require('electron');
        if (app && typeof app.getPath === 'function') {
            userDataPath = app.getPath('userData');
        }
    }
} catch (e) {
    // Electron not available (production server mode)
}

const logPath = path.join(userDataPath, 'tts-proxy.log');

const isProduction = process.env.NODE_ENV === 'production';

// Configure transports based on environment
const transports = [];

if (isProduction) {
    // In production (cloud), log to console (stdout) for platform log collection
    transports.push(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.errors({ stack: true }),
            winston.format.json()
        )
    }));
} else {
    // In development/Electron, log to files and console
    transports.push(
        new winston.transports.File({
            filename: path.join(userDataPath, 'error.log'),
            level: 'error'
        }),
        new winston.transports.File({
            filename: logPath
        }),
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    );
}

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'tts-proxy' },
    transports
});

module.exports = logger;
