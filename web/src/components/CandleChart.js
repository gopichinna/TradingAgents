'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import TimeframeChips from './TimeframeChips';
import OhlcReadout from './OhlcReadout';

export default function CandleChart({ symbol = 'NVDA' }) {
  const [days, setDays] = useState(90);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Hover state for crosshair
  const [hoverIndex, setHoverIndex] = useState(null);
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(1000);

  // Measure container width on resize
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        setContainerWidth(entries[0].contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Fetch candle data
  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    fetch(`/api/v1/instruments/${symbol}/candles?days=${days}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch candlestick data');
        return res.json();
      })
      .then((json) => {
        if (isMounted) {
          setData(json);
          setLoading(false);
          setHoverIndex(json.candles ? json.candles.length - 1 : null);
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
  }, [symbol, days]);

  const candles = data?.candles || [];
  const sma20 = data?.sma20 || [];
  const bbUpper = data?.bb_upper || [];
  const bbLower = data?.bb_lower || [];
  const signals = data?.signals || [];

  // Chart dimensions
  const height = 540;
  const padding = { top: 20, right: 65, bottom: 35, left: 20 };
  const plotWidth = Math.max(containerWidth - padding.left - padding.right, 300);
  const plotHeight = height - padding.top - padding.bottom;

  // Compute price bounds
  let minPrice = Infinity;
  let maxPrice = -Infinity;

  candles.forEach((c, i) => {
    if (c.l < minPrice) minPrice = c.l;
    if (c.h > maxPrice) maxPrice = c.h;
    if (bbLower[i] && bbLower[i] < minPrice) minPrice = bbLower[i];
    if (bbUpper[i] && bbUpper[i] > maxPrice) maxPrice = bbUpper[i];
  });

  if (minPrice === Infinity) {
    minPrice = 100;
    maxPrice = 200;
  }

  // Add 4% padding to bounds
  const priceRange = maxPrice - minPrice || 1;
  const yMin = minPrice - priceRange * 0.04;
  const yMax = maxPrice + priceRange * 0.04;
  const ySpan = yMax - yMin;

  const getY = (val) => {
    if (val === null || val === undefined || isNaN(val)) return null;
    return padding.top + plotHeight - ((val - yMin) / ySpan) * plotHeight;
  };

  const numCandles = candles.length;
  const candleSpacing = numCandles > 0 ? plotWidth / numCandles : 10;
  const candleWidth = Math.max(candleSpacing * 0.7, 2);

  const getX = (idx) => padding.left + idx * candleSpacing + candleSpacing / 2;

  // Build SVG Path for Bollinger Band area
  let bbAreaPath = '';
  let bbUpperPath = '';
  let bbLowerPath = '';
  let sma20Path = '';

  if (candles.length > 0) {
    const validBb = [];
    candles.forEach((_, i) => {
      const u = getY(bbUpper[i]);
      const l = getY(bbLower[i]);
      if (u !== null && l !== null) {
        validBb.push({ x: getX(i), u, l });
      }
    });

    if (validBb.length > 1) {
      // Top line forward
      const upperSegs = validBb.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.u}`).join(' ');
      // Bottom line backward
      const lowerSegs = [...validBb].reverse().map((pt) => `L ${pt.x} ${pt.l}`).join(' ');
      bbAreaPath = `${upperSegs} ${lowerSegs} Z`;

      bbUpperPath = validBb.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.u}`).join(' ');
      bbLowerPath = validBb.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.l}`).join(' ');
    }

    // SMA20 line
    const smaPoints = [];
    candles.forEach((_, i) => {
      const sY = getY(sma20[i]);
      if (sY !== null) {
        smaPoints.push({ x: getX(i), y: sY });
      }
    });
    if (smaPoints.length > 1) {
      sma20Path = smaPoints.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ');
    }
  }

  // Price axis gridlines (5 ticks)
  const gridTicks = [0, 0.25, 0.5, 0.75, 1.0].map((ratio) => {
    const p = yMin + ratio * ySpan;
    return {
      price: p,
      y: getY(p),
    };
  });

  // Last price
  const lastCandle = candles[candles.length - 1];
  const lastPrice = lastCandle ? lastCandle.c : null;
  const lastPriceY = lastPrice !== null ? getY(lastPrice) : null;
  const lastPriceColor = lastCandle && lastCandle.c >= lastCandle.o ? 'var(--gain)' : 'var(--loss)';

  // Mouse move handler for crosshair
  const handleMouseMove = (e) => {
    if (!containerRef.current || candles.length === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left - padding.left;
    const idx = Math.floor(mouseX / candleSpacing);
    if (idx >= 0 && idx < candles.length) {
      setHoverIndex(idx);
    }
  };

  const handleMouseLeave = () => {
    setHoverIndex(candles.length - 1);
  };

  const currentCandle = hoverIndex !== null && candles[hoverIndex] ? candles[hoverIndex] : lastCandle;
  const currentSma20 = hoverIndex !== null ? sma20[hoverIndex] : null;
  const currentBbU = hoverIndex !== null ? bbUpper[hoverIndex] : null;
  const currentBbL = hoverIndex !== null ? bbLower[hoverIndex] : null;

  return (
    <div
      style={{
        width: '100%',
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-card)',
        padding: '20px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      {/* Top Controls Row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <TimeframeChips selected={days} onChange={setDays} />
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: 'var(--muted)', marginLeft: '8px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ display: 'inline-block', width: '12px', height: '2px', backgroundColor: 'var(--accent)' }} />
              <span>SMA20</span>
            </span>

            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ display: 'inline-block', width: '10px', height: '8px', backgroundColor: 'var(--band-fill)', border: '1px solid var(--band)' }} />
              <span>Bollinger Bands</span>
            </span>

            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--gain)' }} />
              <span>Buy (B)</span>
            </span>

            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--loss)' }} />
              <span>Sell (S)</span>
            </span>
          </div>
        </div>

        {/* Top-Right Open Debate Button */}
        <Link
          href="/debate"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '7px 14px',
            borderRadius: 'var(--radius-input)',
            backgroundColor: 'var(--surface-raised)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
            fontSize: '13px',
            fontWeight: 600,
            textDecoration: 'none',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
        >
          <span>Open debate</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </Link>
      </div>

      {/* Hero Candlestick Chart Area (Full Width, ~70vh height) */}
      <div
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          width: '100%',
          height: `${height}px`,
          position: 'relative',
          cursor: 'crosshair',
          userSelect: 'none',
        }}
      >
        {loading && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(var(--surface), 0.7)',
              fontSize: '13px',
              color: 'var(--muted)',
            }}
          >
            Loading technical candles...
          </div>
        )}

        {error && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--loss)',
              fontSize: '13px',
            }}
          >
            {error}
          </div>
        )}

        {!loading && !error && candles.length > 0 && (
          <svg width="100%" height={height} style={{ overflow: 'visible' }}>
            <defs>
              <linearGradient id="bbGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--band)" stopOpacity="0.14" />
                <stop offset="100%" stopColor="var(--band)" stopOpacity="0.06" />
              </linearGradient>
            </defs>

            {/* Price Grid Lines */}
            {gridTicks.map((tick, i) => (
              <g key={i}>
                <line
                  x1={padding.left}
                  y1={tick.y}
                  x2={containerWidth - padding.right}
                  y2={tick.y}
                  stroke="var(--border)"
                  strokeDasharray="3 3"
                  strokeWidth="1"
                />
                <text
                  x={containerWidth - padding.right + 8}
                  y={tick.y + 4}
                  fill="var(--muted)"
                  fontSize="11"
                  className="price-val"
                  fontFamily="var(--font-mono)"
                >
                  {tick.price.toFixed(1)}
                </text>
              </g>
            ))}

            {/* Bollinger Band Soft Fill */}
            {bbAreaPath && <path d={bbAreaPath} fill="url(#bbGradient)" />}
            {bbUpperPath && <path d={bbUpperPath} fill="none" stroke="var(--band)" strokeWidth="1" strokeDasharray="2 2" opacity="0.6" />}
            {bbLowerPath && <path d={bbLowerPath} fill="none" stroke="var(--band)" strokeWidth="1" strokeDasharray="2 2" opacity="0.6" />}

            {/* 20-Day SMA Line */}
            {sma20Path && <path d={sma20Path} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />}

            {/* Candlesticks */}
            {candles.map((c, i) => {
              const x = getX(i);
              const isUp = c.c >= c.o;
              const color = isUp ? 'var(--gain)' : 'var(--loss)';

              const yHigh = getY(c.h);
              const yLow = getY(c.l);
              const yOpen = getY(c.o);
              const yClose = getY(c.c);

              const bodyTop = Math.min(yOpen, yClose);
              const bodyHeight = Math.max(Math.abs(yClose - yOpen), 1.5);

              return (
                <g key={i}>
                  {/* Wick */}
                  <line x1={x} y1={yHigh} x2={x} y2={yLow} stroke={color} strokeWidth="1.2" />

                  {/* Body */}
                  <rect
                    x={x - candleWidth / 2}
                    y={bodyTop}
                    width={candleWidth}
                    height={bodyHeight}
                    fill={color}
                    rx="1"
                  />
                </g>
              );
            })}

            {/* Buy / Sell Transaction Markers */}
            {signals.map((sig, idx) => {
              const matchIdx = candles.findIndex((c) => c.t === sig.t);
              if (matchIdx === -1) return null;
              const x = getX(matchIdx);
              const isBuy = sig.side === 'B';
              const y = getY(sig.price) + (isBuy ? 18 : -18);
              const color = isBuy ? 'var(--gain)' : 'var(--loss)';

              return (
                <g key={`sig-${idx}`}>
                  <circle cx={x} cy={y} r="8" fill={color} stroke="var(--surface)" strokeWidth="1.5" />
                  <text
                    x={x}
                    y={y + 3.5}
                    textAnchor="middle"
                    fill="var(--surface)"
                    fontSize="9"
                    fontWeight="800"
                    fontFamily="var(--font-mono)"
                  >
                    {sig.side}
                  </text>
                </g>
              );
            })}

            {/* Crosshair on Hover */}
            {hoverIndex !== null && candles[hoverIndex] && (
              <g>
                {/* Vertical cursor line */}
                <line
                  x1={getX(hoverIndex)}
                  y1={padding.top}
                  x2={getX(hoverIndex)}
                  y2={height - padding.bottom}
                  stroke="var(--muted)"
                  strokeWidth="1"
                  strokeDasharray="2 2"
                />
                {/* Horizontal cursor line on close */}
                <line
                  x1={padding.left}
                  y1={getY(candles[hoverIndex].c)}
                  x2={containerWidth - padding.right}
                  y2={getY(candles[hoverIndex].c)}
                  stroke="var(--muted)"
                  strokeWidth="1"
                  strokeDasharray="2 2"
                />
              </g>
            )}

            {/* Last Price Tag on Right Axis */}
            {lastPriceY !== null && (
              <g transform={`translate(${containerWidth - padding.right}, ${lastPriceY - 10})`}>
                <rect
                  x="0"
                  y="0"
                  width="54"
                  height="20"
                  rx="4"
                  fill={lastPriceColor}
                />
                <text
                  x="6"
                  y="14"
                  fill="#ffffff"
                  fontSize="11"
                  fontWeight="700"
                  className="price-val"
                  fontFamily="var(--font-mono)"
                >
                  {lastPrice?.toFixed(1)}
                </text>
              </g>
            )}

            {/* Date labels on X-axis (every ~10-15 candles) */}
            {candles.map((c, i) => {
              const step = Math.ceil(candles.length / 7);
              if (i % step !== 0 && i !== candles.length - 1) return null;
              return (
                <text
                  key={`date-${i}`}
                  x={getX(i)}
                  y={height - 12}
                  textAnchor="middle"
                  fill="var(--muted)"
                  fontSize="10"
                  fontFamily="var(--font-mono)"
                >
                  {c.t.slice(5)}
                </text>
              );
            })}
          </svg>
        )}
      </div>

      {/* Interactive OHLC Readout Row */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
        <OhlcReadout
          candle={currentCandle}
          sma20={currentSma20}
          bbUpper={currentBbU}
          bbLower={currentBbL}
        />
      </div>
    </div>
  );
}
