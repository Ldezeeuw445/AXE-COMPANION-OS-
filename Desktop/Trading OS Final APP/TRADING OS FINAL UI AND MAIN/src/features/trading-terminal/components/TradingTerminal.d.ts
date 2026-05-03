import type { FC, ReactNode } from 'react';

export interface TradingTerminalProps {
  externalSymbol?: string;
  externalTimeframe?: string;
  onSymbolChange?: (symbol: string) => void;
  onTimeframeChange?: (timeframe: string) => void;
  apiBaseUrl?: string;
  watchlistSlot?: ReactNode;
  axeSlot?: ReactNode;
  initialPanelState?: { left?: boolean; right?: boolean; execution?: boolean };
}

declare const TradingTerminal: FC<TradingTerminalProps>;
export default TradingTerminal;
