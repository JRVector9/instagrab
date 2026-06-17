import Redis from 'ioredis';

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (!process.env.REDIS_URL) return null;
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL, { lazyConnect: true, enableOfflineQueue: false });
  }
  return redis;
}

// KST(UTC+9) 기준 날짜
function kstDate(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export async function trackRequest(opts: {
  platform: string;
  success: boolean;
  latencyMs: number;
}) {
  const r = getRedis();
  if (!r) return;

  const key = `stats:${kstDate()}`;
  const serverId = process.env.SERVER_ID || 'default';

  const pipeline = r.pipeline();
  pipeline.hincrby(key, 'total', 1);
  pipeline.hincrby(key, opts.success ? 'success' : 'fail', 1);
  pipeline.hincrby(key, `platform:${opts.platform}`, 1);
  pipeline.hincrby(key, 'latency_ms_sum', opts.latencyMs);
  pipeline.hincrby(key, 'latency_count', 1);
  pipeline.hincrby(key, `server:${serverId}`, 1);
  pipeline.expire(key, 60 * 60 * 24 * 90); // 90일 보관
  await pipeline.exec().catch((e) => console.error('[usageTracker] Redis error:', e));
}

export async function getStats(date: string): Promise<Record<string, number> | null> {
  const r = getRedis();
  if (!r) return null;

  let data: Record<string, string> | null;
  try {
    data = await r.hgetall(`stats:${date}`);
  } catch (e) {
    console.error('[usageTracker] getStats Redis error:', e);
    return null;
  }
  if (!data || Object.keys(data).length === 0) return {};

  const result: Record<string, number> = {};
  for (const [k, v] of Object.entries(data)) {
    result[k] = Number(v);
  }

  if (result['latency_count'] > 0) {
    result['latency_ms_avg'] = Math.round(result['latency_ms_sum'] / result['latency_count']);
  }

  return result;
}
