import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BarChart3, BookOpen, Gauge, Globe, Newspaper, ScanLine, Settings, Sparkles, Target } from 'lucide-react';

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { useSymbol } from '@/contexts/SymbolContext';
import { useTerminalWatchlist } from '@/contexts/WatchlistContext';

const NAV_COMMANDS = [
  { label: 'Go to MAIN', path: '/', icon: BarChart3, shortcut: 'G M' },
  { label: 'Go to Chart', path: '/chart', icon: BarChart3, shortcut: 'G C' },
  { label: 'Go to News', path: '/news', icon: Newspaper, shortcut: 'G N' },
  { label: 'Go to Intel', path: '/intel', icon: Target, shortcut: 'G I' },
  { label: 'Go to Journal', path: '/journal', icon: BookOpen, shortcut: 'G J' },
  { label: 'Go to Macro Terminal', path: '/macro-terminal', icon: Globe, shortcut: 'G R' },
  { label: 'Go to Market Scanner', path: '/market-scanner', icon: ScanLine, shortcut: 'G S' },
  { label: 'Go to Engine Ops', path: '/engine', icon: Gauge, shortcut: 'G E' },
  { label: 'Go to Settings', path: '/settings', icon: Settings, shortcut: 'G ,' },
  { label: 'Go to Axe Companion', path: '/axe-companion', icon: Sparkles, shortcut: 'G A' },
] as const;

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  return t.isContentEditable;
}

type GoChordState = { armedAt: number } | null;

export function GlobalCommandPalette() {
  const navigate = useNavigate();
  const location = useLocation();
  const { symbol, setSymbol, recentSymbols } = useSymbol();
  const { flatSymbols } = useTerminalWatchlist();

  const [open, setOpen] = useState(false);
  const chordRef = useRef<GoChordState>(null);

  // We close the palette on command selection (not via route-effect).

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;

      // ⌘K / Ctrl+K opens palette
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }

      // Escape closes palette
      if (e.key === 'Escape' && open) {
        e.preventDefault();
        setOpen(false);
        return;
      }

      // Bloomberg-ish "Go" chords: G then <key> within 900ms
      const now = Date.now();
      const k = e.key.toLowerCase();
      const armed = chordRef.current && now - chordRef.current.armedAt < 900;

      if (k === 'g' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        chordRef.current = { armedAt: now };
        return;
      }

      if (!armed) return;
      chordRef.current = null;

      const go = (path: string) => {
        e.preventDefault();
        navigate(path);
      };

      switch (k) {
        case 'c':
          go('/chart');
          break;
        case 'n':
          go('/news');
          break;
        case 'i':
          go('/intel');
          break;
        case 'j':
          go('/journal');
          break;
        case 'm':
          go('/');
          break;
        case 'r':
          go('/macro-terminal');
          break;
        case 's':
          go('/market-scanner');
          break;
        case 'e':
          go('/engine');
          break;
        case 'a':
          go('/axe-companion');
          break;
        case ',':
          go('/settings');
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate, open]);

  const symbolSuggestions = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    const push = (s: string) => {
      const t = String(s || '').trim();
      if (!t || seen.has(t)) return;
      seen.add(t);
      out.push(t);
    };
    for (const s of recentSymbols) push(s);
    for (const s of flatSymbols) push(s);
    return out.slice(0, 40);
  }, [recentSymbols, flatSymbols]);

  const runNav = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  const runSymbol = (s: string) => {
    setOpen(false);
    setSymbol(s);
    if (location.pathname !== '/chart') navigate('/chart');
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen} className="max-w-[680px]">
      <CommandInput placeholder="Type a command… (⌘K)" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>

        <CommandGroup heading="Navigation">
          {NAV_COMMANDS.map((c) => (
            <CommandItem key={c.path} value={c.label} onSelect={() => runNav(c.path)}>
              <c.icon className="size-4" />
              <span>{c.label}</span>
              <CommandShortcut>{c.shortcut}</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Symbol">
          <CommandItem value={`Current: ${symbol}`} onSelect={() => runSymbol(symbol)} disabled>
            <span className="text-muted-foreground">Current:</span>
            <span className="ml-1 font-mono">{symbol}</span>
          </CommandItem>
          {symbolSuggestions.map((s) => (
            <CommandItem key={s} value={`Symbol ${s}`} onSelect={() => runSymbol(s)}>
              <span className="font-mono">{s}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

