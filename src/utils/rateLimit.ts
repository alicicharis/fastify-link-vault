import type Redis from 'ioredis';

export function createRateLimiter(
  redis: Redis,
  key: string,
  max: number,
  windowSecs: number,
) {
  return async (): Promise<{ allowed: boolean; retryAfter: number }> => {
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, windowSecs);
    }
    if (count > max) {
      const ttl = await redis.ttl(key);
      return { allowed: false, retryAfter: ttl > 0 ? ttl : windowSecs };
    }
    return { allowed: true, retryAfter: 0 };
  };
}
