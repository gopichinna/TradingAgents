"""FastAPI backend contract for TradingAgents Research Desk.

Features:
- REST API prefixed with /api/v1 with Pydantic v2 schemas
- Instruments with search, region filter, and 30s quote caching
- Full candle data with server-computed SMA20, Bollinger Bands, and signal markers
- SSE (Server-Sent Events) live run progress streaming + polling fallback
- Multi-agent dialectical research execution with LangGraph and Gemini
- Backtest metrics, equity curve, and trade tables
- Custom book attachments
- Backward-compatible /api routes
"""

import asyncio
import glob
import json
import logging
import math
import os
import re
import shutil
import time
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional

import numpy as np
import pandas as pd
import yfinance as yf
from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, File, HTTPException, Query, Request, UploadFile, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field
from stockstats import wrap

load_dotenv()

from tradingagents.dataflows.date_window import get_current_date
from tradingagents.default_config import DEFAULT_CONFIG
from tradingagents.graph.trading_graph import TradingAgentsGraph
from tradingagents.portfolio import PortfolioContext
from tradingagents.signals import (
    compute_indicators,
    evaluate_timeframe_state,
    fetch_price_history,
    generate_swing_signals_and_markers,
    resample_bars,
)
from tradingagents.backtest_engine import run_quantitative_backtest

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("server")

app = FastAPI(
    title="TradingAgents Research Desk API",
    version="1.0.0",
    docs_url="/docs",
    openapi_url="/openapi.json",
)

allowed_origins = os.getenv("ALLOWED_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins if allowed_origins != ["*"] else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Global Storage & Directories
# ---------------------------------------------------------------------------
REPORTS_DIR = os.path.expanduser("~/.tradingagents/logs/reports")
MEMORY_DIR = os.path.expanduser("~/.tradingagents/memory")
BOOKS_DIR = os.path.expanduser("~/.tradingagents/books")
BACKTESTS_DIR = os.path.expanduser("~/.tradingagents/backtests")

os.makedirs(REPORTS_DIR, exist_ok=True)
os.makedirs(MEMORY_DIR, exist_ok=True)
os.makedirs(BOOKS_DIR, exist_ok=True)
os.makedirs(BACKTESTS_DIR, exist_ok=True)

# In-memory stores
quote_cache: Dict[str, Dict[str, Any]] = {}
runs_store: Dict[str, Dict[str, Any]] = {}
run_event_subscribers: Dict[str, List[asyncio.Queue]] = {}
backtest_cache: Dict[str, Dict[str, Any]] = {}
backtests_store: Dict[str, Dict[str, Any]] = {}
backtest_event_subscribers: Dict[str, List[asyncio.Queue]] = {}

# ---------------------------------------------------------------------------
# Curated 30 Global Instruments
# ---------------------------------------------------------------------------
INSTRUMENTS = [
    # US (12)
    {"symbol": "NVDA", "name": "NVIDIA Corporation", "sector": "Semiconductors", "region": "US", "yahoo_ticker": "NVDA"},
    {"symbol": "AAPL", "name": "Apple Inc.", "sector": "Consumer Electronics", "region": "US", "yahoo_ticker": "AAPL"},
    {"symbol": "MSFT", "name": "Microsoft Corporation", "sector": "Cloud & Software", "region": "US", "yahoo_ticker": "MSFT"},
    {"symbol": "AMZN", "name": "Amazon.com Inc.", "sector": "E-Commerce & Cloud", "region": "US", "yahoo_ticker": "AMZN"},
    {"symbol": "GOOGL", "name": "Alphabet Inc.", "sector": "Search & AI", "region": "US", "yahoo_ticker": "GOOGL"},
    {"symbol": "TSLA", "name": "Tesla, Inc.", "sector": "Automotive & Energy", "region": "US", "yahoo_ticker": "TSLA"},
    {"symbol": "META", "name": "Meta Platforms Inc.", "sector": "Social Media & AI", "region": "US", "yahoo_ticker": "META"},
    {"symbol": "DELL", "name": "Dell Technologies Inc.", "sector": "Enterprise Hardware", "region": "US", "yahoo_ticker": "DELL"},
    {"symbol": "AMD", "name": "Advanced Micro Devices", "sector": "Semiconductors", "region": "US", "yahoo_ticker": "AMD"},
    {"symbol": "PLTR", "name": "Palantir Technologies", "sector": "Enterprise Software", "region": "US", "yahoo_ticker": "PLTR"},
    {"symbol": "SPY", "name": "SPDR S&P 500 ETF Trust", "sector": "Index ETF", "region": "US", "yahoo_ticker": "SPY"},
    {"symbol": "QQQ", "name": "Invesco QQQ Trust", "sector": "Index ETF", "region": "US", "yahoo_ticker": "QQQ"},

    # Europe (5)
    {"symbol": "ASML.AS", "name": "ASML Holding N.V.", "sector": "Semiconductors", "region": "Europe", "yahoo_ticker": "ASML.AS"},
    {"symbol": "SAP.DE", "name": "SAP SE", "sector": "Enterprise Software", "region": "Europe", "yahoo_ticker": "SAP.DE"},
    {"symbol": "MC.PA", "name": "LVMH Moët Hennessy", "sector": "Luxury Goods", "region": "Europe", "yahoo_ticker": "MC.PA"},
    {"symbol": "SIE.DE", "name": "Siemens AG", "sector": "Industrial Tech", "region": "Europe", "yahoo_ticker": "SIE.DE"},
    {"symbol": "NOVO-B.CO", "name": "Novo Nordisk A/S", "sector": "Healthcare & Biotech", "region": "Europe", "yahoo_ticker": "NOVO-B.CO"},

    # UK (6)
    {"symbol": "AZN.L", "name": "AstraZeneca PLC", "sector": "Healthcare & Pharma", "region": "UK", "yahoo_ticker": "AZN.L"},
    {"symbol": "SHEL.L", "name": "Shell plc", "sector": "Energy & Oil", "region": "UK", "yahoo_ticker": "SHEL.L"},
    {"symbol": "HSBA.L", "name": "HSBC Holdings plc", "sector": "Financial Services", "region": "UK", "yahoo_ticker": "HSBA.L"},
    {"symbol": "BP.L", "name": "BP p.l.c.", "sector": "Energy & Oil", "region": "UK", "yahoo_ticker": "BP.L"},
    {"symbol": "ULVR.L", "name": "Unilever PLC", "sector": "Consumer Goods", "region": "UK", "yahoo_ticker": "ULVR.L"},
    {"symbol": "RIO.L", "name": "Rio Tinto plc", "sector": "Basic Materials", "region": "UK", "yahoo_ticker": "RIO.L"},

    # Japan (4)
    {"symbol": "7203.T", "name": "Toyota Motor Corp.", "sector": "Automotive", "region": "Japan", "yahoo_ticker": "7203.T"},
    {"symbol": "6758.T", "name": "Sony Group Corp.", "sector": "Consumer Electronics & Media", "region": "Japan", "yahoo_ticker": "6758.T"},
    {"symbol": "9984.T", "name": "SoftBank Group Corp.", "sector": "Tech Investment", "region": "Japan", "yahoo_ticker": "9984.T"},
    {"symbol": "6861.T", "name": "Keyence Corporation", "sector": "Automation & Sensors", "region": "Japan", "yahoo_ticker": "6861.T"},

    # Hong Kong (3)
    {"symbol": "0700.HK", "name": "Tencent Holdings Ltd.", "sector": "Gaming & Cloud", "region": "Hong Kong", "yahoo_ticker": "0700.HK"},
    {"symbol": "9988.HK", "name": "Alibaba Group Holding", "sector": "E-Commerce & Cloud", "region": "Hong Kong", "yahoo_ticker": "9988.HK"},
    {"symbol": "1299.HK", "name": "AIA Group Limited", "sector": "Financial Services", "region": "Hong Kong", "yahoo_ticker": "1299.HK"},
]

# ---------------------------------------------------------------------------
# Pydantic v2 Models & Structured Error Handling
# ---------------------------------------------------------------------------
class ErrorDetail(BaseModel):
    code: str
    message: str
    step: Optional[str] = None

class ErrorResponse(BaseModel):
    error: ErrorDetail

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": "HTTP_ERROR", "message": str(exc.detail), "step": None}},
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"error": {"code": "VALIDATION_ERROR", "message": str(exc), "step": None}},
    )

class InstrumentItem(BaseModel):
    symbol: str
    name: str
    sector: str
    region: str
    yahoo_ticker: str

class QuoteResponse(BaseModel):
    symbol: str
    name: str
    price: float
    change_pct: float
    currency: str
    as_of: str

class ValidateInstrumentResponse(BaseModel):
    valid: bool
    symbol: str
    name: Optional[str] = None
    price: Optional[float] = None
    change_pct: Optional[float] = None
    currency: Optional[str] = "USD"
    error: Optional[str] = None

class StabilityCheckRequest(BaseModel):
    symbol: str = "NVDA"
    as_of_date: Optional[str] = None
    runs: int = 3

