import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { historyApi, feedbackApi, type AnalysisDetail } from '../lib/api';
import { GlassCard, VerdictChip, ConfidenceBar, NoDataState, ScanIndicator } from '../components/ui/UIComponents';

export function AnalysisDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [analysis, setAnalysis] = useState<AnalysisDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Feedback modal
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackVerdict, setFeedbackVerdict] = useState('phishing');
  const [feedbackNotes, setFeedbackNotes] = useState('');
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackDone, setFeedbackDone] = useState(false);

  useEffect(() => {
    if (!id || !token) { setLoading(false); return; }
    historyApi.detail(token, id)
      .then(data => { setAnalysis(data); setLoading(false); })
      .catch(() => { setError('Could not load analysis detail.'); setLoading(false); });
  }, [id, token]);

  async function submitFeedback() {
    if (!token || !analysis) return;
    setFeedbackSubmitting(true);
    try {
      await feedbackApi.submit(token, { analysis_id: analysis.id, verdict: feedbackVerdict, notes: feedbackNotes });
      setFeedbackDone(true);
      setFeedbackOpen(false);
    } catch {
      setError('Failed to submit feedback.');
    } finally {
      setFeedbackSubmitting(false);
    }
  }

  const verdictColor: Record<string, string> = {
    phishing: 'var(--neon-red)',
    legitimate: 'var(--neon-green)',
    suspicious: 'var(--amber)',
    unknown: 'var(--outline)',
  };

  if (loading) return (
    <GlassCard>
      <ScanIndicator active />
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--on-surface-variant)' }}>Loading analysis…</div>
    </GlassCard>
  );

  if (error || !analysis) return (
    <GlassCard>
      <NoDataState icon="⌂" title="Analysis Not Found" message={error || 'This analysis record could not be loaded.'} />
      <button className="btn btn-ghost" onClick={() => navigate('/history')} style={{ margin: '0 auto', display: 'flex' }}>
        ← Back to History
      </button>
    </GlassCard>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="btn btn-ghost" onClick={() => navigate('/history')}>◁ History</button>
        <div className="label-caps" style={{ color: 'var(--on-surface-variant)' }}>
          Analysis Detail
        </div>
      </div>

      {/* Summary card */}
      <GlassCard style={{ borderColor: verdictColor[analysis.final_verdict] || 'rgba(255,255,255,0.1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div className="label-caps" style={{ color: 'var(--on-surface-variant)', marginBottom: 8 }}>
              {analysis.input_type.toUpperCase()} Analysis
            </div>
            <h2 style={{ fontSize: 22, marginBottom: 8 }}>
              <VerdictChip verdict={analysis.final_verdict} />
            </h2>
            <div style={{
              fontSize: 36, fontWeight: 700, fontFamily: 'var(--font-headline)',
              color: verdictColor[analysis.final_verdict]
            }}>
              {Math.round(analysis.confidence * 100)}% confidence
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="code-data" style={{ color: 'var(--on-surface-variant)', fontSize: 12, marginBottom: 4 }}>
              ID: {analysis.id.slice(0, 16)}…
            </div>
            <div className="code-data" style={{ color: 'var(--on-surface-variant)', fontSize: 12, marginBottom: 8 }}>
              {new Date(analysis.created_at).toLocaleString()}
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {(analysis.channels_run || []).map(ch => (
                <span key={ch} className="label-caps" style={{ fontSize: 9, padding: '2px 8px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  {ch}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 16, padding: 12, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)', wordBreak: 'break-all' }}>
          <div className="label-caps" style={{ color: 'var(--on-surface-variant)', marginBottom: 6 }}>Scanned Input</div>
          <div className="code-data" style={{ color: 'var(--on-surface)' }}>{analysis.raw_input}</div>
        </div>
      </GlassCard>

      {/* Channel features */}
      {(analysis.features || []).length > 0 && (
        <div>
          <div className="label-caps" style={{ color: 'var(--on-surface-variant)', marginBottom: 12 }}>Channel Details</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px,1fr))', gap: 16 }}>
            {analysis.features.map(f => (
              <GlassCard key={f.channel}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div className="label-caps" style={{ color: 'var(--electric-blue)' }}>{f.channel}</div>
                  <div className="code-data" style={{ fontSize: 10, color: 'var(--outline)' }}>v{f.model_ver}</div>
                </div>
                <ConfidenceBar value={f.score} verdict={f.score > 0.7 ? 'phishing' : f.score > 0.4 ? 'suspicious' : 'legitimate'} />
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {Object.entries(f.features).slice(0, 6).map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ color: 'var(--on-surface-variant)' }}>{k}</span>
                      <span className="code-data" style={{ color: 'var(--on-surface)' }}>{String(v)}</span>
                    </div>
                  ))}
                </div>
              </GlassCard>
            ))}
          </div>
        </div>
      )}

      {/* Feedback */}
      <GlassCard>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="label-caps" style={{ color: 'var(--on-surface-variant)', marginBottom: 4 }}>Model Feedback</div>
            <p style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>Was this verdict correct? Help improve the model.</p>
          </div>
          {feedbackDone ? (
            <span style={{ color: 'var(--neon-green)', fontSize: 13 }}>✓ Feedback submitted</span>
          ) : (
            <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={() => setFeedbackOpen(!feedbackOpen)}>
              ◈ Submit Feedback
            </button>
          )}
        </div>

        {feedbackOpen && !feedbackDone && (
          <div className="animate-slide-in" style={{ marginTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 16 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {['phishing', 'legitimate', 'suspicious'].map(v => (
                <button
                  key={v}
                  className={`btn ${feedbackVerdict === v ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ fontSize: 12, padding: '6px 14px' }}
                  onClick={() => setFeedbackVerdict(v)}
                >{v.toUpperCase()}</button>
              ))}
            </div>
            <div className="input-group">
              <label>Notes (optional)</label>
              <input
                className="input-field"
                placeholder="Explain why this verdict is incorrect…"
                value={feedbackNotes}
                onChange={e => setFeedbackNotes(e.target.value)}
              />
            </div>
            <button
              className="btn btn-primary"
              disabled={feedbackSubmitting}
              onClick={submitFeedback}
            >
              {feedbackSubmitting ? '⏳ Submitting…' : '◈ Submit'}
            </button>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
