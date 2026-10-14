'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from '../../context/AppContext';
import { BacktestResultSchema } from '../../types/backtest';

const fmtPct = (v) => {
  if (v == null || Number.isNaN(v)) return '—';
  const n = Number(v);
  if (isNaN(n)) return '—';
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
};

const fmtRatio = (v) => {
  if (v == null || Number.isNaN(v)) return '—';
  const n = Number(v);
  if (isNaN(n)) return '—';
  return n.toFixed(2);
};

const fmtDays = (v) => {
  if (v == null || Number.isNaN(v)) return '—';
  const n = Number(v);
  if (isNaN(n)) return '—';
  return `${n.toFixed(1)} d`;
};

const fmtLoss = (v) => {
  if (v == null || Number.isNaN(v)) return '—';
  const n = Number(v);
  if (isNaN(n)) return '—';
  return `-${Math.abs(n).toFixed(2)}%`;
};

const fmtCount = (v) => {
  if (v == null || Number.isNaN(v)) return '—';
  const n = Number(v);
  if (isNaN(n)) return '—';
  return String(Math.round(n));
};

export default function BacktestPage() {
  const router = useRouter();
  const { selectedSymbol, setSelectedSymbol } = useApp();

  // Config States
  const [symbol, setSymbol] = useState(selectedSymbol || 'NVDA');
  const [strategy, setStrategy] = useState('swing_pullback');
  const [timeframe, setTimeframe] = useState('D');
  const [rangePreset, setRangePreset] = useState('5Y');
  const [capital, setCapital] = useState(100000);
  const [sizingMode, setSizingMode] = useState('fixed_pct');
  const [sizingVal, setSizingVal] = useState(0.10);
  const [maxPositions, setMaxPositions] = useState(1);
  const [commission, setCommission] = useState(1.00);
  const [slippageBps, setSlippageBps] = useState(5.0);
  const [direction, setDirection] = useState('long_only');
  const [benchmark, setBenchmark] = useState('BUY_AND_HOLD');
  const [oosSplit, setOosSplit] = useState(0.70);

  // Strategy Parameter States
  const [params, setParams] = useState({
    fast_sma: 50,
    slow_sma: 200,
    pullback_pct: 1.5,
    rsi_trigger: 40,
    rsi_exit: 70,
    adx_filter: 18,
    atr_multiple: 2.0,
    target_rr: 2.0,
    max_hold_days: 15,
  });

  // Execution & Results States
  const [backtestId, setBacktestId] = useState(null);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState(null);
  const [pastRuns, setPastRuns] = useState([]);

  // Trade table sorting
  const [sortField, setSortField] = useState('t_open');
  const [sortAsc, setSortAsc] = useState(false);

  // Sync selected symbol from context
  useEffect(() => {
    if (selectedSymbol && selectedSymbol !== symbol) {
      setSymbol(selectedSymbol);
    }
  }, [selectedSymbol]);

  // Load past backtests on symbol change
  useEffect(() => {
    loadPastBacktests();
  }, [symbol]);

  const loadPastBacktests = async () => {
    try {
      const res = await fetch('/api/v1/backtests');
      if (res.ok) {
        const json = await res.json();
        setPastRuns(json.items || []);
      }
    } catch (e) {
      console.warn('Failed to fetch past backtests:', e);
    }
  };

  const handleStrategyChange = (newStrat) => {
    setStrategy(newStrat);
    if (newStrat === 'dma_200') {
      setParams((p) => ({ ...p, sma_len: 200 }));
    } else if (newStrat === 'sma_cross') {
      setParams((p) => ({ ...p, fast_sma: 50, slow_sma: 200 }));
    } else if (newStrat === 'rsi_mean_rev') {
      setParams((p) => ({ ...p, rsi_oversold: 30, rsi_exit: 65, max_hold_days: 10 }));
    } else if (newStrat === 'macd_cross') {
      setParams((p) => ({ ...p, fast: 12, slow: 26, signal: 9 }));
    }
  };

  const runNewBacktest = async () => {
    setLoading(true);
    setError(null);
    setStatusMessage('Submitting backtest request...');

    const payload = {
      symbols: [symbol],
      strategy,
      timeframe,
      range: rangePreset,
      capital: Number(capital),
      sizing: {
        mode: sizingMode,
        value: Number(sizingVal),
        max_positions: Number(maxPositions),
      },
      costs: {
        commission: Number(commission),
        slippage_bps: Number(slippageBps),
      },
      direction,
      benchmark,
      oos_split: Number(oosSplit),
      params,
    };

    try {
      const postRes = await fetch('/api/v1/backtests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!postRes.ok) throw new Error(`Backtest failed with status: ${postRes.status}`);
      const postData = await postRes.json();
      const bId = postData.backtest_id;
      setBacktestId(bId);

      // Poll until completed
      setStatusMessage('Executing deterministic zero-lookahead simulation...');
      let isDone = false;
      let attempts = 0;
      while (!isDone && attempts < 40) {
        attempts += 1;
        await new Promise((r) => setTimeout(r, 600));
        const checkRes = await fetch(`/api/v1/backtests/${bId}`);
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          if (checkData.status === 'completed') {
            const raw = checkData.result || checkData;
            const parsed = BacktestResultSchema.safeParse(raw);
            if (!parsed.success) {
              console.warn('Backtest result validation warnings:', parsed.error);
            }
            setResults(raw);
            isDone = true;
            setLoading(false);
            setStatusMessage('');
            loadPastBacktests();
            return;
          } else if (checkData.status === 'failed') {
            throw new Error(checkData.error || 'Backtest run failed');
          }
        }
      }
      throw new Error('Backtest timed out');
    } catch (err) {
      setError(err.message);
      setLoading(false);
      setStatusMessage('');
    }
  };

  const handleSelectPastRun = async (bId) => {
    if (!bId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/backtests/${bId}`);
      if (res.ok) {
        const data = await res.json();
        const raw = data.result || data;
        const parsed = BacktestResultSchema.safeParse(raw);
        if (!parsed.success) {
          console.warn('Past backtest validation warnings:', parsed.error);
        }
        setResults(raw);
        setBacktestId(bId);
        if (raw.symbol) setSymbol(raw.symbol);
        if (raw.strategy) setStrategy(raw.strategy);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Sort trades table
  const sortedTrades = (results?.trades || []).slice().sort((a, b) => {
    let aVal = a[sortField];
    let bVal = b[sortField];
    if (typeof aVal === 'string') {
      return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    return sortAsc ? (aVal - bVal) : (bVal - aVal);
  });

  const handleSort = (field) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', paddingBottom: '40px' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', margin: 0 }}>
              Quantitative Backtester
            </h1>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--accent)',
                backgroundColor: 'var(--amber-bg)',
                border: '1px solid var(--amber-border)',
                padding: '2px 8px',
                borderRadius: 'var(--radius-pill)',
              }}
            >
              Zero-Lookahead Engine
            </span>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '4px', margin: 0 }}>
            Configurable strategy simulation with In/Out of sample evaluation, slippage, commission, and execution verification.
          </p>
        </div>

        {/* Past Runs Selector */}
        {pastRuns.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Past runs:</span>
            <select
              value={backtestId || ''}
              onChange={(e) => handleSelectPastRun(e.target.value)}
              style={{
                backgroundColor: 'var(--surface-raised)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-input)',
                color: 'var(--text)',
                padding: '5px 10px',
                fontSize: '12px',
                outline: 'none',
              }}
            >
              {pastRuns.map((r) => (
                <option key={r.backtest_id} value={r.backtest_id}>
                  {r.symbol} - {r.strategy} ({r.created_at?.slice(11, 16) || 'Run'})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Main Backtester Layout: Left Config Panel + Right Results */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(300px, 340px) minmax(0, 1fr)',
          gap: '24px',
          alignItems: 'start',
          width: '100%',
        }}
      >
        {/* ================= LEFT CONFIG PANEL ================= */}
        <div
          style={{
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-card)',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            position: 'sticky',
            top: '80px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Strategy Configuration
            </span>
            <span style={{ fontSize: '11px', color: 'var(--muted)' }}>v2.4 engine</span>
          </div>

          {/* Instrument & Timeframe */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>Symbol</label>
              <input
                type="text"
                value={symbol}
                onChange={(e) => {
                  setSymbol(e.target.value.toUpperCase());
                  setSelectedSymbol(e.target.value.toUpperCase());
                }}
                style={{
                  width: '100%',
                  backgroundColor: 'var(--surface-raised)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-input)',
                  color: 'var(--text)',
                  padding: '6px 10px',
                  fontSize: '13px',
                  fontWeight: 600,
                  outline: 'none',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>Timeframe</label>
              <select
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value)}
                style={{
                  width: '100%',
                  backgroundColor: 'var(--surface-raised)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-input)',
                  color: 'var(--text)',
                  padding: '6px 10px',
                  fontSize: '13px',
                  outline: 'none',
                }}
              >
                <option value="D">Daily (D)</option>
                <option value="W">Weekly (W)</option>
              </select>
            </div>
          </div>

          {/* Range & Strategy Preset */}
          <div>
            <label style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>Historical Range</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              {['1Y', '3Y', '5Y', 'Max'].map((r) => (
                <button
                  key={r}
                  onClick={() => setRangePreset(r)}
                  style={{
                    flex: 1,
                    padding: '4px',
                    fontSize: '11.5px',
                    borderRadius: 'var(--radius-pill)',
                    border: rangePreset === r ? '1px solid var(--amber-border)' : '1px solid var(--border)',
                    backgroundColor: rangePreset === r ? 'var(--amber-bg)' : 'var(--surface-raised)',
                    color: rangePreset === r ? 'var(--accent)' : 'var(--muted)',
                    cursor: 'pointer',
                    fontWeight: rangePreset === r ? 700 : 500,
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>Strategy Preset</label>
            <select
              value={strategy}
              onChange={(e) => handleStrategyChange(e.target.value)}
              style={{
                width: '100%',
                backgroundColor: 'var(--surface-raised)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-input)',
                color: 'var(--text)',
                padding: '7px 10px',
                fontSize: '12.5px',
                fontWeight: 600,
                outline: 'none',
              }}
            >
              <option value="swing_pullback">Swing Trend-Pullback (Primary)</option>
              <option value="dma_200">200 DMA Trend Follow</option>
              <option value="sma_cross">SMA 50/200 Cross (Golden)</option>
              <option value="rsi_mean_rev">RSI Mean Reversion (14)</option>
              <option value="macd_cross">MACD Cross (12, 26, 9)</option>
              <option value="replay_verdicts">Replay Agent Verdicts (Archived)</option>
            </select>
          </div>

          {/* Editable Parameters based on preset */}
          <div style={{ backgroundColor: 'var(--surface-raised)', padding: '12px', borderRadius: 'var(--radius-input)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Strategy Parameters</span>

            {strategy === 'swing_pullback' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div>
                    <label style={{ fontSize: '10.5px', color: 'var(--muted)', display: 'block' }}>ATR Stop Mult</label>
                    <input
                      type="number"
                      step="0.5"
                      value={params.atr_multiple}
                      onChange={(e) => setParams({ ...params, atr_multiple: parseFloat(e.target.value) })}
                      style={{ width: '100%', padding: '4px 6px', fontSize: '12px', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text)' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '10.5px', color: 'var(--muted)', display: 'block' }}>Target R:R</label>
                    <input
                      type="number"
                      step="0.5"
                      value={params.target_rr}
                      onChange={(e) => setParams({ ...params, target_rr: parseFloat(e.target.value) })}
                      style={{ width: '100%', padding: '4px 6px', fontSize: '12px', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text)' }}
                    />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div>
                    <label style={{ fontSize: '10.5px', color: 'var(--muted)', display: 'block' }}>RSI Trigger</label>
                    <input
                      type="number"
                      value={params.rsi_trigger}
                      onChange={(e) => setParams({ ...params, rsi_trigger: parseInt(e.target.value) })}
                      style={{ width: '100%', padding: '4px 6px', fontSize: '12px', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text)' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '10.5px', color: 'var(--muted)', display: 'block' }}>Max Hold (Days)</label>
                    <input
                      type="number"
                      value={params.max_hold_days}
                      onChange={(e) => setParams({ ...params, max_hold_days: parseInt(e.target.value) })}
                      style={{ width: '100%', padding: '4px 6px', fontSize: '12px', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text)' }}
                    />
                  </div>
                </div>
              </>
            )}

            {strategy === 'sma_cross' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={{ fontSize: '10.5px', color: 'var(--muted)', display: 'block' }}>Fast SMA</label>
                  <input
                    type="number"
                    value={params.fast_sma || 50}
                    onChange={(e) => setParams({ ...params, fast_sma: parseInt(e.target.value) })}
                    style={{ width: '100%', padding: '4px 6px', fontSize: '12px', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text)' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '10.5px', color: 'var(--muted)', display: 'block' }}>Slow SMA</label>
                  <input
                    type="number"
                    value={params.slow_sma || 200}
                    onChange={(e) => setParams({ ...params, slow_sma: parseInt(e.target.value) })}
                    style={{ width: '100%', padding: '4px 6px', fontSize: '12px', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text)' }}
                  />
                </div>
              </div>
            )}

            {strategy === 'rsi_mean_rev' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={{ fontSize: '10.5px', color: 'var(--muted)', display: 'block' }}>Oversold Entry</label>
                  <input
                    type="number"
                    value={params.rsi_oversold || 30}
                    onChange={(e) => setParams({ ...params, rsi_oversold: parseInt(e.target.value) })}
                    style={{ width: '100%', padding: '4px 6px', fontSize: '12px', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text)' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '10.5px', color: 'var(--muted)', display: 'block' }}>Exit Level</label>
                  <input
                    type="number"
                    value={params.rsi_exit || 65}
                    onChange={(e) => setParams({ ...params, rsi_exit: parseInt(e.target.value) })}
                    style={{ width: '100%', padding: '4px 6px', fontSize: '12px', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text)' }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Capital & Position Sizing */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '8px' }}>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>Capital ($)</label>
              <input
                type="number"
                value={capital}
                onChange={(e) => setCapital(Number(e.target.value))}
                style={{ width: '100%', padding: '6px 10px', fontSize: '12.5px', backgroundColor: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 'var(--radius-input)', color: 'var(--text)' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>Position Sizing</label>
              <select
                value={sizingMode}
                onChange={(e) => setSizingMode(e.target.value)}
                style={{ width: '100%', padding: '6px 10px', fontSize: '12px', backgroundColor: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 'var(--radius-input)', color: 'var(--text)' }}
              >
                <option value="fixed_pct">Fixed % (10%)</option>
                <option value="risk_pct">1% Risk (ATR)</option>
              </select>
            </div>
          </div>

          {/* Friction & Slippage */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>Commission ($)</label>
              <input
                type="number"
                step="0.5"
                value={commission}
                onChange={(e) => setCommission(parseFloat(e.target.value))}
                style={{ width: '100%', padding: '6px 10px', fontSize: '12px', backgroundColor: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 'var(--radius-input)', color: 'var(--text)' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>Slippage (bps)</label>
              <input
                type="number"
                step="1"
                value={slippageBps}
                onChange={(e) => setSlippageBps(parseFloat(e.target.value))}
                style={{ width: '100%', padding: '6px 10px', fontSize: '12px', backgroundColor: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 'var(--radius-input)', color: 'var(--text)' }}
              />
            </div>
          </div>

          {/* Out of Sample Split Slider */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>
              <span>In-Sample: {Math.round(oosSplit * 100)}%</span>
              <span>Out-of-Sample: {Math.round((1 - oosSplit) * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="0.85"
              step="0.05"
              value={oosSplit}
              onChange={(e) => setOosSplit(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent)' }}
            />
          </div>

          {/* Primary Run Backtest Button */}
          <button
            onClick={runNewBacktest}
            disabled={loading}
            style={{
              padding: '12px',
              backgroundColor: loading ? 'var(--surface-raised)' : 'var(--accent)',
              border: 'none',
              borderRadius: 'var(--radius-input)',
              color: loading ? 'var(--muted)' : '#000000',
              fontWeight: 700,
              fontSize: '14px',
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              marginTop: '6px',
            }}
          >
            {loading ? (
              <>
                <span className="spinner" style={{ width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.2)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                <span>Simulating...</span>
              </>
            ) : (
              <span>▶ Run Backtest</span>
            )}
          </button>

          {statusMessage && (
            <p style={{ fontSize: '11px', color: 'var(--accent)', textAlign: 'center', margin: 0 }}>
              {statusMessage}
            </p>
          )}

          {error && (
            <div style={{ backgroundColor: 'var(--loss-bg)', border: '1px solid var(--loss-border)', borderRadius: 'var(--radius-input)', padding: '8px 10px', color: 'var(--loss)', fontSize: '11.5px' }}>
              {error}
            </div>
          )}
        </div>

        {/* ================= RIGHT RESULTS PANEL ================= */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', minWidth: 0 }}>
          {/* Pre-run Empty State */}
          {!results && !loading && (
            <div
              style={{
                backgroundColor: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-card)',
                padding: '60px 24px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '14px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '42px' }}>📊</div>
              <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
                Run a backtest to see results
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--muted)', maxWidth: '460px', margin: 0, lineHeight: 1.5 }}>
                Configure strategy parameters, capital sizing, and execution friction on the left, then click <strong>▶ Run Backtest</strong> to simulate zero-lookahead historical performance.
              </p>
              <button
                onClick={runNewBacktest}
                style={{
                  marginTop: '8px',
                  padding: '10px 22px',
                  backgroundColor: 'var(--accent)',
                  color: '#000000',
                  border: 'none',
                  borderRadius: 'var(--radius-input)',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span>▶ Run Backtest for {symbol}</span>
              </button>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div
              style={{
                backgroundColor: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-card)',
                padding: '60px 24px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '16px',
                textAlign: 'center',
              }}
            >
              <div className="spinner" style={{ width: '32px', height: '32px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              <div>
                <h4 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
                  Executing Zero-Lookahead Simulation...
                </h4>
                <p style={{ fontSize: '12.5px', color: 'var(--muted)', marginTop: '4px' }}>
                  {statusMessage || 'Preparing adjusted OHLCV data, partitioning in-sample/out-of-sample splits, and computing metrics...'}
                </p>
              </div>
            </div>
          )}

          {/* Results Views */}
          {results && !loading && (
            <>
              {/* Statistical Warning Banner (< 30 trades) */}
              {results?.low_trades_warning && (
                <div
                  style={{
                    backgroundColor: 'rgba(240, 176, 74, 0.1)',
                    border: '1px solid var(--amber-border)',
                    borderRadius: 'var(--radius-card)',
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    color: 'var(--accent)',
                  }}
                >
                  <span style={{ fontSize: '20px' }}>⚠️</span>
                  <div>
                    <strong style={{ fontSize: '13px', display: 'block' }}>Sample Size Warning: Too Few Trades</strong>
                    <span style={{ fontSize: '12px', color: 'var(--text)' }}>
                      Only {results.total_trades} trades were executed in this period. Results should be treated with caution; at least 30 trades are recommended for statistical significance.
                    </span>
                  </div>
                </div>
              )}

              {/* Metric Comparison Table: In-Sample vs Out-of-Sample vs Benchmark */}
              <div
                style={{
                  backgroundColor: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-card)',
                  padding: '20px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <div>
                    <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                      Performance Comparison Matrix
                    </h3>
                    <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                      Partitioned verification: {Math.round(oosSplit * 100)}% In-Sample training vs {Math.round((1 - oosSplit) * 100)}% Out-of-Sample validation
                    </span>
                  </div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontSize: '11px', textTransform: 'uppercase' }}>
                        <th style={{ padding: '8px 12px' }}>Metric</th>
                        <th style={{ padding: '8px 12px', color: 'var(--accent)' }}>In-Sample ({Math.round(oosSplit * 100)}%)</th>
                        <th style={{ padding: '8px 12px', color: '#10b981' }}>Out-of-Sample ({Math.round((1 - oosSplit) * 100)}%)</th>
                        <th style={{ padding: '8px 12px' }}>Benchmark (Hold)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const isStats = results?.is_stats || results?.metrics?.in_sample || results?.result?.is_stats || results?.result?.metrics?.in_sample;
                        const oosStats = results?.oos_stats || results?.metrics?.out_of_sample || results?.result?.oos_stats || results?.result?.metrics?.out_of_sample;
                        const benchStats = results?.bench_stats || results?.metrics?.benchmark || results?.result?.bench_stats || results?.result?.metrics?.benchmark;

                        return [
                          { label: 'Total Return', key: 'total_return_pct', format: fmtPct, isPnl: true },
                          { label: 'CAGR', key: 'cagr_pct', format: fmtPct, isPnl: true },
                          { label: 'Max Drawdown', key: 'max_drawdown_pct', format: fmtLoss, isLoss: true },
                          { label: 'Sharpe Ratio', key: 'sharpe', format: fmtRatio },
                          { label: 'Sortino Ratio', key: 'sortino', format: fmtRatio },
                          { label: 'Win Rate', key: 'win_rate', format: fmtPct },
                          { label: 'Profit Factor', key: 'profit_factor', format: fmtRatio },
                          {
                            label: 'Avg Win / Avg Loss',
                            key: 'avg_win_pct',
                            format: (v, r) => (v != null && r?.avg_loss_pct != null ? `${Number(v).toFixed(1)}% / -${Math.abs(Number(r.avg_loss_pct)).toFixed(1)}%` : '—'),
                          },
                          { label: 'Expectancy / Trade', key: 'expectancy_pct', format: fmtPct },
                          { label: 'Avg Holding Days', key: 'avg_holding_days', format: fmtDays },
                          { label: 'Exposure %', key: 'exposure_pct', format: fmtPct },
                          { label: 'Total Trades', key: 'trades', format: fmtCount },
                        ].map((row, idx) => {
                          const isVal = isStats?.[row.key];
                          const oosVal = oosStats?.[row.key];
                          const benchVal = benchStats?.[row.key];

                          return (
                            <tr
                              key={row.key}
                              style={{
                                borderBottom: '1px solid var(--border)',
                                backgroundColor: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                              }}
                            >
                              <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text)' }}>{row.label}</td>
                              <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontWeight: 600, color: row.isPnl ? (Number(isVal) >= 0 ? 'var(--gain)' : 'var(--loss)') : 'var(--text)' }}>
                                {row.format(isVal, isStats)}
                              </td>
                              <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontWeight: 600, color: row.isPnl ? (Number(oosVal) >= 0 ? 'var(--gain)' : 'var(--loss)') : 'var(--text)' }}>
                                {row.format(oosVal, oosStats)}
                              </td>
                              <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: 'var(--muted)' }}>
                                {row.format(benchVal, benchStats)}
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>

          {/* Equity Curve & Drawdown Chart */}
          <div
            style={{
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-card)',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                  Equity Growth & Drawdown
                </h3>
                <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                  Cumulative capital ($) vs Benchmark buy & hold, with out-of-sample partition boundary
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '12px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '12px', height: '3px', backgroundColor: 'var(--accent)' }} />
                  <span>Strategy</span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '12px', height: '3px', backgroundColor: 'var(--muted)' }} />
                  <span>Benchmark</span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '12px', height: '3px', backgroundColor: 'var(--loss)' }} />
                  <span>Drawdown %</span>
                </span>
              </div>
            </div>

            {/* Custom SVG Equity Curve */}
            {results?.equity_curve && results.equity_curve.length > 0 ? (
              <div style={{ width: '100%', height: '240px', position: 'relative' }}>
                <svg viewBox="0 0 1000 240" style={{ width: '100%', height: '100%', overflow: 'visible' }} preserveAspectRatio="none">
                  {/* Grid Lines */}
                  <line x1="0" y1="40" x2="1000" y2="40" stroke="var(--border)" strokeDasharray="3 3" />
                  <line x1="0" y1="120" x2="1000" y2="120" stroke="var(--border)" strokeDasharray="3 3" />
                  <line x1="0" y1="200" x2="1000" y2="200" stroke="var(--border)" strokeDasharray="3 3" />

                  {/* Benchmark Line */}
                  {(() => {
                    const eq = results.equity_curve;
                    const maxEq = Math.max(...eq.map((e) => Math.max(e.strategy, e.benchmark)));
                    const minEq = Math.min(...eq.map((e) => Math.min(e.strategy, e.benchmark)));
                    const span = maxEq - minEq || 1;

                    const getY = (val) => 220 - ((val - minEq) / span) * 200;
                    const getX = (idx) => (idx / (eq.length - 1)) * 1000;

                    const bPath = eq.map((e, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(e.benchmark)}`).join(' ');
                    const sPath = eq.map((e, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(e.strategy)}`).join(' ');

                    const splitIdx = eq.findIndex((e) => e.is_out_of_sample);
                    const splitX = splitIdx !== -1 ? getX(splitIdx) : null;

                    return (
                      <>
                        {/* Benchmark Path */}
                        <path d={bPath} fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.6" />

                        {/* Strategy Path */}
                        <path d={sPath} fill="none" stroke="var(--accent)" strokeWidth="2.5" />

                        {/* OOS Split Vertical Line */}
                        {splitX && (
                          <g>
                            <line x1={splitX} y1="10" x2={splitX} y2="230" stroke="#10b981" strokeWidth="1.5" strokeDasharray="4 4" />
                            <text x={splitX + 6} y="25" fill="#10b981" fontSize="11" fontWeight="700">
                              OOS Boundary (30%)
                            </text>
                          </g>
                        )}
                      </>
                    );
                  })()}
                </svg>
              </div>
            ) : (
              <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
                No equity curve data available
              </div>
            )}

            {/* Drawdown Curve Underneath */}
            {results?.drawdown_series && results.drawdown_series.length > 0 && (
              <div style={{ width: '100%', height: '80px', borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
                <span style={{ fontSize: '11px', color: 'var(--loss)', fontWeight: 600 }}>Underwater Drawdown Profile</span>
                <svg viewBox="0 0 1000 80" style={{ width: '100%', height: '100%', overflow: 'visible' }} preserveAspectRatio="none">
                  {(() => {
                    const dd = results.drawdown_series;
                    const minDd = Math.min(...dd.map((d) => d.drawdown_pct), -1);
                    const getY = (val) => 10 + (Math.abs(val) / Math.abs(minDd)) * 60;
                    const getX = (idx) => (idx / (dd.length - 1)) * 1000;

                    const ddPath = dd.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d.drawdown_pct)}`).join(' ');
                    const ddArea = `${ddPath} L 1000 10 L 0 10 Z`;

                    return (
                      <>
                        <path d={ddArea} fill="rgba(255, 122, 99, 0.15)" />
                        <path d={ddPath} fill="none" stroke="var(--loss)" strokeWidth="1.5" />
                      </>
                    );
                  })()}
                </svg>
              </div>
            )}
          </div>

          {/* Monthly Returns Heatmap */}
          {results?.monthly_returns && Object.keys(results.monthly_returns).length > 0 && (
            <div
              style={{
                backgroundColor: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-card)',
                padding: '20px',
              }}
            >
              <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 12px 0', color: 'var(--text)' }}>
                Monthly Returns Heatmap (%)
              </h3>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px', textAlign: 'center' }}>
                  <thead>
                    <tr style={{ color: 'var(--muted)' }}>
                      <th style={{ padding: '6px', textAlign: 'left' }}>Year</th>
                      {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m) => (
                        <th key={m} style={{ padding: '6px' }}>{m}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(results.monthly_returns)
                      .sort((a, b) => b[0].localeCompare(a[0]))
                      .map(([year, months]) => (
                        <tr key={year} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '6px 8px', fontWeight: 700, textAlign: 'left', color: 'var(--text)' }}>{year}</td>
                          {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m) => {
                            const val = months[m];
                            const hasVal = val !== undefined && val !== null;
                            const isPos = val > 0;
                            const bg = hasVal
                              ? isPos
                                ? `rgba(61, 219, 167, ${Math.min(Math.abs(val) / 10, 0.7)})`
                                : `rgba(255, 122, 99, ${Math.min(Math.abs(val) / 10, 0.7)})`
                              : 'transparent';

                            return (
                              <td
                                key={m}
                                style={{
                                  padding: '6px 4px',
                                  backgroundColor: bg,
                                  color: hasVal ? (isPos ? 'var(--gain)' : 'var(--loss)') : 'var(--muted)',
                                  fontWeight: hasVal ? 600 : 400,
                                }}
                              >
                                {hasVal ? `${isPos ? '+' : ''}${val.toFixed(1)}%` : '—'}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Trade Table (Sortable & Click to jump to /charts) */}
          <div
            style={{
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-card)',
              padding: '20px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                  Executed Trades Log ({results?.trades?.length || 0})
                </h3>
                <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                  Click any row to jump to the interactive chart with that trade
                </span>
              </div>
            </div>

            <div style={{ overflowX: 'auto', maxHeight: '420px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--surface)', zIndex: 2 }}>
                  <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontSize: '11px', textTransform: 'uppercase' }}>
                    <th onClick={() => handleSort('t_open')} style={{ padding: '8px', cursor: 'pointer' }}>Entry Date ↕</th>
                    <th onClick={() => handleSort('entry')} style={{ padding: '8px', cursor: 'pointer' }}>Entry ($) ↕</th>
                    <th onClick={() => handleSort('t_close')} style={{ padding: '8px', cursor: 'pointer' }}>Exit Date ↕</th>
                    <th onClick={() => handleSort('exit')} style={{ padding: '8px', cursor: 'pointer' }}>Exit ($) ↕</th>
                    <th onClick={() => handleSort('pnl_pct')} style={{ padding: '8px', cursor: 'pointer' }}>P&L % ↕</th>
                    <th onClick={() => handleSort('r_multiple')} style={{ padding: '8px', cursor: 'pointer' }}>R Mult ↕</th>
                    <th onClick={() => handleSort('holding_days')} style={{ padding: '8px', cursor: 'pointer' }}>Hold (d) ↕</th>
                    <th style={{ padding: '8px' }}>Exit Reason</th>
                    <th style={{ padding: '8px' }}>Partition</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTrades.map((t, idx) => {
                    const isWin = t.pnl_pct >= 0;
                    return (
                      <tr
                        key={idx}
                        onClick={() => router.push(`/charts?tf=D&range=1Y`)}
                        style={{
                          borderBottom: '1px solid var(--border)',
                          cursor: 'pointer',
                          backgroundColor: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                        }}
                      >
                        <td style={{ padding: '8px', fontFamily: 'monospace' }}>{t.t_open}</td>
                        <td style={{ padding: '8px', fontFamily: 'monospace' }}>${t.entry?.toFixed(2)}</td>
                        <td style={{ padding: '8px', fontFamily: 'monospace' }}>{t.t_close}</td>
                        <td style={{ padding: '8px', fontFamily: 'monospace' }}>${t.exit?.toFixed(2)}</td>
                        <td style={{ padding: '8px', fontFamily: 'monospace', fontWeight: 700, color: isWin ? 'var(--gain)' : 'var(--loss)' }}>
                          {isWin ? '+' : ''}{t.pnl_pct?.toFixed(2)}%
                        </td>
                        <td style={{ padding: '8px', fontFamily: 'monospace' }}>{t.r_multiple > 0 ? '+' : ''}{t.r_multiple}R</td>
                        <td style={{ padding: '8px' }}>{t.holding_days}d</td>
                        <td style={{ padding: '8px', color: 'var(--muted)', fontSize: '11px', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {t.reason}
                        </td>
                        <td style={{ padding: '8px' }}>
                          <span
                            style={{
                              fontSize: '10px',
                              padding: '2px 6px',
                              borderRadius: 'var(--radius-pill)',
                              backgroundColor: t.is_out_of_sample ? 'rgba(16, 185, 129, 0.15)' : 'rgba(240, 176, 74, 0.15)',
                              color: t.is_out_of_sample ? '#10b981' : 'var(--accent)',
                              fontWeight: 600,
                            }}
                          >
                            {t.is_out_of_sample ? 'OOS' : 'IS'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Parameter Sweep 2D Heatmap & Overfitting Banner */}
          {results?.param_sweep && (
            <div
              style={{
                backgroundColor: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-card)',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                  Parameter Sensitivity Sweep (Sharpe Grid)
                </h3>
                <span style={{ fontSize: '11px', color: 'var(--muted)' }}>ATR Stop Multiple vs Max Hold Days</span>
              </div>

              {/* Overfitting Banner */}
              <div
                style={{
                  backgroundColor: 'rgba(255, 122, 99, 0.1)',
                  border: '1px solid var(--loss-border)',
                  borderRadius: 'var(--radius-input)',
                  padding: '8px 12px',
                  color: 'var(--loss)',
                  fontSize: '12px',
                }}
              >
                <strong>⚠️ Overfitting Warning:</strong> Grid optimization over historical data carries a high risk of curve-fitting. Choose parameters that demonstrate robust performance across neighbouring grid zones.
              </div>

              {/* Grid Table */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px', textAlign: 'center' }}>
                  <thead>
                    <tr style={{ color: 'var(--muted)' }}>
                      <th style={{ padding: '6px', textAlign: 'left' }}>ATR Multiple \ Hold</th>
                      {(results.param_sweep.max_hold_options || results.param_sweep.y_values || [10, 15, 20, 25]).map((h) => (
                        <th key={h} style={{ padding: '6px' }}>{h} Days</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {results.param_sweep.grid?.map((row, rIdx) => {
                      const values = Array.isArray(row)
                        ? row
                        : Array.isArray(row?.values)
                        ? row.values
                        : [];
                      const atrLabel = row?.atr_mult != null
                        ? `${row.atr_mult}x ATR`
                        : results.param_sweep.x_values?.[rIdx] != null
                        ? `${results.param_sweep.x_values[rIdx]}x ATR`
                        : results.param_sweep.atr_options?.[rIdx] != null
                        ? `${results.param_sweep.atr_options[rIdx]}x ATR`
                        : `Row ${rIdx + 1}`;

                      return (
                        <tr key={rIdx} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '6px 8px', fontWeight: 700, textAlign: 'left', color: 'var(--text)' }}>
                            {atrLabel}
                          </td>
                          {values.map((val, cIdx) => {
                            const num = Number(val);
                            const isHigh = !isNaN(num) && num >= 1.0;
                            return (
                              <td
                                key={cIdx}
                                style={{
                                  padding: '6px',
                                  backgroundColor: isHigh ? 'rgba(61, 219, 167, 0.2)' : 'rgba(255, 255, 255, 0.02)',
                                  color: isHigh ? 'var(--gain)' : 'var(--text)',
                                  fontWeight: isHigh ? 700 : 400,
                                }}
                              >
                                {!isNaN(num) ? num.toFixed(2) : '—'}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* "How This Was Tested" Panel */}
          <div
            style={{
              backgroundColor: 'var(--surface-raised)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-card)',
              padding: '16px 20px',
            }}
          >
            <h4 style={{ fontSize: '13px', fontWeight: 700, margin: '0 0 8px 0', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              How This Strategy Was Tested
            </h4>
            <p style={{ fontSize: '12.5px', color: 'var(--text)', lineHeight: 1.6, margin: 0 }}>
              {results?.assumptions_summary || (
                `Deterministic zero-lookahead backtest on ${symbol} split & dividend-adjusted daily data. ` +
                `Signals evaluated on bar close; orders filled at the next bar's Open price plus ${slippageBps} bps slippage ` +
                `and $${commission} commission per trade. Higher-timeframe weekly/monthly filters computed exclusively from ` +
                `completed prior bars. 200-bar warm-up buffer strictly enforced before the initial execution.`
              )}
            </p>
          </div>
          </>
          )}

          {/* Persistent Footer Disclaimer */}
          <div
            style={{
              textAlign: 'center',
              padding: '12px',
              borderTop: '1px solid var(--border)',
              color: 'var(--muted)',
              fontSize: '11.5px',
              fontStyle: 'italic',
            }}
          >
            Backtests are historical simulations, not predictions. Past performance does not guarantee future results.
          </div>
        </div>
      </div>
    </div>
  );
}
