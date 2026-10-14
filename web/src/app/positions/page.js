'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useApp } from '../../context/AppContext';

function formatSignedUSD(amount) {
  if (amount == null || isNaN(amount)) return '—';
  const val = Number(amount);
  const formatted = Math.abs(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (val < 0) return `-$${formatted}`;
  if (val > 0) return `+$${formatted}`;
  return `$0.00`;
}

function formatUSD(amount) {
  if (amount == null || isNaN(amount)) return '—';
  const val = Number(amount);
  const formatted = Math.abs(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (val < 0) return `-$${formatted}`;
  return `$${formatted}`;
}

function PositionsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedSymbol, setSelectedSymbol, quote: appQuote } = useApp();

  // Data states
  const [account, setAccount] = useState(null);
  const [positions, setPositions] = useState([]);
  const [pendingOrders, setPendingOrders] = useState([]);
  const [tradeHistory, setTradeHistory] = useState([]);
  const [stats, setStats] = useState(null);
  const [equityPoints, setEquityPoints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Active tab in left panel: 'positions' | 'orders' | 'history'
  const [activeTab, setActiveTab] = useState('positions');

  // History filters
  const [histSymbol, setHistSymbol] = useState('');
  const [histFrom, setHistFrom] = useState('');
  const [histTo, setHistTo] = useState('');
  const [histResult, setHistResult] = useState('all');

  // Modals state
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetCapital, setResetCapital] = useState(10000);

  const [editPosModal, setEditPosModal] = useState(null); // position object or null
  const [editStop, setEditStop] = useState('');
  const [editTarget, setEditTarget] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const [sellPosModal, setSellPosModal] = useState(null); // position object or null
  const [sellQuantity, setSellQuantity] = useState('');

  // Order Ticket States
  const urlSymbol = searchParams.get('symbol') || selectedSymbol || 'NVDA';
  const urlStop = searchParams.get('stop') || '';
  const urlTarget = searchParams.get('target') || '';
  const urlHold = searchParams.get('hold') || '20';
  const urlSignalTag = searchParams.get('signal_tag') || '';

  const [orderSymbol, setOrderSymbol] = useState(urlSymbol.toUpperCase());
  const [orderSide, setOrderSide] = useState('BUY');
  const [orderType, setOrderType] = useState('MARKET');
  const [limitPrice, setLimitPrice] = useState('');

  // Quantity mode: 'shares' | 'amount' | 'risk_pct'
  const [qtyMode, setQtyMode] = useState('risk_pct');
  const [qtyShares, setQtyShares] = useState(10);
  const [qtyAmount, setQtyAmount] = useState(1000);
  const [qtyRiskPct, setQtyRiskPct] = useState(1.0);

  const [stopPrice, setStopPrice] = useState(urlStop);
  const [targetPrice, setTargetPrice] = useState(urlTarget);
  const [trailingType, setTrailingType] = useState('none');
  const [maxHoldDays, setMaxHoldDays] = useState(parseInt(urlHold, 10) || 20);
  const [signalTag, setSignalTag] = useState(urlSignalTag || 'Manual');
  const [orderNotes, setOrderNotes] = useState('');
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [orderSuccessMsg, setOrderSuccessMsg] = useState('');

  // Supported USD tickers
  const USD_TICKERS = ['NVDA', 'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'TSLA', 'META', 'DELL', 'AMD', 'PLTR', 'SPY', 'QQQ'];
  const isUsdSupported = USD_TICKERS.includes(orderSymbol.toUpperCase()) || (!orderSymbol.includes('.') && !orderSymbol.includes(':'));

  // Load all account and paper trading data
  const loadData = async () => {
    try {
      setError(null);
      const [accRes, posRes, ordRes, trdRes, statRes, eqRes] = await Promise.all([
        fetch('/api/v1/paper/account'),
        fetch('/api/v1/paper/positions'),
        fetch('/api/v1/paper/orders?status=pending'),
        fetch('/api/v1/paper/trades'),
        fetch('/api/v1/paper/stats'),
        fetch('/api/v1/paper/equity?range=1M'),
      ]);

      if (accRes.ok) setAccount(await accRes.json());
      if (posRes.ok) setPositions(await posRes.json());
      if (ordRes.ok) setPendingOrders(await ordRes.json());
      if (trdRes.ok) {
        const tJson = await trdRes.json();
        setTradeHistory(tJson.trades || []);
      }
      if (statRes.ok) setStats(await statRes.json());
      if (eqRes.ok) setEquityPoints(await eqRes.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 20000);
    return () => clearInterval(interval);
  }, []);

  // Update order ticket if query params change
  useEffect(() => {
    if (searchParams.get('symbol')) {
      const s = searchParams.get('symbol').toUpperCase();
      setOrderSymbol(s);
      setSelectedSymbol(s);
    }
    if (searchParams.get('stop')) setStopPrice(searchParams.get('stop'));
    if (searchParams.get('target')) setTargetPrice(searchParams.get('target'));
    if (searchParams.get('hold')) setMaxHoldDays(parseInt(searchParams.get('hold'), 10) || 20);
    if (searchParams.get('signal_tag')) setSignalTag(searchParams.get('signal_tag'));
  }, [searchParams]);

  // Live quote query for order ticket
  const [orderQuotePrice, setOrderQuotePrice] = useState(null);

  useEffect(() => {
    if (!orderSymbol) return;
    if (appQuote && appQuote.symbol === orderSymbol && appQuote.price) {
      setOrderQuotePrice(appQuote.price);
      return;
    }
    let isMounted = true;
    fetch(`/api/v1/instruments/${orderSymbol}/quote`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted && data?.price) {
          setOrderQuotePrice(data.price);
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [orderSymbol, appQuote]);

  // Derived current quote price using live quote as priority
  const lastPrice = useMemo(() => {
    if (orderQuotePrice) return parseFloat(orderQuotePrice);
    if (appQuote && appQuote.symbol === orderSymbol && appQuote.price) {
      return parseFloat(appQuote.price);
    }
    const existing = positions.find((p) => p.symbol === orderSymbol);
    if (existing && existing.last_price) return existing.last_price;
    return 100.0; // fallback preview price
  }, [orderQuotePrice, appQuote, positions, orderSymbol]);

  // Compute shares for preview: shares = (equity * risk%) / (entry - stop)
  const computedShares = useMemo(() => {
    const equity = account?.equity || 10000;
    const curP = parseFloat(limitPrice) || lastPrice || 100;

    if (qtyMode === 'shares') {
      return parseFloat(qtyShares) || 0;
    }
    if (qtyMode === 'amount') {
      return curP > 0 ? parseFloat((qtyAmount / curP).toFixed(2)) : 0;
    }
    if (qtyMode === 'risk_pct') {
      const stop = parseFloat(stopPrice);
      if (stop && stop < curP) {
        const dollarRisk = equity * (parseFloat(qtyRiskPct) / 100);
        const perShareRisk = curP - stop;
        return perShareRisk > 0 ? parseFloat((dollarRisk / perShareRisk).toFixed(2)) : 0;
      }
      return curP > 0 ? parseFloat(((equity * 0.10) / curP).toFixed(2)) : 0;
    }
    return 0;
  }, [qtyMode, qtyShares, qtyAmount, qtyRiskPct, stopPrice, limitPrice, lastPrice, account]);

  // Toggle Auto Paper Trading
  const handleToggleAutoTrading = async () => {
    try {
      const nextVal = !account?.auto_paper_trading;
      const res = await fetch('/api/v1/paper/auto-trading', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextVal }),
      });
      if (res.ok) {
        setAccount((prev) => (prev ? { ...prev, auto_paper_trading: nextVal } : prev));
        loadData();
      }
    } catch (e) {
      console.error(e);
    }
  };


  const estimatedCost = useMemo(() => {
    const curP = parseFloat(limitPrice) || lastPrice || 100;
    return computedShares * curP;
  }, [computedShares, limitPrice, lastPrice]);

  const costPctOfAccount = useMemo(() => {
    const eq = account?.equity || 10000;
    return eq > 0 ? ((estimatedCost / eq) * 100).toFixed(1) : '0';
  }, [estimatedCost, account]);

  const maxLoss = useMemo(() => {
    const curP = parseFloat(limitPrice) || lastPrice || 100;
    const stop = parseFloat(stopPrice);
    if (!stop || stop >= curP) return null;
    return (curP - stop) * computedShares;
  }, [limitPrice, lastPrice, stopPrice, computedShares]);

  const potentialGain = useMemo(() => {
    const curP = parseFloat(limitPrice) || lastPrice || 100;
    const target = parseFloat(targetPrice);
    if (!target || target <= curP) return null;
    return (target - curP) * computedShares;
  }, [limitPrice, lastPrice, targetPrice, computedShares]);

  const riskRewardRatio = useMemo(() => {
    if (maxLoss && potentialGain && maxLoss > 0) {
      return (potentialGain / maxLoss).toFixed(2);
    }
    return null;
  }, [maxLoss, potentialGain]);

  // Order submission
  const handleSubmitOrder = async (e) => {
    e.preventDefault();
    if (!isUsdSupported) {
      alert('Non-USD instruments are not supported in paper trading v1.');
      return;
    }

    setSubmittingOrder(true);
    setOrderSuccessMsg('');
    setError(null);

    const payload = {
      symbol: orderSymbol,
      side: orderSide,
      type: orderType,
      quantity: qtyMode === 'shares' ? parseFloat(qtyShares) : undefined,
      amount: qtyMode === 'amount' ? parseFloat(qtyAmount) : undefined,
      risk_pct: qtyMode === 'risk_pct' ? parseFloat(qtyRiskPct) : undefined,
      limit_price: orderType === 'LIMIT' ? parseFloat(limitPrice) : undefined,
      stop: stopPrice ? parseFloat(stopPrice) : undefined,
      target: targetPrice ? parseFloat(targetPrice) : undefined,
      trailing: trailingType !== 'none' ? trailingType : undefined,
      max_hold_days: parseInt(maxHoldDays, 10) || 20,
      signal_tag: signalTag || 'Manual',
      notes: orderNotes || undefined,
    };

    try {
      const res = await fetch('/api/v1/paper/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.detail || json.message || 'Failed to place order');
      }

      setOrderSuccessMsg(`✓ ${orderSide} order for ${orderSymbol} ${json.status.toLowerCase()}`);
      setTimeout(() => setOrderSuccessMsg(''), 4000);
      loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmittingOrder(false);
    }
  };

  // Close position handler
  const handleConfirmClose = async () => {
    if (!sellPosModal) return;
    try {
      const qty = sellQuantity ? parseFloat(sellQuantity) : undefined;
      const res = await fetch(`/api/v1/paper/positions/${sellPosModal.position_id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: qty }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to close position');
      }
      setSellPosModal(null);
      setSellQuantity('');
      loadData();
    } catch (e) {
      alert(e.message);
    }
  };

  // Save edit exits
  const handleSaveEditExits = async () => {
    if (!editPosModal) return;
    try {
      const res = await fetch(`/api/v1/paper/positions/${editPosModal.position_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stop: editStop ? parseFloat(editStop) : undefined,
          target: editTarget ? parseFloat(editTarget) : undefined,
          notes: editNotes || undefined,
        }),
      });
      if (!res.ok) throw new Error('Failed to update exits');
      setEditPosModal(null);
      loadData();
    } catch (e) {
      alert(e.message);
    }
  };

  // Cancel pending order
  const handleCancelOrder = async (orderId) => {
    if (!confirm('Are you sure you want to cancel this pending order?')) return;
    try {
      const res = await fetch(`/api/v1/paper/orders/${orderId}`, { method: 'DELETE' });
      if (res.ok) loadData();
    } catch (e) {
      alert(e.message);
    }
  };

  // Reset account handler
  const handleConfirmReset = async () => {
    try {
      const res = await fetch('/api/v1/paper/account/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ starting_cash: parseFloat(resetCapital) || 10000 }),
      });
      if (!res.ok) throw new Error('Failed to reset account');
      setShowResetModal(false);
      loadData();
    } catch (e) {
      alert(e.message);
    }
  };

  // Export CSV
  const handleExportCsv = () => {
    if (!tradeHistory.length) return;
    const headers = ['Trade ID', 'Symbol', 'Side', 'Shares', 'Entry Date', 'Entry Price', 'Exit Date', 'Exit Price', 'P&L ($)', 'P&L (%)', 'R Mult', 'Holding Days', 'Exit Reason', 'Signal Tag', 'Notes'];
    const rows = tradeHistory.map((t) => [
      t.trade_id,
      t.symbol,
      t.side,
      t.shares,
      t.entry_date,
      t.entry_price,
      t.exit_date,
      t.exit_price,
      t.pnl,
      t.pnl_pct,
      t.r_multiple,
      t.holding_days,
      `"${t.exit_reason}"`,
      `"${t.signal_tag || ''}"`,
      `"${t.notes || ''}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `paper_trades_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtered trade history
  const filteredTrades = useMemo(() => {
    return tradeHistory.filter((t) => {
      if (histSymbol && !t.symbol.toLowerCase().includes(histSymbol.toLowerCase())) return false;
      if (histFrom && t.exit_date < histFrom) return false;
      if (histTo && t.exit_date > histTo) return false;
      if (histResult === 'win' && t.pnl <= 0) return false;
      if (histResult === 'loss' && t.pnl > 0) return false;
      return true;
    });
  }, [tradeHistory, histSymbol, histFrom, histTo, histResult]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', paddingBottom: '40px' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', margin: 0 }}>
              Paper Trading Desk
            </h1>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--accent)',
                backgroundColor: 'var(--amber-bg)',
                border: '1px solid var(--amber-border)',
                padding: '2px 8px',
                borderRadius: 'var(--radius-pill)',
              }}
            >
              Virtual Account
            </span>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '4px', margin: 0 }}>
            Simulate trades, test multi-timeframe swing signals, set bracket OCO exits, and verify real forward performance.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={handleToggleAutoTrading}
            title="When ON, live Buy/Overweight agent signals automatically place bracketed orders"
            style={{
              padding: '7px 14px',
              backgroundColor: account?.auto_paper_trading ? 'rgba(34, 197, 94, 0.15)' : 'var(--surface-raised)',
              border: account?.auto_paper_trading ? '1px solid var(--gain-border)' : '1px solid var(--border)',
              borderRadius: 'var(--radius-input)',
              color: account?.auto_paper_trading ? 'var(--gain)' : 'var(--muted)',
              fontSize: '12.5px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>{account?.auto_paper_trading ? '🤖 Auto Trading: ON' : '🤖 Auto Trading: OFF'}</span>
          </button>

          <button
            onClick={() => setShowResetModal(true)}
            style={{
              padding: '7px 14px',
              backgroundColor: 'var(--surface-raised)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-input)',
              color: 'var(--muted)',
              fontSize: '12.5px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>↺ Reset Account</span>
          </button>
        </div>
      </div>

      {/* Top 6 Summary Cards: 6-cols desktop, 3-cols tablet, 2-cols mobile so Total Return never orphans */}
      <div
        className="positions-summary-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '14px',
        }}
      >
        <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-card)', padding: '16px' }}>
          <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase' }}>Total Equity</span>
          <div className="price-val" style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text)', marginTop: '4px' }}>
            {formatUSD(account?.equity || 10000)}
          </div>
          <span style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px', display: 'block' }}>USD Virtual Balance</span>
        </div>

        <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-card)', padding: '16px' }}>
          <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase' }}>Available Cash</span>
          <div className="price-val" style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text)', marginTop: '4px' }}>
            {formatUSD(account?.cash || 10000)}
          </div>
          <span style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px', display: 'block' }}>Unallocated purchasing power</span>
        </div>

        <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-card)', padding: '16px' }}>
          <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase' }}>Invested Capital</span>
          <div className="price-val" style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text)', marginTop: '4px' }}>
            {formatUSD(account?.invested || 0)}
          </div>
          <span style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px', display: 'block' }}>{positions.length} open position(s)</span>
        </div>

        <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-card)', padding: '16px' }}>
          <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase' }}>Open P&L</span>
          <div
            className="price-val"
            style={{
              fontSize: '22px',
              fontWeight: 800,
              marginTop: '4px',
              color: (account?.open_pnl || 0) >= 0 ? 'var(--gain)' : 'var(--loss)',
            }}
          >
            {formatSignedUSD(account?.open_pnl)}
          </div>
          <span style={{ fontSize: '11px', color: (account?.open_pnl_pct || 0) >= 0 ? 'var(--gain)' : 'var(--loss)' }}>
            {(account?.open_pnl_pct || 0) >= 0 ? '+' : ''}{account?.open_pnl_pct?.toFixed(2) || '0.00'}%
          </span>
        </div>

        <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-card)', padding: '16px' }}>
          <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase' }}>Realized P&L</span>
          <div
            className="price-val"
            style={{
              fontSize: '22px',
              fontWeight: 800,
              marginTop: '4px',
              color: (account?.realized_pnl || 0) >= 0 ? 'var(--gain)' : 'var(--loss)',
            }}
          >
            {formatSignedUSD(account?.realized_pnl)}
          </div>
          <span style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px', display: 'block' }}>Closed trades</span>
        </div>

        <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-card)', padding: '16px' }}>
          <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase' }}>Total Return</span>
          <div
            className="tabular-nums"
            style={{
              fontSize: '22px',
              fontWeight: 800,
              marginTop: '4px',
              color: (account?.total_return_pct || 0) >= 0 ? 'var(--gain)' : 'var(--loss)',
            }}
          >
            {(account?.total_return_pct || 0) >= 0 ? '+' : ''}{account?.total_return_pct?.toFixed(2) || '0.00'}%
          </div>
          <span style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px', display: 'block' }}>From $10,000 base</span>
        </div>
      </div>

      {/* Main Grid: Left Tabs (60%) + Right Order Ticket & Cards (40%) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.5fr) minmax(360px, 1fr)',
          gap: '24px',
          alignItems: 'start',
          width: '100%',
        }}
      >
        {/* ================= LEFT TABS AREA ================= */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
          {/* Tab Headers */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
            {[
              { key: 'positions', label: `Open Positions (${positions.length})` },
              { key: 'orders', label: `Pending Orders (${pendingOrders.length})` },
              { key: 'history', label: `Trade History (${tradeHistory.length})` },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 'var(--radius-pill)',
                  border: activeTab === tab.key ? '1px solid var(--amber-border)' : '1px solid transparent',
                  backgroundColor: activeTab === tab.key ? 'var(--amber-bg)' : 'transparent',
                  color: activeTab === tab.key ? 'var(--accent)' : 'var(--muted)',
                  fontWeight: activeTab === tab.key ? 700 : 500,
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* TAB 1: OPEN POSITIONS */}
          {activeTab === 'positions' && (
            <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-card)', padding: '16px', overflowX: 'auto' }}>
              {positions.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: '13px' }}>
                  No open positions. Place a trade from the order ticket or from a BUY signal on Charts.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontSize: '11px', textTransform: 'uppercase' }}>
                      <th style={{ padding: '8px' }}>Symbol</th>
                      <th style={{ padding: '8px' }}>Shares</th>
                      <th style={{ padding: '8px' }}>Avg Entry</th>
                      <th style={{ padding: '8px' }}>Last Price</th>
                      <th style={{ padding: '8px' }}>Market Val</th>
                      <th style={{ padding: '8px' }}>Unrealized P&L</th>
                      <th style={{ padding: '8px' }}>Stop Loss</th>
                      <th style={{ padding: '8px' }}>Target (2R)</th>
                      <th style={{ padding: '8px' }}>Hold (d)</th>
                      <th style={{ padding: '8px' }}>Signal</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((pos) => {
                      const isProfit = pos.unrealized_pnl >= 0;
                      return (
                        <tr key={pos.position_id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px 8px', fontWeight: 700, color: 'var(--accent)' }}>
                            <Link href={`/charts?tf=D&range=1Y`} style={{ color: 'inherit', textDecoration: 'none' }}>
                              {pos.symbol}
                            </Link>
                          </td>
                          <td style={{ padding: '10px 8px', fontFamily: 'monospace' }}>{pos.shares}</td>
                          <td style={{ padding: '10px 8px', fontFamily: 'monospace' }}>${pos.avg_entry?.toFixed(2)}</td>
                          <td style={{ padding: '10px 8px', fontFamily: 'monospace' }}>${pos.last_price?.toFixed(2)}</td>
                          <td style={{ padding: '10px 8px', fontFamily: 'monospace' }}>${pos.market_value?.toFixed(2)}</td>
                          <td style={{ padding: '10px 8px', fontFamily: 'monospace', fontWeight: 700, color: isProfit ? 'var(--gain)' : 'var(--loss)' }}>
                            {formatSignedUSD(pos.unrealized_pnl)} ({isProfit ? '+' : ''}{pos.unrealized_pnl_pct?.toFixed(2)}%)
                          </td>
                          <td style={{ padding: '10px 8px', fontFamily: 'monospace', color: 'var(--loss)' }}>
                            {pos.stop_price ? `$${pos.stop_price.toFixed(2)} (${pos.dist_stop_pct}%)` : 'None'}
                          </td>
                          <td style={{ padding: '10px 8px', fontFamily: 'monospace', color: 'var(--gain)' }}>
                            {pos.target_price ? `$${pos.target_price.toFixed(2)} (+${pos.dist_target_pct}%)` : 'None'}
                          </td>
                          <td style={{ padding: '10px 8px' }}>{pos.days_held}d</td>
                          <td style={{ padding: '10px 8px', fontSize: '11px', color: 'var(--muted)', maxWidth: '120px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {pos.signal_tag}
                          </td>
                          <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: '6px' }}>
                              <button
                                onClick={() => {
                                  setEditPosModal(pos);
                                  setEditStop(pos.stop_price || '');
                                  setEditTarget(pos.target_price || '');
                                  setEditNotes(pos.notes || '');
                                }}
                                style={{ padding: '4px 8px', fontSize: '11px', borderRadius: '4px', border: '1px solid var(--border)', backgroundColor: 'var(--surface-raised)', color: 'var(--text)', cursor: 'pointer' }}
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => {
                                  setSellPosModal(pos);
                                  setSellQuantity(pos.shares);
                                }}
                                style={{ padding: '4px 8px', fontSize: '11px', borderRadius: '4px', border: '1px solid var(--loss-border)', backgroundColor: 'var(--loss-bg)', color: 'var(--loss)', cursor: 'pointer', fontWeight: 600 }}
                              >
                                Close
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* TAB 2: PENDING ORDERS */}
          {activeTab === 'orders' && (
            <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-card)', padding: '16px', overflowX: 'auto' }}>
              {pendingOrders.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: '13px' }}>
                  No pending limit or bracket orders.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontSize: '11px', textTransform: 'uppercase' }}>
                      <th style={{ padding: '8px' }}>Symbol</th>
                      <th style={{ padding: '8px' }}>Side</th>
                      <th style={{ padding: '8px' }}>Type</th>
                      <th style={{ padding: '8px' }}>Quantity</th>
                      <th style={{ padding: '8px' }}>Limit Price</th>
                      <th style={{ padding: '8px' }}>Stop</th>
                      <th style={{ padding: '8px' }}>Target</th>
                      <th style={{ padding: '8px' }}>Placed Date</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingOrders.map((ord) => (
                      <tr key={ord.order_id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 8px', fontWeight: 700, color: 'var(--accent)' }}>{ord.symbol}</td>
                        <td style={{ padding: '10px 8px', fontWeight: 700, color: ord.side === 'BUY' ? 'var(--gain)' : 'var(--loss)' }}>{ord.side}</td>
                        <td style={{ padding: '10px 8px' }}>{ord.order_type}</td>
                        <td style={{ padding: '10px 8px', fontFamily: 'monospace' }}>{ord.quantity}</td>
                        <td style={{ padding: '10px 8px', fontFamily: 'monospace' }}>${ord.limit_price?.toFixed(2) || '—'}</td>
                        <td style={{ padding: '10px 8px', fontFamily: 'monospace', color: 'var(--loss)' }}>${ord.stop_price?.toFixed(2) || '—'}</td>
                        <td style={{ padding: '10px 8px', fontFamily: 'monospace', color: 'var(--gain)' }}>${ord.target_price?.toFixed(2) || '—'}</td>
                        <td style={{ padding: '10px 8px', fontSize: '11px', color: 'var(--muted)' }}>{ord.placed_at?.slice(0, 16)}</td>
                        <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                          <button
                            onClick={() => handleCancelOrder(ord.order_id)}
                            style={{ padding: '4px 8px', fontSize: '11px', borderRadius: '4px', border: '1px solid var(--loss-border)', backgroundColor: 'var(--loss-bg)', color: 'var(--loss)', cursor: 'pointer' }}
                          >
                            Cancel
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* TAB 3: TRADE HISTORY */}
          {activeTab === 'history' && (
            <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-card)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Filters & Export CSV row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    placeholder="Filter Symbol"
                    value={histSymbol}
                    onChange={(e) => setHistSymbol(e.target.value)}
                    style={{ padding: '5px 8px', fontSize: '12px', backgroundColor: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text)', width: '100px' }}
                  />
                  <select
                    value={histResult}
                    onChange={(e) => setHistResult(e.target.value)}
                    style={{ padding: '5px 8px', fontSize: '12px', backgroundColor: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text)' }}
                  >
                    <option value="all">All Results</option>
                    <option value="win">Wins Only</option>
                    <option value="loss">Losses Only</option>
                  </select>
                </div>

                <button
                  onClick={handleExportCsv}
                  disabled={!tradeHistory.length}
                  style={{
                    padding: '5px 12px',
                    fontSize: '12px',
                    borderRadius: 'var(--radius-input)',
                    backgroundColor: 'var(--surface-raised)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
                    cursor: tradeHistory.length ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <span>⬇ Export CSV</span>
                </button>
              </div>

              {filteredTrades.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: '13px' }}>
                  No closed trades yet.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontSize: '11px', textTransform: 'uppercase' }}>
                        <th style={{ padding: '8px' }}>Symbol</th>
                        <th style={{ padding: '8px' }}>Entry Date</th>
                        <th style={{ padding: '8px' }}>Entry Price</th>
                        <th style={{ padding: '8px' }}>Exit Date</th>
                        <th style={{ padding: '8px' }}>Exit Price</th>
                        <th style={{ padding: '8px' }}>Shares</th>
                        <th style={{ padding: '8px' }}>P&L ($)</th>
                        <th style={{ padding: '8px' }}>P&L (%)</th>
                        <th style={{ padding: '8px' }}>R Multiple</th>
                        <th style={{ padding: '8px' }}>Exit Reason</th>
                        <th style={{ padding: '8px' }}>Signal Tag</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTrades.map((t) => {
                        const isWin = t.pnl >= 0;
                        return (
                          <tr key={t.trade_id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '8px', fontWeight: 700, color: 'var(--accent)' }}>{t.symbol}</td>
                            <td style={{ padding: '8px', fontFamily: 'monospace' }}>{t.entry_date}</td>
                            <td style={{ padding: '8px', fontFamily: 'monospace' }}>${t.entry_price?.toFixed(2)}</td>
                            <td style={{ padding: '8px', fontFamily: 'monospace' }}>{t.exit_date}</td>
                            <td style={{ padding: '8px', fontFamily: 'monospace' }}>${t.exit_price?.toFixed(2)}</td>
                            <td style={{ padding: '8px', fontFamily: 'monospace' }}>{t.shares}</td>
                            <td style={{ padding: '8px', fontFamily: 'monospace', fontWeight: 700, color: isWin ? 'var(--gain)' : 'var(--loss)' }}>
                              {formatSignedUSD(t.pnl)}
                            </td>
                            <td style={{ padding: '8px', fontFamily: 'monospace', fontWeight: 700, color: isWin ? 'var(--gain)' : 'var(--loss)' }}>
                              {isWin ? '+' : ''}{t.pnl_pct?.toFixed(2)}%
                            </td>
                            <td style={{ padding: '8px', fontFamily: 'monospace' }}>{t.r_multiple > 0 ? '+' : ''}{t.r_multiple}R</td>
                            <td style={{ padding: '8px', fontSize: '11px' }}>
                              <span style={{ padding: '2px 6px', borderRadius: '4px', backgroundColor: t.exit_reason === 'Target hit' ? 'var(--gain-bg)' : 'var(--loss-bg)', color: t.exit_reason === 'Target hit' ? 'var(--gain)' : 'var(--loss)' }}>
                                {t.exit_reason}
                              </span>
                            </td>
                            <td style={{ padding: '8px', fontSize: '11px', color: 'var(--muted)', maxWidth: '140px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {t.signal_tag}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Educational "How fills work" Card */}
          <div
            style={{
              backgroundColor: 'var(--surface-raised)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-card)',
              padding: '16px 20px',
            }}
          >
            <h4 style={{ fontSize: '12px', fontWeight: 700, margin: '0 0 6px 0', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              How Simulated Fills Work
            </h4>
            <p style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: '1.6', margin: 0 }}>
              • <strong>Market orders:</strong> Fill at the latest quote price plus {account?.slippage_bps || 5} bps slippage. Delayed data, simulated fills.<br />
              • <strong>Limit orders:</strong> Fill when the market trades through the limit price, filled at the exact limit without price improvement.<br />
              • <strong>Stops & Targets (OCO):</strong> Evaluated using the session high and low. If both stop and target are touched within the same bar, the stop is conservatively assumed hit first. Gap-opens beyond the stop fill at the bar Open.<br />
              • <strong>Time stops & Trailing stops:</strong> Evaluated at the daily bar close and filled at the next session's open.
            </p>
          </div>
        </div>

        {/* ================= RIGHT PANEL: ORDER TICKET & STATS ================= */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', minWidth: 0 }}>
          {/* Order Ticket Card */}
          <div
            style={{
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-card)',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Order Ticket
              </span>
              <span style={{ fontSize: '10.5px', color: 'var(--accent)', backgroundColor: 'var(--amber-bg)', border: '1px solid var(--amber-border)', padding: '2px 6px', borderRadius: 'var(--radius-pill)' }}>
                Delayed data, simulated fills
              </span>
            </div>

            <form onSubmit={handleSubmitOrder} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Symbol input & Quick Selector */}
              <div>
                <label style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>Instrument (USD Only)</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    type="text"
                    value={orderSymbol}
                    onChange={(e) => {
                      const s = e.target.value.toUpperCase();
                      setOrderSymbol(s);
                      setSelectedSymbol(s);
                    }}
                    style={{
                      flex: 1,
                      backgroundColor: 'var(--surface-raised)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-input)',
                      color: 'var(--text)',
                      padding: '6px 10px',
                      fontSize: '13px',
                      fontWeight: 700,
                      outline: 'none',
                    }}
                  />
                </div>

                {!isUsdSupported && (
                  <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--loss)', backgroundColor: 'var(--loss-bg)', border: '1px solid var(--loss-border)', padding: '4px 8px', borderRadius: '4px' }}>
                    ⚠️ Not supported in paper account yet (USD instruments only).
                  </div>
                )}
              </div>

              {/* Side (Buy/Sell) & Order Type (Market/Limit) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div style={{ display: 'flex', padding: '2px', backgroundColor: 'var(--surface-raised)', borderRadius: 'var(--radius-input)', border: '1px solid var(--border)' }}>
                  <button
                    type="button"
                    onClick={() => setOrderSide('BUY')}
                    style={{
                      flex: 1,
                      border: 'none',
                      borderRadius: 'var(--radius-input)',
                      padding: '6px',
                      fontSize: '12px',
                      fontWeight: 700,
                      backgroundColor: orderSide === 'BUY' ? 'var(--gain)' : 'transparent',
                      color: orderSide === 'BUY' ? '#ffffff' : 'var(--muted)',
                      cursor: 'pointer',
                    }}
                  >
                    Buy (Long)
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrderSide('SELL')}
                    style={{
                      flex: 1,
                      border: 'none',
                      borderRadius: 'var(--radius-input)',
                      padding: '6px',
                      fontSize: '12px',
                      fontWeight: 700,
                      backgroundColor: orderSide === 'SELL' ? 'var(--loss)' : 'transparent',
                      color: orderSide === 'SELL' ? '#ffffff' : 'var(--muted)',
                      cursor: 'pointer',
                    }}
                  >
                    Sell
                  </button>
                </div>

                <div style={{ display: 'flex', padding: '2px', backgroundColor: 'var(--surface-raised)', borderRadius: 'var(--radius-input)', border: '1px solid var(--border)' }}>
                  <button
                    type="button"
                    onClick={() => setOrderType('MARKET')}
                    style={{
                      flex: 1,
                      border: 'none',
                      borderRadius: 'var(--radius-input)',
                      padding: '6px',
                      fontSize: '12px',
                      fontWeight: 700,
                      backgroundColor: orderType === 'MARKET' ? 'var(--amber-bg)' : 'transparent',
                      color: orderType === 'MARKET' ? 'var(--accent)' : 'var(--muted)',
                      cursor: 'pointer',
                    }}
                  >
                    Market
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrderType('LIMIT')}
                    style={{
                      flex: 1,
                      border: 'none',
                      borderRadius: 'var(--radius-input)',
                      padding: '6px',
                      fontSize: '12px',
                      fontWeight: 700,
                      backgroundColor: orderType === 'LIMIT' ? 'var(--amber-bg)' : 'transparent',
                      color: orderType === 'LIMIT' ? 'var(--accent)' : 'var(--muted)',
                      cursor: 'pointer',
                    }}
                  >
                    Limit
                  </button>
                </div>
              </div>

              {orderType === 'LIMIT' && (
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>Limit Price ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder={`e.g. ${lastPrice.toFixed(2)}`}
                    value={limitPrice}
                    onChange={(e) => setLimitPrice(e.target.value)}
                    style={{ width: '100%', padding: '6px 10px', fontSize: '12.5px', backgroundColor: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 'var(--radius-input)', color: 'var(--text)' }}
                  />
                </div>
              )}

              {/* Sizing Mode Selection: Shares, Dollar Amount, or Risk % */}
              <div style={{ backgroundColor: 'var(--surface-raised)', padding: '12px', borderRadius: 'var(--radius-input)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600 }}>Quantity Sizing</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {['risk_pct', 'shares', 'amount'].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setQtyMode(m)}
                        style={{
                          border: 'none',
                          padding: '3px 6px',
                          fontSize: '10px',
                          fontWeight: qtyMode === m ? 700 : 500,
                          borderRadius: '4px',
                          backgroundColor: qtyMode === m ? 'var(--amber-bg)' : 'transparent',
                          color: qtyMode === m ? 'var(--accent)' : 'var(--muted)',
                          cursor: 'pointer',
                        }}
                      >
                        {m === 'risk_pct' ? 'Risk %' : m === 'shares' ? 'Shares' : '$ Amount'}
                      </button>
                    ))}
                  </div>
                </div>

                {qtyMode === 'risk_pct' && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', color: 'var(--muted)', marginBottom: '2px' }}>
                      <span>Risk: {qtyRiskPct}% of Equity</span>
                      <span>Formula: (Equity × {qtyRiskPct}%) / (Entry - Stop)</span>
                    </div>
                    <input
                      type="number"
                      step="0.25"
                      min="0.25"
                      max="10"
                      value={qtyRiskPct}
                      onChange={(e) => setQtyRiskPct(parseFloat(e.target.value) || 1)}
                      style={{ width: '100%', padding: '6px 10px', fontSize: '12px', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text)' }}
                    />
                  </div>
                )}

                {qtyMode === 'shares' && (
                  <input
                    type="number"
                    step="1"
                    min="0.1"
                    value={qtyShares}
                    onChange={(e) => setQtyShares(parseFloat(e.target.value) || 0)}
                    placeholder="Number of shares"
                    style={{ width: '100%', padding: '6px 10px', fontSize: '12px', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text)' }}
                  />
                )}

                {qtyMode === 'amount' && (
                  <input
                    type="number"
                    step="50"
                    min="10"
                    value={qtyAmount}
                    onChange={(e) => setQtyAmount(parseFloat(e.target.value) || 0)}
                    placeholder="Dollar amount to buy"
                    style={{ width: '100%', padding: '6px 10px', fontSize: '12px', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text)' }}
                  />
                )}

                {/* Sizing calculation summary */}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text)', borderTop: '1px solid var(--border)', paddingTop: '6px' }}>
                  <span>Shares: <strong>{computedShares}</strong></span>
                  <span>Cost: <strong>${estimatedCost.toFixed(2)}</strong></span>
                  <span>Account: <strong>{costPctOfAccount}%</strong></span>
                </div>
              </div>

              {/* Bracket Exits: Stop Loss & Take Profit (OCO) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', color: 'var(--muted)', marginBottom: '2px' }}>
                    <span>Stop Loss ($)</span>
                    <button
                      type="button"
                      onClick={() => setStopPrice((lastPrice * 0.95).toFixed(2))}
                      style={{ border: 'none', background: 'none', color: 'var(--accent)', fontSize: '9.5px', cursor: 'pointer', padding: 0 }}
                    >
                      -5%
                    </button>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Price"
                    value={stopPrice}
                    onChange={(e) => setStopPrice(e.target.value)}
                    style={{ width: '100%', padding: '6px 10px', fontSize: '12px', backgroundColor: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--loss)' }}
                  />
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', color: 'var(--muted)', marginBottom: '2px' }}>
                    <span>Take Profit ($)</span>
                    <button
                      type="button"
                      onClick={() => setTargetPrice((lastPrice * 1.10).toFixed(2))}
                      style={{ border: 'none', background: 'none', color: 'var(--accent)', fontSize: '9.5px', cursor: 'pointer', padding: 0 }}
                    >
                      +10%
                    </button>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Price"
                    value={targetPrice}
                    onChange={(e) => setTargetPrice(e.target.value)}
                    style={{ width: '100%', padding: '6px 10px', fontSize: '12px', backgroundColor: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--gain)' }}
                  />
                </div>
              </div>

              {/* Trailing Stop & Max Hold Days */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={{ fontSize: '10.5px', color: 'var(--muted)', display: 'block', marginBottom: '2px' }}>Trailing Stop</label>
                  <select
                    value={trailingType}
                    onChange={(e) => setTrailingType(e.target.value)}
                    style={{ width: '100%', padding: '6px', fontSize: '11.5px', backgroundColor: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text)' }}
                  >
                    <option value="none">Disabled</option>
                    <option value="atr">2x ATR Multiple</option>
                    <option value="ema21">Close below 21 EMA</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '10.5px', color: 'var(--muted)', display: 'block', marginBottom: '2px' }}>Max Hold (Days)</label>
                  <input
                    type="number"
                    value={maxHoldDays}
                    onChange={(e) => setMaxHoldDays(e.target.value)}
                    style={{ width: '100%', padding: '6px 10px', fontSize: '12px', backgroundColor: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text)' }}
                  />
                </div>
              </div>

              {/* Signal Tag Display / Input */}
              <div>
                <label style={{ fontSize: '10.5px', color: 'var(--muted)', display: 'block', marginBottom: '2px' }}>Signal Tag</label>
                <input
                  type="text"
                  value={signalTag}
                  onChange={(e) => setSignalTag(e.target.value)}
                  style={{ width: '100%', padding: '4px 8px', fontSize: '11px', backgroundColor: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text)' }}
                />
              </div>

              {/* Live Preview & Warnings Box */}
              <div style={{ backgroundColor: 'var(--surface-raised)', padding: '10px', borderRadius: 'var(--radius-input)', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--muted)' }}>Max Risk / Loss:</span>
                  <strong style={{ color: 'var(--loss)' }}>{maxLoss ? `-$${maxLoss.toFixed(2)}` : 'Undefined'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--muted)' }}>Potential Gain (2R):</span>
                  <strong style={{ color: 'var(--gain)' }}>{potentialGain ? `+$${potentialGain.toFixed(2)}` : 'Undefined'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--muted)' }}>Risk:Reward:</span>
                  <strong style={{ color: riskRewardRatio && parseFloat(riskRewardRatio) >= 1.5 ? 'var(--gain)' : 'var(--text)' }}>
                    {riskRewardRatio ? `1:${riskRewardRatio}` : '—'}
                  </strong>
                </div>

                {/* Warnings */}
                {riskRewardRatio && parseFloat(riskRewardRatio) < 1.5 && (
                  <span style={{ color: 'var(--loss)', marginTop: '2px' }}>⚠️ Risk:Reward is under 1.5.</span>
                )}
                {parseFloat(costPctOfAccount) > 30 && (
                  <span style={{ color: 'var(--accent)', marginTop: '2px' }}>⚠️ Position exceeds 30% of account equity.</span>
                )}
                {estimatedCost > (account?.cash || 10000) && (
                  <span style={{ color: 'var(--loss)', marginTop: '2px' }}>⚠️ Insufficient cash for this order size.</span>
                )}
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={submittingOrder || !isUsdSupported}
                style={{
                  padding: '12px',
                  backgroundColor: !isUsdSupported ? 'var(--surface-raised)' : orderSide === 'BUY' ? 'var(--gain)' : 'var(--loss)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 'var(--radius-input)',
                  fontWeight: 700,
                  fontSize: '13.5px',
                  cursor: submittingOrder || !isUsdSupported ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                {submittingOrder ? 'Submitting...' : `Submit ${orderSide} Order (${computedShares} shares)`}
              </button>

              {orderSuccessMsg && (
                <div style={{ color: 'var(--gain)', fontSize: '11.5px', textAlign: 'center', fontWeight: 600 }}>
                  {orderSuccessMsg}
                </div>
              )}
            </form>
          </div>

          {/* Equity Curve vs Benchmark SPY Card */}
          <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-card)', padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)' }}>Equity Curve vs SPY Benchmark</span>
              <div style={{ display: 'flex', gap: '10px', fontSize: '10.5px' }}>
                <span style={{ color: 'var(--accent)' }}>● Paper Portfolio</span>
                <span style={{ color: 'var(--muted)' }}>--- SPY Hold</span>
              </div>
            </div>

            {equityPoints.length > 0 ? (
              <div style={{ width: '100%', height: '140px' }}>
                <svg viewBox="0 0 400 140" style={{ width: '100%', height: '100%', overflow: 'visible' }} preserveAspectRatio="none">
                  {(() => {
                    const allVals = equityPoints.flatMap((p) => [p.equity, p.benchmark]);
                    const maxVal = Math.max(...allVals, 10500);
                    const minVal = Math.min(...allVals, 9500);
                    const span = maxVal - minVal || 1;

                    const getY = (v) => 130 - ((v - minVal) / span) * 120;
                    const getX = (idx) => (idx / (equityPoints.length - 1 || 1)) * 400;

                    const stratPath = equityPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(p.equity)}`).join(' ');
                    const benchPath = equityPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(p.benchmark)}`).join(' ');

                    return (
                      <>
                        <path d={benchPath} fill="none" stroke="var(--muted)" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
                        <path d={stratPath} fill="none" stroke="var(--accent)" strokeWidth="2" />
                      </>
                    );
                  })()}
                </svg>
              </div>
            ) : (
              <div style={{ height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: '11px' }}>
                No equity history yet
              </div>
            )}
          </div>

          {/* Performance Statistics Card */}
          <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-card)', padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)' }}>Account Performance Metrics</span>
              {!stats?.has_enough_trades && (
                <span style={{ fontSize: '10.5px', color: 'var(--muted)', fontStyle: 'italic' }}>
                  Need at least 20 closed trades for meaningful stats
                </span>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '11.5px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '4px' }}>
                <span style={{ color: 'var(--muted)' }}>Win Rate:</span>
                <strong>{stats?.win_rate || 0}%</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '4px' }}>
                <span style={{ color: 'var(--muted)' }}>Profit Factor:</span>
                <strong>{stats?.profit_factor || 0}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '4px' }}>
                <span style={{ color: 'var(--muted)' }}>Avg Win / Loss:</span>
                <strong>+${stats?.avg_win || 0} / -${Math.abs(stats?.avg_loss || 0)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '4px' }}>
                <span style={{ color: 'var(--muted)' }}>Expectancy / Trade:</span>
                <strong style={{ color: (stats?.expectancy || 0) >= 0 ? 'var(--gain)' : 'var(--loss)' }}>
                  {(stats?.expectancy || 0) >= 0 ? '+' : ''}${stats?.expectancy || 0}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '4px' }}>
                <span style={{ color: 'var(--muted)' }}>Average R Multiple:</span>
                <strong>{stats?.avg_r || 0}R</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '4px' }}>
                <span style={{ color: 'var(--muted)' }}>Avg Holding Days:</span>
                <strong>{stats?.avg_holding_days || 0} d</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '4px' }}>
                <span style={{ color: 'var(--muted)' }}>Best / Worst Trade:</span>
                <strong>+${stats?.best_trade || 0} / ${stats?.worst_trade || 0}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '4px' }}>
                <span style={{ color: 'var(--muted)' }}>Total Closed Trades:</span>
                <strong>{stats?.total_trades || 0}</strong>
              </div>
            </div>
          </div>

          {/* Agent vs Rules vs Manual Strategy Comparison Card */}
          <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-card)', padding: '16px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: '8px' }}>
              Strategy Comparison: Agent vs. Rules vs. Manual
            </span>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', textAlign: 'left' }}>
                <thead>
                  <tr style={{ color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '4px 6px' }}>Source</th>
                    <th style={{ padding: '4px 6px' }}>Trades</th>
                    <th style={{ padding: '4px 6px' }}>Win Rate</th>
                    <th style={{ padding: '4px 6px' }}>Avg R</th>
                    <th style={{ padding: '4px 6px' }}>Total P&L</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px', fontWeight: 600, color: 'var(--accent)' }}>🤖 Agent Signals</td>
                    <td style={{ padding: '6px' }}>{stats?.signal_comparison?.agent_trades || 0}</td>
                    <td style={{ padding: '6px' }}>{stats?.signal_comparison?.agent_win_rate || 0}%</td>
                    <td style={{ padding: '6px' }}>{stats?.signal_comparison?.agent_avg_r || 0}R</td>
                    <td style={{ padding: '6px', fontWeight: 700, color: (stats?.signal_comparison?.agent_total_pnl || 0) >= 0 ? 'var(--gain)' : 'var(--loss)' }}>
                      {formatSignedUSD(stats?.signal_comparison?.agent_total_pnl || 0)}
                    </td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px', fontWeight: 600, color: 'var(--gain)' }}>⚡ Rules Signals</td>
                    <td style={{ padding: '6px' }}>{stats?.signal_comparison?.rules_trades || 0}</td>
                    <td style={{ padding: '6px' }}>{stats?.signal_comparison?.rules_win_rate || 0}%</td>
                    <td style={{ padding: '6px' }}>{stats?.signal_comparison?.rules_avg_r || 0}R</td>
                    <td style={{ padding: '6px', fontWeight: 700, color: (stats?.signal_comparison?.rules_total_pnl || 0) >= 0 ? 'var(--gain)' : 'var(--loss)' }}>
                      {formatSignedUSD(stats?.signal_comparison?.rules_total_pnl || 0)}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '6px', fontWeight: 600, color: 'var(--muted)' }}>✎ Manual Trades</td>
                    <td style={{ padding: '6px' }}>{stats?.signal_comparison?.manual_trades || 0}</td>
                    <td style={{ padding: '6px' }}>{stats?.signal_comparison?.manual_win_rate || 0}%</td>
                    <td style={{ padding: '6px' }}>{stats?.signal_comparison?.manual_avg_r || 0}R</td>
                    <td style={{ padding: '6px', fontWeight: 700, color: (stats?.signal_comparison?.manual_total_pnl || 0) >= 0 ? 'var(--gain)' : 'var(--loss)' }}>
                      {formatSignedUSD(stats?.signal_comparison?.manual_total_pnl || 0)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Backtest vs Paper Results Card */}
          <div style={{ backgroundColor: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 'var(--radius-card)', padding: '14px 16px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '6px' }}>
              Backtest vs. Paper Forward Results
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11.5px' }}>
              <div>
                <span style={{ fontSize: '10px', color: 'var(--muted)' }}>Backtest Win Rate</span>
                <div style={{ fontWeight: 700 }}>43.1% (In-Sample)</div>
              </div>
              <div>
                <span style={{ fontSize: '10px', color: 'var(--muted)' }}>Paper Win Rate</span>
                <div style={{ fontWeight: 700, color: (stats?.win_rate || 0) >= 43 ? 'var(--gain)' : 'var(--text)' }}>
                  {stats?.win_rate || 0}%
                </div>
              </div>
              <div>
                <span style={{ fontSize: '10px', color: 'var(--muted)' }}>Backtest Expectancy</span>
                <div style={{ fontWeight: 700 }}>+0.34% / trade</div>
              </div>
              <div>
                <span style={{ fontSize: '10px', color: 'var(--muted)' }}>Paper Expectancy</span>
                <div style={{ fontWeight: 700, color: (stats?.expectancy || 0) >= 0 ? 'var(--gain)' : 'var(--loss)' }}>
                  ${stats?.expectancy || 0}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ================= MODALS ================= */}

      {/* 1. Reset Account Modal */}
      {showResetModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-card)', padding: '24px', width: '380px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>Reset Paper Account?</h3>
            <p style={{ fontSize: '12.5px', color: 'var(--muted)', lineHeight: '1.5', margin: 0 }}>
              Resetting will archive all active open positions, trade history, and equity snapshots for this run. Your previous history is safely preserved and will not be deleted.
            </p>

            <div>
              <label style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>Starting Balance ($)</label>
              <input
                type="number"
                value={resetCapital}
                onChange={(e) => setResetCapital(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', fontSize: '13px', backgroundColor: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 'var(--radius-input)', color: 'var(--text)' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
              <button
                onClick={() => setShowResetModal(false)}
                style={{ padding: '7px 14px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border)', backgroundColor: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontSize: '12.5px' }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReset}
                style={{ padding: '7px 14px', borderRadius: 'var(--radius-input)', border: 'none', backgroundColor: 'var(--loss)', color: '#ffffff', fontWeight: 700, cursor: 'pointer', fontSize: '12.5px' }}
              >
                Archive & Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Edit Stop & Target Modal */}
      {editPosModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-card)', padding: '24px', width: '360px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
              Edit Exits: {editPosModal.symbol}
            </h3>

            <div>
              <label style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>Stop Loss ($)</label>
              <input
                type="number"
                step="0.01"
                value={editStop}
                onChange={(e) => setEditStop(e.target.value)}
                style={{ width: '100%', padding: '6px 10px', fontSize: '12.5px', backgroundColor: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 'var(--radius-input)', color: 'var(--loss)' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>Take Profit Target ($)</label>
              <input
                type="number"
                step="0.01"
                value={editTarget}
                onChange={(e) => setEditTarget(e.target.value)}
                style={{ width: '100%', padding: '6px 10px', fontSize: '12.5px', backgroundColor: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 'var(--radius-input)', color: 'var(--gain)' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>Trade Notes</label>
              <textarea
                rows={2}
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                style={{ width: '100%', padding: '6px 10px', fontSize: '12px', backgroundColor: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 'var(--radius-input)', color: 'var(--text)', resize: 'none' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setEditPosModal(null)}
                style={{ padding: '6px 12px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border)', backgroundColor: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontSize: '12px' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEditExits}
                style={{ padding: '6px 14px', borderRadius: 'var(--radius-input)', border: 'none', backgroundColor: 'var(--accent)', color: '#000000', fontWeight: 700, cursor: 'pointer', fontSize: '12px' }}
              >
                Save Exits
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Sell / Partial Close Modal */}
      {sellPosModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-card)', padding: '24px', width: '360px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
              Close Position: {sellPosModal.symbol}
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--muted)', margin: 0 }}>
              You currently hold <strong>{sellPosModal.shares}</strong> shares. You can close all or a partial quantity.
            </p>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>
                <span>Shares to Sell</span>
                <button
                  onClick={() => setSellQuantity(sellPosModal.shares)}
                  style={{ border: 'none', background: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0 }}
                >
                  Sell All ({sellPosModal.shares})
                </button>
              </div>
              <input
                type="number"
                step="0.01"
                max={sellPosModal.shares}
                value={sellQuantity}
                onChange={(e) => setSellQuantity(e.target.value)}
                style={{ width: '100%', padding: '6px 10px', fontSize: '13px', backgroundColor: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 'var(--radius-input)', color: 'var(--text)' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setSellPosModal(null)}
                style={{ padding: '6px 12px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border)', backgroundColor: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontSize: '12px' }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmClose}
                style={{ padding: '6px 14px', borderRadius: 'var(--radius-input)', border: 'none', backgroundColor: 'var(--loss)', color: '#ffffff', fontWeight: 700, cursor: 'pointer', fontSize: '12px' }}
              >
                Confirm Market Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PositionsPage() {
  return (
    <Suspense fallback={<div style={{ padding: '40px', color: 'var(--muted)' }}>Loading paper trading desk...</div>}>
      <PositionsContent />
    </Suspense>
  );
}
