import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { GlassCard, NoDataState, Skeleton, SectionHeader } from '../../components/ui/UIComponents';
import { simulationsApi } from '../../lib/api';
import { Mail, Link2, MessageSquare, Mic, Edit2, PowerOff, X, Activity, Hexagon } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

async function apiPost(path: string, body: unknown, token: string) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
async function apiPut(path: string, body: unknown, token: string) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
async function apiDel(path: string, token: string) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const EMPTY_FORM = {
  title: '', sim_type: 'unified', difficulty: 'beginner',
  explanation: '', hints: '', active: true,
  video_url: '', description: '', question: '', options: ['Phishing', 'Legitimate'], correct_answer: 'Phishing',
};

export function AdminSimulationsPage() {
  const { token } = useAuth();
  const [simulations, setSimulations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await simulationsApi.list(token);
      setSimulations(res.items || []);
    } catch { setSimulations([]); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  function openNew() { setEditId(null); setForm({ ...EMPTY_FORM }); setShowForm(true); setError(null); setSuccess(null); }
  function openEdit(sim: any) {
    setEditId(sim.id);
    setForm({
      title: sim.title, sim_type: sim.sim_type, difficulty: sim.difficulty,
      explanation: sim.explanation || '', hints: (sim.hints || []).join('\n'),
      active: sim.active,
      video_url: sim.content?.video_url || '', description: sim.content?.description || '',
      question: sim.content?.question || '', options: sim.content?.options || ['Phishing', 'Legitimate'],
      correct_answer: sim.content?.correct_answer || 'Phishing',
    });
    setShowForm(true); setError(null); setSuccess(null);
  }

  async function handleSave() {
    if (!token || !form.title.trim()) { setError('Title is required.'); return; }
    setSaving(true); setError(null);
    const payload = {
      title: form.title.trim(),
      sim_type: form.sim_type,
      difficulty: form.difficulty,
      explanation: form.explanation.trim(),
      hints: form.hints.split('\n').map(h => h.trim()).filter(Boolean),
      active: form.active,
      content: {
        video_url: form.video_url, description: form.description,
        question: form.question, options: form.options, correct_answer: form.correct_answer
      },
    };
    try {
      if (editId) { await apiPut(`/simulations/admin/simulations/${editId}`, payload, token); setSuccess('Simulation updated!'); }
      else { await apiPost('/simulations/admin/simulations', payload, token); setSuccess('Simulation created!'); }
      setShowForm(false); setEditId(null); await load();
    } catch (e: any) { setError(e.message || 'Save failed'); }
    finally { setSaving(false); }
  }

  async function handleDeactivate(id: string) {
    if (!token || !confirm('Deactivate this simulation?')) return;
    try { await apiDel(`/simulations/admin/simulations/${id}`, token); await load(); setSuccess('Deactivated.'); }
    catch (e: any) { setError(e.message); }
  }

  const inp = (field: string) => ({
    value: (form as any)[field],
    onChange: (e: any) => setForm(f => ({ ...f, [field]: e.target.value })),
    className: 'dashboard__scan-textarea',
    style: { minHeight: 'auto', padding: '8px 0', borderBottom: '1px solid var(--outline-variant)', width: '100%', marginBottom: 12, background: 'transparent' } as any,
  });

  const setOpt = (i: number, val: string) => {
    setForm(f => {
      const newOpts = [...f.options];
      newOpts[i] = val;
      const isCorrect = f.correct_answer === f.options[i];
      return { ...f, options: newOpts, correct_answer: isCorrect ? val : f.correct_answer };
    });
  };

  return (
    <div style={{ padding: 24 }}>
      <SectionHeader title="Manage Simulations" subtitle="Create and manage phishing scenario simulations for users."
        actions={<button className="btn btn-primary" onClick={openNew}>+ New Simulation</button>} />

      {error && <div style={{ padding: 12, marginBottom: 16, background: 'rgba(255,59,59,0.1)', border: '1px solid var(--neon-red)', color: 'var(--neon-red)', fontSize: 13 }}>{error}</div>}
      {success && <div style={{ padding: 12, marginBottom: 16, background: 'rgba(0,255,136,0.08)', border: '1px solid var(--neon-green)', color: 'var(--neon-green)', fontSize: 13 }}>{success}</div>}

      {/* Form */}
      {showForm && (
        <GlassCard style={{ marginBottom: 24 }}>
          <h3 style={{ marginBottom: 20 }}>{editId ? 'Edit Simulation' : 'New Simulation'}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={{ gridColumn: '1/-1' }}>
              <label className="label-caps" style={{ fontSize: 10, color: 'var(--on-surface-variant)' }}>Title *</label>
              <input {...inp('title')} placeholder="e.g. Suspicious PayPal Email" />
            </div>
            <div>
              <label className="label-caps" style={{ fontSize: 10, color: 'var(--on-surface-variant)' }}>Type</label>
              <select {...inp('sim_type')} style={{ ...inp('sim_type').style, background: 'var(--surface-container)' }}>
                {['unified', 'email', 'url', 'sms', 'voice'].map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
              </select>
            </div>
            <div>
              <label className="label-caps" style={{ fontSize: 10, color: 'var(--on-surface-variant)' }}>Difficulty</label>
              <select {...inp('difficulty')} style={{ ...inp('difficulty').style, background: 'var(--surface-container)' }}>
                {['beginner', 'intermediate', 'advanced'].map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <label className="label-caps" style={{ fontSize: 10, color: 'var(--on-surface-variant)' }}>Video URL (YouTube or Direct MP4)</label>
              <input {...inp('video_url')} placeholder="https://www.youtube.com/watch?v=..." />
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <label className="label-caps" style={{ fontSize: 10, color: 'var(--on-surface-variant)' }}>Simulation Description</label>
              <textarea {...inp('description')} rows={3} placeholder="Describe the scenario playing out in the video..." style={{ ...inp('description').style, minHeight: 80 }} />
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <label className="label-caps" style={{ fontSize: 10, color: 'var(--on-surface-variant)' }}>Comprehension Question</label>
              <input {...inp('question')} placeholder="What was the primary red flag in this scenario?" />
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <label className="label-caps" style={{ fontSize: 10, color: 'var(--on-surface-variant)', marginBottom: 8, display: 'block' }}>Options & Correct Answer</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {form.options.map((opt, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <input type="radio" name="sim_correct" checked={form.correct_answer === opt} onChange={() => setForm(f => ({ ...f, correct_answer: opt }))} />
                    <input type="text" value={opt} onChange={e => setOpt(i, e.target.value)} className="dashboard__scan-textarea" style={{ flex: 1, padding: '8px', border: '1px solid var(--outline-variant)', borderRadius: 6, background: 'transparent' }} placeholder={`Option ${i + 1}`} />
                    <button className="btn btn-ghost" style={{ padding: '4px 8px', color: 'var(--neon-red)' }} onClick={() => setForm(f => ({ ...f, options: f.options.filter((_, idx) => idx !== i) }))}><X size={14} /></button>
                  </div>
                ))}
                <button className="btn btn-ghost" style={{ alignSelf: 'flex-start', fontSize: 12 }} onClick={() => setForm(f => ({ ...f, options: [...f.options, `Option ${f.options.length + 1}`] }))}>+ Add Option</button>
              </div>
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <label className="label-caps" style={{ fontSize: 10, color: 'var(--on-surface-variant)' }}>Explanation (shown after submission)</label>
              <textarea {...inp('explanation')} rows={3} placeholder="Explain the red flags in this scenario…" style={{ ...inp('explanation').style, minHeight: 80 }} />
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <label className="label-caps" style={{ fontSize: 10, color: 'var(--on-surface-variant)' }}>Hints (one per line)</label>
              <textarea {...inp('hints')} rows={3} placeholder={"Check the sender domain\nLook for urgency language"} style={{ ...inp('hints').style, minHeight: 70 }} />
            </div>
            <div style={{ gridColumn: '1/-1', display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" id="sim-active" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
              <label htmlFor="sim-active" style={{ fontSize: 13 }}>Active (visible to users)</label>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : '◈ Save'}</button>
            <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </GlassCard>
      )}

      {/* List */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{[...Array(4)].map((_, i) => <Skeleton key={i} height={60} />)}</div>
      ) : simulations.length === 0 ? (
        <GlassCard><NoDataState icon={<Activity size={48} color="var(--on-surface-variant)" />} title="No Simulations" message="Create your first simulation using the button above." /></GlassCard>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {simulations.map(sim => (
            <GlassCard key={sim.id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px' }}>
              <div style={{ color: 'var(--electric-blue)' }}>
                {sim.sim_type === 'email' && <Mail size={24} />}
                {sim.sim_type === 'url' && <Link2 size={24} />}
                {sim.sim_type === 'sms' && <MessageSquare size={24} />}
                {sim.sim_type === 'voice' && <Mic size={24} />}
                {sim.sim_type === 'unified' && <Hexagon size={24} />}
                {!['email', 'url', 'sms', 'voice', 'unified'].includes(sim.sim_type) && <Hexagon size={24} />}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{sim.title}</div>
                <div className="label-caps" style={{ color: 'var(--on-surface-variant)', fontSize: 10 }}>
                  {sim.sim_type} • {sim.difficulty} • {sim.active ? <span style={{ color: 'var(--neon-green)' }}>ACTIVE</span> : <span style={{ color: 'var(--neon-red)' }}>INACTIVE</span>}
                </div>
              </div>
              <button className="btn btn-ghost flex items-center gap-1" style={{ fontSize: 12 }} onClick={() => openEdit(sim)}><Edit2 size={12} /> Edit</button>
              {sim.active && <button className="btn btn-danger flex items-center gap-1" style={{ fontSize: 12 }} onClick={() => handleDeactivate(sim.id)}><PowerOff size={12} /> Deactivate</button>}
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
