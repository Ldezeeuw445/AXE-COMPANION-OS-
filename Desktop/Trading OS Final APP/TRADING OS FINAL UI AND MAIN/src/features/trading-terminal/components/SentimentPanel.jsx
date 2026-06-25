import React, { useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

const SentimentPanel = ({ news, loading }) => {
  const sentiment = useMemo(() => {
    if (!news?.length) return { bullish: 0, bearish: 0, neutral: 0 };
    
    const counts = news.reduce(
      (acc, item) => {
        if (item.sentiment === 'bullish') acc.bullish++;
        else if (item.sentiment === 'bearish') acc.bearish++;
        else acc.neutral++;
        return acc;
      },
      { bullish: 0, bearish: 0, neutral: 0 }
    );

    const total = counts.bullish + counts.bearish + counts.neutral || 1;
    
    return {
      bullish: Math.round((counts.bullish / total) * 100),
      bearish: Math.round((counts.bearish / total) * 100),
      neutral: Math.round((counts.neutral / total) * 100),
    };
  }, [news]);

  const overallSentiment = useMemo(() => {
    if (sentiment.bullish > sentiment.bearish + 20) return 'bullish';
    if (sentiment.bearish > sentiment.bullish + 20) return 'bearish';
    return 'neutral';
  }, [sentiment]);

  return (
    <div className="flex-1 p-3 flex items-center gap-4" data-testid="sentiment-display">
      {/* Overall sentiment icon */}
      <div className={`flex items-center justify-center w-12 h-12 rounded-full ${
        overallSentiment === 'bullish' ? 'bg-[#00E676]/20' :
        overallSentiment === 'bearish' ? 'bg-[#FF3B30]/20' : 'bg-white/10'
      }`}>
        {overallSentiment === 'bullish' ? (
          <TrendingUp className="w-6 h-6 text-[#00E676]" />
        ) : overallSentiment === 'bearish' ? (
          <TrendingDown className="w-6 h-6 text-[#FF3B30]" />
        ) : (
          <Minus className="w-6 h-6 text-slate-400" />
        )}
      </div>

      {/* Sentiment bars */}
      <div className="flex-1 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[#00E676] w-10">Bull</span>
          <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
            <div 
              className="h-full bg-[#00E676] rounded-full transition-all duration-500"
              style={{ width: `${sentiment.bullish}%` }}
            />
          </div>
          <span className="text-[10px] font-mono text-white w-8 text-right">{sentiment.bullish}%</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[#FF3B30] w-10">Bear</span>
          <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
            <div 
              className="h-full bg-[#FF3B30] rounded-full transition-all duration-500"
              style={{ width: `${sentiment.bearish}%` }}
            />
          </div>
          <span className="text-[10px] font-mono text-white w-8 text-right">{sentiment.bearish}%</span>
        </div>
      </div>
    </div>
  );
};

export default SentimentPanel;
