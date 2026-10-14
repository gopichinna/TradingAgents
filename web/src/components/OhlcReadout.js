'use client';

import React from 'react';

export default function OhlcReadout({ candle, sma20, bbUpper, bbLower }) {
  if (!candle) {
    return (
      <div style={{ height: '24px', display: 'flex', alignItems: 'center', fontSize: '12px', color: 'var(--muted)' }}>
        Hover over candles to inspect precise OHLCV and indicators
      </div>
    );
  }

  const isUp = candle.c >= candle.o;
  const change = candle.c - candle.o;
  const changePct = candle.o > 0 ? (change / candle.o) * 100 : 0;

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '16px',
        fontSize: '12px',
        color: 'var(--text)',
        padding: '6px 0',
      }}
    >
      <div style={{ display: 'flex', gap: '4px' }}>
        <span style={{ color: 'var(--muted)' }}>Date:</span>
        <span className="tabular-nums" style={{ fontWeight: 600 }}>{candle.t}</span>
      </div>

      <div style={{ display: 'flex', gap: '4px' }}>
        <span style={{ color: 'var(--muted)' }}>O:</span>
        <span className="price-val" style={{ fontWeight: 600 }}>{candle.o?.toFixed(2)}</span>
      </div>

      <div style={{ display: 'flex', gap: '4px' }}>
        <span style={{ color: 'var(--muted)' }}>H:</span>
        <span className="price-val" style={{ fontWeight: 600 }}>{candle.h?.toFixed(2)}</span>
      </div>

      <div style={{ display: 'flex', gap: '4px' }}>
        <span style={{ color: 'var(--muted)' }}>L:</span>
        <span className="price-val" style={{ fontWeight: 600 }}>{candle.l?.toFixed(2)}</span>
      </div>

      <div style={{ display: 'flex', gap: '4px' }}>
        <span style={{ color: 'var(--muted)' }}>C:</span>
        <span className="price-val" style={{ fontWeight: 700, color: isUp ? 'var(--gain)' : 'var(--loss)' }}>
          {candle.c?.toFixed(2)}
        </span>
      </div>

      <div style={{ display: 'flex', gap: '4px' }}>
        <span style={{ color: 'var(--muted)' }}>Chg:</span>
        <span className="tabular-nums" style={{ fontWeight: 600, color: isUp ? 'var(--gain)' : 'var(--loss)' }}>
          {isUp ? '+' : ''}{change.toFixed(2)} ({isUp ? '+' : ''}{changePct.toFixed(2)}%)
        </span>
      </div>

      <div style={{ display: 'flex', gap: '4px' }}>
        <span style={{ color: 'var(--muted)' }}>Vol:</span>
        <span className="tabular-nums" style={{ color: 'var(--muted)' }}>
          {candle.v ? (candle.v / 1e6).toFixed(2) + 'M' : '---'}
        </span>
      </div>

      {sma20 !== undefined && sma20 !== null && (
        <div style={{ display: 'flex', gap: '4px' }}>
          <span style={{ color: 'var(--accent)' }}>SMA20:</span>
          <span className="price-val" style={{ fontWeight: 600, color: 'var(--accent)' }}>
            {sma20.toFixed(2)}
          </span>
        </div>
      )}

      {bbUpper !== undefined && bbUpper !== null && (
        <div style={{ display: 'flex', gap: '4px' }}>
          <span style={{ color: 'var(--band)' }}>BB Upper:</span>
          <span className="price-val" style={{ color: 'var(--band)' }}>{bbUpper.toFixed(2)}</span>
        </div>
      )}

      {bbLower !== undefined && bbLower !== null && (
        <div style={{ display: 'flex', gap: '4px' }}>
          <span style={{ color: 'var(--band)' }}>BB Lower:</span>
          <span className="price-val" style={{ color: 'var(--band)' }}>{bbLower.toFixed(2)}</span>
        </div>
      )}
    </div>
  );
}
