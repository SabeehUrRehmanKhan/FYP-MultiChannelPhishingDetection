import { useState, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  GlassCard, VerdictChip, ConfidenceBar, ScanIndicator,
  NoDataState, StatCard,
} from '../components/ui/UIComponents';
import { streamAnalysis } from '../lib/sse';
import type { SSEChannelResult, SSEFinalVerdict, SSEThreatHit } from '../lib/sse';
import './DashboardPage.css';

import { Link2, Mail, Globe, Brain, Mic, Paperclip, AlertTriangle, Square, Hexagon, Loader2, CornerDownRight } from 'lucide-react';

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  url: <Link2 size={24} />, 
  email: <Mail size={24} />, 
  web: <Globe size={24} />, 
  nlp: <Brain size={24} />, 
  voice: <Mic size={24} />,
};

export function DashboardPage() {
  const { token } = useAuth();

  const [input, setInput] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [scanning, setScanning] = useState(false);
  const [channels, setChannels] = useState<Record<string, SSEChannelResult>>({});
  const [finalVerdict, setFinalVerdict] = useState<SSEFinalVerdict | null>(null);
  const [threatHits, setThreatHits] = useState<SSEThreatHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.size > 5 * 1024 * 1024) {
        setError('File too large. Maximum size is 5MB.');
        return;
      }
      setFile(selectedFile);
      setError(null);
      // Auto-populate input if it's empty to show something is happening
      if (!input.trim()) {
        setInput(`[Voice Content: ${selectedFile.name}]`);
      }
    }
  };

  const handleScan = useCallback(async () => {
    if ((!input.trim() && !file) || !token) return;

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setScanning(true);
    setChannels({});
    setFinalVerdict(null);
    setThreatHits([]);
    setError(null);

    try {
      // Use 'auto' type for backend detection
      // If file exists, the backend will treat it as voice
      await streamAnalysis(input.trim(), 'auto', token, {
        onChannelResult: (data) => setChannels(prev => ({ ...prev, [data.channel]: data })),
        onThreatHit: (data) => setThreatHits(prev => [...prev, data]),
        onFinalVerdict: (data) => { setFinalVerdict(data); setScanning(false); },
        onError: (data) => { setError(data.message); if (!data.recoverable) setScanning(false); },
        onDone: () => setScanning(false),
      }, file || undefined, abortRef.current.signal);
    } catch (e: unknown) {
      if ((e as Error).name !== 'AbortError') {
        setError('Backend unreachable. Ensure the server is running.');
        setScanning(false);
      }
    }
  }, [input, file, token]);

  const handleStop = () => {
    abortRef.current?.abort();
    setScanning(false);
  };

  const clearFile = () => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (input.startsWith('[Voice Content:')) setInput('');
  };

  const verdictColor: Record<string, string> = {
    phishing: 'var(--neon-red)',
    legitimate: 'var(--neon-green)',
    suspicious: 'var(--amber)',
    unknown: 'var(--outline)',
  };

  return (
    <div className="dashboard">
      {/* Header */}
      <div className="dashboard__header">
        <div className="label-caps flex items-center gap-2" style={{ color: 'var(--electric-blue)', marginBottom: 4 }}>
          <Hexagon size={16} /> Neural Intelligence Hub
        </div>
        <h1 style={{ fontSize: 28 }}>Universal Threat Scanner</h1>
        <p style={{ color: 'var(--on-surface-variant)', fontSize: 14, marginTop: 4 }}>
          Auto-detecting neural models for URL, Email, Web, and Voice analysis.
        </p>
      </div>

      {/* Scan interface */}
      <GlassCard className="dashboard__scan-card" style={{ padding: '32px' }}>
        <div style={{ position: 'relative' }}>
          <div className="label-caps" style={{ color: 'var(--on-surface-variant)', marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
            <span>Input Analysis Target</span>
            {file && (
              <span style={{ color: 'var(--electric-blue)', textTransform: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={clearFile}>
                <Paperclip size={14} /> {file.name} (Remove)
              </span>
            )}
          </div>
          
          <div className="dashboard__scan-input-wrap">
            <textarea
              className="dashboard__scan-textarea"
              placeholder="Paste a URL, Email headers, SMS content, or upload an audio clip for instant neural detection..."
              value={input}
              onChange={e => setInput(e.target.value)}
              style={{ 
                width: '100%', 
                minHeight: '120px', 
                padding: '20px', 
                border: 'none', 
                background: 'transparent',
                fontSize: '16px',
                lineHeight: '1.6',
                color: 'var(--on-surface)',
                resize: 'vertical'
              }}
              id="scan-input"
            />
            
            <div style={{ 
              display: 'flex', 
              justifyContent: 'flex-end', 
              padding: '8px 16px', 
              background: 'var(--surface-container)', 
              borderTop: '1px solid var(--outline-variant)',
              gap: '12px'
            }}>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                style={{ display: 'none' }} 
                accept="audio/*" 
              />
              <button 
                className="btn btn-ghost flex items-center gap-2" 
                style={{ fontSize: '13px', padding: '6px 12px' }}
                onClick={() => fileInputRef.current?.click()}
              >
                <Mic size={16} /> Voice Upload
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 16, marginTop: 24, alignItems: 'center' }}>
          <button
            className="btn btn-primary"
            style={{ 
              padding: '14px 48px', 
              fontSize: '16px', 
              fontWeight: 600,
              boxShadow: '0 4px 12px var(--electric-blue-glow)'
            }}
            onClick={handleScan}
            disabled={scanning || (!input.trim() && !file) || !token}
            id="scan-btn"
          >
            {scanning ? (
              <span className="flex items-center gap-2"><Loader2 size={18} className="animate-spin" /> Analyzing Neural Pathways…</span>
            ) : (
              <span className="flex items-center gap-2"><Hexagon size={18} /> Initiate Smart Scan</span>
            )}
          </button>
          
          {scanning && (
            <button className="btn btn-danger flex items-center gap-2" onClick={handleStop} style={{ padding: '14px 24px' }}>
              <Square size={16} fill="currentColor" /> Stop
            </button>
          )}
          
          {!token && (
            <span style={{ fontSize: 12, color: 'var(--neon-red)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <AlertTriangle size={14} /> Authentication required for neural processing
            </span>
          )}
        </div>
        
        <div style={{ marginTop: 24 }}>
          <ScanIndicator active={scanning} />
        </div>
      </GlassCard>

      {/* Threat alert */}
      {threatHits.length > 0 && (
        <div className="dashboard__threat-banner animate-slide-in" style={{ 
          background: 'rgba(255, 59, 48, 0.08)', 
          border: '1px solid var(--neon-red)',
          borderRadius: '12px',
          padding: '16px',
          marginBottom: '24px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ color: 'var(--neon-red)', fontWeight: 800, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AlertTriangle size={16} /> CRITICAL THREAT DETECTED
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {threatHits.map((hit, i) => (
                <span key={i} className="chip chip-phishing">
                  {hit.indicator_type}: {hit.value}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="dashboard__error-banner animate-slide-in" style={{
          background: 'rgba(255, 179, 0, 0.08)',
          border: '1px solid var(--amber)',
          borderRadius: '12px',
          padding: '12px 16px',
          marginBottom: '24px',
          color: 'var(--on-surface)'
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><AlertTriangle size={16} /> {error}</span>
        </div>
      )}

      {/* Channel results */}
      {Object.keys(channels).length > 0 && (
        <div className="animate-fade-in" style={{ marginBottom: '32px' }}>
          <div className="label-caps" style={{ color: 'var(--on-surface-variant)', marginBottom: 20 }}>
            Active Neural Channels
          </div>
          <div className="dashboard__channels-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
            {Object.values(channels).map(ch => (
              <GlassCard key={ch.channel} className="dashboard__channel-card animate-slide-in" style={{ padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ color: 'var(--electric-blue)' }}>{CHANNEL_ICONS[ch.channel] || <Hexagon size={24} />}</div>
                    <span style={{ fontFamily: 'var(--font-headline)', fontWeight: 700, textTransform: 'uppercase', fontSize: '13px', letterSpacing: '1px' }}>
                      {ch.channel}
                    </span>
                  </div>
                  <VerdictChip verdict={ch.verdict} />
                </div>
                <ConfidenceBar value={ch.score} verdict={ch.verdict} />
                
                {ch.cascade_skipped && (
                  <div style={{ 
                    background: 'rgba(255, 179, 0, 0.1)', 
                    color: 'var(--amber)', 
                    fontSize: '11px', 
                    padding: '4px 8px', 
                    borderRadius: '4px',
                    marginTop: '12px',
                    display: 'inline-block'
                  }}>
                    <CornerDownRight size={10} style={{ marginRight: 4 }} /> Cascade Skip: URL threat sufficient
                  </div>
                )}
                
                {Object.keys(ch.features).length > 0 && !ch.cascade_skipped && (
                  <div className="dashboard__channel-features" style={{ marginTop: '16px', borderTop: '1px solid var(--outline-variant)', paddingTop: '12px' }}>
                    {Object.entries(ch.features).slice(0, 4).map(([k, v]) => (
                      <div key={k} className="dashboard__feature-row" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                        <span style={{ color: 'var(--on-surface-variant)' }}>{k}</span>
                        <span style={{ color: 'var(--on-surface)', fontWeight: 500 }}>{String(v)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </GlassCard>
            ))}
          </div>
        </div>
      )}

      {/* Final verdict */}
      {finalVerdict && (
        <GlassCard
          className="dashboard__final-verdict animate-slide-in"
          style={{ 
            borderColor: verdictColor[finalVerdict.verdict], 
            borderWidth: '2px',
            padding: '32px',
            marginBottom: '40px',
            background: `linear-gradient(145deg, var(--surface), ${verdictColor[finalVerdict.verdict]}05)`
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 24 }}>
            <div style={{ flex: 1, minWidth: '300px' }}>
              <div className="label-caps" style={{ color: 'var(--on-surface-variant)', marginBottom: 12 }}>Consolidated Neural Verdict</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                <div style={{ 
                  fontSize: 56, 
                  fontFamily: 'var(--font-headline)', 
                  fontWeight: 800,
                  color: verdictColor[finalVerdict.verdict],
                  lineHeight: 1
                }}>
                  {Math.round(finalVerdict.confidence * 100)}%
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--on-surface)' }}>
                    {finalVerdict.verdict.toUpperCase()}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>
                    Detection confidence based on {finalVerdict.channels_run.length} channels
                  </div>
                </div>
              </div>
              <div style={{ 
                marginTop: 16, 
                fontSize: 11, 
                color: 'var(--on-surface-variant)', 
                background: 'var(--surface-container)', 
                padding: '4px 12px', 
                borderRadius: '20px',
                display: 'inline-block'
              }}>
                ID: {finalVerdict.analysis_id} • Proc: {finalVerdict.total_time_ms}ms
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn btn-ghost" style={{ padding: '12px 24px' }}>View Full Forensic Report</button>
              <button className="btn btn-primary" style={{ padding: '12px 24px' }}>Whitelist Domain</button>
            </div>
          </div>
        </GlassCard>
      )}

      {/* Empty state */}
      {Object.keys(channels).length === 0 && !scanning && !finalVerdict && (
        <div className="animate-fade-in" style={{ marginBottom: '40px' }}>
          <GlassCard style={{ padding: '64px 32px' }}>
            <NoDataState
              icon={<Hexagon size={40} />}
              title="Intelligence Core Idle"
              message="The neural detection engines are awaiting input. Upload a file or paste content to initiate real-time analysis across all security channels."
            />
          </GlassCard>
        </div>
      )}

      {/* Quick stats */}
      <div className="dashboard__quick-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
        <StatCard label="Analyses Today" value="1,284" sub="+12% from yesterday" color="var(--electric-blue)" />
        <StatCard label="Threats Blocked" value="412" sub="Across 82 campaigns" color="var(--neon-red)" />
        <StatCard label="System Accuracy" value="99.4%" sub="Verified by moderators" color="var(--neon-green)" />
        <StatCard label="Network Load" value="Optimal" sub="All nodes operational" color="var(--amber)" />
      </div>
    </div>
  );
}