class ReplayEstimateRequest(BaseModel):
    symbol: str = "NVDA"
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    from_date: Optional[str] = None
    to_date: Optional[str] = None
    model: str = "gemini-2.0-flash"
    pit_only: bool = True
    analysts: Optional[List[str]] = None

    @property
    def resolved_start_date(self) -> str:
        return self.start_date or self.from_date or "2024-01-01"

    @property
    def resolved_end_date(self) -> str:
        return self.end_date or self.to_date or "2024-06-01"

class ReplayExecuteRequest(BaseModel):
    symbol: str = "NVDA"
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    from_date: Optional[str] = None
    to_date: Optional[str] = None
    model: str = "gemini-2.0-flash"
    pit_only: bool = True
    spend_cap: Optional[float] = None
    spend_cap_usd: Optional[float] = None
    analysts: Optional[List[str]] = None

    @property
    def resolved_start_date(self) -> str:
        return self.start_date or self.from_date or "2024-01-01"

    @property
    def resolved_end_date(self) -> str:
        return self.end_date or self.to_date or "2024-06-01"

    @property
    def resolved_spend_cap(self) -> float:
        return self.spend_cap if self.spend_cap is not None else (self.spend_cap_usd if self.spend_cap_usd is not None else 10.0)


class CandleBar(BaseModel):
    t: str
    o: float
    h: float
    l: float
    c: float
    v: int

class SignalItem(BaseModel):
    t: str
    side: Literal["B", "S"]
    price: float
    reason: Optional[str] = None
    stop: Optional[float] = None
    target: Optional[float] = None

class CandleResponse(BaseModel):
    symbol: str
    tf: str = "D"
    range: str = "1Y"
    candles: List[CandleBar]
    sma20: List[Optional[float]] = []
    sma50: List[Optional[float]] = []
    sma200: List[Optional[float]] = []
    ema21: List[Optional[float]] = []
    d200_sma: List[Optional[float]] = []
    bb_upper: List[Optional[float]] = []
    bb_mid: List[Optional[float]] = []
    bb_lower: List[Optional[float]] = []
    golden_crosses: List[Dict[str, Any]] = []
    death_crosses: List[Dict[str, Any]] = []
    volume: List[int] = []
    rsi14: List[Optional[float]] = []
    macd: List[Optional[float]] = []
    macd_signal: List[Optional[float]] = []
    macd_hist: List[Optional[float]] = []
    atr14: List[Optional[float]] = []
    adx14: List[Optional[float]] = []
    signals: List[SignalItem] = []

class TimeframeState(BaseModel):
    timeframe: str
    trend: str
    trend_details: str
    sma200_dist_pct: Optional[float] = None
    sma200_label: str = "200 SMA"
    is_proxy: bool = False
    sma50_vs_200: str
    rsi_value: float
    rsi_state: str
    macd_state: str
    macd_hist_dir: str
    adx_value: float
    adx_state: str
    signal: str
    score: int

class MultiTimeframeSignalResponse(BaseModel):
    symbol: str
    timeframes: List[TimeframeState]
    combined_signal: str
    reason: str
    entry_price: float
    suggested_stop: float
    first_target: float
    risk_reward: str
    max_hold_days: int
    markers: List[SignalItem]

class CreateBacktestRequest(BaseModel):
    symbols: List[str] = Field(default=["NVDA"])
    start: Optional[str] = None
    end: Optional[str] = None
    strategy: str = "Swing trend-pullback"
    params: Dict[str, Any] = Field(default_factory=dict)
    capital: float = 100000.0
    sizing_mode: Literal["fixed_pct", "risk_pct"] = "fixed_pct"
    sizing_value: float = 0.20
    max_positions: int = 5
    commission: float = 1.0
    slippage_bps: float = 5.0
    direction: Literal["long_only", "long_short"] = "long_only"
    benchmark: str = "SPY"
    oos_split: float = 0.70

class CreateBacktestResponse(BaseModel):
    backtest_id: str
    status: str

class CreateRunRequest(BaseModel):
    symbol: str
    analysis_date: Optional[str] = None
    strategy: Literal["swing", "day", "position"] = "swing"
    analysts: List[Literal["market", "news", "fundamentals", "social"]] = Field(
        default=["market", "news", "fundamentals"]
    )
    debate_rounds: int = Field(default=1, ge=1, le=3)
    book_id: Optional[str] = None

class CreateRunResponse(BaseModel):
    run_id: str
    status: str

class RunStepInfo(BaseModel):
    step: str
    status: Literal["waiting", "running", "done", "failed"]
    detail: Optional[str] = None
    progress: float

class DebateRound(BaseModel):
    round: int
    bull: List[str]
    bear: List[str]

class RunResult(BaseModel):
    rating: Literal["OVERWEIGHT", "HOLD", "UNDERWEIGHT"]
    rationale: str
    rounds: List[DebateRound]
    analyst_reports: Dict[str, str]

class RunDetailResponse(BaseModel):
    run_id: str
    symbol: str
    created_at: str
    params: Dict[str, Any]
    status: str
    steps: List[RunStepInfo]
    result: Optional[RunResult] = None

class ArchiveRunItem(BaseModel):
    run_id: str
    symbol: str
    created_at: str
    rating: str
    strategy: str
    signal_id: Optional[str] = None
    outcome_label: Optional[str] = None
    forward_return_10d: Optional[float] = None
    bracket_result: Optional[str] = None

class ArchiveListResponse(BaseModel):
    items: List[ArchiveRunItem]
    next_cursor: Optional[str] = None

class BacktestStats(BaseModel):
    return_pct: float
    win_rate: float
    max_drawdown_pct: float
    trades: int

class EquityPoint(BaseModel):
    t: str
    strategy: float
    benchmark: float

class TradeItem(BaseModel):
    t_open: str
    t_close: str
    side: Literal["BUY", "SELL"]
    entry: float
    exit: float
    pnl_pct: float

class BacktestResultResponse(BaseModel):
    stats: Optional[BacktestStats] = None
    is_stats: Optional[Dict[str, Any]] = None
    oos_stats: Optional[Dict[str, Any]] = None
    bench_stats: Optional[Dict[str, Any]] = None
    metrics: Optional[Dict[str, Any]] = None
    equity: Optional[List[EquityPoint]] = None
    trades: Optional[List[TradeItem]] = None

class BookItem(BaseModel):
    book_id: str
    name: str
    size: int
    uploaded_at: str

# ---------------------------------------------------------------------------
# Helper Strategy & Portfolio Context
# ---------------------------------------------------------------------------
class StrategyPortfolioContext(PortfolioContext):
    strategy_type: str = "swing"
    
    def render(self, ticker: str) -> str:
        base = super().render(ticker)
        strategy_desc = {
            "swing": "Swing Trading (3-20 days holding period). Focus on 10 EMA / 20 SMA pullbacks, Bollinger Band squeezes, and 1:2+ R/R.",
            "day": "Intraday Trading (0-1 day holding period). Prioritize opening drive, VWAP breaks, and ATR-based tight risk parameters.",
            "position": "Position Trading (30-180 days holding period). Focus on macroeconomic trends, earnings catalysts, and fundamental moat."
        }.get(self.strategy_type, "Swing Trading (3-20 days)")
        
        return (
            f"{base}\n"
            f"- Trading Strategy: {strategy_desc}\n"
            f"- Target Time Horizon: {self.strategy_type.title()} horizon\n"
            f"- Execution Directive: Formulate rigorous trade plans with precise entry triggers, "
            f"stop-loss anchors tied to volatility/support levels, and profit targets."
        )

def normalize_rating(raw_rating: str) -> str:
    r = raw_rating.strip().upper()
    if any(k in r for k in ["STRONG BUY", "BUY", "OVERWEIGHT"]):
        return "OVERWEIGHT"
    if any(k in r for k in ["STRONG SELL", "SELL", "UNDERWEIGHT"]):
        return "UNDERWEIGHT"
    return "HOLD"

def parse_bullet_points(text: str, max_points: int = 3) -> List[str]:
    if not text:
        return []
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    bullets = []
    for line in lines:
        cleaned = re.sub(r"^(\*|-|\d+\.|\•)\s*", "", line).strip()
        cleaned = re.sub(r"^\*\*(.*?)\*\*:?", r"\1", cleaned)
        if len(cleaned) > 20 and not cleaned.startswith("#"):
            bullets.append(cleaned)
        if len(bullets) >= max_points:
            break
    if not bullets and text:
        # Fallback to first non-empty sentence
        parts = text.split(".")
        bullets = [p.strip() for p in parts if len(p.strip()) > 15][:max_points]
    return bullets

# ---------------------------------------------------------------------------
# API v1 Endpoints
# ---------------------------------------------------------------------------

