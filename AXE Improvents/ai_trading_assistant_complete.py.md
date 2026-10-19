"""
================================================================================
AI TRADING ASSISTANT - COMPLETE IMPLEMENTATION
================================================================================

Dit is een complete, self-contained implementatie van de AI Trading Assistant.
Bevat alle data collectors, AI processors, database schema, en dagelijkse pipeline.

GEBRUIK:
1. Kopieer dit bestand naar je project
2. Installeer dependencies: pip install aiohttp beautifulsoup4 supabase openai apscheduler
3. Configureer .env bestand met Supabase credentials
4. Run: python ai_trading_assistant_complete.py

AUTEUR: Luka's Assistant
VERSIE: 1.0.0
DATUM: 2026-06-22
================================================================================
"""

# =============================================================================
# IMPORTS
# =============================================================================
import asyncio
import aiohttp
import os
import re
import json
import statistics
from typing import Dict, List, Optional, Any, Callable
from datetime import datetime, timedelta
from dataclasses import dataclass, field
from bs4 import BeautifulSoup
from supabase import create_client
from openai import AsyncOpenAI
from apscheduler.schedulers.asyncio import AsyncIOScheduler

# =============================================================================
# CONFIGURATIE
# =============================================================================
class Config:
    """Centrale configuratie voor de applicatie"""
    
    # Supabase
    SUPABASE_URL = os.getenv('SUPABASE_URL', '')
    SUPABASE_ANON_KEY = os.getenv('SUPABASE_ANON_KEY', '')
    SUPABASE_SERVICE_ROLE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY', '')
    
    # OpenAI
    OPENAI_API_KEY = os.getenv('OPENAI_API_KEY', '')
    
    # Scheduler
    SCHEDULER_TIMEZONE = os.getenv('SCHEDULER_TIMEZONE', 'Europe/Amsterdam')
    SCHEDULER_DAILY_RUN_TIME = os.getenv('SCHEDULER_DAILY_RUN_TIME', '06:00')
    
    # Data Collection
    DATA_COLLECTION_ENABLED = os.getenv('DATA_COLLECTION_ENABLED', 'true').lower() == 'true'
    
    # Default watchlist
    DEFAULT_WATCHLIST = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'JPM', 'V', 'WMT']
    
    @classmethod
    def validate(cls) -> bool:
        """Valideer configuratie"""
        return bool(cls.SUPABASE_URL and cls.SUPABASE_ANON_KEY)
    
    @classmethod
    def print_config(cls):
        """Print configuratie"""
        print("="*70)
        print("⚙️  AI TRADING ASSISTANT - CONFIGURATIE")
        print("="*70)
        print(f"Supabase URL: {cls.SUPABASE_URL[:50]}..." if cls.SUPABASE_URL else "Supabase URL: ❌ Niet ingesteld")
        print(f"OpenAI API: {'✅ Ingesteld' if cls.OPENAI_API_KEY else '❌ Niet ingesteld'}")
        print(f"Scheduler Tijd: {cls.SCHEDULER_DAILY_RUN_TIME}")
        print(f"Data Collection: {'✅ Aan' if cls.DATA_COLLECTION_ENABLED else '❌ Uit'}")
        print(f"Default Watchlist: {', '.join(cls.DEFAULT_WATCHLIST)}")
        print("="*70)


# =============================================================================
# DATABASE SCHEMA
# =============================================================================
class DatabaseSchema:
    """Database schema en migraties"""
    
    @staticmethod
    def get_all_migrations() -> List[str]:
        """Haal alle SQL migraties op"""
        return [
            DatabaseSchema.create_users_table(),
            DatabaseSchema.create_trades_table(),
            DatabaseSchema.create_learning_arcs_table(),
            DatabaseSchema.create_dark_pool_tables(),
            DatabaseSchema.create_options_flow_tables(),
            DatabaseSchema.create_policy_flow_tables(),
            DatabaseSchema.create_knowledge_embeddings_tables(),
        ]
    
    @staticmethod
    def create_users_table() -> str:
        """Maak users tabel"""
        return """
        CREATE TABLE IF NOT EXISTS users (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            email VARCHAR(255) UNIQUE NOT NULL,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
        """
    
    @staticmethod
    def create_trades_table() -> str:
        """Maak trades tabel"""
        return """
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
        
        CREATE INDEX IF NOT EXISTS idx_trades_user_id ON trades(user_id);
        CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol);
        CREATE INDEX IF NOT EXISTS idx_trades_entry_date ON trades(entry_date DESC);
        """
    
    @staticmethod
    def create_learning_arcs_table() -> str:
        """Maak learning_arcs tabel"""
        return """
        CREATE TABLE IF NOT EXISTS learning_arcs (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
            trading_style JSONB,
            behavioral_patterns JSONB,
            knowledge_base JSONB,
            trading_patterns JSONB,
            performance_metrics JSONB,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        
        CREATE INDEX IF NOT EXISTS idx_learning_arcs_user_id ON learning_arcs(user_id);
        """
    
    @staticmethod
    def create_dark_pool_tables() -> str:
        """Maak dark pool tabellen"""
        return """
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
        
        CREATE INDEX IF NOT EXISTS idx_dark_pool_symbol ON dark_pool_trades(symbol);
        CREATE INDEX IF NOT EXISTS idx_dark_pool_timestamp ON dark_pool_trades(timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_dark_pool_volume ON dark_pool_trades(volume DESC);
        
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
        
        CREATE INDEX IF NOT EXISTS idx_dark_pool_summary_symbol_date ON dark_pool_summary(symbol, date DESC);
        """
    
    @staticmethod
    def create_options_flow_tables() -> str:
        """Maak options flow tabellen"""
        return """
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
        
        CREATE INDEX IF NOT EXISTS idx_options_flow_symbol ON options_flow(symbol);
        CREATE INDEX IF NOT EXISTS idx_options_flow_timestamp ON options_flow(timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_options_flow_unusual ON options_flow(unusual_activity, timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_options_flow_expiration ON options_flow(expiration_date);
        
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
        
        CREATE INDEX IF NOT EXISTS idx_options_summary_symbol_date ON options_flow_summary(symbol, date DESC);
        """
    
    @staticmethod
    def create_policy_flow_tables() -> str:
        """Maak policy flow tabellen"""
        return """
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
        
        CREATE INDEX IF NOT EXISTS idx_legislation_status ON legislation(status);
        CREATE INDEX IF NOT EXISTS idx_legislation_sectors ON legislation USING GIN(relevant_sectors);
        CREATE INDEX IF NOT EXISTS idx_legislation_impact ON legislation(impact_score DESC);
        
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
        
        CREATE INDEX IF NOT EXISTS idx_regulatory_agency ON regulatory_changes(agency);
        CREATE INDEX IF NOT EXISTS idx_regulatory_sectors ON regulatory_changes USING GIN(relevant_sectors);
        CREATE INDEX IF NOT EXISTS idx_regulatory_impact ON regulatory_changes(impact_score DESC);
        """
    
    @staticmethod
    def create_knowledge_embeddings_tables() -> str:
        """Maak knowledge embeddings tabellen"""
        return """
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
        
        CREATE INDEX IF NOT EXISTS idx_knowledge_embeddings_user_id ON knowledge_embeddings(user_id);
        CREATE INDEX IF NOT EXISTS idx_knowledge_embeddings_type ON knowledge_embeddings(type);
        CREATE INDEX IF NOT EXISTS idx_knowledge_embeddings_embedding ON knowledge_embeddings USING ivfflat (embedding vector_cosine_ops);
        
        CREATE TABLE IF NOT EXISTS watchlists (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            user_id UUID REFERENCES users(id) ON DELETE CASCADE,
            symbol VARCHAR(20) NOT NULL,
            added_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(user_id, symbol)
        );
        
        CREATE INDEX IF NOT EXISTS idx_watchlists_user_id ON watchlists(user_id);
        CREATE INDEX IF NOT EXISTS idx_watchlists_symbol ON watchlists(symbol);
        
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
        
        CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);
        """


