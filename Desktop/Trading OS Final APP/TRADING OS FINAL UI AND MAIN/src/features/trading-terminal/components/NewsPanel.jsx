import React from 'react';
import { ExternalLink, Clock } from 'lucide-react';
import { Skeleton } from './ui/skeleton';
import { formatDistanceToNow } from 'date-fns';

const NewsPanel = ({ news, symbol, loading }) => {
  if (loading) {
    return (
      <div className="p-4 space-y-3">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full bg-white/5" />
        ))}
      </div>
    );
  }

  if (!news?.length) {
    return (
      <div className="p-4 text-center text-slate-500 text-sm">
        No news for {symbol || 'this pair'}
      </div>
    );
  }

  const getSentimentBadge = (sentiment) => {
    if (!sentiment) return null;
    const classes = {
      bullish: 'sentiment-bullish',
      bearish: 'sentiment-bearish',
      neutral: 'sentiment-neutral',
    };
    return (
      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${classes[sentiment] || classes.neutral}`}>
        {sentiment}
      </span>
    );
  };

  const formatTime = (dateString) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true });
    } catch {
      return dateString;
    }
  };

  return (
    <div className="p-2 space-y-1" data-testid="news-list">
      {news.map((item, index) => (
        <a
          key={index}
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block p-3 rounded-lg hover:bg-white/[0.04] border border-transparent hover:border-white/10 transition-colors group"
          data-testid={`news-item-${index}`}
        >
          <div className="flex items-start gap-2 mb-1">
            <Clock className="w-3 h-3 text-slate-600 mt-0.5 flex-shrink-0" />
            <span className="text-[10px] text-slate-500 font-mono">
              {formatTime(item.published_date)}
            </span>
            {item.source && (
              <>
                <span className="text-slate-600">•</span>
                <span className="text-[10px] text-slate-600">{item.source}</span>
              </>
            )}
          </div>
          <h4 className="text-sm font-medium text-slate-200 group-hover:text-white line-clamp-2 mb-1">
            {item.title}
          </h4>
          <div className="flex items-center gap-2">
            {getSentimentBadge(item.sentiment)}
            <ExternalLink className="w-3 h-3 text-slate-600 group-hover:text-slate-400 ml-auto" />
          </div>
        </a>
      ))}
    </div>
  );
};

export default NewsPanel;
