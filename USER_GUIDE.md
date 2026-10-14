# TradingAgents — User Guide & System Manual

Welcome to the **TradingAgents** multi-agent stock research desk. This guide details how the entire application works, how each module operates, how to configure and run multi-agent research runs with different parameters, and what key metrics to audit across every screen.

---

## Table of Contents
1. [System Architecture & Core Philosophy](#1-system-architecture--core-philosophy)
2. [Global Navigation & Workspace Controls](#2-global-navigation--workspace-controls)
3. [Setup Page (`/`): Running Multi-Agent Research](#3-setup-page--running-multi-agent-research)
4. [Charts Page (`/charts`): Technical Analysis & Swing Signals](#4-charts-page-charts-technical-analysis--swing-signals)
5. [Debate Arena (`/debate`): AI Deliberation & Verdict](#5-debate-arena-debate-ai-deliberation--verdict)
6. [Positions Page (`/positions`): Paper Trading Portfolio](#6-positions-page-positions-paper-trading-portfolio)
7. [Backtest Page (`/backtest`): Quantitative Strategy Verification](#7-backtest-page-backtest-quantitative-strategy-verification)
8. [Reliability Page (`/reliability`): Statistical Audit & Edge Scorecard](#8-reliability-page-reliability-statistical-audit--edge-scorecard)
9. [Archive Page (`/archive`): Historical Run Database](#9-archive-page-archive-historical-run-database)
10. [Pro Tips & Recommended Workflows](#10-pro-tips--recommended-workflows)

---

## 1. System Architecture & Core Philosophy

TradingAgents wraps Tauric Research's autonomous multi-agent framework into an interactive web desk. Rather than relying on a single prompt or a black-box model:
- **Specialized Analysts** independently extract market technicals, fundamental financial statements, and news sentiment.
- **Debate Arena** pits a **Bull Analyst** against a **Bear Analyst** to cross-examine hypotheses and poke holes in each other's theses.
- **Risk Managers** constrain aggressive recommendations by evaluating volatility, historical drawdowns, and sizing boundaries.
- **The Research Judge** synthesizes the transcript into an actionable 5-tier recommendation (`Strong Buy`, `Buy`, `Hold`, `Sell`, `Strong Sell`) with a conviction rating and target horizon.
- **Quantitative & Reliability Layers** measure whether these agent calls actually generate alpha against market baselines (SPY) and simple technical rules.

```
                      ┌──────────────────────┐
                      │   Setup / Trigger    │
                      └──────────┬───────────┘
                                 │
                 ┌───────────────┼───────────────┐
                 ▼               ▼               ▼
         [Market Analyst] [Fundamentals]  [News/Sentiment]
                 │               │               │
                 └───────────────┼───────────────┘
                                 ▼
                     ┌──────────────────────┐
                     │ Bull vs Bear Debate  │
                     └──────────┬───────────┘
                                │
                                ▼
                     ┌──────────────────────┐
                     │ Risk Manager Review  │
                     └──────────┬───────────┘
                                │
                                ▼
                     ┌──────────────────────┐
                     │     Judge Verdict    │
                     └──────────┬───────────┘
                                │
         ┌──────────────────────┴──────────────────────┐
         ▼                                             ▼
  [Archive & Debate]                       [Immutable Signal Ledger]
                                                       │
                                                       ▼
                                            [Reliability Audit & Edge]
```

---

## 2. Global Navigation & Workspace Controls

### 2.1 Left Sidebar (Fixed 208px Navigation)
The left navigation bar is accessible from any view:
- **Setup (`/`)**: Configure and trigger new multi-agent research runs.
- **Charts (`/charts`)**: TradingView candlestick chart with overlays, indicators, and swing signals.
- **Positions (`/positions`)**: Virtual $10,000 paper trading desk with automatic bracket sizing.
- **Debate (`/debate`)**: Full transcript and breakdown of Bull vs. Bear deliberations.
- **Backtest (`/backtest`)**: Quantitative in-sample and out-of-sample rule backtesting.
- **Reliability (`/reliability`)**: Statistical scorecard, forward outcome tracker, and replay engine.
- **Archive (`/archive`)**: Historical log of past research runs.
- **Theme Switcher** (Bottom left): Toggle between Dark Mode and Light Mode.

### 2.2 TopBar & Interactive Symbol Switcher
- **URL as Single Source of Truth**: The active symbol is stored in the URL query string (`?symbol=NVDA`). Changing symbols updates all pages simultaneously.
- **Keyboard Shortcut (`/`)**: Press `/` from anywhere in the application to open the **Symbol Switcher Modal**.
- **Typeahead & Recents**: Fast filter across standard universe tickers (`NVDA`, `AAPL`, `MSFT`, `AMZN`, `GOOGL`, `TSLA`, `META`, `SPY`).
- **Custom Yahoo Finance Tickers**: Enter any global ticker (e.g., `0700.HK`, `BTC-USD`, `ASML`, `TSM`). The backend verifies ticker existence via live quote lookup before switching.

---

## 3. Setup Page (`/`): Running Multi-Agent Research

The **Setup** screen is the launchpad for triggering autonomous multi-agent deep research.

### 3.1 Research Parameters

| Parameter | Options / Default | Description & What to Choose |
|---|---|---|
| **Instrument** | Selected Symbol (`NVDA`, etc.) | The asset to be analyzed. |
| **As of Date** | Default: *Today's Date* | The simulated point-in-time valuation date. Keep as today for live research, or pick a historical date to test past setups. |
| **Analyst Team** | `Market`, `Fundamentals`, `News` | Select which analyst agents participate in data gathering. |
| **LLM Model** | `gemini-2.0-flash` (Default), Pro models | High-speed low-cost flash model recommended for standard runs; pro models for deep qualitative analysis. |
| **Debate Rounds** | 1 to 4 rounds (Default: 2) | Number of back-and-forth rebuttal turns between Bull and Bear analysts. Higher rounds yield deeper risk scrutiny. |
| **Temperature** | 0.0 to 1.0 (Default: 0.2) | Lower temperature (0.1–0.3) produces consistent, data-grounded analysis. Higher temperature (0.7+) encourages novel bull/bear angles. |

### 3.2 Background Execution
- Clicking **"Run Multi-Agent Research"** dispatches the research job to the backend in the **background**.
- You do **not** need to stay frozen on the screen. You can navigate to `/charts`, inspect `/positions`, or review `/backtest`.
- A browser notification banner alerts you the moment the multi-agent deliberation finishes.

### 3.3 What to Check Once Finished
1. **The Recommendation**: Is it `Strong Buy`, `Buy`, `Hold`, `Sell`, or `Strong Sell`?
2. **Conviction / Confidence**: Expressed from 0% to 100%. High-conviction calls (>75%) represent strong consensus between Bull/Bear and Risk Managers.
3. **Target Price & Horizon**: The expected swing target and recommended holding window (e.g., 2–6 weeks).
4. **Reliability Ledger Sync**: The signal is automatically timestamped and saved into the immutable SQLite ledger (`~/.tradingagents/reliability/agent_signals.db`) for forward outcome tracking.

---

## 4. Charts Page (`/charts`): Technical Analysis & Swing Signals

The **Charts** module pairs TradingView-style financial charting with algorithmic swing-trading rule evaluation.

### 4.1 Chart Controls & Resampling
- **Timeframe Selector**:
  - **Daily (`D`)**: Standard daily price action.
  - **Weekly (`W`)**: Resampled from adjusted daily data ending Friday.
  - **Monthly (`M`)**: Resampled to the last trading day of the calendar month.
- **Range Chips**: `3M`, `6M`, `1Y`, `3Y`, `5Y`, `Max`.
- **Warm-Up Buffer**: The 200 SMA incorporates historical warm-up data so the moving average line renders cleanly from the left edge of the chart without clipping.

### 4.2 Overlays & Indicators
You can toggle overlays on and off from the header chips:
- **Moving Averages**:
  - `SMA 20` (Short-term momentum)
  - `SMA 50` (Intermediate trend)
  - `SMA 200` (Major institutional trend line)
  - `EMA 9` & `EMA 21` (Fast trend crossover system)
- **Volatility & Value**:
  - `VWAP` (Volume-Weighted Average Price)
  - `Bollinger Bands` (20-period, 2.0 standard deviations)
- **Sub-Chart Oscillators**:
  - `RSI (14)` with 70 (Overbought) and 30 (Oversold) threshold lines.

### 4.3 Technical Signals Panel
The right-hand or lower panel evaluates rule-based swing setups across Daily, Weekly, and Monthly timeframes:
- **Weekly Bearish Hard Gate**: If the Weekly trend is bearish (price below 30-week SMA or declining 50 SMA), the system automatically forces a **`WAIT`** or **`HOLD`** status on shorter timeframes to protect you from trading against the dominant macro trend.
- **Proxy Moving Averages**: For assets with fewer than 200 weekly/monthly bars, the engine intelligently uses 30-week and 10-month proxy indicators.
- **Dynamic Rationales**: Clear bullet points explain *why* a signal is Bullish, Bearish, or Neutral (e.g., `"Price ($138.25) above 200 SMA ($119.50) with positive MACD histogram"`).

---

## 5. Debate Arena (`/debate`): AI Deliberation & Verdict

The **Debate** tab reveals the inner workings of the multi-agent decision process.

### 5.1 What to Inspect
- **Bull Thesis Card**: The bull agent’s primary growth catalysts, margin expansion drivers, and upside valuation targets.
- **Bear Counter-Thesis Card**: The bear agent’s structural risks, competitive threats, valuation multiples, and downside support levels.
- **Cross-Examination Rebuttals**: How each agent answered the opposing points during debate rounds.
- **Risk Management Audit**: The risk manager's evaluation of volatility regime (ATR), maximum allowable stop distance, and position sizing guardrails.
- **Judge Verdict Synthesis**: The comprehensive rationale synthesizing the arguments into the final five-tier decision.

---

## 6. Positions Page (`/positions`): Paper Trading Portfolio

A simulated sandbox with an initial **$10,000 USD virtual account** to test execution against agent and technical signals.

### 6.1 Account Summary Cards
- **Equity**: Total current account value (`Cash + Invested Value`).
- **Cash**: Unallocated virtual purchasing power.
- **Invested**: Current market value of all open long positions.
- **Realized P/L**: Total profit or loss locked in from closed trades.
- **Unrealized P/L**: Live floating profit or loss across open positions.
- **Total Return**: Net performance percentage since account inception. Negative values format cleanly as `-$201.70`.

### 6.2 Smart Order Ticket (Fixed Risk Sizing)
When you enter a ticker, the ticket fetches the live quote and applies institutional risk-budget sizing:
$$\text{Shares} = \frac{\text{Account Equity} \times \text{Risk \%}}{\text{Entry Price} - \text{Stop Price}}$$

- **Stop-Loss & Target Brackets**: Defaults to a **2:1 Reward-to-Risk ratio** (or 2x ATR bracket).
- **Execution Modeling**: Long-only (v1), 5 basis points ($0.05\%$) slippage simulation, and $0 commission.
- **Reset Account**: Archive the existing portfolio history and restore a fresh $10,000 balance without losing historical audit logs.

### 6.3 3-Way Strategy Comparison
The bottom analytics card breaks down your track record into three distinct buckets:
1. **Agent-Followed Trades**: Trades opened following an agent `Buy` / `Strong Buy` signal.
2. **Rule-Based Technical Trades**: Trades opened based on pure SMA/RSI algorithmic signals.
3. **Manual Discretionary Trades**: Trades opened with custom user parameters.

This lets you instantly determine whether you or the AI are performing better.

---

## 7. Backtest Page (`/backtest`): Quantitative Strategy Verification

The **Backtest** module stress-tests quantitative swing strategies on historical daily data before deploying capital.

### 7.1 Configuration Parameters
- **Lookback Period**: 1 Year, 2 Years, 5 Years.
- **In-Sample (IS) vs. Out-of-Sample (OOS) Split**: E.g., 70% IS training / 30% OOS forward test to guard against curve-fitting and over-optimization.
- **ATR Multiplier**: Stop-loss and profit target distance (e.g., 1.5x, 2.0x, 3.0x ATR).
- **Max Hold Days**: Maximum duration before a trade is closed if neither stop nor target is reached.
- **Benchmark**: Comparison against SPY buy-and-hold over the exact same period.

### 7.2 Key Metrics to Check
- **CAGR**: Compound Annual Growth Rate.
- **Sharpe Ratio**: Risk-adjusted return (values > 1.0 indicate strong risk-adjusted returns; > 1.5 is excellent).
- **Sortino Ratio**: Downside-risk-adjusted return (ignores upside volatility).
- **Max Drawdown**: Peak-to-trough decline (look for strategies with drawdown lower than SPY).
- **Win Rate & Profit Factor**: Percentage of winning trades and ratio of gross profits to gross losses (> 1.5 is healthy).

### 7.3 Parameter Sensitivity Sweep (Heatmap)
- A 2D grid tests combinations of **ATR Multipliers** (1.5x, 2.0x, 2.5x) against **Max Hold Days** (5d, 10d, 20d).
- Look for **broad plateaus of profitability** rather than isolated peaks to ensure strategy robustness.

---

## 8. Reliability Page (`/reliability`): Statistical Audit & Edge Scorecard

The **Reliability** module answers the single most critical question in AI finance:
> *"Does the multi-agent system actually produce statistical alpha, or is it just generating plausible-sounding noise?"*

### 8.1 The Append-Only Immutable Signal Ledger
- Every live research run writes a record to `agent_signals` in SQLite.
- Database-level triggers (`BEFORE UPDATE`, `BEFORE DELETE`) prevent tampering or rewriting past signals.
- Every signal records: `symbol`, `as_of_date`, `rating`, `conviction`, `target_price`, `analysts_json`, and `llm_models_json`.

### 8.2 Daily Outcome Tracker
Forward outcomes are automatically tracked:
- **Entry Price**: Evaluated at the **next market session open** with **5 bps slippage** (avoiding execution lookahead bias).
- **Forward Returns**: Measured at **1-Day**, **5-Day**, **10-Day**, and **20-Day** horizons.
- **Alpha vs. SPY**: Benchmark-subtracted return over the same period.
- **MFE & MAE**:
  - **MFE (Maximum Favorable Excursion)**: Peak upside before exit.
  - **MAE (Maximum Adverse Excursion)**: Worst drawdown experienced while holding.
- **Bracket Outcome**: Records whether the 2x ATR target hit first (`HIT_TARGET`), the stop-loss hit first (`STOPPED_OUT`), or the position timed out (`EXPIRED`).

### 8.3 The 5-Check Scorecard
The scorecard at the top of the Reliability page evaluates 5 rigorous criteria:

1. **Sample Size Gate**:
   - `< 30 signals`: Uncolored / Neutral (*"Not enough data for statistical validity"*).
   - `30 to 99 signals`: Amber (*"Early read — continue tracking"*).
   - `100+ signals`: Green (*"Statistically meaningful sample"*).
2. **Statistical Edge (Bootstrap 95% Confidence Interval)**:
   - Resamples signals 1,000 times to verify if the 95% confidence interval of forward return is strictly positive ($> 0.0\%$).
3. **Beats Random Entry (Permutation Baseline)**:
   - Compares agent forward returns against a seeded 1,000-shuffle random trade generator over the same trading dates.
4. **Adds Value Over Simple Rules**:
   - Measures whether the agent's calls outperform simple 200 SMA and RSI technical momentum rules.
5. **Rerun Stability Check**:
   - Tests model determinism by executing 3 to 5 independent runs of the same symbol and date. A signal passes if $\ge 70\%$ of runs reach the same verdict.

### 8.4 Rating Monotonicity Check
Inspect the **Rating Buckets Table**:
$$\text{Strong Buy} > \text{Buy} > \text{Hold} > \text{Sell} > \text{Strong Sell}$$
A reliable system must exhibit monotonicity: higher ratings must produce higher average forward returns than lower ratings.

### 8.5 Historical Replay Backfill
Need to backfill data for past dates? Click **"⚡ Launch Replay"**:
- **Point-in-Time Analyst Selection**: Only **Market (PIT)** data is free of lookahead bias. Fundamental and News data should be used cautiously for historical backfills due to restatements and archiving gaps.
- **Cost & Token Estimation**: The system calculates sampled weekly dates, estimated LLM calls, and USD cost against your spend cap before you confirm.
- **Guaranteed Isolation**: Replay runs execute in a temporary directory (`TRADINGAGENTS_MEMORY_LOG_PATH`) so historical replays never pollute your live forward-test ledger.
- **Prominent Guardrail**: Replay results are explicitly watermarked: *"Replay: optimistic bias possible. Keep separate from live forward testing."*

---

## 9. Archive Page (`/archive`): Historical Run Database

The **Archive** maintains a complete chronological journal of every research run executed on your desk:
- Filter by ticker, rating, or date range.
- Click any past run to reopen the full **Debate Arena** transcript, review the **Judge Verdict**, or deep-link to the **Charts** view for that specific historical date.

---

## 10. Pro Tips & Recommended Workflows

### The Daily Swing Trading Workflow
1. **Morning Scan**:
   - Open `/charts?symbol=NVDA` (or press `/` to pick a symbol).
   - Check the **Technical Signals Panel** on Daily and Weekly.
   - If the Weekly chart is Bearish, respect the **WAIT / HOLD** filter.
2. **Deep Research**:
   - If the setup is Bullish, navigate to `/` (**Setup**).
   - Click **Run Multi-Agent Research** with default settings.
   - Continue reviewing charts while the agents debate in the background.
3. **Inspect the Debate**:
   - Once notified, open `/debate`.
   - Read the Bear Analyst’s points carefully: *What is the biggest counter-risk?*
4. **Size and Execute in Paper Trading**:
   - Open `/positions`.
   - Use the smart order ticket with your chosen risk percentage (e.g., 1.0% of equity).
   - Confirm the stop-loss and target prices.
5. **Weekly Audit**:
   - Visit `/reliability` every Friday.
   - Review your **5-Check Scorecard** and **3-Way Strategy Comparison** to see if your agent signals or discretionary trades are delivering real alpha.

---

*Disclaimer: TradingAgents is an educational and analytical research software. Historical simulations, backtests, and AI agent deliberations do not constitute financial advice or guarantees of future performance.*
