import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export default function AxeLandingNavbar() {
  return (
    <div className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-[#07070a]/80 backdrop-blur">
      <div className="mx-auto flex h-[4.25rem] max-w-[1400px] items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2" aria-label="AXE Companion home">
          <img
            src="/assets/axe-companion-os.png"
            alt=""
            className="h-9 w-9 rounded-lg border border-white/10 object-cover"
          />
          <span className="text-sm font-semibold tracking-tight text-white/90">AXE Companion</span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          <a
            href="#waitlist"
            className="hidden text-[11px] font-medium text-white/35 underline-offset-2 hover:text-cyan-300/90 hover:underline md:inline"
          >
            Trading OS — coming soon
          </a>
          <Link to="/auth">
            <Button variant="ghost" className="text-white/40 hover:text-white/70">
              Sign in
            </Button>
          </Link>
          <Link to="/auth">
            <Button className="hidden border border-emerald-500/25 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25 sm:inline-flex">
              Start free
            </Button>
          </Link>
          <Link to="/app">
            <Button className="bg-cyan-500/20 border border-cyan-500/25 text-cyan-200 hover:bg-cyan-500/25">
              Open app
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
