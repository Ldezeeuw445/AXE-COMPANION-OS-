import { useState } from 'react';
import { FlaskConical, Play } from 'lucide-react';
import { useSymbol } from '@/contexts/SymbolContext';
import { runBacktest } from '../lib/engineAdapter';
import type { BacktestResult, BacktestTrade } from '../lib/engineAdapter';

// ── SVG equity chart ──
function EquityChart({ data }: { data: number[] }) {
  if (!data.length) return null;
  const w = 600, h = 160;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pad = 8;
  const pts = data.map((v, i) => `${pad + (i / (data.length - 1)) * (w - pad * 2)},${pad + h - pad - ((v - min) / range) * (h - pad * 2)}`);
  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p}`).join(' ');
  const areaPath = `${linePath} L${w - pad},${h} L${pad},${h} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 180 }} preserveAspectRatio="none">
      <defs>
        <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#equityGrad)" />
      <path d={linePath} fill="none" stroke="#06b6d4" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

const STRATEGIES = ['EMA Crossover', 'RSI Mean Reversion', 'MACD Momentum', 'Bollinger Reversion'];
const TIMEFRAMES = ['1m', '5m', '15m', '30m', '1H', '4H', 'D1'];
const SYMBOL_OPTIONS = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'XAU/USD', 'BTC/USD', 'ETH/USD', 'SPX500', 'NAS100'] as const;

