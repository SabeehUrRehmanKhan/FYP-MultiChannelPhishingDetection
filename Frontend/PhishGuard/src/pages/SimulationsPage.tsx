import { useState, useEffect, useCallback, type MouseEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { simulationsApi, type Simulation, type Activity } from '../lib/api';
import { GlassCard, NoDataState, Skeleton, SectionHeader } from '../components/ui/UIComponents';
import { Mail, Link as LinkIcon, MessageSquare, Mic, CheckSquare, Target, Edit3, ShieldCheck, PlayCircle, Eye, CheckCircle, XCircle, Flag, Info, Loader2, X, ArrowLeft, ArrowRight, Trophy, Zap, BookOpen, Hexagon } from 'lucide-react';
import './SimulationsPage.css';

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: 'var(--neon-green)',
  intermediate: 'var(--amber)',
  advanced: 'var(--neon-red)',
};

const getTypeIcon = (type: string, size = 24) => {
  switch (type) {
    case 'email': return <Mail size={size} />;
    case 'url': return <LinkIcon size={size} />;
    case 'sms': return <MessageSquare size={size} />;
    case 'voice': return <Mic size={size} />;
    case 'unified': return <Hexagon size={size} />;
    case 'quiz': return <CheckSquare size={size} />;
    case 'spot_the_phish': return <Target size={size} />;
    case 'fill_blank': return <Edit3 size={size} />;
    default: return <Hexagon size={size} />;
  }
};

interface SimulationContent {
  video_url?: string;
  description?: string;
  question?: string;
  options?: string[];
  correct_answer?: string;
  explanation?: string;
}

