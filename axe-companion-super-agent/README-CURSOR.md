# AXE Companion - Cursor IDE Quick Start
## Send This Entire Folder to Cursor - Everything It Needs Is Here

---

## What This Is

This package contains **everything** Cursor needs to understand, extend, and deploy the AXE Companion AI Trading Assistant platform. It consolidates 11 source files (1 Python codebase + 10 PDF feature documents) into 7 structured documents.

---

## How to Use This Package

### Step 1: Read Documents in This Order

| Order | Document | Purpose | Time |
|-------|----------|---------|------|
| 1 | **`.cursorrules`** | Cursor's brain - how to work with this codebase | 2 min |
| 2 | **`MASTER_DOCUMENT.md`** | Complete knowledge base - everything in one place | 20 min |
| 3 | **`API_SPECIFICATION.md`** | All REST API + WebSocket endpoints | 10 min |
| 4 | **`DEVELOPER_GUIDE.md`** | How to add features step-by-step | 15 min |
| 5 | **`CI_CD_PIPELINE.md`** | Deploy to production | 10 min |
| 6 | **`REFACTORING_PLAN.md`** | Fix bugs, improve architecture | 10 min |

### Step 2: Start Coding

Ask Cursor things like:

```
"Implement the Adaptive UI Engine feature from the roadmap"
"Add the Gamification system with XP and badges"
"Create the AI Agent Ecosystem with 5 specialized agents"
"Fix the asyncio.sleep bug in the main loop"
"Refactor collectors to use the BaseCollector pattern"
"Build the FastAPI backend with all API endpoints"
```

### Step 3: Add Original Code

Copy these files from your original upload into the project:
- `ai_trading_assistant_complete.py` → root directory
- Create folder structure from PDF `message-a0641f03`

---

## What's Already Implemented (From Your Code)

| Component | Status | File |
|-----------|--------|------|
| Options Flow Collector (Yahoo/Finviz/Reddit) | Complete | Built-in |
| Policy Flow Collector (GovTrack/Federal Register) | Complete | Built-in |
| Dark Pool Collector (TradingView/Yahoo) | Complete | Built-in |
| Embedding Generator (OpenAI) | Complete | Built-in |
| Learning Arc Manager | Complete | Built-in |
| Insights Generator | Complete | Built-in |
| Daily Pipeline Scheduler | Complete | Built-in |
| Database Schema (9 tables) | Complete | Built-in |
| Configuration System | Complete | Built-in |

---

## What's Planned (From Your PDFs - All Consolidated)

### Phase 1: AI Core (Do First)
- [ ] **Adaptive UI Engine** - Interface adapts to trading style
- [ ] **Predictive Analytics** - Confidence scores for setups
- [ ] **AI Agent Ecosystem** - 6 specialized agents + Trading Council

### Phase 2: Engagement (Do Second)
- [ ] **Gamification System** - XP, badges, leaderboards, challenges
- [ ] **Emotional AI** - Detect frustration, overconfidence
- [ ] **Voice Trading** - Hands-free trading commands

### Phase 3: Growth (Do Third)
- [ ] **Smart Onboarding** - Reduce 73% drop-off
- [ ] **Polymarket Integration** - Prediction market odds
- [ ] **Enterprise Dashboard** - Professional analytics
- [ ] **Referral Program** - Viral growth mechanics

### Phase 4: Polish (Do Last)
- [ ] **Social Trading** - Community insights
- [ ] **Dynamic Pricing** - Tiered premium plans
- [ ] **Mobile App** - React Native/Flutter

---

## Quick Commands for Cursor

```bash
# Start the scheduler
python ai_trading_assistant_complete.py

# Test data collection (no API keys needed)
python ai_trading_assistant_complete.py test

# Test full pipeline
python ai_trading_assistant_complete.py test-pipeline

# Print database schema
python ai_trading_assistant_complete.py schema

# Install dependencies
pip install -r requirements.txt

# Run tests
pytest tests/ -v

# Lint code
ruff check .

# Format code
black .
```

---

## Database Quick Reference

```sql
-- Core tables: users, trades, learning_arcs, watchlists, user_preferences
-- Data tables: dark_pool_trades, dark_pool_summary, options_flow, options_flow_summary
-- Policy tables: legislation, regulatory_changes
-- AI tables: knowledge_embeddings (requires pgvector)

-- Enable vector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Key indexes are already defined in migrations
```

---

## Environment Variables

```env
# Required
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Optional (for AI features)
OPENAI_API_KEY=sk-your-key

# Scheduler
SCHEDULER_TIMEZONE=Europe/Amsterdam
SCHEDULER_DAILY_RUN_TIME=06:00

# Feature flags
DATA_COLLECTION_ENABLED=true
DEBUG=false
```

---

## Architecture in 3 Lines

1. **Collectors** scrape free data (Yahoo, Finviz, GovTrack) → store in Supabase
2. **AI Processors** analyze data, build user profiles, generate insights
3. **Scheduler** runs daily at 06:00, orchestrating the entire pipeline

---

## When You Get Stuck

1. Check `.cursorrules` for coding standards
2. Check `MASTER_DOCUMENT.md` for architecture details
3. Check `DEVELOPER_GUIDE.md` for step-by-step tutorials
4. Check `REFACTORING_PLAN.md` for known issues

---

**This package was generated on 2026-06-23 from 11 source files using 7 professional skills.**

**Skills Used**: deep-module-refactor, route-to-openapi, dev-guide-generator, pipeline-blueprint, code-mentor, work-recap-writer, kimi-find-skills

**Total Knowledge Consolidated**: 1,750+ lines of Python code + 10 feature specification PDFs = 7 structured implementation documents
