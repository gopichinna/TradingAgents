'use client';

import React from 'react';

export default function DebateRoundCard({ round = 1, bull = [], bear = [] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span>Round {round} deliberation</span>
      </div>

      <div
        className="debate-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '16px',
        }}
      >
        {/* Bull Card (Green Top Border) */}
        <div
          style={{
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)',
            borderTop: '3px solid var(--gain)',
            borderRadius: 'var(--radius-card)',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--gain)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>▲</span>
              <span>Bullish Thesis</span>
            </span>
            <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 500 }}>Upside Catalysts</span>
          </div>

          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {bull.map((arg, idx) => (
              <li
                key={idx}
                style={{
                  fontSize: '13px',
                  lineHeight: '1.5',
                  color: 'var(--text)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                }}
              >
                <span style={{ color: 'var(--gain)', fontSize: '14px', lineHeight: '1.2' }}>•</span>
                <span>{arg}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Bear Card (Red Top Border) */}
        <div
          style={{
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)',
            borderTop: '3px solid var(--loss)',
            borderRadius: 'var(--radius-card)',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--loss)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>▼</span>
              <span>Bearish Thesis</span>
            </span>
            <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 500 }}>Downside Risks</span>
          </div>

          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {bear.map((arg, idx) => (
              <li
                key={idx}
                style={{
                  fontSize: '13px',
                  lineHeight: '1.5',
                  color: 'var(--text)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                }}
              >
                <span style={{ color: 'var(--loss)', fontSize: '14px', lineHeight: '1.2' }}>•</span>
                <span>{arg}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
