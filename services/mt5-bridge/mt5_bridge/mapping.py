"""Translate MetaTrader5 Python objects into the JSON MetaApi's client API returns.

Companion's src/lib/mt5/metaApiClient.ts already parses MetaApi responses. The
bridge answers in that same shape, so an account with region "bridge" needs no
other code path in Companion or Trading OS.

Everything here is pure: it takes the `mt5` module (or a fake in tests) only to
read its constants, never to call the terminal.
"""

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional

# MetaApi timeframe strings -> MetaTrader5 constant names.
TIMEFRAMES = {
    "1m": "TIMEFRAME_M1",
    "2m": "TIMEFRAME_M2",
    "3m": "TIMEFRAME_M3",
    "4m": "TIMEFRAME_M4",
    "5m": "TIMEFRAME_M5",
    "6m": "TIMEFRAME_M6",
    "10m": "TIMEFRAME_M10",
    "12m": "TIMEFRAME_M12",
    "15m": "TIMEFRAME_M15",
    "20m": "TIMEFRAME_M20",
    "30m": "TIMEFRAME_M30",
    "1h": "TIMEFRAME_H1",
    "2h": "TIMEFRAME_H2",
    "3h": "TIMEFRAME_H3",
    "4h": "TIMEFRAME_H4",
    "6h": "TIMEFRAME_H6",
    "8h": "TIMEFRAME_H8",
    "12h": "TIMEFRAME_H12",
    "1d": "TIMEFRAME_D1",
    "1w": "TIMEFRAME_W1",
    "1mn": "TIMEFRAME_MN1",
}

PENDING_ORDER_TYPES = {
    "ORDER_TYPE_BUY_LIMIT",
    "ORDER_TYPE_SELL_LIMIT",
    "ORDER_TYPE_BUY_STOP",
    "ORDER_TYPE_SELL_STOP",
    "ORDER_TYPE_BUY_STOP_LIMIT",
    "ORDER_TYPE_SELL_STOP_LIMIT",
}
MARKET_ORDER_TYPES = {"ORDER_TYPE_BUY", "ORDER_TYPE_SELL"}


class BadRequest(ValueError):
    """The request cannot be turned into an MT5 order (maps to HTTP 400)."""


def name_for(mt5: Any, prefix: str, value: Any) -> Optional[str]:
    """Reverse-look-up a MetaTrader5 constant: (mt5, "ORDER_TYPE_", 2) -> "ORDER_TYPE_BUY_LIMIT".

    Read from the module itself so the bridge never carries its own copy of the
    numbers. Several names can share a value; the shortest wins, which is the
    canonical one (e.g. ORDER_TYPE_BUY over ORDER_TYPE_BUY_...).
    """
    matches = [
        n for n in dir(mt5)
        if n.startswith(prefix) and getattr(mt5, n) == value and isinstance(getattr(mt5, n), int)
    ]
    return min(matches, key=len) if matches else None


def constant(mt5: Any, name: str) -> int:
    value = getattr(mt5, name, None)
    if not isinstance(value, int):
        raise BadRequest(f"Unknown MetaTrader5 constant {name}")
    return value


# ── time ─────────────────────────────────────────────────────────────────────
# MT5 stamps everything in broker server time, written as if it were UTC.
# MetaApi returns `time` in real UTC and `brokerTime` as the server's wall clock.

def to_utc_iso(broker_seconds: Optional[float], offset_seconds: int) -> Optional[str]:
    if not broker_seconds:
        return None
    t = datetime.fromtimestamp(float(broker_seconds) - offset_seconds, tz=timezone.utc)
    return t.strftime("%Y-%m-%dT%H:%M:%S.") + f"{t.microsecond // 1000:03d}Z"


def to_broker_time(broker_seconds: Optional[float]) -> Optional[str]:
    if not broker_seconds:
        return None
    t = datetime.fromtimestamp(float(broker_seconds), tz=timezone.utc)
    return t.strftime("%Y-%m-%d %H:%M:%S.") + f"{t.microsecond // 1000:03d}"


def msc_or_seconds(obj: Any, field: str) -> Optional[float]:
    """Prefer the millisecond field (time_msc) when the object has one."""
    msc = getattr(obj, field + "_msc", None)
    if msc:
        return msc / 1000.0
    return getattr(obj, field, None)