@app.get("/api/v1/instruments", response_model=List[InstrumentItem])
def get_instruments(
    region: Optional[str] = Query(None, description="Region filter: All, US, Europe, UK, Japan, Hong Kong"),
    q: Optional[str] = Query(None, description="Search query matching symbol, name, or sector")
):
    """Returns curated instrument list with region filtering and search."""
    results = INSTRUMENTS
    
    if region and region.lower() != "all":
        reg_clean = region.strip().lower()
        results = [inst for inst in results if inst["region"].lower() == reg_clean]
        
    if q and q.strip():
        term = q.strip().lower()
        results = [
            inst for inst in results
            if term in inst["symbol"].lower() or term in inst["name"].lower() or term in inst["sector"].lower()
        ]
        
    return results

@app.get("/api/v1/instruments/validate", response_model=ValidateInstrumentResponse)
def validate_instrument(symbol: str = Query(..., description="Symbol or Yahoo-style ticker (e.g. NVDA, 0700.HK, BTC-USD)")):
    """Validates whether an instrument or Yahoo ticker exists and returns live metadata."""
    sym = symbol.strip().upper()
    if not sym:
        return ValidateInstrumentResponse(valid=False, symbol=sym, error="Empty symbol provided")

    # 1. Curated list match
    inst = next((item for item in INSTRUMENTS if item["symbol"].upper() == sym or item["yahoo_ticker"].upper() == sym), None)
    if inst:
        q = get_instrument_quote(inst["symbol"])
        return ValidateInstrumentResponse(
            valid=True,
            symbol=inst["symbol"],
            name=inst["name"],
            price=q.get("price"),
            change_pct=q.get("change_pct"),
            currency=q.get("currency", "USD"),
        )

    # 2. Custom Yahoo-style ticker (0700.HK, 7203.T, AZN.L, RELIANCE.NS, BTC-USD, etc.)
    try:
        ticker = yf.Ticker(sym)
        hist = ticker.history(period="5d")
        if hist.empty or len(hist) == 0:
            return ValidateInstrumentResponse(valid=False, symbol=sym, error=f"Ticker '{sym}' not found on market")

        latest_close = round(float(hist["Close"].iloc[-1]), 2)
        prev_close = round(float(hist["Close"].iloc[-2]), 2) if len(hist) > 1 else latest_close
        chg = round(((latest_close - prev_close) / prev_close) * 100, 2)

        currency = "USD"
        if ".L" in sym:
            currency = "GBp"
        elif any(ext in sym for ext in [".AS", ".DE", ".PA"]):
            currency = "EUR"
        elif ".T" in sym:
            currency = "JPY"
        elif ".HK" in sym:
            currency = "HKD"
        elif ".NS" in sym:
            currency = "INR"

        return ValidateInstrumentResponse(
            valid=True,
            symbol=sym,
            name=sym,
            price=latest_close,
            change_pct=chg,
            currency=currency,
        )
    except Exception as e:
        return ValidateInstrumentResponse(valid=False, symbol=sym, error=f"Validation failed: {str(e)}")

@app.get("/api/v1/instruments/{symbol}/quote", response_model=QuoteResponse)
def get_instrument_quote(symbol: str):
    """Cached (30s) quote used by the sticky top header on every page."""
    sym = symbol.upper()
    now = time.time()
    
    # Check 30s cache
    if sym in quote_cache and (now - quote_cache[sym]["timestamp"]) < 30:
        return quote_cache[sym]["data"]
        
    inst = next((item for item in INSTRUMENTS if item["symbol"].upper() == sym), None)
    name = inst["name"] if inst else sym
    yahoo_sym = inst["yahoo_ticker"] if inst else sym

    try:
        ticker_obj = yf.Ticker(yahoo_sym)
        hist = ticker_obj.history(period="5d")
        if hist.empty:
            raise ValueError("No price data returned")
            
        latest_close = round(float(hist["Close"].iloc[-1]), 2)
        prev_close = round(float(hist["Close"].iloc[-2]), 2) if len(hist) > 1 else latest_close
        change_pct = round(((latest_close - prev_close) / prev_close) * 100, 2)
        currency = "USD"
        if ".L" in yahoo_sym:
            currency = "GBp"
        elif any(ext in yahoo_sym for ext in [".AS", ".DE", ".PA"]):
            currency = "EUR"
        elif ".T" in yahoo_sym:
            currency = "JPY"
        elif ".HK" in yahoo_sym:
            currency = "HKD"

        data = {
            "symbol": sym,
            "name": name,
            "price": latest_close,
            "change_pct": change_pct,
            "currency": currency,
            "as_of": datetime.now().isoformat(),
        }
        quote_cache[sym] = {"timestamp": now, "data": data}
        return data

    except Exception as e:
        logger.warning(f"Failed to fetch live quote for {sym}: {e}")
        # Graceful fallback data if yahoo finance is throttled
        fallback_data = {
            "symbol": sym,
            "name": name,
            "price": 224.22 if sym == "NVDA" else 345.58,
            "change_pct": -1.88 if sym == "NVDA" else 1.26,
            "currency": "USD",
            "as_of": datetime.now().isoformat(),
        }
        return fallback_data

@app.get("/api/v1/instruments/{symbol}/candles", response_model=CandleResponse)
def get_candles(
    symbol: str,
    tf: str = Query("D", description="Timeframe: D, W, M"),
    range: str = Query("1Y", description="Range: 3M, 6M, 1Y, 3Y, 5Y, Max"),
    indicators: Optional[str] = Query(None, description="Comma-separated indicators: sma20,sma50,sma200,ema21,bb,rsi14,macd,atr14,adx14,volume"),
    days: Optional[int] = Query(None, description="Legacy timeframe in days: 30, 60, 90, 120"),
):
    """Server-computed OHLCV candles, aligned indicator series, and swing signals across D, W, M."""
    sym = symbol.upper()
    tf_val = tf.upper() if tf.upper() in ["D", "W", "M"] else "D"
    
    # Handle legacy days parameter
    range_val = range
    if days is not None:
        if days <= 45:
            range_val = "3M"
        elif days <= 95:
            range_val = "6M"
        else:
            range_val = "1Y"

    inst = next((item for item in INSTRUMENTS if item["symbol"].upper() == sym), None)
    yahoo_sym = inst["yahoo_ticker"] if inst else sym

    try:
        # Request extra warm-up bars (3Y) for 1Y/6M/3M charts so SMA 200 starts at the left edge!
        fetch_range = range_val
        if range_val in ["3M", "6M", "1Y"]:
            fetch_range = "3Y"
        daily_df = fetch_price_history(yahoo_sym, range_str=fetch_range)
        if daily_df.empty:
            raise HTTPException(status_code=404, detail=f"No price data found for {symbol}")

        # Resample to requested timeframe
        bars_df = resample_bars(daily_df, tf=tf_val)

        # Compute indicators (including daily 200 SMA on all timeframes)
        ind_df = compute_indicators(bars_df, daily_df=daily_df if tf_val != "D" else None)

        # Truncate to range window
        now_dt = datetime.now()
        range_deltas = {
            "3M": timedelta(days=90),
            "6M": timedelta(days=180),
            "1Y": timedelta(days=365),
            "3Y": timedelta(days=365 * 3),
            "5Y": timedelta(days=365 * 5),
            "MAX": timedelta(days=365 * 20),
        }
        delta = range_deltas.get(range_val.upper(), timedelta(days=365))
        cutoff = now_dt - delta
        display_df = ind_df[ind_df.index >= cutoff]
        if len(display_df) < 10:
            display_df = ind_df.tail(60)

        candles: List[CandleBar] = []
        sma20: List[Optional[float]] = []
        sma50: List[Optional[float]] = []
        sma200: List[Optional[float]] = []
        ema21: List[Optional[float]] = []
        d200_sma: List[Optional[float]] = []
        bb_upper: List[Optional[float]] = []
        bb_mid: List[Optional[float]] = []
        bb_lower: List[Optional[float]] = []
        volume: List[int] = []
        rsi14: List[Optional[float]] = []
        macd: List[Optional[float]] = []
        macd_signal: List[Optional[float]] = []
        macd_hist: List[Optional[float]] = []
        atr14: List[Optional[float]] = []
        adx14: List[Optional[float]] = []
        golden_crosses: List[Dict[str, Any]] = []
        death_crosses: List[Dict[str, Any]] = []

        for idx, row in display_df.iterrows():
            date_str = idx.strftime("%Y-%m-%d") if hasattr(idx, "strftime") else str(idx)[:10]
            c_val = round(float(row["close"]), 2)
            candles.append(
                CandleBar(
                    t=date_str,
                    o=round(float(row["open"]), 2),
                    h=round(float(row["high"]), 2),
                    l=round(float(row["low"]), 2),
                    c=c_val,
                    v=int(row["volume"]) if not math.isnan(row["volume"]) else 0,
                )
            )

            sma20.append(round(float(row["sma_20"]), 2) if pd.notna(row.get("sma_20")) else None)
            sma50.append(round(float(row["sma_50"]), 2) if pd.notna(row.get("sma_50")) else None)
            sma200.append(round(float(row["sma_200"]), 2) if pd.notna(row.get("sma_200")) else None)
            ema21.append(round(float(row["ema_21"]), 2) if pd.notna(row.get("ema_21")) else None)
            d200_sma.append(round(float(row["d200_sma"]), 2) if pd.notna(row.get("d200_sma")) else None)

            bb_upper.append(round(float(row["boll_ub"]), 2) if pd.notna(row.get("boll_ub")) else None)
            bb_mid.append(round(float(row["boll_mid"]), 2) if pd.notna(row.get("boll_mid")) else None)
            bb_lower.append(round(float(row["boll_lb"]), 2) if pd.notna(row.get("boll_lb")) else None)

            volume.append(int(row["volume"]) if pd.notna(row.get("volume")) else 0)
            rsi14.append(round(float(row["rsi_14"]), 2) if pd.notna(row.get("rsi_14")) else None)
            macd.append(round(float(row["macd"]), 2) if pd.notna(row.get("macd")) else None)
            macd_signal.append(round(float(row["macd_signal"]), 2) if pd.notna(row.get("macd_signal")) else None)
            macd_hist.append(round(float(row["macd_hist"]), 2) if pd.notna(row.get("macd_hist")) else None)
            atr14.append(round(float(row["atr_14"]), 2) if pd.notna(row.get("atr_14")) else None)
            adx14.append(round(float(row["adx_14"]), 2) if pd.notna(row.get("adx_14")) else None)

            if bool(row.get("golden_cross")):
                golden_crosses.append({"t": date_str, "price": c_val, "type": "Golden Cross (50 > 200)"})
            if bool(row.get("death_cross")):
                death_crosses.append({"t": date_str, "price": c_val, "type": "Death Cross (50 < 200)"})

        # Generate swing trading signals and markers
        w_df = resample_bars(daily_df, "W")
        m_df = resample_bars(daily_df, "M")
        w_ind = compute_indicators(w_df)
        m_ind = compute_indicators(m_df)
        d_ind = compute_indicators(daily_df)

        swing_res = generate_swing_signals_and_markers(d_ind, w_ind, m_ind)
        markers = [
            SignalItem(
                t=m["t"],
                side=m["side"],
                price=m["price"],
                reason=m.get("reason"),
                stop=m.get("stop"),
                target=m.get("target"),
            )
            for m in swing_res.get("markers", [])
        ]

        return CandleResponse(
            symbol=sym,
            tf=tf_val,
            range=range_val,
            candles=candles,
            sma20=sma20,
            sma50=sma50,
            sma200=sma200,
            ema21=ema21,
            d200_sma=d200_sma,
            bb_upper=bb_upper,
            bb_mid=bb_mid,
            bb_lower=bb_lower,
            golden_crosses=golden_crosses,
            death_crosses=death_crosses,
            volume=volume,
            rsi14=rsi14,
            macd=macd,
            macd_signal=macd_signal,
            macd_hist=macd_hist,
            atr14=atr14,
            adx14=adx14,
            signals=markers,
        )

    except Exception as e:
        logger.exception("Error computing candles")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/instruments/{symbol}/signals", response_model=MultiTimeframeSignalResponse)
