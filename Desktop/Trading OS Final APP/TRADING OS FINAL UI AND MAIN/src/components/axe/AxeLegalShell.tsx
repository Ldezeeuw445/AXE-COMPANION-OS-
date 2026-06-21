import type { PropsWithChildren } from 'react';
import { Link } from 'react-router-dom';
import AxeLandingNavbar from '@/components/landing/AxeLandingNavbar';

export function AxeLegalShell({
  title,
  children,
}: PropsWithChildren<{ title: string }>) {
  return (
    <div className="min-h-screen bg-background text-foreground landing-matte-bg draft-depth">
      <AxeLandingNavbar />
      <main className="mx-auto max-w-3xl px-6 pb-24 pt-28">
        <Link to="/" className="text-sm text-white/45 transition-colors hover:text-white/80">
          ← Back to AXE
        </Link>
        <h1 className="mt-6 text-3xl font-bold tracking-tight text-white">{title}</h1>
        <p className="mt-3 text-xs text-white/35">Placeholder — not legal advice. Replace with counsel-reviewed documents before public launch.</p>
        <div className="mt-10 space-y-4 text-sm leading-relaxed text-muted-foreground">{children}</div>
      </main>
    </div>
  );
}
