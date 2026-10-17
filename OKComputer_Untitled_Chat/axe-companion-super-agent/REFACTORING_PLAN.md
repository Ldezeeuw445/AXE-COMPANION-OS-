# AXE Companion - Technical Debt & Refactoring Plan
## Architecture Improvements for Production Readiness

> **Version**: 1.0.0 | **Priority**: High | **Date**: 2026-06-23

---

## 1. Critical Bugs (Fix Immediately)

### Bug 1: Missing `await` in Main Loop

**File**: `ai_trading_assistant_complete.py` (line ~1678)
**Severity**: Critical
**Impact**: Scheduler never yields control, blocks event loop

**Current Code**:
```python
# WRONG - Blocks forever
try:
    while True:
        asyncio.sleep(3600)  # Missing await!
except KeyboardInterrupt:
    print("\nScheduler gestopt")
```

**Fixed Code**:
```python
# CORRECT
async def keep_alive():
    while True:
        await asyncio.sleep(3600)

try:
    await keep_alive()
except KeyboardInterrupt:
    print("\nScheduler gestopt")
```

---

### Bug 2: Synchronous DB Calls in Async Context

**File**: `lib/ai/processors/embeddings.py`
**Severity**: High
**Impact**: Blocks event loop during database operations

**Current Code**:
```python
# WRONG - May block
await self.supabase.table('knowledge_embeddings').insert({...}).execute()
```

**Fixed Code**:
```python
# CORRECT - Use run_in_executor for truly sync operations
import asyncio

async def store_embeddings(self, embeddings: List[Dict], user_id: str) -> int:
    stored_count = 0
    for embedding in embeddings:
        try:
            # Run sync call in thread pool
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                lambda: self.supabase.table('knowledge_embeddings').insert({
                    'user_id': user_id,
                    'type': embedding['type'],
                    'content': embedding['content'],
                    'embedding': embedding['embedding'],
                    'metadata': embedding['metadata']
                }).execute()
            )
            stored_count += 1
        except Exception as e:
            logger.error(f"Error storing embedding: {e}")
    return stored_count
```

---

## 2. Architecture Improvements

### Improvement 1: Abstract Base Collector

**Current Problem**: Each collector duplicates session management, error handling, and rate limiting logic.

**Solution**: Create `BaseCollector` abstract class.

