'use client';

import React from 'react';
import RatingPill from './RatingPill';

export default function VerdictCard({ rating = 'HOLD', rationale = '' }) {
  return (
    <div
      style={{
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-card)',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted)' }}>
            Portfolio Manager Judge Verdict
          </span>
          <RatingPill rating={rating} size="large" />
        </div>

        <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
          Consensus Allocation
        </span>
      </div>

      <div
        style={{
          padding: '14px 18px',
          backgroundColor: 'var(--surface-raised)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-input)',
          fontSize: '13.5px',
          lineHeight: '1.6',
          color: 'var(--text)',
        }}
      >
        {rationale || 'Portfolio manager reached neutral allocation based on balanced risk-reward parameters.'}
      </div>
    </div>
  );
}
