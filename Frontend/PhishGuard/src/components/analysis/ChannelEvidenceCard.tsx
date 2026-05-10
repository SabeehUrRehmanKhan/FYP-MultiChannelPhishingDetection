import { GlassCard } from '../ui/UIComponents';
import {
  Link, Mail, Globe, Mic, AlertTriangle, ShieldCheck,
  ShieldAlert, Info, Zap, Eye, Lock
} from 'lucide-react';

interface ChannelEvidenceCardProps {
  channel: string;
  score: number;
  verdict: string;
  confidence: number;
  features: Record<string, unknown>;
  processingTimeMs: number;
}

const CHANNEL_META: Record<string, { icon: React.ReactNode; label: string; color: string; emoji: string }> = {
  url: { icon: <Link size={16} />, label: 'URL Analysis', color: '#6366f1', emoji: '🔗' },
  nlp: { icon: <Mail size={16} />, label: 'NLP Analysis', color: '#0ea5e9', emoji: '📧' },
  web: { icon: <Globe size={16} />, label: 'Web Visual', color: '#22d3ee', emoji: '🌐' },
  voice: { icon: <Mic size={16} />, label: 'Voice Analysis', color: '#a78bfa', emoji: '🎤' },
};

function VerdictBadge({ verdict, score }: { verdict: string; score: number }) {
  const isPhishing = verdict === 'phishing';
  const isSuspicious = verdict === 'suspicious';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '4px 12px', borderRadius: 20,
      background: isPhishing ? 'rgba(255,59,48,0.12)' : isSuspicious ? 'rgba(255,179,0,0.12)' : 'rgba(48,209,88,0.12)',
      border: `1px solid ${isPhishing ? 'rgba(255,59,48,0.25)' : isSuspicious ? 'rgba(255,179,0,0.25)' : 'rgba(48,209,88,0.25)'}`,
    }}>
      {isPhishing ? <ShieldAlert size={12} style={{ color: 'var(--neon-red)' }} /> :
        isSuspicious ? <AlertTriangle size={12} style={{ color: 'var(--amber)' }} /> :
          <ShieldCheck size={12} style={{ color: 'var(--neon-green)' }} />}
      <span style={{
        fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px',
        color: isPhishing ? 'var(--neon-red)' : isSuspicious ? 'var(--amber)' : 'var(--neon-green)',
      }}>
        {verdict}
      </span>
      <span style={{ fontSize: 11, color: 'var(--on-surface-variant)', fontFamily: 'var(--font-mono)' }}>
        {Math.round(score * 100)}%
      </span>
    </div>
  );
}

function FeatureRow({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3, padding: '2px 0' }}>
      <span style={{ color: 'var(--on-surface-variant)' }}>{label}</span>
      <span style={{ color: danger ? 'var(--neon-red)' : 'var(--on-surface)', fontWeight: 500, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
        {value}
      </span>
    </div>
  );
}

function URLFeatures({ features }: { features: Record<string, unknown> }) {
  return (
    <div>
      <FeatureRow label="Hostname" value={String(features.hostname || '—')} />
      <FeatureRow label="TLD" value={String(features.tld || '—')} />
      <FeatureRow label="URL Length" value={String(features.url_length || 0)} danger={(features.url_length as number) > 75} />
      <FeatureRow label="Subdomains" value={String(features.subdomain_count || 0)} danger={(features.subdomain_count as number) > 3} />
      <FeatureRow label="Has IP Address" value={features.has_ip ? '⚠ YES' : '✓ NO'} danger={!!features.has_ip} />
      <FeatureRow label="Special Chars" value={String(features.special_char_count || 0)} danger={(features.special_char_count as number) > 3} />
      <FeatureRow label="Entropy" value={String(features.entropy || '—')} danger={(features.entropy as number) > 4.0} />
      <FeatureRow label="BERT Confidence" value={`${Math.round((features.bert_phishing_probability as number || 0) * 100)}%`} />
    </div>
  );
}

