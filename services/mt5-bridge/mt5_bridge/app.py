"""MT5 bridge: MetaApi's client REST API, answered by one MT5 terminal.

Run (on the Windows side: real Windows or Wine):

    MT5_BRIDGE_TOKEN=... MT5_BRIDGE_ACCOUNT_ID=upcomers-12347717 \
    python -m uvicorn --factory mt5_bridge.app:create_app --host 127.0.0.1 --port 8765

Only Companion's server talks to it, through a Cloudflare tunnel, with the
token in the same `auth-token` header MetaApi uses. It is never opened to the
internet directly and never reached from a browser.

Orders stay refused until MT5_BRIDGE_TRADING=on. Companion's own guards (login,
ownership, the live-trading setting, the confirm per order) run before a
request ever gets here; this switch is a second lock on the box itself.
"""

import hmac
import os

from typing import Any, Dict, Optional

from fastapi import Body, Depends, FastAPI, Header, HTTPException, Query
from fastapi.responses import JSONResponse

from . import mapping
from .terminal import NotConnected, Terminal


def _load_mt5() -> Any:
    import MetaTrader5  # type: ignore  # Windows-only package

    return MetaTrader5


def create_app(mt5: Any = None, terminal: Optional[Terminal] = None) -> FastAPI:
    token = os.environ.get("MT5_BRIDGE_TOKEN", "")
    if len(token) < 32:
        raise RuntimeError("MT5_BRIDGE_TOKEN must be set and at least 32 characters")
    account_id = os.environ.get("MT5_BRIDGE_ACCOUNT_ID", "").strip()
    if not account_id:
        raise RuntimeError("MT5_BRIDGE_ACCOUNT_ID must be set (the id Companion stores for this account)")

    mt5 = mt5 if mt5 is not None else _load_mt5()
    term = terminal or Terminal(mt5, os.environ.get("MT5_TERMINAL_PATH") or None)
    app = FastAPI(title="MT5 bridge", docs_url=None, redoc_url=None, openapi_url=None)

    def trading_on() -> bool:
        return os.environ.get("MT5_BRIDGE_TRADING", "off").strip().lower() == "on"

    def auth(auth_token: str = Header(default="", alias="auth-token")) -> None:
        if not hmac.compare_digest(auth_token.encode(), token.encode()):
            raise HTTPException(status_code=401, detail={"error": "UnauthorizedError", "message": "Bad auth-token"})

    def account(accountId: str) -> str:  # noqa: N803 — MetaApi's path name
        if accountId != account_id:
            raise HTTPException(status_code=404, detail={"error": "NotFoundError", "message": f"Account {accountId} not found"})
        return accountId

    @app.exception_handler(NotConnected)
    async def _not_connected(_req: Any, exc: NotConnected) -> JSONResponse:
        # Same status and wording family as MetaApi, so Companion's existing
        # error mapping shows "not connected to broker" instead of a crash.
        return JSONResponse(status_code=504, content={
            "error": "TimeoutError",
            "message": f"It seems like the account is not connected to broker yet: {exc}",
        })

    @app.exception_handler(mapping.BadRequest)
    async def _bad_request(_req: Any, exc: mapping.BadRequest) -> JSONResponse:
        return JSONResponse(status_code=400, content={"error": "ValidationError", "message": str(exc)})

    base = "/users/current/accounts/{accountId}"

    @app.get("/health")
    def health() -> Dict[str, Any]:
        # No auth and no account details: only whether the terminal is up.
        s = term.status()
        return {"ok": bool(s.get("connected")), "trading": trading_on()}

    @app.get("/status", dependencies=[Depends(auth)])
    def status() -> Dict[str, Any]:
        return {**term.status(), "accountId": account_id, "trading": trading_on()}

    @app.get(base + "/account-information", dependencies=[Depends(auth)])
    def account_information(_: str = Depends(account)) -> Dict[str, Any]:
        info = term.call("account_info")
        if info is None:
            raise NotConnected(str(mt5.last_error()))
        return mapping.account_information(mt5, info)

    @app.get(base + "/positions", dependencies=[Depends(auth)])
    def positions(_: str = Depends(account)) -> Any:
        offset = term.offset_seconds()
        return [mapping.position(mt5, p, offset) for p in (term.call("positions_get") or ())]

    @app.get(base + "/orders", dependencies=[Depends(auth)])
    def orders(_: str = Depends(account)) -> Any:
        offset = term.offset_seconds()
        return [mapping.order(mt5, o, offset) for o in (term.call("orders_get") or ())]

    @app.get(base + "/symbols", dependencies=[Depends(auth)])
    def symbols(_: str = Depends(account)) -> Any:
        return [s.name for s in (term.call("symbols_get") or ())]

    def _tick(symbol: str) -> Any:
        term.call("symbol_select", symbol, True)
        tick = term.call("symbol_info_tick", symbol)
        if tick is None:
            raise HTTPException(status_code=404, detail={"error": "NotFoundError", "message": f"Symbol {symbol} not found"})
        return tick

    @app.get(base + "/symbols/{symbol}/current-price", dependencies=[Depends(auth)])
    def current_price(symbol: str, _: str = Depends(account)) -> Dict[str, Any]:
        tick = _tick(symbol)
        return mapping.symbol_price(symbol, tick, term.offset_seconds(symbol))

    def _history(fn: str, start: str, end: str, offset_q: int, limit: int, to_json: Any) -> Any:
        offset = term.offset_seconds()
        try:
            frm = mapping.broker_seconds_from_iso(start, offset)
            to = mapping.broker_seconds_from_iso(end, offset)
        except ValueError:
            raise mapping.BadRequest("start and end must be ISO times")
        rows = sorted(term.call(fn, frm, to) or (), key=lambda r: r.ticket)
        return [to_json(mt5, r, offset) for r in rows[offset_q: offset_q + limit]]

    @app.get(base + "/history-orders/time/{start}/{end}", dependencies=[Depends(auth)])
    def history_orders(start: str, end: str, offset: int = Query(0, ge=0), limit: int = Query(1000, ge=1, le=1000), _: str = Depends(account)) -> Any:
        return _history("history_orders_get", start, end, offset, limit, mapping.order)

    @app.get(base + "/history-deals/time/{start}/{end}", dependencies=[Depends(auth)])
    def history_deals(start: str, end: str, offset: int = Query(0, ge=0), limit: int = Query(1000, ge=1, le=1000), _: str = Depends(account)) -> Any:
        return _history("history_deals_get", start, end, offset, limit, mapping.deal)

    @app.get(base + "/historical-market-data/symbols/{symbol}/timeframes/{timeframe}/candles", dependencies=[Depends(auth)])
    def historical_candles(
        symbol: str,
        timeframe: str,
        limit: int = Query(1000, ge=1, le=1000),
        startTime: Optional[str] = None,  # noqa: N803 — MetaApi's query name
        _: str = Depends(account),
    ) -> Any:
        const_name = mapping.TIMEFRAMES.get(timeframe)
        if not const_name:
            raise mapping.BadRequest(f"timeframe {timeframe} is not supported")
        tf = mapping.constant(mt5, const_name)
        term.call("symbol_select", symbol, True)
        offset = term.offset_seconds(symbol)
        if startTime:
            # MetaApi: candles that end at or before startTime, newest last.
            frm = mapping.broker_seconds_from_iso(startTime, offset)
            rates = term.call("copy_rates_from", symbol, tf, frm, limit)
        else:
            rates = term.call("copy_rates_from_pos", symbol, tf, 0, limit)
        if rates is None:
            raise HTTPException(status_code=404, detail={"error": "NotFoundError", "message": f"No candles for {symbol} {timeframe}: {mt5.last_error()}"})
        return mapping.candles(symbol, timeframe, rates, offset)

    @app.post(base + "/trade", dependencies=[Depends(auth)])
    def trade(body: Dict[str, Any] = Body(...), _: str = Depends(account)) -> Any:
        if not trading_on():
            raise HTTPException(status_code=403, detail={
                "error": "ForbiddenError",
                "message": "Trading is switched off on this bridge (MT5_BRIDGE_TRADING is not 'on')",
            })
        action = str(body.get("actionType") or "")
        kwargs: Dict[str, Any] = {}
        if action in mapping.MARKET_ORDER_TYPES or action in mapping.PENDING_ORDER_TYPES:
            symbol = str(body.get("symbol") or "")
            if symbol:
                kwargs["tick"] = _tick(symbol)
                kwargs["symbol_info"] = term.call("symbol_info", symbol)
        elif action in ("POSITION_MODIFY", "POSITION_CLOSE_ID", "POSITION_PARTIAL"):
            found = term.call("positions_get", ticket=mapping._ticket(body, "positionId"))
            pos = found[0] if found else None
            kwargs["position_obj"] = pos
            if pos is not None and action != "POSITION_MODIFY":
                kwargs["tick"] = _tick(pos.symbol)
                kwargs["symbol_info"] = term.call("symbol_info", pos.symbol)
        elif action in ("ORDER_MODIFY", "ORDER_CANCEL"):
            found = term.call("orders_get", ticket=mapping._ticket(body, "orderId"))
            kwargs["order_obj"] = found[0] if found else None
            if action == "ORDER_CANCEL" and not found:
                raise mapping.BadRequest(f"Order {body.get('orderId')} not found")
        request = mapping.trade_request(mt5, body, **kwargs)
        result = term.order_send(request)
        return mapping.trade_result(mt5, result, None if result is not None else mt5.last_error())

    return app
