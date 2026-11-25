# MT5 bridge

Our own MT5 terminal, answering **MetaApi's client REST API**, so Companion and
Trading OS keep working when MetaApi is down (it was, from 19 Nov 2026).

```text
Strato VPS S (Ubuntu 24.04)
  Xvfb :99 → MT5 terminal in Wine (Luka logs in once, by hand)
          → mt5-bridge: Windows Python in the same Wine, FastAPI on 127.0.0.1:8765
          → cloudflared tunnel → https://mt5-bridge.<domain>
Companion server
  account with metadata.metaapiRegion = "bridge" → MT5_BRIDGE_URL, MT5_BRIDGE_TOKEN
  every other account → MetaApi, unchanged
```

## What it answers

The part of MetaApi's API that `src/lib/mt5/metaApiClient.ts` calls, same paths,
same JSON:

| Path under `/users/current/accounts/{id}` | MT5 call |
|---|---|
| `GET /account-information` | `account_info()` |
| `GET /positions`, `GET /orders` | `positions_get()`, `orders_get()` |
| `GET /symbols`, `GET /symbols/{s}/current-price` | `symbols_get()`, `symbol_info_tick()` |
| `GET /history-orders/time/{from}/{to}`, `GET /history-deals/time/{from}/{to}` | `history_orders_get()`, `history_deals_get()` |
| `GET /historical-market-data/symbols/{s}/timeframes/{tf}/candles` | `copy_rates_from_pos()` / `copy_rates_from()` |
| `POST /trade` (market, pending, modify, close, partial close, cancel) | `order_send()` |

Plus `GET /health` (no token, says only whether the terminal is connected) and
`GET /status` (token; login, server, broker UTC offset).

Times: MT5 stamps everything in broker server time. The bridge measures the
offset from a fresh tick (every 10 min) and returns `time` in UTC and
`brokerTime` as the server's clock, like MetaApi. With no fresh tick (weekend)
it keeps the last measurement, else `BROKER_UTC_OFFSET_HOURS`.

## Safety

- **No password ever reaches the bridge.** Luka logs in in the terminal itself
  (over VNC through an SSH tunnel, "save password" on). `initialize()` only
  attaches to that logged-in terminal.
- **Token on every data call**, compared in constant time; the bridge refuses
  to start with a token under 32 characters.
- **One account per bridge.** Any other account id is a 404.
- **Orders are off** until `MT5_BRIDGE_TRADING=on`. Companion's own checks
  (login, ownership, live-trading setting, confirm per order) come first; this
  is a second lock on the box.
- **Not on the internet.** Listens on 127.0.0.1; the Cloudflare tunnel is the
  only way in, and only Companion's server calls it.

## Install on the box (Ubuntu 24.04)

Steps 1–4 are one script, safe to run again:

```bash
rsync -a services/mt5-bridge/ root@HOST:/opt/mt5-bridge/
ssh root@HOST bash /opt/mt5-bridge/deploy/install.sh
```

What it does, by hand:


1. A user and the packages:
   ```bash
   adduser --disabled-password mt5
   dpkg --add-architecture i386 && apt update
   apt install -y wine64 wine32 xvfb x11vnc winbind cabextract
   ```
2. The MT5 terminal into the Wine prefix (MetaQuotes' own installer):
   ```bash
   sudo -u mt5 env WINEPREFIX=/home/mt5/.mt5 DISPLAY=:99 wine mt5setup.exe /auto
   ```
3. Windows Python 3.11 in the same prefix, then the packages:
   ```bash
   sudo -u mt5 env WINEPREFIX=/home/mt5/.mt5 wine python-3.11.9-amd64.exe /quiet InstallAllUsers=1 PrependPath=1
   sudo -u mt5 env WINEPREFIX=/home/mt5/.mt5 wine python -m pip install -r /opt/mt5-bridge/requirements.txt 2>&1 | cat
   ```
   Windows Python under Wine refuses to start when its output goes to a file
   (`[WinError 6] Invalid handle`), hence `| cat`. `requirements.txt` pins numpy
   to 1.26.4: numpy 2.x needs a function Wine 9.0 lacks.
4. This folder to `/opt/mt5-bridge`, the three units from `deploy/` to
   `/etc/systemd/system/`, the env file as in `mt5-bridge.service`, then:
   ```bash
   systemctl enable --now mt5-xvfb mt5-terminal mt5-bridge
   ```
5. **Luka logs in once:** `x11vnc -display :99 -localhost` on the box,
   `ssh -L 5900:localhost:5900` from the Mac, open `vnc://localhost:5900`,
   log in to Upcomers-Server in the terminal with "save password". Allow
   algorithmic trading under Tools → Options → Expert Advisors.
6. A Cloudflare tunnel hostname to `http://127.0.0.1:8765`. Then, from the Mac,
   `bash deploy/activate.sh HOST https://mt5-bridge.<domain>` checks the bridge,
   sets Companion's env and Trading OS's Supabase secrets (token never shown),
   and prints the SQL for step 7.
7. Point the account at the bridge (only with Luka's yes): on its `user_broker_accounts` row,
   shared by Companion and Trading OS,, external id =
   `MT5_BRIDGE_ACCOUNT_ID` and `metadata.metaapiRegion = "bridge"`.
8. Check: `curl https://mt5-bridge.<domain>/health` → `{"ok": true, ...}`, prices
   next to the MT5 app, then one 0.01-lot **demo** order with Luka's yes, and
   only then `MT5_BRIDGE_TRADING=on` for the real account.

## Tests

On any machine, no MT5 needed (a fake `MetaTrader5` module with the real
constant values):

```bash
python3 -m venv .venv && .venv/bin/pip install fastapi==0.115.6 httpx==0.28.1 pytest==8.3.4
.venv/bin/python -m pytest -q
```
