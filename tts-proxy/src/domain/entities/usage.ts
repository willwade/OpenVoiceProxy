/**
 * Usage Tracking Domain Entity
 * Tracks API usage statistics
 */

import type { EngineType } from '../../types/engine.types.js';

export interface UsageRecord {
  id: string;
  apiKeyId: string;
  engine: EngineType;
  path: string;
  characterCount: number;
  durationMs: number;
  statusCode: number;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface UsageStats {
  totalRequests: number;
  totalCharacters: number;
  totalDurationMs: number;
  successCount: number;
  errorCount: number;
  byKey: Map<string, number>;
  byEngine: Map<EngineType, number>;
  byPath: Map<string, number>;
  byStatusCode: Map<number, number>;
}

export class UsageTracker {
  private records: UsageRecord[] = [];
  private readonly maxRecords: number;

  constructor(maxRecords = 10000) {
    this.maxRecords = maxRecords;
  }

  record(params: Omit<UsageRecord, 'id' | 'timestamp'>): UsageRecord {
    const record: UsageRecord = {
      ...params,
      id: this.generateId(),
      timestamp: new Date(),
    };

    this.records.push(record);

    // Trim old records if exceeding max
    if (this.records.length > this.maxRecords) {
      this.records = this.records.slice(-this.maxRecords);
    }

    return record;
  }

  getStats(since?: Date): UsageStats {
    let filtered = this.records;
    if (since) {
      filtered = this.records.filter((r) => r.timestamp >= since);
    }

    const stats: UsageStats = {
      totalRequests: filtered.length,
      totalCharacters: 0,
      totalDurationMs: 0,
      successCount: 0,
      errorCount: 0,
      byKey: new Map(),
      byEngine: new Map(),
      byPath: new Map(),
      byStatusCode: new Map(),
    };

    for (const record of filtered) {
      stats.totalCharacters += record.characterCount;
      stats.totalDurationMs += record.durationMs;

      if (record.statusCode >= 200 && record.statusCode < 300) {
        stats.successCount++;
      } else {
        stats.errorCount++;
      }

      // By key
      const keyCount = stats.byKey.get(record.apiKeyId) ?? 0;
      stats.byKey.set(record.apiKeyId, keyCount + 1);

      // By engine
      const engineCount = stats.byEngine.get(record.engine) ?? 0;
      stats.byEngine.set(record.engine, engineCount + 1);

      // By path
      const pathCount = stats.byPath.get(record.path) ?? 0;
      stats.byPath.set(record.path, pathCount + 1);

      // By status code
      const statusCount = stats.byStatusCode.get(record.statusCode) ?? 0;
      stats.byStatusCode.set(record.statusCode, statusCount + 1);
    }

    return stats;
  }

  getRecordsByKey(apiKeyId: string, limit = 100): UsageRecord[] {
    return this.records
      .filter((r) => r.apiKeyId === apiKeyId)
      .slice(-limit);
  }

  getRecordsByEngine(engine: EngineType, limit = 100): UsageRecord[] {
    return this.records
      .filter((r) => r.engine === engine)
      .slice(-limit);
  }

  getRecentRecords(limit = 100): UsageRecord[] {
    return this.records.slice(-limit);
  }

  clear(): void {
    this.records = [];
  }

  toJSON() {
    const stats = this.getStats();
    return {
      totalRequests: stats.totalRequests,
      totalCharacters: stats.totalCharacters,
      avgDurationMs: stats.totalRequests > 0
        ? Math.round(stats.totalDurationMs / stats.totalRequests)
        : 0,
      successRate: stats.totalRequests > 0
        ? Math.round((stats.successCount / stats.totalRequests) * 100)
        : 0,
      byKey: Object.fromEntries(stats.byKey),
      byEngine: Object.fromEntries(stats.byEngine),
      byPath: Object.fromEntries(stats.byPath),
    };
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }
}

/**
 * Rate limiter for API keys
 */
export interface RateLimitState {
  count: number;
  windowStart: number;
}

export class RateLimiter {
  private readonly limits: Map<string, RateLimitState> = new Map();
  private readonly windowMs: number;

  constructor(windowMs = 60000) {
    this.windowMs = windowMs;
  }

  check(keyId: string, limit: number): { allowed: boolean; remaining: number; resetAt: Date } {
    const now = Date.now();
    const state = this.limits.get(keyId);

    // New window or first request
    if (!state || now - state.windowStart >= this.windowMs) {
      this.limits.set(keyId, { count: 1, windowStart: now });
      return {
        allowed: true,
        remaining: limit - 1,
        resetAt: new Date(now + this.windowMs),
      };
    }

    // Within current window
    const remaining = limit - state.count - 1;
    const resetAt = new Date(state.windowStart + this.windowMs);

    if (state.count >= limit) {
      return { allowed: false, remaining: 0, resetAt };
    }

    state.count++;
    return { allowed: true, remaining: Math.max(0, remaining), resetAt };
  }

  reset(keyId: string): void {
    this.limits.delete(keyId);
  }

  cleanup(): void {
    const now = Date.now();
    for (const [keyId, state] of this.limits.entries()) {
      if (now - state.windowStart >= this.windowMs) {
        this.limits.delete(keyId);
      }
    }
  }
}
