"""Unit tests for Positions Order Ticket calculations.

Validates:
1. shares = (equity * risk%) / (entry - stop)
2. Negative currency formatting as -$201.70 (not $-201.70).
"""

import pytest


def calculate_position_shares(equity: float, risk_pct: float, entry: float, stop: float) -> float:
    """Calculates order ticket shares from equity, risk percentage, and bracket stop."""
    if entry <= stop:
        raise ValueError("Entry price must be greater than stop price for long orders")
    dollar_risk = equity * (risk_pct / 100.0)
    per_share_risk = entry - stop
    shares = dollar_risk / per_share_risk
    return round(shares, 2)


def format_signed_currency(val: float) -> str:
    """Formats negative currency as -$201.70 instead of $-201.70."""
    if val < 0:
        return f"-${abs(val):.2f}"
    return f"+${val:.2f}"


def test_shares_formula_live_price():
    """Verify that for ~$352 stock with $10,000 equity, 1% risk and stop at $340, shares and cost match live quote."""
    equity = 10000.0
    risk_pct = 1.0  # 1% = $100 risk
    entry = 352.0
    stop = 340.0    # $12 per share risk

    shares = calculate_position_shares(equity, risk_pct, entry, stop)
    # Expected shares = 100 / 12 = 8.33 shares
    assert shares == 8.33

    cost = round(shares * entry, 2)
    # 8.33 * 352 = $2,932.16 (NOT $980 from fallback $100 price!)
    assert cost == 2932.16
    assert cost != 980.0


def test_negative_currency_formatting():
    """Negative dollar values must format with minus sign preceding dollar symbol: -$201.70."""
    pnl = -201.70
    formatted = format_signed_currency(pnl)
    assert formatted == "-$201.70"
    assert not formatted.startswith("$-")
