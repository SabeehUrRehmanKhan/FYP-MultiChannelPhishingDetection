import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { feedbackApi, type FeedbackItem } from '../../lib/api';
import { GlassCard, NoDataState, Skeleton, SectionHeader, VerdictChip } from '../../components/ui/UIComponents';

export function AdminFeedbackPage() {
  const { token } = useAuth();
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [processing, setProcessing] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await feedbackApi.list(token, statusFilter);
      setItems(res.items || []);
    } catch {
      setError('Backend unavailable. No feedback queue data to display.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [token, statusFilter]);

  useEffect(() => { load(); }, [load]);

  async function handleAction(id: string, action: 'approve' | 'reject') {
    if (!token) return;
    setProcessing(id);
    try {
      if (action === 'approve') await feedbackApi.approve(token, id);
      else await feedbackApi.reject(token, id);
      setItems(prev => prev.filter(i => i.id !== id));
    } catch {
      setError('Failed to process feedback item.');
    } finally {
      setProcessing(null);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <SectionHeader
        title="Feedback Queue"
        subtitle="Review user-submitted corrections and approve/reject them for dataset inclusion."
        actions={<button className="btn btn-ghost" onClick={load} style={{ fontSize: 13 }}>↻ Refresh</button>}
      />

      <div style={{ display: 'flex', gap: 8 }}>
        {['pending', 'approved', 'rejected'].map(s => (
          <button
            key={s}
            className={`btn ${statusFilter === s ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: 12, padding: '6px 14px' }}
            onClick={() => setStatusFilter(s)}
          >{s.toUpperCase()}</button>
        ))}
      </div>

      {error && (
        <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', padding: '12px 16px', fontSize: 14, color: 'var(--amber)' }}>
          ⚠ {error}
        </div>
      )}

      <GlassCard style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[...Array(4)].map((_, i) => <Skeleton key={i} height={60} />)}
          </div>
        ) : items.length === 0 ? (
          <NoDataState
            icon="◐"
            title="No Feedback Items"
            message={error ? 'Backend unavailable.' : `No ${statusFilter} feedback items at this time.`}
          />
        ) : (
          <table className="pg-table">
            <thead>
              <tr>
                <th>Analysis ID</th>
                <th>User Verdict</th>
                <th>Notes</th>
                <th>Submitted</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id}>
                  <td>
                    <span className="code-data" style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>
                      {item.analysis_id.slice(0, 12)}…
                    </span>
                  </td>
                  <td><VerdictChip verdict={item.user_verdict as any} /></td>
                  <td style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span style={{ color: 'var(--on-surface-variant)', fontSize: 13 }}>{item.notes || '—'}</span>
                  </td>
                  <td>
                    <span className="code-data" style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>
                      {new Date(item.created_at).toLocaleDateString()}
                    </span>
                  </td>
                  <td>
                    <span className={`chip ${item.status === 'pending' ? 'chip-suspicious' : item.status === 'approved' ? 'chip-legitimate' : 'chip-phishing'}`}>
                      {item.status}
                    </span>
                  </td>
                  <td>
                    {item.status === 'pending' && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className="btn btn-success"
                          style={{ fontSize: 11, padding: '4px 10px' }}
                          disabled={processing === item.id}
                          onClick={() => handleAction(item.id, 'approve')}
                        >✓ Approve</button>
                        <button
                          className="btn btn-danger"
                          style={{ fontSize: 11, padding: '4px 10px' }}
                          disabled={processing === item.id}
                          onClick={() => handleAction(item.id, 'reject')}
                        >✗ Reject</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </GlassCard>
    </div>
  );
}