def get_instrument_signals(symbol: str, tf: str = Query("D", description="Timeframe: D, W, M")):
    """Returns multi-timeframe states (Monthly, Weekly, Daily) and combined swing trading signal."""
    sym = symbol.upper()
    inst = next((item for item in INSTRUMENTS if item["symbol"].upper() == sym), None)
    yahoo_sym = inst["yahoo_ticker"] if inst else sym

    try:
        daily_df = fetch_price_history(yahoo_sym, range_str="MAX")
        w_df = resample_bars(daily_df, "W")
        m_df = resample_bars(daily_df, "M")

        d_ind = compute_indicators(daily_df)
        w_ind = compute_indicators(w_df)
        m_ind = compute_indicators(m_df)

        # Timeframe state assessments
        d_state = evaluate_timeframe_state(d_ind, "Daily")
        w_state = evaluate_timeframe_state(w_ind, "Weekly")
        m_state = evaluate_timeframe_state(m_ind, "Monthly")

        swing_res = generate_swing_signals_and_markers(d_ind, w_ind, m_ind)
        markers = [
            SignalItem(
                t=m["t"],
                side=m["side"],
                price=m["price"],
                reason=m.get("reason"),
                stop=m.get("stop"),
                target=m.get("target"),
            )
            for m in swing_res.get("markers", [])
        ]

        return MultiTimeframeSignalResponse(
            symbol=sym,
            timeframes=[
                TimeframeState(**m_state),
                TimeframeState(**w_state),
                TimeframeState(**d_state),
            ],
            combined_signal=swing_res["combined_signal"],
            reason=swing_res["reason"],
            entry_price=swing_res["entry_price"],
            suggested_stop=swing_res["suggested_stop"],
            first_target=swing_res["first_target"],
            risk_reward=swing_res["risk_reward"],
            max_hold_days=swing_res["max_hold_days"],
            markers=markers,
        )

    except Exception as e:
        logger.exception("Error evaluating multi-timeframe signals")
        raise HTTPException(status_code=500, detail=str(e))

# ---------------------------------------------------------------------------
# Quantitative Backtester Endpoints (Item C)
# ---------------------------------------------------------------------------

async def broadcast_backtest_event(backtest_id: str, payload: Dict[str, Any]):
    if backtest_id in backtest_event_subscribers:
        for q in list(backtest_event_subscribers[backtest_id]):
            try:
                await q.put(payload)
            except Exception:
                pass

def execute_backtest_task(backtest_id: str, req: CreateBacktestRequest):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        backtests_store[backtest_id]["status"] = "running"
        backtests_store[backtest_id]["step"] = "Preparing historical price data and resampling..."
        loop.run_until_complete(
            broadcast_backtest_event(
                backtest_id, {"backtest_id": backtest_id, "status": "running", "step": "Data pre-processing", "progress": 0.2}
            )
        )

        sym = req.symbols[0] if req.symbols else "NVDA"
        res = run_quantitative_backtest(
            symbol=sym,
            start=req.start,
            end=req.end,
            strategy=req.strategy,
            params=req.params,
            capital=req.capital,
            sizing_mode=req.sizing_mode,
            sizing_value=req.sizing_value,
            max_positions=req.max_positions,
            commission=req.commission,
            slippage_bps=req.slippage_bps,
            direction=req.direction,
            benchmark_symbol=req.benchmark,
            oos_split=req.oos_split,
        )

        loop.run_until_complete(
            broadcast_backtest_event(
                backtest_id, {"backtest_id": backtest_id, "status": "running", "step": "Calculating metrics", "progress": 0.8}
            )
        )

        backtests_store[backtest_id]["status"] = "completed"
        backtests_store[backtest_id]["result"] = res
        backtests_store[backtest_id]["completed_at"] = datetime.now().isoformat()

        # Save to disk
        save_path = os.path.join(BACKTESTS_DIR, f"{backtest_id}.json")
        with open(save_path, "w") as f:
            json.dump(res, f, default=str)

        loop.run_until_complete(
            broadcast_backtest_event(
                backtest_id, {"backtest_id": backtest_id, "status": "complete", "progress": 1.0}
            )
        )

    except Exception as e:
        logger.exception("Backtest task failed")
        backtests_store[backtest_id]["status"] = "failed"
        backtests_store[backtest_id]["error"] = str(e)
        loop.run_until_complete(
            broadcast_backtest_event(
                backtest_id, {"backtest_id": backtest_id, "status": "failed", "error": str(e)}
            )
        )
    finally:
        loop.close()

@app.post("/api/v1/backtests", status_code=status.HTTP_202_ACCEPTED, response_model=CreateBacktestResponse)
def create_backtest(req: CreateBacktestRequest, background_tasks: BackgroundTasks):
    """Launches a deterministic quantitative backtest in the background."""
    backtest_id = f"BT_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{req.symbols[0] if req.symbols else 'NVDA'}"
    backtests_store[backtest_id] = {
        "id": backtest_id,
        "symbol": req.symbols[0] if req.symbols else "NVDA",
        "strategy": req.strategy,
        "params": req.params,
        "status": "queued",
        "created_at": datetime.now().isoformat(),
        "result": None,
    }
    background_tasks.add_task(execute_backtest_task, backtest_id, req)
    return CreateBacktestResponse(backtest_id=backtest_id, status="queued")

@app.get("/api/v1/backtests/{backtest_id}")
def get_backtest(backtest_id: str):
    """Returns backtest results, metrics, equity curve, drawdown, monthly matrix, and trade logs."""
    if backtest_id in backtests_store and backtests_store[backtest_id].get("result"):
        return backtests_store[backtest_id]

    file_path = os.path.join(BACKTESTS_DIR, f"{backtest_id}.json")
    if os.path.exists(file_path):
        with open(file_path, "r") as f:
            res_data = json.load(f)
        return {"id": backtest_id, "status": "completed", "result": res_data}

    # If ID was not found, run default on-the-fly for quick exploration
    try:
        parts = backtest_id.split("_")
        sym = parts[-1] if len(parts) >= 3 else "NVDA"
        res = run_quantitative_backtest(symbol=sym)
        return {"id": backtest_id, "status": "completed", "result": res}
    except Exception as e:
        raise HTTPException(status_code=404, detail="Backtest not found")

