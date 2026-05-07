import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { historyApi, type Analysis } from '../lib/api';
import { GlassCard, VerdictChip, ConfidenceBar, NoDataState, Skeleton, SectionHeader } from '../components/ui/UIComponents';
import './HistoryPage.css';

const INPUT_TYPE_ICONS: Record<string, string> = {
  url: '🔗', email: '✉️', web: '🌐', sms: '💬', voice: '🎙️',
};

export function HistoryPage() {
  const { token } = useAuth();
  const navigate = useNavigate();

  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<string>('all');
  const LIMIT = 15;

  const load = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await historyApi.list(token, page, LIMIT);
      setAnalyses(res.items || []);
      setTotal(res.total || 0);
    } catch {
      setError('Backend unavailable. No history data to display.');
      setAnalyses([]);
    } finally {
      setLoading(false);
    }
  }, [token, page]);

  useEffect(() => { load(); }, [load]);

  const filtered = filter === 'all' ? analyses : analyses.filter(a => a.final_verdict === filter);
  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="history-page">
      <SectionHeader
        title="History & Sessions"
        subtitle="Review cryptographic logs of all scanned communications."
        actions={
          <button className="btn btn-ghost" onClick={load} style={{ fontSize: 13 }}>
            ↻ Refresh
          </button>
        }
      />

      {/* Filter bar */}
      <div className="history-page__filters">
        {(['all', 'phishing', 'legitimate', 'suspicious', 'unknown'] as const).map(f => (
          <button
            key={f}
            className={`btn ${filter === f ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: 12, padding: '6px 14px' }}
            onClick={() => setFilter(f)}
          >
            {f.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Table */}
      <GlassCard style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[...Array(6)].map((_, i) => <Skeleton key={i} height={40} />)}
          </div>
        ) : error ? (
          <NoDataState icon="🔌" title="No Data Available" message={error} />
        ) : filtered.length === 0 ? (
          <NoDataState
            icon="⌂"
            title="No Analysis Records"
            message="Analysis history will appear here once you start scanning content."
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="pg-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Input</th>
                  <th>Verdict</th>
                  <th>Confidence</th>
                  <th>Channels</th>
                  <th>Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(a => (
                  <tr
                    key={a.id}
                    className={`history-page__row history-page__row--${a.final_verdict}`}
                    onClick={() => navigate(`/history/${a.id}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      <span title={a.input_type}>{INPUT_TYPE_ICONS[a.input_type] || '◈'}</span>
                      <span className="label-caps" style={{ fontSize: 10, marginLeft: 6 }}>{a.input_type}</span>
                    </td>
                    <td className="history-page__input-cell">
                      <span className="code-data">{a.raw_input.slice(0, 50)}{a.raw_input.length > 50 ? '…' : ''}</span>
                    </td>
                    <td><VerdictChip verdict={a.final_verdict} /></td>
                    <td style={{ minWidth: 140 }}><ConfidenceBar value={a.confidence} verdict={a.final_verdict} /></td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {(a.channels_run || []).map(ch => (
                          <span key={ch} className="label-caps" style={{
                            fontSize: 9, padding: '4px 8px',
                            background: 'var(--surface-container-high)',
                            borderRadius: '4px',
                            color: 'var(--on-surface-variant)',
                          }}>{ch}</span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <span className="code-data" style={{ color: 'var(--on-surface-variant)', fontSize: 12 }}>
                        {new Date(a.created_at).toLocaleString()}
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn btn-ghost"
                        style={{ fontSize: 12, padding: '4px 10px' }}
                        onClick={e => { e.stopPropagation(); navigate(`/history/${a.id}`); }}
                      >
                        ▷ Detail
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
          <button
            className="btn btn-ghost"
            disabled={page === 1}
            onClick={() => setPage(p => p - 1)}
          >◁ Prev</button>
          <span className="code-data" style={{ padding: '8px 16px', color: 'var(--on-surface-variant)' }}>
            {page} / {totalPages}
          </span>
          <button
            className="btn btn-ghost"
            disabled={page === totalPages}
            onClick={() => setPage(p => p + 1)}
          >Next ▷</button>
        </div>
      )}
    </div>
  );
}