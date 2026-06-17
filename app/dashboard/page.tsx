'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

// ─── Types ────────────────────────────────────────────────────────────────────

type StatsRecord = Record<string, number>;
type DayData = { date: string; stats: StatsRecord };

type Settings = {
  dateMode: 'today' | '7days' | '30days' | 'custom';
  customStart: string;
  customEnd: string;
  cards: { total: boolean; successRate: boolean; avgLatency: boolean; failCount: boolean };
  platforms: { instagram: boolean; twitter: boolean; threads: boolean; linkedin: boolean };
  trendChartType: 'line' | 'bar';
  platformChartType: 'bar' | 'donut';
  refreshInterval: 0 | 10 | 30 | 60;
  alertThresholds: { failRate: number; latencyMs: number };
};

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULTS: Settings = {
  dateMode: '7days',
  customStart: '',
  customEnd: '',
  cards: { total: true, successRate: true, avgLatency: true, failCount: true },
  platforms: { instagram: true, twitter: true, threads: true, linkedin: true },
  trendChartType: 'line',
  platformChartType: 'bar',
  refreshInterval: 30,
  alertThresholds: { failRate: 5, latencyMs: 3000 },
};

const PLATFORM_COLORS: Record<string, string> = {
  instagram: '#E1306C',
  twitter: '#1D9BF0',
  threads: '#6B7280',
  linkedin: '#0A66C2',
};

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  twitter: 'Twitter/X',
  threads: 'Threads',
  linkedin: 'LinkedIn',
};