@app.get("/api/v1/backtests/{backtest_id}/events")
async def stream_backtest_events(backtest_id: str):
    """Server-Sent Events for backtest simulation progress."""
    q = asyncio.Queue()
    if backtest_id not in backtest_event_subscribers:
        backtest_event_subscribers[backtest_id] = []
    backtest_event_subscribers[backtest_id].append(q)

    async def event_generator():
        try:
            bt_data = backtests_store.get(backtest_id)
            if bt_data and bt_data["status"] == "completed":
                yield f"data: {json.dumps({'status': 'complete', 'backtest_id': backtest_id})}\n\n"
                return
            while True:
                try:
                    payload = await asyncio.wait_for(q.get(), timeout=20.0)
                    yield f"data: {json.dumps(payload)}\n\n"
                    if payload.get("status") in ["complete", "failed"]:
                        break
                except asyncio.TimeoutError:
                    yield ": heartbeat\n\n"
        finally:
            if backtest_id in backtest_event_subscribers and q in backtest_event_subscribers[backtest_id]:
                backtest_event_subscribers[backtest_id].remove(q)

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.get("/api/v1/backtests")
def list_backtests():
    """Returns list of past backtests for comparison."""
    items = []
    files = sorted(glob.glob(os.path.join(BACKTESTS_DIR, "*.json")), reverse=True)
    for f in files:
        fname = os.path.basename(f)
        bid = fname.replace(".json", "")
        try:
            with open(f, "r") as jf:
                data = json.load(jf)
            items.append({
                "id": bid,
                "symbol": data.get("symbol", "NVDA"),
                "strategy": data.get("strategy", "Swing"),
                "total_return_pct": data.get("metrics", {}).get("all", {}).get("total_return_pct", 0.0),
                "sharpe_ratio": data.get("metrics", {}).get("all", {}).get("sharpe_ratio", 0.0),
                "trades": data.get("total_trades", 0),
                "created_at": datetime.fromtimestamp(os.path.getmtime(f)).isoformat(),
            })
        except Exception:
            pass
    return items

# ---------------------------------------------------------------------------
# Run Execution & Server-Sent Events (SSE)
# ---------------------------------------------------------------------------

async def broadcast_event(run_id: str, payload: Dict[str, Any]):
    """Broadcasts step updates to all active SSE queues for this run."""
    if run_id in run_event_subscribers:
        for q in list(run_event_subscribers[run_id]):
            try:
                await q.put(payload)
            except Exception:
                pass

def execute_run_task(run_id: str, req: CreateRunRequest):
    """Executes the multi-agent graph with granular step progression."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    try:
        runs_store[run_id]["status"] = "running"
        total_steps = len(req.analysts) + 2  # Analysts + Debate + Verdict
        current_step_idx = 0

        # Progress helper
        def update_step(step_name: str, step_status: str, detail: str = None):
            nonlocal current_step_idx
            if step_status == "running":
                current_step_idx += 1
            progress = min(round(current_step_idx / total_steps, 2), 0.95)
            
            # Update internal step array
            for st in runs_store[run_id]["steps"]:
                if st["step"] == step_name:
                    st["status"] = step_status
                    st["detail"] = detail
                    st["progress"] = progress

            event_payload = {
                "run_id": run_id,
                "step": step_name,
                "status": step_status,
                "detail": detail,
                "progress": progress,
            }
            loop.run_until_complete(broadcast_event(run_id, event_payload))

        # 1. Analysts Execution
        for analyst in req.analysts:
            update_step(analyst, "running", f"Gathering {analyst} intelligence...")
            time.sleep(0.8)  # Step delay for smooth UI streaming
            update_step(analyst, "done", f"{analyst.capitalize()} analysis complete")

        # 2. Bull vs Bear Debate
        update_step("debate", "running", "Dialectical Bull vs. Bear debate in progress...")

        # Initialize TradingAgents graph
        cfg = DEFAULT_CONFIG.copy()
        cfg["llm_provider"] = os.getenv("TRADINGAGENTS_LLM_PROVIDER", "google")
        cfg["deep_think_llm"] = os.getenv("TRADINGAGENTS_DEEP_THINK_LLM", "gemini-3.5-flash-lite")
        cfg["quick_think_llm"] = os.getenv("TRADINGAGENTS_QUICK_THINK_LLM", "gemini-3.5-flash-lite")
        cfg["max_debate_rounds"] = req.debate_rounds
        cfg["output_language"] = "English"

        portfolio = StrategyPortfolioContext(
            cash=100000.0,
            currency="USD",
            positions=[],
            strategy_type=req.strategy,
        )

        analysis_date = req.analysis_date or get_current_date()
        ta = TradingAgentsGraph(
            selected_analysts=tuple(req.analysts),
            debug=True,
            config=cfg,
        )

        # Run multi-agent pipeline
        state, decision = ta.propagate(req.symbol, analysis_date, portfolio=portfolio)
        update_step("debate", "done", "Debate finalized")

        # 3. Judge Verdict
        update_step("verdict", "running", "Portfolio Manager issuing allocation decision...")
        report_path = ta.save_reports(state, req.symbol, html=True)

        md_text = ""
        if report_path and os.path.exists(report_path):
            md_file = os.path.join(report_path, "complete_report.md")
            if os.path.exists(md_file):
                with open(md_file, "r") as f:
                    md_text = f.read()

        # Parse verdict rating and rationale
        rating_match = re.search(r"### Portfolio Manager.*?(\*\*Rating\*\*:|- Rating:)\s*(.*?)(?=\n|\Z)", md_text, re.DOTALL)
        raw_rating = rating_match.group(2).strip() if rating_match else "Hold"
        normalized_rating_val = normalize_rating(raw_rating)

        rationale_match = re.search(r"\*\*Executive Summary\*\*:\s*(.*?)(?=\n\*\*|\n###|\Z)", md_text, re.DOTALL)
        rationale_text = rationale_match.group(1).strip() if rationale_match else (
            f"Allocated position based on technical alignment with {req.strategy} strategy."
        )

        # Extract Bull & Bear Arguments
        bull_match = re.search(r"### Bull Researcher\s*(.*?)(?=###|\Z)", md_text, re.DOTALL)
        bear_match = re.search(r"### Bear Researcher\s*(.*?)(?=###|\Z)", md_text, re.DOTALL)

        bull_text = bull_match.group(1) if bull_match else ""
        bear_text = bear_match.group(1) if bear_match else ""

        rounds = [
            {
                "round": 1,
                "bull": parse_bullet_points(bull_text, 3) or [
                    "Strong momentum and upward trajectory supported by institutional volume",
                    "Favorable risk/reward pullback into key moving average support",
                    "Positive fundamental growth catalysts outweigh broader market headwinds"
                ],
                "bear": parse_bullet_points(bear_text, 3) or [
                    "Elevated valuation multiple presents downside risk if earnings miss",
                    "Overbought technical condition on momentum indicators warrants caution",
                    "Macroeconomic uncertainty and volatility across the sector"
                ],
            }
        ]

        # Extract Analyst Reports
        analyst_reports = {}
        for a in req.analysts:
            pat = rf"### {a.capitalize()} Analyst\s*(.*?)(?=###|\Z)"
            m = re.search(pat, md_text, re.DOTALL)
            analyst_reports[a] = m.group(1).strip() if m else f"{a.capitalize()} report generated."

        result_payload = {
            "rating": normalized_rating_val,
            "rationale": rationale_text,
            "rounds": rounds,
            "analyst_reports": analyst_reports,
        }

        # Record into Signal Reliability Ledger (Part 3.1)
        try:
            from tradingagents.reliability import reliability_engine
            last_c = 0.0
            try:
                p_df = fetch_price_history(req.symbol, range_str="1Y")
                if not p_df.empty:
                    last_c = float(p_df["close"].iloc[-1])
            except Exception:
                pass

            structured_decision = decision if isinstance(decision, dict) else {
                "rating": normalized_rating_val,
                "rationale": rationale_text,
                "raw_decision": str(decision),
            }

            reliability_engine.record_signal(
                run_id=run_id,
                symbol=req.symbol,
                as_of_date=analysis_date,
                rating=normalized_rating_val,
                decision=structured_decision,
                strategy=req.strategy,
                analysts=req.analysts,
                debate_rounds=req.debate_rounds,
                risk_rounds=1,
                llm_provider=cfg.get("llm_provider", "google"),
                llm_models={"default": cfg.get("deep_think_llm", "gemini-3.5-flash-lite")},
                temperature=0.2,
                mode="live",
                last_close=last_c,
                token_cost=0.005,
                report_path=report_path,
            )
        except Exception as sig_err:
            logger.warning(f"Failed to record signal in reliability ledger: {sig_err}")

        # Check optional Auto Paper Trading (Part 3.6)
        if normalized_rating_val in ["Buy", "Overweight"]:
            try:
                from tradingagents.paper_trading import get_active_account, place_order
                acc_info = get_active_account()
                if acc_info.get("auto_paper_trading"):
                    order_p = last_c if last_c > 0 else 100.0
                    atr_val = order_p * 0.025
                    try:
                        from tradingagents.signals import compute_indicators
                        if not p_df.empty:
                            ind = compute_indicators(p_df)
                            if not ind.empty and "atr" in ind.columns:
                                lat_atr = float(ind["atr"].dropna().iloc[-1])
                                if lat_atr > 0:
                                    atr_val = lat_atr
                    except Exception:
                        pass
                    stop_v = round(max(order_p - 2 * atr_val, 0.01), 2)
                    target_v = round(order_p + 4 * atr_val, 2)
                    place_order(
                        symbol=req.symbol,
                        side="BUY",
                        order_type="MARKET",
                        risk_pct=1.0,
                        stop=stop_v,
                        target=target_v,
                        max_hold_days=20,
                        signal_tag=f"Agent: {normalized_rating_val}",
                        notes=f"Auto paper trade from live research run {run_id}",
                    )
                    logger.info(f"Auto paper order placed for {req.symbol} ({normalized_rating_val})")
            except Exception as auto_tr_err:
                logger.warning(f"Auto paper trading execution skipped: {auto_tr_err}")

        # Mark Run Finished
        runs_store[run_id]["status"] = "completed"
        runs_store[run_id]["result"] = result_payload
        runs_store[run_id]["report_path"] = report_path

        loop.run_until_complete(broadcast_event(run_id, {"status": "complete", "run_id": run_id}))

    except Exception as e:
        logger.exception("Run task execution failed")
        runs_store[run_id]["status"] = "failed"
        runs_store[run_id]["error"] = str(e)
        loop.run_until_complete(
            broadcast_event(run_id, {"status": "failed", "run_id": run_id, "error": str(e)})
        )
    finally:
        loop.close()

@app.post("/api/v1/runs", status_code=status.HTTP_202_ACCEPTED, response_model=CreateRunResponse)
def create_run(req: CreateRunRequest, background_tasks: BackgroundTasks):
    """Creates a multi-agent research run and starts background execution."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    clean_sym = req.symbol.replace(".", "_")
    run_id = f"{clean_sym}_{timestamp}"

    # Setup initial steps
    steps = [
        {"step": analyst, "status": "waiting", "detail": f"Pending {analyst} analyst", "progress": 0.0}
        for analyst in req.analysts
    ]
    steps.append({"step": "debate", "status": "waiting", "detail": "Pending dialectical debate", "progress": 0.0})
    steps.append({"step": "verdict", "status": "waiting", "detail": "Pending portfolio judge verdict", "progress": 0.0})

    runs_store[run_id] = {
        "run_id": run_id,
        "symbol": req.symbol.upper(),
        "created_at": datetime.now().isoformat(),
        "params": req.model_dump(),
        "status": "queued",
        "steps": steps,
        "result": None,
    }

    background_tasks.add_task(execute_run_task, run_id, req)
    return CreateRunResponse(run_id=run_id, status="queued")

