/**
 * Core shared types for OpenVoiceProxy
 */

// Re-export all type modules
export * from './api-key.types.js';
export * from './tts.types.js';
export * from './engine.types.js';
export * from './api.types.js';

// Common utility types
export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;

export interface Timestamps {
  createdAt: Date;
  updatedAt?: Date;
}

export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// Result type for operations that can fail
export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

// Async result helper
export type AsyncResult<T, E = Error> = Promise<Result<T, E>>;
