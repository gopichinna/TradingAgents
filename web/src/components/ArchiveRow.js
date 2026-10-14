'use client';

import React from 'react';
import Link from 'next/link';
import RatingPill from './RatingPill';

export default function ArchiveRow({ run }) {
  const formattedDate = run.created_at ? run.created_at.replace('T', ' ').slice(0, 19) : run.run_id;

  const isPositiveOutcome =
    run.outcome_label?.includes('+') ||
    run.outcome_label?.toLowerCase().includes('target') ||
    (run.forward_return_10d && run.forward_return_10d > 0);
  const isNegativeOutcome =
    run.outcome_label?.includes('-') ||
    run.outcome_label?.toLowerCase().includes('stop') ||
    (run.forward_return_10d && run.forward_return_10d < 0);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 18px',
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-input)',
        transition: 'all 0.15s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--accent)';
        e.currentTarget.style.backgroundColor = 'var(--surface-raised)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border)';
        e.currentTarget.style.backgroundColor = 'var(--surface)';
      }}
    >
      <Link
        href={`/debate/${run.run_id}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          textDecoration: 'none',
          flex: 1,
        }}
      >
        <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>
          {run.symbol}
        </span>

        <span style={{ fontSize: '12px', color: 'var(--muted)', textTransform: 'capitalize' }}>
          {run.strategy || 'Swing'}
        </span>

        <span className="tabular-nums" style={{ fontSize: '12px', color: 'var(--muted)' }}>
          {formattedDate}
        </span>
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        {/* Outcome badge (Part 3.7) */}
        {run.outcome_label ? (
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 'var(--radius-pill)',
              backgroundColor: isPositiveOutcome
                ? 'var(--gain-bg)'
                : isNegativeOutcome
                ? 'var(--loss-bg)'
                : 'var(--surface-raised)',
              border: isPositiveOutcome
                ? '1px solid var(--gain-border)'
                : isNegativeOutcome
                ? '1px solid var(--loss-border)'
                : '1px solid var(--border)',
              color: isPositiveOutcome
                ? 'var(--gain)'
                : isNegativeOutcome
                ? 'var(--loss)'
                : 'var(--muted)',
            }}
          >
            {run.outcome_label}
          </span>
        ) : null}

        <RatingPill rating={run.rating} />

        {/* Link to ledger entry */}
        {run.signal_id ? (
          <Link
            href={`/reliability?signal_id=${run.signal_id}`}
            title="View signal ledger & reliability entry"
            style={{
              fontSize: '11px',
              color: 'var(--accent)',
              textDecoration: 'none',
              padding: '3px 8px',
              borderRadius: '4px',
              backgroundColor: 'var(--amber-bg)',
              border: '1px solid var(--amber-border)',
              fontWeight: 600,
            }}
          >
            Ledger ↗
          </Link>
        ) : null}

        <Link href={`/debate/${run.run_id}`} style={{ display: 'flex', alignItems: 'center' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </Link>
      </div>
    </div>
  );
}
