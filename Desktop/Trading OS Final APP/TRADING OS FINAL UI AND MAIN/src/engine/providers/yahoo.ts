/**
 * engine/providers/yahoo.ts
 * =========================
 * Yahoo Finance — raw fetch only (unofficial chart API).
 */

export interface YahooConfig {
  // No API key
}

export class YahooFinanceProvider {
  constructor(_config?: YahooConfig) {
    void _config;
  }

  async fetchQuote(symbol: string): Promise<unknown> {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Yahoo quote error: ${res.status}`);
    const data = await res.json();
    if (!data.chart || !data.chart.result) throw new Error('Yahoo: no chart data');
    return data.chart.result[0];
  }

  async fetchChart(symbol: string, interval = '1d', range = '1mo'): Promise<unknown> {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Yahoo chart error: ${res.status}`);
    const data = await res.json();
    if (!data.chart || !data.chart.result) throw new Error('Yahoo: no chart data');
    return data.chart.result[0];
  }

  async fetchOptions(symbol: string): Promise<unknown> {
    const url = `https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Yahoo options error: ${res.status}`);
    const data = await res.json();
    if (!data.optionChain || !data.optionChain.result) throw new Error('Yahoo: no options data');
    return data.optionChain.result[0];
  }
}
