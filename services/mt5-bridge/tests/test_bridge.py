import os
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from mt5_bridge import mapping
from mt5_bridge.app import create_app
from mt5_bridge.terminal import Terminal

from . import fake_mt5

TOKEN = "t" * 40
ACCOUNT = "upcomers-12347717"
BASE = f"/users/current/accounts/{ACCOUNT}"
H = {"auth-token": TOKEN}


@pytest.fixture()
def mt5():
    return fake_mt5.make()


@pytest.fixture()
def client(mt5, monkeypatch):
    monkeypatch.setenv("MT5_BRIDGE_TOKEN", TOKEN)
    monkeypatch.setenv("MT5_BRIDGE_ACCOUNT_ID", ACCOUNT)
    monkeypatch.delenv("MT5_BRIDGE_TRADING", raising=False)
    term = Terminal(mt5)
    term._offset, term._offset_checked = 7200, 10**12  # broker = UTC+2, never re-measured in tests
    return TestClient(create_app(mt5=mt5, terminal=term))


# ── startup and auth ─────────────────────────────────────────────────────────

def test_refuses_to_start_with_a_short_token(mt5, monkeypatch):
    monkeypatch.setenv("MT5_BRIDGE_TOKEN", "short")
    monkeypatch.setenv("MT5_BRIDGE_ACCOUNT_ID", ACCOUNT)
    with pytest.raises(RuntimeError):
        create_app(mt5=mt5)


def test_attaching_to_the_terminal_is_bounded_and_portable(mt5, monkeypatch):
    # The terminal runs as `terminal64.exe /portable`; a terminal that does not
    # answer must cost seconds, not the minute that blocks every other call.
    monkeypatch.delenv("MT5_INIT_TIMEOUT_MS", raising=False)
    Terminal(mt5, r"C:\Program Files\MetaTrader 5\terminal64.exe").status()
    assert mt5.state.initialize_calls[-1] == {
        "path": r"C:\Program Files\MetaTrader 5\terminal64.exe", "portable": True, "timeout": 10000,
    }
    monkeypatch.setenv("MT5_INIT_TIMEOUT_MS", "4000")
    Terminal(mt5).status()
    assert mt5.state.initialize_calls[-1] == {"path": None, "timeout": 4000}


def test_terminal_path_with_forward_slashes_becomes_a_windows_path(mt5, monkeypatch):
    # An EnvironmentFile value written with / (or quoted wrongly) must still find
    # terminal64.exe; a path with its backslashes stripped never does.
    monkeypatch.delenv("MT5_INIT_TIMEOUT_MS", raising=False)
    Terminal(mt5, "C:/Program Files/MetaTrader 5/terminal64.exe").status()
    assert mt5.state.initialize_calls[-1]["path"] == r"C:\Program Files\MetaTrader 5\terminal64.exe"


def test_every_data_route_needs_the_token(client):
    assert client.get(BASE + "/positions").status_code == 401
    assert client.get(BASE + "/positions", headers={"auth-token": "x" * 40}).status_code == 401
    assert client.get(BASE + "/positions", headers=H).status_code == 200


def test_health_needs_no_token_and_tells_no_account_details(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"ok": True, "trading": False}


def test_other_account_ids_are_not_found(client):
    r = client.get("/users/current/accounts/someone-else/positions", headers=H)
    assert r.status_code == 404


def test_disconnected_terminal_answers_504_like_metaapi(client, mt5):
    mt5.state.connected = False
    r = client.get(BASE + "/account-information", headers=H)
    assert r.status_code == 504
    assert "not connected to broker" in r.json()["message"]


# ── data in MetaApi's shape ──────────────────────────────────────────────────

def test_account_information(client):
    j = client.get(BASE + "/account-information", headers=H).json()
    assert j["platform"] == "mt5"
    assert j["type"] == "ACCOUNT_TRADE_MODE_DEMO"
    assert j["broker"] == "Upcomers" and j["server"] == "Upcomers-Server"
    assert j["freeMargin"] == 99787.0 and j["tradeAllowed"] is True and j["investorMode"] is False


def test_positions_use_utc_time_and_leave_out_empty_stop_loss(client):
    [p] = client.get(BASE + "/positions", headers=H).json()
    assert p["id"] == "501" and p["type"] == "POSITION_TYPE_BUY"
    assert p["time"] == "2026-11-21T11:50:00.000Z"      # broker 13:50 = UTC 11:50
    assert p["brokerTime"] == "2026-11-21 13:50:00.000"
    assert "stopLoss" not in p and p["takeProfit"] == 2700.0


def test_orders(client):
    [o] = client.get(BASE + "/orders", headers=H).json()
    assert o["type"] == "ORDER_TYPE_BUY_LIMIT" and o["state"] == "ORDER_STATE_PLACED"
    assert o["openPrice"] == 1.05 and o["stopLoss"] == 1.045 and "takeProfit" not in o


def test_symbols_and_price(client):
    assert client.get(BASE + "/symbols", headers=H).json() == ["EURUSD", "XAUUSD"]
    p = client.get(BASE + "/symbols/XAUUSD/current-price", headers=H).json()
    assert p == {"symbol": "XAUUSD", "bid": 2655.3, "ask": 2655.6,
                 "time": "2026-11-21T12:00:00.000Z", "brokerTime": "2026-11-21 14:00:00.000"}
    assert client.get(BASE + "/symbols/NOPE/current-price", headers=H).status_code == 404


