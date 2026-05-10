import { GlassCard } from '../ui/UIComponents';
import { Mic, Shield, AlertTriangle, Activity } from 'lucide-react';

interface VoiceAnalysisProps {
  scores?: { acoustic_clarity?: number; prosody_analysis?: number; neural_transformer?: number };
  verdictLabel?: string;
  durationSec?: number;
  acousticRulesHit?: string[];
  analysisType?: string;
}

function GaugeBar({ label, value, color, icon }: { label: string; value: number; color: string; icon: React.ReactNode }) {
  const pct = Math.round(value * 100);
  const isRisky = pct > 50;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {icon}
          <span style={{ fontSize: 12, color: 'var(--on-surface-variant)', fontWeight: 500 }}>{label}</span>
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)', color: isRisky ? 'var(--neon-red)' : 'var(--neon-green)' }}>
          {pct}%
        </span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
        <div style={{
          width: `${pct}%`,
          height: '100%',
          borderRadius: 3,
          background: `linear-gradient(90deg, ${color}, ${isRisky ? 'var(--neon-red)' : color})`,
          transition: 'width 1s ease-out',
          boxShadow: `0 0 12px ${color}40`,
        }} />
      </div>
    </div>
  );
}

export function VoiceAnalysis({ scores, verdictLabel, durationSec, acousticRulesHit = [], analysisType }: VoiceAnalysisProps) {
  const isFake = verdictLabel === 'FAKE';
  const sc = scores || { acoustic_clarity: 0, prosody_analysis: 0, neural_transformer: 0 };

  return (
    <GlassCard style={{ padding: 0, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Mic size={18} style={{ color: 'var(--electric-blue)' }} />
          <span style={{ fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: '1px' }}>
            Voice Deepfake Analysis
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {durationSec != null && (
            <span style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>{durationSec.toFixed(1)}s</span>
          )}
          <span style={{
            fontSize: 11, padding: '3px 12px', borderRadius: 20, fontWeight: 700,
            background: isFake ? 'rgba(255,59,48,0.15)' : 'rgba(48,209,88,0.15)',
            color: isFake ? 'var(--neon-red)' : 'var(--neon-green)',
            border: `1px solid ${isFake ? 'rgba(255,59,48,0.3)' : 'rgba(48,209,88,0.3)'}`,
          }}>
            {isFake ? '🔴 FAKE' : '🟢 REAL'}
          </span>
        </div>
      </div>

      {/* 3-Stage Scores */}
      <div style={{ padding: 20 }}>
        <div style={{ fontSize: 10, color: 'var(--on-surface-variant)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 14, fontWeight: 600 }}>
          3-Stage Pipeline Results
        </div>

        <GaugeBar
          label="Stage 1 — Acoustic Clarity"
          value={sc.acoustic_clarity ?? 0}
          color="#6366f1"
          icon={<Activity size={12} style={{ color: '#6366f1' }} />}
        />
        <GaugeBar
          label="Stage 2 — Prosody Analysis"
          value={sc.prosody_analysis ?? 0}
          color="#8b5cf6"
          icon={<Activity size={12} style={{ color: '#8b5cf6' }} />}
        />
        <GaugeBar
          label="Stage 3 — Neural Transformer"
          value={sc.neural_transformer ?? 0}
          color="#a78bfa"
          icon={<Activity size={12} style={{ color: '#a78bfa' }} />}
        />

        {/* Weights info */}
        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          {[
            { label: 'Acoustic', w: '20%', color: '#6366f1' },
            { label: 'Prosody', w: '35%', color: '#8b5cf6' },
            { label: 'Neural', w: '45%', color: '#a78bfa' },
          ].map((wt, i) => (
            <div key={i} style={{
              fontSize: 10, color: 'var(--on-surface-variant)',
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: wt.color }} />
              {wt.label}: {wt.w}
            </div>
          ))}
        </div>
      </div>

      {/* Acoustic Rules */}
      {acousticRulesHit.length > 0 && (
        <div style={{ padding: '0 20px 20px' }}>
          <div style={{ fontSize: 10, color: 'var(--on-surface-variant)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8, fontWeight: 600 }}>
            Acoustic Rules Triggered
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {acousticRulesHit.map((rule, i) => (
              <span key={i} style={{
                fontSize: 11, padding: '3px 10px', borderRadius: 6,
                background: 'rgba(255,59,48,0.10)', color: 'var(--neon-red)',
                border: '1px solid rgba(255,59,48,0.2)',
              }}>
                <AlertTriangle size={10} style={{ marginRight: 4 }} />{rule}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Analysis Type */}
      {analysisType && (
        <div style={{
          padding: '10px 20px', borderTop: '1px solid rgba(255,255,255,0.04)',
          fontSize: 10, color: 'var(--on-surface-variant)',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <Shield size={10} />
          Analysis mode: {analysisType === 'deepfake_audio' ? 'Full Audio Pipeline' : 'Text-Only NLP'}
        </div>
      )}
    </GlassCard>
  );
}