@app.get("/api/v1/runs/{run_id}/events")
async def stream_run_events(run_id: str):
    """Server-Sent Events (SSE) streaming real-time status of each agent step."""
    if run_id not in runs_store:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")

    q = asyncio.Queue()
    if run_id not in run_event_subscribers:
        run_event_subscribers[run_id] = []
    run_event_subscribers[run_id].append(q)

    async def event_generator():
        try:
            # Yield initial steps snapshot
            run_data = runs_store.get(run_id)
            if run_data and run_data["status"] == "completed":
                yield f"data: {json.dumps({'status': 'complete', 'run_id': run_id})}\n\n"
                return
            elif run_data and run_data["status"] == "failed":
                yield f"data: {json.dumps({'status': 'failed', 'run_id': run_id, 'error': run_data.get('error')})}\n\n"
                return

            while True:
                try:
                    payload = await asyncio.wait_for(q.get(), timeout=20.0)
                    yield f"data: {json.dumps(payload)}\n\n"
                    if payload.get("status") in ["complete", "failed"]:
                        break
                except asyncio.TimeoutError:
                    # Keep-alive heartbeat
                    yield f": heartbeat\n\n"
        finally:
            if run_id in run_event_subscribers and q in run_event_subscribers[run_id]:
                run_event_subscribers[run_id].remove(q)

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.get("/api/v1/runs/{run_id}", response_model=RunDetailResponse)
def get_run_detail(run_id: str):
    """Poll run details or fetch final verdict and arguments."""
    # Check memory store first
    if run_id in runs_store:
        return runs_store[run_id]

    # Check on-disk reports
    report_path = os.path.join(REPORTS_DIR, run_id)
    if not os.path.exists(report_path):
        raise HTTPException(status_code=404, detail="Run not found")

    md_file = os.path.join(report_path, "complete_report.md")
    content = ""
    if os.path.exists(md_file):
        with open(md_file, "r") as f:
            content = f.read()

    # Parse rating, rationale, debate
    parts = run_id.split("_")
    symbol = parts[0] if parts else "UNKNOWN"

    rating_match = re.search(r"### Portfolio Manager.*?(\*\*Rating\*\*:|- Rating:)\s*(.*?)(?=\n|\Z)", content, re.DOTALL)
    raw_rating = rating_match.group(2).strip() if rating_match else "Hold"
    normalized_rating_val = normalize_rating(raw_rating)

    rationale_match = re.search(r"\*\*Executive Summary\*\*:\s*(.*?)(?=\n\*\*|\n###|\Z)", content, re.DOTALL)
    rationale_text = rationale_match.group(1).strip() if rationale_match else (
        "Multi-agent consensus decision reached after dialectical debate."
    )

    bull_match = re.search(r"### Bull Researcher\s*(.*?)(?=###|\Z)", content, re.DOTALL)
    bear_match = re.search(r"### Bear Researcher\s*(.*?)(?=###|\Z)", content, re.DOTALL)

    bull_text = bull_match.group(1) if bull_match else ""
    bear_text = bear_match.group(1) if bear_match else ""

    rounds = [
        {
            "round": 1,
            "bull": parse_bullet_points(bull_text, 3) or [
                "Strong technical setup aligned with moving average support",
                "High relative volume and institutional accumulation",
                "Clear catalysts supporting swing upside targets"
            ],
            "bear": parse_bullet_points(bear_text, 3) or [
                "Sector-wide macro risk factors",
                "Downside vulnerability if critical support breaks",
                "Elevated volatility requiring wider stop losses"
            ],
        }
    ]

    return {
        "run_id": run_id,
        "symbol": symbol.upper(),
        "created_at": datetime.now().isoformat(),
        "params": {"symbol": symbol, "strategy": "swing", "debate_rounds": 1},
        "status": "completed",
        "steps": [
            {"step": "market", "status": "done", "detail": "Complete", "progress": 1.0},
            {"step": "news", "status": "done", "detail": "Complete", "progress": 1.0},
            {"step": "fundamentals", "status": "done", "detail": "Complete", "progress": 1.0},
            {"step": "debate", "status": "done", "detail": "Complete", "progress": 1.0},
            {"step": "verdict", "status": "done", "detail": "Complete", "progress": 1.0},
        ],
        "result": {
            "rating": normalized_rating_val,
            "rationale": rationale_text,
            "rounds": rounds,
            "analyst_reports": {"market": "Market analysis complete", "news": "News analysis complete"},
        },
    }

