'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useApp } from '../../context/AppContext';
import RatingPill from '../../components/RatingPill';

export default function DecisionsPage() {
  const { archiveRevision } = useApp();
  const [runs, setRuns] = useState([]);
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterSymbol, setFilterSymbol] = useState('');
  const [filterRating, setFilterRating] = useState('ALL');
  const [expandedRunId, setExpandedRunId] = useState(null);
  const [detailedRun, setDetailedRun] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    Promise.all([
      fetch('/api/v1/runs?limit=100').then((r) => r.json()).catch(() => ({ items: [] })),
      fetch('/api/v1/signals?limit=100').then((r) => r.json()).catch(() => []),
    ])
      .then(([runsData, signalsData]) => {
        if (!isMounted) return;
        const items = runsData?.items || [];
        const sigList = Array.isArray(signalsData) ? signalsData : [];
        setRuns(items);
        setSignals(sigList);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load decisions', err);
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [archiveRevision]);

  // Combine runs with ledger signals for richer metrics
  const enrichedRuns = useMemo(() => {
    const signalMap = new Map();
    signals.forEach((s) => {
      if (s.run_id) signalMap.set(s.run_id, s);
    });

    return runs.map((run) => {
      const sig = signalMap.get(run.run_id);
      return {
        ...run,
        signal_id: run.signal_id || sig?.signal_id,
        as_of_date: sig?.as_of_date,
        entry_price: sig?.entry_price || sig?.last_close,
        fwd_ret_1d: sig?.fwd_ret_1d,
        fwd_ret_5d: sig?.fwd_ret_5d,
        fwd_ret_10d: sig?.fwd_ret_10d || run.forward_return_10d,
        fwd_ret_20d: sig?.fwd_ret_20d,
        alpha_spy_10d: sig?.alpha_spy_10d,
        bracket_outcome: sig?.bracket_outcome || run.bracket_result,
        analysts: sig?.analysts || [],
        llm_model: sig?.llm_models?.default || sig?.llm_provider || 'gemini',
        temperature: sig?.temperature,
        rationale: sig?.decision?.rationale,
      };
    });
  }, [runs, signals]);

  const filteredRuns = useMemo(() => {
    return enrichedRuns.filter((r) => {
      const matchSymbol = filterSymbol.trim() === '' || r.symbol?.toLowerCase().includes(filterSymbol.trim().toLowerCase());
      const matchRating = filterRating === 'ALL' || r.rating?.toUpperCase() === filterRating.toUpperCase();
      return matchSymbol && matchRating;
    });
  }, [enrichedRuns, filterSymbol, filterRating]);

  // Summary stats
  const stats = useMemo(() => {
    const total = enrichedRuns.length;
    const buys = enrichedRuns.filter((r) => ['STRONG BUY', 'BUY', 'OVERWEIGHT'].includes(r.rating?.toUpperCase())).length;
    const holds = enrichedRuns.filter((r) => ['HOLD', 'NEUTRAL'].includes(r.rating?.toUpperCase())).length;
    const sells = enrichedRuns.filter((r) => ['SELL', 'UNDERWEIGHT', 'STRONG SELL'].includes(r.rating?.toUpperCase())).length;
    const uniqueSymbols = new Set(enrichedRuns.map((r) => r.symbol)).size;
    return { total, buys, holds, sells, uniqueSymbols };
  }, [enrichedRuns]);

  // Handle row expansion to view full rationale and bullet points
  const handleToggleExpand = async (runId) => {
    if (expandedRunId === runId) {
      setExpandedRunId(null);
      setDetailedRun(null);
      return;
    }
    setExpandedRunId(runId);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/v1/runs/${runId}`);
      if (res.ok) {
        const data = await res.json();
        setDetailedRun(data);
      }
    } catch (e) {
      console.error('Failed to load run detail', e);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px', width: '100%', paddingBottom: '60px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', margin: 0 }}>
              AI Decision Center
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
              {stats.total} Research Verdicts Logged
            </span>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '4px', margin: 0 }}>
            Comprehensive directory of all autonomous multi-agent research executions, timing, consensus verdicts, and actionable rationale.
          </p>
        </div>

        {/* Action button */}
        <Link
          href="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '7px 15px',
            backgroundColor: 'var(--accent)',
            color: 'var(--accent-contrast)',
            borderRadius: 'var(--radius-input)',
            fontSize: '12px',
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          <span>+ New Research Run</span>
        </Link>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
        <div style={{ padding: '14px 16px', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-card)' }}>
          <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Total Researched</div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text)', marginTop: '4px' }}>{stats.total}</div>
          <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>Across {stats.uniqueSymbols} unique tickers</div>
        </div>

        <div style={{ padding: '14px 16px', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-card)' }}>
          <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Bullish Verdicts</div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--gain)', marginTop: '4px' }}>{stats.buys}</div>
          <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>Buy / Overweight allocation</div>
        </div>

        <div style={{ padding: '14px 16px', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-card)' }}>
          <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Neutral / Wait</div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--accent)', marginTop: '4px' }}>{stats.holds}</div>
          <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>Hold / Consolidating</div>
        </div>

        <div style={{ padding: '14px 16px', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-card)' }}>
          <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Bearish Verdicts</div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--loss)', marginTop: '4px' }}>{stats.sells}</div>
          <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>Sell / Underweight warning</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          padding: '12px 16px',
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-card)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Search stock symbol (e.g. MSFT, TSLA)..."
            value={filterSymbol}
            onChange={(e) => setFilterSymbol(e.target.value.toUpperCase())}
            style={{
              padding: '7px 12px',
              backgroundColor: 'var(--surface-raised)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-input)',
              color: 'var(--text)',
              fontSize: '12px',
              minWidth: '220px',
            }}
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '11.5px', color: 'var(--muted)', marginRight: '4px' }}>Verdict:</span>
            {['ALL', 'BUY', 'HOLD', 'SELL'].map((rat) => (
              <button
                key={rat}
                onClick={() => setFilterRating(rat)}
                style={{
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: 600,
                  borderRadius: 'var(--radius-pill)',
                  border: filterRating === rat ? '1px solid var(--accent)' : '1px solid var(--border)',
                  backgroundColor: filterRating === rat ? 'var(--amber-bg)' : 'transparent',
                  color: filterRating === rat ? 'var(--accent)' : 'var(--muted)',
                  cursor: 'pointer',
                }}
              >
                {rat}
              </button>
            ))}
          </div>
        </div>

        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
          Showing <strong>{filteredRuns.length}</strong> of {stats.total} researched stocks
        </span>
      </div>

      {/* Decisions Table */}
      {loading ? (
        <div style={{ height: '240px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: '13px' }}>
          Loading decision journal...
        </div>
      ) : filteredRuns.length === 0 ? (
        <div
          style={{
            padding: '60px 20px',
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-card)',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>
            No research decisions found
          </span>
          <p style={{ fontSize: '13px', color: 'var(--muted)', maxWidth: '400px', margin: 0 }}>
            {filterSymbol || filterRating !== 'ALL'
              ? 'Try adjusting your symbol or rating filter.'
              : 'Launch your first multi-agent research run from the Setup screen to populate the decision log.'}
          </p>
          <Link
            href="/"
            style={{
              marginTop: '6px',
              padding: '8px 18px',
              backgroundColor: 'var(--accent)',
              color: 'var(--accent-contrast)',
              borderRadius: 'var(--radius-input)',
              fontSize: '12px',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Start Research Run →
          </Link>
        </div>
      ) : (
        <div
          style={{
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-card)',
            overflow: 'hidden',
          }}
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--surface-raised)', borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontWeight: 600 }}>
                  <th style={{ padding: '10px 14px' }}>Symbol</th>
                  <th style={{ padding: '10px 14px' }}>Researched Date / Time</th>
                  <th style={{ padding: '10px 14px' }}>Verdict</th>
                  <th style={{ padding: '10px 14px' }}>Benchmark Price</th>
                  <th style={{ padding: '10px 14px' }}>Strategy</th>
                  <th style={{ padding: '10px 14px' }}>Outcome / Edge</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRuns.map((run) => {
                  const isExpanded = expandedRunId === run.run_id;
                  const dateStr = run.created_at
                    ? new Date(run.created_at).toLocaleString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : run.run_id;

                  const return10 = run.fwd_ret_10d != null ? (run.fwd_ret_10d * 100).toFixed(2) : null;
                  const isGain = return10 && parseFloat(return10) > 0;
                  const isLoss = return10 && parseFloat(return10) < 0;

                  return (
                    <React.Fragment key={run.run_id}>
                      <tr
                        onClick={() => handleToggleExpand(run.run_id)}
                        style={{
                          borderBottom: isExpanded ? 'none' : '1px solid var(--border)',
                          cursor: 'pointer',
                          backgroundColor: isExpanded ? 'var(--surface-raised)' : 'transparent',
                          transition: 'background-color 0.1s ease',
                        }}
                      >
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>
                              {run.symbol}
                            </span>
                            <span style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
                              #{run.run_id?.slice(-6)}
                            </span>
                          </div>
                        </td>

                        <td style={{ padding: '12px 14px', color: 'var(--text)' }}>
                          <div>{dateStr}</div>
                          {run.as_of_date && (
                            <div style={{ fontSize: '10.5px', color: 'var(--muted)' }}>
                              Simulated: {run.as_of_date}
                            </div>
                          )}
                        </td>

                        <td style={{ padding: '12px 14px' }}>
                          <RatingPill rating={run.rating} />
                        </td>

                        <td style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)' }}>
                          {run.entry_price ? `$${parseFloat(run.entry_price).toFixed(2)}` : '—'}
                        </td>

                        <td style={{ padding: '12px 14px', textTransform: 'capitalize', color: 'var(--muted)' }}>
                          {run.strategy || 'Swing'}
                        </td>

                        <td style={{ padding: '12px 14px' }}>
                          {return10 != null ? (
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '2px 7px',
                                borderRadius: 'var(--radius-pill)',
                                fontSize: '11px',
                                fontWeight: 600,
                                fontFamily: 'var(--font-mono)',
                                color: isGain ? 'var(--gain)' : isLoss ? 'var(--loss)' : 'var(--muted)',
                                backgroundColor: isGain ? 'var(--gain-bg)' : isLoss ? 'var(--loss-bg)' : 'transparent',
                                border: isGain ? '1px solid var(--gain-border)' : isLoss ? '1px solid var(--loss-border)' : 'none',
                              }}
                            >
                              {isGain ? `+${return10}%` : `${return10}%`} (10d)
                            </span>
                          ) : run.bracket_outcome ? (
                            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent)' }}>
                              {run.bracket_outcome}
                            </span>
                          ) : (
                            <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                              Tracking forward...
                            </span>
                          )}
                        </td>

                        <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }} onClick={(e) => e.stopPropagation()}>
                            <Link
                              href={`/charts?symbol=${run.symbol}`}
                              title="Open in Technical Charts"
                              style={{
                                padding: '4px 8px',
                                fontSize: '11px',
                                color: 'var(--muted)',
                                textDecoration: 'none',
                                borderRadius: '4px',
                                border: '1px solid var(--border)',
                              }}
                            >
                              Chart
                            </Link>

                            <Link
                              href={`/debate/${run.run_id}`}
                              title="Open full Debate Arena"
                              style={{
                                padding: '4px 8px',
                                fontSize: '11px',
                                color: 'var(--accent)',
                                textDecoration: 'none',
                                borderRadius: '4px',
                                border: '1px solid var(--amber-border)',
                                backgroundColor: 'var(--amber-bg)',
                                fontWeight: 600,
                              }}
                            >
                              Debate →
                            </Link>

                            <button
                              onClick={() => handleToggleExpand(run.run_id)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--muted)',
                                cursor: 'pointer',
                                padding: '2px',
                                transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                                transition: 'transform 0.15s ease',
                              }}
                            >
                              ▼
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expandable summary accordion */}
                      {isExpanded && (
                        <tr style={{ backgroundColor: 'var(--surface-raised)', borderBottom: '1px solid var(--border)' }}>
                          <td colSpan="7" style={{ padding: '0 16px 16px 16px' }}>
                            <div
                              style={{
                                padding: '14px 18px',
                                backgroundColor: 'var(--surface)',
                                border: '1px solid var(--border)',
                                borderRadius: 'var(--radius-input)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '10px',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent)' }}>
                                  Portfolio Manager Judge Synthesis:
                                </span>
                                <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                                  Run ID: <code style={{ fontFamily: 'var(--font-mono)' }}>{run.run_id}</code>
                                </span>
                              </div>

                              <p style={{ fontSize: '12.5px', color: 'var(--text)', lineHeight: '1.6', margin: 0 }}>
                                {detailedRun?.result?.rationale || run.rationale || 'Consensus position determined after multi-agent dialectical deliberation.'}
                              </p>

                              {/* Key Bull & Bear Highlights if loaded */}
                              {detailedRun?.result?.rounds?.[0] && (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px', marginTop: '6px' }}>
                                  <div style={{ padding: '10px', backgroundColor: 'var(--gain-bg)', border: '1px solid var(--gain-border)', borderRadius: '6px' }}>
                                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--gain)', marginBottom: '4px' }}>▲ Key Bull Argument</div>
                                    <div style={{ fontSize: '11.5px', color: 'var(--text)', lineHeight: '1.4' }}>
                                      {detailedRun.result.rounds[0].bull?.[0] || 'Strong trend and market support'}
                                    </div>
                                  </div>

                                  <div style={{ padding: '10px', backgroundColor: 'var(--loss-bg)', border: '1px solid var(--loss-border)', borderRadius: '6px' }}>
                                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--loss)', marginBottom: '4px' }}>▼ Key Bear Warning</div>
                                    <div style={{ fontSize: '11.5px', color: 'var(--text)', lineHeight: '1.4' }}>
                                      {detailedRun.result.rounds[0].bear?.[0] || 'Valuation and resistance caution'}
                                    </div>
                                  </div>
                                </div>
                              )}

                              <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
                                <Link
                                  href={`/debate/${run.run_id}`}
                                  style={{ fontSize: '11.5px', color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}
                                >
                                  Read Full Multi-Round Debate Arena Transcript →
                                </Link>
                                {run.signal_id && (
                                  <Link
                                    href={`/reliability?signal_id=${run.signal_id}`}
                                    style={{ fontSize: '11.5px', color: 'var(--muted)', textDecoration: 'none' }}
                                  >
                                    View Audit Ledger Verification ↗
                                  </Link>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
