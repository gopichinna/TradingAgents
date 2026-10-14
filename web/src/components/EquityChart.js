'use client';

import React, { useState, useRef, useEffect } from 'react';

export default function EquityChart({ equity = [] }) {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(800);
  const [hoverIndex, setHoverIndex] = useState(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        setWidth(entries[0].contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  if (!equity || equity.length === 0) {
    return (
      <div style={{ height: '280px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: '13px' }}>
        No equity curve data available
      </div>
    );
  }

  const height = 280;
  const padding = { top: 20, right: 60, bottom: 30, left: 20 };
  const plotWidth = Math.max(width - padding.left - padding.right, 200);
  const plotHeight = height - padding.top - padding.bottom;

  let minVal = Infinity;
  let maxVal = -Infinity;

  equity.forEach((pt) => {
    if (pt.strategy < minVal) minVal = pt.strategy;
    if (pt.strategy > maxVal) maxVal = pt.strategy;
    if (pt.benchmark < minVal) minVal = pt.benchmark;
    if (pt.benchmark > maxVal) maxVal = pt.benchmark;
  });

  const span = maxVal - minVal || 1;
  const yMin = minVal - span * 0.05;
  const yMax = maxVal + span * 0.05;
  const ySpan = yMax - yMin;

  const getY = (val) => padding.top + plotHeight - ((val - yMin) / ySpan) * plotHeight;
  const getX = (idx) => padding.left + (idx / (equity.length - 1)) * plotWidth;

  const stratPoints = equity.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(pt.strategy)}`).join(' ');
  const benchPoints = equity.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(pt.benchmark)}`).join(' ');

  // Gradient area under strategy
  const stratArea = `${stratPoints} L ${getX(equity.length - 1)} ${height - padding.bottom} L ${padding.left} ${height - padding.bottom} Z`;

  const handleMouseMove = (e) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left - padding.left;
    const ratio = Math.max(0, Math.min(1, mouseX / plotWidth));
    const idx = Math.round(ratio * (equity.length - 1));
    setHoverIndex(idx);
  };

  const currentPt = hoverIndex !== null && equity[hoverIndex] ? equity[hoverIndex] : equity[equity.length - 1];

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHoverIndex(null)}
      style={{
        width: '100%',
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-card)',
        padding: '20px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
            Cumulative Equity Curve
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--accent)' }}>
              <span style={{ display: 'inline-block', width: '12px', height: '2px', backgroundColor: 'var(--accent)' }} />
              <span>Multi-Agent Strategy</span>
            </span>

            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--muted)' }}>
              <span style={{ display: 'inline-block', width: '12px', height: '2px', backgroundColor: 'var(--muted)', strokeDasharray: '2 2' }} />
              <span>Buy & Hold Benchmark</span>
            </span>
          </div>
        </div>

        {currentPt && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', fontSize: '12px' }}>
            <span style={{ color: 'var(--muted)' }}>{currentPt.t}:</span>
            <span className="price-val" style={{ fontWeight: 600, color: 'var(--accent)' }}>
              Strat: ${currentPt.strategy?.toLocaleString()}
            </span>
            <span className="price-val" style={{ color: 'var(--muted)' }}>
              Bench: ${currentPt.benchmark?.toLocaleString()}
            </span>
          </div>
        )}
      </div>

      <svg width="100%" height={height} style={{ overflow: 'visible', cursor: 'crosshair' }}>
        <defs>
          <linearGradient id="stratAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Horizontal gridlines */}
        {[0, 0.5, 1.0].map((ratio, i) => {
          const val = yMin + ratio * ySpan;
          const y = getY(val);
          return (
            <g key={i}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="var(--border)" strokeDasharray="3 3" />
              <text x={width - padding.right + 6} y={y + 4} fill="var(--muted)" fontSize="10" fontFamily="var(--font-mono)">
                ${Math.round(val).toLocaleString()}
              </text>
            </g>
          );
        })}

        {/* Strategy Area & Line */}
        <path d={stratArea} fill="url(#stratAreaGrad)" />
        <path d={stratPoints} fill="none" stroke="var(--accent)" strokeWidth="2.5" />

        {/* Benchmark Line */}
        <path d={benchPoints} fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeDasharray="3 3" />

        {/* Hover cursor */}
        {hoverIndex !== null && (
          <g>
            <line
              x1={getX(hoverIndex)}
              y1={padding.top}
              x2={getX(hoverIndex)}
              y2={height - padding.bottom}
              stroke="var(--muted)"
              strokeWidth="1"
              strokeDasharray="2 2"
            />
            <circle cx={getX(hoverIndex)} cy={getY(currentPt.strategy)} r="4" fill="var(--accent)" />
          </g>
        )}
      </svg>
    </div>
  );
}
