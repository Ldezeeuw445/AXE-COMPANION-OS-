# Smart Money — Backend spec

De frontend engine is pure function. Backend moet alleen genormaliseerde `SignalEvent` rijen leveren.

## 1. Supabase schema

```sql
-- enable pgcrypto for gen_random_uuid if needed
create extension if not exists pgcrypto;

create table if not exists signal_events (
  id text primary key,
  channel text not null check (channel in (
    'politician','insider','whale','dark_pool','options','jet','vessel','news'
  )),
  symbol text not null,
  direction text not null check (direction in ('bullish','bearish','neutral')),
  notional_usd numeric,
  headline text not null,
  detail text,
  at timestamptz not null,
  weight numeric,
  meta jsonb,
  created_at timestamptz default now()
);

create index if not exists signal_events_at_desc on signal_events (at desc);
create index if not exists signal_events_symbol_at on signal_events (symbol, at desc);
create index if not exists signal_events_channel_at on signal_events (channel, at desc);

-- optional: RLS policy for read-only anon + write via service role
alter table signal_events enable row level security;
create policy "anon read" on signal_events for select using (true);

-- jet tail-number registry (your secret sauce)
create table if not exists jet_registry (
  tail_number text primary key,
  company text not null,
  ticker text,
  aircraft text,
  home_bases text[] default '{}',
  notes text,
  updated_at timestamptz default now()
);

-- vessel registry for oil/LNG/shipping companies
create table if not exists vessel_registry (
  imo text primary key,
  vessel_name text not null,
  vessel_type text,
  operator text,
  ticker text,
  notes text
);
```

---

## 2. Python ingestion workers (FastAPI + apscheduler)

Één folder per channel. Each worker:
1. Pulls fresh data from its upstream source
2. Normalizes to `SignalEvent` shape
3. Upserts into `signal_events` via Supabase Python client

### 2.1 Shared model (`models.py`)

```python
from pydantic import BaseModel
from typing import Literal, Optional, Dict, Any
from datetime import datetime

Channel = Literal[
    "politician", "insider", "whale",
    "dark_pool", "options", "jet", "vessel", "news"
]
Direction = Literal["bullish", "bearish", "neutral"]

class SignalEvent(BaseModel):
    id: str
    channel: Channel
    symbol: str
    direction: Direction
    notional_usd: Optional[float] = None
    headline: str
    detail: Optional[str] = None
    at: datetime
    weight: Optional[float] = None
    meta: Optional[Dict[str, Any]] = None

    def to_row(self) -> dict:
        row = self.model_dump()
        row["at"] = self.at.isoformat()
        return row
```

### 2.2 Supabase client (`db.py`)

```python
import os
from supabase import create_client, Client

_client: Client | None = None

def supabase() -> Client:
    global _client
    if _client is None:
        _client = create_client(
            os.environ["SUPABASE_URL"],
            os.environ["SUPABASE_SERVICE_ROLE_KEY"],
        )
    return _client

def upsert_events(events: list[dict]) -> None:
    if not events:
        return
    supabase().table("signal_events").upsert(events, on_conflict="id").execute()
```

### 2.3 Politician worker (`workers/politician.py`)

FMP senate-disclosure endpoint or Quiver.

```python
import httpx, os
from datetime import datetime
from models import SignalEvent
from db import upsert_events

FMP_KEY = os.environ["FMP_API_KEY"]

async def run():
    url = f"https://financialmodelingprep.com/api/v4/senate-disclosure-rss?apikey={FMP_KEY}"
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(url)
        r.raise_for_status()
        data = r.json()

    events = []
    for row in data:
        side = (row.get("type") or "").lower()
        if "purchase" in side:
            direction = "bullish"
        elif "sale" in side:
            direction = "bearish"
        else:
            continue

        amt_str = row.get("amount", "")
        notional = _parse_range(amt_str)
        symbol = (row.get("symbol") or "").upper()
        if not symbol:
            continue

        ev = SignalEvent(
            id=f"pol_{row.get('disclosureDate')}_{row.get('representative')}_{symbol}",
            channel="politician",
            symbol=symbol,
            direction=direction,
            notional_usd=notional,
            headline=f"{row.get('representative')} {direction.upper()} {symbol} {amt_str}",
            at=datetime.fromisoformat(row["transactionDate"]),
            meta={"party": row.get("party"), "type": side},
        )
        events.append(ev.to_row())

    upsert_events(events)

def _parse_range(s: str) -> float | None:
    # "$100,001 - $250,000" -> midpoint
    import re
    nums = [int(n.replace(",", "")) for n in re.findall(r"\$([\d,]+)", s)]
    if len(nums) == 2:
        return (nums[0] + nums[1]) / 2
    return nums[0] if nums else None
```

### 2.4 Jet worker (`workers/jet.py`)

ADS-B Exchange via RapidAPI + your jet_registry.

