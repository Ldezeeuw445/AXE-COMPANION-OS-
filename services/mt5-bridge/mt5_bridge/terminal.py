"""The one connection to the MT5 terminal.

The MetaTrader5 package is not thread-safe, and FastAPI runs plain `def`
endpoints in a thread pool, so every call goes through one lock.

The bridge never logs in with a password. Luka logs in once in the terminal
itself (over remote desktop / VNC, "save password" on); `initialize()` then
attaches to that running, logged-in terminal.
"""

import os
import threading
import time
from datetime import datetime, timezone
from typing import Any, Optional

from . import mapping


class NotConnected(RuntimeError):
    """The terminal is not running or not logged in to the broker (HTTP 504)."""


class Terminal:
    def __init__(self, mt5: Any, terminal_path: Optional[str] = None):
        self.mt5 = mt5
        self.terminal_path = terminal_path
        self.lock = threading.RLock()
        self._initialized = False
        self._offset: Optional[int] = None
        self._offset_checked = 0.0
        fallback = os.environ.get("BROKER_UTC_OFFSET_HOURS", "2")
        self._fallback_offset = int(float(fallback) * 3600)

    # ── connection ──────────────────────────────────────────────────────────
    def _ensure(self) -> None:
        if not self._initialized:
            # Bounded: without a timeout, initialize() can wait about a minute for a
            # terminal that does not answer, holding the lock, so /health and
            # every other call pile up behind it. portable=True matches how
            # mt5-terminal.service starts the terminal (/portable).
            timeout_ms = int(os.environ.get("MT5_INIT_TIMEOUT_MS", "10000"))
            if self.terminal_path:
                ok = self.mt5.initialize(path=self.terminal_path, portable=True, timeout=timeout_ms)
            else:
                ok = self.mt5.initialize(timeout=timeout_ms)
            if not ok:
                raise NotConnected(f"MT5 terminal not available: {self.mt5.last_error()}")
            self._initialized = True
        info = self.mt5.terminal_info()
        if info is None:
            # The terminal went away (restart, crash): attach again next call.
            self._initialized = False
            raise NotConnected(f"MT5 terminal not available: {self.mt5.last_error()}")
        if not info.connected:
            raise NotConnected("MT5 terminal is not connected to the broker")

    def call(self, fn_name: str, *args: Any, **kwargs: Any) -> Any:
        with self.lock:
            self._ensure()
            return getattr(self.mt5, fn_name)(*args, **kwargs)

    def status(self) -> dict:
        with self.lock:
            try:
                self._ensure()
            except NotConnected as e:
                return {"connected": False, "reason": str(e)}
            account = self.mt5.account_info()
            return {
                "connected": True,
                "login": getattr(account, "login", None),
                "server": getattr(account, "server", None),
                "tradeAllowed": bool(getattr(account, "trade_allowed", False)),
                "brokerUtcOffsetHours": self.offset_seconds() / 3600,
            }

    # ── broker time ─────────────────────────────────────────────────────────
    def offset_seconds(self, probe_symbol: Optional[str] = None) -> int:
        """Broker server time minus UTC, measured from a fresh tick.

        Re-measured at most every 10 minutes. With no fresh tick (weekend,
        closed market) the last measurement stays, else BROKER_UTC_OFFSET_HOURS.
        """
        now = time.time()
        if self._offset is not None and now - self._offset_checked < 600:
            return self._offset
        with self.lock:
            symbols = [probe_symbol] if probe_symbol else []
            symbols += [s for s in ("EURUSD", "XAUUSD", "BTCUSD") if s != probe_symbol]
            for sym in symbols:
                self.mt5.symbol_select(sym, True)
                tick = self.mt5.symbol_info_tick(sym)
                if not tick or not tick.time:
                    continue
                measured = mapping.detect_offset_seconds(tick.time, datetime.now(timezone.utc))
                # A tick older than a few minutes measures the gap, not the zone.
                if abs(measured) <= 14 * 3600 and abs((tick.time - measured) - now) < 180:
                    self._offset = measured
                    self._offset_checked = now
                    return measured
            self._offset_checked = now
            return self._offset if self._offset is not None else self._fallback_offset
