# CURSOR PROMPT - STAP 1: MAIN PAGINA

Kopieer ALLES hieronder en plak in Cursor. Dit is STAP 1 van 2.

---

## INSTRUCTIE

Maak eerst de MAIN pagina EXACT zoals hieronder beschreven. 

**Belangrijk:** Gebruik mijn BESTAANDE data, functies, state management en logica. 
Verander ALLEEN de HTML/JSX structuur en de CSS classes.

---

## STAP 1: CSS BESTAND (index.css)

Vervang je huidige CSS door dit:

```css
/* ===== RESET ===== */
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body, #root { height: 100%; width: 100%; overflow: hidden; background: #0a0a0a; color: white; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
.scrollbar-hide::-webkit-scrollbar { display: none; }
.scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }

/* ===== MARQUEE ===== */
@keyframes marquee { 0% { transform: translateX(0%); } 100% { transform: translateX(-50%); } }
.animate-marquee { animation: marquee 20s linear infinite; }

/* ===== SESSION BAR ===== */
.session-bar { height: 44px; background: linear-gradient(180deg, rgba(15,15,15,0.98) 0%, rgba(10,10,10,0.98) 100%); backdrop-filter: blur(20px); border-bottom: 1px solid rgba(255,255,255,0.04); display: flex; align-items: center; padding: 0 16px; }
.session-dot { width: 8px; height: 8px; border-radius: 50%; background: rgba(255,255,255,0.15); }
.session-dot.open { background: #22c55e; box-shadow: 0 0 8px #22c55e, 0 0 16px rgba(34,197,94,0.4); }
.session-dot.opening-soon { background: #eab308; box-shadow: 0 0 8px #eab308, 0 0 16px rgba(234,179,8,0.4); }

/* ===== TICKER BAR ===== */
.ticker-bar { height: 32px; background: rgba(8,8,8,0.95); backdrop-filter: blur(10px); border-bottom: 1px solid rgba(255,255,255,0.03); display: flex; align-items: center; overflow-x: auto; }

/* ===== BUTTONS ===== */
.btn-cyan { background: linear-gradient(180deg, #06b6d4 0%, #0891b2 100%); border: none; color: white; font-weight: 600; font-size: 11px; letter-spacing: 0.5px; padding: 10px 16px; border-radius: 6px; box-shadow: 0 3px 0 #0e7490, 0 6px 16px rgba(6,182,212,0.35), inset 0 1px 0 rgba(255,255,255,0.25); transition: all 0.15s ease; display: inline-flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; }
.btn-cyan:hover { transform: translateY(-1px); box-shadow: 0 4px 0 #0e7490, 0 8px 20px rgba(6,182,212,0.45), inset 0 1px 0 rgba(255,255,255,0.3); }
.btn-cyan:active { transform: translateY(2px); box-shadow: 0 1px 0 #0e7490, 0 2px 8px rgba(6,182,212,0.3), inset 0 1px 0 rgba(255,255,255,0.2); }
.btn-dark { background: linear-gradient(180deg, rgba(35,35,35,0.9) 0%, rgba(25,25,25,0.95) 100%); border: 1px solid rgba(255,255,255,0.06); color: rgba(255,255,255,0.7); font-size: 10px; font-weight: 500; letter-spacing: 0.5px; padding: 6px 12px; border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04); transition: all 0.15s ease; display: inline-flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer; }
.btn-dark:hover { background: linear-gradient(180deg, rgba(40,40,40,0.9) 0%, rgba(30,30,30,0.95) 100%); border-color: rgba(255,255,255,0.1); color: rgba(255,255,255,0.9); }

/* ===== SIDEBAR ITEM ===== */
.sidebar-item { display: flex; align-items: center; gap: 12px; padding: 10px 16px; margin: 2px 8px; border-radius: 6px; cursor: pointer; font-size: 11px; font-weight: 500; color: rgba(255,255,255,0.5); letter-spacing: 0.5px; transition: all 0.2s ease; }
.sidebar-item:hover { background: rgba(255,255,255,0.03); color: rgba(255,255,255,0.8); }
.sidebar-item.active { background: rgba(6,182,212,0.08); color: #06b6d4; box-shadow: inset 0 1px 0 rgba(6,182,212,0.1); }

/* ===== STAT BOX ===== */
.stat-box { padding: 12px; background: linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%); border: 1px solid rgba(255,255,255,0.04); border-radius: 6px; transition: all 0.2s ease; }
.stat-box:hover { border-color: rgba(6, 182, 212, 0.2); background: linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%); }

/* ===== SYMBOL TAG ===== */
.symbol-tag { padding: 6px 12px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); border-radius: 4px; font-size: 10px; font-weight: 500; color: rgba(255,255,255,0.5); white-space: nowrap; transition: all 0.15s ease; cursor: pointer; }
.symbol-tag:hover { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.1); color: rgba(255,255,255,0.8); }
.symbol-tag.active { background: rgba(6,182,212,0.12); border-color: rgba(6,182,212,0.3); color: #06b6d4; box-shadow: 0 0 12px rgba(6,182,212,0.2); }

/* ===== CATEGORY TILE ===== */
.category-tile { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
.category-tile:hover { transform: translateY(-2px); }

/* ===== SELECTION ===== */
::selection { background: rgba(6, 182, 212, 0.25); color: white; }
```

