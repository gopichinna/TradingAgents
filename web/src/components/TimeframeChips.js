'use client';

import React from 'react';

export default function TimeframeChips({ selected = 90, onChange }) {
  const options = [30, 60, 90, 120];

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: 'var(--surface)', padding: '3px', borderRadius: 'var(--radius-pill)', border: '1px solid var(--border)' }}>
      {options.map((days) => {
        const active = selected === days;
        return (
          <button
            key={days}
            onClick={() => onChange(days)}
            style={{
              border: 'none',
              borderRadius: 'var(--radius-pill)',
              padding: '4px 12px',
              fontSize: '12px',
              fontWeight: active ? 600 : 500,
              backgroundColor: active ? 'var(--amber-bg)' : 'transparent',
              color: active ? 'var(--accent)' : 'var(--muted)',
              border: active ? '1px solid var(--amber-border)' : '1px solid transparent',
              cursor: 'pointer',
            }}
          >
            {days}D
          </button>
        );
      })}
    </div>
  );
}
