import { useEffect, type PropsWithChildren } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useSupabaseSession } from '@/lib/supabaseAuth';

/**
 * AXE standalone: require Supabase session before rendering children.
 * Preserves return path using the same key as Layout (`tos_next_path`).
 */
export function AxeAppGate({ children }: PropsWithChildren) {
  const { userId, loading } = useSupabaseSession();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (loading) return;
    if (userId) return;
    try {
      const next = `${location.pathname}${location.search}${location.hash}` || '/app';
      sessionStorage.setItem('tos_next_path', next);
    } catch {
      // ignore
    }
    navigate('/auth', { replace: true });
  }, [loading, userId, navigate, location.pathname, location.search, location.hash]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a] text-white">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a] text-white">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  return <>{children}</>;
}