---

## STAP 2: MAIN PAGINA (pages/Main.tsx of App.tsx)

Hier is de EXACTE structuur. Gebruik je eigen data, hooks en functies, maar de JSX moet exact zo zijn.

### CONTAINER
```jsx
<div className="h-screen w-screen bg-[#0a0a0a] text-white overflow-hidden flex flex-col">
```

### RIJ 1: SESSION BAR
```jsx
<div className="h-11 flex items-center px-4 border-b border-white/[0.04] bg-gradient-to-b from-[rgba(15,15,15,0.98)] to-[rgba(10,10,10,0.98)] backdrop-blur-xl">
  <div className="flex items-center gap-2 px-4 border-r border-white/5">
    <div className="w-5 h-5 rounded-full border border-white/20 flex items-center justify-center">
      <div className="w-2 h-2 rounded-full bg-white/40" />
    </div>
    <span className="text-xs text-white/60 font-medium">14:19:25</span>
    <span className="text-xs text-white/30">GMT+2</span>
  </div>
  
  <div className="flex flex-1">
    {/* SYD */}
    <div className="flex-1 flex items-center justify-center gap-2 px-4 border-r border-white/5">
      <div className="w-5 h-5 rounded-full border border-white/20 flex items-center justify-center">
        <div className="w-2 h-2 rounded-full bg-white/20" />
      </div>
      <span className="text-[11px] font-semibold text-white/80 tracking-wide">SYD</span>
      <span className="text-[10px] text-white/40">Closed</span>
      <span className="text-[10px] text-white/40">22:19</span>
    </div>
    {/* TYO */}
    <div className="flex-1 flex items-center justify-center gap-2 px-4 border-r border-white/5">
      <div className="w-5 h-5 rounded-full border border-white/20 flex items-center justify-center">
        <div className="w-2 h-2 rounded-full bg-white/20" />
      </div>
      <span className="text-[11px] font-semibold text-white/80 tracking-wide">TYO</span>
      <span className="text-[10px] text-white/40">Closed</span>
      <span className="text-[10px] text-white/40">21:19</span>
    </div>
    {/* LDN */}
    <div className="flex-1 flex items-center justify-center gap-2 px-4 border-r border-white/5 shadow-[0_0_15px_rgba(34,197,94,0.3)] border-green-500/30">
      <div className="w-5 h-5 rounded-full border border-green-500/50 flex items-center justify-center">
        <div className="w-2 h-2 rounded-full bg-[#22c55e] shadow-[0_0_6px_#22c55e]" />
      </div>
      <span className="text-[11px] font-semibold text-white/80 tracking-wide">LDN</span>
      <span className="text-[10px] text-green-400">Open</span>
      <span className="text-[10px] text-white/40">13:19</span>
    </div>
    {/* NYC */}
    <div className="flex-1 flex items-center justify-center gap-2 px-4 border-r border-white/5 shadow-[0_0_15px_rgba(234,179,8,0.2)] border-yellow-500/30">
      <div className="w-5 h-5 rounded-full border border-yellow-500/50 flex items-center justify-center">
        <div className="w-2 h-2 rounded-full bg-[#eab308] shadow-[0_0_6px_#eab308]" />
      </div>
      <span className="text-[11px] font-semibold text-white/80 tracking-wide">NYC</span>
      <span className="text-[10px] text-yellow-400">Opening soon</span>
      <span className="text-[10px] text-white/40">08:19</span>
    </div>
  </div>
</div>
```

