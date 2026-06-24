# AXE Companion - API Specification
## OpenAPI 3.0.3 Compliant REST API + WebSocket

> **Version**: 1.0.0 | **Base URL**: `/api/v1` | **Date**: 2026-06-23

---

## Overview

The AXE Companion API provides programmatic access to:
- **Authentication**: User registration, login, token management
- **Trading**: Trade journal CRUD, trade statistics
- **Data Collection**: Trigger on-demand data collection
- **Insights**: AI-generated daily insights and recommendations
- **Learning Arc**: User behavior analysis and progress tracking
- **Gamification**: XP, badges, leaderboards, challenges
- **AI Agents**: Run specialized AI agents for analysis
- **Embeddings**: Semantic search over collected data

---

## Authentication

All endpoints (except `/auth/*`) require a Bearer token:
```
Authorization: Bearer <supabase_jwt_token>
```

---

## Endpoints

### Authentication

#### POST /api/v1/auth/register
Register a new user account.

**Request Body**:
```json
{
  "email": "trader@example.com",
  "password": "secure_password_123",
  "trading_experience": "intermediate"
}
```

**Response 201**:
```json
{
  "success": true,
  "data": {
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "trader@example.com",
    "access_token": "eyJhbGciOiJIUzI1NiIs...",
    "refresh_token": "eyJhbGciOiJIUzI1NiIs..."
  },
  "meta": {
    "timestamp": "2026-06-23T10:00:00Z",
    "request_id": "uuid"
  }
}
```

**Response 400**:
```json
{
  "success": false,
  "error": {
    "code": "EMAIL_EXISTS",
    "message": "An account with this email already exists"
  }
}
```

---

#### POST /api/v1/auth/login
Authenticate and receive tokens.

**Request Body**:
```json
{
  "email": "trader@example.com",
  "password": "secure_password_123"
}
```

**Response 200**:
```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIs...",
    "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
    "expires_in": 3600,
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "trader@example.com",
      "is_active": true
    }
  }
}
```

---

#### POST /api/v1/auth/refresh
Refresh an expired access token.

**Request Body**:
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response 200**:
```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIs...",
    "expires_in": 3600
  }
}
```

---

#### DELETE /api/v1/auth/logout
Revoke current session.

**Response 204**: No content

---

### User Management

#### GET /api/v1/users/me
Get current user profile.