def detect_offset_seconds(tick_broker_seconds: float, now_utc: datetime) -> int:
    """Broker UTC offset from one fresh tick, rounded to the half hour."""
    raw = float(tick_broker_seconds) - now_utc.timestamp()
    return int(round(raw / 1800.0)) * 1800


def broker_seconds_from_iso(iso: str, offset_seconds: int) -> datetime:
    """A UTC ISO time from the URL -> the naive broker-time datetime MT5 history calls expect."""
    s = iso.strip().replace("Z", "+00:00")
    t = datetime.fromisoformat(s)
    if t.tzinfo is None:
        t = t.replace(tzinfo=timezone.utc)
    return (t.astimezone(timezone.utc) + timedelta(seconds=offset_seconds)).replace(tzinfo=None)


def _price(v: Any) -> Optional[float]:
    """MT5 uses 0.0 for 'no stop loss'; MetaApi leaves the key out."""
    return float(v) if v else None


def _drop_none(d: Dict[str, Any]) -> Dict[str, Any]:
    return {k: v for k, v in d.items() if v is not None}


# ── account, positions, orders, deals ─────────────────────────────────────────

def account_information(mt5: Any, info: Any) -> Dict[str, Any]:
    trade_mode = name_for(mt5, "ACCOUNT_TRADE_MODE_", info.trade_mode)
    return _drop_none({
        "platform": "mt5",
        "type": trade_mode,
        "broker": info.company,
        "currency": info.currency,
        "server": info.server,
        "balance": info.balance,
        "equity": info.equity,
        "margin": info.margin,
        "freeMargin": info.margin_free,
        "leverage": info.leverage,
        "marginLevel": info.margin_level if info.margin else None,
        "credit": info.credit,
        "name": info.name,
        "login": info.login,
        "tradeAllowed": bool(info.trade_allowed),
        # The Python API cannot tell an investor login apart; an investor
        # login simply has trading switched off.
        "investorMode": not bool(info.trade_allowed),
    })


def position(mt5: Any, p: Any, offset: int) -> Dict[str, Any]:
    return _drop_none({
        "id": str(p.ticket),
        "type": name_for(mt5, "POSITION_TYPE_", p.type),
        "symbol": p.symbol,
        "magic": p.magic,
        "time": to_utc_iso(msc_or_seconds(p, "time"), offset),
        "brokerTime": to_broker_time(msc_or_seconds(p, "time")),
        "updateTime": to_utc_iso(msc_or_seconds(p, "time_update"), offset),
        "openPrice": p.price_open,
        "currentPrice": p.price_current,
        "stopLoss": _price(p.sl),
        "takeProfit": _price(p.tp),
        "volume": p.volume,
        "swap": p.swap,
        "profit": p.profit,
        "unrealizedProfit": p.profit,
        "comment": p.comment or None,
        "clientId": p.external_id or None,
        "reason": name_for(mt5, "POSITION_REASON_", p.reason),
    })


def order(mt5: Any, o: Any, offset: int) -> Dict[str, Any]:
    return _drop_none({
        "id": str(o.ticket),
        "type": name_for(mt5, "ORDER_TYPE_", o.type),
        "state": name_for(mt5, "ORDER_STATE_", o.state),
        "symbol": o.symbol,
        "magic": o.magic,
        "time": to_utc_iso(msc_or_seconds(o, "time_setup"), offset),
        "brokerTime": to_broker_time(msc_or_seconds(o, "time_setup")),
        "doneTime": to_utc_iso(msc_or_seconds(o, "time_done"), offset),
        "doneBrokerTime": to_broker_time(msc_or_seconds(o, "time_done")),
        "openPrice": o.price_open or None,
        "currentPrice": o.price_current or None,
        "stopLimitPrice": _price(o.price_stoplimit),
        "stopLoss": _price(o.sl),
        "takeProfit": _price(o.tp),
        "volume": o.volume_initial,
        "currentVolume": o.volume_current,
        "positionId": str(o.position_id) if o.position_id else None,
        "comment": o.comment or None,
        "clientId": o.external_id or None,
        "fillingMode": name_for(mt5, "ORDER_FILLING_", o.type_filling),
        "expirationType": name_for(mt5, "ORDER_TIME_", o.type_time),
    })