### RIJ 2: TICKER BAR
```jsx
<div className="h-8 flex items-center overflow-x-auto scrollbar-hide bg-[rgba(8,8,8,0.95)] border-b border-white/[0.03]">
  {tickers.map((ticker, i) => (
    <div key={i} className="flex items-center gap-2 px-3 py-1.5 border-r border-white/5 text-[10px] hover:bg-white/[0.02] transition-colors cursor-pointer whitespace-nowrap">
      <span className="text-white/50">{ticker.symbol}</span>
      <span className="text-white/70">{ticker.price}</span>
      <span className={ticker.change.startsWith('+') ? 'text-green-400/80' : 'text-red-400/80'}>
        {ticker.change}
      </span>
    </div>
  ))}
</div>
```

### RIJ 3: MAIN AREA (flex-1 flex)
```jsx
<div className="flex-1 flex overflow-hidden">
```

---

#### LINKS: SIDEBAR (w-56)
```jsx
<div className="w-56 flex-shrink-0 bg-[#0c0c0c]/95 border-r border-white/5 flex flex-col">
  
  {/* Logo */}
  <div className="p-3">
    <div className="flex items-center gap-2">
      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-green-500 flex items-center justify-center shadow-lg shadow-cyan-500/20">
        <span className="text-black font-bold text-sm">T</span>
      </div>
      <span className="font-semibold text-sm tracking-wide">Trading OS</span>
    </div>
  </div>

  {/* CHART Buttons */}
  <div className="px-3 pb-2">
    <div className="flex gap-2">
      <button className="flex-1 btn-cyan py-2 px-3 text-xs">
        <BarChart3 size={14} />
        <span>CHART</span>
      </button>
      <button className="w-8 h-8 btn-cyan p-0 flex items-center justify-center">
        <ExternalLink size={12} />
      </button>
    </div>
  </div>

  {/* Search */}
  <div className="px-3 pb-3">
    <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-white/[0.03] border border-white/5 text-xs text-white/40 hover:bg-white/[0.05] hover:border-white/10 transition-all cursor-text">
      <Search size={12} />
      <span>Add symbol... (e.g. EURUSD)</span>
    </div>
  </div>

  {/* Nav Items */}
  <div className="flex-1 overflow-y-auto py-1">
    {navItems.map((item, i) => (
      <div key={i} className={`sidebar-item ${item.active ? 'active' : ''}`}>
        <item.icon size={16} />
        <span>{item.label}</span>
      </div>
    ))}
  </div>

  {/* Watchlist */}
  <div className="p-3 border-t border-white/5">
    <div className="flex items-center justify-between mb-2">
      <span className="text-[10px] text-white/40 uppercase tracking-wider">MY WATCHLIST</span>
      <span className="text-[10px] text-cyan-400 cursor-pointer hover:underline">Edit</span>
    </div>
    {watchlistCats.map((cat, i) => (
      <div key={i} className="py-1">
        <div className="flex items-center gap-2 text-xs text-white/50 cursor-pointer hover:text-white/70 transition-colors">
          <ChevronRight size={12} className={cat.open ? 'rotate-90' : ''} />
          <span className="font-medium">{cat.name}</span>
          <span className="text-white/30">({cat.count})</span>
          {cat.status === 'open' && (
            <span className="ml-auto text-[9px] text-green-400/80">London Open</span>
          )}
        </div>
      </div>
    ))}
  </div>

  {/* User */}
  <div className="p-3 border-t border-white/5">
    <div className="flex items-center gap-2">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-green-500 flex items-center justify-center">
        <User size={14} className="text-black" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium truncate">Trader</div>
        <div className="text-[10px] text-white/40 truncate">email@example.com</div>
      </div>
      <Settings size={14} className="text-white/40 cursor-pointer hover:text-white/70" />
    </div>
  </div>
</div>
```

