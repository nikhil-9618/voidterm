import { getRedis } from './redis';

type MemoryEntry = { value: string; expiresAt: number };

const memory = new Map<string, MemoryEntry>();

/**
 * Tiny cache facade over Upstash Redis with an in-process fallback.
 *
 * The fallback exists for local development and single-instance previews. In a
 * multi-instance production deployment, set UPSTASH_REDIS_REST_* so cached
 * values (e.g. intent classifications) are shared.
 */
export async function cacheGet(key: string): Promise<string | null> {
  const redis = getRedis();
  if (redis) {
    try {
      const value = await redis.get<string>(key);
      return value ?? null;
    } catch (error) {
      console.error('[cache] redis get failed', error instanceof Error ? error.message : 'unknown');
    }
  }

  const entry = memory.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    memory.delete(key);
    return null;
  }
  return entry.value;
}

export async function cacheSet(key: string, value: string, ttlSeconds: number): Promise<void> {
  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(key, value, { ex: ttlSeconds });
      return;
    } catch (error) {
      console.error('[cache] redis set failed', error instanceof Error ? error.message : 'unknown');
    }
  }

  if (memory.size > 5_000) {
    const now = Date.now();
    for (const [k, v] of memory) {
      if (v.expiresAt <= now) memory.delete(k);
    }
  }
  memory.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1_000 });
}
