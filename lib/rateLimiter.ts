import { createHash } from 'crypto';
import { NextResponse } from 'next/server';
import Redis from 'ioredis';
import { RateLimiterRedis } from 'rate-limiter-flexible';

let redisClient: Redis | null = null;
let minuteLimiter: RateLimiterRedis | null = null;
let hourLimiter: RateLimiterRedis | null = null;

let consecutiveRedisFailures = 0;
let circuitOpenUntil = 0;

function getRedis(): Redis | null {
  if (!process.env.REDIS_URL) return null;
  if (!redisClient) {
    redisClient = new Redis(process.env.REDIS_URL, { enableOfflineQueue: false });
  }
  return redisClient;
}

function getLimiters(): { minute: RateLimiterRedis; hour: RateLimiterRedis } | null {
  const client = getRedis();
  if (!client) return null;

  if (!minuteLimiter) {
    minuteLimiter = new RateLimiterRedis({ storeClient: client, keyPrefix: 'rl:min', points: 30, duration: 60 });
  }
  if (!hourLimiter) {
    hourLimiter = new RateLimiterRedis({ storeClient: client, keyPrefix: 'rl:hr', points: 300, duration: 3600 });
  }
  return { minute: minuteLimiter, hour: hourLimiter };
}

function keyOf(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex').slice(0, 32);
}

export async function checkRateLimit(apiKey: string): Promise<NextResponse | null> {
  const limiters = getLimiters();
  if (!limiters) return null;

  // Circuit breaker: 연속 실패 3회 후 30초간 fail-closed
  if (Date.now() < circuitOpenUntil) {
    return NextResponse.json(
      { success: false, error: 'Service temporarily unavailable' },
      { status: 503 }
    );
  }

  const id = keyOf(apiKey);

  try {
    // 시간당 제한 먼저 검사 → 거절 시 분당 카운터 소모 방지
    let hourRes;
    try {
      hourRes = await limiters.hour.consume(id);
    } catch (e: any) {
      if (e?.msBeforeNext !== undefined) {
        const reset = Date.now() + e.msBeforeNext;
        return NextResponse.json(
          { success: false, error: 'Rate limit exceeded (per hour)' },
          {
            status: 429,
            headers: {
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': String(reset),
              'Retry-After': String(Math.ceil(e.msBeforeNext / 1000)),
            },
          }
        );
      }
      throw e;
    }

    try {
      await limiters.minute.consume(id);
    } catch (e: any) {
      if (e?.msBeforeNext !== undefined) {
        // 분당 제한 초과 시 시간당 카운트 복구
        await limiters.hour.reward(id).catch(() => {});
        const reset = Date.now() + e.msBeforeNext;
        return NextResponse.json(
          { success: false, error: 'Rate limit exceeded (per minute)' },
          {
            status: 429,
            headers: {
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': String(reset),
              'Retry-After': String(Math.ceil(e.msBeforeNext / 1000)),
            },
          }
        );
      }
      throw e;
    }

    consecutiveRedisFailures = 0;
  } catch (e) {
    consecutiveRedisFailures++;
    if (consecutiveRedisFailures >= 3) {
      circuitOpenUntil = Date.now() + 30_000;
      consecutiveRedisFailures = 0;
    }
    console.error('[rateLimiter] Redis error — 요청 통과 처리:', e);
    return null;
  }

  return null;
}
