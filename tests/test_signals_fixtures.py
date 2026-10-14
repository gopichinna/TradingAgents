"""Unit tests with fixtures for Signal Panel proxies and Higher-Timeframe filtering.

Validates:
1. When 200 bars are not available on Weekly/Monthly, returns 'n/a' or standard proxies (30-wk SMA, 10-mo SMA) labelled as proxies.
2. The combined signal respects the higher-timeframe filter: Weekly bearish forces WAIT, never HOLD/BULLISH.
3. The explanation sentence is generated from actual row values and never contradicts the table.
"""

import numpy as np
import pandas as pd
import pytest

from tradingagents.signals import (
    compute_indicators,
    evaluate_timeframe_state,
    generate_swing_signals_and_markers,
    resample_bars,
)


@pytest.fixture
def short_weekly_df():
    """Fixture providing 60 weekly bars (< 200 bars) with known values."""
    dates = pd.date_range("2023-01-01", periods=60, freq="W-FRI")
    close = np.linspace(100, 150, 60)
    df = pd.DataFrame(
        {
            "open": close * 0.99,
            "high": close * 1.02,
            "low": close * 0.98,
            "close": close,
            "volume": [1000000] * 60,
        },
        index=dates,
    )
    return compute_indicators(df)


@pytest.fixture
def short_monthly_df():
    """Fixture providing 30 monthly bars (< 200 bars)."""
    dates = pd.date_range("2021-01-01", periods=30, freq="ME")
    close = np.linspace(80, 140, 30)
    df = pd.DataFrame(
        {
            "open": close * 0.99,
            "high": close * 1.02,
            "low": close * 0.98,
            "close": close,
            "volume": [5000000] * 30,
        },
        index=dates,
    )
    return compute_indicators(df)


@pytest.fixture
def bearish_weekly_df():
    """Fixture providing Weekly bars in a steep downtrend (below 30-week SMA)."""
    dates = pd.date_range("2023-01-01", periods=50, freq="W-FRI")
    # Starts at 200, drops to 100
    close = np.linspace(200, 100, 50)
    df = pd.DataFrame(
        {
            "open": close * 1.01,
            "high": close * 1.03,
            "low": close * 0.97,
            "close": close,
            "volume": [2000000] * 50,
        },
        index=dates,
    )
    return compute_indicators(df)


def test_weekly_proxy_under_200_bars(short_weekly_df):
    """When Weekly has < 200 bars, it must use 30-week SMA labelled as proxy."""
    res = evaluate_timeframe_state(short_weekly_df, "Weekly")
    assert res["is_proxy"] is True
    assert res["sma200_label"] == "30-wk proxy"
    assert "30-wk proxy" in res["trend_details"]
    assert res["sma200_dist_pct"] is not None


def test_monthly_proxy_under_200_bars(short_monthly_df):
    """When Monthly has < 200 bars, it must use 10-month SMA labelled as proxy."""
    res = evaluate_timeframe_state(short_monthly_df, "Monthly")
    assert res["is_proxy"] is True
    assert res["sma200_label"] == "10-mo proxy"
    assert "10-mo proxy" in res["trend_details"]
    assert res["sma200_dist_pct"] is not None


def test_weekly_bearish_forces_wait(bearish_weekly_df, short_monthly_df):
    """Weekly bearish macro trend MUST force combined signal to WAIT, never HOLD/BULLISH."""
    # Create daily bars that look locally bullish above 200 SMA
    dates = pd.date_range("2023-01-01", periods=250, freq="B")
    close = np.linspace(150, 180, 250)
    daily_df = pd.DataFrame(
        {
            "open": close * 0.99,
            "high": close * 1.02,
            "low": close * 0.98,
            "close": close,
            "volume": [1000000] * 250,
        },
        index=dates,
    )
    d_ind = compute_indicators(daily_df)

    res = generate_swing_signals_and_markers(d_ind, bearish_weekly_df, short_monthly_df)

    # Combined signal MUST NOT be HOLD / BULLISH or BUY when Weekly is bearish
    assert res["combined_signal"] == "HOLD / WAIT"
    assert "Weekly macro trend is bearish" in res["reason"]
    assert "forces WAIT" in res["reason"]
    # Explanation must not contradict
    assert "strongly bullish" not in res["reason"]
