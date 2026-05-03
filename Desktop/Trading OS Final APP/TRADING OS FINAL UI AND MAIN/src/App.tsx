import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { SymbolProvider } from './contexts/SymbolContext';
import { WatchlistProvider } from './contexts/WatchlistContext';
import Layout from './components/Layout';
import { WorkspacePreferencesSync } from './components/WorkspacePreferencesSync';
import { GlobalCommandPalette } from './components/GlobalCommandPalette';
import { getAppMode } from './lib/appMode';

// Pages
import HomeLanding from './pages/HomeLanding';
import Auth from './pages/Auth';
import Onboarding from './pages/Onboarding';
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
import EngineOps from './pages/EngineOps';
import JournalWorkspace from './pages/JournalWorkspace';
import Settings from './pages/Settings';
import NotFound from './pages/not-found';
import AxeHomeLanding from './pages/AxeHomeLanding';
import AxePrivacy from './pages/axe/AxePrivacy';
import AxeTerms from './pages/axe/AxeTerms';
import AxeDisclaimer from './pages/axe/AxeDisclaimer';
import { AxeAppGate } from './components/axe/AxeAppGate';
import AxeJournalRoute from './pages/axe/AxeJournalRoute';
import AxeCompanionSettingsBridge from './pages/axe/AxeCompanionSettingsBridge';

/**
 * TRADING OS - Bloomberg-grade Trading Terminal
 *
 * Routing structure:
 * - /                    → MAIN (dashboard) — HEILIG
 * - /journal             → NOTES + TRADE JOURNAL (local workspace)
 * - /chart               → CHART (trading terminal + engine API)
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
  const mode = getAppMode();
  return (
    <SymbolProvider>
      <WatchlistProvider>
      <WorkspacePreferencesSync />
      <BrowserRouter>
        {mode === 'terminal' ? <GlobalCommandPalette /> : null}
        <Routes>
          {mode === 'axe' ? (
            <>
              {/* AXE standalone */}
              <Route path="/" element={<AxeHomeLanding />} />
              <Route
                path="/app"
                element={
                  <AxeAppGate>
                    <AxeCompanion />
                  </AxeAppGate>
                }
              />
              <Route
                path="/journal"
                element={
                  <AxeAppGate>
                    <AxeJournalRoute />
                  </AxeAppGate>
                }
              />
              <Route path="/settings" element={<AxeCompanionSettingsBridge />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/privacy" element={<AxePrivacy />} />
              <Route path="/terms" element={<AxeTerms />} />
              <Route path="/disclaimer" element={<AxeDisclaimer />} />
              <Route path="*" element={<NotFound />} />
            </>
          ) : (
            <>
              {/* Public surface */}
              <Route path="/home" element={<HomeLanding />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/onboarding" element={<Onboarding />} />

              {/* Terminal */}
              <Route element={<Layout />}>
                <Route path="/" element={<Main />} />
                <Route path="/journal" element={<JournalWorkspace />} />
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
                <Route path="/engine" element={<EngineOps />} />
                <Route path="/settings" element={<Settings />} />
              </Route>

              <Route path="*" element={<NotFound />} />
            </>
          )}
        </Routes>
      </BrowserRouter>
      </WatchlistProvider>
    </SymbolProvider>
  );
}

export default App;