// ─── MCQ Quiz Modal ──────────────────────────────────────────────────────────
function QuizModal({ activity, onClose }: { activity: Activity; onClose: () => void }) {
  const { token } = useAuth();
  const questions = (activity.questions as any[]) || [];
  const [answers, setAnswers] = useState<(string | null)[]>(Array(questions.length).fill(null));
  const [result, setResult] = useState<{ score: number; total: number; percentage: number; feedback: string[]; correct_answers: any[] } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [currentQ, setCurrentQ] = useState(0);

  async function handleSubmit() {
    if (!token) return;
    setSubmitting(true);
    try {
      const res = await simulationsApi.submitActivity(token, activity.id, answers) as any;
      setResult(res);
    } catch {
      setResult({ score: 0, total: questions.length, percentage: 0, feedback: ['Backend unavailable. Try again later.'], correct_answers: [] });
    } finally {
      setSubmitting(false);
    }
  }

  const allAnswered = answers.every(a => a !== null);
  const q = questions[currentQ];

  return (
    <div className="simulations-page__modal-overlay" onClick={onClose}>
      <GlassCard className="simulations-page__modal animate-slide-in" onClick={(e: MouseEvent) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <div className="label-caps" style={{ color: 'var(--electric-blue)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              {getTypeIcon(activity.activity_type, 16)} {activity.activity_type.replace('_', ' ').toUpperCase()}
            </div>
            <h3 style={{ fontSize: 20 }}>{activity.title}</h3>
            <span className="chip" style={{ color: DIFFICULTY_COLORS[activity.difficulty] || 'var(--outline)', background: 'rgba(255,255,255,0.05)', marginTop: 8 }}>
              {activity.difficulty}
            </span>
          </div>
          <button className="btn btn-ghost flex items-center gap-1" onClick={onClose}><X size={16} /> Close</button>
        </div>

        {!result ? (
          <>
            {/* Question navigator */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
              {questions.map((_, i) => (
                <button key={i} onClick={() => setCurrentQ(i)}
                  className="btn btn-ghost"
                  style={{
                    padding: '4px 10px', fontSize: 12,
                    background: i === currentQ ? 'var(--electric-blue)' : answers[i] ? 'rgba(0,255,136,0.1)' : undefined,
                    color: i === currentQ ? '#000' : answers[i] ? 'var(--neon-green)' : undefined,
                    border: i === currentQ ? 'none' : undefined
                  }}>
                  Q{i + 1}
                </button>
              ))}
            </div>

            {q && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, lineHeight: 1.5 }}>
                  <span className="label-caps" style={{ color: 'var(--on-surface-variant)', marginRight: 8 }}>Q{currentQ + 1}.</span>
                  {q.question || q.text}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(q.options as string[] || []).map((opt: string) => (
                    <button key={opt}
                      onClick={() => {
                        if ((activity as any).completed) return;
                        const updated = [...answers];
                        updated[currentQ] = opt;
                        setAnswers(updated);
                        if (currentQ < questions.length - 1) setTimeout(() => setCurrentQ(currentQ + 1), 300);
                      }}
                      style={{
                        padding: '12px 16px', textAlign: 'left', cursor: (activity as any).completed ? 'default' : 'pointer',
                        background: answers[currentQ] === opt ? 'rgba(0,194,255,0.15)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${answers[currentQ] === opt ? 'var(--electric-blue)' : 'rgba(255,255,255,0.08)'}`,
                        color: 'var(--on-surface)', borderRadius: 6, fontSize: 14,
                        transition: 'all 0.2s',
                      }}>
                      {answers[currentQ] === opt && <Target size={16} style={{ color: 'var(--electric-blue)', marginRight: 8 }} />}
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              {currentQ > 0 && <button className="btn btn-ghost flex items-center gap-1" onClick={() => setCurrentQ(currentQ - 1)}><ArrowLeft size={14} /> Prev</button>}
              {currentQ < questions.length - 1
                ? <button className="btn btn-ghost flex items-center gap-1" onClick={() => setCurrentQ(currentQ + 1)} style={{ marginLeft: 'auto' }}>Next <ArrowRight size={14} /></button>
                : !(activity as any).completed && <button className="btn btn-primary flex items-center gap-2" disabled={!allAnswered || submitting} onClick={handleSubmit} style={{ marginLeft: 'auto', justifyContent: 'center' }}>
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : <Target size={16} />}
                  {submitting ? 'Submitting…' : 'Submit Quiz'}
                </button>}
            </div>

            {/* Answer Display for Review or Completed */}
            {((activity as any).completed || result) && (
              <div style={{ marginTop: 20, padding: 16, background: 'rgba(0,255,136,0.05)', border: '1px solid rgba(0,255,136,0.2)', borderRadius: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--neon-green)', fontWeight: 600, marginBottom: 12 }}>
                  <Info size={16} /> Question Insight
                </div>
                <div style={{ marginBottom: 12 }}>
                  <div className="label-caps" style={{ color: 'var(--on-surface-variant)', fontSize: 10, marginBottom: 4 }}>Correct Answer:</div>
                  <div style={{ color: 'var(--neon-green)', fontWeight: 600, fontSize: 15 }}>{q.correct_answer}</div>
                </div>
                {q.explanation && (
                  <div>
                    <div className="label-caps" style={{ color: 'var(--on-surface-variant)', fontSize: 10, marginBottom: 4 }}>Explanation:</div>
                    <div style={{ color: 'var(--on-surface)', fontSize: 13, lineHeight: 1.5 }}>{q.explanation}</div>
                  </div>
                )}
              </div>
            )}

            <div style={{ fontSize: 12, color: 'var(--on-surface-variant)', marginTop: 12, textAlign: 'center' }}>
              {(activity as any).completed ? 'Reviewing completed quiz' : `${answers.filter(a => a !== null).length} / ${questions.length} answered`}
            </div>
          </>
        ) : (
          <div className="animate-fade-in">
            <div className="label-caps" style={{ color: 'var(--electric-blue)', marginBottom: 8 }}>Quiz Result</div>
            <div style={{
              fontSize: 48, fontWeight: 700, fontFamily: 'var(--font-headline)',
              color: result.percentage >= 70 ? 'var(--neon-green)' : result.percentage >= 40 ? 'var(--amber)' : 'var(--neon-red)',
              marginBottom: 4
            }}>
              {result.percentage}%
            </div>
            <div style={{ color: 'var(--on-surface-variant)', fontSize: 14, marginBottom: 20 }}>
              {result.score} / {result.total} correct
              {result.percentage >= 70 ? <span className="flex items-center gap-1 inline-flex ml-2"> — Great job! <Trophy size={14} /></span> : result.percentage >= 40 ? <span className="flex items-center gap-1 inline-flex ml-2"> — Keep practising! <Zap size={14} /></span> : <span className="flex items-center gap-1 inline-flex ml-2"> — Review needed <BookOpen size={14} /></span>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {result.feedback.map((f, i) => (
                <div key={i} style={{
                  padding: '10px 14px', fontSize: 13, lineHeight: 1.5,
                  background: f.includes('✓') ? 'rgba(0,255,136,0.08)' : 'rgba(255,59,59,0.08)',
                  border: `1px solid ${f.includes('✓') ? 'rgba(0,255,136,0.2)' : 'rgba(255,59,59,0.2)'}`,
                  borderRadius: 6
                }}>
                  {f}
                </div>
              ))}
            </div>
            <button className="btn btn-ghost" onClick={onClose} style={{ marginTop: 20, width: '100%', justifyContent: 'center' }}>
              Close
            </button>
          </div>
        )}
      </GlassCard>
    </div>
  );
}

// ─── Simulation Modal ────────────────────────────────────────────────────────
function SimModal({ sim, onClose }: { sim: Simulation; onClose: () => void }) {
  const { token } = useAuth();
  const [userAnswer, setUserAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ score: number; explanation: string; correct: boolean; red_flags?: string[] } | null>(null);
  const [startTime] = useState(Date.now());

  async function handleSubmit() {
    if (!token || !userAnswer) return;
    setSubmitting(true);
    const timeTaken = Math.round((Date.now() - startTime) / 1000);
    try {
      const res = await simulationsApi.complete(token, sim.id, userAnswer, timeTaken) as any;
      setResult({ score: res.score ?? 0, explanation: res.explanation ?? 'Good attempt!', correct: res.correct ?? false, red_flags: res.red_flags ?? [] });
    } catch {
      setResult({ score: 0, correct: false, explanation: (sim.content?.explanation as string) || 'Backend unavailable — always check sender domains and URL patterns.' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="simulations-page__modal-overlay" onClick={onClose}>
      <GlassCard className="simulations-page__modal animate-slide-in" onClick={(e: MouseEvent) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <div className="label-caps" style={{ color: 'var(--electric-blue)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              {getTypeIcon(sim.sim_type, 16)} {sim.sim_type.toUpperCase()} Simulation
            </div>
            <h3 style={{ fontSize: 20 }}>{sim.title}</h3>
            <span className="chip" style={{ color: DIFFICULTY_COLORS[sim.difficulty] || 'var(--outline)', background: 'rgba(255,255,255,0.05)', marginTop: 8 }}>
              {sim.difficulty}
            </span>
          </div>
          <button className="btn btn-ghost flex items-center gap-1" onClick={onClose}><X size={16} /> Close</button>
        </div>

        <div className="simulations-page__sim-content">
          {(sim.content as SimulationContent)?.video_url && (sim.content as SimulationContent).video_url?.trim() !== "" && (
            <div style={{ marginBottom: 16, borderRadius: 8, overflow: 'hidden', background: '#000', width: '100%' }}>
              {((sim.content as SimulationContent).video_url!).includes('youtube.com') || ((sim.content as SimulationContent).video_url!).includes('youtu.be') ? (
                <iframe
                  width="100%"
                  height="315"
                  src={((sim.content as SimulationContent).video_url!).replace('watch?v=', 'embed/').replace('youtu.be/', 'youtube.com/embed/')}
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <video src={(sim.content as SimulationContent).video_url} controls style={{ width: '100%', display: 'block', maxHeight: 400 }} />
              )}
            </div>
          )}
          {(sim.content as SimulationContent)?.description && (
            <div style={{ marginBottom: 16, color: 'var(--on-surface-variant)', fontSize: 14, lineHeight: 1.6 }}>
              {(sim.content as SimulationContent).description}
            </div>
          )}
        </div>

        {(sim.hints || []).length > 0 && !result && !(sim as any).completed && (
          <details style={{ marginBottom: 16 }}>
            <summary className="label-caps" style={{ cursor: 'pointer', color: 'var(--amber)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Info size={14} /> View Hints
            </summary>
            <ul style={{ marginTop: 8, paddingLeft: 20 }}>
              {sim.hints.map((h, i) => <li key={i} style={{ color: 'var(--on-surface-variant)', fontSize: 13, marginBottom: 4 }}>{h}</li>)}
            </ul>
          </details>
        )}

        {!result && !(sim as any).completed ? (
          <div>
            <div className="label-caps" style={{ color: 'var(--on-surface-variant)', marginBottom: 8 }}>{(sim.content as SimulationContent)?.question || 'Is this PHISHING or LEGITIMATE?'}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {((sim.content as SimulationContent)?.options || ['phishing', 'legitimate']).map((opt: string) => (
                <button key={opt}
                  className="btn"
                  style={{
                    justifyContent: 'flex-start', padding: '12px 16px',
                    background: userAnswer === opt ? 'rgba(0,194,255,0.15)' : 'var(--surface-container)',
                    border: `1px solid ${userAnswer === opt ? 'var(--electric-blue)' : 'var(--outline-variant)'}`
                  }}
                  onClick={() => setUserAnswer(opt)}>
                  {userAnswer === opt && <Target size={16} style={{ color: 'var(--electric-blue)', marginRight: 8 }} />}
                  {opt}
                </button>
              ))}
            </div>
            <button className="btn btn-primary flex items-center gap-2" disabled={!userAnswer || submitting} onClick={handleSubmit} style={{ width: '100%', justifyContent: 'center' }}>
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Target size={16} />}
              {submitting ? 'Submitting…' : 'Submit Answer'}
            </button>
          </div>
        ) : (sim as any).completed && !result ? (
          <div style={{ marginTop: 20, padding: 16, background: 'rgba(0,255,136,0.05)', border: '1px solid var(--neon-green)', borderRadius: 8 }}>
            <div style={{ color: 'var(--neon-green)', fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircle size={18} /> You have already completed this simulation
            </div>
            <div style={{ fontSize: 13, color: 'var(--on-surface-variant)', marginBottom: 12 }}>
              Final Achievement: <span style={{ color: 'var(--electric-blue)', fontWeight: 600 }}>{(sim as any).last_score ?? 100} pts</span>
            </div>
            {(sim.content as SimulationContent)?.question && <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{(sim.content as SimulationContent).question}</div>}
            <div className="label-caps" style={{ color: 'var(--on-surface)', marginBottom: 4 }}>Correct Answer:</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--neon-green)' }}>{(sim.content as SimulationContent)?.correct_answer || 'Phishing'}</div>
            <button className="btn btn-ghost" onClick={onClose} style={{ marginTop: 16, width: '100%', justifyContent: 'center' }}>Close</button>
          </div>
        ) : result ? (
          <div className="simulations-page__result animate-fade-in">
            <div className="label-caps" style={{ color: 'var(--electric-blue)', marginBottom: 8 }}>Result</div>
            <div style={{ fontSize: 36, fontWeight: 700, fontFamily: 'var(--font-headline)', color: result.correct ? 'var(--neon-green)' : 'var(--neon-red)', marginBottom: 8 }}>
              {result.correct ? <span className="flex items-center gap-2"><CheckCircle size={32} /> CORRECT</span> : <span className="flex items-center gap-2"><XCircle size={32} /> INCORRECT</span>} — {result.score} pts
            </div>
            <p style={{ color: 'var(--on-surface-variant)', fontSize: 14, lineHeight: 1.6 }}>{result.explanation}</p>
            {(result.red_flags || []).length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div className="label-caps" style={{ color: 'var(--neon-red)', marginBottom: 6 }}>Red Flags Identified</div>
                {result.red_flags!.map((f, i) => (
                  <div key={i} style={{ fontSize: 13, color: 'var(--on-surface-variant)', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Flag size={14} color="var(--neon-red)" /> {f}
                  </div>
                ))}
              </div>
            )}
            <button className="btn btn-ghost" onClick={onClose} style={{ marginTop: 16 }}>Close</button>
          </div>
        ) : null}
      </GlassCard>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export function SimulationsPage() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState<'simulations' | 'activities'>('simulations');
  const [simulations, setSimulations] = useState<Simulation[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSim, setSelectedSim] = useState<Simulation | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [diffFilter, setDiffFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  const loadAll = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const [simRes, actRes] = await Promise.all([
        simulationsApi.list(token, diffFilter !== 'all' ? diffFilter : undefined, typeFilter !== 'all' ? typeFilter : undefined),
        simulationsApi.activities(token, diffFilter !== 'all' ? diffFilter : undefined),
      ]);
      setSimulations(simRes.items || []);
      setActivities(actRes.items || []);
    } catch {
      setError('Backend unavailable. No data to display.');
    } finally {
      setLoading(false);
    }
  }, [token, diffFilter, typeFilter]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const displaySims = simulations;
  const displayActs = activities;

  return (
    <div className="simulations-page">
      <SectionHeader
        title="Security Awareness & Training"
        subtitle="Build phishing recognition skills through real-world simulations and interactive quizzes."
      />

      {/* Awareness tip banner */}
      <div style={{ padding: '14px 20px', marginBottom: 24, background: 'rgba(0,194,255,0.06)', border: '1px solid rgba(0,194,255,0.2)', borderRadius: 8, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <ShieldCheck size={28} color="var(--electric-blue)" />
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--electric-blue)', marginBottom: 4 }}>Phishing Awareness Tip</div>
          <div style={{ fontSize: 13, color: 'var(--on-surface-variant)', lineHeight: 1.6 }}>
            Always verify the sender's email domain, hover over links before clicking, and never enter credentials on pages reached via email links.
            When in doubt — pick up the phone and call the sender directly.
          </div>
        </div>
      </div>

      {/* Tab selector */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid var(--outline-variant)', paddingBottom: 0 }}>
        {(['simulations', 'activities'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            style={{
              padding: '10px 20px', fontSize: 13, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: activeTab === tab ? '2px solid var(--electric-blue)' : '2px solid transparent',
              color: activeTab === tab ? 'var(--electric-blue)' : 'var(--on-surface-variant)',
              transition: 'all 0.2s',
            }}>
            {tab === 'simulations' ? <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><PlayCircle size={16} /> Simulations</span> : <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><CheckSquare size={16} /> MCQ Activities</span>}
            {tab === 'simulations' && simulations.length > 0 && (
              <span style={{ marginLeft: 8, background: 'var(--electric-blue)', color: '#000', fontSize: 10, padding: '1px 6px', borderRadius: 10, fontWeight: 700 }}>
                {simulations.length}
              </span>
            )}
            {tab === 'activities' && activities.length > 0 && (
              <span style={{ marginLeft: 8, background: 'var(--neon-green)', color: '#000', fontSize: 10, padding: '1px 6px', borderRadius: 10, fontWeight: 700 }}>
                {activities.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
        {['all', 'beginner', 'intermediate', 'advanced'].map(d => (
          <button key={d} className={`btn ${diffFilter === d ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: 12, padding: '6px 14px' }} onClick={() => setDiffFilter(d)}>
            {d.toUpperCase()}
          </button>
        ))}
        {activeTab === 'simulations' && (
          <>
            <div style={{ width: 1, background: 'var(--outline-variant)', margin: '0 4px' }} />
            {['all', 'email', 'url', 'sms', 'voice'].map(t => (
              <button key={t} className={`btn ${typeFilter === t ? 'btn-primary' : 'btn-ghost'}`}
                style={{ fontSize: 12, padding: '6px 14px' }} onClick={() => setTypeFilter(t)}>
                {t.toUpperCase()}
              </button>
            ))}
          </>
        )}
      </div>

      {/* Modals */}
      {selectedSim && <SimModal sim={selectedSim} onClose={() => setSelectedSim(null)} />}
      {selectedActivity && <QuizModal activity={selectedActivity} onClose={() => setSelectedActivity(null)} />}

      {/* Content */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px,1fr))', gap: 16 }}>
          {[...Array(6)].map((_, i) => <Skeleton key={i} height={160} />)}
        </div>
      ) : error ? (
        <GlassCard><NoDataState icon="◉" title="Backend Unavailable" message={error} /></GlassCard>
      ) : activeTab === 'simulations' ? (
        displaySims.length === 0 ? (
          <GlassCard>
            <NoDataState icon={<PlayCircle size={40} />} title="No Simulations Available"
              message="No active simulations found. An admin can create simulations via the Admin panel." />
          </GlassCard>
        ) : (
          <>
            {/* Incomplete Simulations */}
            {displaySims.filter(s => !(s as any).completed).length > 0 && (
              <div style={{ marginBottom: 32 }}>
                <h3 style={{ marginBottom: 16, fontSize: 18, color: 'var(--on-surface)' }}>Incomplete Simulations</h3>
                <div className="simulations-page__grid">
                  {displaySims.filter(s => !(s as any).completed).map(sim => (
                    <GlassCard key={sim.id} className="simulations-page__card" onClick={() => setSelectedSim(sim)}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                        <span style={{ color: 'var(--electric-blue)' }}>{getTypeIcon(sim.sim_type, 24)}</span>
                        <span className="chip" style={{ color: DIFFICULTY_COLORS[sim.difficulty] || 'var(--outline)', background: 'rgba(255,255,255,0.05)' }}>
                          {sim.difficulty}
                        </span>
                      </div>
                      <h4 style={{ marginBottom: 8, fontSize: 15 }}>{sim.title}</h4>
                      <div className="label-caps" style={{ color: 'var(--on-surface-variant)', fontSize: 10 }}>
                        {sim.sim_type.toUpperCase()} • {(sim.hints || []).length} hints
                      </div>
                      <button className="btn btn-primary" style={{ marginTop: 16, width: '100%', justifyContent: 'center', fontSize: 13 }}>
                        <PlayCircle size={16} style={{ marginRight: 6 }} /> Start Simulation
                      </button>
                    </GlassCard>
                  ))}
                </div>
              </div>
            )}

            {/* Completed Simulations */}
            {displaySims.filter(s => (s as any).completed).length > 0 && (
              <div>
                <h3 style={{ marginBottom: 16, fontSize: 18, color: 'var(--on-surface-variant)' }}>Completed</h3>
                <div className="simulations-page__grid" style={{ opacity: 0.8 }}>
                  {displaySims.filter(s => (s as any).completed).map(sim => (
                    <GlassCard key={sim.id} className="simulations-page__card" onClick={() => setSelectedSim(sim)}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                        <span style={{ color: 'var(--on-surface-variant)' }}>{getTypeIcon(sim.sim_type, 24)}</span>
                        <span className="chip flex items-center gap-1" style={{ color: 'var(--neon-green)', background: 'rgba(0,255,136,0.05)', border: '1px solid var(--neon-green)' }}>
                          <CheckCircle size={12} /> Completed ({(sim as any).last_score ?? 0} pts)
                        </span>
                      </div>
                      <h4 style={{ marginBottom: 8, fontSize: 15, color: 'var(--on-surface-variant)' }}>{sim.title}</h4>
                      <button className="btn btn-ghost" style={{ marginTop: 16, width: '100%', justifyContent: 'center', fontSize: 13 }}>
                        <Eye size={16} style={{ marginRight: 6 }} /> Review Answers
                      </button>
                    </GlassCard>
                  ))}
                </div>
              </div>
            )}
          </>
        )
      ) : (
        displayActs.length === 0 ? (
          <GlassCard>
            <NoDataState icon={<CheckSquare size={40} />} title="No Activities Available"
              message="No active MCQ activities found. An admin can create quiz activities via the Admin panel." />
          </GlassCard>
        ) : (
          <>
            {/* Incomplete Activities */}
            {displayActs.filter(a => !(a as any).completed).length > 0 && (
              <div style={{ marginBottom: 32 }}>
                <h3 style={{ marginBottom: 16, fontSize: 18, color: 'var(--on-surface)' }}>Incomplete Activities</h3>
                <div className="simulations-page__grid">
                  {displayActs.filter(a => !(a as any).completed).map(act => (
                    <GlassCard key={act.id} className="simulations-page__card" onClick={() => setSelectedActivity(act)}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                        <span style={{ color: 'var(--electric-blue)' }}>{getTypeIcon(act.activity_type, 24)}</span>
                        <span className="chip" style={{ color: DIFFICULTY_COLORS[act.difficulty] || 'var(--outline)', background: 'rgba(255,255,255,0.05)' }}>
                          {act.difficulty}
                        </span>
                      </div>
                      <h4 style={{ marginBottom: 8, fontSize: 15 }}>{act.title}</h4>
                      <div className="label-caps" style={{ color: 'var(--on-surface-variant)', fontSize: 10 }}>
                        {act.activity_type.replace('_', ' ').toUpperCase()} • {(act.questions || []).length} questions
                      </div>
                      <button className="btn btn-primary" style={{ marginTop: 16, width: '100%', justifyContent: 'center', fontSize: 13 }}>
                        <CheckSquare size={16} style={{ marginRight: 6 }} /> Start Quiz
                      </button>
                    </GlassCard>
                  ))}
                </div>
              </div>
            )}

            {/* Completed Activities */}
            {displayActs.filter(a => (a as any).completed).length > 0 && (
              <div>
                <h3 style={{ marginBottom: 16, fontSize: 18, color: 'var(--on-surface-variant)' }}>Completed</h3>
                <div className="simulations-page__grid" style={{ opacity: 0.8 }}>
                  {displayActs.filter(a => (a as any).completed).map(act => (
                    <GlassCard key={act.id} className="simulations-page__card" onClick={() => setSelectedActivity(act)}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                        <span style={{ color: 'var(--on-surface-variant)' }}>{getTypeIcon(act.activity_type, 24)}</span>
                        <span className="chip flex items-center gap-1" style={{ color: 'var(--neon-green)', background: 'rgba(0,255,136,0.05)', border: '1px solid var(--neon-green)' }}>
                          <CheckCircle size={12} /> Completed ({(((act as any).last_score ?? 0) / (act.questions?.length || 1) * 100).toFixed(0)}%)
                        </span>
                      </div>
                      <h4 style={{ marginBottom: 8, fontSize: 15, color: 'var(--on-surface-variant)' }}>{act.title}</h4>
                      <button className="btn btn-ghost" style={{ marginTop: 16, width: '100%', justifyContent: 'center', fontSize: 13 }}>
                        <Eye size={16} style={{ marginRight: 6 }} /> Review Quiz
                      </button>
                    </GlassCard>
                  ))}
                </div>
              </div>
            )}
          </>
        )
      )}
    </div>
  );
}
