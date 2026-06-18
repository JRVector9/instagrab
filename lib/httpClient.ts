import { SocksProxyAgent } from 'socks-proxy-agent';
import { AxiosRequestConfig } from 'axios';

type OutboundConfig = Pick<AxiosRequestConfig, 'httpsAgent' | 'httpAgent'>;

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
