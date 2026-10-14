'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useApp } from '../../../context/AppContext';
import DebateRoundCard from '../../../components/DebateRoundCard';
import VerdictCard from '../../../components/VerdictCard';

export default function DeepLinkDebatePage({ params }) {
  const unwrappedParams = use(params);
  const runId = unwrappedParams.runId;
  const { setSelectedSymbol } = useApp();

  const [runData, setRunData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!runId) return;
    let isMounted = true;
    setLoading(true);
    setError(null);

    fetch(`/api/v1/runs/${runId}`)
      .then((res) => {
        if (!res.ok) throw new Error('Run report not found');
        return res.json();
      })
      .then((data) => {
        if (isMounted) {
          setRunData(data);
          if (data.symbol) setSelectedSymbol(data.symbol);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [runId]);

  if (loading) {
    return (
      <div style={{ height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: '13px' }}>
        Loading deliberation for {runId}...
      </div>
    );
  }

  if (error || !runData) {
    return (
      <div
        style={{
          padding: '40px',
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-card)',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--loss)' }}>
          {error || 'Run details unavailable'}
        </span>
        <Link
          href="/archive"
          style={{
            padding: '8px 16px',
            backgroundColor: 'var(--surface-raised)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-input)',
            fontSize: '13px',
            textDecoration: 'none',
            color: 'var(--text)',
          }}
        >
          View Archive
        </Link>
      </div>
    );
  }

  const result = runData.result || {};
  const rounds = result.rounds || [];
  const runParams = runData.params || {};

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>
              Debate Arena: {runData.symbol}
            </h1>
            <span style={{ fontSize: '12px', color: 'var(--muted)', padding: '2px 8px', borderRadius: 'var(--radius-pill)', backgroundColor: 'var(--surface-raised)', border: '1px solid var(--border)' }}>
              {runId}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>
            <span>Strategy: <strong style={{ color: 'var(--text)' }}>{runParams.strategy || 'Swing'}</strong></span>
            <span>Rounds: <strong style={{ color: 'var(--text)' }}>{runParams.debate_rounds || 1}</strong></span>
            <span>Analysts: <strong style={{ color: 'var(--text)' }}>{(runParams.analysts || ['market', 'news']).join(', ')}</strong></span>
          </div>
        </div>

        {/* Back to Chart Secondary Button */}
        <Link
          href="/charts"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '7px 14px',
            borderRadius: 'var(--radius-input)',
            backgroundColor: 'var(--surface-raised)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
            fontSize: '13px',
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
          <span>Back to chart</span>
        </Link>
      </div>

      {/* Rounds Deliberation */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {rounds.map((rnd, i) => (
          <DebateRoundCard
            key={i}
            round={rnd.round || i + 1}
            bull={rnd.bull}
            bear={rnd.bear}
          />
        ))}
      </div>

      {/* Judge Verdict Card */}
      <VerdictCard
        rating={result.rating || 'HOLD'}
        rationale={result.rationale}
      />
    </div>
  );
}