---

#### RECHTS: MAIN CONTENT (flex-1 overflow-y-auto bg-[#0a0a0a])

**TOP BAR:**
```jsx
<div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
  
  {/* Links: MAIN + Net Worth + Squawk + Breaking */}
  <div className="flex items-center gap-4">
    
    {/* MAIN badge */}
    <div className="flex items-center gap-2">
      <LayoutDashboard size={14} className="text-white/50" />
      <span className="text-[10px] text-white/40 px-1.5 py-0.5 bg-white/5 rounded">MAIN</span>
    </div>
    
    {/* Total Net Worth */}
    <div className="flex items-center gap-3">
      <DollarSign size={12} className="text-cyan-400" />
      <span className="text-[10px] font-semibold text-white/50">TOTAL NET WORTH</span>
      <span className="text-base font-semibold">$100,000</span>
      <span className="text-[10px] text-green-400/80">Trading Accounts: $100,000</span>
      <span className="text-[10px] text-white/30">Wallets: $0</span>
    </div>
    
    {/* SQUAWK */}
    <div className="flex items-center gap-2 px-3 py-1 border-l border-white/5">
      <Volume2 size={12} className="text-cyan-400" />
      <span className="text-[10px] font-semibold text-cyan-400">SQUAWK</span>
      <span className="text-[10px] text-white/30">IDLE: EURUSD</span>
      <span className="text-[10px] text-white/40 mx-1">Press play to start squawk feed</span>
      <button className="w-5 h-5 rounded bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors ml-1">
        <Play size={10} />
      </button>
      <button className="w-5 h-5 rounded bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors">
        <Volume2 size={10} />
      </button>
    </div>
    
    {/* BREAKING NEWS */}
    <div className="flex items-center gap-2 px-3 py-1 border-l border-r border-white/5">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
      </span>
      <span className="text-[10px] font-semibold text-red-400 tracking-wide">BREAKING</span>
      <div className="overflow-hidden w-48 relative">
        <div className="whitespace-nowrap text-[10px] text-white/50 animate-marquee">
          FED signals rate cut · Oil surges 3% · ECB holds · Bitcoin $75K
        </div>
      </div>
    </div>
  </div>
  
  {/* Rechts: filters + BEGINNER + Synced */}
  <div className="flex items-center gap-2">
    <div className="flex items-center gap-1">
      {['All','Accounts','Wallets','USD','EUR'].map((tab, i) => (
        <button key={tab} className={`px-2 py-0.5 rounded text-[9px] ${i===0 ? 'bg-white/10 text-white/70' : 'text-white/40 hover:text-white/60'}`}>
          {tab}
        </button>
      ))}
    </div>
    <button className="btn-dark text-[10px] px-3 py-1.5">
      <Activity size={11} />
      BEGINNER
    </button>
    <div className="flex items-center gap-1.5 text-[10px]">
      <span className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_4px_#22c55e]" />
      <span className="text-white/50">Synced</span>
    </div>
  </div>
</div>
```

**SYMBOL TABS:**
```jsx
<div className="flex items-center gap-1 px-4 py-2 border-b border-white/5 overflow-x-auto scrollbar-hide">
  {symbolTabs.map((tab, i) => (
    <button key={i} className={`symbol-tag ${tab.active ? 'active' : ''}`}>
      {tab.label}
    </button>
  ))}
  <button className="w-5 h-5 rounded bg-white/5 flex items-center justify-center hover:bg-white/10 ml-1">
    <Plus size={10} />
  </button>
</div>
```

---

**DASHBOARD CONTENT:**
```jsx
<div className="p-4 space-y-3">
```

Hieronder staan alle secties. Elke sectie is een collapsible card.

