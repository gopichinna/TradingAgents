'use client';

import React from 'react';

export default function InstrumentCard({ instrument, isSelected, onSelect }) {
  return (
    <button
      onClick={() => onSelect(instrument.symbol)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: '4px',
        padding: '14px 16px',
        backgroundColor: isSelected ? 'var(--amber-bg)' : 'var(--surface)',
        border: isSelected ? '1px solid var(--accent)' : '1px solid var(--border)',
        borderRadius: 'var(--radius-card)',
        textAlign: 'left',
        cursor: 'pointer',
        width: '100%',
        position: 'relative',
        transition: 'all 0.15s ease',
      }}
      onMouseEnter={(e) => {
        if (!isSelected) {
          e.currentTarget.style.borderColor = 'var(--muted)';
          e.currentTarget.style.backgroundColor = 'var(--surface-raised)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          e.currentTarget.style.borderColor = 'var(--border)';
          e.currentTarget.style.backgroundColor = 'var(--surface)';
        }
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <span style={{ fontSize: '15px', fontWeight: 700, color: isSelected ? 'var(--accent)' : 'var(--text)' }}>
          {instrument.symbol}
        </span>
        <span style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {instrument.region}
        </span>
      </div>

      <span style={{ fontSize: '13px', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>
        {instrument.name}
      </span>

      <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
        {instrument.sector}
      </span>
    </button>
  );
}