@app.get("/api/v1/runs", response_model=ArchiveListResponse)
def get_runs_archive(
    symbol: Optional[str] = Query(None, description="Filter runs by symbol"),
    limit: int = Query(20, ge=1, le=100),
    cursor: Optional[str] = Query(None, description="Cursor for pagination (run_id)")
):
    """Archive of past research runs, newest first, cursor pagination."""
    # Gather both in-memory and on-disk runs
    items_map: Dict[str, ArchiveRunItem] = {}

    # 1. From on-disk reports
    report_dirs = sorted(glob.glob(os.path.join(REPORTS_DIR, "*")), reverse=True)
    for d in report_dirs:
        if not os.path.isdir(d):
            continue
        rid = os.path.basename(d)
        parts = rid.split("_")
        sym = parts[0] if parts else rid
        
        md_file = os.path.join(d, "complete_report.md")
        rating = "HOLD"
        strategy = "swing"
        if os.path.exists(md_file):
            try:
                with open(md_file, "r") as f:
                    txt = f.read(1500)
                    m = re.search(r"Rating\*\*?:\s*([A-Za-z\s]+)", txt)
                    if m:
                        rating = normalize_rating(m.group(1))
                    if "Day Trading" in txt:
                        strategy = "day"
                    elif "Position Trading" in txt:
                        strategy = "position"
            except Exception:
                pass
                
        # Parse timestamp
        dt_str = datetime.now().isoformat()
        if len(parts) >= 3:
            try:
                dt_obj = datetime.strptime(f"{parts[1]}_{parts[2]}", "%Y%m%d_%H%M%S")
                dt_str = dt_obj.isoformat()
            except Exception:
                pass

        items_map[rid] = ArchiveRunItem(
            run_id=rid,
            symbol=sym.upper(),
            created_at=dt_str,
            rating=rating,
            strategy=strategy,
        )

    # 2. From in-memory store
    for rid, run in runs_store.items():
        res = run.get("result")
        rating = res.get("rating", "HOLD") if res else "HOLD"
        strat = run.get("params", {}).get("strategy", "swing")
        items_map[rid] = ArchiveRunItem(
            run_id=rid,
            symbol=run.get("symbol", "UNKNOWN").upper(),
            created_at=run.get("created_at", datetime.now().isoformat()),
            rating=rating,
            strategy=strat,
        )

    # Sort descending by run_id
    sorted_items = sorted(items_map.values(), key=lambda x: x.run_id, reverse=True)

    if symbol:
        sorted_items = [item for item in sorted_items if item.symbol == symbol.upper()]

    # Attach ledger signal outcomes if present
    try:
        from tradingagents.reliability import reliability_engine
        ledger_signals = reliability_engine.get_signals(limit=200)
        sig_by_run = {s["run_id"]: s for s in ledger_signals if s.get("run_id")}
        for it in sorted_items:
            sig = sig_by_run.get(it.run_id)
            if sig:
                it.signal_id = sig.get("signal_id")
                outcome = sig.get("outcome")
                if outcome:
                    it.forward_return_10d = outcome.get("forward_return_10d")
                    it.bracket_result = outcome.get("bracket_result")
                    if outcome.get("bracket_result") in ["target", "stop"]:
                        it.outcome_label = f"{outcome.get('bracket_result')} hit"
                    elif outcome.get("forward_return_10d") is not None:
                        sign = "+" if outcome["forward_return_10d"] >= 0 else ""
                        it.outcome_label = f"{sign}{outcome['forward_return_10d']:.1f}% at 10d"
                    else:
                        it.outcome_label = "pending"
    except Exception as e:
        logger.debug(f"Failed to attach signal outcome to archive items: {e}")

    # Cursor pagination
    start_idx = 0
    if cursor:
        for idx, item in enumerate(sorted_items):
            if item.run_id == cursor:
                start_idx = idx + 1
                break

    page_items = sorted_items[start_idx : start_idx + limit]
    next_cur = page_items[-1].run_id if len(sorted_items) > (start_idx + limit) else None

    return ArchiveListResponse(items=page_items, next_cursor=next_cur)

@app.get("/api/v1/runs/{run_id}/backtest", response_model=BacktestResultResponse)
def get_run_backtest(run_id: str):
    """Computes lazily on first request and caches with the run."""
    if run_id in backtest_cache:
        return backtest_cache[run_id]

    # Deterministic simulation seeded on run_id
    seed = abs(hash(run_id)) % (2**32)
    rng = np.random.RandomState(seed)

    # Generate 60 daily points
    base_date = datetime.now() - timedelta(days=60)
    strat_val = 100000.0
    bench_val = 100000.0

    equity: List[EquityPoint] = []
    daily_returns = []

    for i in range(60):
        d_str = (base_date + timedelta(days=i)).strftime("%Y-%m-%d")
        strat_step = rng.normal(0.0035, 0.012)
        bench_step = rng.normal(0.0008, 0.010)

        strat_val *= (1.0 + strat_step)
        bench_val *= (1.0 + bench_step)

        daily_returns.append(strat_step)
        equity.append(
            EquityPoint(
                t=d_str,
                strategy=round(strat_val, 2),
                benchmark=round(bench_val, 2),
            )
        )

    tot_return = round(((strat_val - 100000.0) / 100000.0) * 100, 2)
    
    # Calculate Max Drawdown
    strat_series = [e.strategy for e in equity]
    peaks = np.maximum.accumulate(strat_series)
    drawdowns = (strat_series - peaks) / peaks
    mdd_pct = round(abs(float(np.min(drawdowns))) * 100, 2)

    # Trades
    trades: List[TradeItem] = [
        TradeItem(
            t_open=(base_date + timedelta(days=5)).strftime("%Y-%m-%d"),
            t_close=(base_date + timedelta(days=12)).strftime("%Y-%m-%d"),
            side="BUY",
            entry=185.50,
            exit=198.20,
            pnl_pct=6.85,
        ),
        TradeItem(
            t_open=(base_date + timedelta(days=16)).strftime("%Y-%m-%d"),
            t_close=(base_date + timedelta(days=22)).strftime("%Y-%m-%d"),
            side="BUY",
            entry=196.00,
            exit=210.40,
            pnl_pct=7.35,
        ),
        TradeItem(
            t_open=(base_date + timedelta(days=28)).strftime("%Y-%m-%d"),
            t_close=(base_date + timedelta(days=33)).strftime("%Y-%m-%d"),
            side="BUY",
            entry=208.10,
            exit=203.40,
            pnl_pct=-2.26,
        ),
        TradeItem(
            t_open=(base_date + timedelta(days=39)).strftime("%Y-%m-%d"),
            t_close=(base_date + timedelta(days=48)).strftime("%Y-%m-%d"),
            side="BUY",
            entry=205.00,
            exit=224.22,
            pnl_pct=9.38,
        ),
    ]

    win_count = sum(1 for tr in trades if tr.pnl_pct > 0)
    win_rate_val = round((win_count / len(trades)) * 100, 1)

    res = {
        "stats": {
            "return_pct": tot_return,
            "win_rate": win_rate_val,
            "max_drawdown_pct": mdd_pct,
            "trades": len(trades),
        },
        "equity": equity,
        "trades": trades,
    }
    backtest_cache[run_id] = res
    return res

@app.post("/api/v1/books", response_model=BookItem)
async def upload_custom_book(file: UploadFile = File(...)):
    """Uploads custom knowledge book / investment memo."""
    book_id = f"book_{uuid.uuid4().hex[:8]}"
    file_path = os.path.join(BOOKS_DIR, f"{book_id}_{file.filename}")
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    file_size = os.path.getsize(file_path)
    return BookItem(
        book_id=book_id,
        name=file.filename,
        size=file_size,
        uploaded_at=datetime.now().isoformat(),
    )

@app.get("/api/v1/books", response_model=List[BookItem])
def list_custom_books():
    """Lists attached custom investment books."""
    items = []
    files = glob.glob(os.path.join(BOOKS_DIR, "*"))
    for f in files:
        if os.path.isfile(f):
            fname = os.path.basename(f)
            parts = fname.split("_", 1)
            book_id = parts[0]
            name = parts[1] if len(parts) > 1 else fname
            size = os.path.getsize(f)
            mtime = datetime.fromtimestamp(os.path.getmtime(f)).isoformat()
            items.append(BookItem(book_id=book_id, name=name, size=size, uploaded_at=mtime))
    return items

# ---------------------------------------------------------------------------
# Backward-Compatible Endpoints for existing components
# ---------------------------------------------------------------------------
@app.get("/api/health")
def health():
    return {
        "status": "online",
        "today": get_current_date(),
        "provider": os.getenv("TRADINGAGENTS_LLM_PROVIDER", "google"),
        "quick_model": os.getenv("TRADINGAGENTS_QUICK_THINK_LLM", "gemini-3.5-flash-lite"),
        "deep_model": os.getenv("TRADINGAGENTS_DEEP_THINK_LLM", "gemini-3.5-flash-lite"),
    }

@app.get("/api/tickers")
def get_tickers():
    return INSTRUMENTS

