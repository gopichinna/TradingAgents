'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '../context/AppContext';

export default function RunProgressModal() {
  const router = useRouter();
  const { runModalOpen, setRunModalOpen, runConfig, notifyRunCompleted } = useApp();

  const [runId, setRunId] = useState(null);
  const [overallStatus, setOverallStatus] = useState('initializing'); // initializing, running, completed, failed
  const [errorMessage, setErrorMessage] = useState(null);
  const [failedStep, setFailedStep] = useState(null);
  const [completedVerdict, setCompletedVerdict] = useState(null);
  const [minimized, setMinimized] = useState(false);
  const [showFinishedToast, setShowFinishedToast] = useState(false);

  // Steps state
  const [steps, setSteps] = useState([]);
  const eventSourceRef = useRef(null);
  const pollingRef = useRef(null);

  const analysts = runConfig.analysts || ['market', 'news', 'fundamentals'];

  // Initialize step definitions when modal opens
  useEffect(() => {
    if (!runModalOpen) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }

    const initialSteps = analysts.map((a) => ({
      id: a,
      label: `${a.charAt(0).toUpperCase() + a.slice(1)} analyst`,
      status: 'waiting',
      detail: 'Waiting to start...',
      progress: 0,
    }));

    initialSteps.push({
      id: 'debate',
      label: 'Bull and bear debate',
      status: 'waiting',
      detail: 'Waiting for analysts...',
      progress: 0,
    });

    initialSteps.push({
      id: 'verdict',
      label: 'Judge verdict',
      status: 'waiting',
      detail: 'Waiting for debate...',
      progress: 0,
    });

    setSteps(initialSteps);
    setOverallStatus('initializing');
    setErrorMessage(null);
    setFailedStep(null);
    setCompletedVerdict(null);
    setMinimized(false);
    setShowFinishedToast(false);

    // Launch the run
    startRun();
  }, [runModalOpen]);

  const startRun = async () => {
    try {
      setOverallStatus('running');
      const res = await fetch('/api/v1/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: runConfig.symbol,
          analysis_date: runConfig.analysis_date || undefined,
          strategy: runConfig.strategy || 'swing',
          analysts: runConfig.analysts || ['market', 'news', 'fundamentals'],
          debate_rounds: runConfig.debate_rounds || 1,
          book_id: runConfig.book_id || null,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error?.message || 'Failed to start research run');
      }

      const data = await res.json();
      const newRunId = data.run_id;
      setRunId(newRunId);

      // Start SSE Stream
      listenToEvents(newRunId);
    } catch (err) {
      setOverallStatus('failed');
      setErrorMessage(err.message);
      setFailedStep('Initialization');
    }
  };

  const listenToEvents = (id) => {
    if (typeof EventSource === 'undefined') {
      startPolling(id);
      return;
    }

    const es = new EventSource(`/api/v1/runs/${id}/events`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        handleStepUpdate(payload, id);
      } catch (e) {
        console.error('SSE JSON parse error', e);
      }
    };

    es.onerror = () => {
      if (es) es.close();
      startPolling(id);
    };
  };

  const startPolling = (id) => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/v1/runs/${id}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.steps) {
          data.steps.forEach((st) => {
            handleStepUpdate(
              {
                step: st.step,
                status: st.status,
                detail: st.detail,
                progress: st.progress,
              },
              id
            );
          });
        }
        if (data.status === 'completed') {
          handleStepUpdate({ status: 'complete', result: data.result }, id);
        } else if (data.status === 'failed') {
          handleStepUpdate({ status: 'failed', error: data.error }, id);
        }
      } catch (err) {
        console.error('Polling error', err);
      }
    }, 1500);
  };

  const handleStepUpdate = (payload, id) => {
    if (payload.status === 'complete') {
      if (eventSourceRef.current) eventSourceRef.current.close();
      if (pollingRef.current) clearInterval(pollingRef.current);

      setOverallStatus('completed');
      setCompletedVerdict(payload.result?.rating || 'Decision Ready');
      notifyRunCompleted(id);
      setShowFinishedToast(true);
      return;
    }

    if (payload.status === 'failed') {
      if (eventSourceRef.current) eventSourceRef.current.close();
      if (pollingRef.current) clearInterval(pollingRef.current);

      setOverallStatus('failed');
      setErrorMessage(payload.error || 'A problem occurred during research execution.');
      setFailedStep(payload.step || 'Execution');
      return;
    }

    // Update specific step
    setSteps((prev) =>
      prev.map((s) => {
        if (s.id === payload.step) {
          return {
            ...s,
            status: payload.status,
            detail: payload.detail || s.detail,
            progress: payload.progress || s.progress,
          };
        }
        return s;
      })
    );
  };

  // If finished, show non-blocking notification toast popup
  if (showFinishedToast && runId) {
    return (
      <div
        role="alert"
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--accent)',
          borderRadius: 'var(--radius-card)',
          padding: '16px 20px',
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.4)',
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          maxWidth: '420px',
        }}
      >
        <div
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            backgroundColor: 'var(--gain-bg)',
            border: '1px solid var(--gain-border)',
            color: 'var(--gain)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
          }}
        >
          ✓
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>
            Research Complete: {runConfig.symbol}
          </span>
          <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
            Verdict: <strong style={{ color: 'var(--accent)' }}>{completedVerdict || 'Completed'}</strong>
          </span>
        </div>

        <button
          onClick={() => {
            setShowFinishedToast(false);
            setRunModalOpen(false);
            router.push(`/debate/${runId}`);
          }}
          style={{
            backgroundColor: 'var(--accent)',
            color: 'var(--accent-contrast)',
            border: 'none',
            borderRadius: 'var(--radius-input)',
            padding: '7px 12px',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Open Debate
        </button>

        <button
          onClick={() => {
            setShowFinishedToast(false);
            setRunModalOpen(false);
          }}
          aria-label="Dismiss toast"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--muted)',
            cursor: 'pointer',
            fontSize: '14px',
            padding: '2px',
          }}
        >
          ✕
        </button>
      </div>
    );
  }

  if (!runModalOpen) return null;

  // Render NON-BLOCKING floating background widget (bottom right)
  return (
    <aside
      aria-label="Background research progress"
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        width: minimized ? '260px' : '380px',
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-card)',
        boxShadow: '0 16px 40px rgba(0, 0, 0, 0.35)',
        zIndex: 90,
        overflow: 'hidden',
        transition: 'all 0.2s ease',
      }}
    >
      {/* Header with Minimize & Close */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          backgroundColor: 'var(--surface-raised)',
          borderBottom: minimized ? 'none' : '1px solid var(--border)',
          cursor: 'pointer',
        }}
        onClick={() => setMinimized(!minimized)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: overallStatus === 'failed' ? 'var(--loss)' : 'var(--accent)',
              display: 'inline-block',
            }}
          />
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>
            Researching: {runConfig.symbol}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setMinimized(!minimized)}
            aria-label={minimized ? 'Maximize progress' : 'Minimize progress'}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--muted)',
              cursor: 'pointer',
              fontSize: '13px',
              padding: '2px 4px',
            }}
          >
            {minimized ? '▲' : '▼'}
          </button>
          <button
            onClick={() => setRunModalOpen(false)}
            aria-label="Close widget"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--muted)',
              cursor: 'pointer',
              fontSize: '13px',
              padding: '2px 4px',
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {!minimized && (
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '380px', overflowY: 'auto' }}>
          <div style={{ fontSize: '11px', color: 'var(--muted)', display: 'flex', justifyContent: 'space-between' }}>
            <span>Running in background (non-blocking)</span>
            <span style={{ textTransform: 'uppercase', fontWeight: 600, color: 'var(--accent)' }}>
              {overallStatus}
            </span>
          </div>

          {/* Steps List */}
          {steps.map((st) => {
            const isDone = st.status === 'done';
            const isRunning = st.status === 'running';
            const isFailed = st.status === 'failed';

            return (
              <div
                key={st.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  padding: '8px 10px',
                  backgroundColor: 'var(--surface-raised)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-input)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
                    {st.label}
                  </span>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      color: isDone ? 'var(--gain)' : isRunning ? 'var(--accent)' : isFailed ? 'var(--loss)' : 'var(--muted)',
                    }}
                  >
                    {st.status}
                  </span>
                </div>

                {/* Progress bar */}
                <div style={{ width: '100%', height: '2px', backgroundColor: 'var(--border)', borderRadius: '1px', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: isDone ? '100%' : isRunning ? '60%' : '0%',
                      backgroundColor: isDone ? 'var(--gain)' : isFailed ? 'var(--loss)' : 'var(--accent)',
                      transition: 'width 0.4s ease',
                    }}
                  />
                </div>
              </div>
            );
          })}

          {/* Failure message */}
          {overallStatus === 'failed' && (
            <div
              style={{
                padding: '8px 10px',
                backgroundColor: 'var(--loss-bg)',
                border: '1px solid var(--loss-border)',
                borderRadius: 'var(--radius-input)',
                fontSize: '11px',
                color: 'var(--loss)',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <span>Failed at: {failedStep}</span>
              <p>{errorMessage}</p>
              <button
                onClick={startRun}
                style={{
                  alignSelf: 'flex-start',
                  backgroundColor: 'var(--loss)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '4px 10px',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                Retry
              </button>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
