import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TradingOsLogo } from '@/components/branding/TradingOsLogo';
import { ensureProfileBasics, useSupabaseSession, useTradingOsProfile, signInWithPassword, signUpWithPassword } from '@/lib/supabaseAuth';
import { getAppMode } from '@/lib/appMode';

function AuthPageShell({
  title,
  subtitle,
  children,
  variant,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  variant: 'terminal' | 'axe';
}) {
  const backHref = variant === 'axe' ? '/' : '/home';
  const brandAria = variant === 'axe' ? 'AXE Companion home' : 'Trading OS home';

  return (
    <div className="min-h-screen app-shell-bg text-foreground flex items-center justify-center px-4 pb-28">
      <div className="absolute top-6 left-6 right-6 z-10 flex items-start justify-between gap-4">
        <Link to="/" className="min-w-0 shrink pt-0.5" aria-label={brandAria}>
          {variant === 'axe' ? (
            <span className="inline-flex items-center gap-2">
              <img
                src="/assets/axe-companion-os.png"
                alt=""
                className="h-8 w-8 rounded-lg border border-white/10 object-cover sm:h-9 sm:w-9"
              />
              <span className="text-sm font-semibold text-white/90">AXE Companion</span>
            </span>
          ) : (
            <TradingOsLogo
              variant="wordmark"
              decorative
              className="max-w-[min(100%,220px)]"
              imgClassName="h-7 w-auto max-w-[min(100%,220px)] object-contain object-left sm:h-8"
            />
          )}
        </Link>
        <Link
          to={backHref}
          className="flex shrink-0 items-center gap-2 text-sm text-white/40 transition-colors hover:text-white/70"
        >
          Back
        </Link>
      </div>

      <div className="w-full max-w-md">
        <header className="mb-6 text-center">
          <div className="mb-5 flex w-full justify-center">
            {variant === 'axe' ? (
              <img
                src="/assets/axe-companion-os.png"
                alt=""
                className="h-12 w-12 rounded-xl border border-white/10 object-cover sm:h-14 sm:w-14"
              />
            ) : (
              <TradingOsLogo
                variant="wordmark"
                decorative
                className="opacity-[0.96]"
                imgClassName="mx-auto h-10 w-auto max-w-[min(100%,220px)] object-contain object-center sm:h-12 sm:max-w-[260px]"
              />
            )}
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white/90">{title}</h1>
          <p className="text-white/35 text-sm mt-1">{subtitle}</p>
        </header>

        <div className="tos-card rounded-xl !mb-0 w-full !p-8 sm:!p-9">{children}</div>
        <p className="mt-8 text-center text-[11px] text-white/25 leading-relaxed">
          {variant === 'axe' ? '©2026 AXE Companion · Not financial advice.' : '©2026 Trading OS · Not financial advice.'}
        </p>
      </div>
    </div>
  );
}

export default function Auth() {
  const navigate = useNavigate();
  const mode = getAppMode();
  const { userId, loading: sessionLoading } = useSupabaseSession();
  const { onboardingComplete, loading: profileLoading } = useTradingOsProfile(userId);

  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    if (mode === 'axe') {
      let next: string | null = null;
      try {
        next = sessionStorage.getItem('tos_next_path');
      } catch {
        next = null;
      }
      try {
        if (next) sessionStorage.removeItem('tos_next_path');
      } catch {
        // ignore
      }
      navigate(next || '/app', { replace: true });
      return;
    }
    if (profileLoading) return;
    let next: string | null = null;
    try {
      next = sessionStorage.getItem('tos_next_path');
    } catch {
      next = null;
    }
    if (onboardingComplete) {
      if (next) {
        try {
          sessionStorage.removeItem('tos_next_path');
        } catch {
          // ignore
        }
        navigate(next, { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    } else {
      navigate('/onboarding', { replace: true });
    }
  }, [userId, mode, profileLoading, onboardingComplete, navigate]);

  if (sessionLoading || (userId && mode !== 'axe' && profileLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center app-shell-bg">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setSaving(true);
    try {
      if (isSignup) {
        await signUpWithPassword(email, password, displayName || undefined);
        await ensureProfileBasics();
        navigate(mode === 'axe' ? '/app' : '/onboarding', { replace: true });
      } else {
        await signInWithPassword(email, password);
        await ensureProfileBasics();
        navigate(mode === 'axe' ? '/app' : '/onboarding', { replace: true });
      }
    } catch (e: any) {
      setErr(String(e?.message || e));
      setSaving(false);
    }
  };

  return (
    <AuthPageShell
      variant={mode}
      title={isSignup ? 'Create your account' : 'Welcome back'}
      subtitle={
        mode === 'axe'
          ? isSignup
            ? 'Create your AXE workspace — journal, accounts, and memory. Same account carries into Trading OS, our upcoming premium terminal.'
            : 'Sign in to AXE Companion. Trading OS is coming soon — a premium trading terminal powered by the same AXE intelligence layer.'
          : isSignup
            ? 'Set up your Trading OS workspace.'
            : 'Sign in to your Trading OS workspace.'
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {isSignup ? (
          <div>
            <label className="text-xs font-medium text-white/30 uppercase tracking-wider mb-1.5 block">
              Display Name
            </label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Trader"
              className="bg-black/40 border-white/10 h-11 text-white/80"
            />
          </div>
        ) : null}

        <div>
          <label className="text-xs font-medium text-white/30 uppercase tracking-wider mb-1.5 block">
            Email
          </label>
          <Input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="bg-black/40 border-white/10 h-11 text-white/80"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-white/30 uppercase tracking-wider mb-1.5 block">
            Password
          </label>
          <Input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Min 6 characters"
            className="bg-black/40 border-white/10 h-11 text-white/80"
          />
        </div>

        {err ? <div className="text-[11px] text-red-400/80">{err}</div> : null}

        <Button type="submit" className="w-full h-11 bg-cyan-500/20 border border-cyan-500/25 text-cyan-200 hover:bg-cyan-500/25" disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : isSignup ? 'Create Account' : 'Sign In'}
        </Button>
      </form>

      <div className="mt-6 text-center">
        <button
          type="button"
          onClick={() => setIsSignup(!isSignup)}
          className="text-sm text-white/35 hover:text-cyan-300 transition-colors"
        >
          {isSignup ? 'Already have an account? Sign in' : 'New here? Create an account'}
        </button>
      </div>
    </AuthPageShell>
  );
}