// ── Slider input ──
function SliderField({ label, value, onChange, min, max, step, unit }: {
  label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step: number; unit: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[9px] text-white/40">{label}</span>
        <span className="text-[9px] text-cyan-400 tabular-nums">{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full h-1 rounded-full appearance-none bg-white/[0.06] accent-cyan-500 cursor-pointer"
      />
    </div>
  );
}

// ── Stat card ──
function StatCard({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="stat-box">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${positive === true ? 'text-green-400' : positive === false ? 'text-red-400' : ''}`}>{value}</div>
    </div>
  );
}

export default function QuantLab() {
  const { symbol, setSymbol } = useSymbol();
  const [strategy, setStrategy] = useState('EMA Crossover');
  const [timeframe, setTimeframe] = useState('1H');
  const [capital, setCapital] = useState(100000);
  const [risk, setRisk] = useState(2);
  const [stopLoss, setStopLoss] = useState(1.5);
  const [takeProfit, setTakeProfit] = useState(3);
  const [trailing, setTrailing] = useState(false);
  const [commission, setCommission] = useState(5);
  const [slippage, setSlippage] = useState(2);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'trades' | 'equity'>('overview');
  const [running, setRunning] = useState(false);

  const handleRun = async () => {
    setRunning(true);
    // TODO: runBacktest() moet via Web Worker isolatie om ghost state te voorkomen — worker per job, nooit hergebruiken, Promise-based return.
    const res = await runBacktest({ strategy, symbol, timeframe, capital, risk, stopLoss, takeProfit, trailing, commission, slippage });
    setResult(res);
    setRunning(false);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#0a0a0a] scrollbar-hide">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
        <div className="flex items-center gap-3">
          <FlaskConical size={14} className="text-cyan-400" />
          <span className="text-[10px] text-white/40 px-1.5 py-0.5 bg-white/5 rounded">QUANTLAB</span>
        </div>
      </div>

      <div className="border-b border-amber-500/20 bg-amber-500/5 px-4 py-1.5 text-[10px] text-amber-200/90">
        PLACEHOLDER: `runBacktest()` returns synthetic trades — no engine backtest API.
      </div>

      <div className="p-4 flex gap-4">
        {/* ── LEFT: Config ── */}
        <div className="w-[280px] shrink-0 space-y-3">
          <div className="tos-card rounded-lg p-3 space-y-3">
            <span className="text-[10px] text-white/40 uppercase tracking-wider">STRATEGY</span>
            <div className="flex flex-wrap gap-1">
              {STRATEGIES.map(s => (
                <button key={s} onClick={() => setStrategy(s)} className={`symbol-tag text-[9px] ${strategy === s ? 'active' : ''}`}>{s}</button>
              ))}
            </div>

            <div className="space-y-1 pt-2 border-t border-white/[0.04]">
              <div className="flex items-center justify-between">
                <span className="text-[9px] text-white/40">Symbol</span>
                <select value={symbol} onChange={e => setSymbol(e.target.value)} className="bg-white/[0.05] border border-white/10 rounded px-2 py-0.5 text-[10px] text-white/70 outline-none focus:border-cyan-500/30">
                  {(SYMBOL_OPTIONS.includes(symbol as (typeof SYMBOL_OPTIONS)[number])
                    ? [...SYMBOL_OPTIONS]
                    : [symbol, ...SYMBOL_OPTIONS]
                  ).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[9px] text-white/40 shrink-0">Timeframe</span>
                <div className="flex flex-wrap gap-0.5 justify-end">
                  {TIMEFRAMES.map(t => (
                    <button key={t} onClick={() => setTimeframe(t)} className={`symbol-tag text-[8px] ${timeframe === t ? 'active' : ''}`}>{t}</button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-white/[0.04]">
              <SliderField label="Initial Capital" value={capital} onChange={setCapital} min={10000} max={1000000} step={10000} unit="$" />
              <SliderField label="Risk per Trade" value={risk} onChange={setRisk} min={0.5} max={10} step={0.5} unit="%" />
              <SliderField label="Stop Loss" value={stopLoss} onChange={setStopLoss} min={0.5} max={5} step={0.1} unit="%" />
              <SliderField label="Take Profit" value={takeProfit} onChange={setTakeProfit} min={1} max={10} step={0.1} unit="%" />
              <div className="flex items-center justify-between">
                <span className="text-[9px] text-white/40">Trailing Stop</span>
                <button onClick={() => setTrailing(!trailing)} className={`w-7 h-3.5 rounded-full transition-all ${trailing ? 'bg-cyan-500' : 'bg-white/10'}`}>
                  <div className={`w-3 h-3 rounded-full bg-white transition-transform ${trailing ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
              </div>
              <SliderField label="Commission" value={commission} onChange={setCommission} min={0} max={20} step={1} unit="$" />
              <SliderField label="Slippage" value={slippage} onChange={setSlippage} min={0} max={10} step={1} unit=" bps" />
            </div>

            <button onClick={handleRun} disabled={running}
              className={`w-full py-2 rounded-md text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                running
                  ? 'bg-white/5 text-white/30 cursor-not-allowed'
                  : 'btn-cyan shadow-[0_3px_0_#0e7490,0_6px_16px_rgba(6,182,212,0.35)]'
              }`}>
              <Play size={14} />
              {running ? 'Running...' : 'Run Backtest'}
            </button>
          </div>
        </div>

        {/* ── RIGHT: Results ── */}
        <div className="flex-1 min-w-0">
          {!result ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center">
              <FlaskConical size={48} className="text-cyan-400/20 mb-4" />
              <p className="text-sm text-white/50 mb-1">Configure strategy and click Run Backtest</p>
              <p className="text-[10px] text-white/30 max-w-sm">Select your strategy, adjust parameters, and run a backtest to see performance metrics.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Tabs */}
              <div className="flex gap-1">
                {(['overview', 'trades', 'equity'] as const).map(t => (
                  <button key={t} onClick={() => setActiveTab(t)} className={`px-3 py-1.5 rounded text-[10px] font-medium capitalize transition-all ${activeTab === t ? 'bg-cyan-500/20 text-cyan-400' : 'text-white/40 hover:text-white/60'}`}>
                    {t}
                  </button>
                ))}
              </div>

              {activeTab === 'overview' && (
                <div className="grid grid-cols-3 gap-3">
                  <StatCard label="NET PROFIT" value={`$${result.netProfit.toLocaleString()}`} positive={result.netProfit > 0} />
                  <StatCard label="WIN RATE" value={`${result.winRate}%`} positive={result.winRate > 50} />
                  <StatCard label="PROFIT FACTOR" value={`${result.profitFactor}`} positive={result.profitFactor > 1} />
                  <StatCard label="MAX DRAWDOWN" value={`${result.maxDrawdown}%`} positive={false} />
                  <StatCard label="SHARPE RATIO" value={`${result.sharpeRatio}`} positive={result.sharpeRatio > 1} />
                  <StatCard label="SORTINO RATIO" value={`${result.sortinoRatio}`} positive={result.sortinoRatio > 1} />
                  <StatCard label="EXPECTANCY" value={`$${result.expectancy}`} positive={result.expectancy > 0} />
                  <StatCard label="CALMAR RATIO" value={`${result.calmarRatio}`} positive={result.calmarRatio > 0.5} />
                  <StatCard label="R-MULTIPLE" value={`${result.rMultiple}`} positive={result.rMultiple > 1} />
                </div>
              )}

              {activeTab === 'trades' && (
                <div className="tos-card rounded-lg overflow-hidden overflow-x-auto custom-scrollbar">
                  <table className="w-full text-[10px]">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                        {['#', 'DIR', 'ENTRY', 'EXIT', 'P&L', 'R-MULT', 'EXIT REASON', 'HOLDING'].map(h => (
                          <th key={h} className="px-2 py-2 text-left text-[9px] text-white/40 uppercase tracking-wider font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.trades.map((t: BacktestTrade) => (
                        <tr key={t.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                          <td className="px-2 py-1.5 text-white/30">{t.id}</td>
                          <td className={`px-2 py-1.5 ${t.direction === 'LONG' ? 'text-green-400' : 'text-red-400'}`}>{t.direction}</td>
                          <td className="px-2 py-1.5 text-white/60 tabular-nums">{t.entry.toFixed(2)}</td>
                          <td className="px-2 py-1.5 text-white/60 tabular-nums">{t.exit.toFixed(2)}</td>
                          <td className={`px-2 py-1.5 tabular-nums ${t.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>${t.pnl.toFixed(0)}</td>
                          <td className="px-2 py-1.5 text-white/60">{t.rMultiple.toFixed(2)}R</td>
                          <td className="px-2 py-1.5 text-white/40">{t.exitReason}</td>
                          <td className="px-2 py-1.5 text-white/40">{t.holdingPeriod}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {activeTab === 'equity' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-4">
                    <div>
                      <div className="text-[9px] text-white/40">START EQUITY</div>
                      <div className="text-sm text-white/70">$100,000</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-white/40">END EQUITY</div>
                      <div className="text-sm text-white/70">${result.equityCurve[result.equityCurve.length - 1].toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-white/40">PEAK</div>
                      <div className="text-sm text-green-400">${Math.max(...result.equityCurve).toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-white/40">TROUGH</div>
                      <div className="text-sm text-red-400">${Math.min(...result.equityCurve).toLocaleString()}</div>
                    </div>
                  </div>
                  <div className="tos-card rounded-lg p-3">
                    <EquityChart data={result.equityCurve} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
