import React, { useState, useEffect, useMemo } from 'react';
import { BarChart3, Clock } from 'lucide-react';

const OrderBook = ({ quote, symbol }) => {
  const [activeTab, setActiveTab] = useState('book');

  // Generate simulated order book data based on current price
  const { asks, bids } = useMemo(() => {
    if (!quote?.price) return { asks: [], bids: [] };
    const price = quote.price;
    const dec = price < 10 ? 5 : 2;
    const step = price < 10 ? 0.0005 : 0.5;

    const askRows = [];
    const bidRows = [];
    let cumAsk = 0;
    let cumBid = 0;

    for (let i = 0; i < 8; i++) {
      const askPrice = price + step * (i + 1);
      const bidPrice = price - step * (i + 1);
      const askSize = Math.floor(Math.random() * 400 + 50);
      const bidSize = Math.floor(Math.random() * 400 + 50);
      cumAsk += askSize;
      cumBid += bidSize;

      askRows.push({ price: askPrice.toFixed(dec), size: askSize, total: cumAsk });
      bidRows.push({ price: bidPrice.toFixed(dec), size: bidSize, total: cumBid });
    }
    return { asks: askRows.reverse(), bids: bidRows };
  }, [quote?.price]);

  // Simulated recent trades
  const trades = useMemo(() => {
    if (!quote?.price) return [];
    const price = quote.price;
    const dec = price < 10 ? 5 : 2;
    const step = price < 10 ? 0.0003 : 0.3;
    return Array.from({ length: 10 }, (_, i) => ({
      price: (price + (Math.random() - 0.5) * step * 4).toFixed(dec),
      size: Math.floor(Math.random() * 200 + 10),
      side: Math.random() > 0.5 ? 'buy' : 'sell',
      time: new Date(Date.now() - i * 3000).toLocaleTimeString('en-US', { hour12: false }),
    }));
  }, [quote?.price]);

  const maxTotal = Math.max(...bids.map(b => b.total), ...asks.map(a => a.total), 1);

  return (
    <div className="glass-panel flex flex-col h-full min-h-0" data-testid="order-book">
      {/* Header tabs */}
      <div className="flex items-center border-b border-white/[0.04]">
        <button
          onClick={() => setActiveTab('book')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider transition-all ${
            activeTab === 'book' ? 'text-white border-b-2 border-[#06b6d4]' : 'text-white/35 hover:text-white/60'
          }`}
          data-testid="orderbook-tab"
        >
          <BarChart3 className="w-3 h-3" />
          Order Book
        </button>
        <button
          onClick={() => setActiveTab('trades')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider transition-all ${
            activeTab === 'trades' ? 'text-white border-b-2 border-[#06b6d4]' : 'text-white/35 hover:text-white/60'
          }`}
          data-testid="trades-tab"
        >
          <Clock className="w-3 h-3" />
          Trades
        </button>
      </div>

      {activeTab === 'book' ? (
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Column headers */}
          <div className="flex items-center justify-between px-3 py-1.5 text-[8px] uppercase tracking-widest text-white/25 font-semibold border-b border-white/[0.04]">
            <span>Price</span>
            <span>Size</span>
            <span>Total</span>
          </div>

          {/* Asks (sells) */}
          <div className="flex-1 overflow-y-auto">
            {asks.map((row, i) => (
              <div key={`ask-${i}`} className="relative flex items-center justify-between px-3 py-1 text-[11px] font-mono">
                <div className="absolute right-0 top-0 bottom-0 bg-[#ef4444]/10" style={{ width: `${(row.total / maxTotal) * 100}%` }} />
                <span className="text-[#ef4444] relative z-10">{row.price}</span>
                <span className="text-white/50 relative z-10">{row.size}</span>
                <span className="text-white/30 relative z-10">{row.total}</span>
              </div>
            ))}
          </div>

          {/* Current price */}
          <div className="px-3 py-2 text-center border-y border-white/[0.04] bg-white/[0.02]">
            <span className="font-mono text-base font-bold text-[#06b6d4]">
              {quote?.price?.toFixed(quote.price < 10 ? 5 : 2)}
            </span>
          </div>

          {/* Bids (buys) */}
          <div className="flex-1 overflow-y-auto">
            {bids.map((row, i) => (
              <div key={`bid-${i}`} className="relative flex items-center justify-between px-3 py-1 text-[11px] font-mono">
                <div className="absolute right-0 top-0 bottom-0 bg-[#22c55e]/10" style={{ width: `${(row.total / maxTotal) * 100}%` }} />
                <span className="text-[#22c55e] relative z-10">{row.price}</span>
                <span className="text-white/50 relative z-10">{row.size}</span>
                <span className="text-white/30 relative z-10">{row.total}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="flex items-center justify-between px-3 py-1.5 text-[8px] uppercase tracking-widest text-white/25 font-semibold border-b border-white/[0.04]">
            <span>Price</span>
            <span>Size</span>
            <span>Time</span>
          </div>
          {trades.map((trade, i) => (
            <div key={i} className="flex items-center justify-between px-3 py-1 text-[11px] font-mono">
              <span className={trade.side === 'buy' ? 'text-[#22c55e]' : 'text-[#ef4444]'}>{trade.price}</span>
              <span className="text-white/50">{trade.size}</span>
              <span className="text-white/25">{trade.time}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default OrderBook;
