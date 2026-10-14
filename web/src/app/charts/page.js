'use client';

import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import TradingViewChart from '../../components/TradingViewChart';
import MultiTimeframeSignalPanel from '../../components/MultiTimeframeSignalPanel';

export default function ChartsPage() {
  const { selectedSymbol } = useApp();
  const [signalsOpen, setSignalsOpen] = useState(true);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%' }}>
      {/* Page Title & Status */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', margin: 0 }}>
              Technical Chart & Signal Engine
            </h1>
            <span
              style={{
                fontSize: '12px',
                fontWeight: 700,
                color: 'var(--accent)',
                backgroundColor: 'var(--amber-bg)',
                border: '1px solid var(--amber-border)',
                padding: '2px 8px',
                borderRadius: 'var(--radius-pill)',
              }}
            >
              {selectedSymbol}
            </span>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '4px', margin: 0 }}>
            TradingView lightweight-charts with 200 SMA, technical overlays, multi-timeframe swing signals, and synced sub-panes.
          </p>
        </div>
      </div>

      {/* Main Content Area: Chart (full width) + Collapsible Signal Panel */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: signalsOpen ? 'minmax(0, 1fr) 340px' : 'minmax(0, 1fr)',
          gap: '20px',
          alignItems: 'start',
          width: '100%',
        }}
      >
        <div style={{ minWidth: 0, width: '100%' }}>
          <TradingViewChart
            symbol={selectedSymbol}
            signalsOpen={signalsOpen}
            onToggleSignals={() => setSignalsOpen(!signalsOpen)}
          />
        </div>

        {signalsOpen && (
          <div style={{ position: 'sticky', top: '80px' }}>
            <MultiTimeframeSignalPanel
              symbol={selectedSymbol}
              isOpen={signalsOpen}
              onToggle={() => setSignalsOpen(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
