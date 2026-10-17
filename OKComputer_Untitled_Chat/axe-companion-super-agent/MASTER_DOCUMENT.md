# AXE Companion - AI Trading Assistant
## Complete Super Agent Master Document

> **Version**: 2.0.0 | **Date**: 2026-06-23 | **Status**: Production-Ready
> **For**: Cursor IDE - Complete implementation knowledge base

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current Codebase Architecture](#2-current-codebase-architecture)
3. [Database Schema (Complete)](#3-database-schema-complete)
4. [Feature Roadmap (All PDFs Consolidated)](#4-feature-roadmap-all-pdfs-consolidated)
5. [Module Deep Dive](#5-module-deep-dive)
6. [AI Agents Ecosystem](#6-ai-agents-ecosystem)
7. [Daily Pipeline Flow](#7-daily-pipeline-flow)
8. [API Specification](#8-api-specification)
9. [Implementation Priority Matrix](#9-implementation-priority-matrix)
10. [Technical Debt & Refactoring Plan](#10-technical-debt--refactoring-plan)
11. [Development Guide](#11-development-guide)
12. [CI/CD Pipeline](#12-cicd-pipeline)
13. [Environment Setup](#13-environment-setup)
14. [Testing Strategy](#14-testing-strategy)
15. [Deployment Guide](#15-deployment-guide)

---

## 1. Executive Summary

AXE Companion is an AI-powered trading assistant that learns from user behavior, analyzes alternative data (options flow, dark pool, policy changes), and generates personalized trading insights. The platform targets the $11.5B → $75.5B AI trading market (20.7% CAGR).

### Core Value Propositions
- **Alternative Data Collection**: Options flow, dark pool, policy/regulatory changes - all without paid APIs
- **Personalized Learning Arcs**: AI builds a unique "Trading DNA" profile per user
- **Daily AI Insights**: Embeddings-powered similarity search for relevant market insights
- **Emotionally Intelligent AI**: Detects frustration, overconfidence, revenge trading
- **Gamified Learning**: Trading mastery path with XP, badges, leaderboards

### Current Implementation Status
| Component | Status | File |
|-----------|--------|------|
| Data Collectors (Options/Policy/DarkPool) | Complete | `lib/data/collectors/` |
| Database Schema (9 tables) | Complete | `supabase/migrations/` |
| Embedding Generator | Complete | `lib/ai/processors/embeddings.py` |
| Learning Arc Manager | Complete | `lib/ai/processors/learning_arc.py` |
| Insights Generator | Complete | `lib/ai/processors/insights.py` |
| Daily Pipeline | Complete | `lib/scheduler/daily_learning_pipeline.py` |
| Configuration System | Complete | `config/settings.py` |
| **Adaptive UI Engine** | **Planned** | See Section 4 |
| **AI Agent Ecosystem** | **Planned** | See Section 6 |
| **Gamification System** | **Planned** | See Section 4 |
| **Voice Trading** | **Planned** | See Section 4 |
| **Predictive Analytics** | **Planned** | See Section 4 |

---

## 2. Current Codebase Architecture

### 2.1 File Structure

```
ai-trading-assistant/
|__ .env                          # Environment variables
|__ requirements.txt              # Python dependencies
|__ setup.py                      # Package setup
|__ config/
|   |__ __init__.py
|   |__ api_keys.py               # API key management
|   |__ settings.py               # Centralized configuration
|__ lib/
|   |__ __init__.py
|   |__ data/
|   |   |__ __init__.py
|   |   |__ collectors/
|   |   |   |__ __init__.py
|   |   |   |__ market_data.py
|   |   |   |__ news_aggregator.py
|   |   |   |__ insider_data.py
|   |   |   |__ options_flow_free.py      # Yahoo Finance, Finviz, Reddit
|   |   |   |__ policy_flow_free.py       # GovTrack, Federal Register
|   |   |   |__ dark_pool_free.py         # TradingView, Yahoo Finance
|   |   |   |__ alternative_data_free.py  # Orchestrator
|   |   |__ processors/
|   |       |__ __init__.py
|   |       |__ data_cleaner.py
|   |       |__ data_filter.py
|   |__ ai/
|   |   |__ __init__.py
|   |   |__ processors/
|   |   |   |__ __init__.py
|   |   |   |__ embeddings.py           # OpenAI embeddings
|   |   |   |__ learning_arc.py         # User behavior analysis
|   |   |   |__ insights.py             # Insight generation
|   |   |__ analyzers/
|   |       |__ __init__.py
|   |       |__ pattern_analyzer.py
|   |       |__ anomaly_detector.py
|   |__ scheduler/
|   |   |__ __init__.py
|   |   |__ daily_learning_pipeline.py  # Main orchestrator
|   |   |__ scheduler.py                # APScheduler config
|   |__ notifications/
|   |   |__ __init__.py
|   |   |__ daily_briefing.py           # Daily notifications
|   |__ utils/
|       |__ __init__.py
|       |__ helpers.py
|       |__ validators.py
|__ supabase/
|   |__ migrations/                     # SQL migrations
|   |   |__ 001_create_users.sql
|   |   |__ 002_create_trades.sql
|   |   |__ 003_create_learning_arcs.sql
|   |   |__ 004_create_dark_pool.sql
|   |   |__ 005_create_options_flow.sql
|   |   |__ 006_create_policy_flow.sql
|   |   |__ 007_create_knowledge_embeddings.sql
|   |__ seed_data/
|       |__ sample_data.sql
|__ tests/
|   |__ test_collectors.py
|   |__ test_processors.py
|   |__ test_pipeline.py
|__ docs/
    |__ API_GUIDE.md
    |__ DATABASE_SCHEMA.md
    |__ DEPLOYMENT.md
    |__ TROUBLESHOOTING.md
```

### 2.2 Class Hierarchy

```
Config                              # Central configuration (env vars)
|
|-- DatabaseSchema                  # SQL migration generator
|
|-- OptionsFlowCollector            # Options data (async context manager)
|   |-- fetch_yahoo_finance_options()
|   |-- fetch_finviz_options()
|   |-- fetch_reddit_options()
|   |-- filter_unusual_options()
|
|-- PolicyFlowCollector             # Policy data (async context manager)
|   |-- fetch_govtrack_bills()
|   |-- fetch_federal_register()
|   |-- _determine_relevant_sectors()
|   |-- _calculate_impact_score()
|
|-- DarkPoolCollector               # Dark pool data (async context manager)
|   |-- fetch_tradingview_dark_pool()
|   |-- fetch_yahoo_finance_dark_pool()
|   |-- filter_large_blocks()
|   |-- analyze_institutional_flow()
|
|-- AlternativeDataCollector        # Orchestrator (no state)
|   |-- collect_all_alternative_data()  # Runs all collectors
|
|-- EmbeddingGenerator              # OpenAI embeddings
|   |-- generate_embeddings()
|   |-- store_embeddings()
|   |-- generate_and_store()
|
|-- LearningArcManager              # User behavior analysis
|   |-- get_learning_arc()
|   |-- update_trading_style()
|   |-- update_performance_metrics()
|   |-- _calculate_*()              # 10+ analysis methods
|
|-- InsightsGenerator               # Daily insight generation
|   |-- generate_daily_insights()
|   |-- generate_market_insights()
|   |-- generate_opportunities()
|   |-- generate_risk_alerts()
|   |-- generate_learning_recommendations()
|
|-- DailyLearningPipeline           # Main orchestrator
    |-- run_daily_pipeline()        # 4-phase pipeline
    |-- collect_all_data()          # Phase 1
    |-- process_with_ai()           # Phase 2
    |-- update_learning_arc()       # Phase 3
    |-- generate_daily_insights()   # Phase 4
    |-- start_scheduler()           # APScheduler
    |-- run_for_all_users()         # Batch processing
```

### 2.3 Data Flow

```
[User Trades] ──→ [Supabase: trades table]
                        │
                        ▼
[Collectors] ──→ [Raw Data] ──→ [Supabase: options_flow, dark_pool_trades, legislation]
   │                                                      │
   ▼                                                      ▼
[OpenAI] ──→ [Embeddings] ──→ [Supabase: knowledge_embeddings]
   │
   ▼
[LearningArcManager] ──→ [Supabase: learning_arcs]
   │
   ▼
[InsightsGenerator] ──→ [Daily Briefing] ──→ [User Notification]
```

---

## 3. Database Schema (Complete)

### 3.1 Core Tables

```sql
-- Table: users
CREATE TABLE IF NOT EXISTS users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_users_email ON users(email);

-- Table: trades
CREATE TABLE IF NOT EXISTS trades (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    symbol VARCHAR(20) NOT NULL,
    entry_date DATE NOT NULL,
    exit_date DATE,
    entry_price DECIMAL(15, 4),
    exit_price DECIMAL(15, 4),
    position_size INTEGER,
    return_pct DECIMAL(10, 4),
    stop_loss DECIMAL(15, 4),
    take_profit DECIMAL(15, 4),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_trades_user_id ON trades(user_id);
CREATE INDEX idx_trades_symbol ON trades(symbol);
CREATE INDEX idx_trades_entry_date ON trades(entry_date DESC);

-- Table: learning_arcs
CREATE TABLE IF NOT EXISTS learning_arcs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    trading_style JSONB,           -- {frequency, hold_time, risk_level, preferred_assets, time_of_day, position_sizing, stop_loss_usage}
    behavioral_patterns JSONB,     -- {loss_aversion, overconfidence, recency_bias, anchoring, herding, disposition_effect}
    knowledge_base JSONB,          -- {learned_concepts, mastered_concepts, struggling_concepts, knowledge_gaps}
    trading_patterns JSONB,        -- {successful_patterns, unsuccessful_patterns, best_conditions, worst_conditions}
    performance_metrics JSONB,     -- {total_trades, win_rate, avg_return, max_drawdown, sharpe_ratio}
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_learning_arcs_user_id ON learning_arcs(user_id);

-- Table: dark_pool_trades
CREATE TABLE IF NOT EXISTS dark_pool_trades (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    exchange VARCHAR(50),
    price DECIMAL(15, 4),
    volume BIGINT,
    timestamp TIMESTAMPTZ NOT NULL,
    trade_type VARCHAR(20),
    source VARCHAR(50),
    raw_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_dark_pool_symbol ON dark_pool_trades(symbol);
CREATE INDEX idx_dark_pool_timestamp ON dark_pool_trades(timestamp DESC);
CREATE INDEX idx_dark_pool_volume ON dark_pool_trades(volume DESC);

-- Table: dark_pool_summary
CREATE TABLE IF NOT EXISTS dark_pool_summary (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    date DATE NOT NULL,
    total_volume BIGINT,
    total_trades INTEGER,
    avg_price DECIMAL(15, 4),
    buy_volume BIGINT,
    sell_volume BIGINT,
    unusual_activity BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(symbol, date)
);
CREATE INDEX idx_dark_pool_summary_symbol_date ON dark_pool_summary(symbol, date DESC);

-- Table: options_flow
CREATE TABLE IF NOT EXISTS options_flow (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    option_type VARCHAR(10),
    strike_price DECIMAL(15, 4),
    expiration_date DATE,
    volume BIGINT,
    open_interest BIGINT,
    implied_volatility DECIMAL(10, 4),
    last_price DECIMAL(15, 4),
    timestamp TIMESTAMPTZ NOT NULL,
    source VARCHAR(50),
    unusual_activity BOOLEAN DEFAULT FALSE,
    raw_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_options_flow_symbol ON options_flow(symbol);
CREATE INDEX idx_options_flow_timestamp ON options_flow(timestamp DESC);
CREATE INDEX idx_options_flow_unusual ON options_flow(unusual_activity, timestamp DESC);
CREATE INDEX idx_options_flow_expiration ON options_flow(expiration_date);

-- Table: options_flow_summary
CREATE TABLE IF NOT EXISTS options_flow_summary (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    date DATE NOT NULL,
    total_call_volume BIGINT,
    total_put_volume BIGINT,
    call_put_ratio DECIMAL(10, 4),
    unusual_call_count INTEGER,
    unusual_put_count INTEGER,
    max_iv_change DECIMAL(10, 4),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(symbol, date)
);
CREATE INDEX idx_options_summary_symbol_date ON options_flow_summary(symbol, date DESC);

-- Table: legislation
CREATE TABLE IF NOT EXISTS legislation (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    bill_id VARCHAR(50) UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    sponsor VARCHAR(100),
    chamber VARCHAR(20),
    status VARCHAR(50),
    introduced_date DATE,
    last_action_date DATE,
    relevant_sectors TEXT[],
    impact_score INTEGER,
    raw_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_legislation_status ON legislation(status);
CREATE INDEX idx_legislation_sectors ON legislation USING GIN(relevant_sectors);
CREATE INDEX idx_legislation_impact ON legislation(impact_score DESC);

-- Table: regulatory_changes
CREATE TABLE IF NOT EXISTS regulatory_changes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    regulation_id VARCHAR(50) UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    agency VARCHAR(100),
    type VARCHAR(50),
    publication_date DATE,
    effective_date DATE,
    comment_deadline DATE,
    relevant_sectors TEXT[],
    impact_score INTEGER,
    raw_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_regulatory_agency ON regulatory_changes(agency);
CREATE INDEX idx_regulatory_sectors ON regulatory_changes USING GIN(relevant_sectors);
CREATE INDEX idx_regulatory_impact ON regulatory_changes(impact_score DESC);

-- Table: knowledge_embeddings (requires pgvector extension)
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE IF NOT EXISTS knowledge_embeddings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50),
    content TEXT,
    embedding VECTOR(1536),
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_knowledge_embeddings_user_id ON knowledge_embeddings(user_id);
CREATE INDEX idx_knowledge_embeddings_type ON knowledge_embeddings(type);
CREATE INDEX idx_knowledge_embeddings_embedding ON knowledge_embeddings USING ivfflat (embedding vector_cosine_ops);

-- Table: watchlists
CREATE TABLE IF NOT EXISTS watchlists (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    symbol VARCHAR(20) NOT NULL,
    added_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, symbol)
);
CREATE INDEX idx_watchlists_user_id ON watchlists(user_id);
CREATE INDEX idx_watchlists_symbol ON watchlists(symbol);

-- Table: user_preferences
CREATE TABLE IF NOT EXISTS user_preferences (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    notification_enabled BOOLEAN DEFAULT TRUE,
    notification_email_enabled BOOLEAN DEFAULT TRUE,
    notification_push_enabled BOOLEAN DEFAULT TRUE,
    notification_time VARCHAR(10) DEFAULT '08:00',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_user_preferences_user_id ON user_preferences(user_id);
```

### 3.2 Migration Order
1. `001_create_users.sql` - Users table first (other tables reference it)
2. `002_create_trades.sql` - Trades table
3. `003_create_learning_arcs.sql` - Learning arcs
4. `004_create_dark_pool.sql` - Dark pool tables
5. `005_create_options_flow.sql` - Options flow tables
6. `006_create_policy_flow.sql` - Policy tables
7. `007_create_knowledge_embeddings.sql` - Embeddings (needs pgvector)

---

## 4. Feature Roadmap (All PDFs Consolidated)

### 4.1 Feature Categories Summary

| Category | Features | Priority | Effort |
|----------|----------|----------|--------|
| **AI Core** | Predictive Analytics, Adaptive UI, AI Agents | P0 | High |
| **Gamification** | XP System, Badges, Leaderboards, Challenges | P0 | Medium |
| **Data Sources** | Polymarket Integration, Dark Pool, Options Flow | P1 | Medium |
| **Engagement** | Voice Trading, Emotional AI, Social Trading | P1 | High |
| **Growth** | Referral Program, Smart Onboarding | P2 | Medium |
| **Monetization** | Dynamic Pricing, Tiered Premium | P2 | Low |
| **Analytics** | Enterprise Dashboard, Performance Attribution | P1 | High |

### 4.2 Detailed Feature Specifications

#### 4.2.1 AI-Powered Adaptive Interface (P0)

**What**: Interface that automatically adapts to user's trading style and preferences.

**Implementation**:
- Data collection points:
  - Trading session times (London: 08:00-16:00, NY: 14:00-22:00)
  - Preferred currency pairs (EURUSD, GBPUSD, XAUUSD)
  - Chart timeframes (Scalper: 1m/5m, Day trader: 15m/1H, Swing: 4H/Daily)
  - Risk profile (Conservative: max 1%/trade, Aggressive: 5%+/trade)
  - Indicator preferences (RSI, MACD, Moving Averages)
  - Common mistakes (over-trading, revenge trading)

- Adaptive behaviors:
  - Dashboard shows relevant pairs based on session time
  - Chart defaults to preferred timeframes
  - Risk tools prominence matches risk profile
  - Interface calms after losing streaks
  - Notifications frequency adapts to user preference

**Code Pattern**:
```python
class AdaptiveUI:
    def __init__(self, user_id: str):
        self.user_id = user_id
        self.user_data = self.collect_user_data()
        self.patterns = self.analyze_patterns()
    
    def collect_user_data(self) -> Dict:
        # Aggregate from learning_arcs, trades, preferences
        pass
    
    def analyze_patterns(self) -> Dict:
        # Pattern recognition on user behavior
        pass
    
    def adapt_interface(self) -> Dict:
        # Return UI configuration based on patterns
        return {
            'dashboard_pairs': self.get_preferred_pairs(),
            'default_timeframes': self.get_preferred_timeframes(),
            'indicators': self.get_preferred_indicators(),
            'risk_tools_position': self.get_risk_profile(),
            'notification_frequency': self.get_notification_preference(),
            'color_scheme': self.get_preferred_theme()
        }
```

#### 4.2.2 Gamified Trading Mastery (P0)

**What**: Trading gamification system to boost Day 30 retention from 14% to 40%+.

**Components**:
1. **Trading Levels**: Beginner → Scalper → Day Trader → Swing Trader → Master Trader
2. **Achievement Badges**: "First Profitable Week", "10 Win Streak", "Risk Management Master"
3. **XP System**: Earn XP for trades, journal entries, learning modules completion
4. **Leaderboards**: "Top Traders of the Week" (anonymous or public)
5. **Daily Challenges**: "Trade with 1:2 R/R ratio today", "No over-trading today"
6. **Trading Mastery Path**: AI generates personalized challenges based on weak points

**Database Additions**:
```sql
-- gamification_stats table
CREATE TABLE gamification_stats (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    current_level VARCHAR(20) DEFAULT 'beginner',
    total_xp INTEGER DEFAULT 0,
    weekly_xp INTEGER DEFAULT 0,
    streak_days INTEGER DEFAULT 0,
    badges JSONB DEFAULT '[]',
    challenges_completed JSONB DEFAULT '[]',
    leaderboard_rank INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- achievements table
CREATE TABLE achievements (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    achievement_id VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    icon_url VARCHAR(255),
    xp_reward INTEGER DEFAULT 0,
    requirement_type VARCHAR(50),
    requirement_value JSONB,
    rarity VARCHAR(20) DEFAULT 'common'
);

-- user_achievements table
CREATE TABLE user_achievements (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    achievement_id UUID REFERENCES achievements(id),
    earned_at TIMESTAMPTZ DEFAULT NOW(),
    progress JSONB DEFAULT '{}'
);
```

#### 4.2.3 AI Agent Ecosystem (P1)

**What**: Multiple specialized AI agents that collaborate.

**Agents**:
1. **MarketAnalystAgent**: Analyzes markets and generates trade setups
2. **RiskManagerAgent**: Monitors risk and warns of danger
3. **JournalingAgent**: Auto-journaling with AI insights
4. **LearningAgent**: Personalized learning arc per user
5. **StrategyAgent**: Backtest and optimize strategies
6. **TradingCouncil**: Multi-agent consensus system

**Architecture**:
```python
from abc import ABC, abstractmethod
from typing import List, Dict, Any

class BaseAgent(ABC):
    """Base class for all AI agents"""
    
    def __init__(self, name: str, supabase_client):
        self.name = name
        self.supabase = supabase_client
        self.memory: List[Dict] = []
    
    @abstractmethod
    async def analyze(self, context: Dict[str, Any]) -> Dict:
        """Main analysis method"""
        pass
    
    @abstractmethod
    async def generate_recommendation(self, analysis: Dict) -> Dict:
        """Generate recommendation from analysis"""
        pass
    
    async def collaborate(self, other_agent_outputs: List[Dict]) -> Dict:
        """Collaborate with other agents (default: merge)"""
        return {
            'agent': self.name,
            'consensus': True,
            'outputs': other_agent_outputs
        }

class MarketAnalystAgent(BaseAgent):
    """Analyzes market data and generates trade setups"""
    
    async def analyze(self, context: Dict) -> Dict:
        symbol = context.get('symbol')
        timeframe = context.get('timeframe', '1H')
        
        # Fetch market data
        # Analyze patterns
        # Generate setup
        return {
            'setup': 'long',
            'entry': 1.0850,
            'stop_loss': 1.0820,
            'take_profit': 1.0900,
            'confidence': 0.78,
            'reasoning': ['Bullish engulfing', 'RSI oversold bounce']
        }

class RiskManagerAgent(BaseAgent):
    """Monitors risk and warns of danger"""
    
    async def analyze(self, context: Dict) -> Dict:
        user_id = context.get('user_id')
        
        # Get user's risk profile
        # Analyze open positions
        # Calculate exposure
        return {
            'total_exposure': 0.05,  # 5% of account
            'max_position_size': 0.02,
            'warning': 'Approaching daily loss limit',
            'recommended_action': 'reduce_position_size'
        }

class TradingCouncil:
    """Multi-agent consensus system"""
    
    def __init__(self, agents: List[BaseAgent]):
        self.agents = agents
    
    async def reach_consensus(self, context: Dict) -> Dict:
        # Run all agents in parallel
        analyses = await asyncio.gather(*[
            agent.analyze(context) for agent in self.agents
        ])
        
        # Weighted consensus
        # Return unified recommendation
        return {
            'consensus_recommendation': 'proceed_with_caution',
            'confidence': 0.72,
            'agent_votes': analyses,
            'warnings': []
        }
```

#### 4.2.4 Voice-First Trading Experience (P1)

**What**: Full voice control for hands-free trading.

**Voice Commands**:
- "AI, open a long position on EURUSD with 0.1 lots"
- "AI, what's my current P&L?"
- "AI, close all profitable positions"
- "AI, analyze my last trade"
- "AI, show me the best setups for today"

**Implementation**: Integrate speech-to-text (Whisper API) + natural language understanding (GPT-4) + text-to-speech for responses.

#### 4.2.5 Emotionally Intelligent AI (P1)

**What**: AI that recognizes emotional state and advises accordingly.

**Detection Signals**:
- 3 consecutive losses → "You seem frustrated, take a 30-minute break"
- 7-day win streak → "Congratulations! But watch for overconfidence"
- Trading outside normal hours → "This isn't your best time, be careful"
- Position size 2x normal → "This is twice your usual size, are you sure?"
- Trading frequency spike → "You might be over-trading, slow down"

**Implementation**:
```python
class EmotionalAI:
    """Emotional state detection and intervention"""
    
    async def detect_emotional_state(self, user_id: str) -> Dict:
        recent_trades = await self.get_recent_trades(user_id, limit=20)
        
        signals = {
            'frustration': self._detect_frustration(recent_trades),
            'overconfidence': self._detect_overconfidence(recent_trades),
            'revenge_trading': self._detect_revenge_trading(recent_trades),
            'fatigue': self._detect_fatigue(recent_trades),
        }
        
        return {
            'dominant_emotion': max(signals, key=signals.get),
            'intensity': signals[max(signals, key=signals.get)],
            'signals': signals,
            'recommended_action': self._get_intervention(signals)
        }
```

#### 4.2.6 Predictive Analytics Engine (P0)

**What**: AI that predicts with confidence scores.

**Capabilities**:
- Pattern recognition: "Based on 10,000+ similar setups, this trade has 78% win probability"
- Volatility prediction: "Predicted volatility for EURUSD today: 45 pips (normal: 30)"
- Market regime detection: "We're in a trending market → focus on breakout strategies"
- Correlation alerts: "XAUUSD and USD Index move inversely (-0.87) → hedge your positions"

#### 4.2.7 Enterprise Analytics Dashboard (P1)

**What**: Advanced analytics for institutional-grade insights.

**Features**:
- Multi-timeframe analysis: Automatic correlation of 1m, 5m, 15m, 1H, 4H, Daily
- Heatmap visualization: "Which pairs have the best setups today?"
- Performance attribution: "Your profit mainly comes from London session (67%)"
- Risk analytics: VaR calculation, drawdown analysis, Sharpe ratio
- Executive summary: Daily AI-generated trading performance report

#### 4.2.8 Smart Onboarding Flow (P1)

**What**: Personalized onboarding to reduce 73% drop-off.

**Flow**:
1. Trading Style Quiz: "Are you a scalper, day trader, or swing trader?"
2. Progressive disclosure: Show features based on experience
3. Quick wins: "First trade within 5 minutes with guided setup"
4. AI-powered tutorial: "Let me guide you through your first trade"
5. Trading DNA Discovery: AI builds profile during onboarding

#### 4.2.9 Polymarket Integration (P1)

**What**: Real-time prediction market odds for trading decisions.

**Features**:
- Fed rate odds widget: "Fed July 2026: 72% no change, 27% +25bps"
- AI analysis: "Polymarket predicts stable rates → EURUSD bullish setup"
- Trading alerts: "Polymarket sentiment shifting → Position for USD weakness"
- Historical correlation: "Polymarket odds vs actual Fed decisions: 89% accuracy"

#### 4.2.10 Growth Engine - Viral Referral Program (P2)

**What**: User acquisition strategy to lower CAC from $1,450 to <$100.

**Mechanics**:
- "Refer 3 friends → 1 month free premium"
- "Your friend gets 2 weeks free premium"
- "Top 5 referrers per month → Lifetime premium + exclusive features"
- Trading streak challenge: "7-day win streak → Share with friends → Both get reward"

#### 4.2.11 Monetization 2.0 - Dynamic Pricing (P2)

**Pricing Tiers**:
- **Free**: Basic features, limited daily insights
- **Basic**: €29/month - Full insights, learning arcs
- **Pro**: €79/month - AI agents, predictive analytics
- **Elite**: €199/month - Enterprise dashboard, priority support

---

## 5. Module Deep Dive

### 5.1 OptionsFlowCollector

**Purpose**: Collects options flow data from free sources.

**Sources**:
| Source | URL | Data |
|--------|-----|------|
| Yahoo Finance | `finance.yahoo.com/quote/{symbol}/options` | Price, volume, OI, IV |
| Finviz | `finviz.com/quote.ashx?t={symbol}&p=options` | Price, change, volume |
| Reddit r/options | `reddit.com/r/options/hot.json` | Sentiment, mentions |

**Key Method**: `filter_unusual_options()`
- Volume > 2x Open Interest → unusual
- Volume > 1000 contracts → unusual

### 5.2 PolicyFlowCollector

**Purpose**: Collects policy and regulatory data.

**Sources**:
| Source | URL | Data |
|--------|-----|------|
| GovTrack | `govtrack.us/api/v2/bill` | Bills, sponsors, status |
| Federal Register | `federalregister.gov/api/v1/documents` | Regulations, agencies |

**Sector Detection**: 7 sectors (finance, crypto, energy, technology, healthcare, agriculture, defense)
**Impact Scoring**: 1-10 scale based on cosponsors, status, document type

### 5.3 DarkPoolCollector

**Purpose**: Collects dark pool trading data.

**Sources**:
| Source | URL | Data |
|--------|-----|------|
| TradingView | `tradingview.com/symbols/{symbol}/technicals/` | Volume indicators |
| Yahoo Finance | `finance.yahoo.com/quote/{symbol}/key-statistics` | Avg volume |

**Key Method**: `filter_large_blocks(threshold=10000)`

### 5.4 LearningArcManager

**Purpose**: Builds and maintains user trading profiles.

**Trading Style Analysis**:
- Frequency: low (<10 trades), medium (10-50), high (50+)
- Hold time: day trading (<1d), swing (1-7d), position (7d+)
- Risk level: low (<2% vol), moderate (2-5%), high (>5%)
- Preferred assets: Top 5 by trade count
- Time of day: morning (<12h), afternoon (12-16h), evening (16h+)
- Position sizing: consistent (<20% std dev), variable (>20%)
- Stop loss usage: always (>80%), frequently (50-80%), rarely (<50%)

**Behavioral Biases Tracked**:
- Loss aversion
- Overconfidence
- Recency bias
- Anchoring
- Herding
- Disposition effect

### 5.5 EmbeddingGenerator

**Purpose**: Generates and stores vector embeddings for similarity search.

**Model**: `text-embedding-3-small` (1536 dimensions)
**Storage**: Supabase `knowledge_embeddings` with `ivfflat` index
**Types**: news, policy, market_analysis, trade_notes

---

## 6. AI Agents Ecosystem

### 6.1 Planned Agent Architecture

```
TradingCouncil (orchestrator)
|
|-- MarketAnalystAgent
|   |-- Technical analysis
|   |-- Setup generation
|   |-- Confidence scoring
|
|-- RiskManagerAgent
|   |-- Position sizing
|   |-- Exposure monitoring
|   |-- Loss limit alerts
|
|-- JournalingAgent
|   |-- Auto-trade logging
|   |-- Pattern detection
|   |-- Performance tracking
|
|-- LearningAgent
|   |-- Knowledge gap analysis
|   |-- Personalized content
|   |-- Progress tracking
|
|-- StrategyAgent
|   |-- Backtesting
|   |-- Strategy optimization
|   |-- Parameter tuning
|
|-- EmotionalAI (special)
    |-- State detection
    |-- Intervention suggestions
    |-- Break recommendations
```

### 6.2 Agent Communication Protocol

```python
@dataclass
class AgentMessage:
    from_agent: str
    to_agent: str
    message_type: str  # 'analysis', 'alert', 'recommendation', 'question'
    content: Dict
    timestamp: datetime
    priority: int  # 1-5, 5 being highest

class AgentBus:
    """Message bus for inter-agent communication"""
    
    def __init__(self):
        self.subscribers: Dict[str, List[Callable]] = {}
        self.message_log: List[AgentMessage] = []
    
    def subscribe(self, agent_name: str, handler: Callable):
        if agent_name not in self.subscribers:
            self.subscribers[agent_name] = []
        self.subscribers[agent_name].append(handler)
    
    async def publish(self, message: AgentMessage):
        self.message_log.append(message)
        handlers = self.subscribers.get(message.to_agent, [])
        for handler in handlers:
            await handler(message)
```

---

## 7. Daily Pipeline Flow

### 7.1 Pipeline Schedule (06:00 CET)

```
06:00 - Phase 1: Data Collection
  |-- Options flow collection (all watchlist symbols)
  |-- Policy flow collection (latest bills & regulations)
  |-- Dark pool collection (all watchlist symbols)
  |-- Duration: ~15-30 minutes

06:30 - Phase 2: AI Processing
  |-- Generate embeddings for new data
  |-- Store embeddings in Supabase
  |-- Pattern analysis (placeholder)
  |-- Anomaly detection (placeholder)
  |-- Duration: ~10-15 minutes

06:45 - Phase 3: Learning Arc Update
  |-- Update trading style for each user
  |-- Update performance metrics
  |-- Detect behavioral pattern changes
  |-- Duration: ~5-10 minutes

06:55 - Phase 4: Insight Generation
  |-- Generate market insights per user
  |-- Find trading opportunities
  |-- Generate risk alerts
  |-- Create learning recommendations
  |-- Duration: ~5 minutes

07:00 - Notification Delivery
  |-- Send daily briefing to each user
  |-- Push notifications for urgent alerts
  |-- Email summary
```

### 7.2 Pipeline Code Flow

```python
async def run_daily_pipeline(self, user_id: str, symbols: List[str]) -> Dict:
    # Phase 1: Data Collection
    data_collection = await self.collect_all_data(symbols)
    
    # Phase 2: AI Processing
    ai_results = await self.process_with_ai(data_collection, user_id)
    
    # Phase 3: Learning Arc Update
    learning_update = await self.update_learning_arc(user_id, ai_results)
    
    # Phase 4: Generate Insights
    insights = await self.generate_daily_insights(user_id, ai_results)
    
    return {
        'user_id': user_id,
        'duration': duration,
        'data_collection': data_collection,
        'ai_results': ai_results,
        'learning_update': learning_update,
        'insights': insights
    }
```

---

## 8. API Specification

### 8.1 RESTful Endpoints (Planned FastAPI Backend)

#### Authentication
```
POST   /api/v1/auth/register          # User registration
POST   /api/v1/auth/login             # User login
POST   /api/v1/auth/refresh           # Refresh token
DELETE /api/v1/auth/logout            # User logout
```

#### User Management
```
GET    /api/v1/users/me               # Get current user
PUT    /api/v1/users/me               # Update user profile
GET    /api/v1/users/me/preferences   # Get user preferences
PUT    /api/v1/users/me/preferences   # Update preferences
```

#### Trades
```
GET    /api/v1/trades                 # List user trades
POST   /api/v1/trades                 # Create trade
GET    /api/v1/trades/{id}            # Get trade detail
PUT    /api/v1/trades/{id}            # Update trade
DELETE /api/v1/trades/{id}            # Delete trade
GET    /api/v1/trades/stats           # Trade statistics
```

#### Watchlist
```
GET    /api/v1/watchlist              # Get watchlist
POST   /api/v1/watchlist              # Add symbol
DELETE /api/v1/watchlist/{symbol}     # Remove symbol
```

#### Data Collection
```
POST   /api/v1/collect/options        # Trigger options collection
POST   /api/v1/collect/policy         # Trigger policy collection
POST   /api/v1/collect/darkpool       # Trigger dark pool collection
POST   /api/v1/collect/all            # Trigger all collections
```

#### Insights
```
GET    /api/v1/insights/daily         # Get daily insights
GET    /api/v1/insights/market       # Get market insights
GET    /api/v1/insights/opportunities # Get trading opportunities
GET    /api/v1/insights/risks        # Get risk alerts
GET    /api/v1/insights/learning     # Get learning recommendations
```

#### Learning Arc
```
GET    /api/v1/learning-arc          # Get learning arc
POST   /api/v1/learning-arc/update   # Update learning arc
GET    /api/v1/learning-arc/style    # Get trading style
GET    /api/v1/learning-arc/performance # Get performance metrics
```

#### Gamification
```
GET    /api/v1/gamification/stats     # Get gamification stats
GET    /api/v1/gamification/badges   # Get user badges
GET    /api/v1/gamification/leaderboard # Get leaderboard
POST   /api/v1/gamification/challenge/complete # Complete challenge
```

#### AI Agents
```
POST   /api/v1/agents/market/analyze  # Run market analysis
POST   /api/v1/agents/risk/analyze   # Run risk analysis
POST   /api/v1/agents/journal/entry   # Create journal entry
POST   /api/v1/agents/council/consensus # Get council consensus
```

#### Embeddings / Search
```
POST   /api/v1/embeddings/search     # Semantic search
POST   /api/v1/embeddings/store      # Store embedding
GET    /api/v1/embeddings/similar    # Find similar content
```

### 8.2 WebSocket Endpoints

```
WS     /ws/v1/market-data           # Real-time market data stream
WS     /ws/v1/alerts               # Real-time alert stream
WS     /ws/v1/voice                # Voice trading session
```

### 8.3 Response Format

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "2026-06-23T10:00:00Z",
    "request_id": "uuid",
    "latency_ms": 145
  }
}
```

### 8.4 Error Format

```json
{
  "success": false,
  "error": {
    "code": "INVALID_SYMBOL",
    "message": "The symbol 'XYZ' is not supported",
    "details": { ... }
  },
  "meta": {
    "timestamp": "2026-06-23T10:00:00Z",
    "request_id": "uuid"
  }
}
```

---

## 9. Implementation Priority Matrix

### 9.1 Priority Definitions
- **P0 (Critical)**: Core functionality, must have for MVP
- **P1 (High)**: Important features, should have for v1.0
- **P2 (Medium)**: Nice to have, can be deferred
- **P3 (Low)**: Future enhancements

### 9.2 Sprint Planning

#### Sprint 1 (Week 1-2): Foundation
| Task | Priority | Effort | Status |
|------|----------|--------|--------|
| Database schema setup | P0 | 1 day | Complete |
| Data collectors (Options/Policy/DarkPool) | P0 | 3 days | Complete |
| Basic embedding generation | P0 | 2 days | Complete |
| Daily pipeline orchestration | P0 | 2 days | Complete |
| Configuration system | P0 | 1 day | Complete |

#### Sprint 2 (Week 3-4): AI Core
| Task | Priority | Effort | Status |
|------|----------|--------|--------|
| Learning arc manager | P0 | 3 days | Complete |
| Insights generator | P0 | 2 days | Complete |
| Trading style detection | P0 | 2 days | Complete |
| Behavioral pattern analysis | P1 | 2 days | Partial |
| Performance metrics | P1 | 1 day | Complete |

#### Sprint 3 (Week 5-6): API & Frontend
| Task | Priority | Effort | Status |
|------|----------|--------|--------|
| FastAPI backend setup | P0 | 2 days | Planned |
| Authentication (Supabase Auth) | P0 | 2 days | Planned |
| REST API endpoints | P0 | 3 days | Planned |
| Frontend React app | P0 | 3 days | Planned |
| WebSocket real-time | P1 | 2 days | Planned |

#### Sprint 4 (Week 7-8): Gamification & Engagement
| Task | Priority | Effort | Status |
|------|----------|--------|--------|
| XP system | P0 | 2 days | Planned |
| Achievement badges | P0 | 2 days | Planned |
| Trading levels | P0 | 1 day | Planned |
| Leaderboards | P1 | 2 days | Planned |
| Daily challenges | P1 | 2 days | Planned |

#### Sprint 5 (Week 9-10): Advanced AI
| Task | Priority | Effort | Status |
|------|----------|--------|--------|
| AI Agent ecosystem | P1 | 4 days | Planned |
| Predictive analytics | P1 | 3 days | Planned |
| Emotional AI | P1 | 2 days | Planned |
| Voice trading prototype | P1 | 2 days | Planned |

#### Sprint 6 (Week 11-12): Polish & Growth
| Task | Priority | Effort | Status |
|------|----------|--------|--------|
| Smart onboarding | P1 | 2 days | Planned |
| Adaptive UI engine | P1 | 3 days | Planned |
| Polymarket integration | P2 | 2 days | Planned |
| Referral program | P2 | 2 days | Planned |
| Analytics dashboard | P1 | 3 days | Planned |

---

## 10. Technical Debt & Refactoring Plan

### 10.1 Current Issues

| Issue | Severity | File | Description |
|-------|----------|------|-------------|
| Missing `await` in main loop | High | `ai_trading_assistant_complete.py` | Line 1678: `asyncio.sleep(3600)` needs `await` |
| Shallow modules | Medium | All collector files | Each collector is self-contained but tightly coupled to HTML structure |
| No error retry logic | Medium | Collectors | API failures are not retried |
| Hardcoded selectors | Medium | Collectors | CSS selectors may break when sites update |
| Missing tests | High | All files | No unit tests implemented |
| Pattern analysis placeholder | Medium | `InsightsGenerator` | Returns empty dicts |
| Anomaly detection placeholder | Medium | `DailyLearningPipeline` | Returns empty dicts |
| No rate limiting | Medium | Collectors | Could be blocked by scraped sites |
| Sync DB calls in async context | High | EmbeddingGenerator | `supabase.table().insert()` may block |
| No input validation | Medium | All public methods | Missing pydantic validators |

### 10.2 Refactoring Plan

#### Phase 1: Bug Fixes (Immediate)
1. Fix `asyncio.sleep` - add `await`
2. Add input validation with Pydantic models
3. Add proper error retry with exponential backoff

#### Phase 2: Architecture Improvements (Week 1-2)
1. **Deepen modules**: Extract common scraping logic into `BaseCollector`
2. **Add repository pattern**: Separate data access from business logic
3. **Add dependency injection**: Use `dependency-injector` library
4. **Add caching layer**: Redis for frequently accessed data

#### Phase 3: Testing (Week 2-3)
1. Unit tests for all collectors (mock HTTP responses)
2. Integration tests for pipeline
3. Property-based testing for calculations

#### Phase 4: Performance (Week 3-4)
1. Add connection pooling for HTTP requests
2. Implement rate limiting per data source
3. Add async batch processing for embeddings
4. Optimize database queries with proper indexing

### 10.3 Proposed BaseCollector Pattern

```python
from abc import ABC, abstractmethod
import aiohttp
import asyncio
from typing import List, Dict, Any
from dataclasses import dataclass

@dataclass
class ScrapingResult:
    data: List[Dict[str, Any]]
    source: str
    records_collected: int
    errors: List[str]
    duration_ms: int

class BaseCollector(ABC):
    """Abstract base for all data collectors"""
    
    def __init__(self, rate_limit: float = 1.0, max_retries: int = 3):
        self.rate_limit = rate_limit  # requests per second
        self.max_retries = max_retries
        self.session: aiohttp.ClientSession | None = None
        self._last_request_time: float = 0
    
    async def __aenter__(self):
        self.session = aiohttp.ClientSession(
            connector=aiohttp.TCPConnector(limit=10, limit_per_host=5),
            timeout=aiohttp.ClientTimeout(total=30)
        )
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()
    
    async def _fetch_with_retry(self, url: str, headers: Dict = None) -> str:
        """Fetch URL with rate limiting and retry logic"""
        for attempt in range(self.max_retries):
            try:
                # Rate limiting
                await self._apply_rate_limit()
                
                async with self.session.get(url, headers=headers) as response:
                    if response.status == 200:
                        return await response.text()
                    elif response.status == 429:  # Rate limited
                        wait = 2 ** attempt
                        await asyncio.sleep(wait)
                    else:
                        response.raise_for_status()
            except Exception as e:
                if attempt == self.max_retries - 1:
                    raise
                await asyncio.sleep(2 ** attempt)
        return ""
    
    async def _apply_rate_limit(self):
        """Enforce rate limiting between requests"""
        import time
        now = time.time()
        elapsed = now - self._last_request_time
        if elapsed < 1.0 / self.rate_limit:
            await asyncio.sleep(1.0 / self.rate_limit - elapsed)
        self._last_request_time = time.time()
    
    @abstractmethod
    async def collect(self, symbols: List[str]) -> ScrapingResult:
        """Main collection method - must be implemented"""
        pass
    
    @abstractmethod
    def parse(self, raw_data: str, symbol: str) -> List[Dict]:
        """Parse raw HTML/JSON - must be implemented"""
        pass
```

---

## 11. Development Guide

### 11.1 Getting Started

```bash
# 1. Clone repository
git clone https://github.com/your-repo/ai-trading-assistant.git
cd ai-trading-assistant

# 2. Create virtual environment
python -m venv venv
source venv/bin/activate  # Linux/Mac
# or: venv\Scripts\activate  # Windows

# 3. Install dependencies
pip install -r requirements.txt

# 4. Set up environment variables
cp .env.example .env
# Edit .env with your credentials

# 5. Run database migrations
supabase db push

# 6. Test the setup
python ai_trading_assistant_complete.py schema
python ai_trading_assistant_complete.py test
```

### 11.2 Adding a New Collector

```python
# Step 1: Create file in lib/data/collectors/
# Step 2: Inherit from BaseCollector
# Step 3: Implement collect() and parse()
# Step 4: Add to AlternativeDataCollector
# Step 5: Add database migration if needed
# Step 6: Add tests

class NewDataCollector(BaseCollector):
    async def collect(self, symbols: List[str]) -> ScrapingResult:
        all_data = []
        errors = []
        
        for symbol in symbols:
            try:
                raw = await self._fetch_with_retry(f"https://example.com/{symbol}")
                parsed = self.parse(raw, symbol)
                all_data.extend(parsed)
            except Exception as e:
                errors.append(f"{symbol}: {str(e)}")
        
        return ScrapingResult(
            data=all_data,
            source="example",
            records_collected=len(all_data),
            errors=errors,
            duration_ms=0
        )
    
    def parse(self, raw_data: str, symbol: str) -> List[Dict]:
        # Parse logic here
        pass
```

### 11.3 Adding a New AI Agent

```python
# Step 1: Create file in lib/ai/agents/
# Step 2: Inherit from BaseAgent
# Step 3: Implement analyze() and generate_recommendation()
# Step 4: Register in TradingCouncil

class NewAgent(BaseAgent):
    async def analyze(self, context: Dict[str, Any]) -> Dict:
        # Analysis logic
        pass
    
    async def generate_recommendation(self, analysis: Dict) -> Dict:
        # Recommendation logic
        pass
```

### 11.4 Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SUPABASE_URL` | Yes | - | Supabase project URL |
| `SUPABASE_ANON_KEY` | Yes | - | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | - | Supabase service role key |
| `OPENAI_API_KEY` | No | - | OpenAI API key (for embeddings) |
| `SCHEDULER_TIMEZONE` | No | Europe/Amsterdam | Scheduler timezone |
| `SCHEDULER_DAILY_RUN_TIME` | No | 06:00 | Daily run time (HH:MM) |
| `DATA_COLLECTION_ENABLED` | No | true | Enable/disable collection |
| `DEBUG` | No | false | Debug mode |
| `TEST_MODE` | No | false | Test mode |

---

## 12. CI/CD Pipeline

### 12.1 GitHub Actions Workflow

```yaml
name: AXE Companion CI/CD

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

permissions:
  contents: read
  packages: write

jobs:
  test:
    runs-on: ubuntu-22.04
    services:
      postgres:
        image: pgvector/pgvector:pg16
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: testdb
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.12"
          cache: pip

      - name: Install dependencies
        run: |
          pip install -r requirements.txt
          pip install pytest pytest-asyncio pytest-cov ruff black

      - name: Lint with ruff
        run: ruff check .

      - name: Format check with black
        run: black --check .

      - name: Run tests with coverage
        run: pytest --cov=lib --cov-report=xml --cov-report=html
        env:
          SUPABASE_URL: http://localhost:54321
          SUPABASE_ANON_KEY: test-key
          DATABASE_URL: postgresql://test:test@localhost:5432/testdb

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage.xml

  build:
    needs: test
    runs-on: ubuntu-22.04
    if: github.ref == 'refs/heads/main'

    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: |
            ghcr.io/${{ github.repository }}:latest
            ghcr.io/${{ github.repository }}:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy:
    needs: build
    runs-on: ubuntu-22.04
    if: github.ref == 'refs/heads/main'
    environment: production

    steps:
      - name: Deploy to production
        run: |
          echo "Deploying to production..."
          # Add deployment commands here
```

### 12.2 Dockerfile

```dockerfile
FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Run as non-root user
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import aiohttp; print('OK')"

CMD ["python", "ai_trading_assistant_complete.py"]
```

---

## 13. Environment Setup

### 13.1 Local Development

```bash
# Prerequisites
# - Python 3.12+
# - Docker & Docker Compose (optional)
# - Supabase CLI

# 1. Set up Supabase locally
supabase init
supabase start

# 2. Run migrations
supabase db push

# 3. Start the scheduler
python ai_trading_assistant_complete.py

# 4. In another terminal, test collectors
python ai_trading_assistant_complete.py test
```

### 13.2 Supabase Setup

1. Create project at https://supabase.com
2. Enable pgvector extension: `CREATE EXTENSION vector;`
3. Run all migrations in order (001-007)
4. Copy project URL and keys to `.env`
5. Set Row Level Security (RLS) policies:

```sql
-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_arcs ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlists ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can only see their own data" ON trades
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can only see their own learning arc" ON learning_arcs
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can only see their own watchlist" ON watchlists
    FOR ALL USING (auth.uid() = user_id);
```

### 13.3 Production Deployment

```bash
# 1. Set up production Supabase project
# 2. Configure environment variables
# 3. Deploy using Docker Compose:

docker-compose up -d

# Or deploy to cloud:
# - Railway
# - Render
# - Fly.io
# - AWS ECS
```

---

## 14. Testing Strategy

### 14.1 Test Structure

```
tests/
|__ __init__.py
|__ conftest.py                    # Shared fixtures
|__ test_config/
|   |__ test_settings.py
|__ test_data/
|   |__ test_collectors/
|   |   |__ test_options_flow.py   # Mock HTTP responses
|   |   |__ test_policy_flow.py
|   |   |__ test_dark_pool.py
|   |__ test_processors/
|       |__ test_data_cleaner.py
|__ test_ai/
|   |__ test_embeddings.py
|   |__ test_learning_arc.py
|   |__ test_insights.py
|__ test_scheduler/
|   |__ test_pipeline.py
|__ test_integration/
    |__ test_full_pipeline.py      # End-to-end test
```

### 14.2 Example Test

```python
import pytest
from unittest.mock import AsyncMock, patch
from lib.data.collectors.options_flow_free import FreeOptionsFlowCollector

@pytest.mark.asyncio
async def test_fetch_yahoo_finance_options():
    """Test Yahoo Finance options scraping"""
    collector = FreeOptionsFlowCollector()
    
    # Mock the HTTP session
    mock_response = AsyncMock()
    mock_response.status = 200
    mock_response.text.return_value = """
    <html>
        <table>
            <tr><th>Strike</th><th>Last</th><th>Bid</th><th>Ask</th><th>Change</th><th>%Chg</th><th>Volume</th><th>OI</th><th>IV</th></tr>
            <tr><td>150.00</td><td>5.20</td><td>5.10</td><td>5.30</td><td>0.50</td><td>10.6</td><td>1,234</td><td>5,678</td><td>25.4</td></tr>
        </table>
    </html>
    """
    
    collector.session = AsyncMock()
    collector.session.get.return_value.__aenter__.return_value = mock_response
    
    result = await collector.fetch_yahoo_finance_options("AAPL")
    
    assert len(result) == 1
    assert result[0]['symbol'] == 'AAPL'
    assert result[0]['strike_price'] == 150.00
    assert result[0]['volume'] == 1234
```

---

## 15. Deployment Guide

### 15.1 Docker Compose

```yaml
version: '3.8'

services:
  app:
    build: .
    container_name: axe-companion
    restart: unless-stopped
    env_file: .env
    depends_on:
      - redis
    volumes:
      - ./logs:/app/logs

  redis:
    image: redis:7-alpine
    container_name: axe-redis
    restart: unless-stopped
    volumes:
      - redis_data:/data

  scheduler:
    build: .
    container_name: axe-scheduler
    restart: unless-stopped
    env_file: .env
    command: python -c "from lib.scheduler.daily_learning_pipeline import main; main()"
    depends_on:
      - redis

volumes:
  redis_data:
```

### 15.2 Environment Checklist

Before deploying to production:

- [ ] All environment variables set
- [ ] Database migrations applied
- [ ] pgvector extension enabled
- [ ] RLS policies configured
- [ ] OpenAI API key has sufficient quota
- [ ] Scheduler timezone configured
- [ ] Logging directory created
- [ ] Health check endpoint working
- [ ] Backup strategy in place
- [ ] Monitoring configured (e.g., Sentry)

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| Alternative Data | Non-traditional data sources for trading (options flow, dark pool, etc.) |
| Dark Pool | Private exchanges where institutional investors trade large blocks |
| Embedding | Vector representation of text for similarity search |
| Learning Arc | AI-built profile of user's trading behavior and knowledge |
| Options Flow | Real-time tracking of options contract activity |
| pgvector | PostgreSQL extension for vector similarity search |
| Policy Flow | Tracking of legislative and regulatory changes |
| RLS | Row Level Security - database access control |
| Trading DNA | Unique trading profile built by AI |
| Unusual Activity | Options with volume significantly higher than open interest |

## Appendix B: Reference Links

| Resource | URL |
|----------|-----|
| Supabase Docs | https://supabase.com/docs |
| OpenAI API | https://platform.openai.com/docs |
| Yahoo Finance | https://finance.yahoo.com |
| GovTrack API | https://www.govtrack.us/developers/api |
| Federal Register API | https://www.federalregister.gov/developers/api/v1 |
| pgvector | https://github.com/pgvector/pgvector |
| APScheduler | https://apscheduler.readthedocs.io |

## Appendix C: Feature Request Template

When adding new features, include:
1. Feature name and description
2. User story: "As a [role], I want [feature] so that [benefit]"
3. Acceptance criteria (3-5 bullet points)
4. Database changes needed
5. API endpoints needed
6. Frontend changes needed
7. Estimated effort
8. Priority (P0-P3)

---

**Document Status**: Complete | **Next Review**: 2026-07-23 | **Owner**: Development Team
