const winston = require('winston');
const path = require('path');
const { app } = require('electron');

// Get user data directory for logs
const userDataPath = app?.getPath('userData') || './logs';
const logPath = path.join(userDataPath, 'tts-proxy.log');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'tts-proxy' },
    transports: [
        // Write all logs with importance level of `error` or less to `error.log`
        new winston.transports.File({ 
            filename: path.join(userDataPath, 'error.log'), 
            level: 'error' 
        }),
        // Write all logs to combined log file
        new winston.transports.File({ 
            filename: logPath 
        })
    ]
});

// If we're not in production, log to the console as well
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
        )
    }));
}

module.exports = logger;
