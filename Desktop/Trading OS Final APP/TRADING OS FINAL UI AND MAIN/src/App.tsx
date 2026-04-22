import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { SymbolProvider } from './contexts/SymbolContext';
import Layout from './components/Layout';

// Pages
import Main from './pages/Main';
import Chart from './pages/Chart';
import News from './pages/News';
import Intel from './pages/Intel';
import Analyses from './pages/Analyses';
import Heatmap from './pages/Heatmap';
import MarketScanner from './pages/MarketScanner';
import QuantLab from './pages/QuantLab';
import MacroTerminal from './pages/MacroTerminal';
import BigMacIndex from './pages/BigMacIndex';
import PolymarketIntel from './pages/PolymarketIntel';
import EarningsCalendar from './pages/EarningsCalendar';
import AiDataCenterMap from './pages/AiDataCenterMap';
import AxeCompanion from './pages/AxeCompanion';

/**
 * TRADING OS - Bloomberg-grade Trading Terminal
 *
 * Routing structure:
 * - /                    → MAIN (dashboard) — HEILIG
 * - /chart               → CHART (ChartSlot placeholder)
 * - /news                → NEWS
 * - /intel               → INTEL (Bloomberg-grade)
 * - /analyses            → ANALYSES
 * - /heatmap             → HEATMAP
 * - /market-scanner      → MARKET SCANNER (NIEUW)
 * - /quantlab            → QUANTLAB (NIEUW)
 * - /macro-terminal      → MACRO TERMINAL
 * - /bigmac-index        → BIGMAC INDEX
 * - /polymarket-intel    → POLYMARKET INTEL
 * - /earnings-calendar   → EARNINGS CALENDAR
 * - /ai-data-center-map  → AI DATA CENTER MAP
 *
 * All pages share: Layout (SessionBar + TickerBar + Sidebar + Watchlist)
 * All pages use: engineAdapter.ts for data, SymbolContext for pair filter
 */
function App() {
  return (
    <SymbolProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Main />} />
            <Route path="/chart" element={<Chart />} />
            <Route path="/news" element={<News />} />
            <Route path="/intel" element={<Intel />} />
            <Route path="/analyses/:id" element={<Analyses />} />
            <Route path="/analyses" element={<Analyses />} />
            <Route path="/heatmap" element={<Heatmap />} />
            <Route path="/market-scanner" element={<MarketScanner />} />
            <Route path="/quantlab" element={<QuantLab />} />
            <Route path="/macro-terminal" element={<MacroTerminal />} />
            <Route path="/bigmac-index" element={<BigMacIndex />} />
            <Route path="/polymarket-intel" element={<PolymarketIntel />} />
            <Route path="/earnings-calendar" element={<EarningsCalendar />} />
            <Route path="/ai-data-center-map" element={<AiDataCenterMap />} />
            <Route path="/axe-companion" element={<AxeCompanion />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </SymbolProvider>
  );
}

export default App;