```python
# lib/data/collectors/base.py
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import List, Dict, Any, Optional
import aiohttp
import asyncio
import time
import logging

logger = logging.getLogger(__name__)

@dataclass
class CollectionResult:
    data: List[Dict[str, Any]]
    source: str
    records_collected: int
    errors: List[str]
    duration_ms: int


class BaseCollector(ABC):
    """
    Abstract base class for all data collectors.
    
    Provides:
    - Managed HTTP sessions with connection pooling
    - Rate limiting between requests
    - Retry logic with exponential backoff
    - Consistent error handling
    - Collection result tracking
    
    Usage:
        class MyCollector(BaseCollector):
            @property
            def source_name(self) -> str:
                return "my_source"
            
            @property
            def rate_limit(self) -> float:
                return 1.0  # requests per second
            
            @property
            def max_retries(self) -> int:
                return 3
            
            async def collect(self, symbols: List[str]) -> CollectionResult:
                # Implementation
                pass
            
            def parse(self, raw_data: str, symbol: str) -> List[Dict]:
                # Implementation
                pass
    """
    
    def __init__(self):
        self._session: Optional[aiohttp.ClientSession] = None
        self._last_request_time: float = 0
        self.errors: List[str] = []
    
    async def __aenter__(self):
        self._session = aiohttp.ClientSession(
            connector=aiohttp.TCPConnector(
                limit=10,
                limit_per_host=3,
                ttl_dns_cache=300
            ),
            timeout=aiohttp.ClientTimeout(total=30),
            headers={'User-Agent': 'AXE-Companion/1.0'}
        )
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self._session:
            await self._session.close()
            self._session = None
    
    @property
    @abstractmethod
    def source_name(self) -> str:
        """Human-readable source name"""
        pass
    
    @property
    def rate_limit(self) -> float:
        """Maximum requests per second (default: 1)"""
        return 1.0
    
    @property
    def max_retries(self) -> int:
        """Maximum retry attempts (default: 3)"""
        return 3
    
    @property
    def retry_delay_base(self) -> float:
        """Base delay for exponential backoff (default: 2 seconds)"""
        return 2.0
    
    async def _fetch(self, url: str, headers: Optional[Dict] = None) -> str:
        """
        Fetch URL with rate limiting and retry logic.
        
        Args:
            url: URL to fetch
            headers: Optional additional headers
            
        Returns:
            Response text content
            
        Raises:
            aiohttp.ClientError: After all retries exhausted
        """
        if not self._session:
            raise RuntimeError("Collector not entered as context manager")
        
        request_headers = {**(headers or {})}
        
        for attempt in range(self.max_retries):
            try:
                # Rate limiting
                await self._apply_rate_limit()
                
                async with self._session.get(url, headers=request_headers) as response:
                    if response.status == 200:
                        return await response.text()
                    elif response.status == 429:
                        wait_time = self.retry_delay_base ** (attempt + 1)
                        logger.warning(f"Rate limited, waiting {wait_time}s")
                        await asyncio.sleep(wait_time)
                    else:
                        response.raise_for_status()
                        
            except aiohttp.ClientError as e:
                logger.warning(f"Attempt {attempt + 1} failed: {e}")
                if attempt == self.max_retries - 1:
                    raise
                await asyncio.sleep(self.retry_delay_base ** attempt)
        
        return ""
    
    async def _apply_rate_limit(self):
        """Enforce rate limiting between requests"""
        now = time.time()
        min_interval = 1.0 / self.rate_limit
        elapsed = now - self._last_request_time
        if elapsed < min_interval:
            await asyncio.sleep(min_interval - elapsed)
        self._last_request_time = time.time()
    
    @abstractmethod
    async def collect(self, symbols: List[str]) -> CollectionResult:
        """
        Main collection method. Must be implemented by subclasses.
        
        Args:
            symbols: List of stock/crypto symbols to collect data for
            
        Returns:
            CollectionResult with collected data and metadata
        """
        pass
    
    @abstractmethod
    def parse(self, raw_data: str, symbol: str) -> List[Dict[str, Any]]:
        """
        Parse raw HTML/JSON data into structured format.
        
        Args:
            raw_data: Raw response content
            symbol: Symbol being parsed
            
        Returns:
            List of parsed records
        """
        pass
```

---

### Improvement 2: Repository Pattern for Data Access

**Current Problem**: Direct Supabase calls scattered throughout business logic.

**Solution**: Centralize data access in repository classes.

```python
# lib/data/repositories/base.py
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from supabase import Client


class BaseRepository(ABC):
    """Base repository for database operations"""
    
    def __init__(self, supabase: Client):
        self._db = supabase
    
    @property
    @abstractmethod
    def table_name(self) -> str:
        pass
    
    async def find_by_id(self, id: str) -> Optional[Dict]:
        result = await self._db.table(self.table_name).select('*').eq('id', id).execute()
        return result.data[0] if result.data else None
    
    async def find_by_user(self, user_id: str, limit: int = 100) -> List[Dict]:
        result = await self._db.table(self.table_name)\
            .select('*')\
            .eq('user_id', user_id)\
            .limit(limit)\
            .execute()
        return result.data or []
    
    async def create(self, data: Dict) -> Dict:
        result = await self._db.table(self.table_name).insert(data).execute()
        return result.data[0] if result.data else {}
    
    async def update(self, id: str, data: Dict) -> Dict:
        result = await self._db.table(self.table_name).update(data).eq('id', id).execute()
        return result.data[0] if result.data else {}
    
    async def delete(self, id: str) -> bool:
        await self._db.table(self.table_name).delete().eq('id', id).execute()
        return True


# lib/data/repositories/trades.py
class TradeRepository(BaseRepository):
    @property
    def table_name(self) -> str:
        return 'trades'
    
    async def find_by_symbol(self, user_id: str, symbol: str, limit: int = 50) -> List[Dict]:
        result = await self._db.table(self.table_name)\
            .select('*')\
            .eq('user_id', user_id)\
            .eq('symbol', symbol)\
            .order('entry_date', desc=True)\
            .limit(limit)\
            .execute()
        return result.data or []
    
    async def get_statistics(self, user_id: str, days: int = 30) -> Dict:
        """Get trade statistics for a user"""
        result = await self._db.rpc('get_trade_statistics', {
            'p_user_id': user_id,
            'p_days': days
        }).execute()
        return result.data or {}


# lib/data/repositories/learning_arcs.py
class LearningArcRepository(BaseRepository):
    @property
    def table_name(self) -> str:
        return 'learning_arcs'
    
    async def find_by_user(self, user_id: str) -> Optional[Dict]:
        """Get learning arc for user (unique per user)"""
        result = await self._db.table(self.table_name)\
            .select('*')\
            .eq('user_id', user_id)\
            .execute()
        return result.data[0] if result.data else None
    
    async def update_trading_style(self, user_id: str, style: Dict) -> Dict:
        result = await self._db.table(self.table_name)\
            .update({'trading_style': style})\
            .eq('user_id', user_id)\
            .execute()
        return result.data[0] if result.data else {}
```

