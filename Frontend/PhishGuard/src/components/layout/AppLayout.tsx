import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Hexagon, Menu } from 'lucide-react';
import './AppLayout.css';

export function AppLayout({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <div className="app-layout">
      {isMobile && (
        <div className="app-mobile-header">
          <button className="btn btn-ghost" onClick={() => setMobileOpen(true)} style={{ padding: 8 }}>
            <Menu size={24} color="var(--electric-blue)" />
          </button>
          <div className="sidebar__logo-mark" style={{ display: 'flex', alignItems: 'center', padding: 0 }}><Hexagon size={24} color="var(--electric-blue)" /></div>
          <div style={{ width: 40 }} /> {/* Spacer to center logo */}
        </div>
      )}
      <Sidebar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} isMobile={isMobile} />
      <main className={`app-main ${isMobile ? 'app-main--mobile' : ''}`}>
        <div className="app-content">
          {children}
        </div>
      </main>
    </div>
  );
}
