'use client';

import React from 'react';

export default function RegionChips({ selected = 'All', onChange }) {
  const regions = ['All', 'US', 'Europe', 'UK', 'Japan', 'Hong Kong'];

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
      {regions.map((reg) => {
        const active = selected.toLowerCase() === reg.toLowerCase();
        return (
          <button
            key={reg}
            onClick={() => onChange(reg)}
            style={{
              border: active ? '1px solid var(--amber-border)' : '1px solid var(--border)',
              backgroundColor: active ? 'var(--amber-bg)' : 'var(--surface)',
              color: active ? 'var(--accent)' : 'var(--muted)',
              borderRadius: 'var(--radius-pill)',
              padding: '5px 12px',
              fontSize: '12px',
              fontWeight: active ? 600 : 500,
              cursor: 'pointer',
            }}
          >
            {reg}
          </button>
        );
      })}
    </div>
  );
}
