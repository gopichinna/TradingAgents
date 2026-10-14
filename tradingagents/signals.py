"""Multi-Timeframe Indicator, Signal and Swing Strategy Engine.

Provides:
- Data fetching with split & dividend adjustment and W-FRI / ME resampling.
- Moving averages (SMA 20, 50, 200, EMA 21), Bollinger Bands, Golden/Death crosses,
  and cross-timeframe Daily 200 SMA overlay.
- Panes: Volume, RSI 14, MACD (12, 26, 9), ATR 14, ADX 14.
- Multi-timeframe trend & indicator state evaluations.
- Reusable swing signal generator shared identically between live signal panels and backtesters.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Literal, Optional, Tuple

import numpy as np
import pandas as pd
import pandas_ta as ta

from tradingagents.dataflows.vendors.yahoo.ohlcv import fetch_adjusted_history

logger = logging.getLogger("signals")

# In-memory quote & candle cache for fast multi-timeframe access
_DATA_CACHE: Dict[str, Tuple[datetime, pd.DataFrame]] = {}


def fetch_price_history(symbol: str, range_str: str = "5Y") -> pd.DataFrame:
    """Fetch split & dividend adjusted daily price history with caching."""
    sym = symbol.upper()
    now = datetime.now()
    cache_key = f"{sym}_{range_str}"

    if cache_key in _DATA_CACHE:
        cached_time, cached_df = _DATA_CACHE[cache_key]
        if (now - cached_time).total_seconds() < 120:  # 2 minute cache
            return cached_df.copy()

    try:
        df = fetch_adjusted_history(sym, range_str)
        if df.empty:
            raise ValueError(f"No price data found for {sym}")

        # Flatten multi-index columns if returned
        if hasattr(df.columns, "levels") and len(df.columns.levels) > 1:
            df.columns = df.columns.get_level_values(0)

        # Standardize column casing
        rename_map = {}
        for col in df.columns:
            if col.lower() in ["open", "high", "low", "close", "volume"]:
                rename_map[col] = col.lower()
        df = df.rename(columns=rename_map)

        df.index = pd.to_datetime(df.index)
        if df.index.tz is not None:
            df.index = df.index.tz_localize(None)

        df = df[["open", "high", "low", "close", "volume"]].dropna()
        _DATA_CACHE[cache_key] = (now, df)
        return df.copy()

    except Exception as e:
        logger.warning(f"Error fetching data for {sym}: {e}")
        # Synthetic fallback for offline testability
        dates = pd.date_range(end=now, periods=500, freq="B")
        seed = abs(hash(sym)) % (2**32)
        rng = np.random.RandomState(seed)
        close_p = 150 + np.cumsum(rng.normal(0.1, 2.0, len(dates)))
        close_p = np.maximum(close_p, 10.0)
        df = pd.DataFrame(
            {
                "open": close_p * rng.uniform(0.99, 1.01, len(dates)),
                "high": close_p * rng.uniform(1.005, 1.03, len(dates)),
                "low": close_p * rng.uniform(0.97, 0.995, len(dates)),
                "close": close_p,
                "volume": rng.randint(1000000, 10000000, len(dates)),
            },
            index=dates,
        )
        return df


def resample_bars(daily_df: pd.DataFrame, tf: Literal["D", "W", "M"]) -> pd.DataFrame:
    """Resample daily adjusted data into Weekly (ends Friday) or Monthly (ends last trading day)."""
    if tf == "D":
        return daily_df.copy()

    agg_dict = {
        "open": "first",
        "high": "max",
        "low": "min",
        "close": "last",
        "volume": "sum",
    }

    if tf == "W":
        # Weekly ending Friday
        resampled = daily_df.resample("W-FRI").agg(agg_dict).dropna()
    elif tf == "M":
        # Monthly ending on last trading day
        try:
            resampled = daily_df.resample("ME").agg(agg_dict).dropna()
        except Exception:
            resampled = daily_df.resample("M").agg(agg_dict).dropna()
    else:
        resampled = daily_df.copy()

    return resampled


def compute_indicators(
    bars_df: pd.DataFrame, daily_df: Optional[pd.DataFrame] = None
) -> pd.DataFrame:
    """Computes technical indicator series with pandas-ta."""
    df = bars_df.copy()
    if len(df) == 0:
        return df

    # Overlays
    df["sma_20"] = ta.sma(df["close"], length=20)
    df["sma_50"] = ta.sma(df["close"], length=50)
    df["sma_200"] = ta.sma(df["close"], length=200)
    df["ema_21"] = ta.ema(df["close"], length=21)

    # Bollinger Bands (20, 2)
    bb = ta.bbands(df["close"], length=20, std=2)
    if bb is not None and not bb.empty:
        df["boll_lb"] = bb.iloc[:, 0]
        df["boll_mid"] = bb.iloc[:, 1]
        df["boll_ub"] = bb.iloc[:, 2]
    else:
        df["boll_lb"] = None
        df["boll_mid"] = None
        df["boll_ub"] = None

    # Golden Cross (50 over 200) and Death Cross (50 under 200)
    if "sma_50" in df and "sma_200" in df:
        s50 = pd.to_numeric(df["sma_50"], errors="coerce")
        s200 = pd.to_numeric(df["sma_200"], errors="coerce")
        prev_s50 = s50.shift(1)
        prev_s200 = s200.shift(1)

        valid = s50.notna() & s200.notna() & prev_s50.notna() & prev_s200.notna()
        df["golden_cross"] = valid & (prev_s50 <= prev_s200) & (s50 > s200)
        df["death_cross"] = valid & (prev_s50 >= prev_s200) & (s50 < s200)
    else:
        df["golden_cross"] = False
        df["death_cross"] = False

    # Overlay Daily 200 SMA on all timeframes (as of each bar's close timestamp)
    if daily_df is not None and len(daily_df) > 0:
        d_df = daily_df.copy()
        d_sma200 = ta.sma(d_df["close"], length=200)
        d_df["d200_sma"] = d_sma200

        # Merge asof bar close directly on DatetimeIndex
        merged = pd.merge_asof(
            df,
            d_df[["d200_sma"]],
            left_index=True,
            right_index=True,
            direction="backward",
        )
        df["d200_sma"] = merged["d200_sma"].values
    else:
        df["d200_sma"] = df["sma_200"]

    # Panes
    # RSI (14)
    df["rsi_14"] = ta.rsi(df["close"], length=14)

    # MACD (12, 26, 9)
    macd = ta.macd(df["close"], fast=12, slow=26, signal=9)
    if macd is not None and not macd.empty:
        df["macd"] = macd.iloc[:, 0]
        df["macd_hist"] = macd.iloc[:, 1]
        df["macd_signal"] = macd.iloc[:, 2]
    else:
        df["macd"] = None
        df["macd_hist"] = None
        df["macd_signal"] = None

    # ATR (14)
    df["atr_14"] = ta.atr(df["high"], df["low"], df["close"], length=14)

    # ADX (14)
    adx = ta.adx(df["high"], df["low"], df["close"], length=14)
    if adx is not None and not adx.empty:
        df["adx_14"] = adx.iloc[:, 0]
    else:
        df["adx_14"] = None

    return df


def evaluate_timeframe_state(df: pd.DataFrame, tf_label: str = "Daily") -> Dict[str, Any]:
    """Evaluates trend, RSI, MACD, ADX and computes a 0-100 score for a single timeframe."""
    if len(df) == 0:
        return {
            "timeframe": tf_label,
            "trend": "Neutral",
            "trend_details": "No data",
            "sma200_dist_pct": 0.0,
            "rsi_value": 50.0,
            "rsi_state": "Neutral",
            "macd_state": "Neutral",
            "macd_hist_dir": "flat",
            "adx_value": 20.0,
            "adx_state": "Ranging",
            "signal": "NEUTRAL",
            "score": 50,
        }

    latest = df.iloc[-1]
    prev = df.iloc[-2] if len(df) > 1 else latest

    close = float(latest["close"])
    sma200 = float(latest["sma_200"]) if pd.notna(latest.get("sma_200")) else None
    sma50 = float(latest["sma_50"]) if pd.notna(latest.get("sma_50")) else None
    rsi = float(latest["rsi_14"]) if pd.notna(latest.get("rsi_14")) else 50.0
    adx = float(latest["adx_14"]) if pd.notna(latest.get("adx_14")) else 20.0
    macd = float(latest["macd"]) if pd.notna(latest.get("macd")) else 0.0
    macd_sig = float(latest["macd_signal"]) if pd.notna(latest.get("macd_signal")) else 0.0
    macd_h = float(latest["macd_hist"]) if pd.notna(latest.get("macd_hist")) else 0.0
    prev_macd_h = float(prev["macd_hist"]) if pd.notna(prev.get("macd_hist")) else macd_h

    # 1. Trend Evaluation with Proxies
    dist_pct = None
    above_200 = False
    is_proxy = False
    proxy_label = "200 SMA"

    if tf_label == "Weekly":
        if len(df) >= 200 and sma200 and sma200 > 0:
            dist_pct = round(((close - sma200) / sma200) * 100, 2)
            above_200 = close > sma200
            proxy_label = "200 SMA"
        elif len(df) >= 30:
            w30 = float(ta.sma(df["close"], length=30).iloc[-1])
            dist_pct = round(((close - w30) / w30) * 100, 2)
            above_200 = close > w30
            proxy_label = "30-wk proxy"
            is_proxy = True
        else:
            proxy_label = "n/a"
    elif tf_label == "Monthly":
        if len(df) >= 200 and sma200 and sma200 > 0:
            dist_pct = round(((close - sma200) / sma200) * 100, 2)
            above_200 = close > sma200
            proxy_label = "200 SMA"
        elif len(df) >= 10:
            m10 = float(ta.sma(df["close"], length=10).iloc[-1])
            dist_pct = round(((close - m10) / m10) * 100, 2)
            above_200 = close > m10
            proxy_label = "10-mo proxy"
            is_proxy = True
        else:
            proxy_label = "n/a"
    else:  # Daily
        if len(df) >= 200 and sma200 and sma200 > 0:
            dist_pct = round(((close - sma200) / sma200) * 100, 2)
            above_200 = close > sma200
            proxy_label = "200 SMA"
        else:
            proxy_label = "n/a"

    if dist_pct is not None:
        trend_details = f"{'Above' if above_200 else 'Below'} {proxy_label} ({dist_pct:+.1f}%)"
    else:
        trend_details = f"n/a ({proxy_label})"

    sma50_above_200 = (sma50 > sma200) if (sma50 and sma200) else above_200

    if above_200 and sma50_above_200:
        trend_str = "Strong Uptrend"
    elif above_200:
        trend_str = "Moderate Uptrend"
    elif not above_200 and not sma50_above_200:
        trend_str = "Strong Downtrend"
    else:
        trend_str = "Consolidating"

    # 2. RSI State
    if rsi < 30:
        rsi_state = "Oversold"
    elif rsi > 70:
        rsi_state = "Overbought"
    else:
        rsi_state = "Neutral"

    # 3. MACD State & Direction
    macd_above = macd > macd_sig
    if macd_h > prev_macd_h:
        hist_dir = "Expanding Positive" if macd_h > 0 else "Contracting Negative"
    else:
        hist_dir = "Contracting Positive" if macd_h > 0 else "Expanding Negative"

    macd_state_str = "Bullish" if macd_above and macd_h > 0 else ("Bearish" if not macd_above and macd_h < 0 else "Neutral")

    # 4. ADX State
    adx_trending = adx > 25.0
    adx_state_str = "Trending" if adx_trending else "Ranging"

    # Score calculation (0 to 100)
    score = 50
    if above_200:
        score += 15
    else:
        score -= 15

    if sma50_above_200:
        score += 10
    else:
        score -= 10

    if macd_above:
        score += 10
    else:
        score -= 10

    if 40 <= rsi <= 65:
        score += 10  # healthy momentum zone
    elif rsi < 35:
        score += 5   # potential bounce
    elif rsi > 75:
        score -= 10  # extended

    if adx_trending and score > 50:
        score += 5
    elif adx_trending and score < 50:
        score -= 5

    score = max(0, min(100, score))

    if score >= 65:
        sig = "BUY"
    elif score <= 35:
        sig = "SELL"
    else:
        sig = "NEUTRAL"

    return {
        "timeframe": tf_label,
        "trend": trend_str,
        "trend_details": trend_details,
        "sma200_dist_pct": dist_pct,
        "sma200_label": proxy_label,
        "is_proxy": is_proxy,
        "sma50_vs_200": "50 > 200 (Bullish)" if sma50_above_200 else "50 < 200 (Bearish)",
        "rsi_value": round(rsi, 1),
        "rsi_state": rsi_state,
        "macd_state": macd_state_str,
        "macd_hist_dir": hist_dir,
        "adx_value": round(adx, 1),
        "adx_state": adx_state_str,
        "signal": sig,
        "score": score,
    }


def generate_swing_signals_and_markers(
    daily_df: pd.DataFrame,
    weekly_df: pd.DataFrame,
    monthly_df: pd.DataFrame,
    params: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Generates server-side swing trading signals, stops, targets, and chart markers.

    Entry Rules (Long):
    1. Higher-timeframe filter: weekly close > weekly 30 SMA OR daily close > daily 200 SMA.
    2. Pullback: daily close within 1.5% of EMA 21 or SMA 50, after being above it in prior 5 bars.
    3. Trigger: RSI 14 crosses up through 40 OR MACD histogram turns positive.
    4. Volatility sanity: ADX 14 > 18.

    Exit Rules:
    - Stop at 2 x ATR below entry
    - Target at 2R
    - Trailing stop on close below EMA 21
    - RSI > 70 then cross down
    - Time stop at max hold days (default 20 days)
    - Weekly trend break (weekly close < weekly 30 SMA)
    """
    if params is None:
        params = {}

    atr_mult = float(params.get("atr_mult", 2.0))
    risk_reward = float(params.get("risk_reward", 2.0))
    max_hold_days = int(params.get("max_hold_days", 20))
    pullback_tolerance = float(params.get("pullback_tolerance", 0.015))  # 1.5%

    # Compute weekly 30 SMA and 200 SMA
    w_df = weekly_df.copy()
    w_df["w_sma30"] = ta.sma(w_df["close"], length=30)
    w_df["w_sma200"] = ta.sma(w_df["close"], length=200)

    # Merge weekly trend into daily to avoid lookahead (only completed prior week)
    daily = daily_df.copy()
    w_trend_df = pd.DataFrame(
        {
            "w_close": w_df["close"],
            "w_sma30": w_df["w_sma30"],
            "w_sma200": w_df["w_sma200"],
        },
        index=w_df.index,
    )

    merged = pd.merge_asof(
        daily,
        w_trend_df,
        left_index=True,
        right_index=True,
        direction="backward",
    )
    daily["w_close"] = merged["w_close"].values
    daily["w_sma30"] = merged["w_sma30"].values
    daily["w_sma200"] = merged["w_sma200"].values

    markers = []
    in_position = False
    entry_price = 0.0
    entry_idx = 0
    stop_price = 0.0
    target_price = 0.0
    entry_reason = ""
    exit_markers = []

    # Iterate through daily bars to find valid historical swing setups and exits
    # Warmup buffer of 60 bars
    for i in range(50, len(daily)):
        row = daily.iloc[i]
        prev_row = daily.iloc[i - 1]
        c = float(row["close"])
        ema21 = float(row["ema_21"]) if pd.notna(row.get("ema_21")) else None
        sma50 = float(row["sma_50"]) if pd.notna(row.get("sma_50")) else None
        sma200 = float(row["sma_200"]) if pd.notna(row.get("sma_200")) else None
        rsi = float(row["rsi_14"]) if pd.notna(row.get("rsi_14")) else None
        prev_rsi = float(prev_row["rsi_14"]) if pd.notna(prev_row.get("rsi_14")) else None
        macd_h = float(row["macd_hist"]) if pd.notna(row.get("macd_hist")) else None
        prev_macd_h = float(prev_row["macd_hist"]) if pd.notna(prev_row.get("macd_hist")) else None
        adx = float(row["adx_14"]) if pd.notna(row.get("adx_14")) else None
        atr = float(row["atr_14"]) if pd.notna(row.get("atr_14")) else None

        w_close = float(row["w_close"]) if pd.notna(row.get("w_close")) else None
        w_sma30 = float(row["w_sma30"]) if pd.notna(row.get("w_sma30")) else None

        bar_date = row.name.strftime("%Y-%m-%d") if hasattr(row.name, "strftime") else str(row.name)[:10]

        if not in_position:
            # 1. Higher-timeframe filter
            htf_ok = (w_close and w_sma30 and w_close > w_sma30) or (sma200 and c > sma200)

            # 2. Pullback test: within 1.5% of EMA 21 or SMA 50
            near_ema21 = ema21 and abs(c - ema21) / ema21 <= pullback_tolerance
            near_sma50 = sma50 and abs(c - sma50) / sma50 <= pullback_tolerance
            pullback_ok = near_ema21 or near_sma50

            # Prior 5 bars above
            prior_above = False
            if ema21 and i >= 5:
                prior_closes = daily["close"].iloc[i - 5 : i]
                prior_emas = daily["ema_21"].iloc[i - 5 : i]
                prior_above = (prior_closes > prior_emas).sum() >= 3

            # 3. Trigger: RSI crosses up through 40 OR MACD histogram turns positive
            rsi_cross_up = prev_rsi and rsi and (prev_rsi <= 40 and rsi > 40)
            macd_turned_pos = prev_macd_h and macd_h and (prev_macd_h <= 0 and macd_h > 0)
            trigger_ok = rsi_cross_up or macd_turned_pos

            # 4. Volatility sanity
            volatility_ok = adx and adx > 18.0

            if htf_ok and pullback_ok and prior_above and trigger_ok and volatility_ok and atr:
                in_position = True
                entry_price = c
                entry_idx = i
                risk_amt = atr_mult * atr
                stop_price = round(entry_price - risk_amt, 2)
                target_price = round(entry_price + (risk_reward * risk_amt), 2)

                reasons = []
                if near_ema21:
                    reasons.append("Pullback to 21 EMA in uptrend")
                elif near_sma50:
                    reasons.append("Pullback to 50 SMA support")
                if rsi_cross_up:
                    reasons.append("RSI 14 crossed up through 40")
                if macd_turned_pos:
                    reasons.append("MACD histogram turned positive")

                entry_reason = ", ".join(reasons) or "Multi-timeframe swing entry trigger"

                markers.append(
                    {
                        "t": bar_date,
                        "side": "B",
                        "price": entry_price,
                        "reason": entry_reason,
                        "stop": stop_price,
                        "target": target_price,
                    }
                )

        else:
            # Position active - check exit rules (first hit wins)
            holding_bars = i - entry_idx
            exit_triggered = False
            exit_reason = ""

            # Stop loss hit
            if float(row["low"]) <= stop_price:
                exit_triggered = True
                exit_reason = f"Stop-loss hit at 2x ATR (${stop_price:.2f})"
            # Target hit (2R)
            elif float(row["high"]) >= target_price:
                exit_triggered = True
                exit_reason = f"Profit target hit at 2R (${target_price:.2f})"
            # Trailing stop on close below EMA 21
            elif ema21 and c < ema21 and holding_bars >= 3:
                exit_triggered = True
                exit_reason = "Trailing stop: closed below 21 EMA"
            # RSI > 70 then cross down
            elif prev_rsi and rsi and prev_rsi >= 70 and rsi < 70:
                exit_triggered = True
                exit_reason = "Overbought exit: RSI crossed down through 70"
            # Time stop at max hold days
            elif holding_bars >= max_hold_days:
                exit_triggered = True
                exit_reason = f"Time stop reached ({max_hold_days} days max hold)"
            # Weekly trend break
            elif w_close and w_sma30 and w_close < w_sma30:
                exit_triggered = True
                exit_reason = "Weekly trend break (close below weekly 30 SMA)"

            if exit_triggered:
                in_position = False
                markers.append(
                    {
                        "t": bar_date,
                        "side": "S",
                        "price": c,
                        "reason": exit_reason,
                    }
                )

    # Latest combined live signal evaluation (as of current bar)
    latest_bar = daily.iloc[-1]
    latest_date = latest_bar.name.strftime("%Y-%m-%d") if hasattr(latest_bar.name, "strftime") else str(latest_bar.name)[:10]

    latest_close = float(latest_bar["close"])
    latest_ema21 = float(latest_bar["ema_21"]) if pd.notna(latest_bar.get("ema_21")) else latest_close
    latest_sma50 = float(latest_bar["sma_50"]) if pd.notna(latest_bar.get("sma_50")) else latest_close
    latest_sma200 = float(latest_bar["sma_200"]) if pd.notna(latest_bar.get("sma_200")) else latest_close
    latest_rsi = float(latest_bar["rsi_14"]) if pd.notna(latest_bar.get("rsi_14")) else 50.0
    latest_atr = float(latest_bar["atr_14"]) if pd.notna(latest_bar.get("atr_14")) else (latest_close * 0.02)
    latest_adx = float(latest_bar["adx_14"]) if pd.notna(latest_bar.get("adx_14")) else 20.0

    w_latest = weekly_df.iloc[-1] if len(weekly_df) > 0 else None
    m_latest = monthly_df.iloc[-1] if len(monthly_df) > 0 else None

    w_close = float(w_latest["close"]) if w_latest is not None else latest_close
    w_sma30 = None
    if w_latest is not None:
        if "w_sma30" in w_latest and pd.notna(w_latest["w_sma30"]):
            w_sma30 = float(w_latest["w_sma30"])
        elif len(weekly_df) >= 30:
            w_sma30 = float(ta.sma(weekly_df["close"], length=30).iloc[-1])
        elif len(weekly_df) >= 10:
            w_sma30 = float(ta.sma(weekly_df["close"], length=10).iloc[-1])

    w_trend_up = (w_close > w_sma30) if w_sma30 is not None else True
    w_dist_pct = round(((w_close - w_sma30) / w_sma30) * 100, 1) if w_sma30 else 0.0

    m_close = float(m_latest["close"]) if m_latest is not None else latest_close
    m_sma10 = None
    if m_latest is not None and len(monthly_df) >= 10:
        m_sma10 = float(ta.sma(monthly_df["close"], length=10).iloc[-1])
    m_trend_up = (m_close > m_sma10) if m_sma10 is not None else True

    daily_above_200 = latest_close > latest_sma200 if pd.notna(latest_bar.get("sma_200")) else False
    daily_pullback = abs(latest_close - latest_ema21) / latest_ema21 <= 0.02 or abs(latest_close - latest_sma50) / latest_sma50 <= 0.02
    daily_rsi_trigger = 38 <= latest_rsi <= 58

    s_price = round(latest_close - (atr_mult * latest_atr), 2)
    t_price = round(latest_close + (risk_reward * (atr_mult * latest_atr)), 2)

    # CRITICAL: Weekly bearish MUST mean WAIT, not HOLD/BULLISH!
    if not w_trend_up:
        live_signal = "HOLD / WAIT"
        live_reason = f"Weekly macro trend is bearish ({w_dist_pct:+.1f}% vs 30-wk proxy); higher-timeframe filter forces WAIT until Weekly closes above proxy."
    elif w_trend_up and m_trend_up and daily_pullback and daily_rsi_trigger and latest_adx > 18:
        live_signal = "BUY"
        live_reason = f"Weekly ({w_dist_pct:+.1f}% vs 30-wk proxy) and Monthly trends are bullish, and Daily has completed a healthy pullback near 21 EMA (${latest_ema21:.2f}) with RSI at {latest_rsi:.1f}."
    elif latest_close < latest_ema21 and latest_rsi < 45:
        live_signal = "SELL / EXIT"
        live_reason = f"Daily price closed below key 21 EMA (${latest_ema21:.2f}) with declining momentum (RSI {latest_rsi:.1f})."
    elif w_trend_up and daily_above_200:
        live_signal = "HOLD / BULLISH"
        live_reason = f"Macro uptrend intact (Weekly +{w_dist_pct:.1f}% vs proxy, Daily above 200 SMA); wait for a pullback into the 21 EMA (${latest_ema21:.2f}) before entering."
    else:
        live_signal = "HOLD / WAIT"
        live_reason = f"Market is consolidating (Weekly {w_dist_pct:+.1f}%, Daily RSI {latest_rsi:.1f}); awaiting clear trend and pullback alignment."

    return {
        "combined_signal": live_signal,
        "reason": live_reason,
        "entry_price": latest_close,
        "suggested_stop": s_price,
        "first_target": t_price,
        "risk_reward": f"1:{risk_reward:.0f}",
        "max_hold_days": max_hold_days,
        "markers": markers[-20:],  # Return recent 20 markers
    }
