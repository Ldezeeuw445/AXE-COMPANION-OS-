export type EarningsImpact = 'low' | 'medium' | 'high';

export interface EarningsEvent {
  ticker: string;
  company: string;
  date: string; // YYYY-MM-DD
  time: 'BMO' | 'AMC' | 'DMT' | 'TBD';
  sector: string;
  marketCap: number;
  epsEstimate: number | null;
  revenueEstimate: number | null;
  epsActual: number | null;
  revenueActual: number | null;
  epsSurprise: number | null;
  revenueSurprise: number | null;
  impact: EarningsImpact;
}

