'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';

export default function RunConfigForm() {
  const { selectedSymbol, runConfig, setRunConfig, triggerRun } = useApp();

  const [date, setDate] = useState('');
  const [strategy, setStrategy] = useState('swing');
  const [selectedAnalysts, setSelectedAnalysts] = useState(['market', 'news', 'fundamentals']);
  const [debateRounds, setDebateRounds] = useState(1);
  const [attachedBook, setAttachedBook] = useState(null);
  const [uploadingBook, setUploadingBook] = useState(false);
  const fileInputRef = useRef(null);

  // Initialize today's date
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    setDate(today);
  }, []);

  const toggleAnalyst = (id) => {
    setSelectedAnalysts((prev) => {
      if (prev.includes(id)) {
        if (prev.length <= 1) return prev; // Keep at least one
        return prev.filter((a) => a !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingBook(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/v1/books', {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        setAttachedBook(data);
      }
    } catch (err) {
      console.error('Failed to upload custom book', err);
    } finally {
      setUploadingBook(false);
    }
  };

  const handleLaunch = () => {
    triggerRun({
      symbol: selectedSymbol,
      analysis_date: date,
      strategy: strategy,
      analysts: selectedAnalysts,
      debate_rounds: debateRounds,
      book_id: attachedBook ? attachedBook.book_id : null,
    });
  };

  const analystOptions = [
    { id: 'market', label: 'Market' },
    { id: 'news', label: 'News' },
    { id: 'fundamentals', label: 'Fundamentals' },
    { id: 'social', label: 'Social' },
  ];

  return (
    <div
      style={{
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-card)',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}
    >
      <div>
        <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)' }}>
          Run Configuration
        </h2>
        <p style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '2px' }}>
          Configure multi-agent parameters for {selectedSymbol}
        </p>
      </div>

      {/* Analysis Date */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
          Analysis Date
        </label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{
              flex: 1,
              padding: '9px 12px',
              backgroundColor: 'var(--surface-raised)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-input)',
              color: 'var(--text)',
              fontSize: '13px',
              fontFamily: 'var(--font-mono)',
            }}
          />
          <button
            type="button"
            onClick={() => setDate(new Date().toISOString().slice(0, 10))}
            style={{
              padding: '8px 14px',
              backgroundColor: 'var(--surface-raised)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-input)',
              color: 'var(--text)',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Today
          </button>
        </div>
      </div>

      {/* Trading Strategy */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
          Strategy
        </label>
        <select
          value={strategy}
          onChange={(e) => setStrategy(e.target.value)}
          style={{
            padding: '9px 12px',
            backgroundColor: 'var(--surface-raised)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-input)',
            color: 'var(--text)',
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          <option value="swing">Swing (3–20 days holding period)</option>
          <option value="day">Day (Intraday volatility & VWAP breaks)</option>
          <option value="position">Position (30–180 days fundamental trend)</option>
        </select>
      </div>

      {/* Analyst Toggle Chips */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
          Selected Analysts
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {analystOptions.map((a) => {
            const isChecked = selectedAnalysts.includes(a.id);
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => toggleAnalyst(a.id)}
                style={{
                  border: isChecked ? '1px solid var(--amber-border)' : '1px solid var(--border)',
                  backgroundColor: isChecked ? 'var(--amber-bg)' : 'var(--surface-raised)',
                  color: isChecked ? 'var(--accent)' : 'var(--muted)',
                  borderRadius: 'var(--radius-pill)',
                  padding: '6px 14px',
                  fontSize: '12px',
                  fontWeight: isChecked ? 600 : 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>{isChecked ? '✓' : '+'}</span>
                <span>{a.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Debate Depth Select */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
          Debate Depth
        </label>
        <select
          value={debateRounds}
          onChange={(e) => setDebateRounds(Number(e.target.value))}
          style={{
            padding: '9px 12px',
            backgroundColor: 'var(--surface-raised)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-input)',
            color: 'var(--text)',
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          <option value={1}>1 Round (Fast synthesis)</option>
          <option value={2}>2 Rounds (Standard adversarial cross-examination)</option>
          <option value={3}>3 Rounds (Deep exhaustive stress-testing)</option>
        </select>
      </div>

      {/* Attach Custom Book Secondary Button */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          style={{ display: 'none' }}
          accept=".pdf,.txt,.md,.doc,.docx"
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          style={{
            padding: '9px 14px',
            backgroundColor: 'var(--surface-raised)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-input)',
            color: 'var(--text)',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
          </svg>
          <span>{uploadingBook ? 'Uploading book...' : attachedBook ? `Attached: ${attachedBook.name}` : 'Attach custom book'}</span>
        </button>

        {attachedBook && (
          <span style={{ fontSize: '11px', color: 'var(--gain)', alignSelf: 'center' }}>
            Book attached ({Math.round(attachedBook.size / 1024)} KB)
          </span>
        )}
      </div>

      {/* Launch Button */}
      <button
        type="button"
        onClick={handleLaunch}
        style={{
          marginTop: '6px',
          padding: '12px',
          backgroundColor: 'var(--accent)',
          color: 'var(--accent-contrast)',
          border: 'none',
          borderRadius: 'var(--radius-input)',
          fontSize: '14px',
          fontWeight: 700,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--accent-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--accent)')}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
        <span>Run multi-agent research</span>
      </button>
    </div>
  );
}