```python
import httpx, os
from datetime import datetime
from models import SignalEvent
from db import supabase, upsert_events

RAPIDAPI_KEY = os.environ["RAPIDAPI_KEY"]
ADSB_HOST = "adsbexchange-com1.p.rapidapi.com"

async def run():
    # load registry
    reg = supabase().table("jet_registry").select("*").execute().data
    by_tail = {r["tail_number"]: r for r in reg}

    events = []
    async with httpx.AsyncClient(
        timeout=30,
        headers={
            "x-rapidapi-key": RAPIDAPI_KEY,
            "x-rapidapi-host": ADSB_HOST,
        },
    ) as client:
        for tail, meta in by_tail.items():
            r = await client.get(
                f"https://{ADSB_HOST}/v2/registration/{tail}/"
            )
            if r.status_code != 200:
                continue
            data = r.json()
            ac = (data.get("ac") or [None])[0]
            if not ac:
                continue

            dest = ac.get("dst") or ac.get("to")
            if not dest:
                continue
            is_home = dest in (meta.get("home_bases") or [])
            if is_home:
                continue  # not interesting

            symbol = meta.get("ticker")
            if not symbol:
                continue

            src = ac.get("src") or ac.get("from") or "???"
            ev = SignalEvent(
                id=f"jet_{tail}_{src}_{dest}_{int(datetime.utcnow().timestamp())}",
                channel="jet",
                symbol=symbol,
                direction="neutral",
                headline=f"{symbol} {meta.get('aircraft', 'jet')} {src} → {dest}",
                detail="Unusual destination vs home bases",
                at=datetime.utcnow(),
                weight=0.5,
                meta={"tail": tail, "src": src, "dst": dest},
            )
            events.append(ev.to_row())

    upsert_events(events)
```

### 2.5 Scheduler (`main.py`)

```python
import asyncio
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from workers import politician, insider, whale, dark_pool, options, jet, vessel, news

def schedule():
    sched = AsyncIOScheduler()
    sched.add_job(politician.run, "interval", minutes=15)
    sched.add_job(insider.run,    "interval", minutes=15)
    sched.add_job(whale.run,      "interval", minutes=1)
    sched.add_job(dark_pool.run,  "interval", minutes=5)
    sched.add_job(options.run,    "interval", minutes=1)
    sched.add_job(jet.run,        "interval", minutes=2)
    sched.add_job(vessel.run,     "interval", minutes=10)
    sched.add_job(news.run,       "interval", minutes=3)
    sched.start()

async def main():
    schedule()
    while True:
        await asyncio.sleep(3600)

if __name__ == "__main__":
    asyncio.run(main())
```

### 2.6 Deploy

- Render / Fly.io / Railway / Hetzner — any can run a long-lived Python process
- Environment: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FMP_API_KEY`, `POLYGON_API_KEY`, `FINNHUB_API_KEY`, `RAPIDAPI_KEY`, `UNUSUAL_WHALES_KEY`, `WHALE_ALERT_KEY`
- Cost-wise: a single $5/month Render worker handles all 8 channels.

---

## 3. Frontend adapter (Supabase JS)

Replace `createStubSmartMoneyDataSource` with:

```js
import { createClient } from "@supabase/supabase-js";

const sb = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);

export function createSupabaseSmartMoneyDataSource() {
  return {
    async listEvents(sinceMs) {
      const sinceIso = new Date(sinceMs || Date.now() - 48 * 3600 * 1000).toISOString();
      const { data, error } = await sb
        .from("signal_events")
        .select("*")
        .gte("at", sinceIso)
        .order("at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data.map(normalize);
    },
  };
}

function normalize(row) {
  return {
    id: row.id,
    channel: row.channel,
    symbol: row.symbol,
    direction: row.direction,
    notionalUsd: row.notional_usd ? Number(row.notional_usd) : undefined,
    headline: row.headline,
    detail: row.detail || undefined,
    at: new Date(row.at).getTime(),
    weight: row.weight != null ? Number(row.weight) : undefined,
    meta: row.meta || undefined,
  };
}
```

Dat is alles. Geen andere frontend changes nodig — de engine blijft hetzelfde.

---

## 4. Notifications (optioneel)

Supabase realtime → Postgres trigger → webhook naar Discord/Telegram bij score-drempel:

```sql
create or replace function notify_big_signal() returns trigger as $$
declare payload jsonb;
begin
  if new.notional_usd >= 10000000 then
    payload := to_jsonb(new);
    perform net.http_post(
      url := 'https://discord.com/api/webhooks/YOUR_WEBHOOK',
      body := jsonb_build_object(
        'content', format('SMART MONEY: %s %s — $%sM — %s',
          new.symbol, upper(new.direction),
          round(new.notional_usd / 1000000),
          new.headline)
      )::text,
      headers := jsonb_build_object('Content-Type', 'application/json')
    );
  end if;
  return new;
end;
$$ language plpgsql;

create trigger sig_notify after insert on signal_events
  for each row execute function notify_big_signal();
```

Vereist de `pg_net` extension in Supabase (standaard beschikbaar).