---

### Improvement 3: Dependency Injection Container

**Current Problem**: Dependencies manually created and passed around.

**Solution**: Use a DI container.

```python
# lib/container.py
from dependency_injector import containers, providers
from supabase import create_client

from config.settings import Settings
from lib.data.repositories.trades import TradeRepository
from lib.data.repositories.learning_arcs import LearningArcRepository
from lib.ai.processors.embeddings import EmbeddingGenerator
from lib.ai.processors.learning_arc import LearningArcManager
from lib.ai.processors.insights import InsightsGenerator


class Container(containers.DeclarativeContainer):
    """Dependency injection container"""
    
    config = providers.Singleton(Settings)
    
    # Database client
    supabase = providers.Singleton(
        create_client,
        supabase_url=config.provided.SUPABASE_URL,
        supabase_key=config.provided.SUPABASE_SERVICE_ROLE_KEY
    )
    
    # Repositories
    trade_repository = providers.Factory(TradeRepository, supabase=supabase)
    learning_arc_repository = providers.Factory(LearningArcRepository, supabase=supabase)
    
    # AI processors
    embedding_generator = providers.Factory(
        EmbeddingGenerator,
        supabase_url=config.provided.SUPABASE_URL,
        supabase_key=config.provided.SUPABASE_SERVICE_ROLE_KEY
    )
    
    learning_arc_manager = providers.Factory(
        LearningArcManager,
        supabase_url=config.provided.SUPABASE_URL,
        supabase_key=config.provided.SUPABASE_SERVICE_ROLE_KEY
    )
    
    insights_generator = providers.Factory(
        InsightsGenerator,
        supabase_url=config.provided.SUPABASE_URL,
        supabase_key=config.provided.SUPABASE_SERVICE_ROLE_KEY
    )
```

---

### Improvement 4: Structured Logging

**Current Problem**: Using `print()` statements for logging.

**Solution**: Use Python's `logging` module with structured formatting.

```python
# lib/logging_config.py
import logging
import sys
from datetime import datetime


def configure_logging(level: str = "INFO"):
    """Configure structured logging for the application"""
    
    logging.basicConfig(
        level=getattr(logging, level.upper()),
        format='%(asctime)s | %(levelname)-8s | %(name)s | %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S',
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(f'logs/axe-companion-{datetime.now():%Y%m%d}.log')
        ]
    )
    
    # Reduce noise from third-party libraries
    logging.getLogger('aiohttp').setLevel(logging.WARNING)
    logging.getLogger('apscheduler').setLevel(logging.WARNING)


# Usage in each module:
import logging
logger = logging.getLogger(__name__)

# Instead of: print(f"Collected {count} options")
# Use: logger.info(f"Collected {count} options", extra={'symbol': symbol})
```

---

### Improvement 5: Pydantic Models for Validation

**Current Problem**: No input validation; raw dicts passed around.

**Solution**: Use Pydantic for all data models.

```python
# lib/models/trade.py
from pydantic import BaseModel, Field
from datetime import date, datetime
from typing import Optional
from decimal import Decimal


class TradeCreate(BaseModel):
    """Model for creating a trade"""
    symbol: str = Field(..., min_length=1, max_length=20)
    entry_date: date
    entry_price: Decimal = Field(..., gt=0)
    position_size: int = Field(..., gt=0)
    direction: str = Field(..., pattern='^(long|short)$')
    stop_loss: Optional[Decimal] = None
    take_profit: Optional[Decimal] = None
    notes: Optional[str] = Field(None, max_length=1000)


class TradeUpdate(BaseModel):
    """Model for updating a trade (partial)"""
    exit_date: Optional[date] = None
    exit_price: Optional[Decimal] = None
    notes: Optional[str] = Field(None, max_length=1000)


class TradeResponse(TradeCreate):
    """Model for trade response"""
    id: str
    user_id: str
    return_pct: Optional[Decimal] = None
    created_at: datetime
    
    class Config:
        from_attributes = True
```

