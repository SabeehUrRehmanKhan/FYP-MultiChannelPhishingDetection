import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { adminApi, type DatasetItem } from '../../lib/api';
import { GlassCard, NoDataState, Skeleton, SectionHeader, VerdictChip } from '../../components/ui/UIComponents';
import { Download, RefreshCw, ChevronLeft, ChevronRight, Database } from 'lucide-react';

export function AdminDatasetPage() {
  const { token } = useAuth();
  const [items, setItems] = useState<DatasetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const LIMIT = 20;

  const load = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.dataset(token, page, LIMIT);
      setItems(res.items || []);
      setTotal(res.total || 0);
    } catch {
      setError('Backend unavailable. No dataset data to display.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [token, page]);

  useEffect(() => { load(); }, [load]);

  const exportUrl = token ? adminApi.exportDataset(token) : '#';
  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <SectionHeader
        title="Verified Dataset"
        subtitle="Admin-approved phishing and legitimate records for ML retraining."
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <a href={exportUrl} className="btn btn-ghost flex items-center gap-1" style={{ fontSize: 13 }} target="_blank" rel="noreferrer">
              <Download size={14} /> Export CSV
            </a>
            <button className="btn btn-ghost flex items-center gap-1" onClick={load} style={{ fontSize: 13 }}><RefreshCw size={14} /> Refresh</button>
          </div>
        }
      />

      <GlassCard style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[...Array(5)].map((_, i) => <Skeleton key={i} height={44} />)}
          </div>
        ) : error || items.length === 0 ? (
          <NoDataState icon={<Database size={48} color="var(--on-surface-variant)" />} title="No Dataset Records" message={error || 'No verified records yet. Approve feedback items to populate the dataset.'} />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="pg-table">
              <thead>
                <tr>
                  <th>Input Type</th>
                  <th>Raw Input</th>
                  <th>True Label</th>
                  <th>Approved At</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id}>
                    <td>
                      <span className="label-caps" style={{ fontSize: 10, padding: '4px 10px', background: 'var(--surface-container-high)', borderRadius: '4px', color: 'var(--on-surface-variant)' }}>
                        {item.input_type}
                      </span>
                    </td>
                    <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <span className="code-data" style={{ color: 'var(--on-surface-variant)', fontSize: 13 }}>
                        {item.raw_input}
                      </span>
                    </td>
                    <td><VerdictChip verdict={item.true_label as any} /></td>
                    <td>
                      <span className="code-data" style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>
                        {new Date(item.approved_at).toLocaleString()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
          <button className="btn btn-ghost flex items-center gap-1" disabled={page === 1} onClick={() => setPage(p => p - 1)}><ChevronLeft size={14} /> Prev</button>
          <span className="code-data" style={{ padding: '8px 16px', color: 'var(--on-surface-variant)' }}>{page} / {totalPages}</span>
          <button className="btn btn-ghost flex items-center gap-1" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next <ChevronRight size={14} /></button>
        </div>
      )}
    </div>
  );
}