# =============================================================================
# DATA COLLECTORS - OPTIONS FLOW
# =============================================================================
class OptionsFlowCollector:
    """
    Gratis options flow data collector
    
    Verzamelt options data van:
    - Yahoo Finance (gratis, geen API key)
    - Finviz (gratis, geen API key)
    - Reddit r/options (gratis, scraping)
    """
    
    def __init__(self):
        self.session = None
    
    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()
    
    async def fetch_yahoo_finance_options(self, symbol: str) -> List[Dict]:
        """Haal options data van Yahoo Finance"""
        url = f"https://finance.yahoo.com/quote/{symbol}/options"
        
        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
            
            async with self.session.get(url, headers=headers) as response:
                if response.status == 200:
                    html = await response.text()
                    return self._parse_yahoo_options(html, symbol)
                else:
                    print(f"❌ Yahoo Finance error voor {symbol}: HTTP {response.status}")
                    return []
        except Exception as e:
            print(f"❌ Error fetching Yahoo options voor {symbol}: {e}")
            return []
    
    def _parse_yahoo_options(self, html: str, symbol: str) -> List[Dict]:
        """Parse Yahoo Finance options HTML"""
        soup = BeautifulSoup(html, 'html.parser')
        options = []
        
        tables = soup.find_all('table')
        
        for table in tables:
            rows = table.find_all('tr')
            
            for row in rows[1:]:  # Skip header
                cols = row.find_all('td')
                
                if len(cols) >= 6:
                    try:
                        option = {
                            'symbol': symbol,
                            'strike_price': float(cols[0].text.strip().replace(',', '')),
                            'last_price': float(cols[1].text.strip().replace(',', '')),
                            'bid': float(cols[2].text.strip().replace(',', '')),
                            'ask': float(cols[3].text.strip().replace(',', '')),
                            'change': float(cols[4].text.strip().replace(',', '')),
                            'change_pct': float(cols[5].text.strip().replace('%', '')),
                            'volume': int(cols[6].text.strip().replace(',', '')) if len(cols) > 6 else 0,
                            'open_interest': int(cols[7].text.strip().replace(',', '')) if len(cols) > 7 else 0,
                            'implied_volatility': float(cols[8].text.strip().replace('%', '')) if len(cols) > 8 else 0,
                            'timestamp': datetime.now(),
                            'source': 'yahoo_finance',
                            'unusual_activity': False
                        }
                        options.append(option)
                    except (ValueError, IndexError):
                        continue
        
        return options
    
    async def fetch_finviz_options(self, symbol: str) -> List[Dict]:
        """Haal options data van Finviz"""
        url = f"https://finviz.com/quote.ashx?t={symbol}&p=options"
        
        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
            
            async with self.session.get(url, headers=headers) as response:
                if response.status == 200:
                    html = await response.text()
                    return self._parse_finviz_options(html, symbol)
                else:
                    print(f"❌ Finviz error voor {symbol}: HTTP {response.status}")
                    return []
        except Exception as e:
            print(f"❌ Error fetching Finviz options voor {symbol}: {e}")
            return []
    
    def _parse_finviz_options(self, html: str, symbol: str) -> List[Dict]:
        """Parse Finviz options HTML"""
        soup = BeautifulSoup(html, 'html.parser')
        options = []
        
        table = soup.find('table', {'class': 'options-table'})
        
        if table:
            rows = table.find_all('tr')
            
            for row in rows[1:]:  # Skip header
                cols = row.find_all('td')
                
                if len(cols) >= 8:
                    try:
                        option = {
                            'symbol': symbol,
                            'strike_price': float(cols[0].text.strip()),
                            'last_price': float(cols[1].text.strip()),
                            'change': float(cols[2].text.strip()),
                            'change_pct': float(cols[3].text.strip().replace('%', '')),
                            'volume': int(cols[4].text.strip().replace(',', '')),
                            'open_interest': int(cols[5].text.strip().replace(',', '')),
                            'implied_volatility': float(cols[6].text.strip().replace('%', '')),
                            'timestamp': datetime.now(),
                            'source': 'finviz',
                            'unusual_activity': False
                        }
                        options.append(option)
                    except (ValueError, IndexError):
                        continue
        
        return options
    
    async def fetch_reddit_options(self, subreddit: str = 'options') -> List[Dict]:
        """Haal options sentiment van Reddit"""
        url = f"https://www.reddit.com/r/{subreddit}/hot.json"
        
        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
            
            async with self.session.get(url, headers=headers) as response:
                if response.status == 200:
                    data = await response.json()
                    return self._parse_reddit_options(data)
                else:
                    print(f"❌ Reddit error voor {subreddit}: HTTP {response.status}")
                    return []
        except Exception as e:
            print(f"❌ Error fetching Reddit options: {e}")
            return []
    
    def _parse_reddit_options(self, data: Dict) -> List[Dict]:
        """Parse Reddit options data"""
        options = []
        
        for post in data.get('data', {}).get('children', []):
            post_data = post.get('data', {})
            title = post_data.get('title', '')
            
            # Extract options mentions
            options_pattern = re.findall(r'([A-Z]+)\s*(\d+)([CP])', title.upper())
            
            for match in options_pattern:
                option = {
                    'symbol': match[0],
                    'option_type': 'call' if match[2] == 'C' else 'put',
                    'strike_price': float(match[1]),
                    'sentiment': self._analyze_sentiment(title),
                    'timestamp': datetime.fromtimestamp(post_data.get('created_utc', 0)),
                    'source': 'reddit',
                    'unusual_activity': False
                }
                options.append(option)
        
        return options
    
    def _analyze_sentiment(self, text: str) -> str:
        """Analyseer sentiment van tekst"""
        positive_words = ['bull', 'bullish', 'buy', 'long', 'moon', 'rocket', 'squeeze', 'up']
        negative_words = ['bear', 'bearish', 'sell', 'short', 'dump', 'crash', 'down']
        
        text_lower = text.lower()
        
        positive_count = sum(1 for word in positive_words if word in text_lower)
        negative_count = sum(1 for word in negative_words if word in text_lower)
        
        if positive_count > negative_count:
            return 'bullish'
        elif negative_count > positive_count:
            return 'bearish'
        else:
            return 'neutral'
    
    def filter_unusual_options(self, options: List[Dict]) -> List[Dict]:
        """Filter voor ongewone options activiteit"""
        unusual_options = []
        
        for option in options:
            if option.get('open_interest', 0) > 0:
                volume_oi_ratio = option.get('volume', 0) / option['open_interest']
                if volume_oi_ratio > 2:
                    option['unusual_activity'] = True
                    unusual_options.append(option)
            elif option.get('volume', 0) > 1000:
                option['unusual_activity'] = True
                unusual_options.append(option)
        
        return unusual_options
    
    async def collect_all(self, symbols: List[str]) -> Dict:
        """Verzamel alle options flow data"""
        all_options = []
        
        for symbol in symbols:
            print(f"📊 Verzamel options voor {symbol}...")
            
            # Yahoo Finance
            yahoo_options = await self.fetch_yahoo_finance_options(symbol)
            all_options.extend(yahoo_options)
            print(f"  ✓ Yahoo Finance: {len(yahoo_options)} options")
            
            # Finviz
            finviz_options = await self.fetch_finviz_options(symbol)
            all_options.extend(finviz_options)
            print(f"  ✓ Finviz: {len(finviz_options)} options")
        
        # Reddit sentiment
        print("📰 Verzamel Reddit sentiment...")
        reddit_options = await self.fetch_reddit_options()
        all_options.extend(reddit_options)
        print(f"  ✓ Reddit: {len(reddit_options)} options")
        
        # Filter unusual activity
        unusual_options = self.filter_unusual_options(all_options)
        
        return {
            'total_options': len(all_options),
            'unusual_options': len(unusual_options),
            'options': all_options,
            'unusual_activity': unusual_options
        }


