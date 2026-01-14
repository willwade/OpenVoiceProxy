/**
 * Domain-specific errors
 * These are business logic errors that are independent of infrastructure
 */

export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: number;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      name: this.name,
    };
  }
}

// API Key Errors
export class ApiKeyNotFoundError extends DomainError {
  readonly code = 'API_KEY_NOT_FOUND';
  readonly statusCode = 401;

  constructor(message = 'API key not found') {
    super(message);
  }
}

export class ApiKeyInactiveError extends DomainError {
  readonly code = 'API_KEY_INACTIVE';
  readonly statusCode = 403;

  constructor(message = 'API key is inactive') {
    super(message);
  }
}

export class ApiKeyExpiredError extends DomainError {
  readonly code = 'API_KEY_EXPIRED';
  readonly statusCode = 403;

  constructor(message = 'API key has expired') {
    super(message);
  }
}

export class ApiKeyRateLimitedError extends DomainError {
  readonly code = 'RATE_LIMITED';
  readonly statusCode = 429;

  readonly retryAfter: number;

  constructor(retryAfter: number, message = 'Rate limit exceeded') {
    super(message);
    this.retryAfter = retryAfter;
  }
}

export class UnauthorizedError extends DomainError {
  readonly code = 'UNAUTHORIZED';
  readonly statusCode = 401;

  constructor(message = 'Unauthorized') {
    super(message);
  }
}

export class ForbiddenError extends DomainError {
  readonly code = 'FORBIDDEN';
  readonly statusCode = 403;

  constructor(message = 'Forbidden') {
    super(message);
  }
}

// TTS Errors
export class VoiceNotFoundError extends DomainError {
  readonly code = 'VOICE_NOT_FOUND';
  readonly statusCode = 404;

  constructor(voiceId: string) {
    super(`Voice not found: ${voiceId}`);
  }
}

export class EngineNotAvailableError extends DomainError {
  readonly code = 'ENGINE_NOT_AVAILABLE';
  readonly statusCode = 503;

  constructor(engine: string, reason?: string) {
    super(`Engine not available: ${engine}${reason ? ` (${reason})` : ''}`);
  }
}

export class EngineCredentialsMissingError extends DomainError {
  readonly code = 'ENGINE_CREDENTIALS_MISSING';
  readonly statusCode = 503;

  constructor(engine: string) {
    super(`Missing credentials for engine: ${engine}`);
  }
}

export class SpeechGenerationError extends DomainError {
  readonly code = 'SPEECH_GENERATION_FAILED';
  readonly statusCode = 500;

  readonly engine: string;
  readonly originalError?: Error;

  constructor(engine: string, message: string, originalError?: Error) {
    super(`Speech generation failed (${engine}): ${message}`);
    this.engine = engine;
    this.originalError = originalError;
  }
}

export class InvalidTextError extends DomainError {
  readonly code = 'INVALID_TEXT';
  readonly statusCode = 400;

  constructor(message = 'Invalid text provided') {
    super(message);
  }
}

export class TextTooLongError extends DomainError {
  readonly code = 'TEXT_TOO_LONG';
  readonly statusCode = 400;

  readonly maxLength: number;
  readonly actualLength: number;

  constructor(maxLength: number, actualLength: number) {
    super(`Text too long: ${actualLength} characters (max: ${maxLength})`);
    this.maxLength = maxLength;
    this.actualLength = actualLength;
  }
}

// Validation Errors
export class ValidationError extends DomainError {
  readonly code = 'VALIDATION_ERROR';
  readonly statusCode = 400;

  readonly field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.field = field;
  }
}

// Configuration Errors
export class ConfigurationError extends DomainError {
  readonly code = 'CONFIGURATION_ERROR';
  readonly statusCode = 500;

  constructor(message: string) {
    super(message);
  }
}

// Type guard for domain errors
export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}
