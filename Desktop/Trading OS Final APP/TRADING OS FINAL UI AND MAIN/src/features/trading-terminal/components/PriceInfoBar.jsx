import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

const PriceInfoBar = ({ quote, symbol }) => {
  if (!quote) return null;

  const isPositive = quote.change_percent >= 0;
  const sentiment = quote.change_percent > 0.5 ? 'Bullish' : quote.change_percent < -0.5 ? 'Bearish' : 'Neutral';
  const sentimentColor = sentiment === 'Bullish' ? 'bg-[#00E676]/20 text-[#00E676]' : sentiment === 'Bearish' ? 'bg-[#FF3B30]/20 text-[#FF3B30]' : 'bg-white/10 text-slate-400';
  const dec = quote.price < 10 ? 4 : 2;
  const spread = quote.day_high && quote.day_low ? ((quote.day_high - quote.day_low) / quote.price * 100).toFixed(3) : '—';

  return (
    <div className="flex items-center justify-between px-3 py-0.5 border-b border-white/[0.03]" data-testid="price-info-bar">
      {/* Left: Price + Sentiment */}
      <div className="flex items-center gap-3">
        <span className="font-mono text-base font-bold text-white">{quote.price?.toFixed(dec)}</span>
        <span className={`font-mono text-xs ${isPositive ? 'text-[#00E676]' : 'text-[#FF3B30]'}`}>
          {isPositive ? '+' : ''}{quote.change_percent?.toFixed(2)}%
        </span>
        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${sentimentColor}`}>
          {sentiment === 'Bullish' && <TrendingUp className="w-2.5 h-2.5 inline mr-0.5" />}
          {sentiment === 'Bearish' && <TrendingDown className="w-2.5 h-2.5 inline mr-0.5" />}
          {sentiment}
        </span>
      </div>

      {/* Right: OHLC data */}
      <div className="flex items-center gap-4 text-[10px] font-mono">
        {quote.open_price && (
          <span className="text-slate-500">O <span className="text-slate-300">{quote.open_price?.toFixed(dec)}</span></span>
        )}
        <span className="text-slate-500">H <span className="text-[#00E676]">{quote.day_high?.toFixed(dec)}</span></span>
        <span className="text-slate-500">L <span className="text-[#FF3B30]">{quote.day_low?.toFixed(dec)}</span></span>
        {quote.volume && (
          <span className="text-slate-500">Vol <span className="text-slate-300">{(quote.volume / 1000000).toFixed(1)}M</span></span>
        )}
        <span className="text-slate-500">Spread <span className="text-slate-300">{spread}%</span></span>
      </div>
    </div>
  );
};

export default PriceInfoBar;
