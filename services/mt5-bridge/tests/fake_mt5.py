"""A stand-in for the MetaTrader5 package, with its real constant values.

Values as in the MetaTrader5 Python package (5.0.x; stable for years). The bridge only
reads constants by name, so a wrong number here would show up as a wrong
name in a test, not as a silent mismatch on the real terminal.
"""

from types import SimpleNamespace as NS

ACCOUNT_TRADE_MODE_DEMO, ACCOUNT_TRADE_MODE_CONTEST, ACCOUNT_TRADE_MODE_REAL = 0, 1, 2

ORDER_TYPE_BUY, ORDER_TYPE_SELL = 0, 1
ORDER_TYPE_BUY_LIMIT, ORDER_TYPE_SELL_LIMIT = 2, 3
ORDER_TYPE_BUY_STOP, ORDER_TYPE_SELL_STOP = 4, 5
ORDER_TYPE_BUY_STOP_LIMIT, ORDER_TYPE_SELL_STOP_LIMIT = 6, 7
ORDER_TYPE_CLOSE_BY = 8

ORDER_STATE_STARTED, ORDER_STATE_PLACED, ORDER_STATE_CANCELED = 0, 1, 2
ORDER_STATE_PARTIAL, ORDER_STATE_FILLED, ORDER_STATE_REJECTED = 3, 4, 5

ORDER_FILLING_FOK, ORDER_FILLING_IOC, ORDER_FILLING_RETURN = 0, 1, 2
ORDER_TIME_GTC, ORDER_TIME_DAY = 0, 1

POSITION_TYPE_BUY, POSITION_TYPE_SELL = 0, 1
POSITION_REASON_CLIENT, POSITION_REASON_MOBILE, POSITION_REASON_WEB, POSITION_REASON_EXPERT = 0, 1, 2, 3

DEAL_TYPE_BUY, DEAL_TYPE_SELL, DEAL_TYPE_BALANCE = 0, 1, 2
DEAL_ENTRY_IN, DEAL_ENTRY_OUT, DEAL_ENTRY_INOUT, DEAL_ENTRY_OUT_BY = 0, 1, 2, 3
DEAL_REASON_CLIENT, DEAL_REASON_MOBILE, DEAL_REASON_WEB, DEAL_REASON_EXPERT = 0, 1, 2, 3

TRADE_ACTION_DEAL, TRADE_ACTION_PENDING, TRADE_ACTION_SLTP = 1, 5, 6
TRADE_ACTION_MODIFY, TRADE_ACTION_REMOVE, TRADE_ACTION_CLOSE_BY = 7, 8, 10

TRADE_RETCODE_PLACED, TRADE_RETCODE_DONE, TRADE_RETCODE_DONE_PARTIAL = 10008, 10009, 10010
TRADE_RETCODE_REJECT, TRADE_RETCODE_INVALID_STOPS, TRADE_RETCODE_NO_MONEY = 10006, 10016, 10019
TRADE_RETCODE_MARKET_CLOSED = 10018

TIMEFRAME_M1, TIMEFRAME_M5, TIMEFRAME_M15, TIMEFRAME_M30 = 1, 5, 15, 30
TIMEFRAME_H1, TIMEFRAME_H4, TIMEFRAME_D1 = 16385, 16388, 16408
TIMEFRAME_W1, TIMEFRAME_MN1 = 32769, 49153

# Broker clock two hours ahead of UTC: 2026-11-21 12:00:00 UTC.
UTC_NOW = 1795262400
BROKER_NOW = UTC_NOW + 2 * 3600


