import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="min-h-screen app-shell-bg text-white flex items-center justify-center px-6 pb-28">
      <div className="tos-card max-w-xl w-full p-8 text-center">
        <div className="text-xs text-white/40 uppercase tracking-widest">404</div>
        <div className="mt-2 text-2xl font-bold text-white/85">Page not found</div>
        <div className="mt-2 text-sm text-white/45">This route doesn’t exist in the terminal build.</div>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link to="/home">
            <Button className="h-11 px-6 bg-cyan-500/20 border border-cyan-500/25 text-cyan-200 hover:bg-cyan-500/25">
              Go to Landing
            </Button>
          </Link>
          <Link to="/">
            <Button variant="outline" className="h-11 px-6 border-white/10 bg-white/5 hover:bg-white/10 text-base">
              Open Terminal
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