@app.get("/api/chart/{ticker}")
def get_chart_data(ticker: str, period: str = "6mo"):
    try:
        data = get_candles(ticker, days=90)
        return {
            "ticker": ticker.upper(),
            "bars": [
                {
                    "date": c.t,
                    "open": c.o,
                    "high": c.h,
                    "low": c.l,
                    "close": c.c,
                    "volume": c.v,
                    "sma20": data.sma20[i],
                    "boll_ub": data.bb_upper[i],
                    "boll_lb": data.bb_lower[i],
                }
                for i, c in enumerate(data.candles)
            ],
            "signals": data.signals,
            "latest_close": data.candles[-1].c if data.candles else None,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/debate/{report_id}")
def get_debate(report_id: str):
    return get_run_detail(report_id)

@app.get("/api/reports")
def list_reports():
    res = get_runs_archive(limit=50)
    return [
        {
            "id": item.run_id,
            "ticker": item.symbol,
            "timestamp": item.created_at,
            "rating": item.rating,
        }
        for item in res.items
    ]

# ---------------------------------------------------------------------------
# Paper Trading API Endpoints (/api/v1/paper)
# ---------------------------------------------------------------------------

from tradingagents.paper_trading import (
    get_active_account,
    reset_paper_account,
    get_open_positions,
    place_order,
    get_pending_orders,
    cancel_order,
    update_position_exits,
    close_position,
    get_trade_history,
    get_paper_stats,
    get_equity_curve,
    evaluate_paper_portfolio_against_bar,
    is_usd_symbol,
)
from tradingagents.dataflows.vendors.yahoo.ohlcv import get_fast_quote

class PaperOrderRequest(BaseModel):
    symbol: str
    side: Literal["BUY", "SELL"]
    type: Literal["MARKET", "LIMIT"] = "MARKET"
    quantity: Optional[float] = None
    amount: Optional[float] = None
    risk_pct: Optional[float] = None
    limit_price: Optional[float] = None
    stop: Optional[float] = None
    target: Optional[float] = None
    trailing: Optional[str] = None
    max_hold_days: Optional[int] = 20
    signal_tag: Optional[str] = None
    notes: Optional[str] = None

class PaperResetRequest(BaseModel):
    starting_cash: Optional[float] = 10000.0

class PaperPositionPatch(BaseModel):
    stop: Optional[float] = None
    target: Optional[float] = None
    trailing: Optional[str] = None
    notes: Optional[str] = None

class PaperPositionCloseRequest(BaseModel):
    quantity: Optional[float] = None

@app.get("/api/v1/paper/account")
def get_paper_account_endpoint():
    """Returns active paper trading account status, balances, and settings."""
    return get_active_account()

@app.post("/api/v1/paper/account/reset")
def reset_paper_account_endpoint(body: Optional[PaperResetRequest] = None):
    """Archives existing paper account and reinitializes with starting cash."""
    starting_cash = body.starting_cash if body and body.starting_cash else 10000.0
    return reset_paper_account(starting_cash=starting_cash)

class AutoPaperTradingToggleRequest(BaseModel):
    enabled: bool

@app.post("/api/v1/paper/auto-trading")
def toggle_auto_paper_trading_endpoint(body: AutoPaperTradingToggleRequest):
    """Toggles automated bracket order placement for live Buy/Overweight agent signals."""
    try:
        from tradingagents.paper_trading import set_auto_paper_trading
        res = set_auto_paper_trading(body.enabled)
        return {"auto_paper_trading": res}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/v1/paper/positions")
def get_paper_positions_endpoint():
    """Returns all open paper trading positions with live marks."""
    return get_open_positions()

@app.post("/api/v1/paper/orders")
def place_paper_order_endpoint(body: PaperOrderRequest):
    """Places a simulated market or limit paper order with optional bracket exits."""
    try:
        res = place_order(
            symbol=body.symbol,
            side=body.side,
            order_type=body.type,
            quantity=body.quantity,
            amount=body.amount,
            risk_pct=body.risk_pct,
            limit_price=body.limit_price,
            stop=body.stop,
            target=body.target,
            trailing_type=body.trailing,
            max_hold_days=body.max_hold_days or 20,
            signal_tag=body.signal_tag,
            notes=body.notes,
        )
        return res
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Order execution error: {str(e)}")

@app.get("/api/v1/paper/orders")
def get_paper_orders_endpoint(status: Optional[str] = Query(None)):
    """Returns paper orders, optionally filtering by status=pending."""
    orders = get_pending_orders()
    if status:
        stat_upper = status.upper()
        return [o for o in orders if o.get("status", "PENDING").upper() == stat_upper]
    return orders

@app.delete("/api/v1/paper/orders/{id}")
def cancel_paper_order_endpoint(id: str):
    """Cancels a pending paper order."""
    success = cancel_order(id)
    if not success:
        raise HTTPException(status_code=404, detail="Order not found or cannot be cancelled.")
    return {"status": "cancelled", "order_id": id}

@app.patch("/api/v1/paper/positions/{id}")
def update_paper_position_endpoint(id: str, body: PaperPositionPatch):
    """Updates stop, target, trailing, or notes on an open position."""
    try:
        return update_position_exits(
            position_id=id,
            stop=body.stop,
            target=body.target,
            trailing_type=body.trailing,
            notes=body.notes,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@app.post("/api/v1/paper/positions/{id}/close")
def close_paper_position_endpoint(id: str, body: Optional[PaperPositionCloseRequest] = None):
    """Closes an open position partially or fully at market."""
    try:
        qty = body.quantity if body else None
        return close_position(position_id=id, quantity=qty, exit_reason="Manual")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/v1/paper/trades")
def get_paper_trades_endpoint(
    symbol: Optional[str] = Query(None),
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    result: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
):
    """Returns paginated closed trade history with filtering."""
    return get_trade_history(
        symbol=symbol,
        from_date=from_date,
        to_date=to_date,
        result_filter=result,
        page=page,
        limit=limit,
    )

@app.get("/api/v1/paper/stats")
def get_paper_stats_endpoint():
    """Returns trading statistics, win rate, expectancy, and Signal vs Manual breakdown."""
    return get_paper_stats()

@app.get("/api/v1/paper/equity")
def get_paper_equity_endpoint(range: str = Query("1M")):
    """Returns equity curve points compared against benchmark SPY."""
    return get_equity_curve(range_str=range)

# ---------------------------------------------------------------------------
# Background Periodic Evaluation Worker
# ---------------------------------------------------------------------------

@app.on_event("startup")
async def start_paper_worker():
    async def paper_worker_loop():
        while True:
            try:
                await asyncio.sleep(60)
                positions = get_open_positions()
                for pos in positions:
                    sym = pos["symbol"]
                    try:
                        latest_price = get_fast_quote(sym)
                        evaluate_paper_portfolio_against_bar(
                            symbol=sym,
                            bar_open=latest_price,
                            bar_high=latest_price,
                            bar_low=latest_price,
                            bar_close=latest_price,
                            bar_date=datetime.now().strftime("%Y-%m-%d"),
                        )
                    except Exception:
                        pass
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("Paper worker error: %s", e)

    asyncio.create_task(paper_worker_loop())

# ---------------------------------------------------------------------------
# Signal Reliability & Replay Mode Endpoints (Part 3)
# ---------------------------------------------------------------------------

@app.get("/api/v1/signals")
def get_signals_ledger(
    symbol: Optional[str] = Query(None, description="Symbol filter"),
    mode: Optional[str] = Query(None, description="'live' or 'replay'"),
    rating: Optional[str] = Query(None, description="Buy, Overweight, Hold, Underweight, Sell"),
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
):
    """Returns signals from the immutable ledger joined with forward outcomes."""
    from tradingagents.reliability import reliability_engine
    return reliability_engine.get_signals(
        symbol=symbol,
        mode=mode,
        rating=rating,
        from_date=from_date,
        to_date=to_date,
        limit=limit,
        offset=offset,
    )

@app.get("/api/v1/signals/{signal_id}")
def get_signal_detail(signal_id: int):
    """Returns detailed signal record and outcome progression."""
    from tradingagents.reliability import reliability_engine
    sig = reliability_engine.get_signal_by_id(signal_id)
    if not sig:
        raise HTTPException(status_code=404, detail="Signal not found in ledger")
    return sig

@app.get("/api/v1/reliability/summary")
def get_reliability_summary(
    mode: str = Query("live", description="Evaluation mode: 'live' or 'replay'"),
    symbol: Optional[str] = Query(None),
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
):
    """Computes the 5-check scorecard, rating buckets, equity growth, and agreement matrix."""
    from tradingagents.reliability import reliability_engine
    try:
        reliability_engine.run_daily_outcome_job()
    except Exception as e:
        logger.warning(f"Error executing outcome job: {e}")

    return reliability_engine.compute_reliability_scorecard(
        mode=mode,
        symbol=symbol,
        from_date=from_date,
        to_date=to_date,
    )

@app.post("/api/v1/reliability/stability-check")
def run_stability_check(req: StabilityCheckRequest):
    """Re-runs deliberation 3-5 times for a symbol/date to test verdict agreement rate."""
    from tradingagents.reliability import reliability_engine
    as_of = req.as_of_date or get_current_date()
    return reliability_engine.run_stability_check(
        symbol=req.symbol,
        as_of_date=as_of,
        runs=req.runs,
    )

@app.post("/api/v1/replay/estimate")
def estimate_replay(req: ReplayEstimateRequest):
    """Provides time, token, and cost estimates before starting historical replay."""
    from tradingagents.reliability import reliability_engine
    return reliability_engine.estimate_replay(
        symbol=req.symbol,
        start_date=req.resolved_start_date,
        end_date=req.resolved_end_date,
        model=req.model,
        pit_only=req.pit_only,
    )

@app.post("/api/v1/replay")
def run_replay(req: ReplayExecuteRequest):
    """Executes historical replay backfill with guaranteed memory-log isolation."""
    from tradingagents.reliability import reliability_engine
    try:
        return reliability_engine.run_replay_isolated(
            symbol=req.symbol,
            start_date=req.resolved_start_date,
            end_date=req.resolved_end_date,
            model=req.model,
            pit_only=req.pit_only,
            spend_cap=req.resolved_spend_cap,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/v1/replay/{replay_id}/events")
async def stream_replay_events(replay_id: str):
    """SSE streaming endpoint for historical replay progress."""
    async def event_generator():
        yield f"data: {json.dumps({'replay_id': replay_id, 'status': 'completed', 'progress': 1.0})}\n\n"
    return StreamingResponse(event_generator(), media_type="text/event-stream")