def deal(mt5: Any, d: Any, offset: int) -> Dict[str, Any]:
    return _drop_none({
        "id": str(d.ticket),
        "type": name_for(mt5, "DEAL_TYPE_", d.type),
        "entryType": name_for(mt5, "DEAL_ENTRY_", d.entry),
        "symbol": d.symbol or None,
        "magic": d.magic,
        "time": to_utc_iso(msc_or_seconds(d, "time"), offset),
        "brokerTime": to_broker_time(msc_or_seconds(d, "time")),
        "volume": d.volume,
        "price": d.price,
        "commission": d.commission,
        "swap": d.swap,
        "profit": d.profit,
        "fee": getattr(d, "fee", None),
        "positionId": str(d.position_id) if d.position_id else None,
        "orderId": str(d.order) if d.order else None,
        "comment": d.comment or None,
        "clientId": d.external_id or None,
        "reason": name_for(mt5, "DEAL_REASON_", d.reason),
    })


def symbol_price(symbol: str, tick: Any, offset: int) -> Dict[str, Any]:
    seconds = msc_or_seconds(tick, "time")
    return _drop_none({
        "symbol": symbol,
        "bid": tick.bid or None,
        "ask": tick.ask or None,
        "time": to_utc_iso(seconds, offset),
        "brokerTime": to_broker_time(seconds),
    })


def candles(symbol: str, timeframe: str, rates: Iterable[Any], offset: int) -> List[Dict[str, Any]]:
    out = []
    for r in rates:
        out.append(_drop_none({
            "symbol": symbol,
            "timeframe": timeframe,
            "time": to_utc_iso(r["time"], offset),
            "brokerTime": to_broker_time(r["time"]),
            "open": float(r["open"]),
            "high": float(r["high"]),
            "low": float(r["low"]),
            "close": float(r["close"]),
            "tickVolume": int(r["tick_volume"]),
            "spread": int(r["spread"]),
            "volume": int(r["real_volume"]),
        }))
    out.sort(key=lambda c: c["time"])
    return out


# ── trade requests ───────────────────────────────────────────────────────────

def filling_for(mt5: Any, symbol_info: Any) -> int:
    """IOC when the symbol allows it, else FOK, else RETURN (MT5's own advice)."""
    allowed = int(getattr(symbol_info, "filling_mode", 0) or 0)
    if allowed & 2:
        return constant(mt5, "ORDER_FILLING_IOC")
    if allowed & 1:
        return constant(mt5, "ORDER_FILLING_FOK")
    return constant(mt5, "ORDER_FILLING_RETURN")


def _num(body: Dict[str, Any], key: str) -> Optional[float]:
    v = body.get(key)
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        raise BadRequest(f"{key} must be a number")
    if f != f or f in (float("inf"), float("-inf")):
        raise BadRequest(f"{key} must be a finite number")
    return f


def _volume(body: Dict[str, Any], required: bool = True) -> Optional[float]:
    v = _num(body, "volume")
    if v is None:
        if required:
            raise BadRequest("volume is required")
        return None
    if v <= 0:
        raise BadRequest("volume must be above 0")
    return v


def _ticket(body: Dict[str, Any], key: str) -> int:
    raw = body.get(key)
    try:
        return int(str(raw))
    except (TypeError, ValueError):
        raise BadRequest(f"{key} is required")


