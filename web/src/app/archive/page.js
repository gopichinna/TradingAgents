'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useApp } from '../../context/AppContext';
import ArchiveRow from '../../components/ArchiveRow';

export default function ArchivePage() {
  const { archiveRevision } = useApp();
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterSymbol, setFilterSymbol] = useState('');

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    const url = filterSymbol.trim()
      ? `/api/v1/runs?symbol=${filterSymbol.trim()}`
      : '/api/v1/runs?limit=50';

    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (isMounted) {
          setRuns(data?.items || []);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to load archive runs', err);
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [filterSymbol, archiveRevision]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>
            Research Archive
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '2px' }}>
            Historical multi-agent research runs and consensus decisions
          </p>
        </div>

        {/* Quick filter by symbol */}
        <div style={{ width: '180px' }}>
          <input
            type="text"
            placeholder="Filter by symbol..."
            value={filterSymbol}
            onChange={(e) => setFilterSymbol(e.target.value)}
            style={{
              width: '100%',
              padding: '7px 12px',
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-input)',
              color: 'var(--text)',
              fontSize: '12px',
            }}
          />
        </div>
      </div>

      {loading ? (
        <div style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: '13px' }}>
          Loading archive runs...
        </div>
      ) : runs.length === 0 ? (
        <div
          style={{
            padding: '60px 20px',
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
          <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>
            No runs yet.
          </span>
          <p style={{ fontSize: '13px', color: 'var(--muted)' }}>
            Run your first research from Setup.
          </p>
          <Link
            href="/"
            style={{
              marginTop: '4px',
              padding: '8px 18px',
              backgroundColor: 'var(--accent)',
              color: 'var(--accent-contrast)',
              borderRadius: 'var(--radius-input)',
              fontSize: '13px',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Go to Setup
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {runs.map((r) => (
            <ArchiveRow key={r.run_id} run={r} />
          ))}
        </div>
      )}
    </div>
  );
}
