import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { GlassCard, NoDataState, Skeleton, SectionHeader } from '../../components/ui/UIComponents';
import { simulationsApi } from '../../lib/api';
import { Edit2, X, ClipboardList } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
async function apiPost(path: string, body: unknown, token: string) {
  const res = await fetch(`${API_BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
async function apiPut(path: string, body: unknown, token: string) {
  const res = await fetch(`${API_BASE}${path}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

interface Question { question: string; options: string[]; correct_answer: string; explanation: string; }
const emptyQ = (): Question => ({ question: '', options: ['', '', '', ''], correct_answer: '', explanation: '' });
const EMPTY_FORM = { title: '', activity_type: 'quiz', difficulty: 'beginner', active: true };

export function AdminActivitiesPage() {
  const { token } = useAuth();
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [questions, setQuestions] = useState<Question[]>([emptyQ()]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try { const res = await simulationsApi.activities(token); setActivities(res.items || []); }
    catch { setActivities([]); } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  function openNew() { setEditId(null); setForm({ ...EMPTY_FORM }); setQuestions([emptyQ()]); setShowForm(true); setError(null); setSuccess(null); }
  function openEdit(act: any) {
    setEditId(act.id);
    setForm({ title: act.title, activity_type: act.activity_type, difficulty: act.difficulty, active: act.active });
    setQuestions((act.questions || [emptyQ()]).map((q: any) => ({ question: q.question || '', options: q.options || ['', '', '', ''], correct_answer: q.correct_answer || '', explanation: q.explanation || '' })));
    setShowForm(true); setError(null); setSuccess(null);
  }

  function setQ(i: number, field: keyof Question, val: string) {
    setQuestions(qs => qs.map((q, idx) => idx === i ? { ...q, [field]: val } : q));
  }
  function setOpt(qi: number, oi: number, val: string) {
    setQuestions(qs => qs.map((q, idx) => {
      if (idx !== qi) return q;
      const isCorrect = q.correct_answer === q.options[oi];
      const newOptions = q.options.map((o, j) => j === oi ? val : o);
      return {
        ...q,
        options: newOptions,
        correct_answer: isCorrect ? val : q.correct_answer
      };
    }));
  }
  function addQ() { setQuestions(qs => [...qs, emptyQ()]); }
  function removeQ(i: number) { setQuestions(qs => qs.filter((_, idx) => idx !== i)); }

  async function handleSave() {
    if (!token) { setError('Session expired. Please login again.'); window.scrollTo(0, 0); return; }
    if (!form.title.trim()) { setError('Title is required.'); window.scrollTo(0, 0); return; }
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.question.trim()) { setError(`Question ${i + 1} text is empty.`); window.scrollTo(0, 0); return; }
      if (!q.correct_answer.trim()) { setError(`Question ${i + 1} has no correct answer set.`); window.scrollTo(0, 0); return; }
      if (q.options.filter(o => o.trim()).length < 2) { setError(`Question ${i + 1} needs at least 2 options.`); window.scrollTo(0, 0); return; }
    }
    setSaving(true); setError(null);
    const payload = { ...form, questions: questions.map(q => ({ ...q, options: q.options.filter(o => o.trim()) })) };
    try {
      if (editId) { await apiPut(`/simulations/admin/activities/${editId}`, payload, token); setSuccess('Activity updated!'); }
      else { await apiPost('/simulations/admin/activities', payload, token); setSuccess('Activity created!'); }
      setShowForm(false); setEditId(null); await load();
    } catch (e: any) {
      setError(e.message || 'Save failed');
      window.scrollTo(0, 0);
    }
    finally { setSaving(false); }
  }

  const sel = (field: string) => ({
    value: (form as any)[field],
    onChange: (e: any) => setForm(f => ({ ...f, [field]: e.target.value })),
    style: { background: 'var(--surface-container)', padding: '8px 0', borderBottom: '1px solid var(--outline-variant)', width: '100%', marginBottom: 12, color: 'var(--on-surface)' } as any,
    className: 'dashboard__scan-textarea',
  });

  return (
    <div style={{ padding: 24 }}>
      <SectionHeader title="Manage MCQ Activities" subtitle="Create multiple-choice quizzes to test phishing awareness knowledge."
        actions={<button className="btn btn-primary" onClick={openNew}>+ New Activity</button>} />

      {error && <div style={{ padding: 12, marginBottom: 16, background: 'rgba(255,59,59,0.1)', border: '1px solid var(--neon-red)', color: 'var(--neon-red)', fontSize: 13 }}>{error}</div>}
      {success && <div style={{ padding: 12, marginBottom: 16, background: 'rgba(0,255,136,0.08)', border: '1px solid var(--neon-green)', color: 'var(--neon-green)', fontSize: 13 }}>{success}</div>}

      {showForm && (
        <GlassCard style={{ marginBottom: 24 }}>
          <h3 style={{ marginBottom: 20 }}>{editId ? 'Edit Activity' : 'New MCQ Activity'}</h3>

          {/* Metadata */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24, marginBottom: 32 }}>
            <div style={{ gridColumn: '1/-1' }}>
              <label className="label-caps" style={{ fontSize: 11, color: 'var(--on-surface-variant)', marginBottom: 8, display: 'block' }}>Title *</label>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Phishing Email Red Flags Quiz" className="dashboard__scan-textarea" style={{ minHeight: 'auto', padding: '12px 0', borderBottom: '1px solid var(--outline-variant)', width: '100%', marginBottom: 0, fontSize: '16px' }} />
            </div>
            <div>
              <label className="label-caps" style={{ fontSize: 11, color: 'var(--on-surface-variant)', marginBottom: 8, display: 'block' }}>Type</label>
              <select {...sel('activity_type')} style={{ ...sel('activity_type').style, padding: '12px 0', fontSize: '14px' }}><option value="quiz">Quiz</option><option value="spot_the_phish">Spot the Phish</option><option value="fill_blank">Fill in the Blank</option></select>
            </div>
            <div>
              <label className="label-caps" style={{ fontSize: 11, color: 'var(--on-surface-variant)', marginBottom: 8, display: 'block' }}>Difficulty</label>
              <select {...sel('difficulty')} style={{ ...sel('difficulty').style, padding: '12px 0', fontSize: '14px' }}>{['beginner', 'intermediate', 'advanced'].map(d => <option key={d} value={d}>{d}</option>)}</select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input type="checkbox" id="act-active" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} style={{ width: 18, height: 18, accentColor: 'var(--primary)' }} />
              <label htmlFor="act-active" style={{ fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>Active</label>
            </div>
          </div>

          {/* Questions */}
          <div className="label-caps" style={{ color: 'var(--electric-blue)', marginBottom: 16, fontSize: 12 }}>Questions ({questions.length})</div>
          {questions.map((q, qi) => (
            <div key={qi} style={{
              padding: 24,
              marginBottom: 24,
              border: '1px solid var(--outline-variant)',
              borderRadius: 12,
              background: 'var(--surface-container-low)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div className="label-caps" style={{ color: 'var(--amber)', fontSize: 12 }}>Question {qi + 1}</div>
                {questions.length > 1 && <button className="btn btn-danger flex items-center gap-1" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => removeQ(qi)}><X size={12} /> Remove</button>}
              </div>
              <textarea value={q.question} onChange={e => setQ(qi, 'question', e.target.value)} placeholder="Type your question here…" rows={3}
                style={{ width: '100%', background: 'var(--surface-container)', border: '1px solid var(--outline-variant)', color: 'var(--on-surface)', padding: 16, borderRadius: 8, marginBottom: 20, resize: 'vertical', fontSize: '15px', lineHeight: '1.6' }} />

              <div className="label-caps" style={{ fontSize: 11, color: 'var(--on-surface-variant)', marginBottom: 12 }}>Answer Options (select the correct one)</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
                {q.options.map((opt, oi) => (
                  <div key={oi} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <input type="radio" name={`correct-${qi}`} checked={q.correct_answer === opt && opt.trim() !== ''} onChange={() => setQ(qi, 'correct_answer', opt)}
                      title="Mark as correct answer" style={{ accentColor: 'var(--neon-green)', cursor: 'pointer', width: 18, height: 18 }} />
                    <input value={opt} onChange={e => setOpt(qi, oi, e.target.value)} placeholder={`Option ${oi + 1}`}
                      style={{ flex: 1, background: 'var(--surface-container)', border: `1px solid ${q.correct_answer === opt && opt.trim() ? 'var(--neon-green)' : 'var(--outline-variant)'}`, color: 'var(--on-surface)', padding: '12px 16px', borderRadius: 8, fontSize: 14 }} />
                  </div>
                ))}
              </div>

              <div style={{ fontSize: 12, color: 'var(--on-surface-variant)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: 'var(--neon-green)' }}>●</span> Click the radio button next to the correct answer
              </div>

              <div className="label-caps" style={{ fontSize: 11, color: 'var(--on-surface-variant)', marginBottom: 8 }}>Explanation (Shown after answering)</div>
              <textarea value={q.explanation} onChange={e => setQ(qi, 'explanation', e.target.value)} placeholder="Explain why this is the correct answer…" rows={2}
                style={{ width: '100%', background: 'var(--surface-container)', border: '1px solid var(--outline-variant)', color: 'var(--on-surface)', padding: 12, borderRadius: 8, resize: 'vertical', fontSize: 14 }} />
            </div>
          ))}
          <button className="btn btn-ghost" onClick={addQ} style={{ marginBottom: 20, width: '100%', justifyContent: 'center' }}>+ Add Question</button>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : '◈ Save Activity'}</button>
            <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </GlassCard>
      )}

      {/* List */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{[...Array(3)].map((_, i) => <Skeleton key={i} height={60} />)}</div>
      ) : activities.length === 0 ? (
        <GlassCard><NoDataState icon={<ClipboardList size={48} color="var(--on-surface-variant)" />} title="No Activities" message="Create your first MCQ activity using the button above." /></GlassCard>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {activities.map(act => (
            <GlassCard key={act.id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px' }}>
              <div style={{ color: 'var(--electric-blue)' }}><ClipboardList size={24} /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{act.title}</div>
                <div className="label-caps" style={{ color: 'var(--on-surface-variant)', fontSize: 10 }}>
                  {act.activity_type} • {act.difficulty} • {(act.questions || []).length} questions •{' '}
                  {act.active ? <span style={{ color: 'var(--neon-green)' }}>ACTIVE</span> : <span style={{ color: 'var(--neon-red)' }}>INACTIVE</span>}
                </div>
              </div>
              <button className="btn btn-ghost flex items-center gap-1" style={{ fontSize: 12 }} onClick={() => openEdit(act)}><Edit2 size={12} /> Edit</button>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
