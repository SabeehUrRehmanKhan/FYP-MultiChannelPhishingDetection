import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { adminApi, type ThreatIndicator } from '../lib/api';
import { GlassCard, NoDataState, Skeleton, SectionHeader, ConfidenceBar } from '../components/ui/UIComponents';
import { XCircle, CheckCircle2 } from 'lucide-react';

export function ThreatIntelPage() {
  const { token, profile } = useAuth();
  const [indicators, setIndicators] = useState<ThreatIndicator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState('all');
  const [verifiedFilter, setVerifiedFilter] = useState<'all' | 'yes' | 'no'>('all');

  const load = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.threatIndicators(
        token,
        typeFilter !== 'all' ? typeFilter : undefined,
        verifiedFilter === 'all' ? undefined : verifiedFilter === 'yes',
      );
      setIndicators(res.items || []);
    } catch {
      setError('Backend unavailable. No threat intelligence data to display.');
      setIndicators([]);
    } finally {
      setLoading(false);
    }
  }, [token, typeFilter, verifiedFilter]);

  useEffect(() => { load(); }, [load]);

  async function handleVerify(id: string, verified: boolean) {
    if (!token) return;
    try {
      await adminApi.verifyThreat(token, id, verified);
      setIndicators(prev => prev.map(i => i.id === id ? { ...i, verified } : i));
    } catch {
      setError('Failed to update indicator.');
    }
  }

  const isAdmin = profile?.role === 'admin' || profile?.role === 'moderator';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <SectionHeader
        title="Threat Intelligence"
        subtitle="Persistent threat indicators — domains, IPs, and patterns."
        actions={
          <button className="btn btn-ghost" onClick={load} style={{ fontSize: 13 }}>↻ Refresh</button>
        }
      />

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {['all', 'domain', 'ip', 'email', 'phone', 'url_pattern'].map(t => (
          <button
            key={t}
            className={`btn ${typeFilter === t ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: 12, padding: '6px 14px' }}
            onClick={() => setTypeFilter(t)}
          >{t.toUpperCase()}</button>
        ))}
        <div style={{ width: 1, background: 'var(--outline-variant)', margin: '0 4px' }} />
        {(['all', 'yes', 'no'] as const).map(v => (
          <button
            key={v}
            className={`btn ${verifiedFilter === v ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: 12, padding: '6px 14px' }}
            onClick={() => setVerifiedFilter(v)}
          >
            {v === 'all' ? 'ALL' : v === 'yes' ? '✓ VERIFIED' : '✗ UNVERIFIED'}
          </button>
        ))}
      </div>

      <GlassCard style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[...Array(5)].map((_, i) => <Skeleton key={i} height={44} />)}
          </div>
        ) : error || indicators.length === 0 ? (
          <NoDataState
            icon="◬"
            title="No Threat Indicators"
            message={error || 'No threat indicators found. Data will populate as the system detects phishing patterns.'}
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="pg-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Value</th>
                  <th>Threat Score</th>
                  <th>Reports</th>
                  <th>Source</th>
                  <th>Verified</th>
                  <th>Last Seen</th>
                  {isAdmin && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {indicators.map(ind => (
                  <tr key={ind.id}>
                    <td>
                      <span className="label-caps" style={{
                        fontSize: 10, padding: '2px 8px',
                        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)'
                      }}>
                        {ind.indicator_type}
                      </span>
                    </td>
                    <td>
                      <span className="code-data" style={{ color: 'var(--neon-red)' }}>{ind.value}</span>
                    </td>
                    <td style={{ minWidth: 160 }}>
                      <ConfidenceBar value={ind.threat_score} verdict="phishing" />
                    </td>
                    <td>
                      <span className="code-data">{ind.report_count}</span>
                    </td>
                    <td>
                      <span style={{ color: 'var(--on-surface-variant)', fontSize: 13 }}>{ind.source}</span>
                    </td>
                    <td>
                      {ind.verified ? (
                        <span style={{ color: 'var(--neon-green)', fontSize: 13 }}>✓ Yes</span>
                      ) : (
                        <span style={{ color: 'var(--outline)', fontSize: 13 }}>✗ No</span>
                      )}
                    </td>
                    <td>
                      <span className="code-data" style={{ color: 'var(--on-surface-variant)', fontSize: 12 }}>
                        {new Date(ind.last_seen).toLocaleDateString()}
                      </span>
                    </td>
                    {isAdmin && (
                      <td>
                        <button
                          className={`btn ${ind.verified ? 'btn-ghost' : 'btn-success'}`}
                          style={{ fontSize: 11, padding: '4px 10px' }}
                          onClick={() => handleVerify(ind.id, !ind.verified)}
                        >
                          {ind.verified ? <><XCircle size={12} /> Unverify</> : <><CheckCircle2 size={12} /> Verify</>}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
