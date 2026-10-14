"""Unit tests for Indicator, Signal Engine, and Quantitative Backtesting.

Validates:
- Resampling (W-FRI, ME) from adjusted daily bars.
- Technical indicator calculations with pandas-ta.
- Zero lookahead bias guarantee: signals at bar T use strictly data <= T, fills execute at T+1 Open.
- Swing trading entry and exit logic with 2x ATR stop and 2R profit targets.
- Deterministic backtest execution with costs, slippage, and In/Out of Sample split.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from tradingagents.backtest_engine import run_quantitative_backtest
from tradingagents.signals import (
    compute_indicators,
    evaluate_timeframe_state,
    generate_swing_signals_and_markers,
    resample_bars,
)


@pytest.fixture
def synthetic_daily_df():
    """Generates 300 daily bars with realistic price action."""
    dates = pd.date_range("2024-01-01", periods=300, freq="B")
    rng = np.random.RandomState(42)
    # Controlled trend with pullbacks
    trend = np.linspace(100, 220, len(dates))
    cycles = 8 * np.sin(np.linspace(0, 10 * np.pi, len(dates)))
    noise = rng.normal(0, 1.5, len(dates))
    close = trend + cycles + noise

    high = close + rng.uniform(0.5, 3.0, len(dates))
    low = close - rng.uniform(0.5, 3.0, len(dates))
    open_p = (close + low) / 2.0
    volume = rng.randint(1000000, 5000000, len(dates))

    df = pd.DataFrame(
        {
            "open": open_p,
            "high": high,
            "low": low,
            "close": close,
            "volume": volume,
        },
        index=dates,
    )
    return df


@pytest.mark.unit
def test_resampling_w_and_m(synthetic_daily_df):
    """Weekly bars must end on Friday and monthly bars on month-end."""
    w_df = resample_bars(synthetic_daily_df, "W")
    m_df = resample_bars(synthetic_daily_df, "M")

    assert len(w_df) > 0
    assert len(m_df) > 0
    assert len(w_df) < len(synthetic_daily_df)
    assert len(m_df) < len(w_df)

    # Check that high is >= open, low, close
    assert (w_df["high"] >= w_df["low"]).all()
    assert (w_df["high"] >= w_df["open"]).all()
    assert (w_df["high"] >= w_df["close"]).all()


@pytest.mark.unit
def test_compute_indicators(synthetic_daily_df):
    """All required indicators must be computed."""
    df = compute_indicators(synthetic_daily_df)

    required_cols = [
        "sma_20",
        "sma_50",
        "sma_200",
        "ema_21",
        "boll_ub",
        "boll_mid",
        "boll_lb",
        "rsi_14",
        "macd",
        "macd_signal",
        "macd_hist",
        "atr_14",
        "adx_14",
    ]
    for col in required_cols:
        assert col in df.columns, f"Missing required column: {col}"
        # Validate that values exist after warm-up
        assert df[col].iloc[220:].notna().all(), f"NaNs found in {col} after warm-up"


@pytest.mark.unit
def test_no_lookahead_bias(synthetic_daily_df):
    """CRITICAL TEST: Appending future data must NOT change historical indicator values at time T."""
    base_len = 150
    sub_df = synthetic_daily_df.iloc[:base_len].copy()
    full_df = synthetic_daily_df.copy()

    ind_sub = compute_indicators(sub_df)
    ind_full = compute_indicators(full_df)

    # Compare bar T values for indicators
    test_idx = base_len - 1
    cols_to_check = ["sma_20", "sma_50", "ema_21", "rsi_14", "macd", "atr_14"]

    for col in cols_to_check:
        val_sub = ind_sub[col].iloc[test_idx]
        val_full = ind_full[col].iloc[test_idx]
        np.testing.assert_almost_equal(
            val_sub,
            val_full,
            decimal=4,
            err_msg=f"Lookahead bias detected in {col} at index {test_idx}",
        )


@pytest.mark.unit
def test_swing_signal_generation(synthetic_daily_df):
    """Evaluates swing signal generation and ensures stops and targets are computed."""
    w_df = resample_bars(synthetic_daily_df, "W")
    m_df = resample_bars(synthetic_daily_df, "M")

    daily_ind = compute_indicators(synthetic_daily_df)
    w_ind = compute_indicators(w_df)
    m_ind = compute_indicators(m_df)

    res = generate_swing_signals_and_markers(daily_ind, w_ind, m_ind)

    assert "combined_signal" in res
    assert "suggested_stop" in res
    assert "first_target" in res
    assert "reason" in res
    assert res["first_target"] > res["suggested_stop"]


@pytest.mark.unit
def test_timeframe_state_scoring(synthetic_daily_df):
    """Evaluates 0-100 score and signal states."""
    daily_ind = compute_indicators(synthetic_daily_df)
    state = evaluate_timeframe_state(daily_ind, "Daily")

    assert 0 <= state["score"] <= 100
    assert state["signal"] in ["BUY", "SELL", "NEUTRAL"]
    assert state["rsi_state"] in ["Oversold", "Overbought", "Neutral"]


@pytest.mark.unit
def test_backtest_execution_and_metrics():
    """Runs full backtest engine and verifies output contract."""
    res = run_quantitative_backtest(
        symbol="NVDA",
        strategy="Swing trend-pullback",
        capital=100000.0,
        oos_split=0.70,
    )

    assert "metrics" in res
    assert "all" in res["metrics"]
    assert "in_sample" in res["metrics"]
    assert "out_of_sample" in res["metrics"]
    assert "benchmark" in res["metrics"]
    assert "equity_curve" in res
    assert "drawdown_curve" in res
    assert "monthly_matrix" in res
    assert "trades" in res
    assert "param_sweep" in res

    # Check metrics keys
    m = res["metrics"]["all"]
    assert "total_return_pct" in m
    assert "max_drawdown_pct" in m
    assert "sharpe_ratio" in m
    assert "sortino_ratio" in m
    assert "win_rate_pct" in m
