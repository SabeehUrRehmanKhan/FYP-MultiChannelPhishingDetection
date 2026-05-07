import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { adminApi, type AdminStats } from '../../lib/api';
import { GlassCard, NoDataState, Skeleton, SectionHeader, StatCard } from '../../components/ui/UIComponents';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Database, Activity, RefreshCw } from 'lucide-react';

const PIE_COLORS = ['var(--neon-red)', 'var(--neon-green)', 'var(--amber)', 'var(--outline)'];

export function AdminStatsPage() {
  const { token } = useAuth();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const data = await adminApi.stats(token);
      setStats(data);
    } catch {
      setError('Backend unavailable. No stats data to display.');
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const pieData = stats ? [
    { name: 'Phishing', value: stats.phishing_count },
    { name: 'Legitimate', value: stats.legitimate_count },
    { name: 'Suspicious', value: stats.suspicious_count },
  ] : [];

  return (
    <div className="flex flex-col gap-8 animate-fade-in">
      <SectionHeader
        title="Platform Statistics"
        subtitle="System-wide analytics, detection rates, and campaign tracking."
        actions={
          <button 
            className="btn btn-ghost flex items-center gap-2 text-xs font-bold uppercase tracking-widest" 
            onClick={load}
          >
            <RefreshCw size={14} /> Refresh Node
          </button>
        }
      />

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
          {[...Array(4)].map((_, i) => <Skeleton key={i} height={120} />)}
        </div>
      ) : error || !stats ? (
        <GlassCard style={{ padding: '48px' }}>
          <NoDataState icon={<Database size={40} />} title="No Stats Available" message={error || 'Connect the backend to see platform statistics.'} />
        </GlassCard>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          {/* Stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
            <StatCard label="Analyses Today" value={stats.analyses_today.toLocaleString()} color="var(--electric-blue)" />
            <StatCard label="Total Analyses" value={stats.total_analyses.toLocaleString()} color="var(--primary)" />
            <StatCard label="Campaigns Detected" value={stats.campaign_count.toLocaleString()} color="var(--neon-red)" sub="Cross-user patterns" />
            <StatCard label="Model Accuracy" value={`${Math.round((stats.accuracy || 0) * 100)}%`} color="var(--neon-green)" />
          </div>

          {/* Charts */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
            <GlassCard style={{ padding: '32px', flex: '2 1 600px' }}>
              <div className="label-caps" style={{ color: 'var(--on-surface-variant)', marginBottom: '32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Analyses Activity Timeline</span>
                <span style={{ fontSize: '10px', opacity: 0.4 }}>UTC REAL-TIME</span>
              </div>
              {stats.analyses_per_day?.length > 0 ? (
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.analyses_per_day} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                      <XAxis 
                        dataKey="date" 
                        tick={{ fill: 'var(--on-surface-variant)', fontSize: 10, fontWeight: 700 }} 
                        tickLine={false}
                        axisLine={false}
                        dy={10}
                      />
                      <YAxis 
                        tick={{ fill: 'var(--on-surface-variant)', fontSize: 10, fontWeight: 700 }} 
                        axisLine={false} 
                        tickLine={false}
                        dx={-5}
                      />
                      <Tooltip
                        cursor={{ fill: 'rgba(var(--primary-rgb, 59, 130, 246), 0.05)' }}
                        contentStyle={{ 
                          background: 'var(--card-bg)', 
                          border: '1px solid var(--card-border)', 
                          backdropFilter: 'blur(10px)',
                          borderRadius: '12px',
                          boxShadow: 'var(--card-shadow)'
                        }}
                        itemStyle={{ color: 'var(--primary)', fontSize: '12px', fontWeight: 'bold' }}
                      />
                      <Bar dataKey="count" fill="var(--electric-blue)" radius={4} barSize={20} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <NoDataState icon={<Activity size={40} />} title="No Activity Data" message="Neural scan logs will appear here once processed." />
              )}
            </GlassCard>

            <GlassCard style={{ padding: '32px', flex: '1 1 300px' }}>
              <div className="label-caps" style={{ color: 'var(--on-surface-variant)', marginBottom: '32px' }}>Verdict Vector Distribution</div>
              {pieData.some(d => d.value > 0) ? (
                <div className="h-[220px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={85}
                        paddingAngle={5} dataKey="value"
                        stroke="none"
                      >
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ 
                          background: 'var(--card-bg)', 
                          border: '1px solid var(--card-border)', 
                          borderRadius: '8px',
                          boxShadow: 'var(--card-shadow)'
                        }} 
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <NoDataState icon={<Activity size={40} />} title="No Neural Data" />
              )}

              {/* Legend */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '32px' }}>
                {[
                  { label: 'Phishing',   value: stats.phishing_count,   color: 'var(--neon-red)'   },
                  { label: 'Legitimate', value: stats.legitimate_count, color: 'var(--neon-green)' },
                  { label: 'Suspicious', value: stats.suspicious_count, color: 'var(--amber)'       },
                ].map(item => (
                  <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: item.color, boxShadow: `0 0 8px ${item.color}` }} />
                      <span className="label-caps" style={{ fontSize: '11px', color: 'var(--on-surface-variant)' }}>{item.label}</span>
                    </div>
                    <span style={{ fontFamily: 'var(--font-headline)', fontSize: '14px', fontWeight: 700, color: item.color }}>{item.value.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>
        </div>
      )}
    </div>
  );
}
