import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { StatusDot } from '../ui/UIComponents';
import { LogOut, User, Activity, History, ShieldAlert, FileText, BarChart2, MessageSquare, Database, FileCode, CheckSquare, Settings, Hexagon, ChevronLeft, ChevronRight } from 'lucide-react';
import { ConfirmationModal } from '../ui/ConfirmationModal';
import './Sidebar.css';

const NAV_ITEMS = [
  { path: '/dashboard', icon: <Activity size={18} />, label: 'Analysis Hub' },
  { path: '/history', icon: <History size={18} />, label: 'History' },
  { path: '/simulations', icon: <ShieldAlert size={18} />, label: 'Simulations' },
  { path: '/threat-intel', icon: <FileText size={18} />, label: 'Threat Intel' },
];

const ADMIN_ITEMS = [
  { path: '/admin/stats', icon: <BarChart2 size={18} />, label: 'Platform Stats' },
  { path: '/admin/feedback', icon: <MessageSquare size={18} />, label: 'Feedback Queue' },
  { path: '/admin/dataset', icon: <Database size={18} />, label: 'Dataset' },
  { path: '/admin/simulations', icon: <FileCode size={18} />, label: 'Simulations' },
  { path: '/admin/activities', icon: <CheckSquare size={18} />, label: 'MCQ Activities' },
];

export function Sidebar({ mobileOpen, setMobileOpen, isMobile }: { mobileOpen?: boolean, setMobileOpen?: (val: boolean) => void, isMobile?: boolean }) {
  const { profile, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [showSignoutModal, setShowSignoutModal] = useState(false);
  const isAdmin = profile?.role === 'admin' || profile?.role === 'moderator';

  const handleLinkClick = () => {
    if (isMobile && setMobileOpen) setMobileOpen(false);
  };

  const effectiveCollapsed = isMobile ? false : collapsed;
  const sidebarClass = `sidebar ${effectiveCollapsed ? 'sidebar--collapsed' : ''} ${isMobile && mobileOpen ? 'sidebar--mobile-open' : ''}`;

  return (
    <>
      {isMobile && mobileOpen && <div className="sidebar-overlay animate-fade-in" onClick={() => setMobileOpen?.(false)} />}
      <aside className={sidebarClass}>
        {/* Logo */}
        <div className="sidebar__logo">
          <div className="sidebar__logo-mark"><Hexagon size={24} fill="var(--electric-blue)" style={{ opacity: 0.8 }} /></div>
          {!collapsed && (
            <div>
              <div className="sidebar__logo-title">PHISHGUARD</div>
              <div className="sidebar__logo-sub">Vigilant Control</div>
            </div>
          )}
          <button
            className="sidebar__collapse-btn"
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        {/* Live status */}
        {!collapsed && (
          <div className="sidebar__status">
            <StatusDot status="online" />
            <span className="code-data" style={{ fontSize: 11, color: 'var(--neon-green)' }}>SYSTEMS OPERATIONAL</span>
          </div>
        )}

        {/* Nav */}
        <nav className="sidebar__nav">
          {!effectiveCollapsed && <div className="label-caps sidebar__section-label">Navigation</div>}
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`}
              title={effectiveCollapsed ? item.label : undefined}
              onClick={handleLinkClick}
            >
              <span className="sidebar__link-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{item.icon}</span>
              {!effectiveCollapsed && <span className="sidebar__link-label">{item.label}</span>}
            </NavLink>
          ))}

          {isAdmin && (
            <>
              {!effectiveCollapsed && <div className="label-caps sidebar__section-label" style={{ marginTop: 24 }}>Admin</div>}
              {ADMIN_ITEMS.map(item => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) => `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`}
                  title={effectiveCollapsed ? item.label : undefined}
                  onClick={handleLinkClick}
                >
                  <span className="sidebar__link-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{item.icon}</span>
                  {!effectiveCollapsed && <span className="sidebar__link-label">{item.label}</span>}
                </NavLink>
              ))}
            </>
          )}
        </nav>

        {/* Footer */}
        <div className="sidebar__footer">
          {!effectiveCollapsed && profile && (
            <div className="sidebar__user">
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.display_name || 'User'}
                  className="sidebar__user-avatar"
                  style={{ objectFit: 'cover', padding: 0 }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              ) : (
                <div className="sidebar__user-avatar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <User size={16} />
                </div>
              )}
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {profile.display_name || profile.email.split('@')[0]}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div className="label-caps" style={{ color: 'var(--amber)', fontSize: 10 }}>{profile.role.toUpperCase()}</div>
                </div>
                <div style={{ fontSize: 10, color: 'var(--on-surface-variant)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {profile.email}
                </div>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 4 }}>
            {!effectiveCollapsed && (
              <NavLink
                to="/settings"
                className={({ isActive }) => `btn ${isActive ? 'btn-primary' : 'btn-ghost'} flex items-center gap-2`}
                style={{ flex: 1, fontSize: 12, padding: '6px 10px', justifyContent: 'center' }}
                onClick={handleLinkClick}
              >
                <Settings size={14} /> Settings
              </NavLink>
            )}
            <button
              className="btn btn-danger"
              style={{ fontSize: 12, padding: '6px 10px' }}
              onClick={() => setShowSignoutModal(true)}
              title="Sign Out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>

        <ConfirmationModal
          isOpen={showSignoutModal}
          onClose={() => setShowSignoutModal(false)}
          onConfirm={signOut}
          title="Confirm Sign Out"
          message="Are you sure you want to securely end this session? You will need to log in again to access the dashboard."
          confirmText="Sign Out"
          danger={true}
        />
      </aside>
    </>
  );
}
