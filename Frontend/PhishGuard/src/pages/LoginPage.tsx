import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { StatusDot } from '../components/ui/UIComponents';
import './LoginPage.css';

export function LoginPage() {
  const { signInWithGoogle, signInWithEmail, signUpWithEmail, emailConfirmPending, clearEmailConfirmPending } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');

  async function handleGoogleLogin() {
    setLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (e: any) {
      setError(e.message || 'Google Auth failed');
      setLoading(false);
    }
  }

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (mode === 'register') {
      if (!displayName.trim()) {
        setError('Please enter your full name.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match. Please try again.');
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters.');
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        await signInWithEmail(email, password);
        // Navigation handled by AuthProvider state change
      } else {
        await signUpWithEmail(email, password, displayName);
        // emailConfirmPending is set by AuthContext — show the banner below
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  }

  function switchMode(next: 'login' | 'register') {
    setMode(next);
    setError(null);
    setSuccessMsg(null);
    clearEmailConfirmPending();
    setPassword('');
    setConfirmPassword('');
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="login-page">
      <div className="login-page__bg-grid" aria-hidden />

      {/* Left panel — branding */}
      <div className="login-page__brand">
        <div className="login-page__logo-symbol">⬡</div>
        <h1 className="login-page__brand-name">PHISHGUARD</h1>
        <p className="login-page__brand-tagline">Vigilant Protection</p>

        <div className="login-page__status-grid">
          <div className="login-page__status-item">
            <div className="label-caps login-page__status-label">Global Threat Lvl</div>
            <div className="login-page__status-value" style={{ color: 'var(--neon-green)' }}>
              <StatusDot status="online" /> LOW (0.02%)
            </div>
          </div>
          <div className="login-page__status-item">
            <div className="label-caps login-page__status-label">ML Cluster Status</div>
            <div className="login-page__status-value" style={{ color: 'var(--neon-green)' }}>
              <StatusDot status="online" /> OPERATIONAL
            </div>
          </div>
          <div className="login-page__status-item">
            <div className="label-caps login-page__status-label">Ping</div>
            <div className="login-page__status-value code-data">12ms | NODES: 4,092</div>
          </div>
        </div>

        <div className="login-page__feed">
          <div className="label-caps login-page__feed-label">Neural Network Feed</div>
          <div className="login-page__feed-item">
            <span style={{ color: 'var(--neon-green)' }}>✓</span> URL scan complete — legitimate
          </div>
          <div className="login-page__feed-item">
            <span style={{ color: 'var(--neon-red)' }}>⚠</span> Email flagged — phishing detected
          </div>
          <div className="login-page__feed-item">
            <span style={{ color: 'var(--amber)' }}>?</span> Web page under analysis…
          </div>
          <div className="label-caps" style={{ marginTop: 12, color: 'var(--outline)', fontSize: 10 }}>
            PhishGuard v4.2.0 — Live Analysis
          </div>
        </div>
      </div>

      {/* Right panel — auth form */}
      <div className="login-page__form-panel">
        <div className="login-page__form-card glass-card">
          <div className="label-caps login-page__form-eyebrow" style={{ color: 'var(--electric-blue)' }}>
            SECURE ACCESS PROTOCOL
          </div>
          <h2 className="login-page__form-title">
            {mode === 'login' ? 'Operator Sign In' : 'Register Credentials'}
          </h2>
          <p className="login-page__form-subtitle">
            {mode === 'login'
              ? 'Authenticate to access the PhishGuard command center.'
              : 'Create your operator account to join the threat-detection network.'}
          </p>

          {/* ── Email confirmation banner ── */}
          {emailConfirmPending && (
            <div style={{
              marginBottom: 20, padding: 14,
              background: 'rgba(0, 194, 255, 0.08)',
              border: '1px solid var(--electric-blue)',
              color: 'var(--electric-blue)',
              fontSize: 13, lineHeight: 1.6,
              display: 'flex', gap: 10, alignItems: 'flex-start',
            }}>
              <span style={{ fontSize: 20 }}>📧</span>
              <div>
                <strong>Verification email sent!</strong>
                <br />
                Check your inbox at <strong>{email}</strong> and click the confirmation
                link before signing in. Check spam if you don't see it within a minute.
              </div>
            </div>
          )}

          {/* ── Error banner ── */}
          {error && (
            <div style={{
              marginBottom: 16, padding: 12,
              background: 'rgba(255,59,59,0.1)',
              border: '1px solid var(--neon-red)',
              color: 'var(--neon-red)', fontSize: 13,
            }}>
              {error}
            </div>
          )}

          {/* ── Success banner ── */}
          {successMsg && (
            <div style={{
              marginBottom: 16, padding: 12,
              background: 'rgba(0,255,136,0.08)',
              border: '1px solid var(--neon-green)',
              color: 'var(--neon-green)', fontSize: 13,
            }}>
              {successMsg}
            </div>
          )}

          <form onSubmit={handleEmailAuth} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Full name — register mode only */}
            {mode === 'register' && (
              <div>
                <label className="label-caps" style={{ color: 'var(--on-surface-variant)', fontSize: 10, display: 'block', marginBottom: 4 }}>
                  Full Name *
                </label>
                <input
                  type="text"
                  placeholder="Your full name"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  required
                  className="dashboard__scan-textarea"
                  style={{ minHeight: 'auto', padding: '10px 0', borderBottom: '1px solid var(--outline-variant)', color: '#ffffff', background: 'transparent' }}
                  autoComplete="name"
                />
              </div>
            )}

            {/* Email */}
            <div>
              <label className="label-caps" style={{ color: 'var(--on-surface-variant)', fontSize: 10, display: 'block', marginBottom: 4 }}>
                Email Address *
              </label>
              <input
                type="email"
                placeholder="operator@domain.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="dashboard__scan-textarea"
                style={{ minHeight: 'auto', padding: '10px 0', borderBottom: '1px solid var(--outline-variant)', color: '#ffffff', background: 'transparent' }}
                autoComplete="email"
              />
            </div>

            {/* Password */}
            <div>
              <label className="label-caps" style={{ color: 'var(--on-surface-variant)', fontSize: 10, display: 'block', marginBottom: 4 }}>
                {mode === 'login' ? 'Access Code *' : 'Password (min. 8 chars) *'}
              </label>
              <input
                type="password"
                placeholder={mode === 'login' ? 'Enter your password' : 'Create a strong password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="dashboard__scan-textarea"
                style={{ minHeight: 'auto', padding: '10px 0', borderBottom: '1px solid var(--outline-variant)', color: '#ffffff', background: 'transparent' }}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </div>

            {/* Confirm password — register mode only */}
            {mode === 'register' && (
              <div>
                <label className="label-caps" style={{ color: 'var(--on-surface-variant)', fontSize: 10, display: 'block', marginBottom: 4 }}>
                  Confirm Password *
                </label>
                <input
                  type="password"
                  placeholder="Repeat your password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                  className="dashboard__scan-textarea"
                  style={{ minHeight: 'auto', padding: '10px 0', borderBottom: '1px solid var(--outline-variant)', color: '#ffffff', background: 'transparent' }}
                  autoComplete="new-password"
                />
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || emailConfirmPending}
              style={{ padding: '12px', justifyContent: 'center', marginTop: 8 }}
            >
              {loading
                ? 'Processing…'
                : mode === 'login'
                  ? '◈ Initialize Session'
                  : '◈ Create Account'}
            </button>
          </form>

          {/* After registration show a "Go to Login" link */}
          {emailConfirmPending && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ width: '100%', justifyContent: 'center', marginTop: 12, fontSize: 13 }}
              onClick={() => switchMode('login')}
            >
              ← Back to Sign In
            </button>
          )}

          {!emailConfirmPending && (
            <>
              <div className="login-page__divider" style={{ marginTop: 24 }}><span>Or continue with</span></div>

              <button
                className="login-page__google-btn"
                onClick={handleGoogleLogin}
                disabled={loading}
                type="button"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Continue with Google
              </button>

              <div className="login-page__links" style={{ justifyContent: 'center', gap: 24, marginTop: 24 }}>
                <button
                  type="button"
                  className="login-page__link"
                  style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                  onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
                >
                  {mode === 'login' ? 'Create new account →' : '← Already have an account?'}
                </button>
              </div>
            </>
          )}

          <p className="login-page__disclaimer">
            Access is restricted to authorized personnel. All activity is monitored and logged.
          </p>
        </div>
      </div>
    </div>
  );
}
