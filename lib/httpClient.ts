import { SocksProxyAgent } from 'socks-proxy-agent';
import { AxiosRequestConfig } from 'axios';

export type OutboundConfig = Pick<AxiosRequestConfig, 'httpsAgent' | 'httpAgent'>;

// OUTBOUND_CHANNELS: 쉼표로 구분된 채널 목록
// 예: "direct,socks5://100.116.137.93:9100,socks5://proxy2:port"
// "direct"는 직접 연결, 나머지는 SOCKS5/HTTP 프록시 URL
function buildChannels(): OutboundConfig[] {
  const raw = process.env.OUTBOUND_CHANNELS || process.env.OUTBOUND_MODE || 'direct';

  // 구버전 호환: OUTBOUND_MODE=proxy + PROXY_URL
  if (raw === 'proxy') {
    const proxyUrl = process.env.PROXY_URL;
    if (!proxyUrl) throw new Error('OUTBOUND_MODE=proxy 인데 PROXY_URL이 설정되지 않았습니다');
    const agent = new SocksProxyAgent(proxyUrl);
    return [{ httpsAgent: agent, httpAgent: agent }];
  }

  if (raw === 'direct') return [{}];

  return raw.split(',').map((ch) => {
    const channel = ch.trim();
    if (channel === 'direct') return {};
    const agent = new SocksProxyAgent(channel);
    return { httpsAgent: agent, httpAgent: agent };
  });
}

const channels: OutboundConfig[] = buildChannels();
let channelIndex = 0;

export function getOutboundConfig(): OutboundConfig {
  if (channels.length === 1) return channels[0];
  return channels[channelIndex++ % channels.length];
}

// 하위 호환용 — 단일 채널 고정이 필요한 곳에서 사용
export const outboundConfig = channels[0];

function isRetryable(e: any): boolean {
  const status = e?.response?.status;
  if (!status) return true; // 네트워크 오류, 타임아웃
  if (status >= 300 && status < 400) return true; // 3xx 리다이렉트 (차단 신호)
  if (status === 401 || status === 403 || status === 429) return true; // 접근 거부
  if (status >= 500) return true; // 서버 오류
  return false; // 4xx 클라이언트 오류는 재시도해도 의미 없음
}

/**
 * 현재 채널 실패 시 다음 채널로 자동 폴백.
 * requestFn에 OutboundConfig를 넘기면 axios 등에 스프레드해서 사용.
 */
export async function fetchWithFallback<T>(
  requestFn: (config: OutboundConfig) => Promise<T>
): Promise<T> {
  const start = channelIndex;
  let lastError: unknown;

  for (let i = 0; i < channels.length; i++) {
    const idx = (start + i) % channels.length;
    try {
      const result = await requestFn(channels[idx]);
      channelIndex = (idx + 1) % channels.length;
      return result;
    } catch (e: any) {
      lastError = e;
      if (!isRetryable(e)) break;
    }
  }
  throw lastError;
}
