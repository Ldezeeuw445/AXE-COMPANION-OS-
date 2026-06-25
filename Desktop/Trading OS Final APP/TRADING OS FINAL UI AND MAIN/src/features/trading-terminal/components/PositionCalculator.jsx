import React, { useState, useCallback } from 'react';
import axios from 'axios';
import { Calculator, X } from 'lucide-react';
import { Button } from './ui/button';
import { getTradingTerminalApiUrl } from '../env';

const PositionCalculator = ({ isOpen, onClose, symbol, currentPrice }) => {
  const API = getTradingTerminalApiUrl();
  const [accountSize, setAccountSize] = useState('10000');
  const [riskPercent, setRiskPercent] = useState('1');
  const [entryPrice, setEntryPrice] = useState(currentPrice?.toFixed(4) || '');
  const [stopLoss, setStopLoss] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const calculate = useCallback(async () => {
    if (!entryPrice || !stopLoss) return;
    setLoading(true);
    try {
      const res = await axios.post(`${API}/calculator/position`, {
        account_size: parseFloat(accountSize),
        risk_percent: parseFloat(riskPercent),
        entry_price: parseFloat(entryPrice),
        stop_loss: parseFloat(stopLoss),
        symbol,
      });
      setResult(res.data);
    } catch (err) {
      console.error('Calculator error:', err);
    } finally {
      setLoading(false);
    }
  }, [accountSize, riskPercent, entryPrice, stopLoss, symbol, API]);

  if (!isOpen) return null;

  return (
    <div className="absolute left-0 bottom-full mb-2 z-50 w-72 glass-panel shadow-2xl animate-fade-in" data-testid="position-calculator">
      <div className="p-3 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calculator className="w-4 h-4 text-[#3B82F6]" />
          <span className="font-heading font-medium text-sm">Position Calculator</span>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-white" data-testid="calc-close">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-3 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-slate-500 uppercase">Account Size</label>
            <input value={accountSize} onChange={e => setAccountSize(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-[#3B82F6]/50" data-testid="calc-account" />
          </div>
          <div>
            <label className="text-[10px] text-slate-500 uppercase">Risk %</label>
            <input value={riskPercent} onChange={e => setRiskPercent(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-[#3B82F6]/50" data-testid="calc-risk" />
          </div>
          <div>
            <label className="text-[10px] text-slate-500 uppercase">Entry Price</label>
            <input value={entryPrice} onChange={e => setEntryPrice(e.target.value)} placeholder={currentPrice?.toFixed(4)} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs font-mono text-white placeholder-slate-700 focus:outline-none focus:border-[#3B82F6]/50" data-testid="calc-entry" />
          </div>
          <div>
            <label className="text-[10px] text-slate-500 uppercase">Stop Loss</label>
            <input value={stopLoss} onChange={e => setStopLoss(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-[#3B82F6]/50" data-testid="calc-sl" />
          </div>
        </div>

        <Button onClick={calculate} disabled={loading} className="w-full bg-[#3B82F6] hover:bg-[#2563EB] h-8 text-xs" data-testid="calc-button">
          Calculate
        </Button>

        {result && (
          <div className="space-y-2 pt-2 border-t border-white/10 animate-fade-in" data-testid="calc-result">
            <div className="flex justify-between">
              <span className="text-[10px] text-slate-400">Lot Size</span>
              <span className="text-sm font-mono text-white font-bold">{result.lot_size}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[10px] text-slate-400">Risk Amount</span>
              <span className="text-xs font-mono text-[#FF3B30]">${result.risk_amount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[10px] text-slate-400">Stop Distance</span>
              <span className="text-xs font-mono text-slate-300">{result.stop_pips} pips</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[10px] text-slate-400">TP 1R</span>
              <span className="text-xs font-mono text-[#00E676]">{result.reward_1r}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[10px] text-slate-400">TP 2R</span>
              <span className="text-xs font-mono text-[#00E676]">{result.reward_2r}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[10px] text-slate-400">TP 3R</span>
              <span className="text-xs font-mono text-[#00E676]">{result.reward_3r}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PositionCalculator;