**GENERIEKE SECTION STRUCTUUR** (geldt voor ALLE secties):
```jsx
// Elke section:
<div className="rounded-lg overflow-hidden bg-gradient-to-b from-white/[0.03] to-transparent">
  
  {/* Header - altijd klikbaar om te togglen */}
  <div 
    className="px-3 py-2 flex items-center justify-between border-b border-white/5 cursor-pointer hover:bg-white/[0.02] transition-colors"
    onClick={() => toggleSection('sectionName')}
  >
    <div className="flex items-center gap-2">
      {/* Icoon + Titel */}
    </div>
    <ChevronUp size={14} className={`text-white/40 transition-transform ${!expanded ? 'rotate-180' : ''}`} />
  </div>
  
  {/* Content - alleen zichtbaar als expanded */}
  {expanded && (
    <div className="p-3">
      {/* content hier */}
    </div>
  )}
</div>
```

---

**1. OVERVIEW SECTION:**

Header: Icoon (vraagteken in cirkel) + "OVERVIEW" + chevron

Content (p-3 space-y-3):
- Welcome: 32px cirkel met cyan icoon + "Good afternoon" + datum info
- 3 tiles (grid-cols-3 gap-3): 
  - Elke tile: stat-box + 32px icoon cirkel + label (9px uppercase) + waarde
  - TODAY'S P&L, WIN RATE, TOTAL TRADES

---

**2. CATEGORIES SECTION:**

Header: "CATEGORIES" + chevron

Content (p-3):
- 6 tiles (grid-cols-6 gap-3)

Elke tile (category-tile):
- Inner div: rounded-lg, p-4, bg-gradient-to-b from-white/[0.04] to-transparent, border

| Categorie | Border kleur | Icoon | Glow hover |
|-----------|-------------|-------|-----------|
| Bonds & Rates | border-cyan-500/50 | Landmark 24px | shadow-[0_0_20px_rgba(6,182,212,0.2)] |
| Crypto | border-purple-500/50 | Bitcoin 24px | shadow-[0_0_20px_rgba(168,85,247,0.2)] |
| Energy | border-orange-500/50 | Zap 24px | shadow-[0_0_20px_rgba(249,115,22,0.2)] |
| Forex | border-green-500/50 | CircleDollarSign 24px | shadow-[0_0_20px_rgba(34,197,94,0.2)] |
| Indices | border-blue-500/50 | TrendingUp 24px | shadow-[0_0_20px_rgba(59,130,246,0.2)] |
| Metals | border-yellow-500/50 | CircleDot 24px | shadow-[0_0_20px_rgba(234,179,8,0.2)] |

Elke tile bevat:
- ChevronRight 16px top-3 right-3, rotate-[-45deg], text-white/20
- Icoon in kleur
- Naam: text-sm font-medium text-white/90
- Count: text-xs text-white/40

---

**3. ACCOUNTS SECTION:**

Header: Wallet icoon + "ACCOUNTS" + "All Accounts" + chevron

Content (p-3): 2 kolommen (grid-cols-2 gap-3)

LINKS - ACCOUNT:
- Rounded-lg, border border-white/5, bg-gradient-to-b from-white/[0.03] to-transparent
- Sub-header: "ACCOUNT" + "Demo Account" badge
- Content: groene dot + "Demo Account — Paper Trading"
- Data rows (flex justify-between text-[10px]): Platform, Balance, Equity (cyan), Free Margin, Margin Level
- Knop: "Reset demo account" (.btn-dark)
- Link: "Manage accounts" (text-cyan-400)

RECHTS - POSITIONS:
- Zelfde card styling
- Sub-header: "POSITIONS" + tabs (Open/History)
- "Account: Demo Account"
- Lege state: icoon + "No open positions"

---

**4. WALLETS SECTION:**

Header: Wallet icoon + "WALLETS" + Plus knop + chevron

Content: Lege state
- Icoon cirkel + "Track Wallet Balances" + beschrijving + "+ Add your first wallet" link

---

**5. STATS SECTION:**

Header: BarChart3 icoon + "STATS" + "Demo Account — Paper Trading" badge + tabs (Today/Week/Month/Custom) + dropdowns

Content (p-4):

A) 12 stat boxes (grid-cols-6 gap-3):
- Elke box: stat-box class
- Labels: text-[9px] text-white/35 uppercase tracking-wider
- Values: text-sm font-semibold text-white/70

Rij 1: WIN RATE, PROFIT FACTOR, AVG WIN, AVG LOSS, TOTAL TRADES, BEST TRADE
Rij 2: WORST TRADE, TOTAL P&L, MAX DRAWDOWN, MONTH P&L, WIN/LOSS DAYS, CONSISTENCY
Alle waarden: "—"

