import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { X, Maximize2, Minimize2 } from 'lucide-react';
import TradingChart from './TradingChart';
import { getTradingTerminalApiUrl } from '../env';

const DEFAULT_CHARTS = [
  { symbol: 'EURUSD', name: 'EUR/USD', timeframe: '1day' },
  { symbol: 'XAUUSD', name: 'Gold/USD', timeframe: '1day' },
  { symbol: 'SPY', name: 'S&P 500', timeframe: '1day' },
  { symbol: 'AAPL', name: 'Apple Inc.', timeframe: '1day' },
];

const MiniChart = ({ config, allPairs, onConfigChange, onClose, onExpand }) => {
  const API = getTradingTerminalApiUrl();
  const [chartData, setChartData] = useState(null);
  const [levels, setLevels] = useState([]);
  const [quote, setQuote] = useState(null);

  const fetchData = useCallback(async () => {
    if (!config.symbol) return;
    try {
      const [chartRes, levelsRes, quoteRes] = await Promise.all([
        axios.get(`${API}/market/chart/${config.symbol}?timeframe=${config.timeframe}&count=100`),
        axios.get(`${API}/market/levels/${config.symbol}`),
        axios.get(`${API}/market/quote/${config.symbol}`),
      ]);
      setChartData(chartRes.data);
      setLevels(levelsRes.data);
      setQuote(quoteRes.data);
    } catch (err) {
      console.error(`Error fetching mini chart data for ${config.symbol}:`, err);
    }
  }, [config.symbol, config.timeframe, API]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleTimeframeChange = (tf) => {
    onConfigChange({ ...config, timeframe: tf });
  };

  const handleSymbolChange = (e) => {
    const symbol = e.target.value;
    const pair = allPairs.find(p => p.symbol === symbol);
    if (pair) {
      onConfigChange({ ...config, symbol: pair.symbol, name: pair.name });
    }
  };

  return (
    <div className="glass-panel flex flex-col h-full min-h-0" data-testid={`mini-chart-${config.symbol}`}>
      {/* Mini header */}
      <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <select
            value={config.symbol}
            onChange={handleSymbolChange}
            className="bg-transparent text-xs font-heading font-medium text-white border-none focus:outline-none cursor-pointer"
            data-testid={`mini-chart-select-${config.symbol}`}
          >
            {allPairs.map(p => (
              <option key={p.symbol} value={p.symbol} className="bg-[#121620] text-white">
                {p.name}
              </option>
            ))}
          </select>
          {quote && (
            <span className={`font-mono text-xs ${quote.change_percent >= 0 ? 'text-[#00E676]' : 'text-[#FF3B30]'}`}>
              {quote.price?.toFixed(config.symbol.length === 6 && config.symbol.includes('USD') ? 4 : 2)}
              <span className="ml-1 text-[10px]">{quote.change_percent >= 0 ? '+' : ''}{quote.change_percent?.toFixed(2)}%</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onExpand} className="text-slate-500 hover:text-white p-0.5" data-testid={`mini-chart-expand-${config.symbol}`}>
            <Maximize2 className="w-3 h-3" />
          </button>
          <button onClick={onClose} className="text-slate-500 hover:text-[#FF3B30] p-0.5" data-testid={`mini-chart-close-${config.symbol}`}>
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0">
        <TradingChart
          data={chartData?.bars || []}
          levels={levels}
          symbol={config.symbol}
          indicators={chartData?.indicators}
          activeTimeframe={config.timeframe}
          onTimeframeChange={handleTimeframeChange}
        />
      </div>
    </div>
  );
};

const MultiChartView = ({ isOpen, onClose, allPairs, onActiveChartChange }) => {
  const [charts, setCharts] = useState(DEFAULT_CHARTS);
  const [activeIdx, setActiveIdx] = useState(0);

  const handleConfigChange = useCallback((index, newConfig) => {
    setCharts(prev => {
      const updated = [...prev];
      updated[index] = newConfig;
      return updated;
    });
    if (index === activeIdx) {
      onActiveChartChange?.(newConfig);
    }
  }, [activeIdx, onActiveChartChange]);

  const handleChartClick = useCallback((index) => {
    setActiveIdx(index);
    onActiveChartChange?.(charts[index]);
  }, [charts, onActiveChartChange]);

  const handleClose = useCallback((index) => {
    setCharts(prev => prev.filter((_, i) => i !== index));
    if (activeIdx >= index && activeIdx > 0) setActiveIdx(activeIdx - 1);
  }, [activeIdx]);

  const handleExpand = useCallback((config) => {
    onClose?.(config);
  }, [onClose]);

  const addChart = useCallback(() => {
    if (charts.length >= 6) return;
    const available = allPairs.find(p => !charts.some(c => c.symbol === p.symbol));
    if (available) {
      setCharts(prev => [...prev, { symbol: available.symbol, name: available.name, timeframe: '1day' }]);
    }
  }, [charts, allPairs]);

  if (!isOpen) return null;

  const gridCols = charts.length <= 2 ? 'grid-cols-2' : charts.length <= 4 ? 'grid-cols-2' : 'grid-cols-3';
  const gridRows = charts.length <= 2 ? 'grid-rows-1' : 'grid-rows-2';

  return (
    <div className="absolute inset-0 z-40 bg-[#0B0E14]/95 backdrop-blur-xl flex flex-col" data-testid="multi-chart-view">
      {/* Header */}
      <div className="h-10 px-4 flex items-center justify-between border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="font-heading font-medium text-sm text-white">Multi-Chart</span>
          <span className="text-[10px] text-slate-500 font-mono">{charts.length} charts</span>
        </div>
        <div className="flex items-center gap-2">
          {charts.length < 6 && (
            <button
              onClick={addChart}
              className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded hover:bg-white/5"
              data-testid="multi-chart-add"
            >
              + Add Chart
            </button>
          )}
          <button onClick={() => onClose?.(null)} className="text-slate-400 hover:text-white" data-testid="multi-chart-close">
            <Minimize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Chart Grid */}
      <div className={`flex-1 p-3 grid ${gridCols} ${gridRows} gap-3 min-h-0`}>
        {charts.map((config, index) => (
          <div key={`${config.symbol}-${index}`} className={`relative ${activeIdx === index ? 'ring-1 ring-[#06b6d4]/50 rounded' : ''}`} onClick={() => handleChartClick(index)} data-testid={`multi-chart-${index}`}>
            {activeIdx === index && <div className="absolute top-1 left-1 z-10 px-1 py-0.5 rounded text-[7px] font-bold bg-[#06b6d4]/20 text-[#06b6d4]">ACTIVE</div>}
            <MiniChart
              config={config}
              allPairs={allPairs}
              onConfigChange={(newConfig) => handleConfigChange(index, newConfig)}
              onClose={() => handleClose(index)}
              onExpand={() => handleExpand(config)}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default MultiChartView;
