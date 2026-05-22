'use client';

import InstallPWA from '@/components/InstallPWA';
import { Download, Loader2, Star, Zap } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface MediaResponse {
  type: 'video' | 'image';
  mediaUrl: string;
  title?: string;
  description?: string;
  thumbnail?: string;
  externalDownload?: boolean;
  availableFormats?: {
    video: Array<{
      quality: string;
      extension: string;
      url: string;
      qualityNum: number;
      hasAudio?: boolean;
      isExternal?: boolean;
    }>;
    audio: Array<{
      quality: string;
      extension: string;
      url: string;
    }>;
  };
  previewQuality?: string;
}

type Platform = 'instagram' | 'twitter' | 'threads' | 'linkedin' | 'snapchat' | 'unsupported';

const PLATFORM_NAMES: Record<Platform, string> = {
  instagram: 'Instagram',
  twitter: 'X (Twitter)',
  threads: 'Threads',
  linkedin: 'LinkedIn',
  snapchat: 'Snapchat',
  unsupported: 'Unknown',
};

const CIRC = 2 * Math.PI * 36; // r=36 → ≈226.2

export default function Home() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadingFormat, setDownloadingFormat] = useState<string | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<'idle' | 'fetching' | 'starting'>('idle');
  const [media, setMedia] = useState<MediaResponse | null>(null);
  const [error, setError] = useState('');
  const previousUrlRef = useRef('');

  // analyzing screen state
  const [progress, setProgress] = useState(0);
  const [dotIndex, setDotIndex] = useState(0);
  const [analyzingPlatform, setAnalyzingPlatform] = useState<Platform>('instagram');

  const detectPlatform = (url: string): Platform => {
    const u = url.toLowerCase().trim();
    if (u.includes('instagram.com') || u.includes('instagr.am')) return 'instagram';
    if (u.includes('twitter.com') || u.includes('x.com')) return 'twitter';
    if (u.includes('threads.net') || u.includes('threads.com')) return 'threads';
    if (u.includes('linkedin.com')) return 'linkedin';
    if (u.includes('snapchat.com')) return 'snapchat';
    return 'unsupported';
  };

  useEffect(() => {
    const trimmedUrl = url.trim();
    if (trimmedUrl && trimmedUrl !== previousUrlRef.current && !loading && !media) {
      const platform = detectPlatform(trimmedUrl);
      if (platform !== 'unsupported') {
        previousUrlRef.current = trimmedUrl;
        handleFetchMedia();
      }
    }
  }, [url]);

  // Progress animation while loading
  useEffect(() => {
    if (!loading) { setProgress(0); return; }
    setProgress(5);
    const id = setInterval(() => setProgress(p => (p < 90 ? Math.min(p + 2, 90) : p)), 600);
    return () => clearInterval(id);
  }, [loading]);

  // Dot animation while loading
  useEffect(() => {
    if (!loading) { setDotIndex(0); return; }
    const id = setInterval(() => setDotIndex(d => (d + 1) % 5), 400);
    return () => clearInterval(id);
  }, [loading]);

  const handleFetchMedia = async () => {
    if (!url.trim()) { setError('Please enter a URL'); return; }
    const platform = detectPlatform(url);
    if (platform === 'unsupported') {
      setError('Platform not supported. Supported: Instagram, Twitter/X, Threads, LinkedIn, Snapchat');
      return;
    }
    setAnalyzingPlatform(platform);
    setLoading(true);
    setError('');
    setMedia(null);

    try {
      const apiEndpoint =
        platform === 'instagram' ? 'api/instagram'
        : platform === 'twitter' ? 'api/twitter'
        : platform === 'threads' ? 'api/threads'
        : platform === 'linkedin' ? 'api/linkedin'
        : 'api/snapchat';

      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to fetch media');
      setMedia(data);
    } catch (err: any) {
      setError(err.message || 'An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setUrl(v);
    setError('');
    if (media && v.trim() !== previousUrlRef.current) setMedia(null);
  };

  const handleDownload = async (customUrl?: string, isExternal?: boolean, formatId?: string) => {
    if (!media) return;
    const downloadId = formatId || customUrl || 'default';
    setDownloading(true);
    setDownloadingFormat(downloadId);
    setDownloadStatus('fetching');
    setError('');

    try {
      const urlToDownload = customUrl || media.mediaUrl;
      if (isExternal || (customUrl && customUrl.includes('y2mate.com'))) {
        window.open(urlToDownload, '_blank');
        setDownloading(false); setDownloadingFormat(null); setDownloadStatus('idle');
        return;
      }
      const link = document.createElement('a');
      link.href = `api/download?url=${encodeURIComponent(urlToDownload)}&type=${media.type}`;
      link.download = `grabit-${media.type}-${Date.now()}.${media.type === 'video' ? 'mp4' : 'jpg'}`;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setDownloadStatus('starting');
      setTimeout(() => { setDownloading(false); setDownloadingFormat(null); setDownloadStatus('idle'); }, 800);
    } catch (error: any) {
      setDownloading(false); setDownloadingFormat(null); setDownloadStatus('idle');
      setError(error.message || 'Download failed. Please try again.');
    }
  };

  const handleReset = () => {
    setUrl(''); setMedia(null); setError('');
    previousUrlRef.current = '';
  };

  /* ── Analyzing Phase ─────────────────────────────────── */
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#efe9dc', padding: '24px 16px 48px' }}>
        <div style={{ maxWidth: 400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Header card */}
          <div style={{ background: '#fff', borderRadius: 20, padding: '20px 24px', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
            <p style={{ fontSize: 21, fontWeight: 800, color: '#1c1814', letterSpacing: '-0.4px' }}>
              Analyzing Media
            </p>
            <p style={{ fontSize: 14, color: '#7a6a52', marginTop: 5 }}>
              {PLATFORM_NAMES[analyzingPlatform]} · Usually 10~30 seconds
            </p>
          </div>

          {/* Progress card */}
          <div style={{ background: '#fff', borderRadius: 20, padding: '20px 24px', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>

              {/* SVG ring */}
              <div style={{ position: 'relative', width: 88, height: 88, flexShrink: 0 }}>
                <svg width="88" height="88" viewBox="0 0 88 88">
                  <circle cx="44" cy="44" r="36" fill="none" stroke="#e6d9bf" strokeWidth="8" />
                  <circle
                    cx="44" cy="44" r="36" fill="none"
                    stroke="#c4723a" strokeWidth="8" strokeLinecap="round"
                    strokeDasharray={CIRC}
                    strokeDashoffset={CIRC * (1 - progress / 100)}
                    transform="rotate(-90 44 44)"
                    style={{ transition: 'stroke-dashoffset 0.6s ease' }}
                  />
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 18, fontWeight: 800, color: '#1c1814', lineHeight: 1.1 }}>{progress}%</span>
                  <span style={{ fontSize: 10, color: '#7a6a52' }}>analyzing</span>
                </div>
              </div>

              {/* Status */}
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 16, fontWeight: 700, color: '#1c1814' }}>Analyzing...</p>
                <p style={{ fontSize: 13, color: '#7a6a52', marginTop: 4 }}>Fetching media information</p>
                <div style={{ display: 'flex', gap: 5, marginTop: 12 }}>
                  {[0, 1, 2, 3, 4].map(i => (
                    <div key={i} style={{
                      flex: 1, height: 3, borderRadius: 2,
                      background: i === dotIndex ? '#c4723a' : '#e6d9bf',
                      transition: 'background 0.3s',
                    }} />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Large ad placeholder */}
          <div style={{
            background: 'linear-gradient(135deg, #f5e6d8, #e8d2b5)',
            borderRadius: 20, minHeight: 190, padding: '16px',
            position: 'relative', display: 'flex', flexDirection: 'column',
          }}>
            <span style={{
              position: 'absolute', top: 12, right: 12, fontSize: 11,
              color: '#8a7a6a', background: 'rgba(255,255,255,0.65)',
              padding: '2px 8px', borderRadius: 10, fontWeight: 600,
            }}>Ad</span>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <p style={{ color: '#c8a88a', fontSize: 11, letterSpacing: 1 }}>creative · 300×250</p>
            </div>
            <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 12 }}>
              <p style={{ fontSize: 11, color: '#8a7a6a' }}>Sponsor</p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                <div>
                  <p style={{ fontSize: 15, fontWeight: 700, color: '#1c1814' }}>Ads go here</p>
                  <p style={{ fontSize: 12, color: '#7a6a52' }}>sponsor · promo text</p>
                </div>
                <div style={{
                  background: '#1c1814', color: '#fff',
                  padding: '8px 16px', borderRadius: 20, fontSize: 13, fontWeight: 700,
                }}>받기 →</div>
              </div>
            </div>
          </div>

          {/* Small ad card */}
          <div style={{ background: '#fff', borderRadius: 20, padding: '16px 20px', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 44, height: 44, background: '#4a9e7a', borderRadius: 12,
                flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ color: '#fff', fontWeight: 800, fontSize: 18 }}>S</span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 11, color: '#7a6a52' }}>Sponsor · Fresh Market</span>
                  <span style={{
                    fontSize: 10, color: '#7a6a52', background: '#f0ede8',
                    padding: '1px 6px', borderRadius: 8,
                  }}>Ad</span>
                </div>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#1c1814' }}>Ad placeholder text here</p>
                <p style={{ fontSize: 12, color: '#7a6a52' }}>promo · today only</p>
              </div>
              <div style={{
                width: 32, height: 32, background: '#f0ede8', borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ color: '#7a6a52', fontSize: 18 }}>›</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── Detail Phase ────────────────────────────────────── */
  if (media) {
    const videoFormats = media.availableFormats?.video ?? [];
    const audioFormats = media.availableFormats?.audio ?? [];

    return (
      <div style={{ minHeight: '100vh', background: '#efe9dc', padding: '16px 16px 48px' }}>
        <div style={{ maxWidth: 400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Back */}
          <button
            onClick={handleReset}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, fontSize: 14,
              color: '#7a6a52', background: 'none', border: 'none',
              cursor: 'pointer', padding: '8px 0', fontWeight: 600,
            }}
          >
            ← New URL
          </button>

          {/* Media preview */}
          <div style={{ background: '#fff', borderRadius: 20, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
            {media.type === 'video' ? (
              <video
                controls controlsList="nodownload"
                style={{ width: '100%', maxHeight: '60vh', display: 'block', background: '#000' }}
                src={media.mediaUrl}
                onError={() => setError('Failed to load video preview.')}
              />
            ) : (
              <img
                src={media.mediaUrl} alt={media.title || 'Media'}
                style={{ width: '100%', maxHeight: '60vh', objectFit: 'contain', display: 'block' }}
                onError={() => setError('Failed to load image preview.')}
              />
            )}
            {(media.title || media.description) && (
              <div style={{ padding: '16px 20px', borderTop: '1px solid #f0ede8' }}>
                {media.title && <p style={{ fontWeight: 700, fontSize: 15, color: '#1c1814' }}>{media.title}</p>}
                {media.description && (
                  <p style={{ fontSize: 13, color: '#7a6a52', marginTop: 4 }}>
                    {media.description.length > 120 ? media.description.slice(0, 120) + '…' : media.description}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Section header */}
          <p style={{ fontSize: 21, fontWeight: 800, color: '#1c1814', letterSpacing: '-0.4px', padding: '4px 2px' }}>
            Download Steps
          </p>

          {/* Error */}
          {error && (
            <div style={{ background: '#fce8e6', borderRadius: 12, padding: '12px 16px' }}>
              <p style={{ color: '#b95c3e', fontSize: 14, fontWeight: 600 }}>{error}</p>
            </div>
          )}

          {/* Video format step cards */}
          {videoFormats.length > 0 ? videoFormats.map((format, index) => {
            const fid = `video-${index}-${format.quality}`;
            const active = downloadingFormat === fid;
            return (
              <div key={fid} style={{ background: '#fff', borderRadius: 20, padding: '20px', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', gap: 14 }}>
                  <div style={{
                    width: 38, height: 38, background: '#2d2118', borderRadius: 10,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, fontSize: 13, fontWeight: 800, color: '#fff', letterSpacing: 1,
                  }}>
                    {String(index + 1).padStart(2, '0')}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 700, fontSize: 15, color: '#1c1814' }}>
                      Download in <strong>{format.quality}</strong>
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                      <span style={{ background: '#fce8e6', color: '#b95c3e', fontSize: 12, padding: '4px 12px', borderRadius: 20, fontWeight: 600 }}>
                        🎬 {(format.extension || 'mp4').toUpperCase()}
                      </span>
                      {format.hasAudio && !format.isExternal && (
                        <span style={{ background: '#dff0f7', color: '#2980b9', fontSize: 12, padding: '4px 12px', borderRadius: 20, fontWeight: 600 }}>
                          🔊 With Audio
                        </span>
                      )}
                      {!format.hasAudio && !format.isExternal && (
                        <span style={{ background: '#f0ede8', color: '#7a6a52', fontSize: 12, padding: '4px 12px', borderRadius: 20, fontWeight: 600 }}>
                          🔇 No Audio
                        </span>
                      )}
                      {format.isExternal && (
                        <span style={{ background: '#e8f5e9', color: '#2e7d32', fontSize: 12, padding: '4px 12px', borderRadius: 20, fontWeight: 600 }}>
                          ↗ External Link
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => handleDownload(format.url, format.isExternal, fid)}
                      disabled={downloading}
                      style={{
                        marginTop: 14, width: '100%', padding: '12px',
                        background: '#2d2118', color: '#fff', borderRadius: 12,
                        fontWeight: 700, fontSize: 14, border: 'none',
                        cursor: downloading ? 'wait' : 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        opacity: downloading && !active ? 0.55 : 1,
                      }}
                    >
                      {active ? (
                        <><Loader2 className="h-4 w-4 animate-spin" />{downloadStatus === 'starting' ? 'Starting…' : 'Downloading…'}</>
                      ) : (
                        <><Download className="h-4 w-4" />Download this quality →</>
                      )}
                    </button>
                  </div>
                </div>

                {/* TIP on first card if multiple options */}
                {index === 0 && videoFormats.length > 1 && (
                  <div style={{
                    marginTop: 16, padding: '10px 14px',
                    borderLeft: '3px solid #c4723a',
                    background: '#fffdf8', borderRadius: '0 10px 10px 0',
                  }}>
                    <p style={{ fontSize: 13, color: '#7a6a52' }}>
                      <span style={{ fontWeight: 700, color: '#c4723a' }}>💡 TIP</span>&nbsp; Higher quality = larger file size
                    </p>
                  </div>
                )}
              </div>
            );
          }) : (
            /* Single download card */
            <div style={{ background: '#fff', borderRadius: 20, padding: '20px', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', gap: 14 }}>
                <div style={{
                  width: 38, height: 38, background: '#2d2118', borderRadius: 10,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, fontSize: 13, fontWeight: 800, color: '#fff',
                }}>01</div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 700, fontSize: 15, color: '#1c1814' }}>
                    Download <strong>{media.type === 'video' ? 'Video' : 'Image'}</strong>
                  </p>
                  <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                    <span style={{ background: '#fce8e6', color: '#b95c3e', fontSize: 12, padding: '4px 12px', borderRadius: 20, fontWeight: 600 }}>
                      {media.type === 'video' ? '🎬 Video' : '🖼 Image'}
                    </span>
                  </div>
                  <button
                    onClick={() => handleDownload()}
                    disabled={downloading}
                    style={{
                      marginTop: 14, width: '100%', padding: '12px',
                      background: '#2d2118', color: '#fff', borderRadius: 12,
                      fontWeight: 700, fontSize: 14, border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}
                  >
                    {downloading
                      ? <><Loader2 className="h-4 w-4 animate-spin" />{downloadStatus === 'starting' ? 'Starting…' : 'Downloading…'}</>
                      : <><Download className="h-4 w-4" />Download {media.type === 'video' ? 'Video' : 'Image'} →</>
                    }
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Audio step cards */}
          {audioFormats.map((format, index) => {
            const fid = `audio-${index}-${format.quality}`;
            const active = downloadingFormat === fid;
            const stepNum = videoFormats.length + index + 1;
            return (
              <div key={fid} style={{ background: '#fff', borderRadius: 20, padding: '20px', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', gap: 14 }}>
                  <div style={{
                    width: 38, height: 38, background: '#3d1a5c', borderRadius: 10,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, fontSize: 13, fontWeight: 800, color: '#fff', letterSpacing: 1,
                  }}>
                    {String(stepNum).padStart(2, '0')}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 700, fontSize: 15, color: '#1c1814' }}>
                      Audio Only · <strong>{format.quality}</strong>
                    </p>
                    <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                      <span style={{ background: '#f3e5ff', color: '#7b1fa2', fontSize: 12, padding: '4px 12px', borderRadius: 20, fontWeight: 600 }}>
                        🎵 {(format.extension || 'mp3').toUpperCase()}
                      </span>
                      <span style={{ background: '#f3e5ff', color: '#7b1fa2', fontSize: 12, padding: '4px 12px', borderRadius: 20, fontWeight: 600 }}>
                        🔊 Audio Only
                      </span>
                    </div>
                    <button
                      onClick={() => handleDownload(format.url, false, fid)}
                      disabled={downloading}
                      style={{
                        marginTop: 14, width: '100%', padding: '12px',
                        background: '#3d1a5c', color: '#fff', borderRadius: 12,
                        fontWeight: 700, fontSize: 14, border: 'none',
                        cursor: downloading ? 'wait' : 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        opacity: downloading && !active ? 0.55 : 1,
                      }}
                    >
                      {active
                        ? <><Loader2 className="h-4 w-4 animate-spin" />{downloadStatus === 'starting' ? 'Starting…' : 'Downloading…'}</>
                        : <><Download className="h-4 w-4" />Download Audio →</>
                      }
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  /* ── Home Phase ──────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-background">
      <InstallPWA />
      <div className="fixed top-20 left-4 sm:left-10 w-12 h-12 sm:w-20 sm:h-20 bg-primary border-3 border-black rotate-12 hidden md:block rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]" />
      <div className="fixed bottom-20 right-4 sm:right-10 w-10 h-10 sm:w-16 sm:h-16 bg-secondary border-3 border-black -rotate-12 hidden md:block rounded-2xl shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]" />
      <div className="fixed top-40 right-8 sm:right-20 w-8 h-8 sm:w-12 sm:h-12 bg-accent border-3 border-black rotate-45 hidden md:block rounded-2xl shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]" />

      <main className="container max-w-5xl mx-auto px-3 sm:px-4 py-32 sm:py-32 relative">
        <div className="mx-auto max-w-3xl text-center space-y-6 sm:space-y-8 mb-8 sm:mb-12">
          <div className="inline-flex items-center gap-1.5 sm:gap-2 bg-accent border-3 border-black px-3 sm:px-4 py-1.5 sm:py-2 font-bold text-xs sm:text-sm rounded-full shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
            <Zap className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="whitespace-nowrap">Free, fast, no login</span>
            <Star className="h-3 w-3 sm:h-4 sm:w-4 fill-current" />
          </div>
          <h1 className="text-3xl xs:text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-tight leading-tight px-2">
            <span className="inline-block bg-primary border-3 rounded-full border-black px-3 sm:px-4 py-1.5 sm:py-2 -rotate-1 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] text-white">
              grabit2me
            </span>
            <br />
            <span className="text-xl xs:text-2xl sm:text-3xl md:text-4xl mt-3 sm:mt-4 block">
              paste a link, grab the video
            </span>
          </h1>
          <p className="text-base sm:text-lg md:text-xl text-[#525252] max-w-2xl mx-auto font-medium px-4">
            The ultimate social media video downloader. Works with Instagram, X, Threads, LinkedIn, and Snapchat.
          </p>
        </div>

        <div className="mx-auto max-w-2xl mb-8 sm:mb-12 px-2 sm:px-0">
          <div className="bg-card border-3 border-black p-5 sm:p-6 md:p-8 rounded-3xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
            <div className="space-y-4 sm:space-y-6">
              <div className="flex flex-col gap-3">
                <input
                  type="url"
                  placeholder="Paste your video link here..."
                  value={url}
                  onChange={handleUrlChange}
                  onKeyDown={(e) => e.key === 'Enter' && handleFetchMedia()}
                  className="w-full h-14 sm:h-16 px-4 sm:px-5 text-base sm:text-lg font-medium bg-white border-3 border-black focus:outline-none focus:border-primary transition-all rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                />
                {url && (
                  <button
                    onClick={handleReset}
                    className="w-full sm:w-auto h-12 sm:h-14 px-6 bg-accent border-3 border-black font-bold transition-all duration-150 hover:shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] text-base sm:text-lg cursor-pointer rounded-2xl shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
                  >
                    ✕ Clear
                  </button>
                )}
              </div>

              {url.trim() && (
                <button
                  onClick={handleFetchMedia}
                  className="font-bangers w-full h-14 sm:h-16 bg-black text-white border-3 border-black font-bold text-base sm:text-lg flex items-center justify-center gap-2 transition-all duration-150 hover:shadow-[7px_7px_0px_0px_rgba(255,107,157,1)] active:shadow-[3px_3px_0px_0px_rgba(255,107,157,1)] cursor-pointer rounded-2xl shadow-[5px_5px_0px_0px_rgba(255,107,157,1)]"
                >
                  <Zap className="h-5 w-5" />
                  Fetch Video
                </button>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="mx-auto max-w-2xl mb-6 sm:mb-8">
            <div className="bg-destructive text-white border-3 border-black p-3 sm:p-4 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
              <p className="text-center font-bangers font-bold text-sm sm:text-base">{error}</p>
            </div>
          </div>
        )}

        {/* Supported Platforms */}
        <div className="mx-auto max-w-3xl mt-12 sm:mt-16">
          <div className="text-center space-y-6 sm:space-y-8">
            <div className="space-y-2 sm:space-y-4 px-4">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-black">Supported Platforms</h2>
              <p className="text-sm sm:text-base md:text-lg text-[#525252] font-medium">Download from your favorite social media platforms</p>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 sm:gap-4 px-2">
              {[
                { name: 'Instagram', bg: '#ff6b9d', path: 'M12 2c2.717 0 3.056.01 4.122.06 1.065.05 1.79.217 2.428.465.66.254 1.216.598 1.772 1.153.509.5.902 1.105 1.153 1.772.247.637.415 1.363.465 2.428.047 1.066.06 1.405.06 4.122 0 2.717-.01 3.056-.06 4.122-.05 1.065-.218 1.79-.465 2.428a4.883 4.883 0 01-1.153 1.772c-.5.508-1.105.902-1.772 1.153-.637.247-1.363.415-2.428.465-1.066.047-1.405.06-4.122.06-2.717 0-3.056-.01-4.122-.06-1.065-.05-1.79-.218-2.428-.465a4.89 4.89 0 01-1.772-1.153 4.904 4.904 0 01-1.153-1.772c-.248-.637-.415-1.363-.465-2.428C2.013 15.056 2 14.717 2 12c0-2.717.01-3.056.06-4.122.05-1.066.217-1.79.465-2.428a4.88 4.88 0 011.153-1.772A4.897 4.897 0 015.45 2.525c.638-.248 1.362-.415 2.428-.465C8.944 2.013 9.283 2 12 2zm0 5a5 5 0 100 10 5 5 0 000-10zm6.5-.25a1.25 1.25 0 10-2.5 0 1.25 1.25 0 002.5 0zM12 9a3 3 0 110 6 3 3 0 010-6z', textColor: 'text-white' },
                { name: 'X', bg: '#1a1a1a', path: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z', textColor: 'text-white' },
                { name: 'Threads', bg: '#1a1a1a', path: 'M6.321 6.016c-.27-.18-1.166-.802-1.166-.802.756-1.081 1.753-1.502 3.132-1.502.975 0 1.803.327 2.394.948s.928 1.509 1.005 2.644q.492.207.905.484c1.109.745 1.719 1.86 1.719 3.137 0 2.716-2.226 5.075-6.256 5.075C4.594 16 1 13.987 1 7.994 1 2.034 4.482 0 8.044 0 9.69 0 13.55.243 15 5.036l-1.36.353C12.516 1.974 10.163 1.43 8.006 1.43c-3.565 0-5.582 2.171-5.582 6.79 0 4.143 2.254 6.343 5.63 6.343 2.777 0 4.847-1.443 4.847-3.556 0-1.438-1.208-2.127-1.27-2.127-.236 1.234-.868 3.31-3.644 3.31-1.618 0-3.013-1.118-3.013-2.582 0-2.09 1.984-2.847 3.55-2.847.586 0 1.294.04 1.663.114 0-.637-.54-1.728-1.9-1.728-1.25 0-1.566.405-1.967.868ZM8.716 8.19c-2.04 0-2.304.87-2.304 1.416 0 .878 1.043 1.168 1.6 1.168 1.02 0 2.067-.282 2.232-2.423a6.2 6.2 0 0 0-1.528-.161', textColor: 'text-white', viewBox: '0 0 16 16' },
                { name: 'LinkedIn', bg: '#6bcfff', path: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z', textColor: 'text-white' },
                { name: 'Snapchat', bg: '#ffd93d', path: 'M12.206.793c.99 0 4.347.276 5.93 3.821.529 1.193.403 3.219.299 4.847l-.003.06c-.012.18-.022.345-.03.51.075.045.203.09.401.09.3-.016.659-.12 1.033-.301.165-.088.344-.104.464-.104.182 0 .359.029.509.09.45.149.734.479.734.838.015.449-.39.839-1.213 1.168-.089.029-.209.075-.344.119-.45.135-1.139.36-1.333.81-.09.224-.061.524.12.868l.015.015c.06.136 1.526 3.475 4.791 4.014.255.044.435.27.42.509 0 .075-.015.149-.045.225-.24.569-1.273.988-3.146 1.271-.059.091-.12.375-.164.57-.029.179-.074.36-.134.553-.076.271-.27.405-.555.405h-.03c-.135 0-.313-.031-.538-.074-.36-.075-.765-.135-1.273-.135-.3 0-.599.015-.913.074-.6.104-1.123.464-1.723.884-.853.599-1.826 1.288-3.294 1.288-.06 0-.119-.015-.18-.015h-.149c-1.468 0-2.427-.675-3.279-1.288-.599-.42-1.107-.779-1.707-.884-.314-.045-.629-.074-.928-.074-.54 0-.958.089-1.272.149-.211.043-.391.074-.54.074-.374 0-.523-.224-.583-.42-.061-.192-.09-.389-.135-.567-.046-.181-.105-.494-.166-.57-1.918-.222-2.95-.642-3.189-1.226-.031-.063-.052-.149-.052-.227.015-.195.168-.465.435-.531 3.236-.556 4.672-3.919 4.702-4.054.015-.015.028-.031.028-.044.029-.075.061-.134.074-.18.104-.225.179-.54.036-.838-.195-.434-.884-.658-1.332-.809-.121-.029-.24-.074-.346-.119-1.107-.435-1.257-.93-1.197-1.273.09-.479.674-.793 1.168-.793.146 0 .27.029.383.074.42.194.789.3 1.104.3.234 0 .384-.06.465-.105l-.046-.569c-.098-1.626-.225-3.651.307-4.837C7.392 1.077 10.739.807 11.727.807l.419-.015h.06z', textColor: 'text-[#1a1a1a]' },
              ].map(({ name, bg, path, textColor, viewBox }) => (
                <div key={name} className="flex flex-col items-center gap-2 sm:gap-3">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 border-2 sm:border-3 border-[#1a1a1a] flex items-center justify-center" style={{ background: bg, boxShadow: '2px 2px 0px 0px #1a1a1a' }}>
                    <svg className={`w-6 h-6 sm:w-7 sm:h-7 ${textColor}`} fill="currentColor" viewBox={viewBox || '0 0 24 24'}>
                      <path d={path} />
                    </svg>
                  </div>
                  <span className="text-xs sm:text-sm font-bold">{name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
