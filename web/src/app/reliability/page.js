'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useApp } from '../../context/AppContext';
import RatingPill from '../../components/RatingPill';

function ReliabilityContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedSymbol, setSelectedSymbol } = useApp();

  // Mode: 'live' | 'replay'
  const [mode, setMode] = useState(searchParams.get('mode') || 'live');
  const [symbolFilter, setSymbolFilter] = useState(searchParams.get('symbol') || '');
  const [ratingFilter, setRatingFilter] = useState('ALL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Data states
  const [summary, setSummary] = useState(null);
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Stability Check Modal state
  const [showStabilityModal, setShowStabilityModal] = useState(false);
  const [stabilitySymbol, setStabilitySymbol] = useState(selectedSymbol || 'NVDA');
  const [stabilityDate, setStabilityDate] = useState(new Date().toISOString().slice(0, 10));
  const [stabilityRuns, setStabilityRuns] = useState(3);
  const [stabilityLoading, setStabilityLoading] = useState(false);
  const [stabilityResult, setStabilityResult] = useState(null);

  // Replay Backfill Modal state
  const [showReplayModal, setShowReplayModal] = useState(false);
  const [replaySymbol, setReplaySymbol] = useState(selectedSymbol || 'NVDA');
  const [replayFrom, setReplayFrom] = useState('2024-01-01');
  const [replayTo, setReplayTo] = useState('2024-06-01');
  const [selectedAnalysts, setSelectedAnalysts] = useState(['market']); // Technical/Price PIT by default
  const [replaySpendCap, setReplaySpendCap] = useState(5.0);
  const [replayEstimate, setReplayEstimate] = useState(null);
  const [estimatingReplay, setEstimatingReplay] = useState(false);
  const [startingReplay, setStartingReplay] = useState(false);
  const [activeReplayId, setActiveReplayId] = useState(null);
  const [replayEvents, setReplayEvents] = useState([]);
  const [replayError, setReplayError] = useState(null);

  // Fetch summary & signals
  const fetchReliabilityData = async () => {
    setLoading(true);
    setError(null);
    try {
      const queryParams = new URLSearchParams({
        mode,
        ...(symbolFilter ? { symbol: symbolFilter } : {}),
        ...(fromDate ? { from_date: fromDate } : {}),
        ...(toDate ? { to_date: toDate } : {}),
      });

      const [sumRes, sigRes] = await Promise.all([
        fetch(`/api/v1/reliability/summary?${queryParams.toString()}`),
        fetch(`/api/v1/signals?${queryParams.toString()}&limit=100`),
      ]);

      if (!sumRes.ok) throw new Error('Failed to load reliability summary');
      if (!sigRes.ok) throw new Error('Failed to load signals ledger');

      const sumData = await sumRes.json();
      const sigData = await sigRes.json();

      setSummary(sumData);
      setSignals(sigData.signals || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReliabilityData();
  }, [mode, symbolFilter, fromDate, toDate]);

  // Sync symbol filter with URL when query param present
  useEffect(() => {
    const s = searchParams.get('symbol');
    if (s && s !== symbolFilter) {
      setSymbolFilter(s.toUpperCase());
    }
  }, [searchParams]);

  // Filtered signals for ledger table
  const filteredSignals = useMemo(() => {
    return signals.filter((s) => {
      if (ratingFilter !== 'ALL' && s.rating !== ratingFilter) return false;
      return true;
    });
  }, [signals, ratingFilter]);

  // Run stability check trigger
  const handleRunStabilityCheck = async () => {
    setStabilityLoading(true);
    setStabilityResult(null);
    try {
      const res = await fetch('/api/v1/reliability/stability-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: stabilitySymbol,
          as_of_date: stabilityDate,
          num_runs: stabilityRuns,
        }),
      });
      if (!res.ok) throw new Error('Failed to execute stability check');
      const data = await res.json();
      setStabilityResult(data);
      fetchReliabilityData();
    } catch (err) {
      alert(err.message);
    } finally {
      setStabilityLoading(false);
    }
  };

  // Replay estimate
  const handleEstimateReplay = async () => {
    setEstimatingReplay(true);
    setReplayError(null);
    try {
      const res = await fetch('/api/v1/replay/estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: replaySymbol,
          start_date: replayFrom,
          end_date: replayTo,
          from_date: replayFrom,
          to_date: replayTo,
          analysts: selectedAnalysts,
        }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || 'Failed to estimate replay cost');
      }
      const data = await res.json();
      setReplayEstimate(data);
    } catch (err) {
      setReplayError(err.message || 'Failed to estimate replay cost');
    } finally {
      setEstimatingReplay(false);
    }
  };

  // Re-estimate when inputs change while modal is open
  useEffect(() => {
    if (!showReplayModal) return;
    const timer = setTimeout(() => {
      handleEstimateReplay();
    }, 200);
    return () => clearTimeout(timer);
  }, [showReplayModal, replaySymbol, replayFrom, replayTo, selectedAnalysts]);

  // Start replay
  const handleStartReplay = async () => {
    if (replayEstimate && replayEstimate.estimated_cost_usd > replaySpendCap) {
      setReplayError(`Estimated cost ($${replayEstimate.estimated_cost_usd}) exceeds your spend cap of $${replaySpendCap}. Please reduce date range or increase spend cap.`);
      return;
    }

    setStartingReplay(true);
    setReplayError(null);
    setReplayEvents([]);
    try {
      const res = await fetch('/api/v1/replay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: replaySymbol,
          start_date: replayFrom,
          end_date: replayTo,
          from_date: replayFrom,
          to_date: replayTo,
          analysts: selectedAnalysts,
          spend_cap: replaySpendCap,
          spend_cap_usd: replaySpendCap,
        }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || 'Replay launch failed');
      }
      const data = await res.json();
      setActiveReplayId(data.replay_id);

      // Listen to SSE events
      const evtSource = new EventSource(`/api/v1/replay/${data.replay_id}/events`);
      evtSource.onmessage = (e) => {
        try {
          const parsed = JSON.parse(e.data);
          setReplayEvents((prev) => [...prev, parsed]);
          if (parsed.status === 'completed' || parsed.status === 'failed') {
            evtSource.close();
            setStartingReplay(false);
            fetchReliabilityData();
          }
        } catch (_) {}
      };
      evtSource.onerror = () => {
        evtSource.close();
        setStartingReplay(false);
      };
    } catch (err) {
      setReplayError(err.message || 'Replay launch failed');
      setStartingReplay(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px', width: '100%', paddingBottom: '60px' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', margin: 0 }}>
              Signal Reliability
            </h1>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: mode === 'live' ? 'var(--gain)' : 'var(--accent)',
                backgroundColor: mode === 'live' ? 'var(--gain-bg)' : 'var(--amber-bg)',
                border: mode === 'live' ? '1px solid var(--gain-border)' : '1px solid var(--amber-border)',
                padding: '2px 8px',
                borderRadius: 'var(--radius-pill)',
              }}
            >
              {mode === 'live' ? 'Live Forward Tested' : 'Historical Replay Mode'}
            </span>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '4px', margin: 0 }}>
            Audit multi-agent signal accuracy, evaluate statistical edge vs. buy-and-hold & random baselines, and test rerun stability.
          </p>
        </div>

        {/* Top Actions: Mode Switcher & Check Runners */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Live vs Replay Switcher */}
          <div
            style={{
              display: 'flex',
              backgroundColor: 'var(--surface-raised)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-input)',
              padding: '2px',
            }}
          >
            <button
              onClick={() => setMode('live')}
              style={{
                padding: '5px 12px',
                fontSize: '12px',
                fontWeight: 600,
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                backgroundColor: mode === 'live' ? 'var(--surface)' : 'transparent',
                color: mode === 'live' ? 'var(--text)' : 'var(--muted)',
                boxShadow: mode === 'live' ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
              }}
            >
              Live Evidence
            </button>
            <button
              onClick={() => setMode('replay')}
              style={{
                padding: '5px 12px',
                fontSize: '12px',
                fontWeight: 600,
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                backgroundColor: mode === 'replay' ? 'var(--surface)' : 'transparent',
                color: mode === 'replay' ? 'var(--accent)' : 'var(--muted)',
                boxShadow: mode === 'replay' ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
              }}
            >
              Replay Backfill
            </button>
          </div>

          <button
            onClick={() => setShowStabilityModal(true)}
            style={{
              padding: '6px 13px',
              backgroundColor: 'var(--surface-raised)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-input)',
              color: 'var(--text)',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>⟳ Run Stability Check</span>
          </button>

          <button
            onClick={() => {
              setShowReplayModal(true);
              handleEstimateReplay();
            }}
            style={{
              padding: '6px 13px',
              backgroundColor: 'var(--amber-bg)',
              border: '1px solid var(--amber-border)',
              borderRadius: 'var(--radius-input)',
              color: 'var(--accent)',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>⚡ Launch Replay</span>
          </button>
        </div>
      </div>

      {/* Replay Guardrail Banner if in replay mode */}
      {mode === 'replay' && (
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: 'rgba(234, 179, 8, 0.1)',
            border: '1px solid rgba(234, 179, 8, 0.3)',
            borderRadius: 'var(--radius-card)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '16px' }}>⚠️</span>
            <div>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent)' }}>
                Replay: optimistic bias possible
              </span>
              <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '2px 0 0 0' }}>
                Replay backfills simulate historical runs using point-in-time constraints. LLM cutoff awareness and data vendor revisions may introduce lookahead bias.
              </p>
            </div>
          </div>
          <button
            onClick={() => setMode('live')}
            style={{
              padding: '4px 10px',
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-input)',
              color: 'var(--text)',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Switch to Live Only
          </button>
        </div>
      )}

      {/* Filters Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap',
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-card)',
          padding: '10px 14px',
        }}
      >
        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted)' }}>Filters:</span>

        {/* Symbol input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <input
            type="text"
            placeholder="All Symbols (e.g. NVDA)"
            value={symbolFilter}
            onChange={(e) => setSymbolFilter(e.target.value.toUpperCase())}
            style={{
              padding: '5px 10px',
              backgroundColor: 'var(--surface-raised)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-input)',
              color: 'var(--text)',
              fontSize: '12px',
              width: '130px',
            }}
          />
          {symbolFilter && (
            <button
              onClick={() => setSymbolFilter('')}
              style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '12px' }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Rating filter */}
        <select
          value={ratingFilter}
          onChange={(e) => setRatingFilter(e.target.value)}
          style={{
            padding: '5px 10px',
            backgroundColor: 'var(--surface-raised)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-input)',
            color: 'var(--text)',
            fontSize: '12px',
          }}
        >
          <option value="ALL">All Ratings</option>
          <option value="Buy">Buy</option>
          <option value="Overweight">Overweight</option>
          <option value="Hold">Hold</option>
          <option value="Underweight">Underweight</option>
          <option value="Sell">Sell</option>
        </select>

        {/* Date range */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            style={{
              padding: '4px 8px',
              backgroundColor: 'var(--surface-raised)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-input)',
              color: 'var(--text)',
              fontSize: '11.5px',
            }}
          />
          <span style={{ color: 'var(--muted)', fontSize: '11px' }}>to</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            style={{
              padding: '4px 8px',
              backgroundColor: 'var(--surface-raised)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-input)',
              color: 'var(--text)',
              fontSize: '11.5px',
            }}
          />
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
            Showing <strong>{filteredSignals.length}</strong> signals
          </span>
          <button
            onClick={fetchReliabilityData}
            title="Refresh Ledger and Metrics"
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-input)',
              color: 'var(--muted)',
              padding: '4px 8px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            ↻
          </button>
        </div>
      </div>

      {/* ================= 1. FIVE-CHECK SCORECARD ================= */}
      <div
        style={{
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-card)',
          padding: '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h2 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
              Statistical Reliability Scorecard
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '2px 0 0 0' }}>
              Rigorous 5-point verification framework ensuring actionable edge before real capital allocation.
            </p>
          </div>

          {/* Overall line stating passed checks */}
          <div
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--radius-pill)',
              backgroundColor:
                summary?.hide_colors
                  ? 'var(--surface-raised)'
                  : summary?.passed_checks >= 4
                  ? 'var(--gain-bg)'
                  : summary?.passed_checks >= 2
                  ? 'var(--amber-bg)'
                  : 'var(--loss-bg)',
              border:
                summary?.hide_colors
                  ? '1px solid var(--border)'
                  : summary?.passed_checks >= 4
                  ? '1px solid var(--gain-border)'
                  : summary?.passed_checks >= 2
                  ? '1px solid var(--amber-border)'
                  : '1px solid var(--loss-border)',
              color:
                summary?.hide_colors
                  ? 'var(--muted)'
                  : summary?.passed_checks >= 4
                  ? 'var(--gain)'
                  : summary?.passed_checks >= 2
                  ? 'var(--accent)'
                  : 'var(--loss)',
              fontSize: '13px',
              fontWeight: 700,
            }}
          >
            {summary?.overall_verdict || 'Evaluating statistical checks...'}
          </div>
        </div>

        {/* 5 Check Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '12px',
          }}
        >
          {summary?.checks?.map((chk) => {
            const isSuppressed = summary?.hide_colors || chk.hide_color;
            const bg = isSuppressed
              ? 'var(--surface-raised)'
              : chk.status === 'pass'
              ? 'var(--gain-bg)'
              : chk.status === 'fail'
              ? 'var(--loss-bg)'
              : 'var(--amber-bg)';
            const border = isSuppressed
              ? 'var(--border)'
              : chk.status === 'pass'
              ? 'var(--gain-border)'
              : chk.status === 'fail'
              ? 'var(--loss-border)'
              : 'var(--amber-border)';
            const color = isSuppressed
              ? 'var(--muted)'
              : chk.status === 'pass'
              ? 'var(--gain)'
              : chk.status === 'fail'
              ? 'var(--loss)'
              : 'var(--accent)';

            return (
              <div
                key={chk.id}
                style={{
                  backgroundColor: 'var(--surface-raised)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-card)',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                    {chk.title}
                  </span>
                  <span
                    style={{
                      fontSize: '10.5px',
                      fontWeight: 700,
                      padding: '2px 7px',
                      borderRadius: 'var(--radius-pill)',
                      backgroundColor: bg,
                      border: `1px solid ${border}`,
                      color: color,
                    }}
                  >
                    {chk.badge}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text)', lineHeight: '1.4' }}>
                  {chk.detail}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ================= 2. RATING BUCKETS & AGREEMENT MATRIX ================= */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.4fr) minmax(320px, 1fr)',
          gap: '20px',
        }}
      >
        {/* Rating Buckets Table */}
        <div
          style={{
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-card)',
            padding: '18px',
            overflowX: 'auto',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>
              Rating Buckets Performance
            </span>
            <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
              Check ordering: Buy &gt; Overweight &gt; Hold &gt; Underweight &gt; Sell
            </span>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
            <thead>
              <tr style={{ color: 'var(--muted)', borderBottom: '1px solid var(--border)', fontSize: '11px', textTransform: 'uppercase' }}>
                <th style={{ padding: '8px' }}>Rating</th>
                <th style={{ padding: '8px' }}>Count</th>
                <th style={{ padding: '8px' }}>Avg Return (10d)</th>
                <th style={{ padding: '8px' }}>Hit Rate (95% CI)</th>
                <th style={{ padding: '8px' }}>Expectancy</th>
                <th style={{ padding: '8px' }}>Profit Factor</th>
              </tr>
            </thead>
            <tbody>
              {summary?.rating_buckets && summary.rating_buckets.length > 0 ? (
                summary.rating_buckets.map((b) => (
                  <tr key={b.rating} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px' }}>
                      <RatingPill rating={b.rating} />
                    </td>
                    <td style={{ padding: '8px', fontFamily: 'monospace' }}>{b.count}</td>
                    <td
                      style={{
                        padding: '8px',
                        fontFamily: 'monospace',
                        fontWeight: 700,
                        color: b.avg_return_10d > 0 ? 'var(--gain)' : b.avg_return_10d < 0 ? 'var(--loss)' : 'var(--muted)',
                      }}
                    >
                      {b.avg_return_10d !== 0 ? `${b.avg_return_10d > 0 ? '+' : ''}${b.avg_return_10d.toFixed(2)}%` : '—'}
                    </td>
                    <td style={{ padding: '8px', fontFamily: 'monospace' }}>
                      {b.hit_rate > 0 ? `${b.hit_rate}% (±${b.ci_margin}%)` : '—'}
                    </td>
                    <td style={{ padding: '8px', fontFamily: 'monospace' }}>
                      {b.expectancy !== 0 ? `${b.expectancy > 0 ? '+' : ''}${b.expectancy.toFixed(2)}%` : '—'}
                    </td>
                    <td style={{ padding: '8px', fontFamily: 'monospace' }}>
                      {b.profit_factor > 0 ? b.profit_factor.toFixed(2) : '—'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)' }}>
                    No settled forward outcomes yet. Run research or replay backfill to populate buckets.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Agreement Matrix */}
        <div
          style={{
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-card)',
            padding: '18px',
          }}
        >
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: '6px' }}>
            Agreement Matrix: Agent vs. Rule-Based Signals
          </span>
          <p style={{ fontSize: '11px', color: 'var(--muted)', margin: '0 0 14px 0' }}>
            Measures synergy and independence between agent LLM verdict and rule-based chart swing signals.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {summary?.agreement_matrix && summary.agreement_matrix.length > 0 ? (
              summary.agreement_matrix.map((cell) => (
                <div
                  key={cell.category}
                  style={{
                    backgroundColor: 'var(--surface-raised)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-input)',
                    padding: '12px',
                  }}
                >
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent)', display: 'block' }}>
                    {cell.category}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: '6px' }}>
                    <span style={{ fontSize: '16px', fontWeight: 800, color: cell.avg_return > 0 ? 'var(--gain)' : cell.avg_return < 0 ? 'var(--loss)' : 'var(--text)' }}>
                      {cell.avg_return !== 0 ? `${cell.avg_return > 0 ? '+' : ''}${cell.avg_return.toFixed(2)}%` : '—'}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                      {cell.signals_count} signals
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div style={{ gridColumn: '1 / -1', padding: '20px', textAlign: 'center', color: 'var(--muted)', fontSize: '12px' }}>
                Awaiting forward signal pairing data.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ================= 3. EQUITY CURVE COMPARISON ================= */}
      <div
        style={{
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-card)',
          padding: '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h2 style={{ fontSize: '14px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
              Strategy Equity Comparison
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '2px 0 0 0' }}>
              Follow Every Agent Signal vs. Buy-and-Hold (SPY) vs. Rule-Based Swing Strategy on matched dates.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '11.5px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--accent)' }}>
              <span style={{ width: '10px', height: '10px', backgroundColor: 'var(--accent)', borderRadius: '2px' }} />
              Agent Signals
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--gain)' }}>
              <span style={{ width: '10px', height: '10px', backgroundColor: 'var(--gain)', borderRadius: '2px' }} />
              Rule-Based Signals
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--muted)' }}>
              <span style={{ width: '10px', height: '10px', backgroundColor: 'var(--muted)', borderRadius: '2px' }} />
              Buy &amp; Hold Benchmark
            </span>
          </div>
        </div>

        {/* SVG Equity Simulation Curve */}
        <div
          style={{
            height: '180px',
            backgroundColor: 'var(--surface-raised)',
            borderRadius: 'var(--radius-input)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {summary?.equity_curve && summary.equity_curve.length > 1 ? (
            <svg width="100%" height="100%" viewBox="0 0 800 180" preserveAspectRatio="none" style={{ padding: '10px' }}>
              {/* Agent Curve */}
              <polyline
                fill="none"
                stroke="var(--accent)"
                strokeWidth="2.5"
                points={summary.equity_curve.map((p, i) => `${(i / (summary.equity_curve.length - 1)) * 780 + 10},${170 - (p.agent_equity / 15000) * 140}`).join(' ')}
              />
              {/* Rules Curve */}
              <polyline
                fill="none"
                stroke="var(--gain)"
                strokeWidth="2"
                strokeDasharray="4 2"
                points={summary.equity_curve.map((p, i) => `${(i / (summary.equity_curve.length - 1)) * 780 + 10},${170 - (p.rules_equity / 15000) * 140}`).join(' ')}
              />
              {/* Benchmark Curve */}
              <polyline
                fill="none"
                stroke="var(--muted)"
                strokeWidth="1.5"
                strokeDasharray="2 2"
                points={summary.equity_curve.map((p, i) => `${(i / (summary.equity_curve.length - 1)) * 780 + 10},${170 - (p.benchmark_equity / 15000) * 140}`).join(' ')}
              />
            </svg>
          ) : (
            <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '13px' }}>
              Cumulative equity curve requires 2+ settled forward outcomes.
            </div>
          )}
        </div>
      </div>

      {/* ================= 4. APPEND-ONLY SIGNAL LEDGER TABLE ================= */}
      <div
        style={{
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-card)',
          padding: '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h2 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
              Signal Ledger (Append-Only)
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '2px 0 0 0' }}>
              Immutable audit log of all live and replayed research decisions, structured outputs, and settled forward returns.
            </p>
          </div>

          <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
            No updates or deletes permitted. Verified by DB triggers.
          </span>
        </div>

        {filteredSignals.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: '13px' }}>
            No signals in ledger matching criteria. Run a research run from Setup to record live signals.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
              <thead>
                <tr style={{ color: 'var(--muted)', borderBottom: '1px solid var(--border)', fontSize: '11px', textTransform: 'uppercase' }}>
                  <th style={{ padding: '8px' }}>Signal ID</th>
                  <th style={{ padding: '8px' }}>Symbol</th>
                  <th style={{ padding: '8px' }}>As Of Date</th>
                  <th style={{ padding: '8px' }}>Rating</th>
                  <th style={{ padding: '8px' }}>Mode</th>
                  <th style={{ padding: '8px' }}>Last Close</th>
                  <th style={{ padding: '8px' }}>Outcome (10d)</th>
                  <th style={{ padding: '8px' }}>Bracket Result</th>
                  <th style={{ padding: '8px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredSignals.map((sig) => {
                  const ret10 = sig.outcome?.forward_return_10d;
                  const isGain = ret10 && ret10 > 0;
                  const isLoss = ret10 && ret10 < 0;
                  const bracket = sig.outcome?.bracket_result;

                  return (
                    <tr key={sig.signal_id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 8px', fontFamily: 'monospace', fontSize: '11px', color: 'var(--accent)' }}>
                        {sig.signal_id.slice(0, 16)}...
                      </td>
                      <td style={{ padding: '10px 8px', fontWeight: 700, color: 'var(--text)' }}>
                        {sig.symbol}
                      </td>
                      <td style={{ padding: '10px 8px', fontFamily: 'monospace' }}>
                        {sig.as_of_date}
                      </td>
                      <td style={{ padding: '10px 8px' }}>
                        <RatingPill rating={sig.rating} />
                      </td>
                      <td style={{ padding: '10px 8px' }}>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: 'var(--radius-pill)',
                            backgroundColor: sig.mode === 'live' ? 'var(--gain-bg)' : 'var(--amber-bg)',
                            color: sig.mode === 'live' ? 'var(--gain)' : 'var(--accent)',
                          }}
                        >
                          {sig.mode}
                        </span>
                      </td>
                      <td style={{ padding: '10px 8px', fontFamily: 'monospace' }}>
                        ${sig.last_close?.toFixed(2) || '—'}
                      </td>
                      <td
                        style={{
                          padding: '10px 8px',
                          fontFamily: 'monospace',
                          fontWeight: 700,
                          color: isGain ? 'var(--gain)' : isLoss ? 'var(--loss)' : 'var(--muted)',
                        }}
                      >
                        {ret10 !== undefined && ret10 !== null
                          ? `${isGain ? '+' : ''}${ret10.toFixed(2)}%`
                          : 'pending'}
                      </td>
                      <td style={{ padding: '10px 8px' }}>
                        {bracket ? (
                          <span
                            style={{
                              fontSize: '10.5px',
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: '4px',
                              backgroundColor: bracket === 'target' ? 'var(--gain-bg)' : 'var(--loss-bg)',
                              color: bracket === 'target' ? 'var(--gain)' : 'var(--loss)',
                            }}
                          >
                            {bracket}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--muted)', fontSize: '11px' }}>pending</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 8px', fontSize: '11px', color: 'var(--muted)' }}>
                        {sig.outcome?.status || 'pending'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ================= MODALS ================= */}

      {/* 1. Stability Check Modal */}
      {showStabilityModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-card)', padding: '24px', width: '420px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
              Run Rerun Stability Check
            </h3>
            <p style={{ fontSize: '12.5px', color: 'var(--muted)', lineHeight: '1.4', margin: 0 }}>
              Re-executes the multi-agent graph 3 to 5 times on the exact same symbol and date to measure verdict reproducibility. Verdict agreement below 70% is flagged as unstable.
            </p>

            <div>
              <label style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>Symbol</label>
              <input
                type="text"
                value={stabilitySymbol}
                onChange={(e) => setStabilitySymbol(e.target.value.toUpperCase())}
                style={{ width: '100%', padding: '8px 10px', fontSize: '13px', backgroundColor: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 'var(--radius-input)', color: 'var(--text)' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>Date</label>
                <input
                  type="date"
                  value={stabilityDate}
                  onChange={(e) => setStabilityDate(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', fontSize: '12px', backgroundColor: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 'var(--radius-input)', color: 'var(--text)' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>Re-runs (3 - 5)</label>
                <input
                  type="number"
                  min="3"
                  max="5"
                  value={stabilityRuns}
                  onChange={(e) => setStabilityRuns(parseInt(e.target.value, 10) || 3)}
                  style={{ width: '100%', padding: '7px 10px', fontSize: '12px', backgroundColor: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 'var(--radius-input)', color: 'var(--text)' }}
                />
              </div>
            </div>

            {stabilityResult && (
              <div style={{ padding: '12px', backgroundColor: 'var(--surface-raised)', borderRadius: 'var(--radius-input)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700 }}>Agreement Rate:</span>
                  <span style={{ fontSize: '14px', fontWeight: 800, color: stabilityResult.is_stable ? 'var(--gain)' : 'var(--loss)' }}>
                    {stabilityResult.agreement_rate}% ({stabilityResult.is_stable ? 'Stable' : 'Unstable'})
                  </span>
                </div>
                <div style={{ fontSize: '11.5px', color: 'var(--muted)', marginTop: '4px' }}>
                  Dominant Verdict: <strong>{stabilityResult.dominant_verdict}</strong> ({stabilityResult.dominant_count}/{stabilityResult.total_runs} runs)
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
              <button
                onClick={() => setShowStabilityModal(false)}
                style={{ padding: '7px 14px', backgroundColor: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius-input)', color: 'var(--muted)', fontSize: '12px', cursor: 'pointer' }}
              >
                Close
              </button>
              <button
                onClick={handleRunStabilityCheck}
                disabled={stabilityLoading}
                style={{
                  padding: '7px 16px',
                  backgroundColor: 'var(--accent)',
                  color: 'var(--accent-contrast)',
                  border: 'none',
                  borderRadius: 'var(--radius-input)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: stabilityLoading ? 'not-allowed' : 'pointer',
                }}
              >
                {stabilityLoading ? 'Running...' : 'Run Stability Check'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Replay Modal with Guard Rails */}
      {showReplayModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-card)', padding: '24px', width: '500px', display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
              Historical Replay Backfill
            </h3>

            {/* Guard rail warning */}
            <div style={{ padding: '10px 12px', backgroundColor: 'rgba(234, 179, 8, 0.12)', border: '1px solid rgba(234, 179, 8, 0.3)', borderRadius: 'var(--radius-input)' }}>
              <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--accent)' }}>
                Replay: optimistic bias possible
              </span>
              <p style={{ fontSize: '11px', color: 'var(--muted)', margin: '3px 0 0 0' }}>
                Memory log is strictly isolated in a temp directory (<code>TRADINGAGENTS_MEMORY_LOG_PATH</code>). Sampling occurs weekly to avoid correlated noise.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>Symbol</label>
                <input
                  type="text"
                  value={replaySymbol}
                  onChange={(e) => setReplaySymbol(e.target.value.toUpperCase())}
                  style={{ width: '100%', padding: '7px 10px', fontSize: '12px', backgroundColor: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 'var(--radius-input)', color: 'var(--text)' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>Spend Cap ($)</label>
                <input
                  type="number"
                  step="0.5"
                  value={replaySpendCap}
                  onChange={(e) => setReplaySpendCap(parseFloat(e.target.value) || 5.0)}
                  style={{ width: '100%', padding: '7px 10px', fontSize: '12px', backgroundColor: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 'var(--radius-input)', color: 'var(--text)' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>From Date</label>
                <input
                  type="date"
                  value={replayFrom}
                  onChange={(e) => setReplayFrom(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', fontSize: '12px', backgroundColor: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 'var(--radius-input)', color: 'var(--text)' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>To Date</label>
                <input
                  type="date"
                  value={replayTo}
                  onChange={(e) => setReplayTo(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', fontSize: '12px', backgroundColor: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 'var(--radius-input)', color: 'var(--text)' }}
                />
              </div>
            </div>

            {/* Point-in-time analyst selection */}
            <div>
              <label style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>
                Point-in-Time Analysts (Exclude non-PIT for cleanest test)
              </label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {[
                  { id: 'market', label: 'Market (PIT: Price & Technicals)', pit: true },
                  { id: 'fundamentals', label: 'Fundamentals (Non-PIT / Restatements)', pit: false },
                  { id: 'news', label: 'News (Non-PIT / Archived)', pit: false },
                ].map((a) => {
                  const checked = selectedAnalysts.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => {
                        setSelectedAnalysts((prev) =>
                          checked ? prev.filter((x) => x !== a.id) : [...prev, a.id]
                        );
                      }}
                      style={{
                        padding: '5px 10px',
                        fontSize: '11.5px',
                        borderRadius: 'var(--radius-pill)',
                        border: checked ? '1px solid var(--accent)' : '1px solid var(--border)',
                        backgroundColor: checked ? 'var(--amber-bg)' : 'var(--surface-raised)',
                        color: checked ? 'var(--accent)' : 'var(--muted)',
                        cursor: 'pointer',
                      }}
                    >
                      {a.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Error banner */}
            {replayError && (
              <div
                style={{
                  padding: '9px 12px',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  borderRadius: 'var(--radius-input)',
                  color: '#ef4444',
                  fontSize: '12px',
                  lineHeight: '1.4',
                }}
              >
                {replayError}
              </div>
            )}

            {/* Estimate box */}
            {estimatingReplay ? (
              <div
                style={{
                  padding: '12px',
                  backgroundColor: 'var(--surface-raised)',
                  borderRadius: 'var(--radius-input)',
                  border: '1px solid var(--border)',
                  fontSize: '12px',
                  color: 'var(--muted)',
                  textAlign: 'center',
                }}
              >
                Calculating compute & cost estimate...
              </div>
            ) : replayEstimate ? (
              <div style={{ padding: '12px', backgroundColor: 'var(--surface-raised)', borderRadius: 'var(--radius-input)', border: '1px solid var(--border)', fontSize: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span>Sampled Weekly Dates:</span>
                  <strong>{replayEstimate.sample_dates_count || replayEstimate.weekly_evaluations_count}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span>Est. LLM Calls:</span>
                  <strong>{replayEstimate.estimated_llm_calls}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Est. Cost (USD):</span>
                  <strong style={{ color: replayEstimate.estimated_cost_usd > replaySpendCap ? 'var(--loss)' : 'var(--gain)' }}>
                    ${replayEstimate.estimated_cost_usd?.toFixed(3)}
                  </strong>
                </div>
              </div>
            ) : null}

            {/* Live Event Stream during replay */}
            {startingReplay && replayEvents.length > 0 && (
              <div style={{ maxHeight: '120px', overflowY: 'auto', backgroundColor: '#000', padding: '8px', borderRadius: '4px', fontSize: '11px', fontFamily: 'monospace', color: '#10b981' }}>
                {replayEvents.map((evt, idx) => (
                  <div key={idx}>[{evt.date || 'REPLAY'}] {evt.detail || evt.status}</div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
              <button
                onClick={() => setShowReplayModal(false)}
                style={{ padding: '7px 14px', backgroundColor: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius-input)', color: 'var(--muted)', fontSize: '12px', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleStartReplay}
                disabled={startingReplay || selectedAnalysts.length === 0}
                style={{
                  padding: '7px 16px',
                  backgroundColor: 'var(--accent)',
                  color: 'var(--accent-contrast)',
                  border: 'none',
                  borderRadius: 'var(--radius-input)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: startingReplay ? 'not-allowed' : 'pointer',
                }}
              >
                {startingReplay ? 'Replaying...' : 'Confirm & Run Replay'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mandatory Regulatory Footer */}
      <footer
        style={{
          marginTop: '20px',
          padding: '16px',
          borderTop: '1px solid var(--border)',
          textAlign: 'center',
          color: 'var(--muted)',
          fontSize: '11.5px',
          lineHeight: '1.5',
        }}
      >
        Historical and forward-test statistics are not predictions or financial advice.
      </footer>
    </div>
  );
}

export default function ReliabilityPage() {
  return (
    <Suspense fallback={<div style={{ padding: '40px', color: 'var(--muted)' }}>Loading Signal Reliability Desk...</div>}>
      <ReliabilityContent />
    </Suspense>
  );
}
