import { Redis } from '@upstash/redis';
import { env } from './env';

let client: Redis | null | undefined;

/**
 * Upstash client, or null when the deployment has not configured Upstash.
 * We never throw here: local development and preview builds must boot without
 * external services, and the rate limiter / intent cache have local fallbacks.
 */
export function getRedis(): Redis | null {
  if (client !== undefined) return client;

  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    client = null;
    return client;
  }

  client = new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
  return client;
}