function NLPFeatures({ features }: { features: Record<string, unknown> }) {
  const tokens = features.tokens_flagged as Array<{ token: string; attention: number }> || [];
  return (
    <div>
      <FeatureRow label="Channel" value={String(features.channel || 'email')} />
      <FeatureRow label="Text Length" value={String(features.text_length || 0)} />
      <FeatureRow label="Threshold" value={String(features.threshold_used || 0.65)} />
      <FeatureRow label="Urgency" value={`${Math.round((features.urgency_score as number || 0) * 100)}%`} danger={(features.urgency_score as number) > 0.4} />
      <FeatureRow label="Impersonation" value={`${Math.round((features.impersonation_score as number || 0) * 100)}%`} danger={(features.impersonation_score as number) > 0.25} />
      {tokens.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 10, color: 'var(--on-surface-variant)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 6, fontWeight: 600 }}>
            Flagged Tokens
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {tokens.slice(0, 8).map((t, i) => (
              <span key={i} style={{
                fontSize: 10, padding: '2px 8px', borderRadius: 4,
                background: `rgba(255,59,48,${0.05 + t.attention * 2})`,
                border: '1px solid rgba(255,59,48,0.15)',
                color: 'var(--on-surface)',
              }}>
                {t.token}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function WebFeatures({ features }: { features: Record<string, unknown> }) {
  const dom = features.dom_features as Record<string, unknown> || {};
  const sus = features.suspicious_elements as Array<{ reason: string; severity: string }> || [];
  return (
    <div>
      <FeatureRow label="Password Fields" value={dom.has_password_field ? '⚠ YES' : '✓ NO'} danger={!!dom.has_password_field} />
      <FeatureRow label="Hidden Iframes" value={dom.has_hidden_iframe ? '⚠ YES' : '✓ NO'} danger={!!dom.has_hidden_iframe} />
      <FeatureRow label="External Scripts" value={String(dom.external_js_count || 0)} danger={(dom.external_js_count as number) > 5} />
      <FeatureRow label="Redirects" value={String(features.redirect_count || 0)} danger={(features.redirect_count as number) > 2} />
      {sus.length > 0 && (
        <div style={{ marginTop: 6 }}>
          {sus.slice(0, 3).map((s, i) => (
            <div key={i} style={{ fontSize: 10, color: s.severity === 'high' ? 'var(--neon-red)' : 'var(--amber)', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
              <AlertTriangle size={9} /> {s.reason}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function VoiceFeatures({ features }: { features: Record<string, unknown> }) {
  const scores = features.scores as Record<string, number> || {};
  const rules = features.acoustic_rules_hit as string[] || [];
  return (
    <div>
      <FeatureRow label="Analysis" value={String(features.analysis_type || 'unknown')} />
      <FeatureRow label="Verdict" value={String(features.verdict_label || '—')} danger={features.verdict_label === 'FAKE'} />
      <FeatureRow label="Duration" value={`${features.duration_sec || 0}s`} />
      <FeatureRow label="Acoustic" value={`${Math.round((scores.acoustic_clarity || 0) * 100)}%`} />
      <FeatureRow label="Prosody" value={`${Math.round((scores.prosody_analysis || 0) * 100)}%`} />
      <FeatureRow label="Neural" value={`${Math.round((scores.neural_transformer || 0) * 100)}%`} />
      {rules.length > 0 && (
        <div style={{ marginTop: 4, fontSize: 10, color: 'var(--neon-red)' }}>
          Rules: {rules.join(', ')}
        </div>
      )}
    </div>
  );
}

export function ChannelEvidenceCard({ channel, score, verdict, confidence, features, processingTimeMs }: ChannelEvidenceCardProps) {
  const meta = CHANNEL_META[channel] || CHANNEL_META.url;
  const isAnalyzing = false; // Could be driven by SSE state

  return (
    <GlassCard style={{
      padding: 0, overflow: 'hidden',
      borderLeft: `3px solid ${meta.color}`,
      transition: 'all 0.3s ease',
    }}>
      {/* Card Header */}
      <div style={{
        padding: '12px 16px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: meta.color }}>{meta.icon}</span>
          <span style={{ fontFamily: 'var(--font-headline)', fontWeight: 600, fontSize: 12, color: 'var(--on-surface)' }}>
            {meta.emoji} {meta.label}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <VerdictBadge verdict={verdict} score={score} />
          <span style={{ fontSize: 10, color: 'var(--on-surface-variant)', fontFamily: 'var(--font-mono)' }}>
            <Zap size={9} style={{ marginRight: 2 }} />{processingTimeMs}ms
          </span>
        </div>
      </div>

      {/* Confidence Bar */}
      <div style={{ padding: '0 16px' }}>
        <div style={{ height: 2, borderRadius: 1, background: 'rgba(255,255,255,0.04)', marginTop: 1 }}>
          <div style={{
            width: `${Math.round(confidence * 100)}%`, height: '100%', borderRadius: 1,
            background: `linear-gradient(90deg, ${meta.color}, ${meta.color}80)`,
            transition: 'width 0.8s ease-out',
          }} />
        </div>
      </div>

      {/* Features */}
      <div style={{ padding: '12px 16px' }}>
        {channel === 'url' && <URLFeatures features={features} />}
        {channel === 'nlp' && <NLPFeatures features={features} />}
        {channel === 'web' && <WebFeatures features={features} />}
        {channel === 'voice' && <VoiceFeatures features={features} />}
      </div>

      {/* Model Info Footer */}
      <div style={{
        padding: '6px 16px', borderTop: '1px solid rgba(255,255,255,0.03)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontSize: 10, color: 'var(--on-surface-variant)',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Info size={9} /> Confidence: {Math.round(confidence * 100)}%
        </span>
        {features.model_accuracy && (
          <span>Model Acc: {Math.round((features.model_accuracy as number) * 100)}%</span>
        )}
      </div>
    </GlassCard>
  );
}
