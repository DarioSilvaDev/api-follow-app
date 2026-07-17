import { Injectable } from '@nestjs/common';
import { ResolvedPermissions } from '../types/auth.types';

interface CacheEntry {
  data: ResolvedPermissions;
  expiresAt: number;
}

@Injectable()
export class PermissionCache {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly defaultTtlMs: number;

  constructor(ttlMs = 5 * 60 * 1000) {
    this.defaultTtlMs = ttlMs;
  }

  get(key: string): ResolvedPermissions | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.data;
  }

  set(key: string, data: ResolvedPermissions, ttl?: number): void {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + (ttl ?? this.defaultTtlMs),
    });
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  invalidateUser(userId: string): void {
    for (const key of this.cache.keys()) {
      if (key === userId || key.startsWith(`${userId}:`)) {
        this.cache.delete(key);
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }
}