---

## 3. Implementation Timeline

| Phase | Task | Duration | Priority |
|-------|------|----------|----------|
| **Week 1** | Fix critical bugs | 1 day | Critical |
| **Week 1** | Add structured logging | 1 day | High |
| **Week 1** | Add Pydantic models | 2 days | High |
| **Week 2** | Create BaseCollector | 2 days | High |
| **Week 2** | Refactor existing collectors | 2 days | High |
| **Week 3** | Create repository layer | 2 days | Medium |
| **Week 3** | Add DI container | 2 days | Medium |
| **Week 4** | Write tests | 3 days | High |
| **Week 4** | Performance optimization | 2 days | Medium |

---

## 4. Testing Strategy

### Unit Tests

```python
# tests/unit/test_options_collector.py
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from lib.data.collectors.options_flow_free import FreeOptionsFlowCollector


class TestOptionsFlowCollector:
    @pytest.fixture
    async def collector(self):
        async with FreeOptionsFlowCollector() as c:
            yield c
    
    @pytest.mark.asyncio
    async def test_fetch_yahoo_success(self, collector):
        # Arrange
        mock_response = AsyncMock()
        mock_response.status = 200
        mock_response.text.return_value = """
        <html><table>
        <tr><th>Strike</th><th>Last</th><th>Bid</th><th>Ask</th><th>Chg</th><th>%Chg</th><th>Vol</th><th>OI</th><th>IV</th></tr>
        <tr><td>150.00</td><td>5.20</td><td>5.10</td><td>5.30</td><td>0.50</td><td>10.6</td><td>1,234</td><td>5,678</td><td>25.4</td></tr>
        </table></html>
        """
        
        collector.session = AsyncMock()
        collector.session.get.return_value.__aenter__.return_value = mock_response
        
        # Act
        result = await collector.fetch_yahoo_finance_options("AAPL")
        
        # Assert
        assert len(result) == 1
        assert result[0]['symbol'] == 'AAPL'
        assert result[0]['strike_price'] == 150.0
        assert result[0]['volume'] == 1234
    
    @pytest.mark.asyncio
    async def test_fetch_yahoo_error(self, collector):
        # Arrange
        collector.session = AsyncMock()
        collector.session.get.side_effect = Exception("Connection error")
        
        # Act
        result = await collector.fetch_yahoo_finance_options("AAPL")
        
        # Assert
        assert result == []
```

---

## 5. Performance Optimizations

### Optimization 1: Connection Pooling

```python
# Already included in BaseCollector:
connector=aiohttp.TCPConnector(
    limit=10,           # Total connections
    limit_per_host=3,   # Per-host connections
    ttl_dns_cache=300   # DNS cache TTL
)
```

### Optimization 2: Batch Embedding Generation

```python
async def generate_embeddings_batch(self, texts: List[str], batch_size: int = 10) -> List[List[float]]:
    """Generate embeddings in batches to reduce API calls"""
    all_embeddings = []
    
    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]
        
        response = await self.client.embeddings.create(
            input=batch,
            model="text-embedding-3-small"
        )
        
        batch_embeddings = [item.embedding for item in response.data]
        all_embeddings.extend(batch_embeddings)
    
    return all_embeddings
```

### Optimization 3: Database Query Optimization

```sql
-- Add composite indexes for common queries
CREATE INDEX idx_trades_user_symbol ON trades(user_id, symbol);
CREATE INDEX idx_options_symbol_timestamp ON options_flow(symbol, timestamp DESC);
CREATE INDEX idx_learning_arcs_user_updated ON learning_arcs(user_id, updated_at DESC);

-- Partition large tables by date
CREATE TABLE options_flow_2026 PARTITION OF options_flow
    FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
```

---

**Document Status**: Complete | **Next Review**: 2026-07-23