const CARD_OPTIONS: Array<[keyof Settings['cards'], string]> = [
  ['total', '총 호출'],
  ['successRate', '성공률'],
  ['avgLatency', '평균 지연'],
  ['failCount', '실패 수'],
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function kstToday(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function addDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function getDateRange(s: Settings): string[] {
  const today = kstToday();
  if (s.dateMode === 'today') return [today];
  if (s.dateMode === '7days') return Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  if (s.dateMode === '30days') return Array.from({ length: 30 }, (_, i) => addDays(today, i - 29));
  if (s.dateMode === 'custom' && s.customStart && s.customEnd) {
    const dates: string[] = [];
    let cur = s.customStart;
    while (cur <= s.customEnd && dates.length < 90) { dates.push(cur); cur = addDays(cur, 1); }
    return dates;
  }
  return [today];
}

function aggregate(data: DayData[]): StatsRecord {
  const out: StatsRecord = {};
  for (const { stats } of data) {
    for (const [k, v] of Object.entries(stats)) {
      if (k === 'latency_ms_avg') continue;
      out[k] = (out[k] ?? 0) + v;
    }
  }
  if ((out.latency_count ?? 0) > 0) {
    out.latency_ms_avg = Math.round(out.latency_ms_sum / out.latency_count);
  }
  return out;
}

function fmt(n: number | undefined, unit = ''): string {
  if (n === undefined || isNaN(n)) return '—';
  return n.toLocaleString() + unit;
}

function downloadBlob(content: string, filename: string, type: string) {
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([content], { type })),
    download: filename,
  });
  a.click();
  URL.revokeObjectURL(a.href);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [apiKey, setApiKey] = useState('');
  const [authed, setAuthed] = useState(false);
  const [keyInput, setKeyInput] = useState('');

  const [settings, setSettings] = useState<Settings>(() => {
    if (typeof window === 'undefined') return DEFAULTS;
    try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('grabit-dash') ?? '{}') }; }
    catch { return DEFAULTS; }
  });

  const [data, setData] = useState<DayData[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem('grabit-admin-key');
    if (saved) { setApiKey(saved); setAuthed(true); }
  }, []);

  const fetchData = useCallback(async (key: string, s: Settings) => {
    const dates = getDateRange(s);
    setLoading(true);
    try {
      const results = await Promise.all(
        dates.map(async (date) => {
          const res = await fetch(`/grabit/api/v1/stats?date=${date}`, { headers: { 'x-api-key': key } });
          if (res.status === 401) throw new Error('unauthorized');
          const json = await res.json();
          return { date, stats: (json.stats ?? {}) as StatsRecord };
        })
      );
      setData(results);
      setLastUpdated(new Date());
    } catch (e: unknown) {
      if (e instanceof Error && e.message === 'unauthorized') {
        setAuthed(false);
        sessionStorage.removeItem('grabit-admin-key');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authed) return;
    fetchData(apiKey, settings);
  }, [authed, apiKey, settings, fetchData]);

  useEffect(() => {
    if (refreshRef.current) clearInterval(refreshRef.current);
    if (authed && settings.refreshInterval > 0) {
      refreshRef.current = setInterval(() => fetchData(apiKey, settings), settings.refreshInterval * 1000);
    }
    return () => { if (refreshRef.current) clearInterval(refreshRef.current); };
  }, [authed, apiKey, settings, fetchData]);

  function updateSettings(patch: Partial<Settings>) {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      localStorage.setItem('grabit-dash', JSON.stringify(next));
      return next;
    });
  }

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    sessionStorage.setItem('grabit-admin-key', keyInput);
    setApiKey(keyInput);
    setAuthed(true);
  }

  function handleExport(format: 'json' | 'csv') {
    setExportOpen(false);
    const filename = `grabit-stats-${kstToday()}`;
    if (format === 'json') {
      downloadBlob(JSON.stringify(data, null, 2), `${filename}.json`, 'application/json');
    } else {
      const allKeys = new Set<string>();
      data.forEach(d => Object.keys(d.stats).forEach(k => allKeys.add(k)));
      const keys = ['date', ...Array.from(allKeys)];
      const rows = data.map(d => keys.map(k => k === 'date' ? d.date : (d.stats[k] ?? 0)).join(','));
      downloadBlob([keys.join(','), ...rows].join('\n'), `${filename}.csv`, 'text/csv');
    }
  }

  // ── Derived data ────────────────────────────────────────────────────────────

  const agg = aggregate(data);
  const total = agg.total ?? 0;
  const successRate = total > 0 ? ((agg.success ?? 0) / total) * 100 : 0;
  const failRate = total > 0 ? ((agg.fail ?? 0) / total) * 100 : 0;
  const avgLatency = agg.latency_ms_avg ?? 0;

  const failAlert = settings.alertThresholds.failRate > 0 && failRate > settings.alertThresholds.failRate;
  const latencyAlert = settings.alertThresholds.latencyMs > 0 && avgLatency > settings.alertThresholds.latencyMs;

  const platformData = (Object.keys(PLATFORM_LABELS) as Array<keyof Settings['platforms']>)
    .filter(k => settings.platforms[k])
    .map(k => ({ name: PLATFORM_LABELS[k], value: agg[`platform:${k}`] ?? 0, color: PLATFORM_COLORS[k] }))
    .filter(d => d.value > 0);

  const trendData = data.map(({ date, stats }) => ({
    date: date.slice(5),
    total: stats.total ?? 0,
    success: stats.success ?? 0,
    fail: stats.fail ?? 0,
  }));

  const serverData = [
    { name: 'Server A', value: agg['server:server-a'] ?? 0 },
    { name: 'Server B', value: agg['server:server-b'] ?? 0 },
  ].filter(d => d.value > 0);
  const serverTotal = serverData.reduce((s, d) => s + d.value, 0);

  // ── Auth Gate ───────────────────────────────────────────────────────────────

  if (!authed) {
    return (
      <div style={{ minHeight: '100vh', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <form onSubmit={handleLogin} style={{ width: 340, padding: 40, border: '1px solid #e5e7eb', borderRadius: 20, boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#111' }}>grabit</div>
            <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 4 }}>stats dashboard</div>
          </div>
          <input
            type="password"
            placeholder="Admin API Key"
            value={keyInput}
            onChange={e => setKeyInput(e.target.value)}
            required
            autoFocus
            style={{ width: '100%', padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: 12, fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: 12 }}
          />
          <button type="submit" style={{ width: '100%', padding: '10px 0', background: '#111', color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            접속
          </button>
        </form>
      </div>
    );
  }

  // ── Dashboard ───────────────────────────────────────────────────────────────

  const HEADER_H = 57;

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb' }}>
      {/* ── Top bar ── */}
      <header style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '0 24px', height: HEADER_H, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontWeight: 700, fontSize: 17, color: '#111' }}>grabit stats</span>
          {loading && <span style={{ fontSize: 12, color: '#3b82f6' }}>로딩중…</span>}
          {!loading && lastUpdated && (
            <span style={{ fontSize: 11, color: '#9ca3af' }}>{lastUpdated.toLocaleTimeString('ko-KR')} 업데이트</span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Date mode pills */}
          <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: 10, padding: 3, gap: 2 }}>
            {(['today', '7days', '30days', 'custom'] as const).map(m => (
              <button key={m} onClick={() => updateSettings({ dateMode: m })}
                style={{ padding: '5px 10px', borderRadius: 7, border: 'none', fontSize: 12, fontWeight: settings.dateMode === m ? 600 : 400, background: settings.dateMode === m ? '#fff' : 'transparent', color: settings.dateMode === m ? '#111' : '#6b7280', cursor: 'pointer', boxShadow: settings.dateMode === m ? '0 1px 3px rgba(0,0,0,.1)' : 'none', transition: 'all .15s' }}>
                {m === 'today' ? '오늘' : m === '7days' ? '7일' : m === '30days' ? '30일' : '직접'}
              </button>
            ))}
          </div>

          {/* Refresh button */}
          <button onClick={() => fetchData(apiKey, settings)}
            title="새로고침"
            style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', cursor: 'pointer', color: '#6b7280' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>
              <path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
            </svg>
          </button>

          {/* Export */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setExportOpen(o => !o)}
              style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', cursor: 'pointer', color: '#374151' }}>
              내보내기 ▾
            </button>
            {exportOpen && (
              <div style={{ position: 'absolute', right: 0, top: '110%', width: 110, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,.1)', overflow: 'hidden', zIndex: 20 }}>
                <button onClick={() => handleExport('json')} style={{ width: '100%', padding: '10px 16px', textAlign: 'left', fontSize: 13, border: 'none', background: 'transparent', cursor: 'pointer', color: '#374151' }}>JSON</button>
                <button onClick={() => handleExport('csv')} style={{ width: '100%', padding: '10px 16px', textAlign: 'left', fontSize: 13, border: 'none', background: 'transparent', cursor: 'pointer', color: '#374151' }}>CSV</button>
              </div>
            )}
          </div>

          {/* Settings toggle */}
          <button onClick={() => setSettingsOpen(o => !o)}
            style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 8, background: settingsOpen ? '#111' : '#f3f4f6', color: settingsOpen ? '#fff' : '#6b7280', cursor: 'pointer', transition: 'all .15s' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M12 2v3m0 14v3M4.22 4.22l2.12 2.12m11.32 11.32 2.12 2.12M2 12h3m14 0h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
            </svg>
          </button>
        </div>
      </header>

      <div style={{ display: 'flex' }}>
        {/* ── Main ── */}
        <main style={{ flex: 1, padding: 24, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Custom date inputs */}
          {settings.dateMode === 'custom' && (
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 12, color: '#6b7280' }}>기간</span>
              <input type="date" value={settings.customStart} onChange={e => updateSettings({ customStart: e.target.value })}
                style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 10px', fontSize: 12, outline: 'none' }} />
              <span style={{ fontSize: 12, color: '#9ca3af' }}>~</span>
              <input type="date" value={settings.customEnd} onChange={e => updateSettings({ customEnd: e.target.value })}
                style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 10px', fontSize: 12, outline: 'none' }} />
            </div>
          )}

          {/* Alert banners */}
          {failAlert && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '12px 16px', fontSize: 13, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 8 }}>
              ⚠ 실패율이 임계값({settings.alertThresholds.failRate}%)을 초과했습니다 — 현재 {failRate.toFixed(1)}%
            </div>
          )}
          {latencyAlert && (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '12px 16px', fontSize: 13, color: '#d97706', display: 'flex', alignItems: 'center', gap: 8 }}>
              ⚠ 평균 지연이 임계값({settings.alertThresholds.latencyMs}ms)을 초과했습니다 — 현재 {fmt(avgLatency, 'ms')}
            </div>
          )}

          {/* ── Stat Cards ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
            {settings.cards.total && (
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 20, padding: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>총 호출</div>
                <div style={{ fontSize: 32, fontWeight: 700, color: '#111', marginTop: 8 }}>{fmt(total)}</div>
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>{getDateRange(settings).length}일 합계</div>
              </div>
            )}
            {settings.cards.successRate && (
              <div style={{ background: '#fff', border: `1px solid ${failAlert ? '#fca5a5' : '#e5e7eb'}`, borderRadius: 20, padding: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>성공률</div>
                <div style={{ fontSize: 32, fontWeight: 700, color: failAlert ? '#dc2626' : '#111', marginTop: 8 }}>{total > 0 ? `${successRate.toFixed(1)}%` : '—'}</div>
                <div style={{ marginTop: 10, height: 6, background: '#f3f4f6', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${successRate}%`, background: failAlert ? '#ef4444' : '#10b981', borderRadius: 99, transition: 'width .4s' }} />
                </div>
              </div>
            )}
            {settings.cards.avgLatency && (
              <div style={{ background: '#fff', border: `1px solid ${latencyAlert ? '#fde68a' : '#e5e7eb'}`, borderRadius: 20, padding: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>평균 지연</div>
                <div style={{ fontSize: 32, fontWeight: 700, color: latencyAlert ? '#d97706' : '#111', marginTop: 8 }}>{fmt(avgLatency, 'ms')}</div>
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>전체 요청 평균</div>
              </div>
            )}
            {settings.cards.failCount && (
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 20, padding: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>실패</div>
                <div style={{ fontSize: 32, fontWeight: 700, color: (agg.fail ?? 0) > 0 ? '#ef4444' : '#111', marginTop: 8 }}>{fmt(agg.fail ?? 0)}</div>
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>{total > 0 ? `${failRate.toFixed(1)}%` : '—'}</div>
              </div>
            )}
          </div>

          {/* ── Charts Row ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16 }}>
            {/* Platform chart */}
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 20, padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#111' }}>플랫폼별 호출</span>
                <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: 8, padding: 2 }}>
                  {(['bar', 'donut'] as const).map(t => (
                    <button key={t} onClick={() => updateSettings({ platformChartType: t })}
                      style={{ padding: '4px 10px', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: settings.platformChartType === t ? 600 : 400, background: settings.platformChartType === t ? '#fff' : 'transparent', color: settings.platformChartType === t ? '#111' : '#9ca3af', cursor: 'pointer', boxShadow: settings.platformChartType === t ? '0 1px 2px rgba(0,0,0,.08)' : 'none' }}>
                      {t === 'bar' ? '바' : '도넛'}
                    </button>
                  ))}
                </div>
              </div>
              {platformData.length === 0
                ? <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 13 }}>데이터 없음</div>
                : settings.platformChartType === 'bar'
                  ? (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={platformData} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={80} />
                        <Tooltip formatter={(v: number) => [v.toLocaleString(), '호출']} />
                        <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                          {platformData.map((d, i) => <Cell key={i} fill={d.color} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )
                  : (
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={platformData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={82} paddingAngle={3}>
                          {platformData.map((d, i) => <Cell key={i} fill={d.color} />)}
                        </Pie>
                        <Tooltip formatter={(v: number) => [v.toLocaleString(), '호출']} />
                        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )
              }
            </div>

            {/* Server distribution */}
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 20, padding: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#111', marginBottom: 16 }}>서버별 분산</div>
              {serverData.length === 0
                ? <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 13 }}>데이터 없음</div>
                : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 12 }}>
                    {serverData.map(({ name, value }) => {
                      const pct = serverTotal > 0 ? (value / serverTotal) * 100 : 0;
                      return (
                        <div key={name}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 8 }}>
                            <span style={{ color: '#374151', fontWeight: 500 }}>{name}</span>
                            <span style={{ color: '#111', fontWeight: 600 }}>{value.toLocaleString()} <span style={{ color: '#9ca3af', fontWeight: 400 }}>({pct.toFixed(0)}%)</span></span>
                          </div>
                          <div style={{ height: 8, background: '#f3f4f6', borderRadius: 99, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: '#3b82f6', borderRadius: 99, transition: 'width .4s' }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              }
            </div>
          </div>

          {/* ── Trend Chart ── */}
          {trendData.length > 1 && (
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 20, padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#111' }}>추이</span>
                <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: 8, padding: 2 }}>
                  {(['line', 'bar'] as const).map(t => (
                    <button key={t} onClick={() => updateSettings({ trendChartType: t })}
                      style={{ padding: '4px 10px', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: settings.trendChartType === t ? 600 : 400, background: settings.trendChartType === t ? '#fff' : 'transparent', color: settings.trendChartType === t ? '#111' : '#9ca3af', cursor: 'pointer', boxShadow: settings.trendChartType === t ? '0 1px 2px rgba(0,0,0,.08)' : 'none' }}>
                      {t === 'line' ? '라인' : '바'}
                    </button>
                  ))}
                </div>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                {settings.trendChartType === 'line' ? (
                  <LineChart data={trendData} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="total" name="전체" stroke="#3b82f6" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="success" name="성공" stroke="#10b981" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="fail" name="실패" stroke="#ef4444" strokeWidth={2} dot={false} />
                  </LineChart>
                ) : (
                  <BarChart data={trendData} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="success" name="성공" fill="#10b981" stackId="a" />
                    <Bar dataKey="fail" name="실패" fill="#ef4444" stackId="a" radius={[4, 4, 0, 0]} />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          )}
        </main>

        {/* ── Settings Sidebar ── */}
        {settingsOpen && (
          <aside style={{ width: 272, background: '#fff', borderLeft: '1px solid #e5e7eb', padding: 20, overflowY: 'auto', position: 'sticky', top: HEADER_H, height: `calc(100vh - ${HEADER_H}px)`, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#111' }}>설정</div>

            {/* Cards */}
            <section>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>표시할 카드</div>
              {CARD_OPTIONS.map(([key, label]) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={settings.cards[key]} onChange={e => updateSettings({ cards: { ...settings.cards, [key]: e.target.checked } })} style={{ width: 15, height: 15, accentColor: '#111' }} />
                  <span style={{ fontSize: 13, color: '#374151' }}>{label}</span>
                </label>
              ))}
            </section>

            <div style={{ borderTop: '1px solid #f3f4f6' }} />

            {/* Platforms */}
            <section>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>플랫폼 필터</div>
              {(Object.keys(PLATFORM_LABELS) as Array<keyof Settings['platforms']>).map(key => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={settings.platforms[key]} onChange={e => updateSettings({ platforms: { ...settings.platforms, [key]: e.target.checked } })} style={{ width: 15, height: 15, accentColor: '#111' }} />
                  <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: PLATFORM_COLORS[key] }} />
                  <span style={{ fontSize: 13, color: '#374151' }}>{PLATFORM_LABELS[key]}</span>
                </label>
              ))}
            </section>

            <div style={{ borderTop: '1px solid #f3f4f6' }} />

            {/* Auto-refresh */}
            <section>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>자동 갱신</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                {([0, 10, 30, 60] as const).map(v => (
                  <button key={v} onClick={() => updateSettings({ refreshInterval: v })}
                    style={{ padding: '6px 0', fontSize: 12, border: `1px solid ${settings.refreshInterval === v ? '#111' : '#e5e7eb'}`, borderRadius: 8, background: settings.refreshInterval === v ? '#111' : '#fff', color: settings.refreshInterval === v ? '#fff' : '#6b7280', cursor: 'pointer', transition: 'all .15s' }}>
                    {v === 0 ? '끔' : `${v}s`}
                  </button>
                ))}
              </div>
            </section>

            <div style={{ borderTop: '1px solid #f3f4f6' }} />

            {/* Alert thresholds */}
            <section>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>알림 임계값</div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 5 }}>실패율 초과 시 (%)</label>
                <input type="number" min={0} max={100} value={settings.alertThresholds.failRate}
                  onChange={e => updateSettings({ alertThresholds: { ...settings.alertThresholds, failRate: Number(e.target.value) } })}
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 5 }}>평균 지연 초과 시 (ms)</label>
                <input type="number" min={0} value={settings.alertThresholds.latencyMs}
                  onChange={e => updateSettings({ alertThresholds: { ...settings.alertThresholds, latencyMs: Number(e.target.value) } })}
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </section>

            <div style={{ flex: 1 }} />

            {/* Logout */}
            <button onClick={() => { sessionStorage.removeItem('grabit-admin-key'); setAuthed(false); setApiKey(''); setKeyInput(''); }}
              style={{ width: '100%', padding: '8px 0', fontSize: 12, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer' }}>
              로그아웃
            </button>
          </aside>
        )}
      </div>
    </div>
  );
}