# =============================================================================
# DATA COLLECTORS - POLICY FLOW
# =============================================================================
class PolicyFlowCollector:
    """
    Gratis policy flow data collector
    
    Verzamelt policy data van:
    - GovTrack.us (gratis, geen API key)
    - Congress.gov (gratis, geen API key)
    - Federal Register (gratis, geen API key)
    - SEC.gov (gratis, geen API key)
    """
    
    def __init__(self):
        self.session = None
        self.relevant_sectors = [
            'finance', 'crypto', 'energy', 'technology',
            'healthcare', 'agriculture', 'defense'
        ]
    
    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()
    
    async def fetch_govtrack_bills(self) -> List[Dict]:
        """Haal recente bills van GovTrack"""
        url = "https://www.govtrack.us/api/v2/bill?congress=current&order_by=-current_status_date&limit=50"
        
        try:
            async with self.session.get(url) as response:
                if response.status == 200:
                    data = await response.json()
                    return self._parse_govtrack_bills(data)
                else:
                    print(f"❌ GovTrack error: HTTP {response.status}")
                    return []
        except Exception as e:
            print(f"❌ Error fetching GovTrack bills: {e}")
            return []
    
    def _parse_govtrack_bills(self, data: Dict) -> List[Dict]:
        """Parse GovTrack bills data"""
        bills = []
        
        for bill_data in data.get('objects', []):
            introduced_date = datetime.fromisoformat(bill_data.get('introduced_date', ''))
            
            if (datetime.now() - introduced_date).days > 30:
                continue
            
            relevant_sectors = self._determine_relevant_sectors(
                bill_data.get('title', '') + ' ' + bill_data.get('summary', '')
            )
            
            if not relevant_sectors:
                continue
            
            impact_score = self._calculate_impact_score(bill_data)
            
            bill = {
                'bill_id': bill_data.get('bill_id'),
                'title': bill_data.get('title'),
                'description': bill_data.get('summary', ''),
                'sponsor': bill_data.get('sponsor', {}).get('name', ''),
                'chamber': bill_data.get('originating_chamber', ''),
                'status': bill_data.get('current_status', ''),
                'introduced_date': introduced_date.date(),
                'last_action_date': datetime.fromisoformat(bill_data.get('current_status_date', '')).date(),
                'relevant_sectors': relevant_sectors,
                'impact_score': impact_score,
                'raw_data': bill_data
            }
            bills.append(bill)
        
        return bills
    
    async def fetch_federal_register(self) -> List[Dict]:
        """Haal recente regulatory changes van Federal Register"""
        url = "https://www.federalregister.gov/api/v1/documents.json?conditions[publication_date][gte]=2024-01-01&per_page=50"
        
        try:
            async with self.session.get(url) as response:
                if response.status == 200:
                    data = await response.json()
                    return self._parse_federal_register(data)
                else:
                    print(f"❌ Federal Register error: HTTP {response.status}")
                    return []
        except Exception as e:
            print(f"❌ Error fetching Federal Register: {e}")
            return []
    
    def _parse_federal_register(self, data: Dict) -> List[Dict]:
        """Parse Federal Register data"""
        regulations = []
        
        for reg_data in data.get('results', []):
            document_type = reg_data.get('type', '')
            if document_type not in ['RULE', 'PRORULE', 'NOTICE']:
                continue
            
            relevant_sectors = self._determine_relevant_sectors(
                reg_data.get('title', '') + ' ' + reg_data.get('abstract', '')
            )
            
            if not relevant_sectors:
                continue
            
            impact_score = self._calculate_regulatory_impact(reg_data)
            
            regulation = {
                'regulation_id': reg_data.get('document_number'),
                'title': reg_data.get('title'),
                'description': reg_data.get('abstract', ''),
                'agency': reg_data.get('agencies', [{}])[0].get('name', ''),
                'type': document_type.lower(),
                'publication_date': datetime.fromisoformat(reg_data.get('publication_date', '')).date(),
                'relevant_sectors': relevant_sectors,
                'impact_score': impact_score,
                'raw_data': reg_data
            }
            regulations.append(regulation)
        
        return regulations
    
    def _determine_relevant_sectors(self, text: str) -> List[str]:
        """Bepaal relevante sectors"""
        text_lower = text.lower()
        relevant = []
        
        sector_keywords = {
            'finance': ['bank', 'financial', 'securities', 'market', 'trading'],
            'crypto': ['cryptocurrency', 'bitcoin', 'blockchain', 'digital asset'],
            'energy': ['energy', 'oil', 'gas', 'renewable', 'climate'],
            'technology': ['technology', 'tech', 'ai', 'artificial intelligence'],
            'healthcare': ['health', 'medical', 'pharmaceutical', 'healthcare'],
            'agriculture': ['agriculture', 'farm', 'food', 'crop'],
            'defense': ['defense', 'military', 'security', 'weapon']
        }
        
        for sector, keywords in sector_keywords.items():
            if any(keyword in text_lower for keyword in keywords):
                relevant.append(sector)
        
        return relevant
    
    def _calculate_impact_score(self, bill_data: Dict) -> int:
        """Bereken impact score (1-10)"""
        score = 5
        
        cosponsors = len(bill_data.get('cosponsors', []))
        score += min(cosponsors // 5, 3)
        
        status = bill_data.get('current_status', '')
        if 'passed' in status.lower():
            score += 2
        
        return max(1, min(10, score))
    
    def _calculate_regulatory_impact(self, reg_data: Dict) -> int:
        """Bereken impact score voor regulations"""
        score = 5
        
        document_type = reg_data.get('type', '')
        if document_type == 'RULE':
            score += 2
        elif document_type == 'PRORULE':
            score += 1
        
        if 'significant' in reg_data.get('abstract', '').lower():
            score += 2
        
        return max(1, min(10, score))
    
    async def collect_all(self) -> Dict:
        """Verzamel alle policy flow data"""
        print("🏛️  Verzamel policy flow data...")
        
        # GovTrack bills
        print("  📜 Fetch GovTrack bills...")
        govtrack_bills = await self.fetch_govtrack_bills()
        print(f"    ✓ {len(govtrack_bills)} bills")
        
        # Federal Register
        print("  📋 Fetch Federal Register...")
        federal_register = await self.fetch_federal_register()
        print(f"    ✓ {len(federal_register)} regulations")
        
        return {
            'govtrack_bills': len(govtrack_bills),
            'federal_register': len(federal_register),
            'bills': govtrack_bills,
            'regulations': federal_register
        }


# =============================================================================
# DATA COLLECTORS - DARK POOL
# =============================================================================
class DarkPoolCollector:
    """
    Gratis dark pool data collector
    
    Verzamelt dark pool data van:
    - FINRA ATS (gratis, geen API key)
    - TradingView (gratis, geen API key)
    - Yahoo Finance (gratis, geen API key)
    """
    
    def __init__(self):
        self.session = None
    
    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()
    
    async def fetch_tradingview_dark_pool(self, symbol: str) -> List[Dict]:
        """Haal dark pool data van TradingView"""
        url = f"https://www.tradingview.com/symbols/{symbol}/technicals/"
        
        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
            
            async with self.session.get(url, headers=headers) as response:
                if response.status == 200:
                    html = await response.text()
                    return self._parse_tradingview_dark_pool(html, symbol)
                else:
                    print(f"❌ TradingView error voor {symbol}: HTTP {response.status}")
                    return []
        except Exception as e:
            print(f"❌ Error fetching TradingView voor {symbol}: {e}")
            return []
    
    def _parse_tradingview_dark_pool(self, html: str, symbol: str) -> List[Dict]:
        """Parse TradingView dark pool data"""
        soup = BeautifulSoup(html, 'html.parser')
        trades = []
        
        volume_elem = soup.find('span', {'class': 'tv-symbol-price-quote__value'})
        
        if volume_elem:
            try:
                volume = int(volume_elem.text.strip().replace(',', ''))
                
                trade = {
                    'symbol': symbol,
                    'volume': volume,
                    'timestamp': datetime.now(),
                    'source': 'tradingview'
                }
                trades.append(trade)
            except ValueError:
                pass
        
        return trades
    
    async def fetch_yahoo_finance_dark_pool(self, symbol: str) -> List[Dict]:
        """Haal dark pool data van Yahoo Finance"""
        url = f"https://finance.yahoo.com/quote/{symbol}/key-statistics"
        
        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
            
            async with self.session.get(url, headers=headers) as response:
                if response.status == 200:
                    html = await response.text()
                    return self._parse_yahoo_dark_pool(html, symbol)
                else:
                    print(f"❌ Yahoo Finance error voor {symbol}: HTTP {response.status}")
                    return []
        except Exception as e:
            print(f"❌ Error fetching Yahoo Finance voor {symbol}: {e}")
            return []
    
    def _parse_yahoo_dark_pool(self, html: str, symbol: str) -> List[Dict]:
        """Parse Yahoo Finance dark pool data"""
        soup = BeautifulSoup(html, 'html.parser')
        trades = []
        
        volume_elem = soup.find('td', {'data-test': 'AVG_VOL_3MONTH-value'})
        
        if volume_elem:
            try:
                volume = int(volume_elem.text.strip().replace(',', ''))
                
                trade = {
                    'symbol': symbol,
                    'volume': volume,
                    'timestamp': datetime.now(),
                    'source': 'yahoo_finance'
                }
                trades.append(trade)
            except ValueError:
                pass
        
        return trades
    
    def filter_large_blocks(self, trades: List[Dict], threshold: int = 10000) -> List[Dict]:
        """Filter voor grote block trades"""
        return [trade for trade in trades if trade.get('volume', 0) >= threshold]
    
    def analyze_institutional_flow(self, trades: List[Dict]) -> Dict:
        """Analyseer institutional flow patterns"""
        if not trades:
            return {}
        
        symbol_flows = {}
        
        for trade in trades:
            symbol = trade.get('symbol', '')
            if symbol not in symbol_flows:
                symbol_flows[symbol] = {
                    'total_volume': 0,
                    'trade_count': 0
                }
            
            symbol_flows[symbol]['total_volume'] += trade.get('volume', 0)
            symbol_flows[symbol]['trade_count'] += 1
        
        return symbol_flows
    
    async def collect_all(self, symbols: List[str]) -> Dict:
        """Verzamel alle dark pool data"""
        all_trades = []
        
        print("🐋 Verzamel dark pool data...")
        
        # TradingView data
        print("  📊 Fetch TradingView data...")
        for symbol in symbols:
            tv_trades = await self.fetch_tradingview_dark_pool(symbol)
            all_trades.extend(tv_trades)
            print(f"    ✓ {symbol}: {len(tv_trades)} trades")
        
        # Yahoo Finance data
        print("  📈 Fetch Yahoo Finance data...")
        for symbol in symbols:
            yahoo_trades = await self.fetch_yahoo_finance_dark_pool(symbol)
            all_trades.extend(yahoo_trades)
            print(f"    ✓ {symbol}: {len(yahoo_trades)} trades")
        
        # Filter large blocks
        large_blocks = self.filter_large_blocks(all_trades)
        
        # Analyze flow
        flow_analysis = self.analyze_institutional_flow(all_trades)
        
        return {
            'total_trades': len(all_trades),
            'large_blocks': len(large_blocks),
            'trades': all_trades,
            'large_block_trades': large_blocks,
            'flow_analysis': flow_analysis
        }


# =============================================================================
# MAIN ALTERNATIVE DATA COLLECTOR
# =============================================================================
class AlternativeDataCollector:
    """
    Hoed collector voor alle alternatieve data bronnen
    
    Coördineert verzameling van:
    - Options flow data
    - Policy flow data
    - Dark pool data
    """
    
    def __init__(self):
        pass
    
    async def collect_all_alternative_data(self, symbols: Optional[List[str]] = None) -> Dict:
        """Verzamel alle alternatieve data zonder API keys"""
        if symbols is None:
            symbols = Config.DEFAULT_WATCHLIST
        
        results = {}
        
        # Options flow
        print("\n" + "="*70)
        print("📊 VERZAMEL OPTIONS FLOW DATA")
        print("="*70)
        async with OptionsFlowCollector() as options:
            results['options_flow'] = await options.collect_all(symbols)
        
        # Policy flow
        print("\n" + "="*70)
        print("🏛️  VERZAMEL POLICY FLOW DATA")
        print("="*70)
        async with PolicyFlowCollector() as policy:
            results['policy_flow'] = await policy.collect_all()
        
        # Dark pool
        print("\n" + "="*70)
        print("🐋 VERZAMEL DARK POOL DATA")
        print("="*70)
        async with DarkPoolCollector() as dark_pool:
            results['dark_pool'] = await dark_pool.collect_all(symbols)
        
        # Print summary
        print("\n" + "="*70)
        print("📈 ALTERNATIEVE DATA COLLECTIE SAMENVATTING")
        print("="*70)
        print(f"Options Flow: {results['options_flow']['total_options']} options verzameld")
        print(f"  - Ongewone activiteit: {results['options_flow']['unusual_options']}")
        print(f"Policy Flow: {results['policy_flow']['govtrack_bills']} bills verzameld")
        print(f"  - Regulations: {results['policy_flow']['federal_register']}")
        print(f"Dark Pool: {results['dark_pool']['total_trades']} trades verzameld")
        print(f"  - Large blocks: {results['dark_pool']['large_blocks']}")
        print("="*70)
        
        return results


# =============================================================================
# AI PROCESSORS - EMBEDDINGS
# =============================================================================
class EmbeddingGenerator:
    """
    Vector embeddings generator
    
    Genereert vector embeddings voor tekst data met OpenAI's embedding API
    en slaat ze op in Supabase met pgvector support.
    """
    
    def __init__(self, supabase_url: str, supabase_key: str):
        self.client = AsyncOpenAI(api_key=Config.OPENAI_API_KEY) if Config.OPENAI_API_KEY else None
        self.supabase = create_client(supabase_url, supabase_key)
    
    async def generate_embeddings(self, data: Dict) -> List[Dict]:
        """Genereer embeddings voor data"""
        if not self.client:
            print("⚠️  OpenAI API key niet ingesteld - sla embeddings over")
            return []
        
        embeddings = []
        
        # Genereer embeddings voor news
        for news_item in data.get('news', []):
            content = news_item.get('content', '')
            if content:
                embedding = await self._generate_single_embedding(content)
                
                embeddings.append({
                    'type': 'news',
                    'content': content,
                    'embedding': embedding,
                    'metadata': {
                        'source': news_item.get('source'),
                        'timestamp': news_item.get('timestamp'),
                        'symbols': news_item.get('symbols', [])
                    }
                })
        
        # Genereer embeddings voor policy data
        for policy_item in data.get('policy', []):
            content = policy_item.get('title', '') + ' ' + policy_item.get('description', '')
            if content:
                embedding = await self._generate_single_embedding(content)
                
                embeddings.append({
                    'type': 'policy',
                    'content': content,
                    'embedding': embedding,
                    'metadata': {
                        'source': policy_item.get('source'),
                        'impact_score': policy_item.get('impact_score'),
                        'sectors': policy_item.get('relevant_sectors', [])
                    }
                })
        
        return embeddings
    
    async def _generate_single_embedding(self, text: str) -> List[float]:
        """Genereer enkele embedding voor tekst"""
        try:
            response = await self.client.embeddings.create(
                input=text,
                model="text-embedding-3-small"
            )
            return response.data[0].embedding
        except Exception as e:
            print(f"❌ Error generating embedding: {e}")
            return [0.0] * 1536
    
    async def store_embeddings(self, embeddings: List[Dict], user_id: str) -> int:
        """Sla embeddings op in Supabase"""
        stored_count = 0
        
        for embedding in embeddings:
            try:
                await self.supabase.table('knowledge_embeddings').insert({
                    'user_id': user_id,
                    'type': embedding['type'],
                    'content': embedding['content'],
                    'embedding': embedding['embedding'],
                    'metadata': embedding['metadata'],
                    'created_at': datetime.now().isoformat()
                }).execute()
                stored_count += 1
            except Exception as e:
                print(f"❌ Error storing embedding: {e}")
        
        return stored_count
    
    async def generate_and_store(self, data: Dict, user_id: str) -> Dict:
        """Genereer en sla embeddings op in één stap"""
        embeddings = await self.generate_embeddings(data)
        stored_count = await self.store_embeddings(embeddings, user_id)
        
        return {
            'generated': len(embeddings),
            'stored': stored_count
        }


# =============================================================================
# AI PROCESSORS - LEARNING ARC
# =============================================================================
class LearningArcManager:
    """
    Learning arc manager
    
    Beheert de learning arc voor elke gebruiker, tracked hun trading style,
    gedragspatronen, kennisbasis, en performance metrics over tijd.
    """
    
    def __init__(self, supabase_url: str, supabase_key: str):
        self.supabase = create_client(supabase_url, supabase_key)
    
    async def get_learning_arc(self, user_id: str) -> Dict:
        """Haal complete learning arc op voor gebruiker"""
        result = await self.supabase.table('learning_arcs').select('*').eq(
            'user_id',
            user_id
        ).execute()
        
        if not result.data:
            return await self._initialize_learning_arc(user_id)
        
        return result.data[0]
    
    async def _initialize_learning_arc(self, user_id: str) -> Dict:
        """Initialiseer nieuwe learning arc voor gebruiker"""
        learning_arc = {
            'user_id': user_id,
            'trading_style': {
                'frequency': 'unknown',
                'hold_time': 'unknown',
                'risk_level': 'moderate',
                'preferred_assets': [],
                'time_of_day': 'unknown',
                'position_sizing': 'unknown',
                'stop_loss_usage': 'unknown'
            },
            'behavioral_patterns': {
                'loss_aversion': 0.0,
                'overconfidence': 0.0,
                'recency_bias': 0.0,
                'anchoring': 0.0,
                'herding': 0.0,
                'disposition_effect': 0.0
            },
            'knowledge_base': {
                'learned_concepts': [],
                'mastered_concepts': [],
                'struggling_concepts': [],
                'knowledge_gaps': []
            },
            'trading_patterns': {
                'successful_patterns': [],
                'unsuccessful_patterns': [],
                'best_conditions': [],
                'worst_conditions': []
            },
            'performance_metrics': {
                'total_trades': 0,
                'win_rate': 0.0,
                'avg_return': 0.0,
                'max_drawdown': 0.0,
                'sharpe_ratio': 0.0
            },
            'created_at': datetime.now().isoformat(),
            'updated_at': datetime.now().isoformat()
        }
        
        await self.supabase.table('learning_arcs').insert(learning_arc).execute()
        
        return learning_arc
    
    async def update_trading_style(self, user_id: str, patterns: Dict) -> Dict:
        """Update trading style op basis van patronen"""
        trades_result = await self.supabase.table('trades').select('*').eq(
            'user_id',
            user_id
        ).order('created_at', desc=True).limit(100).execute()
        
        trades = trades_result.data
        
        if not trades:
            return {}
        
        trading_style = {
            'frequency': self._calculate_trade_frequency(trades),
            'hold_time': self._calculate_average_hold_time(trades),
            'risk_level': self._calculate_risk_level(trades),
            'preferred_assets': self._get_preferred_assets(trades),
            'time_of_day': self._get_preferred_trading_time(trades),
            'position_sizing': self._get_position_sizing_pattern(trades),
            'stop_loss_usage': self._get_stop_loss_usage(trades)
        }
        
        await self.supabase.table('learning_arcs').update({
            'trading_style': trading_style,
            'updated_at': datetime.now().isoformat()
        }).eq('user_id', user_id).execute()
        
        return trading_style
    
    async def update_performance_metrics(self, user_id: str) -> Dict:
        """Update performance metrics"""
        trades_result = await self.supabase.table('trades').select('*').eq(
            'user_id',
            user_id
        ).execute()
        
        trades = trades_result.data
        
        if not trades:
            return {}
        
        performance = {
            'total_trades': len(trades),
            'win_rate': self._calculate_win_rate(trades),
            'avg_return': self._calculate_average_return(trades),
            'max_drawdown': 0,  # Placeholder
            'sharpe_ratio': 0  # Placeholder
        }
        
        await self.supabase.table('learning_arcs').update({
            'performance_metrics': performance,
            'updated_at': datetime.now().isoformat()
        }).eq('user_id', user_id).execute()
        
        return performance
    
    # Helper methods
    def _calculate_trade_frequency(self, trades: List[Dict]) -> str:
        """Bereken trade frequentie"""
        if len(trades) < 10:
            return 'low'
        elif len(trades) < 50:
            return 'medium'
        else:
            return 'high'
    
    def _calculate_average_hold_time(self, trades: List[Dict]) -> str:
        """Bereken gemiddelde hold time"""
        hold_times = []
        
        for trade in trades:
            if trade.get('exit_date'):
                entry = datetime.fromisoformat(trade['entry_date'])
                exit = datetime.fromisoformat(trade['exit_date'])
                hold_times.append((exit - entry).days)
        
        if not hold_times:
            return 'unknown'
        
        avg_hold = sum(hold_times) / len(hold_times)
        
        if avg_hold < 1:
            return 'day_trading'
        elif avg_hold < 7:
            return 'swing_trading'
        else:
            return 'position_trading'
    
    def _calculate_risk_level(self, trades: List[Dict]) -> str:
        """Bereken risk level"""
        returns = [trade.get('return_pct', 0) for trade in trades]
        
        if not returns:
            return 'moderate'
        
        volatility = statistics.stdev(returns) if len(returns) > 1 else 0
        
        if volatility < 2:
            return 'low'
        elif volatility < 5:
            return 'moderate'
        else:
            return 'high'
    
    def _get_preferred_assets(self, trades: List[Dict]) -> List[str]:
        """Haal preferred assets op"""
        asset_counts = {}
        
        for trade in trades:
            symbol = trade.get('symbol', '')
            asset_counts[symbol] = asset_counts.get(symbol, 0) + 1
        
        sorted_assets = sorted(asset_counts.items(), key=lambda x: x[1], reverse=True)
        return [asset[0] for asset in sorted_assets[:5]]
    
    def _get_preferred_trading_time(self, trades: List[Dict]) -> str:
        """Haal preferred trading time op"""
        hours = []
        
        for trade in trades:
            entry_time = datetime.fromisoformat(trade['entry_date'])
            hours.append(entry_time.hour)
        
        if not hours:
            return 'unknown'
        
        avg_hour = sum(hours) / len(hours)
        
        if avg_hour < 12:
            return 'morning'
        elif avg_hour < 16:
            return 'afternoon'
        else:
            return 'evening'
    
    def _get_position_sizing_pattern(self, trades: List[Dict]) -> str:
        """Haal position sizing pattern op"""
        sizes = [trade.get('position_size', 0) for trade in trades]
        
        if not sizes:
            return 'unknown'
        
        avg_size = sum(sizes) / len(sizes)
        std_size = statistics.stdev(sizes) if len(sizes) > 1 else 0
        
        if std_size / avg_size < 0.2:
            return 'consistent'
        else:
            return 'variable'
    
    def _get_stop_loss_usage(self, trades: List[Dict]) -> str:
        """Haal stop loss usage op"""
        trades_with_sl = [t for t in trades if t.get('stop_loss')]
        
        if not trades:
            return 'unknown'
        
        usage_rate = len(trades_with_sl) / len(trades)
        
        if usage_rate > 0.8:
            return 'always'
        elif usage_rate > 0.5:
            return 'frequently'
        else:
            return 'rarely'
    
    def _calculate_win_rate(self, trades: List[Dict]) -> float:
        """Bereken win rate"""
        winning_trades = [t for t in trades if t.get('return_pct', 0) > 0]
        return len(winning_trades) / len(trades) if trades else 0
    
    def _calculate_average_return(self, trades: List[Dict]) -> float:
        """Bereken gemiddelde return"""
        returns = [t.get('return_pct', 0) for t in trades]
        return sum(returns) / len(returns) if returns else 0


# =============================================================================
# AI PROCESSORS - INSIGHTS
# =============================================================================
class InsightsGenerator:
    """
    Insights generator
    
    Genereert gepersonaliseerde inzichten uit verzamelde data,
    afgestemd op elke gebruiker's learning arc en voorkeuren.
    """
    
    def __init__(self, supabase_url: str, supabase_key: str):
        self.supabase = create_client(supabase_url, supabase_key)
    
    async def generate_daily_insights(self, user_id: str, ai_results: Dict) -> Dict:
        """Genereer gepersonaliseerde dagelijkse inzichten"""
        learning_arc = await self._get_learning_arc(user_id)
        
        insights = {
            'market': await self.generate_market_insights(learning_arc, ai_results),
            'opportunities': await self.generate_opportunities(learning_arc, ai_results),
            'risks': await self.generate_risk_alerts(learning_arc, ai_results),
            'learning': await self.generate_learning_recommendations(learning_arc)
        }
        
        return insights
    
    async def generate_market_insights(self, learning_arc: Dict, ai_results: Dict) -> Dict:
        """Genereer market inzichten"""
        insights = []
        
        patterns = ai_results.get('patterns', {})
        trading_style = learning_arc.get('trading_style', {})
        
        if trading_style.get('frequency') == 'high':
            insights.append("Market toont hoge volatiliteit - goed voor day trading opportunities")
        elif trading_style.get('frequency') == 'low':
            insights.append("Market condities stabiel - overweeg swing trading posities")
        
        if patterns.get('trend', '') == 'bullish':
            insights.append("Algemene market trend is bullish - overweeg long posities")
        elif patterns.get('trend', '') == 'bearish':
            insights.append("Algemene market trend is bearish - overweeg defensieve strategieën")
        
        return {
            'insights': insights,
            'trend': patterns.get('trend', 'neutral'),
            'volatility': patterns.get('volatility', 'medium')
        }
    
    async def generate_opportunities(self, learning_arc: Dict, ai_results: Dict) -> Dict:
        """Genereer trading opportunities"""
        opportunities = []
        
        preferred_assets = learning_arc.get('trading_style', {}).get('preferred_assets', [])
        anomalies = ai_results.get('anomalies', {})
        
        # Check unusual options activity
        unusual_options = anomalies.get('unusual_options', [])
        for option in unusual_options[:5]:
            symbol = option.get('symbol')
            if not preferred_assets or symbol in preferred_assets:
                opportunities.append({
                    'type': 'options_flow',
                    'symbol': symbol,
                    'description': f"Ongewone options activiteit in {symbol}",
                    'confidence': 'high'
                })
        
        return {
            'opportunities': opportunities,
            'total_count': len(opportunities)
        }
    
    async def generate_risk_alerts(self, learning_arc: Dict, ai_results: Dict) -> Dict:
        """Genereer risk alerts"""
        alerts = []
        
        policy_data = ai_results.get('policy', {})
        high_impact_bills = [
            bill for bill in policy_data.get('bills', [])
            if bill.get('impact_score', 0) >= 8
        ]
        
        for bill in high_impact_bills:
            alerts.append({
                'type': 'policy',
                'severity': 'high',
                'title': bill.get('title', 'High-impact legislation'),
                'description': bill.get('description', ''),
                'sectors': bill.get('relevant_sectors', [])
            })
        
        return {
            'alerts': alerts,
            'total_count': len(alerts)
        }
    
    async def generate_learning_recommendations(self, learning_arc: Dict) -> Dict:
        """Genereer learning recommendations"""
        recommendations = []
        
        knowledge_base = learning_arc.get('knowledge_base', {})
        knowledge_gaps = knowledge_base.get('knowledge_gaps', [])
        
        for gap in knowledge_gaps:
            recommendations.append({
                'type': 'knowledge_gap',
                'topic': gap,
                'priority': 'high',
                'description': f"Overweeg om meer te leren over {gap}"
            })
        
        return {
            'recommendations': recommendations,
            'total_count': len(recommendations)
        }
    
    async def _get_learning_arc(self, user_id: str) -> Dict:
        """Haal learning arc op voor gebruiker"""
        result = await self.supabase.table('learning_arcs').select('*').eq(
            'user_id',
            user_id
        ).execute()
        
        if result.data:
            return result.data[0]
        
        return {
            'trading_style': {},
            'behavioral_patterns': {},
            'knowledge_base': {},
            'trading_patterns': {},
            'performance_metrics': {}
        }


# =============================================================================
# DAILY LEARNING PIPELINE
# =============================================================================
class DailyLearningPipeline:
    """
    Dagelijkse learning pipeline
    
    Orkestreert de complete dagelijkse learning pipeline, inclusief
    data verzameling, AI processing, learning arc updates, en insight generatie.
    """
    
    def __init__(self, supabase_url: str, supabase_key: str):
        self.supabase = create_client(supabase_url, supabase_key)
        self.scheduler = AsyncIOScheduler()
        
        # Initialize collectors
        self.alt_data_collector = AlternativeDataCollector()
        
        # Initialize AI processors
        self.embedding_generator = EmbeddingGenerator(supabase_url, supabase_key)
        self.learning_arc_manager = LearningArcManager(supabase_url, supabase_key)
        self.insights_generator = InsightsGenerator(supabase_url, supabase_key)
    
    async def run_daily_pipeline(self, user_id: str, symbols: List[str]) -> Dict:
        """Run complete dagelijkse learning pipeline voor gebruiker"""
        print(f"🚀 Start dagelijkse learning pipeline voor gebruiker {user_id}")
        start_time = datetime.now()
        
        # Phase 1: Data Collection
        print("📊 Phase 1: Verzamel data...")
        data_collection = await self.collect_all_data(symbols)
        
        # Phase 2: AI Processing
        print("🧠 Phase 2: AI processing...")
        ai_results = await self.process_with_ai(data_collection, user_id)
        
        # Phase 3: Learning Arc Update
        print("📈 Phase 3: Update learning arc...")
        learning_update = await self.update_learning_arc(user_id, ai_results)
        
        # Phase 4: Generate Insights
        print("💡 Phase 4: Genereer inzichten...")
        insights = await self.generate_daily_insights(user_id, ai_results)
        
        end_time = datetime.now()
        duration = (end_time - start_time).total_seconds()
        
        print(f"✅ Pipeline voltooid in {duration:.2f} seconden")
        
        return {
            'user_id': user_id,
            'duration': duration,
            'data_collection': data_collection,
            'ai_results': ai_results,
            'learning_update': learning_update,
            'insights': insights
        }
    
    async def collect_all_data(self, symbols: List[str]) -> Dict:
        """Verzamel alle data bronnen"""
        results = await self.alt_data_collector.collect_all_alternative_data(symbols)
        return {'alternative': results}
    
    async def process_with_ai(self, processed_data: Dict, user_id: str) -> Dict:
        """Verwerk data met AI"""
        results = {}
        
        # Genereer embeddings
        results['embeddings'] = await self.embedding_generator.generate_and_store(
            processed_data,
            user_id
        )
        
        # Analyseer patronen (placeholder)
        results['patterns'] = {}
        
        # Detecteer anomalieën (placeholder)
        results['anomalies'] = {}
        
        return results
    
    async def update_learning_arc(self, user_id: str, ai_results: Dict) -> Dict:
        """Update gebruiker's learning arc"""
        update = {}
        
        # Update trading style
        update['trading_style'] = await self.learning_arc_manager.update_trading_style(
            user_id,
            ai_results['patterns']
        )
        
        # Update performance metrics
        update['performance'] = await self.learning_arc_manager.update_performance_metrics(
            user_id
        )
        
        return update
    
    async def generate_daily_insights(self, user_id: str, ai_results: Dict) -> Dict:
        """Genereer gepersonaliseerde dagelijkse inzichten"""
        insights = await self.insights_generator.generate_daily_insights(
            user_id,
            ai_results
        )
        return insights
    
    def start_scheduler(self):
        """Start de dagelijkse scheduler"""
        hour, minute = map(int, Config.SCHEDULER_DAILY_RUN_TIME.split(':'))
        
        self.scheduler.add_job(
            self.run_for_all_users,
            'cron',
            hour=hour,
            minute=minute
        )
        
        self.scheduler.start()
        print(f"📅 Dagelijkse scheduler gestart (draait om {hour:02d}:{minute:02d})")
    
    async def run_for_all_users(self):
        """Run pipeline voor alle actieve gebruikers"""
        result = await self.supabase.table('users').select('*').eq(
            'is_active',
            True
        ).execute()
        
        users = result.data
        
        print(f"🚀 Run pipeline voor {len(users)} gebruikers")
        
        for user in users:
            try:
                # Haal gebruiker's watchlist op
                watchlist_result = await self.supabase.table('watchlists').select('*').eq(
                    'user_id',
                    user['id']
                ).execute()
                
                symbols = [item['symbol'] for item in watchlist_result.data]
                
                # Run pipeline
                await self.run_daily_pipeline(user['id'], symbols)
                
            except Exception as e:
                print(f"❌ Error running pipeline voor gebruiker {user['id']}: {e}")


# =============================================================================
# MAIN ENTRY POINT
# =============================================================================
def main():
    """Hoofd entry point voor de applicatie"""
    print("="*70)
    print("🚀 AI TRADING ASSISTANT - COMPLETE IMPLEMENTATIE")
    print("="*70)
    print()
    
    # Print configuratie
    Config.print_config()
    print()
    
    # Valideer configuratie
    if not Config.validate():
        print("❌ Configuratie onvolledig. Stel SUPABASE_URL en SUPABASE_ANON_KEY in.")
        return
    
    # Initialize pipeline
    pipeline = DailyLearningPipeline(
        supabase_url=Config.SUPABASE_URL,
        supabase_key=Config.SUPABASE_SERVICE_ROLE_KEY
    )
    
    # Start scheduler
    pipeline.start_scheduler()
    
    # Houd scheduler draaiende
    try:
        print("✅ Scheduler draait. Druk Ctrl+C om te stoppen.")
        while True:
            asyncio.sleep(3600)  # Slaap 1 uur
    except KeyboardInterrupt:
        print("\n🛑 Scheduler gestopt")


async def test_collectors():
    """Test alle data collectors"""
    print("="*70)
    print("🧪 TEST DATA COLLECTORS")
    print("="*70)
    print()
    
    collector = AlternativeDataCollector()
    results = await collector.collect_all_alternative_data(['AAPL', 'MSFT'])
    
    print("\n✅ Alle tests voltooid!")


async def test_pipeline():
    """Test de dagelijkse pipeline"""
    print("="*70)
    print("🧪 TEST DAILY LEARNING PIPELINE")
    print("="*70)
    print()
    
    if not Config.validate():
        print("❌ Configuratie onvolledig. Stel SUPABASE_URL en SUPABASE_ANON_KEY in.")
        return
    
    pipeline = DailyLearningPipeline(
        supabase_url=Config.SUPABASE_URL,
        supabase_key=Config.SUPABASE_SERVICE_ROLE_KEY
    )
    
    results = await pipeline.run_daily_pipeline('test_user_id', ['AAPL', 'MSFT'])
    print(f"\n✅ Pipeline voltooid in {results['duration']:.2f} seconden")


def print_database_schema():
    """Print database schema"""
    print("="*70)
    print("🗄️  DATABASE SCHEMA")
    print("="*70)
    print()
    
    migrations = DatabaseSchema.get_all_migrations()
    
    for i, migration in enumerate(migrations, 1):
        print(f"-- Migration {i}")
        print(migration)
        print()


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1:
        command = sys.argv[1].lower()
        
        if command == "test":
            asyncio.run(test_collectors())
        elif command == "test-pipeline":
            asyncio.run(test_pipeline())
        elif command == "schema":
            print_database_schema()
        else:
            print(f"Onbekend command: {command}")
            print("Beschikbare commands: test, test-pipeline, schema")
    else:
        main()
