import { useState } from 'react';
import { GlassCard } from '../ui/UIComponents';
import { Globe, Eye, EyeOff, AlertTriangle, Shield, ExternalLink, Lock, Unlock } from 'lucide-react';

interface SuspiciousElement {
  selector: string;
  reason: string;
  severity: string;
}

interface ScreenshotEvidenceProps {
  screenshotUrl?: string | null;
  domFeatures?: Record<string, unknown>;
  brandSignals?: Record<string, unknown>;
  suspiciousElements?: SuspiciousElement[];
  redirectChain?: string[];
  sslInfo?: { valid: boolean; issuer: string };
  finalUrl?: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  high: 'var(--neon-red)',
  medium: 'var(--amber)',
  low: 'var(--on-surface-variant)',
};

export function ScreenshotEvidence({
  screenshotUrl,
  domFeatures = {},
  brandSignals = {},
  suspiciousElements = [],
  redirectChain = [],
  sslInfo,
  finalUrl,
}: ScreenshotEvidenceProps) {
  const [showAnnotations, setShowAnnotations] = useState(true);

  const highCount = suspiciousElements.filter(e => e.severity === 'high').length;
  const medCount = suspiciousElements.filter(e => e.severity === 'medium').length;

  return (
    <GlassCard style={{ padding: 0, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Globe size={18} style={{ color: 'var(--electric-blue)' }} />
          <span style={{ fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: '1px' }}>
            Web Visual Analysis
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {highCount > 0 && (
            <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 20, background: 'rgba(255,59,48,0.15)', color: 'var(--neon-red)', fontWeight: 600 }}>
              {highCount} Critical
            </span>
          )}
          {medCount > 0 && (
            <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 20, background: 'rgba(255,179,0,0.15)', color: 'var(--amber)', fontWeight: 600 }}>
              {medCount} Warning
            </span>
          )}
          <button
            onClick={() => setShowAnnotations(!showAnnotations)}
            style={{
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 6, padding: '4px 10px', cursor: 'pointer', color: 'var(--on-surface)',
              display: 'flex', alignItems: 'center', gap: 4, fontSize: 11,
            }}
          >
            {showAnnotations ? <EyeOff size={12} /> : <Eye size={12} />}
            {showAnnotations ? 'Hide' : 'Show'} Markers
          </button>
        </div>
      </div>

      {/* Screenshot Preview */}
      {screenshotUrl && (
        <div style={{ position: 'relative', background: '#0a0a0a', padding: 16 }}>
          <img
            src={screenshotUrl}
            alt="Website screenshot"
            style={{ width: '100%', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', display: 'block' }}
          />
          {showAnnotations && suspiciousElements.length > 0 && (
            <div style={{
              position: 'absolute', top: 24, right: 24,
              background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)',
              borderRadius: 10, padding: '12px 16px', border: '1px solid rgba(255,59,48,0.3)',
              maxWidth: 280,
            }}>
              <div style={{ fontSize: 10, color: 'var(--neon-red)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8 }}>
                ⚠ Suspicious Elements
              </div>
              {suspiciousElements.slice(0, 5).map((el, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 6, fontSize: 11 }}>
                  <AlertTriangle size={10} style={{ color: SEVERITY_COLORS[el.severity], marginTop: 2, flexShrink: 0 }} />
                  <span style={{ color: 'var(--on-surface)' }}>{el.reason}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Details Grid */}
      <div style={{ padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* DOM Features */}
        <div>
          <div style={{ fontSize: 10, color: 'var(--on-surface-variant)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 10, fontWeight: 600 }}>
            DOM Analysis
          </div>
          {[
            { label: 'Password Fields', value: domFeatures.has_password_field, danger: true },
            { label: 'Hidden Iframes', value: domFeatures.has_hidden_iframe, danger: true },
            { label: 'External JS', value: `${domFeatures.external_js_count || 0}`, danger: (domFeatures.external_js_count as number) > 5 },
            { label: 'External Form Action', value: domFeatures.form_action_external, danger: true },
            { label: 'Meta Refresh', value: domFeatures.meta_refresh, danger: true },
            { label: 'Obfuscated JS', value: domFeatures.obfuscated_js, danger: true },
          ].map((item, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
              <span style={{ color: 'var(--on-surface-variant)' }}>{item.label}</span>
              <span style={{
                color: typeof item.value === 'boolean'
                  ? (item.value && item.danger ? 'var(--neon-red)' : 'var(--neon-green)')
                  : 'var(--on-surface)',
                fontWeight: 500
              }}>
                {typeof item.value === 'boolean' ? (item.value ? '⚠ YES' : '✓ NO') : String(item.value)}
              </span>
            </div>
          ))}
        </div>

        {/* Brand & SSL */}
        <div>
          <div style={{ fontSize: 10, color: 'var(--on-surface-variant)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 10, fontWeight: 600 }}>
            Brand & Security
          </div>
          {brandSignals.detected_brand && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
              <span style={{ color: 'var(--on-surface-variant)' }}>Brand Detected</span>
              <span style={{ color: brandSignals.domain_matches_brand ? 'var(--neon-green)' : 'var(--neon-red)', fontWeight: 600 }}>
                {String(brandSignals.detected_brand).toUpperCase()}
                {!brandSignals.domain_matches_brand && ' ⚠ MISMATCH'}
              </span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
            <span style={{ color: 'var(--on-surface-variant)' }}>SSL</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: sslInfo?.valid ? 'var(--neon-green)' : 'var(--neon-red)' }}>
              {sslInfo?.valid ? <Lock size={10} /> : <Unlock size={10} />}
              {sslInfo?.valid ? 'Valid' : 'Invalid / Missing'}
            </span>
          </div>
          {finalUrl && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
              <span style={{ color: 'var(--on-surface-variant)' }}>Final URL</span>
              <span style={{ color: 'var(--electric-blue)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
                <ExternalLink size={10} /> {finalUrl.replace(/^https?:\/\//, '').slice(0, 30)}
              </span>
            </div>
          )}
          {redirectChain.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 11 }}>
              <span style={{ color: 'var(--amber)', fontWeight: 600 }}>
                {redirectChain.length} redirect{redirectChain.length > 1 ? 's' : ''} detected
              </span>
            </div>
          )}
        </div>
      </div>
    </GlassCard>
  );
}
