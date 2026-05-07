import type { ReactNode, MouseEvent, CSSProperties } from 'react';
import type { Verdict } from '../../lib/api';
import { AlertTriangle, CheckCircle2, HelpCircle, Minus, Clock, Inbox, Link2, Mail, Globe, MessageSquare, Mic } from 'lucide-react';

// ─── Verdict Chip ─────────────────────────────────────────────────────────────
export function VerdictChip({ verdict }: { verdict: Verdict | string }) {
  const map: Record<string, string> = {
    phishing:   'chip chip-phishing',
    legitimate: 'chip chip-legitimate',
    suspicious: 'chip chip-suspicious',
    unknown:    'chip chip-unknown',
    pending:    'chip chip-pending',
  };
  const icons: Record<string, ReactNode> = {
    phishing: <AlertTriangle size={14} />, legitimate: <CheckCircle2 size={14} />, suspicious: <HelpCircle size={14} />, unknown: <Minus size={14} />, pending: <Clock size={14} />,
  };
  const cls = map[verdict] ?? 'chip chip-unknown';
  return <span className={cls} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>{icons[verdict] ?? <Minus size={14} />} {verdict.toUpperCase()}</span>;
}

// ─── Confidence Bar ───────────────────────────────────────────────────────────
export function ConfidenceBar({ value, verdict }: { value: number; verdict?: string }) {
  const colorMap: Record<string, string> = {
    phishing:   'var(--neon-red)',
    legitimate: 'var(--neon-green)',
    suspicious: 'var(--amber)',
    unknown:    'var(--outline)',
  };
  const color = colorMap[verdict ?? 'unknown'] || 'var(--electric-blue)';
  const pct = Math.round(value * 100);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div className="progress-bar" style={{ flex: 1 }}>
        <div className="progress-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="code-data" style={{ color, minWidth: 36, textAlign: 'right' }}>{pct}%</span>
    </div>
  );
}

// ─── Glass Card ───────────────────────────────────────────────────────────────
export function GlassCard({
  children, className = '', style = {}, onClick,
}: {
  children: ReactNode; className?: string;
  style?: CSSProperties; onClick?: (e: MouseEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      className={`glass-card ${className}`}
      style={style}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {children}
    </div>
  );
}

// ─── Scan Indicator ───────────────────────────────────────────────────────────
export function ScanIndicator({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div className="scan-indicator-track">
      <div className="scan-indicator-bar" />
    </div>
  );
}

// ─── Status Dot ───────────────────────────────────────────────────────────────
export function StatusDot({ status }: { status: 'online' | 'warning' | 'offline' }) {
  const colors = { online: 'var(--neon-green)', warning: 'var(--amber)', offline: 'var(--neon-red)' };
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8,
      borderRadius: '50%', background: colors[status],
      boxShadow: `0 0 6px ${colors[status]}`,
    }} />
  );
}

// ─── No Data State ────────────────────────────────────────────────────────────
export function NoDataState({ icon = <Inbox size={48} />, title = 'No Data Available', message }: {
  icon?: ReactNode; title?: string; message?: string;
}) {
  return (
    <div className="no-data-state">
      <span className="icon">{icon}</span>
      <h4>{title}</h4>
      {message && <p>{message}</p>}
      <p style={{ fontSize: 12, opacity: 0.5 }}>
        Data will appear here once the backend is connected and active.
      </p>
    </div>
  );
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────────
export function Skeleton({ width = '100%', height = 16, className = '' }: { width?: string | number; height?: number; className?: string }) {
  return (
    <div
      className={className}
      style={{
        width, height,
        background: 'linear-gradient(90deg, var(--surface-container) 25%, var(--surface-container-high) 50%, var(--surface-container) 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s infinite',
      }}
    />
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────
export function SectionHeader({ title, subtitle, actions }: {
  title: string; subtitle?: string; actions?: ReactNode;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 48 }}>
      <div>
        <h2 style={{ fontSize: 24, marginBottom: 4 }}>{title}</h2>
        {subtitle && <p style={{ color: 'var(--on-surface-variant)', fontSize: 14 }}>{subtitle}</p>}
      </div>
      {actions && <div>{actions}</div>}
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
export function StatCard({
  label, value, sub, color = 'var(--primary)',
}: { label: string; value: ReactNode; sub?: string; color?: string }) {
  return (
    <GlassCard style={{ padding: '20px 24px' }}>
      <div className="label-caps" style={{ color: 'var(--on-surface-variant)', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 32, fontFamily: 'var(--font-headline)', fontWeight: 700, color }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--on-surface-variant)', marginTop: 4 }}>{sub}</div>}
    </GlassCard>
  );
}

// ─── Input Type Selector ──────────────────────────────────────────────────────
const INPUT_TYPES = [
  { value: 'url',   label: 'URL', icon: <Link2 size={14} /> },
  { value: 'email', label: 'EMAIL', icon: <Mail size={14} /> },
  { value: 'web',   label: 'WEB', icon: <Globe size={14} /> },
  { value: 'sms',   label: 'SMS', icon: <MessageSquare size={14} /> },
  { value: 'voice', label: 'VOICE', icon: <Mic size={14} /> },
];

export function InputTypeSelector({
  value, onChange,
}: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {INPUT_TYPES.map(t => (
        <button
          key={t.value}
          className={`btn flex items-center gap-1 ${value === t.value ? 'btn-primary' : 'btn-ghost'}`}
          style={{ fontSize: 12, padding: '6px 12px' }}
          onClick={() => onChange(t.value)}
          type="button"
        >
          {t.icon} {t.label}
        </button>
      ))}
    </div>
  );
}
