'use client';

import React from 'react';

export default function StatCard({ label, value, subtext, color = 'var(--text)' }) {
  return (
    <div
      style={{
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-card)',
        padding: '18px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      }}
    >
      <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--muted)' }}>
        {label}
      </span>

      <span
        className="metric-val"
        style={{
          fontSize: '24px',
          fontWeight: 700,
          color: color,
          letterSpacing: '-0.02em',
        }}
      >
        {value}
      </span>

      {subtext && (
        <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
          {subtext}
        </span>
      )}
    </div>
  );
}
