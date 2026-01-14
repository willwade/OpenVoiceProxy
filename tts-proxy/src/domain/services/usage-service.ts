/**
 * Usage Domain Service
 * Business logic for usage tracking and rate limiting
 */

import { UsageTracker, RateLimiter, type UsageRecord, type UsageStats } from '../entities/usage.js';
import type { EngineType } from '../../types/engine.types.js';
import type { RateLimitInfo } from '../../types/api-key.types.js';
import { ApiKeyRateLimitedError } from '../errors/domain-errors.js';

export interface UsageServiceConfig {
  rateLimitWindowMs: number;
  maxRecords: number;
  cleanupIntervalMs: number;
}

const DEFAULT_CONFIG: UsageServiceConfig = {
  rateLimitWindowMs: 60000, // 1 minute
  maxRecords: 10000,
  cleanupIntervalMs: 300000, // 5 minutes
};

export class UsageService {
  private readonly config: UsageServiceConfig;
  private readonly tracker: UsageTracker;
  private readonly rateLimiter: RateLimiter;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(config?: Partial<UsageServiceConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.tracker = new UsageTracker(this.config.maxRecords);
    this.rateLimiter = new RateLimiter(this.config.rateLimitWindowMs);

    // Start periodic cleanup
    this.startCleanup();
  }

  /**
   * Check rate limit for an API key
   */
  checkRateLimit(keyId: string, limit: number): RateLimitInfo {
    const result = this.rateLimiter.check(keyId, limit);
    return {
      remaining: result.remaining,
      limit,
      resetAt: result.resetAt,
      isLimited: !result.allowed,
    };
  }

  /**
   * Check and throw if rate limited
   */
  checkRateLimitOrThrow(keyId: string, limit: number): RateLimitInfo {
    const result = this.checkRateLimit(keyId, limit);
    if (result.isLimited) {
      const retryAfter = Math.ceil((result.resetAt.getTime() - Date.now()) / 1000);
      throw new ApiKeyRateLimitedError(retryAfter);
    }
    return result;
  }

  /**
   * Record a TTS request
   */
  recordRequest(params: {
    apiKeyId: string;
    engine: EngineType;
    path: string;
    characterCount: number;
    durationMs: number;
    statusCode: number;
    metadata?: Record<string, unknown>;
  }): UsageRecord {
    return this.tracker.record(params);
  }

  /**
   * Get usage statistics
   */
  getStats(since?: Date): UsageStats {
    return this.tracker.getStats(since);
  }

  /**
   * Get usage statistics for a specific API key
   */
  getKeyStats(keyId: string, limit = 100): {
    records: UsageRecord[];
    totalRequests: number;
    totalCharacters: number;
  } {
    const records = this.tracker.getRecordsByKey(keyId, limit);
    return {
      records,
      totalRequests: records.length,
      totalCharacters: records.reduce((sum, r) => sum + r.characterCount, 0),
    };
  }

  /**
   * Get usage statistics for a specific engine
   */
  getEngineStats(engine: EngineType, limit = 100): {
    records: UsageRecord[];
    totalRequests: number;
    avgDurationMs: number;
  } {
    const records = this.tracker.getRecordsByEngine(engine, limit);
    const totalDuration = records.reduce((sum, r) => sum + r.durationMs, 0);
    return {
      records,
      totalRequests: records.length,
      avgDurationMs: records.length > 0 ? Math.round(totalDuration / records.length) : 0,
    };
  }

  /**
   * Get recent requests
   */
  getRecentRequests(limit = 100): UsageRecord[] {
    return this.tracker.getRecentRecords(limit);
  }

  /**
   * Get formatted stats for API response
   */
  getFormattedStats(since?: Date) {
    const stats = this.getStats(since);
    return {
      totalRequests: stats.totalRequests,
      totalCharacters: stats.totalCharacters,
      successRate:
        stats.totalRequests > 0
          ? Math.round((stats.successCount / stats.totalRequests) * 100)
          : 100,
      avgDurationMs:
        stats.totalRequests > 0
          ? Math.round(stats.totalDurationMs / stats.totalRequests)
          : 0,
      byKey: Object.fromEntries(stats.byKey),
      byEngine: Object.fromEntries(stats.byEngine),
      byPath: Object.fromEntries(stats.byPath),
    };
  }

  /**
   * Reset rate limit for a specific key
   */
  resetRateLimit(keyId: string): void {
    this.rateLimiter.reset(keyId);
  }

  /**
   * Clear all usage data
   */
  clearAll(): void {
    this.tracker.clear();
  }

  /**
   * Stop the service (cleanup timers)
   */
  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.rateLimiter.cleanup();
    }, this.config.cleanupIntervalMs);

    // Don't keep Node.js running just for cleanup
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }
}

// Singleton instance
let usageServiceInstance: UsageService | null = null;

export function getUsageService(config?: Partial<UsageServiceConfig>): UsageService {
  if (!usageServiceInstance) {
    usageServiceInstance = new UsageService(config);
  }
  return usageServiceInstance;
}
