import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AppLayout } from './components/layout/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { HistoryPage } from './pages/HistoryPage';
import { AnalysisDetailPage } from './pages/AnalysisDetailPage';
import { SimulationsPage } from './pages/SimulationsPage';
import { ThreatIntelPage } from './pages/ThreatIntelPage';
import { AdminStatsPage } from './pages/admin/AdminStatsPage';
import { AdminFeedbackPage } from './pages/admin/AdminFeedbackPage';
import { AdminDatasetPage } from './pages/admin/AdminDatasetPage';
import { AdminSimulationsPage } from './pages/admin/AdminSimulationsPage';
import { AdminActivitiesPage } from './pages/admin/AdminActivitiesPage';
import { SettingsPage } from './pages/SettingsPage';

// ─── Loading screen ───────────────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', flexDirection: 'column', gap: 16,
    }}>
      <div style={{
        fontSize: 56, color: 'var(--electric-blue)',
        filter: 'drop-shadow(0 0 20px var(--electric-blue))',
        animation: 'pulse-glow 2s ease-in-out infinite',
      }}>⬡</div>
      <div className="label-caps" style={{ color: 'var(--on-surface-variant)', letterSpacing: '0.25em' }}>
        INITIALIZING SYSTEMS
      </div>
      <div className="scan-indicator-track" style={{ width: 220 }}>
        <div className="scan-indicator-bar" />
      </div>
    </div>
  );
}

// ─── Admin guard ──────────────────────────────────────────────────────────────
function AdminGuard({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  if (!profile || !['admin', 'moderator'].includes(profile.role)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}

// ─── Protected layout wrapping sidebar + child routes ─────────────────────────
function ProtectedLayout() {
  const { session, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!session) return <Navigate to="/login" replace />;
  return (
    <AppLayout>
      <Routes>
        <Route path="dashboard"         element={<DashboardPage />} />
        <Route path="history"           element={<HistoryPage />} />
        <Route path="history/:id"       element={<AnalysisDetailPage />} />
        <Route path="simulations"       element={<SimulationsPage />} />
        <Route path="threat-intel"      element={<ThreatIntelPage />} />
        <Route path="settings"          element={<SettingsPage />} />
        <Route path="admin/stats"       element={<AdminGuard><AdminStatsPage /></AdminGuard>} />
        <Route path="admin/feedback"    element={<AdminGuard><AdminFeedbackPage /></AdminGuard>} />
        <Route path="admin/dataset"     element={<AdminGuard><AdminDatasetPage /></AdminGuard>} />
        <Route path="admin/simulations" element={<AdminGuard><AdminSimulationsPage /></AdminGuard>} />
        <Route path="admin/activities"  element={<AdminGuard><AdminActivitiesPage /></AdminGuard>} />
        <Route path="*"                 element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AppLayout>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
function AppRoutes() {
  const { session, loading } = useAuth();
  if (loading) return <LoadingScreen />;

  return (
    <Routes>
      <Route
        path="/login"
        element={session ? <Navigate to="/dashboard" replace /> : <LoginPage />}
      />
      <Route path="/*" element={<ProtectedLayout />} />
      <Route
        path="/"
        element={<Navigate to={session ? '/dashboard' : '/login'} replace />}
      />
    </Routes>
  );
}

export default function App() {
  React.useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.className = savedTheme;
  }, []);

  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
