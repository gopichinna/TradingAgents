'use client';

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  // Precedence: URL query param ?symbol= -> localStorage 'ta_symbol' -> default 'NVDA'
  const [selectedSymbol, setSelectedSymbolState] = useState('NVDA');
  const [theme, setThemeState] = useState('dark');
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState(null);

  // In-flight abort controller
  const abortControllerRef = useRef(null);

  // Symbol revision counter to trigger dependent state clears
  const [symbolRevision, setSymbolRevision] = useState(0);

  // Run modal state
  const [runModalOpen, setRunModalOpen] = useState(false);
  const [activeRunId, setActiveRunId] = useState(null);
  const [runConfig, setRunConfig] = useState({
    symbol: 'NVDA',
    analysis_date: '',
    strategy: 'swing',
    analysts: ['market', 'news', 'fundamentals'],
    debate_rounds: 1,
    book_id: null,
  });

  // Archive refresh counter
  const [archiveRevision, setArchiveRevision] = useState(0);

  // 1. Initial hydration and URL sync
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Theme initialization
    const savedTheme = localStorage.getItem('ta_theme');
    if (savedTheme) {
      setThemeState(savedTheme);
      document.documentElement.setAttribute('data-theme', savedTheme);
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const initial = prefersDark ? 'dark' : 'light';
      setThemeState(initial);
      document.documentElement.setAttribute('data-theme', initial);
    }

    // URL ?symbol= precedence > localStorage > default
    const urlParams = new URLSearchParams(window.location.search);
    const urlSymbol = urlParams.get('symbol');
    const savedSymbol = localStorage.getItem('ta_symbol');

    let initialSym = 'NVDA';
    if (urlSymbol && urlSymbol.trim()) {
      initialSym = urlSymbol.trim().toUpperCase();
    } else if (savedSymbol && savedSymbol.trim()) {
      initialSym = savedSymbol.trim().toUpperCase();
    }

    setSelectedSymbolState(initialSym);
    setRunConfig((prev) => ({ ...prev, symbol: initialSym }));
    localStorage.setItem('ta_symbol', initialSym);

    // Ensure URL has ?symbol= parameter
    const currentUrl = new URL(window.location.href);
    if (!currentUrl.searchParams.has('symbol') || currentUrl.searchParams.get('symbol') !== initialSym) {
      currentUrl.searchParams.set('symbol', initialSym);
      window.history.replaceState({}, '', currentUrl.toString());
    }

    // Record to recents
    try {
      const existing = JSON.parse(localStorage.getItem('ta_recent_symbols') || '[]');
      const updated = [initialSym, ...existing.filter((s) => s !== initialSym)].slice(0, 8);
      localStorage.setItem('ta_recent_symbols', JSON.stringify(updated));
    } catch (_) {}

    // Listen for browser Back/Forward (popstate)
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const symFromUrl = params.get('symbol');
      if (symFromUrl && symFromUrl.toUpperCase() !== selectedSymbol) {
        const s = symFromUrl.toUpperCase();
        setSelectedSymbolState(s);
        setRunConfig((prev) => ({ ...prev, symbol: s }));
        localStorage.setItem('ta_symbol', s);
        setSymbolRevision((prev) => prev + 1);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // 2. Canonical symbol switcher writing both Store and URL
  const setSelectedSymbol = useCallback(
    (newSymbol, skipPrompt = false) => {
      if (!newSymbol) return false;
      const cleanSym = newSymbol.trim().toUpperCase();
      if (cleanSym === selectedSymbol) return true;

      // Ask confirmation if a research run is active
      if (!skipPrompt && (runModalOpen || activeRunId)) {
        const proceed = window.confirm(
          `A multi-agent research deliberation is in progress. Switching to ${cleanSym} will cancel the current run view. Proceed?`
        );
        if (!proceed) return false;
        setActiveRunId(null);
        setRunModalOpen(false);
      }

      // Cancel any in-flight fetch requests
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      // Clear dependent state
      setSelectedSymbolState(cleanSym);
      setRunConfig((prev) => ({ ...prev, symbol: cleanSym }));
      setSymbolRevision((prev) => prev + 1);

      // Write to localStorage & recents
      if (typeof window !== 'undefined') {
        localStorage.setItem('ta_symbol', cleanSym);
        try {
          const existing = JSON.parse(localStorage.getItem('ta_recent_symbols') || '[]');
          const updated = [cleanSym, ...existing.filter((s) => s !== cleanSym)].slice(0, 8);
          localStorage.setItem('ta_recent_symbols', JSON.stringify(updated));
        } catch (_) {}

        // Mirror to URL
        const url = new URL(window.location.href);
        url.searchParams.set('symbol', cleanSym);
        window.history.pushState({}, '', url.toString());
      }

      return true;
    },
    [selectedSymbol, runModalOpen, activeRunId]
  );

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setThemeState(nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
    if (typeof window !== 'undefined') {
      localStorage.setItem('ta_theme', nextTheme);
    }
  };

  // 3. Shared live quote query used by every page
  useEffect(() => {
    if (!selectedSymbol) return;

    let isMounted = true;
    const fetchQuote = async () => {
      setQuoteLoading(true);
      try {
        const res = await fetch(`/api/v1/instruments/${selectedSymbol}/quote`);
        if (!res.ok) throw new Error('Failed to fetch live quote');
        const data = await res.json();
        if (isMounted) {
          setQuote(data);
          setQuoteError(null);
        }
      } catch (err) {
        if (isMounted && err.name !== 'AbortError') setQuoteError(err.message);
      } finally {
        if (isMounted) setQuoteLoading(false);
      }
    };

    fetchQuote();
    const interval = setInterval(fetchQuote, 25000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [selectedSymbol]);

  // Start research run trigger
  const triggerRun = (overrideConfig = {}) => {
    const finalConfig = {
      ...runConfig,
      symbol: selectedSymbol,
      ...overrideConfig,
    };
    setRunConfig(finalConfig);
    setRunModalOpen(true);
  };

  const notifyRunCompleted = (runId) => {
    setArchiveRevision((prev) => prev + 1);
  };

  return (
    <AppContext.Provider
      value={{
        selectedSymbol,
        setSelectedSymbol,
        symbolRevision,
        theme,
        toggleTheme,
        quote,
        quoteLoading,
        quoteError,
        runModalOpen,
        setRunModalOpen,
        activeRunId,
        setActiveRunId,
        runConfig,
        setRunConfig,
        triggerRun,
        archiveRevision,
        notifyRunCompleted,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