**Response 200**:
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "trader@example.com",
    "is_active": true,
    "created_at": "2026-01-15T08:30:00Z",
    "trading_level": "day_trader",
    "total_xp": 1250,
    "current_streak": 5
  }
}
```

---

#### PUT /api/v1/users/me
Update user profile.

**Request Body**:
```json
{
  "trading_level": "swing_trader",
  "risk_profile": "moderate",
  "timezone": "Europe/Amsterdam"
}
```

**Response 200**: Updated user object

---

#### GET /api/v1/users/me/preferences
Get user preferences.

**Response 200**:
```json
{
  "success": true,
  "data": {
    "notification_enabled": true,
    "notification_email_enabled": true,
    "notification_push_enabled": true,
    "notification_time": "08:00",
    "timezone": "Europe/Amsterdam",
    "language": "en",
    "theme": "dark"
  }
}
```

---

#### PUT /api/v1/users/me/preferences
Update user preferences.

**Request Body**:
```json
{
  "notification_enabled": true,
  "notification_time": "07:30",
  "theme": "dark"
}
```

---

### Trades

#### GET /api/v1/trades
List user's trades with pagination.

**Query Parameters**:
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| page | integer | No | 1 | Page number |
| limit | integer | No | 20 | Items per page (max 100) |
| symbol | string | No | - | Filter by symbol |
| start_date | date | No | - | Filter from date |
| end_date | date | No | - | Filter to date |
| status | string | No | - | 'open', 'closed', 'all' |

**Response 200**:
```json
{
  "success": true,
  "data": {
    "trades": [
      {
        "id": "uuid",
        "symbol": "EURUSD",
        "entry_date": "2026-06-22",
        "exit_date": "2026-06-22",
        "entry_price": 1.0850,
        "exit_price": 1.0900,
        "position_size": 10000,
        "return_pct": 0.46,
        "stop_loss": 1.0820,
        "take_profit": 1.0900,
        "notes": "Breakout trade",
        "created_at": "2026-06-22T14:30:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 156,
      "total_pages": 8
    }
  }
}
```

---

#### POST /api/v1/trades
Create a new trade.

**Request Body**:
```json
{
  "symbol": "EURUSD",
  "entry_date": "2026-06-23",
  "entry_price": 1.0850,
  "position_size": 10000,
  "stop_loss": 1.0820,
  "take_profit": 1.0900,
  "notes": "Bullish engulfing pattern",
  "direction": "long"
}
```

**Response 201**: Created trade object

---

#### GET /api/v1/trades/{id}
Get trade details.

**Path Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| id | UUID | Trade ID |

**Response 200**: Trade object with full details

---

#### PUT /api/v1/trades/{id}
Update a trade.

**Request Body** (partial update supported):
```json
{
  "exit_date": "2026-06-23",
  "exit_price": 1.0900,
  "notes": "Updated: Target reached"
}
```

---

#### DELETE /api/v1/trades/{id}
Delete a trade.

**Response 204**: No content

---

#### GET /api/v1/trades/stats
Get trade statistics.

**Query Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| period | string | No | 'week', 'month', 'year', 'all' |

**Response 200**:
```json
{
  "success": true,
  "data": {
    "period": "month",
    "total_trades": 45,
    "winning_trades": 28,
    "losing_trades": 17,
    "win_rate": 62.2,
    "avg_return": 0.35,
    "avg_win": 0.82,
    "avg_loss": -0.42,
    "profit_factor": 1.95,
    "max_drawdown": -2.1,
    "sharpe_ratio": 1.45,
    "best_trade": 2.35,
    "worst_trade": -1.20,
    "total_pnl": 12.5
  }
}
```

---

### Watchlist

#### GET /api/v1/watchlist
Get user's watchlist.

**Response 200**:
```json
{
  "success": true,
  "data": {
    "symbols": ["AAPL", "MSFT", "GOOGL", "EURUSD", "XAUUSD"],
    "count": 5
  }
}
```

---

#### POST /api/v1/watchlist
Add symbol to watchlist.

**Request Body**:
```json
{
  "symbol": "NVDA"
}
```

**Response 201**:
```json
{
  "success": true,
  "data": {
    "symbol": "NVDA",
    "added_at": "2026-06-23T10:00:00Z"
  }
}
```

---

#### DELETE /api/v1/watchlist/{symbol}
Remove symbol from watchlist.

**Response 204**: No content

---

### Data Collection

#### POST /api/v1/collect/options
Trigger options flow collection.

**Request Body**:
```json
{
  "symbols": ["AAPL", "MSFT"]
}
```

**Response 202 Accepted** (async processing):
```json
{
  "success": true,
  "data": {
    "job_id": "uuid",
    "status": "processing",
    "symbols": ["AAPL", "MSFT"],
    "estimated_duration_seconds": 30
  }
}
```

---

#### POST /api/v1/collect/policy
Trigger policy flow collection.

**Response 202 Accepted**

---

#### POST /api/v1/collect/darkpool
Trigger dark pool collection.

**Request Body**:
```json
{
  "symbols": ["AAPL", "MSFT", "GOOGL"]
}
```

**Response 202 Accepted**

---

#### POST /api/v1/collect/all
Trigger all data collections.

**Request Body**:
```json
{
  "symbols": ["AAPL", "MSFT", "GOOGL"],
  "collections": ["options", "policy", "darkpool"]
}
```

**Response 202 Accepted**

---

#### GET /api/v1/collect/status/{job_id}
Get collection job status.

**Response 200**:
```json
{
  "success": true,
  "data": {
    "job_id": "uuid",
    "status": "completed",
    "progress": 100,
    "results": {
      "options_collected": 234,
      "unusual_options": 12,
      "bills_collected": 5,
      "trades_collected": 89
    },
    "started_at": "2026-06-23T06:00:00Z",
    "completed_at": "2026-06-23T06:15:00Z"
  }
}
```

---

### Insights

#### GET /api/v1/insights/daily
Get daily personalized insights.

**Response 200**:
```json
{
  "success": true,
  "data": {
    "date": "2026-06-23",
    "market": {
      "trend": "bullish",
      "volatility": "high",
      "insights": [
        "Market shows high volatility - good for day trading opportunities",
        "General market trend is bullish - consider long positions"
      ]
    },
    "opportunities": {
      "total_count": 3,
      "items": [
        {
          "type": "options_flow",
          "symbol": "AAPL",
          "description": "Unusual options activity in AAPL",
          "confidence": "high"
        }
      ]
    },
    "risks": {
      "total_count": 1,
      "alerts": [
        {
          "type": "policy",
          "severity": "high",
          "title": "New Financial Regulation Proposal",
          "description": "...",
          "sectors": ["finance", "technology"]
        }
      ]
    },
    "learning": {
      "total_count": 2,
      "recommendations": [
        {
          "type": "knowledge_gap",
          "topic": "Risk Management",
          "priority": "high",
          "description": "Consider learning more about position sizing"
        }
      ]
    }
  }
}
```

---

#### GET /api/v1/insights/market
Get market insights.

**Query Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| symbol | string | No | Specific symbol |
| timeframe | string | No | '1d', '1w', '1m' |

---

#### GET /api/v1/insights/opportunities
Get trading opportunities.

**Response 200**:
```json
{
  "success": true,
  "data": {
    "opportunities": [
      {
        "type": "options_flow",
        "symbol": "TSLA",
        "description": "High call volume detected",
        "confidence": 0.85,
        "timestamp": "2026-06-23T09:30:00Z"
      }
    ]
  }
}
```

---

#### GET /api/v1/insights/risks
Get risk alerts.

**Response 200**:
```json
{
  "success": true,
  "data": {
    "alerts": [
      {
        "type": "policy",
        "severity": "high",
        "title": "SEC New Disclosure Requirements",
        "sectors": ["finance"],
        "impact_score": 8,
        "effective_date": "2026-07-01"
      }
    ]
  }
}
```

---

### Learning Arc

#### GET /api/v1/learning-arc
Get user's learning arc.

**Response 200**:
```json
{
  "success": true,
  "data": {
    "user_id": "uuid",
    "trading_style": {
      "frequency": "high",
      "hold_time": "day_trading",
      "risk_level": "moderate",
      "preferred_assets": ["EURUSD", "GBPUSD", "XAUUSD"],
      "time_of_day": "morning",
      "position_sizing": "consistent",
      "stop_loss_usage": "always"
    },
    "behavioral_patterns": {
      "loss_aversion": 0.3,
      "overconfidence": 0.2,
      "recency_bias": 0.4,
      "anchoring": 0.1,
      "herding": 0.2,
      "disposition_effect": 0.3
    },
    "knowledge_base": {
      "learned_concepts": ["Support/Resistance", "RSI"],
      "mastered_concepts": ["Trend Following"],
      "struggling_concepts": ["Fibonacci Retracement"],
      "knowledge_gaps": ["Options Greeks"]
    },
    "performance_metrics": {
      "total_trades": 156,
      "win_rate": 0.62,
      "avg_return": 0.35,
      "max_drawdown": -2.1,
      "sharpe_ratio": 1.45
    }
  }
}
```

---

#### POST /api/v1/learning-arc/update
Trigger learning arc update.

**Response 202 Accepted**

---

#### GET /api/v1/learning-arc/style
Get trading style analysis.

---

#### GET /api/v1/learning-arc/performance
Get performance metrics.

---

### Gamification

#### GET /api/v1/gamification/stats
Get gamification statistics.

**Response 200**:
```json
{
  "success": true,
  "data": {
    "current_level": "day_trader",
    "total_xp": 1250,
    "weekly_xp": 180,
    "streak_days": 5,
    "next_level": "swing_trader",
    "xp_to_next_level": 250,
    "badges_count": 12,
    "challenges_completed": 8,
    "leaderboard_rank": 45
  }
}
```

---

#### GET /api/v1/gamification/badges
Get user's badges.

**Response 200**:
```json
{
  "success": true,
  "data": {
    "badges": [
      {
        "id": "first_win",
        "name": "First Win",
        "description": "Complete your first profitable trade",
        "icon": "trophy",
        "earned_at": "2026-01-20T10:00:00Z",
        "rarity": "common"
      },
      {
        "id": "win_streak_10",
        "name": "10 Win Streak",
        "description": "Win 10 trades in a row",
        "icon": "fire",
        "earned_at": "2026-03-15T14:30:00Z",
        "rarity": "rare"
      }
    ]
  }
}
```

---

#### GET /api/v1/gamification/leaderboard
Get leaderboard.

**Query Parameters**:
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| period | string | No | week | 'week', 'month', 'all_time' |
| limit | integer | No | 50 | Number of entries |

**Response 200**:
```json
{
  "success": true,
  "data": {
    "period": "week",
    "entries": [
      {
        "rank": 1,
        "username": "TraderPro",
        "xp_earned": 450,
        "level": "master_trader",
        "badges": 24
      }
    ],
    "user_rank": 45
  }
}
```

---

#### POST /api/v1/gamification/challenge/complete
Mark a challenge as completed.

**Request Body**:
```json
{
  "challenge_id": "no_overtrading_2026_06_23",
  "evidence": {
    "trades_count": 3,
    "max_risk_ratio": 1.5
  }
}
```

**Response 200**:
```json
{
  "success": true,
  "data": {
    "challenge": "No Over-trading Today",
    "completed": true,
    "xp_earned": 50,
    "badge_unlocked": null,
    "streak_updated": true
  }
}
```

---

### AI Agents

#### POST /api/v1/agents/market/analyze
Run market analysis agent.

**Request Body**:
```json
{
  "symbol": "EURUSD",
  "timeframe": "1H",
  "analysis_type": "technical"
}
```

**Response 200**:
```json
{
  "success": true,
  "data": {
    "agent": "MarketAnalyst",
    "symbol": "EURUSD",
    "timeframe": "1H",
    "analysis": {
      "trend": "bullish",
      "setup": "long",
      "entry": 1.0850,
      "stop_loss": 1.0820,
      "take_profit": 1.0900,
      "confidence": 0.78,
      "reasoning": [
        "Bullish engulfing pattern on 1H",
        "RSI bounced from oversold (32)",
        "Price above 20 EMA"
      ]
    },
    "timestamp": "2026-06-23T10:00:00Z"
  }
}
```

---

#### POST /api/v1/agents/risk/analyze
Run risk analysis agent.

**Request Body**:
```json
{
  "account_balance": 10000,
  "open_positions": [
    {
      "symbol": "EURUSD",
      "size": 10000,
      "direction": "long"
    }
  ]
}
```

**Response 200**:
```json
{
  "success": true,
  "data": {
    "agent": "RiskManager",
    "total_exposure": 0.10,
    "max_position_size": 0.02,
    "daily_loss_limit": 0.02,
    "current_daily_pnl": 0.005,
    "warnings": [],
    "recommendations": [
      "Exposure is within limits",
      "Consider adding stop-loss to open position"
    ]
  }
}
```

---

#### POST /api/v1/agents/council/consensus
Get multi-agent consensus.

**Request Body**:
```json
{
  "symbol": "EURUSD",
  "context": {
    "recent_trades": 5,
    "current_exposure": 0.05
  }
}
```

**Response 200**:
```json
{
  "success": true,
  "data": {
    "consensus_recommendation": "proceed_with_caution",
    "confidence": 0.72,
    "agent_votes": [
      {
        "agent": "MarketAnalyst",
        "recommendation": "enter_long",
        "confidence": 0.80
      },
      {
        "agent": "RiskManager",
        "recommendation": "wait",
        "confidence": 0.65,
        "reason": "High volatility period"
      }
    ],
    "warnings": ["Market volatility is above average"]
  }
}
```

---

### Embeddings / Search

#### POST /api/v1/embeddings/search
Semantic search over embeddings.

**Request Body**:
```json
{
  "query": "Fed interest rate decision impact on EURUSD",
  "type": "policy",
  "limit": 10,
  "threshold": 0.7
}
```

**Response 200**:
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "content": "Federal Reserve maintains interest rates at 5.25%...",
        "type": "policy",
        "similarity": 0.92,
        "metadata": {
          "source": "Federal Register",
          "impact_score": 8,
          "sectors": ["finance"]
        }
      }
    ],
    "total_results": 1
  }
}
```

---

#### POST /api/v1/embeddings/store
Store a new embedding.

**Request Body**:
```json
{
  "content": "Market analysis: EURUSD bullish breakout...",
  "type": "market_analysis",
  "metadata": {
    "symbol": "EURUSD",
    "timestamp": "2026-06-23T10:00:00Z"
  }
}
```

**Response 201**:
```json
{
  "success": true,
  "data": {
    "embedding_id": "uuid",
    "stored": true,
    "dimensions": 1536
  }
}
```

---

## WebSocket Endpoints

### WS /ws/v1/market-data
Real-time market data stream.

**Connection**:
```javascript
const ws = new WebSocket('wss://api.axecompanion.com/ws/v1/market-data');
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(data);
};
```

**Message Format**:
```json
{
  "type": "price_update",
  "symbol": "EURUSD",
  "price": 1.0852,
  "change": 0.0015,
  "change_pct": 0.14,
  "timestamp": "2026-06-23T10:00:00Z"
}
```

---

### WS /ws/v1/alerts
Real-time alert stream.

**Subscribe Message**:
```json
{
  "action": "subscribe",
  "filters": {
    "types": ["options_flow", "policy"],
    "min_confidence": 0.7
  }
}
```

---

### WS /ws/v1/voice
Voice trading session.

**Flow**:
1. Connect to WebSocket
2. Send audio chunks (base64 encoded)
3. Receive transcription + AI response

**Message Format (Client → Server)**:
```json
{
  "type": "audio_chunk",
  "data": "base64_encoded_audio...",
  "sequence": 1
}
```

**Message Format (Server → Client)**:
```json
{
  "type": "transcription",
  "text": "AI, what's my current P&L?",
  "confidence": 0.95
}
```

---

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_REQUEST` | 400 | Malformed request |
| `UNAUTHORIZED` | 401 | Missing or invalid token |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |
| `COLLECTION_FAILED` | 502 | Data collection failed |
| `AI_UNAVAILABLE` | 503 | AI service unavailable |

---

## Rate Limits

| Endpoint Type | Rate Limit |
|---------------|------------|
| Authentication | 10 requests/minute |
| Data collection | 5 requests/hour |
| AI agents | 20 requests/minute |
| General API | 100 requests/minute |
| WebSocket | 1 connection per client |

---

**API Status**: Draft | **Next Version**: 1.1.0 (Webhooks + Batch API)