def test_history_deals_paginate(client):
    url = BASE + "/history-deals/time/2026-11-20T00:00:00.000Z/2026-11-22T00:00:00.000Z"
    [d] = client.get(url, headers=H).json()
    assert d["type"] == "DEAL_TYPE_BUY" and d["entryType"] == "DEAL_ENTRY_IN" and d["positionId"] == "501"
    assert client.get(url + "?offset=1", headers=H).json() == []


def test_candles_oldest_first_in_utc(client):
    url = BASE + "/historical-market-data/symbols/EURUSD/timeframes/1h/candles?limit=2"
    c = client.get(url, headers=H).json()
    assert [x["time"] for x in c] == ["2026-11-21T10:00:00.000Z", "2026-11-21T11:00:00.000Z"]
    assert c[1]["close"] == 1.1 and c[1]["tickVolume"] == 10
    assert client.get(BASE + "/historical-market-data/symbols/EURUSD/timeframes/7m/candles", headers=H).status_code == 400


# ── trading ──────────────────────────────────────────────────────────────────

def test_trading_is_off_unless_switched_on(client, mt5):
    r = client.post(BASE + "/trade", headers=H, json={"actionType": "ORDER_TYPE_BUY", "symbol": "XAUUSD", "volume": 0.01})
    assert r.status_code == 403
    assert mt5.state.sent == []


def test_market_buy_uses_ask_and_ioc(client, mt5, monkeypatch):
    monkeypatch.setenv("MT5_BRIDGE_TRADING", "on")
    r = client.post(BASE + "/trade", headers=H, json={
        "actionType": "ORDER_TYPE_BUY", "symbol": "XAUUSD", "volume": 0.01, "stopLoss": 2640, "comment": "axe test",
    })
    assert r.status_code == 200
    assert r.json()["stringCode"] == "TRADE_RETCODE_DONE"  # what Companion's routes check
    [req] = mt5.state.sent
    assert req["action"] == fake_mt5.TRADE_ACTION_DEAL and req["type"] == fake_mt5.ORDER_TYPE_BUY
    assert req["price"] == 2655.6 and req["sl"] == 2640 and "tp" not in req
    assert req["type_filling"] == fake_mt5.ORDER_FILLING_IOC


def test_full_close_sells_a_buy_at_the_bid(client, mt5, monkeypatch):
    monkeypatch.setenv("MT5_BRIDGE_TRADING", "on")
    client.post(BASE + "/trade", headers=H, json={"actionType": "POSITION_CLOSE_ID", "positionId": "501"})
    [req] = mt5.state.sent
    assert req["type"] == fake_mt5.ORDER_TYPE_SELL and req["price"] == 2655.3
    assert req["volume"] == 0.10 and req["position"] == 501


def test_modify_keeps_levels_that_are_not_sent(client, mt5, monkeypatch):
    monkeypatch.setenv("MT5_BRIDGE_TRADING", "on")
    client.post(BASE + "/trade", headers=H, json={"actionType": "POSITION_MODIFY", "positionId": "501", "stopLoss": 2648})
    [req] = mt5.state.sent
    assert req["action"] == fake_mt5.TRADE_ACTION_SLTP and req["sl"] == 2648 and req["tp"] == 2700.0


def test_pending_order_needs_a_price_and_cancel_needs_an_order(client, mt5, monkeypatch):
    monkeypatch.setenv("MT5_BRIDGE_TRADING", "on")
    r = client.post(BASE + "/trade", headers=H, json={"actionType": "ORDER_TYPE_BUY_LIMIT", "symbol": "EURUSD", "volume": 0.1})
    assert r.status_code == 400
    r = client.post(BASE + "/trade", headers=H, json={"actionType": "ORDER_CANCEL", "orderId": "999"})
    assert r.status_code == 400
    assert mt5.state.sent == []
    client.post(BASE + "/trade", headers=H, json={"actionType": "ORDER_CANCEL", "orderId": "601"})
    assert mt5.state.sent == [{"action": fake_mt5.TRADE_ACTION_REMOVE, "order": 601}]


def test_partial_close_larger_than_position_is_refused(client, mt5, monkeypatch):
    monkeypatch.setenv("MT5_BRIDGE_TRADING", "on")
    r = client.post(BASE + "/trade", headers=H, json={"actionType": "POSITION_PARTIAL", "positionId": "501", "volume": 0.5})
    assert r.status_code == 400 and mt5.state.sent == []


# ── pure helpers ─────────────────────────────────────────────────────────────

def test_offset_detection_rounds_to_half_hours():
    now = datetime(2026, 11, 21, 12, 0, tzinfo=timezone.utc)
    assert mapping.detect_offset_seconds(now.timestamp() + 7200 + 3, now) == 7200
    assert mapping.detect_offset_seconds(now.timestamp() + 19800 - 40, now) == 19800  # +5:30


def test_name_for_prefers_the_canonical_name(mt5):
    assert mapping.name_for(mt5, "ORDER_TYPE_", 0) == "ORDER_TYPE_BUY"
    assert mapping.name_for(mt5, "TRADE_RETCODE_", 10009) == "TRADE_RETCODE_DONE"