B) CONSISTENCY SCORE (mt-4):
- p-4, bg-gradient-to-b from-[#0d0d0d] to-[#080808], rounded-lg, border border-white/5
- Header: "CONSISTENCY SCORE" + "Warning" badge (bg-yellow-500/20, text-yellow-400)
- Flex gap-8:
  - Links: SVG cirkel (w-16 h-16)
    - Ring 1: rgba(255,255,255,0.08)
    - Ring 2: #eab308, strokeDasharray 65,100
    - Center: "/100"
  - Rechts: 3 stats (Best trade, Worst trade, Max DD)

---

**6. PERFORMANCE SECTION:**

Header: Calendar icoon + "PERFORMANCE" + "Demo Account" + chevron

Content (p-3):
- Maand navigatie: pijl + "April 2026" + pijl
- Dag headers: M T W T F S S (8px, text-white/25)
- Dag blokken (grid-cols-7 gap-1):
  - 44px x 44px, aspect-square
  - Default: bg-white/[0.03], border-white/[0.06], text-white/45
  - Vandaag: bg-[#0a0a0a], border-white/10, text-white/70
  - Profit: bg-green-500/[0.15], border-green-500/30, text-green-400
  - Loss: bg-red-500/[0.15], border-red-500/30, text-red-400

- Bottom: 4 stats (Highest, Lowest, Month P&L, PF)

---

**7. JOURNAL SECTION:**

Header: BookOpen icoon + "JOURNAL" + chevron

Content (p-3):
- Trade Journal sub-header + minimize/close knoppen
- Completion bar: "COMPLETION" + "0%" + progress bar (h-1)

2 Kolommen (grid-cols-3):
- Links (col-span-2): Closed trades lijst, leeg state
- Rechts: Journal Analytics (6 cards gestapeld)
  - Elke card: p-3, bg-gradient-to-b from-white/[0.02] to-transparent, border border-white/5, rounded
  - Cards: TOP TAG, MOST COMMON LOSING TAG, BEST-PERFORMING TAG, AVG PNL, CONSISTENCY SCORE, TAG DISTRIBUTION

---

**8. TOOLS SECTION:**

Header: Wrench icoon + "TOOLS" + "Execution & analysis" + chevron

Content (p-3 space-y-3):

A) CALCULATORS + PODCASTS (grid-cols-2 gap-3):

LINKS: Calculators
- Tabs: Risk:Reward (active), Position Size, Pip Value, Lot Size, Margin, Compound
- Inputs: ENTRY, STOP LOSS, TAKE PROFIT
- Outputs: RISK (rood), REWARD (groen), R:R (cyan), BREAKEVEN

RECHTS: Podcasts
- Podcast tags: Chat With Traders, The Trading Coach, Desire To Trade, Top Traders Unplugged
- Error state: "Page not available" + Home knop

B) COMMUNITY (volle breedte):
- Tabs: Rooms (active, blauw), Messages, Members

---

### EINDE MAIN PAGINA
```

---

## DATASTRUCTUUR (gebruik je eigen data)

```javascript
// Sessions
const sessions = [
  { code: 'SYD', city: 'Sydney', time: '22:19', status: 'closed' },
  { code: 'TYO', city: 'Tokyo', time: '21:19', status: 'closed' },
  { code: 'LDN', city: 'London', time: '13:19', status: 'open' },
  { code: 'NYC', city: 'New York', time: '08:19', status: 'opening-soon' },
];

// Ticker
const tickers = [
  { symbol: 'Nasdaq 100', price: '18,456.32', change: '+0.45%' },
  { symbol: 'GBP/USD', price: '1.2645', change: '+0.12%' },
  { symbol: 'Ethereum', price: '2,375.61', change: '+0.03%' },
  { symbol: 'XRP', price: '1.57', change: '+0.02%' },
  { symbol: 'Dow Jones', price: '38,765.21', change: '-0.08%' },
  { symbol: 'FTSE 100', price: '7,945.12', change: '+0.15%' },
  { symbol: 'Platinum', price: '945.20', change: '+0.32%' },
  { symbol: 'WTI Crude', price: '68.45', change: '+0.47%' },
  { symbol: 'Brent Crude', price: '72.18', change: '+0.57%' },
  { symbol: 'US 2-Year', price: '3.81', change: '+0.00%' },
  { symbol: 'EUR/USD', price: '1.0842', change: '-0.11%' },
  { symbol: 'Gold', price: '2,341.20', change: '+0.54%' },
  { symbol: 'Bitcoin', price: '74,400.76', change: '+0.04%' },
];

