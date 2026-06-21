import { Link, useLocation } from 'react-router-dom';
import { TradingOsLogo } from '@/components/branding/TradingOsLogo';
import { Button } from '@/components/ui/button';

export default function Navbar() {
  const { pathname } = useLocation();

  return (
    <div className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-[#07070a]/80 backdrop-blur">
      <div className="mx-auto flex h-[4.25rem] max-w-[1400px] items-center justify-between px-6">
        <Link to="/home" className="flex items-center" aria-label="Trading OS home">
          <TradingOsLogo variant="wordmark" decorative imgClassName="h-11 sm:h-12 lg:h-[3.25rem] opacity-[0.98]" />
        </Link>

        <div className="flex items-center gap-3">
          <Link to="/auth">
            <Button variant="ghost" className="text-white/40 hover:text-white/70">
              Sign In
            </Button>
          </Link>
          <Link to={pathname === '/home' ? '/auth' : '/home'}>
            <Button className="bg-cyan-500/20 border border-cyan-500/25 text-cyan-200 hover:bg-cyan-500/25">
              Get Started
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

