import { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import SessionBar from './SessionBar';
import TickerBar from './TickerBar';
import GlobalTopBar from './GlobalTopBar';
import Sidebar from './Sidebar';
import MobileBottomNav from './MobileBottomNav';
import AiChatWindow from './AiChatWindow';
import { useSupabaseSession } from '@/lib/supabaseAuth';

/**
 * LAYOUT COMPONENT
 *
 * Desktop: SessionBar + TickerBar + GlobalTopBar + Sidebar + Content + Chat
 * Mobile:  Compact GlobalTopBar + BottomNav + Content + Chat (fullscreen)
 */
export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { userId, loading: sessionLoading } = useSupabaseSession();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  // Auth gate: keep public pages accessible; chart + journal work without login (local/engine edge).
  useEffect(() => {
    if (sessionLoading) return;
    const path = location.pathname;
    const isPublic =
      path === '/home' ||
      path === '/auth' ||
      path === '/onboarding' ||
      path === '/chart' ||
      path === '/journal';
    if (!userId && !isPublic) {
      try {
        sessionStorage.setItem('tos_next_path', path + location.search + location.hash);
      } catch {
        // ignore
      }
      navigate('/home', { replace: true });
    }
  }, [userId, sessionLoading, location.pathname, location.search, location.hash, navigate]);

  // Bloomberg-y behavior: Chart always uses collapsed sidebar without extra state effects.
  const effectiveCollapsed = location.pathname === '/chart' ? true : sidebarCollapsed;

  return (
    <div className="h-screen w-screen bg-[#0a0a0a] text-white overflow-hidden flex flex-col">
      {/* Desktop: Session Bar + Ticker Bar (hidden on mobile) */}
      <div className="hidden md:block">
        <SessionBar />
        <TickerBar />
      </div>

      {/* Global Top Bar — all devices (compact on mobile) */}
      <GlobalTopBar />

      {/* Main area: sidebar + content */}
      <div className="flex-1 flex overflow-hidden min-h-0 relative">
        {/* Desktop Sidebar (hidden on mobile) */}
        <div className="hidden md:block">
          <Sidebar
            collapsed={effectiveCollapsed}
            onToggleCollapse={() => setSidebarCollapsed(v => !v)}
            onOpenChat={() => setChatOpen(true)}
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden bg-[#0a0a0a] scrollbar-hide flex flex-col min-h-0 pb-16 md:pb-0">
          <Outlet />
        </div>
      </div>

      {/* Mobile Bottom Navigation (hidden on desktop) */}
      <div className="md:hidden">
        <MobileBottomNav />
      </div>

      {/* AI Chat Window — floating, draggable, resizable (premium) */}
      <AiChatWindow isOpen={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  );
}