// Nav items
const sidebarItems = [
  { icon: LayoutDashboard, label: 'MAIN', active: true },
  { icon: Newspaper, label: 'NEWS' },
  { icon: Target, label: 'INTEL' },
  { icon: PieChart, label: 'ANALYSES' },
  { icon: Flame, label: 'HEATMAP' },
  { icon: Globe, label: 'MACRO TERMINAL' },
  { icon: Cpu, label: 'BIGMAC INDEX' },
  { icon: TrendingUp, label: 'POLYMARKET INTEL' },
  { icon: Calendar, label: 'EARNINGS CALENDAR' },
  { icon: MapPin, label: 'AI DATA CENTER MAP' },
];

// Watchlist
const watchlistCats = [
  { name: 'BONDS', count: 1, open: false, status: 'closed' },
  { name: 'CRYPTO', count: 3, open: true, status: 'open' },
  { name: 'ENERGY', count: 2, open: false, status: 'open' },
  { name: 'FX', count: 2, open: false, status: 'open' },
  { name: 'INDICES', count: 3, open: false, status: 'open' },
  { name: 'METALS', count: 2, open: false, status: 'open' },
];

// Symbol tabs
const symbolTabs = [
  { label: 'ALL', active: false },
  { label: 'EUR/USD', active: false },
  { label: 'GBP/USD', active: false },
  { label: 'Gold', active: false },
  { label: 'Platinum', active: false },
  { label: 'WTI Crude', active: false },
  { label: 'Brent Crude', active: false },
  { label: 'Nasdaq 100', active: false },
  { label: 'Dow Jones', active: false },
  { label: 'FTSE 100', active: false },
  { label: 'US 2-Year', active: true },
  { label: 'Bitcoin', active: false },
  { label: 'Ethereum', active: false },
  { label: 'XRP', active: false },
];

// Stats
const statsData = [
  { label: 'WIN RATE', value: '—' },
  { label: 'PROFIT FACTOR', value: '—' },
  { label: 'AVG WIN', value: '—' },
  { label: 'AVG LOSS', value: '—' },
  { label: 'TOTAL TRADES', value: '—' },
  { label: 'BEST TRADE', value: '—' },
  { label: 'WORST TRADE', value: '—' },
  { label: 'TOTAL P&L', value: '—' },
  { label: 'MAX DRAWDOWN', value: '—' },
  { label: 'MONTH P&L', value: '—' },
  { label: 'WIN / LOSS DAYS', value: '— / —' },
  { label: 'CONSISTENCY', value: '—' },
];
```

---

## STAP 2 PROMPT (na dat MAIN werkt)

Als MAIN correct is, plak dit in Cursor:

```
Nu pas ik de REST van de app aan met dezelfde UI als MAIN:

Kopieer de styling van MAIN naar deze pagina's:
1. NEWS
2. INTEL  
3. ANALYSES
4. HEATMAP
5. MACRO TERMINAL
6. BIGMAC INDEX
7. POLYMARKET INTEL
8. EARNINGS CALENDAR
9. AI DATA CENTER MAP

Regels:
- Houd de session bar en ticker bar exact hetzelfde
- Houd de sidebar exact hetzelfde (zelfde items, zelfde active state)
- Houd de top bar exact hetzelfde
- Gebruik dezelfde card styling: bg-gradient-to-b from-white/[0.03] to-transparent
- Gebruik dezelfde button classes: .btn-cyan en .btn-dark
- Gebruik dezelfde text groottes (9px-14px)
- Achtergrond is ALTIJD #0a0a0a
- Verander ALLEEN de content area, de rest blijft identiek aan MAIN
```

---

EINDE PROMPT
