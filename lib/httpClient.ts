import { SocksProxyAgent } from 'socks-proxy-agent';
import { AxiosRequestConfig } from 'axios';

function buildOutboundConfig(): Pick<AxiosRequestConfig, 'httpsAgent' | 'httpAgent'> {
  const mode = process.env.OUTBOUND_MODE || 'direct';
  const proxyUrl = process.env.PROXY_URL; // socks5://user:pass@host:port

  if (mode === 'direct') return {};
  if (!proxyUrl) throw new Error('OUTBOUND_MODE=proxy 인데 PROXY_URL이 설정되지 않았습니다');

  const agent = new SocksProxyAgent(proxyUrl);
  return { httpsAgent: agent, httpAgent: agent };
}

// 서버 시작 시 한 번만 생성 — 요청마다 재생성 불필요
export const outboundConfig = buildOutboundConfig();
