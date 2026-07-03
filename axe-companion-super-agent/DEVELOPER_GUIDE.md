# AXE Companion - Developer Guide
## Complete Tutorial for Building and Extending the Platform

> **Version**: 1.0.0 | **Last Updated**: 2026-06-23 | **Difficulty**: Intermediate
> **Estimated Time**: 4-6 hours to full setup

---

## 1. Prerequisites

### Must Know
- **Python 3.12+**: Core language - all backend code ([Official Docs](https://docs.python.org/3.12/))
- **Async/Await**: Essential for I/O operations ([Tutorial](https://docs.python.org/3/library/asyncio.html))
- **PostgreSQL**: Database basics, JSONB, indexing ([Tutorial](https://www.postgresql.org/docs/current/tutorial.html))
- **Git**: Version control

### Nice to Know
- **Supabase**: PostgreSQL hosting + auth ([Docs](https://supabase.com/docs))
- **Docker**: Containerization for deployment
- **OpenAI API**: Embeddings and AI features ([Docs](https://platform.openai.com/docs))
- **Web Scraping**: HTML parsing with BeautifulSoup

---

## 2. Environment Setup

### 2.1 Required Tools

| Tool | Version | Purpose |
|------|---------|---------|
| Python | >= 3.12 | Runtime |
| pip | >= 23.0 | Package manager |
| Git | >= 2.40 | Version control |
| Docker | >= 24.0 (optional) | Containerization |
| Supabase CLI | >= 1.150 | Database management |

### 2.2 Installation

**macOS**:
```bash
# Install Python (via pyenv)
brew install pyenv
pyenv install 3.12.0
pyenv global 3.12.0

# Install Git
brew install git

# Install Docker
brew install --cask docker

# Install Supabase CLI
brew install supabase/tap/supabase
```

**Linux (Ubuntu/Debian)**:
```bash
# Install Python
sudo apt update
sudo apt install -y python3.12 python3.12-venv python3-pip

# Install Git
sudo apt install -y git

# Install Docker
sudo apt install -y docker.io docker-compose

# Install Supabase CLI
curl -fsSL https://github.com/supabase/cli/releases/latest/download/supabase_linux_amd64.tar.gz | tar -xz
sudo mv supabase /usr/local/bin/
```

**Windows**:
```powershell
# Install Python from python.org
# Install Git from git-scm.com
# Install Docker Desktop
# Install Supabase CLI via scoop: scoop install supabase
```

### 2.3 Verification

```bash
# Verify Python
python --version
# Expected: Python 3.12.0

# Verify Git
git --version
# Expected: git version 2.40+

# Verify Docker
docker --version
# Expected: Docker version 24+

# Verify Supabase
supabase --version
# Expected: 1.150+
```

---

## 3. Project Setup

### Step 1: Clone Repository

```bash
git clone https://github.com/your-org/axe-companion.git
cd axe-companion
```

**Verification**: `ls` should show project files

---

### Step 2: Create Virtual Environment

```bash
# Create virtual environment
python -m venv venv

# Activate (macOS/Linux)
source venv/bin/activate

# Activate (Windows)
venv\Scripts\activate

# Verify (should show path to venv)
which python
```

---

### Step 3: Install Dependencies

```bash
# Install production dependencies
pip install -r requirements.txt

# Install development dependencies
pip install -r requirements-dev.txt
```

**requirements.txt**:
```
aiohttp>=3.9.0
apscheduler>=3.10.0
beautifulsoup4>=4.12.0
openai>=1.3.0
supabase>=2.3.0
python-dotenv>=1.0.0
pandas>=2.1.0
numpy>=1.24.0
```

**Verification**: `pip list` should show all packages

---

### Step 4: Configure Environment

```bash
# Copy example env file
cp .env.example .env

# Edit with your values
nano .env
```

**.env**:
```env
# Required
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Optional (for AI features)
OPENAI_API_KEY=sk-your-openai-key

# Scheduler
SCHEDULER_TIMEZONE=Europe/Amsterdam
SCHEDULER_DAILY_RUN_TIME=06:00

# Feature flags
DATA_COLLECTION_ENABLED=true
DEBUG=false
```

**Verification**: `python -c "from config.settings import Settings; Settings.print_settings()"`

---

### Step 5: Database Setup

```bash
# Option A: Local Supabase
supabase init
supabase start
supabase db push

# Option B: Cloud Supabase
# 1. Create project at supabase.com
# 2. Get URL and keys from Project Settings > API
# 3. Run migrations:
supabase link --project-ref your-project-ref
supabase db push
```

**Verification**: Check tables exist in Supabase dashboard

---

### Step 6: Test Installation

```bash
# Test 1: Print database schema
python ai_trading_assistant_complete.py schema

# Expected output: SQL migrations printed

# Test 2: Test data collectors (no API keys needed)
python ai_trading_assistant_complete.py test

# Expected output: Collection statistics

# Test 3: Test pipeline (requires Supabase config)
python ai_trading_assistant_complete.py test-pipeline

# Expected: Pipeline completion message
```

---

## 4. Core Steps

### Step 4.1: Understanding the Project Structure

**Objective**: Know where everything lives

```
axe-companion/
|__ config/           # All configuration
|__ lib/
|   |__ data/         # Data collection
|   |__ ai/           # AI processing
|   |__ scheduler/    # Pipeline orchestration
|   |__ utils/        # Helpers
|__ supabase/         # Database migrations
|__ tests/            # Test suite
```

**Key Principle**: Every module has a single responsibility

---

### Step 4.2: Running the Daily Pipeline

**Objective**: Execute the full data collection and AI processing pipeline

**Actions**:
```bash
# Start the scheduler (runs daily at 06:00)
python ai_trading_assistant_complete.py

# Or run pipeline manually in Python
python -c "
import asyncio
from lib.scheduler.daily_learning_pipeline import DailyLearningPipeline
from config.settings import Settings

async def main():
    pipeline = DailyLearningPipeline(
        supabase_url=Settings.SUPABASE_URL,
        supabase_key=Settings.SUPABASE_SERVICE_ROLE_KEY
    )
    
    result = await pipeline.run_daily_pipeline(
        user_id='test-user-id',
        symbols=['AAPL', 'MSFT', 'EURUSD']
    )
    
    print(f'Pipeline completed in {result[\"duration\"]:.2f}s')
    print(f'Data collected: {result[\"data_collection\"]}')

asyncio.run(main())
"
```

**Verification**: Check Supabase for new records in `options_flow`, `dark_pool_trades`

---

### Step 4.3: Adding a New Data Source

**Objective**: Extend the platform with a new data collector

**Actions**:

1. Create the collector file:

```python
# lib/data/collectors/sentiment_free.py
"""
Free Market Sentiment Collector
Collects sentiment data from social media without API keys
"""
import asyncio
import aiohttp
from typing import Dict, List
from datetime import datetime
from bs4 import BeautifulSoup
import re


class FreeSentimentCollector:
    """Collects market sentiment from free sources"""
    
    def __init__(self):
        self.session = None
    
    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()
    
    async def fetch_stocktwits_sentiment(self, symbol: str) -> Dict:
        """Fetch sentiment from StockTwits"""
        url = f"https://stocktwits.com/symbol/{symbol}"
        
        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
            }
            
            async with self.session.get(url, headers=headers) as response:
                if response.status == 200:
                    html = await response.text()
                    return self._parse_stocktwits(html, symbol)
                return {'symbol': symbol, 'sentiment': 'neutral', 'score': 0.5}
        except Exception as e:
            print(f"Error fetching StockTwits for {symbol}: {e}")
            return {'symbol': symbol, 'sentiment': 'neutral', 'score': 0.5}
    
    def _parse_stocktwits(self, html: str, symbol: str) -> Dict:
        """Parse StockTwits sentiment"""
        soup = BeautifulSoup(html, 'html.parser')
        
        # Look for sentiment indicators
        bullish_count = len(soup.find_all(text=re.compile(r'bullish', re.I)))
        bearish_count = len(soup.find_all(text=re.compile(r'bearish', re.I)))
        
        total = bullish_count + bearish_count
        if total == 0:
            return {'symbol': symbol, 'sentiment': 'neutral', 'score': 0.5}
        
        score = bullish_count / total
        
        sentiment = 'neutral'
        if score > 0.6:
            sentiment = 'bullish'
        elif score < 0.4:
            sentiment = 'bearish'
        
        return {
            'symbol': symbol,
            'sentiment': sentiment,
            'score': round(score, 2),
            'bullish_count': bullish_count,
            'bearish_count': bearish_count,
            'timestamp': datetime.now(),
            'source': 'stocktwits'
        }
    
    async def collect_all(self, symbols: List[str]) -> Dict:
        """Collect sentiment for all symbols"""
        results = []
        
        for symbol in symbols:
            print(f"Collecting sentiment for {symbol}...")
            sentiment = await self.fetch_stocktwits_sentiment(symbol)
            results.append(sentiment)
        
        return {
            'total': len(results),
            'sentiments': results
        }
```

2. Register in the orchestrator:

```python
# In lib/data/collectors/alternative_data_free.py
from .sentiment_free import FreeSentimentCollector

class AlternativeDataCollector:
    async def collect_all_alternative_data(self, symbols=None):
        # ... existing collectors ...
        
        # Add sentiment collection
        print("="*70)
        print("📊 VERZAMEL SENTIMENT DATA")
        print("="*70)
        async with FreeSentimentCollector() as sentiment:
            results['sentiment'] = await sentiment.collect_all(symbols)
        
        return results
```

**Verification**:
```bash
python -c "
import asyncio
from lib.data.collectors.sentiment_free import FreeSentimentCollector

async def test():
    async with FreeSentimentCollector() as collector:
        result = await collector.collect_all(['AAPL', 'TSLA'])
        print(result)

asyncio.run(test())
"
```

---

### Step 4.4: Creating a Custom AI Agent

**Objective**: Build a new specialized AI agent

**Actions**:

```python
# lib/ai/agents/news_analyst.py
"""
News Analyst Agent
Analyzes news sentiment and extracts trading signals
"""
from typing import Dict, Any, List
from datetime import datetime
from .base import BaseAgent


class NewsAnalystAgent(BaseAgent):
    """Analyzes news and extracts trading signals"""
    
    def __init__(self, supabase_client, openai_client=None):
        super().__init__("NewsAnalyst", supabase_client)
        self.openai = openai_client
    
    async def analyze(self, context: Dict[str, Any]) -> Dict:
        """
        Analyze recent news for a symbol
        
        Args:
            context: {'symbol': str, 'lookback_hours': int}
        
        Returns:
            Analysis with sentiment, key events, trading signals
        """
        symbol = context.get('symbol', '')
        lookback = context.get('lookback_hours', 24)
        
        # Fetch recent news from embeddings
        news_items = await self._fetch_recent_news(symbol, lookback)
        
        # Analyze sentiment
        sentiment_analysis = await self._analyze_sentiment(news_items)
        
        # Extract trading signals
        signals = self._extract_signals(news_items, sentiment_analysis)
        
        return {
            'symbol': symbol,
            'news_count': len(news_items),
            'overall_sentiment': sentiment_analysis['overall'],
            'sentiment_score': sentiment_analysis['score'],
            'key_events': sentiment_analysis['key_events'],
            'trading_signals': signals,
            'analyzed_at': datetime.now().isoformat()
        }
    
    async def generate_recommendation(self, analysis: Dict) -> Dict:
        """Generate trading recommendation from analysis"""
        sentiment_score = analysis.get('sentiment_score', 0.5)
        signals = analysis.get('trading_signals', [])
        
        recommendation = 'hold'
        confidence = 0.5
        
        if sentiment_score > 0.7 and any(s['type'] == 'positive_catalyst' for s in signals):
            recommendation = 'consider_long'
            confidence = sentiment_score
        elif sentiment_score < 0.3 and any(s['type'] == 'negative_catalyst' for s in signals):
            recommendation = 'consider_short'
            confidence = 1 - sentiment_score
        
        return {
            'recommendation': recommendation,
            'confidence': round(confidence, 2),
            'reasoning': f"News sentiment score: {sentiment_score}",
            'signals_used': len(signals)
        }
    
    async def _fetch_recent_news(self, symbol: str, hours: int) -> List[Dict]:
        """Fetch recent news from database"""
        result = await self.supabase.table('knowledge_embeddings')\
            .select('*')\
            .eq('type', 'news')\
            .gte('created_at', datetime.now().isoformat())\
            .execute()
        return result.data or []
    
    async def _analyze_sentiment(self, news_items: List[Dict]) -> Dict:
        """Analyze sentiment of news items"""
        if not news_items:
            return {'overall': 'neutral', 'score': 0.5, 'key_events': []}
        
        # Simple keyword-based analysis
        positive_words = ['bullish', 'growth', 'profit', 'beat', 'strong']
        negative_words = ['bearish', 'loss', 'miss', 'weak', 'decline']
        
        total_score = 0
        key_events = []
        
        for item in news_items:
            content = item.get('content', '').lower()
            pos_count = sum(1 for w in positive_words if w in content)
            neg_count = sum(1 for w in negative_words if w in content)
            
            item_score = 0.5
            if pos_count + neg_count > 0:
                item_score = pos_count / (pos_count + neg_count)
            
            total_score += item_score
            
            if pos_count + neg_count > 2:  # Significant event
                key_events.append({
                    'content': item['content'][:200],
                    'impact': 'high' if abs(item_score - 0.5) > 0.3 else 'medium'
                })
        
        avg_score = total_score / len(news_items) if news_items else 0.5
        
        overall = 'neutral'
        if avg_score > 0.6:
            overall = 'positive'
        elif avg_score < 0.4:
            overall = 'negative'
        
        return {
            'overall': overall,
            'score': round(avg_score, 2),
            'key_events': key_events[:5]  # Top 5 events
        }
    
    def _extract_signals(self, news_items: List[Dict], sentiment: Dict) -> List[Dict]:
        """Extract trading signals from news"""
        signals = []
        
        # Signal 1: Strong sentiment shift
        if sentiment['score'] > 0.8:
            signals.append({
                'type': 'positive_catalyst',
                'strength': 'strong',
                'description': 'Overwhelmingly positive news sentiment'
            })
        elif sentiment['score'] < 0.2:
            signals.append({
                'type': 'negative_catalyst', 
                'strength': 'strong',
                'description': 'Overwhelmingly negative news sentiment'
            })
        
        return signals
```

**Verification**:
```bash
python -c "
import asyncio
from lib.ai.agents.news_analyst import NewsAnalystAgent

async def test():
    # Mock supabase client
    class MockSupabase:
        async def table(self, name):
            return MockTable()
    
    class MockTable:
        def select(self, *args):
            return self
        def eq(self, *args):
            return self
        def gte(self, *args):
            return self
        async def execute(self):
            return type('Result', (), {'data': []})()
    
    agent = NewsAnalystAgent(MockSupabase())
    
    result = await agent.analyze({'symbol': 'AAPL', 'lookback_hours': 24})
    print(f'Analysis: {result}')
    
    rec = await agent.generate_recommendation(result)
    print(f'Recommendation: {rec}')

asyncio.run(test())
"
```

---

### Step 4.5: Adding Database Migrations

**Objective**: Add new tables when extending functionality

**Actions**:

1. Create migration file:

```sql
-- supabase/migrations/008_create_sentiment_data.sql
-- Sentiment tracking tables

CREATE TABLE IF NOT EXISTS sentiment_data (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    sentiment VARCHAR(20) NOT NULL CHECK (sentiment IN ('bullish', 'bearish', 'neutral')),
    score DECIMAL(4, 2) NOT NULL CHECK (score >= 0 AND score <= 1),
    bullish_count INTEGER DEFAULT 0,
    bearish_count INTEGER DEFAULT 0,
    source VARCHAR(50) NOT NULL,
    raw_data JSONB,
    timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sentiment_symbol ON sentiment_data(symbol);
CREATE INDEX idx_sentiment_timestamp ON sentiment_data(timestamp DESC);
CREATE INDEX idx_sentiment_score ON sentiment_data(score DESC);

-- Daily sentiment summary
CREATE TABLE IF NOT EXISTS sentiment_summary (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    date DATE NOT NULL,
    avg_score DECIMAL(4, 2),
    dominant_sentiment VARCHAR(20),
    total_mentions INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(symbol, date)
);

CREATE INDEX idx_sentiment_summary_symbol_date ON sentiment_summary(symbol, date DESC);
```

2. Apply migration:

```bash
supabase db push
```

**Verification**: Check tables in Supabase dashboard

---

### Step 4.6: Creating API Endpoints

**Objective**: Add REST API endpoint for new feature

**Actions**:

```python
# api/routes/sentiment.py
"""
Sentiment API Routes
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from pydantic import BaseModel
from datetime import date

from api.dependencies import get_current_user, get_supabase_client

router = APIRouter(prefix="/sentiment", tags=["sentiment"])


class SentimentResponse(BaseModel):
    symbol: str
    sentiment: str
    score: float
    bullish_count: int
    bearish_count: int
    source: str
    timestamp: str


class SentimentSummaryResponse(BaseModel):
    symbol: str
    date: date
    avg_score: float
    dominant_sentiment: str
    total_mentions: int


@router.get("/{symbol}", response_model=SentimentResponse)
async def get_latest_sentiment(
    symbol: str,
    supabase=Depends(get_supabase_client),
    user=Depends(get_current_user)
):
    """Get latest sentiment for a symbol"""
    result = await supabase.table('sentiment_data')\
        .select('*')\
        .eq('symbol', symbol.upper())\
        .order('timestamp', desc=True)\
        .limit(1)\
        .execute()
    
    if not result.data:
        raise HTTPException(status_code=404, detail=f"No sentiment data for {symbol}")
    
    return SentimentResponse(**result.data[0])


@router.get("/{symbol}/history", response_model=List[SentimentSummaryResponse])
async def get_sentiment_history(
    symbol: str,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    supabase=Depends(get_supabase_client),
    user=Depends(get_current_user)
):
    """Get sentiment history for a symbol"""
    query = supabase.table('sentiment_summary')\
        .select('*')\
        .eq('symbol', symbol.upper())\
        .order('date', desc=True)
    
    if start_date:
        query = query.gte('date', start_date.isoformat())
    if end_date:
        query = query.lte('date', end_date.isoformat())
    
    result = await query.execute()
    
    return [SentimentSummaryResponse(**item) for item in (result.data or [])]


@router.post("/collect/{symbol}")
async def trigger_sentiment_collection(
    symbol: str,
    supabase=Depends(get_supabase_client),
    user=Depends(get_current_user)
):
    """Trigger sentiment collection for a symbol"""
    from lib.data.collectors.sentiment_free import FreeSentimentCollector
    
    async with FreeSentimentCollector() as collector:
        result = await collector.collect_all([symbol.upper()])
    
    # Store results
    for sentiment in result.get('sentiments', []):
        await supabase.table('sentiment_data').insert({
            'symbol': sentiment['symbol'],
            'sentiment': sentiment['sentiment'],
            'score': sentiment['score'],
            'bullish_count': sentiment.get('bullish_count', 0),
            'bearish_count': sentiment.get('bearish_count', 0),
            'source': sentiment['source'],
            'timestamp': sentiment['timestamp'].isoformat() if hasattr(sentiment['timestamp'], 'isoformat') else sentiment['timestamp']
        }).execute()
    
    return {
        "success": True,
        "symbol": symbol.upper(),
        "records_collected": result.get('total', 0)
    }
```

**Register in main app**:
```python
# api/main.py
from api.routes import sentiment

app.include_router(sentiment.router)
```

**Verification**:
```bash
curl http://localhost:8000/api/v1/sentiment/AAPL
# Should return latest sentiment data
```

---

## 5. Troubleshooting

### Error 1: ModuleNotFoundError: No module named 'aiohttp'

Full error:
```
ModuleNotFoundError: No module named 'aiohttp'
```

Cause: Dependencies not installed

Solution:
```bash
pip install -r requirements.txt
# Verify
python -c "import aiohttp; print(aiohttp.__version__)"
```

---

### Error 2: Connection refused to Supabase

Full error:
```
ConnectionError: [Errno 61] Connection refused to localhost:54321
```

Cause: Supabase not running or wrong URL

Solution:
```bash
# Check if Supabase is running
supabase status

# If not running
supabase start

# If using cloud, check .env URL
# Should be: https://your-project.supabase.co
```

---

### Error 3: pgvector extension not found

Full error:
```
ERROR: extension "vector" is not available
```

Cause: pgvector not enabled in Supabase

Solution:
```sql
-- Run in Supabase SQL Editor
CREATE EXTENSION IF NOT EXISTS vector;

-- Verify
SELECT * FROM pg_extension WHERE extname = 'vector';
```

---

### Error 4: OpenAI API rate limit

Full error:
```
RateLimitError: Rate limit reached for text-embedding-3-small
```

Cause: Too many embedding requests

Solution:
```python
# Add rate limiting to embedding generation
import asyncio

async def generate_embeddings_with_rate_limit(self, texts):
    embeddings = []
    for text in texts:
        embedding = await self._generate_single_embedding(text)
        embeddings.append(embedding)
        await asyncio.sleep(0.1)  # 10 requests per second max
    return embeddings
```

---

### Error 5: HTML parsing returns empty results

Full error:
```
[]  # Empty list from collector
```

Cause: Website structure changed

Solution:
```python
# Update CSS selectors
# Use browser dev tools to find new selectors
# Add fallback selectors

# Example fallback:
def parse_yahoo_options(self, html, symbol):
    soup = BeautifulSoup(html, 'html.parser')
    
    # Try multiple selector strategies
    tables = soup.find_all('table')  # Generic fallback
    if not tables:
        tables = soup.select('[data-test="options-table"]')  # Specific
    
    # ... rest of parsing
```

---

### Error 6: asyncpg syntax error

Full error:
```
SyntaxError: 'await' outside async function
```

Cause: Missing `async`/`await` keywords

Solution:
```python
# Wrong
def main():
    result = await some_async_function()

# Correct
async def main():
    result = await some_async_function()

# Run with
asyncio.run(main())
```

---

### Error 7: Scheduler not running

Full error:
```
# No output, scheduler seems stuck
```

Cause: Event loop blocking

Solution:
```python
# In ai_trading_assistant_complete.py, fix line ~1678:

# WRONG (missing await)
while True:
    asyncio.sleep(3600)

# CORRECT
while True:
    await asyncio.sleep(3600)
```

---

## 6. Advanced Topics

### Direction 1: Deploying to Production | Difficulty: Intermediate

Deploy the platform to a production environment using Docker and a cloud provider. Learn about environment management, secrets handling, health checks, and monitoring.

Recommended resources:
- Docker Best Practices (Documentation)
- Supabase Production Checklist (Documentation)

---

### Direction 2: Building a React Frontend | Difficulty: Intermediate

Create a modern React/TypeScript frontend that consumes the FastAPI backend. Implement real-time WebSocket connections for live data updates.

Recommended resources:
- React Official Tutorial (Course)
- TanStack Query for data fetching (Documentation)

---

### Direction 3: Adding Machine Learning Models | Difficulty: Advanced

Train custom ML models for price prediction and pattern recognition. Use historical data to build predictive models that feed into the AI agents.

Recommended resources:
- scikit-learn Documentation (Documentation)
- Fast.ai Course (Course)

---

### Direction 4: Building a Mobile App | Difficulty: Advanced

Create a React Native or Flutter mobile app for trading on the go. Implement push notifications for alerts and voice trading features.

Recommended resources:
- React Native Documentation (Documentation)
- Expo for rapid development (Tool)

---

## 7. Cheatsheet

### Common Commands

| Action | Command |
|--------|---------|
| Start scheduler | `python ai_trading_assistant_complete.py` |
| Test collectors | `python ai_trading_assistant_complete.py test` |
| Test pipeline | `python ai_trading_assistant_complete.py test-pipeline` |
| Print schema | `python ai_trading_assistant_complete.py schema` |
| Run all tests | `pytest tests/ -v` |
| Run specific test | `pytest tests/test_collectors.py -v` |
| Lint code | `ruff check .` |
| Format code | `black .` |
| Start Supabase | `supabase start` |
| Push migrations | `supabase db push` |
| View logs | `supabase logs` |

### Project Structure Quick Reference

| Directory | Purpose |
|-----------|---------|
| `config/` | All configuration |
| `lib/data/collectors/` | Data scraping modules |
| `lib/ai/processors/` | AI processing modules |
| `lib/ai/agents/` | AI agent implementations |
| `lib/scheduler/` | Pipeline orchestration |
| `supabase/migrations/` | Database schema changes |
| `tests/` | Test suite |
| `api/` | FastAPI REST endpoints |

### Quick Code Snippets

**Add a new collector**:
```python
class MyCollector(BaseCollector):
    async def collect(self, symbols):
        # Your collection logic
        pass
    def parse(self, raw, symbol):
        # Your parsing logic
        pass
```

**Add a new agent**:
```python
class MyAgent(BaseAgent):
    async def analyze(self, context):
        # Your analysis
        pass
    async def generate_recommendation(self, analysis):
        # Your recommendation
        pass
```

**Database query**:
```python
result = await supabase.table('table_name')\
    .select('*')\
    .eq('column', value)\
    .order('created_at', desc=True)\
    .limit(10)\
    .execute()
```

### Quick Troubleshooting

| Symptom | Possible Cause | Quick Fix |
|---------|---------------|-----------|
| Import errors | Virtual env not activated | `source venv/bin/activate` |
| DB connection fails | Wrong URL/credentials | Check `.env` file |
| Empty scraping results | Website structure changed | Update CSS selectors |
| Rate limited | Too many requests | Add `asyncio.sleep()` |
| Tests fail | Missing test dependencies | `pip install -r requirements-dev.txt` |

---

**Document Status**: Complete | **Next Review**: 2026-07-23
