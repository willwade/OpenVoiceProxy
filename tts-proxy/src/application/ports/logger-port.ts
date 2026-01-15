/**
 * Logger Port
 * Interface for logging operations
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogMeta {
  [key: string]: unknown;
}

export interface LoggerPort {
  /**
   * Log a debug message
   */
  debug(message: string, meta?: LogMeta): void;

  /**
   * Log an info message
   */
  info(message: string, meta?: LogMeta): void;

  /**
   * Log a warning message
   */
  warn(message: string, meta?: LogMeta): void;

  /**
   * Log an error message
   */
  error(message: string, error?: Error | unknown, meta?: LogMeta): void;

  /**
   * Create a child logger with default metadata
   */
  child(meta: LogMeta): LoggerPort;

  /**
   * Set the minimum log level
   */
  setLevel(level: LogLevel): void;

  /**
   * Get the current log level
   */
  getLevel(): LogLevel;

  /**
   * Check if a level would be logged
   */
  isLevelEnabled(level: LogLevel): boolean;
}

/**
 * Request-scoped logger with request context
 */
export interface RequestLoggerPort extends LoggerPort {
  /**
   * Request ID for correlation
   */
  readonly requestId: string;

  /**
   * Log request start
   */
  logRequest(params: {
    method: string;
    path: string;
    ip?: string;
    userAgent?: string;
  }): void;

  /**
   * Log request completion
   */
  logResponse(params: {
    statusCode: number;
    durationMs: number;
    contentLength?: number;
  }): void;

  /**
   * Log request error
   */
  logRequestError(error: Error, statusCode?: number): void;
}

/**
 * Factory for creating loggers
 */
export interface LoggerFactoryPort {
  /**
   * Create a logger with a specific context
   */
  createLogger(context: string): LoggerPort;

  /**
   * Create a request-scoped logger
   */
  createRequestLogger(requestId: string): RequestLoggerPort;

  /**
   * Configure global log settings
   */
  configure(config: {
    level?: LogLevel;
    format?: 'json' | 'pretty';
    destination?: 'console' | 'file' | 'both';
    filePath?: string;
  }): void;
}
