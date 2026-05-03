import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Shield, Target, Droplets, Flame, Diamond } from 'lucide-react';
import { getTradingTerminalApiUrl } from '../env';

const TF_LABEL = { '1min': '1m', '5min': '5m', '15min': '15m', '1hour': '1H', '4hour': '4H', '1day': 'D1' };

const LEVEL_CONFIG = {
  nearest_support: { icon: Shield, colorClass: 'text-[#00E676]', bgClass: 'border-[#00E676]/20' },
  nearest_resistance: { icon: Shield, colorClass: 'text-[#FF3B30]', bgClass: 'border-[#FF3B30]/20' },
  nearest_fib: { icon: Target, colorClass: 'text-[#A855F7]', bgClass: 'border-[#A855F7]/20' },
  golden_pocket: { icon: Diamond, colorClass: 'text-[#F59E0B]', bgClass: 'border-[#F59E0B]/20' },
  buy_side_liq: { icon: Droplets, colorClass: 'text-[#22D3EE]', bgClass: 'border-[#22D3EE]/20' },
  sell_side_liq: { icon: Flame, colorClass: 'text-[#F97316]', bgClass: 'border-[#F97316]/20' },
};

const KeyLevelsCards = ({ symbol, timeframe }) => {
  const API = getTradingTerminalApiUrl();
  const [levels, setLevels] = useState(null);

  const fetchLevels = useCallback(async () => {
    if (!symbol) return;
    try {
      const res = await axios.get(`${API}/market/smart-levels/${symbol}?timeframe=${timeframe || '1day'}`);
      setLevels(res.data);
    } catch (err) {}
  }, [symbol, timeframe, API]);

  useEffect(() => { fetchLevels(); }, [fetchLevels]);

  if (!levels) return null;

  const cards = [
    { key: 'nearest_support', data: levels.nearest_support },
    { key: 'nearest_resistance', data: levels.nearest_resistance },
    { key: 'nearest_fib', data: levels.nearest_fib },
    { key: 'golden_pocket', data: levels.golden_pocket },
    { key: 'buy_side_liq', data: levels.buy_side_liq },
    { key: 'sell_side_liq', data: levels.sell_side_liq },
  ].filter(c => c.data);

  return (
    <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-0.5" data-testid="key-levels-cards">
      {/* Timeframe indicator */}
      <div className="flex-shrink-0 flex items-center px-1.5">
        <span className="text-[8px] font-mono font-bold text-[#06b6d4]/60 bg-[#06b6d4]/10 px-1.5 py-0.5 rounded" data-testid="tiles-timeframe-label">{TF_LABEL[timeframe] || timeframe}</span>
      </div>
      {cards.map(({ key, data }) => {
        const config = LEVEL_CONFIG[key];
        const Icon = config.icon;
        return (
          <div key={key} className={`flex-shrink-0 flex-1 min-w-[120px] stat-box !p-2 border ${config.bgClass} !rounded`} data-testid={`smart-level-${key}`}>
            <div className="flex items-center gap-1 mb-0.5">
              <Icon className={`w-2.5 h-2.5 ${config.colorClass}`} />
              <span className="text-[8px] text-white/35 uppercase tracking-wider font-medium truncate">{data.label}</span>
            </div>
            <div className={`font-mono text-[11px] font-bold ${config.colorClass}`}>
              {key === 'golden_pocket' ? <span>{data.high} - {data.low}</span> : <span>{data.price}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default KeyLevelsCards;
