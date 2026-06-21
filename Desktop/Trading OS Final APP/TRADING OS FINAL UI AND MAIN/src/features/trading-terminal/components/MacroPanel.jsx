import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Skeleton } from './ui/skeleton';

const MacroPanel = ({ data, loading }) => {
  if (loading) {
    return (
      <div className="p-4 space-y-3">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-10 w-full bg-white/5" />
        ))}
      </div>
    );
  }

  if (!data?.length) {
    return (
      <div className="p-4 text-center text-slate-500 text-sm">
        No macro data available
      </div>
    );
  }

  const getChangeIcon = (change) => {
    if (!change || change === 0) return <Minus className="w-3 h-3 text-slate-500" />;
    return change > 0 
      ? <TrendingUp className="w-3 h-3 text-[#00E676]" />
      : <TrendingDown className="w-3 h-3 text-[#FF3B30]" />;
  };

  const getChangeColor = (change) => {
    if (!change || change === 0) return 'text-slate-400';
    return change > 0 ? 'text-[#00E676]' : 'text-[#FF3B30]';
  };

  return (
    <div className="p-3 space-y-1" data-testid="macro-data-list">
      {data.map((indicator) => (
        <div 
          key={indicator.id}
          className="flex items-center justify-between py-2 px-2 rounded hover:bg-white/[0.03] transition-colors"
          data-testid={`macro-indicator-${indicator.id}`}
        >
          <div className="flex flex-col">
            <span className="text-xs text-slate-400 font-medium">{indicator.name}</span>
            <span className="text-[10px] text-slate-600 font-mono">{indicator.unit}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-white">
              {indicator.value?.toFixed(2) || 'N/A'}
            </span>
            <div className={`flex items-center gap-1 ${getChangeColor(indicator.change)}`}>
              {getChangeIcon(indicator.change)}
              <span className="font-mono text-xs">
                {indicator.change ? (indicator.change > 0 ? '+' : '') + indicator.change.toFixed(2) : ''}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default MacroPanel;
