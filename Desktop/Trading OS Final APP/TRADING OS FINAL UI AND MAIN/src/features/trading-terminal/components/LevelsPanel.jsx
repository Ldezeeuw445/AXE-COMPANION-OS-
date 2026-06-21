import React from 'react';
import { ArrowUp, ArrowDown, Circle } from 'lucide-react';
import { Skeleton } from './ui/skeleton';

const LevelsPanel = ({ levels, currentPrice, loading }) => {
  if (loading) {
    return (
      <div className="p-4 space-y-3">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-8 w-full bg-white/5" />
        ))}
      </div>
    );
  }

  if (!levels?.length) {
    return (
      <div className="p-4 text-center text-slate-500 text-sm">
        No levels available
      </div>
    );
  }

  // Sort levels by price descending
  const sortedLevels = [...levels].sort((a, b) => b.price - a.price);

  const getLevelIcon = (type) => {
    switch (type) {
      case 'resistance':
        return <ArrowUp className="w-3 h-3 text-[#FF3B30]" />;
      case 'support':
        return <ArrowDown className="w-3 h-3 text-[#00E676]" />;
      default:
        return <Circle className="w-3 h-3 text-[#F59E0B]" />;
    }
  };

  const getLevelClass = (strength) => {
    switch (strength) {
      case 'strong':
        return 'level-strong';
      case 'moderate':
        return 'level-moderate';
      default:
        return 'level-weak';
    }
  };

  const getDistanceFromPrice = (levelPrice) => {
    if (!currentPrice) return null;
    const distance = ((levelPrice - currentPrice) / currentPrice) * 100;
    return distance;
  };

  return (
    <div className="p-3 space-y-1" data-testid="levels-list">
      {sortedLevels.map((level, index) => {
        const distance = getDistanceFromPrice(level.price);
        const isNearby = distance !== null && Math.abs(distance) < 1;
        
        return (
          <div 
            key={index}
            className={`flex items-center justify-between py-2 px-3 rounded ${getLevelClass(level.strength)} ${
              isNearby ? 'bg-white/[0.05]' : 'hover:bg-white/[0.03]'
            } transition-colors`}
            data-testid={`level-${level.type}-${index}`}
          >
            <div className="flex items-center gap-2">
              {getLevelIcon(level.type)}
              <div className="flex flex-col">
                <span className="text-xs text-slate-400 capitalize">{level.type}</span>
                <span className="text-[10px] text-slate-600">{level.description}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm text-white">
                {level.price?.toFixed(level.price > 100 ? 2 : 4)}
              </span>
              {distance !== null && (
                <span className={`font-mono text-[10px] ${
                  distance > 0 ? 'text-[#FF3B30]' : 'text-[#00E676]'
                }`}>
                  {distance > 0 ? '+' : ''}{distance.toFixed(2)}%
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default LevelsPanel;
