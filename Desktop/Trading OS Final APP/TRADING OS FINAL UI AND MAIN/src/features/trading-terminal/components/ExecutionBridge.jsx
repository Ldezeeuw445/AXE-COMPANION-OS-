import React, { useState, useCallback } from 'react';
import axios from 'axios';
import { Minus, Plus } from 'lucide-react';
import { getTradingTerminalApiUrl } from '../env';

const ORDER_TYPES = ['Market', 'Buy Limit', 'Buy Stop', 'Sell Limit', 'Sell Stop'];

const ExecutionBridge = ({ symbol, quote, onOrderPlaced }) => {
  const API = getTradingTerminalApiUrl();
  const [orderType, setOrderType] = useState('Market');
  const [volume, setVolume] = useState('0.10');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [loading, setLoading] = useState(false);

  const bidPrice = quote?.price || 0;
  const askPrice = bidPrice; // Simplified - in real, ask = bid + spread

  const placeOrder = useCallback(async (side) => {
    if (!symbol || loading) return;
    setLoading(true);
    try {
      const payload = {
        symbol,
        side,
        order_type: orderType.toLowerCase().replace(' ', '_'),
        volume: parseFloat(volume) || 0.1,
        stop_loss: stopLoss ? parseFloat(stopLoss) : null,
        take_profit: takeProfit ? parseFloat(takeProfit) : null,
      };
      await axios.post(`${API}/orders`, payload);
      onOrderPlaced?.();
    } catch (err) {
      console.error('Order error:', err);
    } finally {
      setLoading(false);
    }
  }, [symbol, orderType, volume, stopLoss, takeProfit, loading, onOrderPlaced, API]);

  const adjustValue = (setter, current, delta) => {
    const val = parseFloat(current) || 0;
    setter((val + delta).toFixed(val < 10 ? 4 : 2));
  };

  // Calculate risk/reward ratio
  const slDist = stopLoss ? Math.abs(bidPrice - parseFloat(stopLoss)) : 0;
  const tpDist = takeProfit ? Math.abs(parseFloat(takeProfit) - bidPrice) : 0;
  const rrRatio = slDist > 0 && tpDist > 0 ? (tpDist / slDist).toFixed(1) : '—';
  const rrPercent = slDist > 0 && tpDist > 0 ? Math.min((tpDist / (slDist + tpDist)) * 100, 100) : 50;

  return (
    <div className="glass-panel" data-testid="execution-bridge">
      {/* Order type selector */}
      <div className="px-3 py-0.5 border-b border-white/[0.04] flex items-center gap-1">
        <span className="text-[10px] text-slate-500 font-medium mr-2 uppercase tracking-wider">Execution</span>
        {ORDER_TYPES.map(ot => (
          <button
            key={ot}
            onClick={() => setOrderType(ot)}
            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all ${
              orderType === ot ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-white'
            }`}
            data-testid={`order-type-${ot.replace(' ', '-').toLowerCase()}`}
          >
            {ot}
          </button>
        ))}
      </div>

      {/* Main execution row */}
      <div className="flex items-center gap-0 h-9">
        {/* SELL button */}
        <button
          onClick={() => placeOrder('sell')}
          disabled={loading}
          className="h-full px-4 bg-[#D32F2F] hover:bg-[#D32F2F]/80 text-white font-heading font-bold text-sm flex flex-col items-center justify-center min-w-[90px] transition-all active:scale-[0.98]"
          data-testid="sell-button"
        >
          <span className="text-[10px] opacity-80">SELL</span>
          <span className="font-mono text-xs">{bidPrice.toFixed(bidPrice < 10 ? 4 : 2)}</span>
        </button>

        {/* Volume */}
        <div className="flex flex-col items-center justify-center px-3 border-l border-r border-white/5">
          <span className="text-[8px] text-slate-600 uppercase tracking-wider">Volume</span>
          <div className="flex items-center gap-1">
            <button onClick={() => adjustValue(setVolume, volume, -0.01)} className="text-slate-600 hover:text-white">
              <Minus className="w-3 h-3" />
            </button>
            <input
              value={volume}
              onChange={e => setVolume(e.target.value)}
              className="w-14 text-center bg-transparent text-xs font-mono text-white focus:outline-none"
              data-testid="volume-input"
            />
            <button onClick={() => adjustValue(setVolume, volume, 0.01)} className="text-slate-600 hover:text-white">
              <Plus className="w-3 h-3" />
            </button>
          </div>
          <div className="flex gap-1 mt-0.5">
            {['0.01', '0.10', '0.50', '1.00'].map(v => (
              <button key={v} onClick={() => setVolume(v)} className={`text-[8px] font-mono px-1 rounded ${volume === v ? 'text-white bg-white/10' : 'text-slate-600 hover:text-white'}`}>
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* Stop Loss */}
        <div className="flex flex-col items-center justify-center px-3 border-r border-white/5">
          <span className="text-[8px] text-[#FF3B30] uppercase tracking-wider font-bold">Stop Loss</span>
          <div className="flex items-center gap-1">
            <button onClick={() => adjustValue(setStopLoss, stopLoss || bidPrice, -(bidPrice < 10 ? 0.001 : 1))} className="text-slate-600 hover:text-white">
              <Minus className="w-3 h-3" />
            </button>
            <input
              value={stopLoss}
              onChange={e => setStopLoss(e.target.value)}
              placeholder={bidPrice.toFixed(bidPrice < 10 ? 4 : 2)}
              className="w-20 text-center bg-transparent text-xs font-mono text-white placeholder-slate-700 focus:outline-none"
              data-testid="sl-input"
            />
            <button onClick={() => adjustValue(setStopLoss, stopLoss || bidPrice, bidPrice < 10 ? 0.001 : 1)} className="text-slate-600 hover:text-white">
              <Plus className="w-3 h-3" />
            </button>
          </div>
          {slDist > 0 && (
            <span className="text-[8px] font-mono text-[#FF3B30]">
              Risk: {(slDist * parseFloat(volume || 1)).toFixed(2)}
            </span>
          )}
        </div>

        {/* R:R Visual Bar */}
        <div className="flex-1 flex flex-col items-center justify-center px-4">
          <div className="w-full h-3 rounded-full overflow-hidden flex bg-white/5">
            <div className="h-full bg-[#FF3B30]/60 transition-all" style={{ width: `${100 - rrPercent}%` }} />
            <div className="h-full bg-[#00E676]/60 transition-all" style={{ width: `${rrPercent}%` }} />
          </div>
          <span className="text-[10px] font-mono text-slate-300 mt-0.5">
            1 : {rrRatio}
          </span>
        </div>

        {/* Take Profit */}
        <div className="flex flex-col items-center justify-center px-3 border-l border-white/5">
          <span className="text-[8px] text-[#00E676] uppercase tracking-wider font-bold">Take Profit</span>
          <div className="flex items-center gap-1">
            <button onClick={() => adjustValue(setTakeProfit, takeProfit || bidPrice, -(bidPrice < 10 ? 0.001 : 1))} className="text-slate-600 hover:text-white">
              <Minus className="w-3 h-3" />
            </button>
            <input
              value={takeProfit}
              onChange={e => setTakeProfit(e.target.value)}
              placeholder={bidPrice.toFixed(bidPrice < 10 ? 4 : 2)}
              className="w-20 text-center bg-transparent text-xs font-mono text-white placeholder-slate-700 focus:outline-none"
              data-testid="tp-input"
            />
            <button onClick={() => adjustValue(setTakeProfit, takeProfit || bidPrice, bidPrice < 10 ? 0.001 : 1)} className="text-slate-600 hover:text-white">
              <Plus className="w-3 h-3" />
            </button>
          </div>
          {tpDist > 0 && (
            <span className="text-[8px] font-mono text-[#00E676]">
              Reward: {(tpDist * parseFloat(volume || 1)).toFixed(2)}
            </span>
          )}
        </div>

        {/* BUY button */}
        <button
          onClick={() => placeOrder('buy')}
          disabled={loading}
          className="h-full px-4 bg-[#1976D2] hover:bg-[#1976D2]/80 text-white font-heading font-bold text-sm flex flex-col items-center justify-center min-w-[90px] transition-all active:scale-[0.98] border-l border-white/5"
          data-testid="buy-button"
        >
          <span className="text-[10px] opacity-80">BUY</span>
          <span className="font-mono text-xs">{askPrice.toFixed(askPrice < 10 ? 4 : 2)}</span>
        </button>
      </div>
    </div>
  );
};

export default ExecutionBridge;
