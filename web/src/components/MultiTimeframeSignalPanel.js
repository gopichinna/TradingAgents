'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

export default function MultiTimeframeSignalPanel({ symbol = 'NVDA', isOpen = true, onToggle }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    fetch(`/api/v1/instruments/${symbol}/signals?tf=D`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load multi-timeframe signals');
        return res.json();
      })
      .then((json) => {
        if (isMounted) {
          setData(json);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [symbol]);

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        aria-label="Open multi-timeframe signal panel"
        style={{
          position: 'fixed',
          right: '24px',
          top: '120px',
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--accent)',
          borderRadius: 'var(--radius-pill)',
          padding: '8px 14px',
          color: 'var(--text)',
          fontSize: '12px',
          fontWeight: 600,
          cursor: 'pointer',
          zIndex: 20,
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
        }}
      >
        <span>⚡ Signals Panel</span>
        <span>◀</span>
      </button>
    );
  }

  const combinedSignal = data?.combined_signal || 'HOLD / WAIT';
  const isBuy = combinedSignal.includes('BUY');
  const isSell = combinedSignal.includes('SELL');

  let badgeBg = 'var(--amber-bg)';
  let badgeColor = 'var(--amber)';
  let badgeBorder = 'var(--amber-border)';
  if (isBuy) {
    badgeBg = 'var(--gain-bg)';
    badgeColor = 'var(--gain)';
    badgeBorder = 'var(--gain-border)';
  } else if (isSell) {
    badgeBg = 'var(--loss-bg)';
    badgeColor = 'var(--loss)';
    badgeBorder = 'var(--loss-border)';
  }

  return (
    <aside
      aria-label="Multi-timeframe swing trading signals"
      style={{
        width: '360px',
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-card)',
        padding: '18px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        height: 'fit-content',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>
            Multi-Timeframe Signals
          </span>
          <span style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginTop: '1px' }}>
            Monthly, Weekly & Daily alignment
          </span>
        </div>

        <button
          onClick={onToggle}
          aria-label="Collapse signal panel"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--muted)',
            cursor: 'pointer',
            fontSize: '12px',
            padding: '4px',
          }}
        >
          ✕
        </button>
      </div>

      {loading && (
        <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: '12px' }}>
          Evaluating multi-timeframe indicators...
        </div>
      )}

      {error && (
        <div style={{ padding: '12px', backgroundColor: 'var(--loss-bg)', color: 'var(--loss)', borderRadius: 'var(--radius-input)', fontSize: '12px' }}>
          {error}
        </div>
      )}

      {!loading && !error && data && (
        <>
          {/* Timeframe Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontSize: '10.5px' }}>
                  <th style={{ padding: '6px 4px', fontWeight: 600 }}>TF</th>
                  <th style={{ padding: '6px 4px', fontWeight: 600 }}>200 SMA</th>
                  <th style={{ padding: '6px 4px', fontWeight: 600 }}>RSI 14</th>
                  <th style={{ padding: '6px 4px', fontWeight: 600 }}>MACD</th>
                  <th style={{ padding: '6px 4px', fontWeight: 600 }}>ADX</th>
                  <th style={{ padding: '6px 4px', fontWeight: 600, textAlign: 'right' }}>Score</th>
                </tr>
              </thead>
              <tbody>
                {data.timeframes.map((tf) => {
                  const tfBuy = tf.signal === 'BUY';
                  const tfSell = tf.signal === 'SELL';
                  const tfColor = tfBuy ? 'var(--gain)' : tfSell ? 'var(--loss)' : 'var(--muted)';

                  return (
                    <tr
                      key={tf.timeframe}
                      style={{ borderBottom: '1px solid var(--border)', transition: 'background-color 0.15s ease' }}
                    >
                      <td style={{ padding: '8px 4px', fontWeight: 700, color: 'var(--text)' }}>
                        {tf.timeframe.charAt(0)}
                      </td>
                      <td style={{ padding: '8px 4px', color: tf.sma200_dist_pct != null ? (tf.sma200_dist_pct >= 0 ? 'var(--gain)' : 'var(--loss)') : 'var(--muted)' }}>
                        <span className="tabular-nums" style={{ fontWeight: 600 }}>
                          {tf.sma200_dist_pct != null ? `${tf.sma200_dist_pct >= 0 ? '+' : ''}${tf.sma200_dist_pct.toFixed(0)}%` : 'n/a'}
                        </span>
                        {tf.is_proxy && (
                          <span style={{ fontSize: '9px', display: 'block', color: 'var(--accent)', fontStyle: 'italic' }}>
                            {tf.sma200_label}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '8px 4px' }}>
                        <span className="tabular-nums" style={{ fontWeight: 600 }}>{tf.rsi_value}</span>
                        <span style={{ fontSize: '9px', display: 'block', color: 'var(--muted)' }}>{tf.rsi_state}</span>
                      </td>
                      <td style={{ padding: '8px 4px' }}>
                        <span style={{ color: tf.macd_state === 'Bullish' ? 'var(--gain)' : tf.macd_state === 'Bearish' ? 'var(--loss)' : 'var(--muted)', fontWeight: 600 }}>
                          {tf.macd_state}
                        </span>
                      </td>
                      <td style={{ padding: '8px 4px' }}>
                        <span className="tabular-nums">{tf.adx_value}</span>
                      </td>
                      <td style={{ padding: '8px 4px', textAlign: 'right' }}>
                        <span
                          className="tabular-nums"
                          style={{
                            padding: '2px 6px',
                            borderRadius: 'var(--radius-pill)',
                            backgroundColor: tfBuy ? 'var(--gain-bg)' : tfSell ? 'var(--loss-bg)' : 'var(--surface-raised)',
                            color: tfColor,
                            fontWeight: 700,
                          }}
                        >
                          {tf.score}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Combined Swing Signal Card */}
          <div
            style={{
              padding: '14px 16px',
              backgroundColor: 'var(--surface-raised)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-input)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                Combined Swing Signal
              </span>

              <span
                style={{
                  padding: '3px 10px',
                  borderRadius: 'var(--radius-pill)',
                  backgroundColor: badgeBg,
                  color: badgeColor,
                  border: `1px solid ${badgeBorder}`,
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                }}
              >
                {combinedSignal}
              </span>
            </div>

            {/* Stop, Target & Max Hold Row */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: '8px',
                paddingTop: '6px',
                borderTop: '1px solid var(--border)',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '10px', color: 'var(--muted)' }}>Stop (2x ATR)</span>
                <span className="price-val" style={{ fontSize: '13px', fontWeight: 700, color: 'var(--loss)' }}>
                  ${data.suggested_stop?.toFixed(2)}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '10px', color: 'var(--muted)' }}>Target (2R)</span>
                <span className="price-val" style={{ fontSize: '13px', fontWeight: 700, color: 'var(--gain)' }}>
                  ${data.first_target?.toFixed(2)}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '10px', color: 'var(--muted)' }}>Max Hold</span>
                <span className="tabular-nums" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                  {data.max_hold_days} days
                </span>
              </div>
            </div>

            {/* Plain language explanation */}
            <p style={{ fontSize: '12px', lineHeight: '1.5', color: 'var(--text)', borderTop: '1px solid var(--border)', paddingTop: '8px', margin: 0 }}>
              {data.reason}
            </p>

            {/* Paper trade this signal CTA */}
            {combinedSignal === 'BUY' && (
              <Link
                href={`/positions?action=buy&symbol=${symbol}&stop=${data.suggested_stop || ''}&target=${data.first_target || ''}&hold=${data.max_hold_days || 20}&signal_tag=${encodeURIComponent(`Swing BUY: ${data.reason || 'Pullback trigger'}`)}`}
                style={{
                  marginTop: '6px',
                  padding: '9px 12px',
                  backgroundColor: 'var(--gain)',
                  color: '#ffffff',
                  borderRadius: 'var(--radius-input)',
                  fontWeight: 700,
                  fontSize: '12.5px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  textDecoration: 'none',
                  boxShadow: '0 2px 8px rgba(16, 185, 129, 0.25)',
                }}
              >
                <span>⚡ Paper trade this signal</span>
              </Link>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
