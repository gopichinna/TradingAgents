'use client';

import React from 'react';

export default function RatingPill({ rating = 'HOLD', size = 'normal' }) {
  const norm = rating ? rating.toUpperCase() : 'HOLD';

  let bg = 'var(--amber-bg)';
  let color = 'var(--amber)';
  let border = 'var(--amber-border)';
  let label = 'Hold';

  if (norm.includes('OVERWEIGHT') || norm.includes('BUY')) {
    bg = 'var(--gain-bg)';
    color = 'var(--gain)';
    border = 'var(--gain-border)';
    label = 'Overweight';
  } else if (norm.includes('UNDERWEIGHT') || norm.includes('SELL')) {
    bg = 'var(--loss-bg)';
    color = 'var(--loss)';
    border = 'var(--loss-border)';
    label = 'Underweight';
  }

  const isLarge = size === 'large';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: isLarge ? '6px 16px' : '3px 10px',
        fontSize: isLarge ? '14px' : '11px',
        fontWeight: isLarge ? 700 : 600,
        letterSpacing: '0.02em',
        borderRadius: 'var(--radius-pill)',
        backgroundColor: bg,
        color: color,
        border: `1px solid ${border}`,
        whiteSpace: 'nowrap',
        textTransform: 'uppercase',
      }}
    >
      {label}
    </span>
  );
}