class FakeTerminal:
    """Records order_send calls; everything else returns fixed data."""

    def __init__(self) -> None:
        self.sent = []
        self.connected = True
        self.positions = [
            NS(ticket=501, type=POSITION_TYPE_BUY, symbol="XAUUSD", magic=0,
               time=BROKER_NOW - 600, time_msc=0, time_update=BROKER_NOW - 60, time_update_msc=0,
               price_open=2650.10, price_current=2655.30, sl=0.0, tp=2700.0, volume=0.10,
               swap=-0.5, profit=52.0, comment="", external_id="", reason=POSITION_REASON_CLIENT),
        ]
        self.orders = [
            NS(ticket=601, type=ORDER_TYPE_BUY_LIMIT, state=ORDER_STATE_PLACED, symbol="EURUSD", magic=0,
               time_setup=BROKER_NOW - 300, time_setup_msc=0, time_done=0, time_done_msc=0,
               price_open=1.0500, price_current=1.0550, price_stoplimit=0.0, sl=1.0450, tp=0.0,
               volume_initial=0.20, volume_current=0.20, position_id=0, comment="axe", external_id="",
               type_filling=ORDER_FILLING_RETURN, type_time=ORDER_TIME_GTC),
        ]

    # module functions
    def initialize(self, path=None):
        return True

    def last_error(self):
        return (1, "Success")

    def terminal_info(self):
        return NS(connected=self.connected)

    def account_info(self):
        return NS(login=12347717, trade_mode=ACCOUNT_TRADE_MODE_DEMO, leverage=100, balance=100000.0,
                  credit=0.0, profit=52.0, equity=100052.0, margin=265.0, margin_free=99787.0,
                  margin_level=37755.47, currency="USD", server="Upcomers-Server", company="Upcomers",
                  name="Luka", trade_allowed=True)

    def symbol_select(self, symbol, enable):
        return True

    def symbol_info_tick(self, symbol):
        if symbol == "NOPE":
            return None
        bid, ask = {"XAUUSD": (2655.30, 2655.60), "EURUSD": (1.0550, 1.0551)}.get(symbol, (1.0, 1.1))
        return NS(time=BROKER_NOW, time_msc=BROKER_NOW * 1000, bid=bid, ask=ask)

    def symbol_info(self, symbol):
        return NS(name=symbol, filling_mode=2)  # IOC allowed

    def symbols_get(self):
        return [NS(name="EURUSD"), NS(name="XAUUSD")]

    def positions_get(self, ticket=None):
        return [p for p in self.positions if ticket is None or p.ticket == ticket]

    def orders_get(self, ticket=None):
        return [o for o in self.orders if ticket is None or o.ticket == ticket]

    def history_orders_get(self, frm, to):
        return list(self.orders)

    def history_deals_get(self, frm, to):
        return [NS(ticket=701, type=DEAL_TYPE_BUY, entry=DEAL_ENTRY_IN, symbol="XAUUSD", magic=0,
                   time=BROKER_NOW - 600, time_msc=0, volume=0.10, price=2650.10, commission=-0.7,
                   swap=0.0, profit=0.0, fee=0.0, position_id=501, order=500, comment="",
                   external_id="", reason=DEAL_REASON_CLIENT)]

    def copy_rates_from_pos(self, symbol, tf, start, count):
        return [
            {"time": BROKER_NOW - 3600, "open": 1.0, "high": 1.2, "low": 0.9, "close": 1.1,
             "tick_volume": 10, "spread": 2, "real_volume": 0},
            {"time": BROKER_NOW - 7200, "open": 0.9, "high": 1.0, "low": 0.8, "close": 1.0,
             "tick_volume": 8, "spread": 2, "real_volume": 0},
        ][:count]

    def copy_rates_from(self, symbol, tf, frm, count):
        return self.copy_rates_from_pos(symbol, tf, 0, count)

    def order_send(self, request):
        self.sent.append(request)
        return NS(retcode=TRADE_RETCODE_DONE, comment="Request executed", order=9001, deal=9002)


def make():
    """A fake module object: constants from this file + a FakeTerminal's methods."""
    import sys

    term = FakeTerminal()
    mod = NS(**{k: v for k, v in vars(sys.modules[__name__]).items() if k.isupper() and isinstance(v, int)})
    for name in dir(term):
        if not name.startswith("_"):
            setattr(mod, name, getattr(term, name))
    mod.state = term
    return mod
