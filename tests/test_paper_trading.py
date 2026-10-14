"""Unit tests for the paper trading engine.

Verifies:
1. Bracket OCO behavior (target hits cancel stop; stop hits cancel target)
2. Stop-before-target conservative resolution on same bar
3. Gap-through-stop fill at bar open price
4. Cash accounting (deductions, commissions, no negative cash)
5. Partial sells and position tracking
6. Currency validation (reject non-USD instruments)
"""

import os
import tempfile
import pytest
from tradingagents.paper_trading import (
    init_db,
    reset_paper_account,
    get_active_account,
    place_order,
    get_open_positions,
    get_trade_history,
    close_position,
    evaluate_paper_portfolio_against_bar,
    cancel_order,
    to_cents,
    from_cents,
)


@pytest.fixture(autouse=True)
def clean_paper_account(monkeypatch):
    """Isolates tests with a temporary SQLite database so real user accounts are untouched."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        tmp_db = f.name
    monkeypatch.setenv("TRADINGAGENTS_PAPER_DB_PATH", tmp_db)
    init_db()
    reset_paper_account(starting_cash=10000.0)
    yield
    try:
        os.remove(tmp_db)
    except Exception:
        pass


def test_cash_accounting_and_non_negative_cash():
    """Ensures cash is properly deducted and orders exceeding cash are rejected."""
    acc = get_active_account()
    assert acc["cash"] == 10000.0
    assert acc["equity"] == 10000.0

    # Buy 10 shares of NVDA at $120
    order = place_order(
        symbol="NVDA",
        side="BUY",
        order_type="MARKET",
        quantity=10,
        current_market_price=120.0
    )
    assert order["status"] == "FILLED"
    assert order["quantity"] == 10

    acc_after = get_active_account()
    # Slippage 5 bps on $120 is $120.06 per share * 10 = $1200.60
    assert acc_after["cash"] < 10000.0
    assert acc_after["invested"] > 1190.0

    # Attempt to place order exceeding remaining cash
    with pytest.raises(ValueError, match="Insufficient funds"):
        place_order(
            symbol="AAPL",
            side="BUY",
            order_type="MARKET",
            amount=50000.0,  # Far exceeds available cash
            current_market_price=220.0
        )


def test_currency_validation():
    """Rejects non-USD instruments in Paper Trading v1."""
    with pytest.raises(ValueError, match="Currency error"):
        place_order(
            symbol="ASML.AS",
            side="BUY",
            order_type="MARKET",
            quantity=5,
            current_market_price=750.0
        )

    with pytest.raises(ValueError, match="Currency error"):
        place_order(
            symbol="7203.T",
            side="BUY",
            order_type="MARKET",
            quantity=10,
            current_market_price=2500.0
        )


def test_partial_sell():
    """Verifies partial position close and PnL calculation."""
    # Buy 20 shares at $100
    place_order(
        symbol="MSFT",
        side="BUY",
        order_type="MARKET",
        quantity=20,
        current_market_price=100.0
    )

    positions = get_open_positions()
    assert len(positions) == 1
    pos_id = positions[0]["position_id"]
    assert positions[0]["shares"] == 20

    # Sell 8 shares at $110
    place_order(
        symbol="MSFT",
        side="SELL",
        order_type="MARKET",
        quantity=8,
        current_market_price=110.0
    )

    # Verify 12 shares remain
    positions_after = get_open_positions()
    assert len(positions_after) == 1
    assert positions_after[0]["shares"] == 12

    # Verify trade log has 8 shares closed with profit
    trades = get_trade_history(symbol="MSFT")["trades"]
    assert len(trades) == 1
    assert trades[0]["shares"] == 8
    assert trades[0]["pnl"] > 0
    assert trades[0]["exit_reason"] == "Manual"


def test_bracket_oco_target_hit():
    """When target price is reached, position closes at target and stop is cancelled."""
    # Buy with stop at $90 and target at $120
    place_order(
        symbol="AAPL",
        side="BUY",
        order_type="MARKET",
        quantity=10,
        stop=90.0,
        target=120.0,
        current_market_price=100.0
    )

    positions = get_open_positions()
    assert len(positions) == 1

    # Simulate next bar reaching $122 High, $98 Low
    events = evaluate_paper_portfolio_against_bar(
        symbol="AAPL",
        bar_open=105.0,
        bar_high=122.0,
        bar_low=98.0,
        bar_close=118.0,
        bar_date="2026-10-15"
    )

    assert len(events) == 1
    assert events[0]["event"] == "position_closed"
    assert events[0]["exit_reason"] == "Target hit"

    # Open positions should now be 0
    assert len(get_open_positions()) == 0

    # Trade should be recorded as Target hit
    trades = get_trade_history(symbol="AAPL")["trades"]
    assert len(trades) == 1
    assert trades[0]["exit_reason"] == "Target hit"
    assert trades[0]["pnl"] > 0


def test_bracket_stop_before_target_same_bar():
    """Conservative assumption: if both stop and target are touched in the same bar, assume stop hit first."""
    place_order(
        symbol="TSLA",
        side="BUY",
        order_type="MARKET",
        quantity=5,
        stop=180.0,
        target=220.0,
        current_market_price=200.0
    )

    # Wild volatility bar: Low is $170 (below stop), High is $230 (above target)
    events = evaluate_paper_portfolio_against_bar(
        symbol="TSLA",
        bar_open=195.0,
        bar_high=230.0,
        bar_low=170.0,
        bar_close=210.0,
        bar_date="2026-10-15"
    )

    assert len(events) == 1
    assert events[0]["event"] == "position_closed"
    assert events[0]["exit_reason"] == "Stop hit"  # Conservative: stop before target

    trades = get_trade_history(symbol="TSLA")["trades"]
    assert len(trades) == 1
    assert trades[0]["exit_reason"] == "Stop hit"
    assert trades[0]["pnl"] < 0


def test_gap_through_stop_fills_at_open():
    """If price gaps open beyond the stop loss, fill occurs at Open price, not the stop price."""
    place_order(
        symbol="AMZN",
        side="BUY",
        order_type="MARKET",
        quantity=10,
        stop=170.0,
        target=200.0,
        current_market_price=180.0
    )

    # Next session gaps down to $160 Open (well below $170 stop)
    events = evaluate_paper_portfolio_against_bar(
        symbol="AMZN",
        bar_open=160.0,
        bar_high=162.0,
        bar_low=155.0,
        bar_close=158.0,
        bar_date="2026-10-16"
    )

    assert len(events) == 1
    assert events[0]["exit_reason"] == "Stop hit"
    # Fill price should be around $160 Open (minus slippage), NOT $170 stop!
    assert events[0]["fill_price"] <= 160.0
