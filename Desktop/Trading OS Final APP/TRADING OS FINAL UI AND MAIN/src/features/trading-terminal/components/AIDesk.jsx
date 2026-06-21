import React, { useState, useCallback } from 'react';
import axios from 'axios';
import { Send, Loader2, Sparkles } from 'lucide-react';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { getTradingTerminalApiUrl } from '../env';

const AIDesk = ({ symbol, quote, levels, news }) => {
  const API = getTradingTerminalApiUrl();
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const getAnalysis = useCallback(async () => {
    if (!symbol || !API) return;

    setLoading(true);
    setError(null);

    try {
      // Build context from available data
      const context = `
        Current price: ${quote?.price || 'N/A'}
        Change: ${quote?.change_percent?.toFixed(2) || 'N/A'}%
        Day High: ${quote?.day_high || 'N/A'}
        Day Low: ${quote?.day_low || 'N/A'}
        Key Levels: ${levels?.slice(0, 3).map(l => `${l.type}: ${l.price}`).join(', ') || 'N/A'}
        Recent News Sentiment: ${news?.slice(0, 3).map(n => n.sentiment).join(', ') || 'N/A'}
      `.trim();

      const response = await axios.post(`${API}/ai/analyze`, {
        symbol: symbol,
        context: context,
        analysis_type: 'sentiment'
      });

      setAnalysis(response.data);
    } catch (err) {
      console.error('Error getting AI analysis:', err);
      setError('Failed to get AI analysis. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [symbol, quote, levels, news, API]);

  const getSentimentClass = (sentiment) => {
    switch (sentiment) {
      case 'bullish':
        return 'sentiment-bullish';
      case 'bearish':
        return 'sentiment-bearish';
      default:
        return 'sentiment-neutral';
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0" data-testid="ai-desk">
      <ScrollArea className="flex-1">
        <div className="p-4">
          {!analysis && !loading && !error && (
            <div className="text-center py-8">
              <Sparkles className="w-8 h-8 text-[#3B82F6] mx-auto mb-3 opacity-50" />
              <p className="text-slate-400 text-sm mb-4">
                Get AI-powered analysis for {symbol || 'your selected pair'}
              </p>
              <Button 
                onClick={getAnalysis}
                disabled={!symbol}
                className="bg-[#3B82F6] hover:bg-[#2563EB]"
                data-testid="ai-analyze-button"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Analyze Now
              </Button>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="w-8 h-8 text-[#3B82F6] animate-spin mb-3" />
              <p className="text-slate-400 text-sm">Analyzing {symbol}...</p>
            </div>
          )}

          {error && (
            <div className="text-center py-8">
              <p className="text-[#FF3B30] text-sm mb-4">{error}</p>
              <Button 
                onClick={getAnalysis}
                variant="outline"
                className="border-white/10"
                data-testid="ai-retry-button"
              >
                Try Again
              </Button>
            </div>
          )}

          {analysis && !loading && (
            <div className="space-y-4 animate-fade-in" data-testid="ai-analysis-result">
              {/* Sentiment Badge */}
              <div className="flex items-center justify-between">
                <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${getSentimentClass(analysis.sentiment)}`}>
                  {analysis.sentiment}
                </span>
                <span className="text-xs text-slate-500 font-mono">
                  {Math.round(analysis.confidence * 100)}% confidence
                </span>
              </div>

              {/* Key Points */}
              {analysis.key_points?.length > 0 && (
                <div className="space-y-2">
                  <h5 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Key Points</h5>
                  <ul className="space-y-1.5">
                    {analysis.key_points.slice(0, 5).map((point, index) => (
                      <li 
                        key={index} 
                        className="text-xs text-slate-300 pl-3 border-l-2 border-[#3B82F6]/30"
                      >
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Full Analysis */}
              <div className="space-y-2">
                <h5 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Analysis</h5>
                <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
                  {analysis.analysis}
                </p>
              </div>

              {/* Refresh Button */}
              <Button 
                onClick={getAnalysis}
                variant="ghost"
                size="sm"
                className="w-full text-slate-400 hover:text-white mt-4"
                data-testid="ai-refresh-button"
              >
                <Send className="w-3 h-3 mr-2" />
                Get Fresh Analysis
              </Button>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default AIDesk;
