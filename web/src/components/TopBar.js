'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useApp } from '../context/AppContext';

export default function TopBar() {
  const { selectedSymbol, setSelectedSymbol, quote, quoteLoading, triggerRun } = useApp();

  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [instruments, setInstruments] = useState([]);
  const [loadingInstruments, setLoadingInstruments] = useState(false);
  const [recentSymbols, setRecentSymbols] = useState([]);

  // Custom ticker validation state
  const [customTicker, setCustomTicker] = useState('');
  const [validatingCustom, setValidatingCustom] = useState(false);
  const [customError, setCustomError] = useState(null);

  const searchInputRef = useRef(null);

  const price = quote?.price ? quote.price.toFixed(2) : '---';
  const changePct = quote?.change_pct ?? 0;
  const isPositive = changePct >= 0;
  const companyName = quote?.name || selectedSymbol;
  const currency = quote?.currency || 'USD';

  // Load recent symbols from localStorage
  const refreshRecents = () => {
    if (typeof window !== 'undefined') {
      try {
        const recents = JSON.parse(localStorage.getItem('ta_recent_symbols') || '[]');
        setRecentSymbols(Array.isArray(recents) ? recents : []);
      } catch (_) {
        setRecentSymbols([]);
      }
    }
  };

  useEffect(() => {
    refreshRecents();
  }, [switcherOpen]);

  // Load instruments list once
  useEffect(() => {
    setLoadingInstruments(true);
    fetch('/api/v1/instruments')
      .then((res) => res.json())
      .then((data) => {
        setInstruments(Array.isArray(data) ? data : []);
      })
      .catch((e) => console.warn('Failed to load instruments', e))
      .finally(() => setLoadingInstruments(false));
  }, []);

  // Global keyboard shortcut '/' to open symbol switcher
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger if already in an input/textarea or modal is open
      const tag = e.target.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) {
        return;
      }
      if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setSwitcherOpen(true);
      } else if (e.key === 'Escape' && switcherOpen) {
        setSwitcherOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [switcherOpen]);

  // Auto-focus search input when switcher opens
  useEffect(() => {
    if (switcherOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
      setCustomError(null);
      setSearchQuery('');
      setCustomTicker('');
    }
  }, [switcherOpen]);

  // Filter instruments by query
  const filteredInstruments = useMemo(() => {
    if (!searchQuery.trim()) return instruments.slice(0, 12);
    const q = searchQuery.toLowerCase().trim();
    return instruments.filter(
      (inst) =>
        inst.symbol.toLowerCase().includes(q) ||
        inst.name.toLowerCase().includes(q) ||
        inst.sector.toLowerCase().includes(q)
    );
  }, [instruments, searchQuery]);

  const handleSelectSymbol = (sym) => {
    setSelectedSymbol(sym);
    setSwitcherOpen(false);
  };

  // Validate custom Yahoo ticker
  const handleValidateCustomTicker = async (e) => {
    if (e) e.preventDefault();
    const raw = customTicker.trim().toUpperCase();
    if (!raw) return;

    setValidatingCustom(true);
    setCustomError(null);

    try {
      const res = await fetch(`/api/v1/instruments/validate?symbol=${encodeURIComponent(raw)}`);
      const data = await res.json();
      if (data.valid) {
        setSelectedSymbol(data.symbol);
        setSwitcherOpen(false);
      } else {
        setCustomError(data.error || `Ticker '${raw}' could not be validated.`);
      }
    } catch (err) {
      setCustomError(`Validation error: ${err.message}`);
    } finally {
      setValidatingCustom(false);
    }
  };

  return (
    <>
      <header
        style={{
          position: 'sticky',
          top: 0,
          height: '56px',
          backgroundColor: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 28px',
          zIndex: 30,
        }}
      >
        {/* Symbol Switcher Trigger & Live Quote */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Clickable Switcher Pill */}
          <button
            id="symbol-switcher-trigger"
            onClick={() => setSwitcherOpen(true)}
            title="Switch ticker (Shortcut: /)"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: 'var(--surface-raised)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-pill)',
              padding: '5px 12px',
              cursor: 'pointer',
              color: 'var(--text)',
              transition: 'border-color 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            <span id="active-symbol-badge" style={{ fontSize: '15px', fontWeight: 800, letterSpacing: '-0.01em', color: 'var(--accent)' }}>
              {selectedSymbol}
            </span>
            <span style={{ fontSize: '12px', color: 'var(--muted)', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {companyName}
            </span>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 700,
                color: 'var(--muted)',
                backgroundColor: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                padding: '1px 5px',
                marginLeft: '4px',
              }}
            >
              /
            </span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}>
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>

          <div style={{ width: '1px', height: '18px', backgroundColor: 'var(--border)' }}></div>

          {/* Live Price & Change */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span className="price-val" style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text)' }}>
              {currency === 'USD' ? '$' : currency === 'GBp' ? 'p' : currency === 'EUR' ? '€' : ''}{price}
            </span>

            <span
              className="tabular-nums"
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: isPositive ? 'var(--gain)' : 'var(--loss)',
                display: 'flex',
                alignItems: 'center',
                gap: '2px',
              }}
            >
              {isPositive ? '+' : ''}{changePct.toFixed(2)}%
            </span>

            {quoteLoading && (
              <span style={{ fontSize: '10px', color: 'var(--muted)', fontStyle: 'italic' }}>
                updating...
              </span>
            )}
          </div>
        </div>

        {/* Primary Action Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={() => triggerRun()}
            style={{
              backgroundColor: 'var(--accent)',
              color: 'var(--accent-contrast)',
              border: 'none',
              borderRadius: 'var(--radius-input)',
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--accent-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--accent)')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            <span>Run multi-agent research</span>
          </button>
        </div>
      </header>

      {/* Symbol Switcher Modal / Dropdown */}
      {switcherOpen && (
        <div
          id="symbol-switcher-modal"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(3px)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            paddingTop: '80px',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setSwitcherOpen(false);
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '540px',
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-card)',
              boxShadow: '0 16px 40px rgba(0, 0, 0, 0.35)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Search Input Box */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input
                id="symbol-switcher-search"
                ref={searchInputRef}
                type="text"
                placeholder="Search symbol, company name, or sector... (Esc to close)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  fontSize: '15px',
                  color: 'var(--text)',
                }}
              />
              <button
                onClick={() => setSwitcherOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--muted)',
                  fontSize: '16px',
                  cursor: 'pointer',
                  padding: '4px',
                }}
              >
                ✕
              </button>
            </div>

            {/* Recent Symbols */}
            {recentSymbols.length > 0 && !searchQuery && (
              <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', backgroundColor: 'var(--surface-raised)' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Recent Symbols
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                  {recentSymbols.map((s) => (
                    <button
                      key={s}
                      onClick={() => handleSelectSymbol(s)}
                      style={{
                        padding: '4px 10px',
                        backgroundColor: s === selectedSymbol ? 'var(--amber-bg)' : 'var(--surface)',
                        border: s === selectedSymbol ? '1px solid var(--amber-border)' : '1px solid var(--border)',
                        color: s === selectedSymbol ? 'var(--accent)' : 'var(--text)',
                        borderRadius: 'var(--radius-pill)',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Filtered Instruments List */}
            <div style={{ maxHeight: '280px', overflowY: 'auto', padding: '8px 12px' }}>
              {loadingInstruments ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)', fontSize: '13px' }}>
                  Loading instruments...
                </div>
              ) : filteredInstruments.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)', fontSize: '13px' }}>
                  No matching instruments found.
                </div>
              ) : (
                filteredInstruments.map((inst) => {
                  const isCurrent = inst.symbol === selectedSymbol;
                  return (
                    <div
                      key={inst.symbol}
                      onClick={() => handleSelectSymbol(inst.symbol)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        borderRadius: 'var(--radius-input)',
                        cursor: 'pointer',
                        backgroundColor: isCurrent ? 'var(--amber-bg)' : 'transparent',
                        transition: 'background-color 0.12s ease',
                      }}
                      onMouseEnter={(e) => {
                        if (!isCurrent) e.currentTarget.style.backgroundColor = 'var(--surface-raised)';
                      }}
                      onMouseLeave={(e) => {
                        if (!isCurrent) e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '13.5px', fontWeight: 700, color: isCurrent ? 'var(--accent)' : 'var(--text)' }}>
                          {inst.symbol}
                        </span>
                        <span style={{ fontSize: '12.5px', color: 'var(--muted)' }}>
                          {inst.name}
                        </span>
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--muted)', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', padding: '2px 6px', borderRadius: '4px' }}>
                        {inst.region} · {inst.sector}
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            {/* Use Custom Yahoo Ticker Section */}
            <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', backgroundColor: 'var(--surface-raised)' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '6px' }}>
                Use Custom Yahoo Ticker
              </span>
              <form onSubmit={handleValidateCustomTicker} style={{ display: 'flex', gap: '8px' }}>
                <input
                  id="custom-ticker-input"
                  type="text"
                  placeholder="e.g. 0700.HK, 7203.T, AZN.L, RELIANCE.NS, BTC-USD"
                  value={customTicker}
                  onChange={(e) => setCustomTicker(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    backgroundColor: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-input)',
                    color: 'var(--text)',
                    fontSize: '12.5px',
                    fontFamily: 'var(--font-mono)',
                  }}
                />
                <button
                  type="submit"
                  disabled={validatingCustom || !customTicker.trim()}
                  style={{
                    padding: '8px 14px',
                    backgroundColor: 'var(--accent)',
                    color: 'var(--accent-contrast)',
                    border: 'none',
                    borderRadius: 'var(--radius-input)',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    cursor: validatingCustom || !customTicker.trim() ? 'not-allowed' : 'pointer',
                    opacity: validatingCustom || !customTicker.trim() ? 0.6 : 1,
                  }}
                >
                  {validatingCustom ? 'Validating...' : 'Validate & Switch'}
                </button>
              </form>

              {customError && (
                <div style={{ marginTop: '8px', fontSize: '11.5px', color: 'var(--loss)' }}>
                  ⚠️ {customError}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