def trade_request(
    mt5: Any,
    body: Dict[str, Any],
    *,
    tick: Any = None,
    symbol_info: Any = None,
    position_obj: Any = None,
    order_obj: Any = None,
) -> Dict[str, Any]:
    """MetaApi `/trade` body -> an mt5.order_send request dict.

    The caller looks up whatever the action needs (the symbol's tick and info,
    the position or order being changed) and passes it in, so this stays pure.
    """
    action = str(body.get("actionType") or "")
    deviation = int(_num(body, "slippage") or 20)
    magic = int(_num(body, "magic") or 0)
    comment = str(body.get("comment") or "")[:31]

    if action in MARKET_ORDER_TYPES or action in PENDING_ORDER_TYPES:
        symbol = str(body.get("symbol") or "")
        if not symbol:
            raise BadRequest("symbol is required")
        req: Dict[str, Any] = {
            "symbol": symbol,
            "volume": _volume(body),
            "type": constant(mt5, action),
            "deviation": deviation,
            "magic": magic,
            "comment": comment,
            "type_time": constant(mt5, "ORDER_TIME_GTC"),
        }
        sl, tp = _num(body, "stopLoss"), _num(body, "takeProfit")
        if sl:
            req["sl"] = sl
        if tp:
            req["tp"] = tp
        if action in MARKET_ORDER_TYPES:
            if tick is None:
                raise BadRequest(f"No price for {symbol}")
            req["action"] = constant(mt5, "TRADE_ACTION_DEAL")
            req["price"] = tick.ask if action == "ORDER_TYPE_BUY" else tick.bid
            req["type_filling"] = filling_for(mt5, symbol_info)
        else:
            open_price = _num(body, "openPrice")
            if not open_price:
                raise BadRequest("openPrice is required for a pending order")
            req["action"] = constant(mt5, "TRADE_ACTION_PENDING")
            req["price"] = open_price
            req["type_filling"] = constant(mt5, "ORDER_FILLING_RETURN")
            if action.endswith("_STOP_LIMIT"):
                stop_limit = _num(body, "stopLimitPrice")
                if not stop_limit:
                    raise BadRequest("stopLimitPrice is required for a stop-limit order")
                req["stoplimit"] = stop_limit
        return req

    if action == "POSITION_MODIFY":
        ticket = _ticket(body, "positionId")
        if position_obj is None:
            raise BadRequest(f"Position {ticket} not found")
        sl, tp = _num(body, "stopLoss"), _num(body, "takeProfit")
        return {
            "action": constant(mt5, "TRADE_ACTION_SLTP"),
            "position": ticket,
            "symbol": position_obj.symbol,
            # Leaving a key out keeps the current level, as on MetaApi.
            "sl": sl if sl is not None else position_obj.sl,
            "tp": tp if tp is not None else position_obj.tp,
            "magic": position_obj.magic,
        }

    if action in ("POSITION_CLOSE_ID", "POSITION_PARTIAL"):
        ticket = _ticket(body, "positionId")
        if position_obj is None:
            raise BadRequest(f"Position {ticket} not found")
        if tick is None:
            raise BadRequest(f"No price for {position_obj.symbol}")
        volume = _volume(body, required=(action == "POSITION_PARTIAL")) or position_obj.volume
        if volume > position_obj.volume:
            raise BadRequest("volume is larger than the position")
        is_buy = position_obj.type == constant(mt5, "POSITION_TYPE_BUY")
        return {
            "action": constant(mt5, "TRADE_ACTION_DEAL"),
            "position": ticket,
            "symbol": position_obj.symbol,
            "volume": volume,
            # Closing a buy sells at the bid, closing a sell buys at the ask.
            "type": constant(mt5, "ORDER_TYPE_SELL" if is_buy else "ORDER_TYPE_BUY"),
            "price": tick.bid if is_buy else tick.ask,
            "deviation": deviation,
            "magic": position_obj.magic,
            "comment": comment,
            "type_filling": filling_for(mt5, symbol_info),
        }

    if action == "ORDER_MODIFY":
        ticket = _ticket(body, "orderId")
        if order_obj is None:
            raise BadRequest(f"Order {ticket} not found")
        open_price, sl, tp = _num(body, "openPrice"), _num(body, "stopLoss"), _num(body, "takeProfit")
        stop_limit = _num(body, "stopLimitPrice")
        return {
            "action": constant(mt5, "TRADE_ACTION_MODIFY"),
            "order": ticket,
            "symbol": order_obj.symbol,
            "price": open_price if open_price is not None else order_obj.price_open,
            "stoplimit": stop_limit if stop_limit is not None else order_obj.price_stoplimit,
            "sl": sl if sl is not None else order_obj.sl,
            "tp": tp if tp is not None else order_obj.tp,
            "type_time": order_obj.type_time,
        }

    if action == "ORDER_CANCEL":
        return {"action": constant(mt5, "TRADE_ACTION_REMOVE"), "order": _ticket(body, "orderId")}

    raise BadRequest(f"actionType {action or '(missing)'} is not supported")


def trade_result(mt5: Any, result: Any, last_error: Any = None) -> Dict[str, Any]:
    """mt5.order_send result -> MetaApi's trade response."""
    if result is None:
        code, text = (last_error or (-1, "order_send returned nothing"))
        return {"numericCode": int(code), "stringCode": "ERR_ORDER_SEND", "message": str(text)}
    string_code = name_for(mt5, "TRADE_RETCODE_", result.retcode) or f"TRADE_RETCODE_{result.retcode}"
    return _drop_none({
        "numericCode": int(result.retcode),
        "stringCode": string_code,
        "message": result.comment or string_code,
        "orderId": str(result.order) if result.order else None,
        "positionId": str(getattr(result, "position", 0) or result.order) if result.order else None,
    })
