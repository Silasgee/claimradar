import { ExternalServiceError } from "@/lib/errors";
import { getRedis } from "./redis";

/**
 * Cache abstraction.
 *
 * Consumers (including connectors, via ConnectorContext) depend on the
 * `CacheStore` interface — never on Redis directly. This keeps business code
 * storage-agnostic and lets tests substitute an in-memory store.
 *
 * Values are JSON-serialized. Keys are namespaced (`cr:<namespace>:<key>`)
 * to prevent collisions between subsystems and to make selective
 * invalidation possible.
 */

export interface CacheStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
  /** Read-through helper: return the cached value or compute, store, and return it. */
  getOrSet<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T>;
}

const KEY_PREFIX = "cr";

export class RedisCacheStore implements CacheStore {
  constructor(private readonly namespace: string) {}

  private key(key: string): string {
    return `${KEY_PREFIX}:${this.namespace}:${key}`;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await getRedis().get(this.key(key));
      return raw === null ? null : (JSON.parse(raw) as T);
    } catch (cause) {
      throw new ExternalServiceError("redis", `Cache get failed for "${key}"`, { cause });
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    try {
      const raw = JSON.stringify(value);
      if (ttlSeconds && ttlSeconds > 0) {
        await getRedis().set(this.key(key), raw, "EX", ttlSeconds);
      } else {
        await getRedis().set(this.key(key), raw);
      }
    } catch (cause) {
      throw new ExternalServiceError("redis", `Cache set failed for "${key}"`, { cause });
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await getRedis().del(this.key(key));
    } catch (cause) {
      throw new ExternalServiceError("redis", `Cache delete failed for "${key}"`, { cause });
    }
  }

  async getOrSet<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    const value = await loader();
    await this.set(key, value, ttlSeconds);
    return value;
  }
}

/**
 * In-memory store for unit tests and connector contexts under test.
 * NOT for production use — no eviction, single-process only.
 */
export class InMemoryCacheStore implements CacheStore {
  private readonly store = new Map<string, { value: unknown; expiresAt: number | null }>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
    });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async getOrSet<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    const value = await loader();
    await this.set(key, value, ttlSeconds);
    return value;
  }
}

/** Cache scoped to a subsystem, e.g. `createCache("scans")`. */
export function createCache(namespace: string): CacheStore {
  return new RedisCacheStore(namespace);
}
