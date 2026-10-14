'use client';

import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import RegionChips from '../components/RegionChips';
import InstrumentCard from '../components/InstrumentCard';
import RunConfigForm from '../components/RunConfigForm';

export default function SetupPage() {
  const { selectedSymbol, setSelectedSymbol } = useApp();
  const [region, setRegion] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [instruments, setInstruments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [customInput, setCustomInput] = useState('');
  const [customValidating, setCustomValidating] = useState(false);
  const [customErr, setCustomErr] = useState(null);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    const queryParams = new URLSearchParams();
    if (region && region !== 'All') queryParams.append('region', region);
    if (searchQuery.trim()) queryParams.append('q', searchQuery.trim());

    fetch(`/api/v1/instruments?${queryParams.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (isMounted) {
          setInstruments(Array.isArray(data) ? data : []);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to load instruments', err);
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [region, searchQuery]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Page Title & Subtitle */}
      <div>
        <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>
          Research Setup
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '2px' }}>
          Select an instrument and configure your multi-agent deliberation
        </p>
      </div>

      {/* Two Column Layout (60% / 40%) */}
      <div
        className="setup-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.5fr) minmax(360px, 1fr)',
          gap: '24px',
          alignItems: 'start',
        }}
      >
        {/* Left Column (60%): Instrument Picker */}
        <div
          style={{
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-card)',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {/* Search Bar & Region Filters */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Search Input */}
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Search symbol, company name, or sector..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px 10px 38px',
                  backgroundColor: 'var(--surface-raised)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-input)',
                  color: 'var(--text)',
                  fontSize: '13px',
                }}
              />
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--muted)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ position: 'absolute', left: '12px', top: '12px' }}
              >
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>

              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '8px',
                    border: 'none',
                    background: 'none',
                    color: 'var(--muted)',
                    fontSize: '14px',
                    cursor: 'pointer',
                    padding: '4px',
                  }}
                >
                  ✕
                </button>
              )}
            </div>

            {/* Region Chips */}
            <RegionChips selected={region} onChange={setRegion} />

            {/* Custom Yahoo Ticker Input */}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!customInput.trim()) return;
                setCustomValidating(true);
                setCustomErr(null);
                try {
                  const res = await fetch(`/api/v1/instruments/validate?symbol=${encodeURIComponent(customInput.trim().toUpperCase())}`);
                  const data = await res.json();
                  if (data.valid) {
                    setSelectedSymbol(data.symbol);
                    setCustomInput('');
                  } else {
                    setCustomErr(data.error || 'Invalid ticker');
                  }
                } catch (err) {
                  setCustomErr(err.message);
                } finally {
                  setCustomValidating(false);
                }
              }}
              style={{ display: 'flex', gap: '8px' }}
            >
              <input
                id="setup-custom-ticker-input"
                type="text"
                placeholder="Or enter custom Yahoo ticker (e.g. 0700.HK, 7203.T, AZN.L, BTC-USD)..."
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                style={{
                  flex: 1,
                  padding: '7px 12px',
                  backgroundColor: 'var(--surface-raised)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-input)',
                  color: 'var(--text)',
                  fontSize: '12px',
                  fontFamily: 'var(--font-mono)',
                }}
              />
              <button
                type="submit"
                disabled={customValidating || !customInput.trim()}
                style={{
                  padding: '7px 14px',
                  backgroundColor: 'var(--surface-raised)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-input)',
                  color: 'var(--text)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: customValidating || !customInput.trim() ? 'not-allowed' : 'pointer',
                }}
              >
                {customValidating ? 'Checking...' : 'Select Ticker'}
              </button>
            </form>
            {customErr && (
              <span style={{ fontSize: '11px', color: 'var(--loss)' }}>⚠️ {customErr}</span>
            )}
          </div>

          {/* Instrument Grid */}
          {loading ? (
            <div style={{ height: '320px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: '13px' }}>
              Loading instruments...
            </div>
          ) : instruments.length === 0 ? (
            <div
              style={{
                height: '240px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                color: 'var(--muted)',
                textAlign: 'center',
                padding: '20px',
              }}
            >
              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>
                No instruments match.
              </span>
              <span style={{ fontSize: '12px' }}>
                Clear the search or try another region.
              </span>
              <button
                onClick={() => {
                  setSearchQuery('');
                  setRegion('All');
                }}
                style={{
                  marginTop: '8px',
                  padding: '6px 14px',
                  backgroundColor: 'var(--surface-raised)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-input)',
                  color: 'var(--text)',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Reset filters
              </button>
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: '10px',
                maxHeight: '560px',
                overflowY: 'auto',
                paddingRight: '4px',
              }}
            >
              {instruments.map((inst) => (
                <InstrumentCard
                  key={inst.symbol}
                  instrument={inst}
                  isSelected={selectedSymbol === inst.symbol}
                  onSelect={setSelectedSymbol}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right Column (40%): Run Configuration Form */}
        <div>
          <RunConfigForm />
        </div>
      </div>

      <style jsx global>{`
        @media (max-width: 960px) {
          .setup-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
