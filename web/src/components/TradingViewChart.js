'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  createSeriesMarkers,
} from 'lightweight-charts';
import { useApp } from '../context/AppContext';

export default function TradingViewChart({ symbol = 'NVDA', onToggleSignals, signalsOpen = true }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { theme } = useApp();

  // Read state from URL query or defaults
  const initialTf = searchParams.get('tf') || 'D';
  const initialRange = searchParams.get('range') || '1Y';

  const [tf, setTf] = useState(initialTf);
  const [range, setRange] = useState(initialRange);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Indicator toggles (stored in state / query)
  const [overlays, setOverlays] = useState({
    sma20: true,
    sma50: true,
    sma200: true,
    ema21: false,
    bb: true,
    crosses: true,
    d200OnAll: true,
  });

  const [panes, setPanes] = useState({
    volume: true,
    rsi: true,
    macd: false,
    atr: false,
    adx: false,
  });

  // Crosshair readout state
  const [readout, setReadout] = useState(null);
  const [activeTooltip, setActiveTooltip] = useState(null);

  // Chart container refs
  const priceChartContainerRef = useRef(null);
  const rsiChartContainerRef = useRef(null);
  const macdChartContainerRef = useRef(null);
  const atrChartContainerRef = useRef(null);
  const adxChartContainerRef = useRef(null);

  const priceChartRef = useRef(null);
  const rsiChartRef = useRef(null);
  const macdChartRef = useRef(null);
  const atrChartRef = useRef(null);
  const adxChartRef = useRef(null);

  // Sync state to URL
  const updateUrlParams = (newTf, newRange) => {
    const params = new URLSearchParams(searchParams.toString());
    if (symbol) params.set('symbol', symbol);
    params.set('tf', newTf);
    params.set('range', newRange);
    router.replace(`/charts?${params.toString()}`, { scroll: false });
  };

  const handleTfChange = (newTf) => {
    setTf(newTf);
    updateUrlParams(newTf, range);
  };

  const handleRangeChange = (newRange) => {
    setRange(newRange);
    updateUrlParams(tf, newRange);
  };

  const [paperData, setPaperData] = useState({ positions: [], trades: [] });

  // Fetch candle data and paper trade markers
  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    Promise.all([
      fetch(`/api/v1/instruments/${symbol}/candles?tf=${tf}&range=${range}`).then((r) => r.ok ? r.json() : null),
      fetch('/api/v1/paper/positions').then((r) => r.ok ? r.json() : []),
      fetch(`/api/v1/paper/trades?symbol=${symbol}`).then((r) => r.ok ? r.json() : { trades: [] }),
    ])
      .then(([candleJson, posJson, tradeJson]) => {
        if (!isMounted) return;
        if (!candleJson) throw new Error('Failed to load chart candles');
        setData(candleJson);
        const myPositions = Array.isArray(posJson) ? posJson.filter((p) => p.symbol === symbol.toUpperCase()) : [];
        const myTrades = tradeJson?.trades || [];
        setPaperData({ positions: myPositions, trades: myTrades });
        setLoading(false);
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
  }, [symbol, tf, range]);

  // Render / Update Lightweight-Charts
  useEffect(() => {
    if (!data || !priceChartContainerRef.current) return;

    // Theme color tokens
    const isDark = theme === 'dark';
    const bgCol = isDark ? '#141c19' : '#ffffff';
    const borderCol = isDark ? '#26332e' : '#dcdfdc';
    const textCol = isDark ? '#e6ece8' : '#14201c';
    const mutedCol = isDark ? '#8a9890' : '#637069';

    const safeRemoveChart = (chartRef) => {
      if (chartRef && chartRef.current) {
        try {
          chartRef.current.remove();
        } catch (e) {
          // Object might already be disposed
        }
        chartRef.current = null;
      }
    };

    // Clean up previous chart instances safely
    safeRemoveChart(priceChartRef);
    safeRemoveChart(rsiChartRef);
    safeRemoveChart(macdChartRef);
    safeRemoveChart(atrChartRef);
    safeRemoveChart(adxChartRef);

    // Ensure DOM containers are clean before creating new charts
    if (priceChartContainerRef.current) priceChartContainerRef.current.innerHTML = '';
    if (rsiChartContainerRef.current) rsiChartContainerRef.current.innerHTML = '';
    if (macdChartContainerRef.current) macdChartContainerRef.current.innerHTML = '';
    if (atrChartContainerRef.current) atrChartContainerRef.current.innerHTML = '';
    if (adxChartContainerRef.current) adxChartContainerRef.current.innerHTML = '';

    // 1. Create Main Price Chart
    const priceChart = createChart(priceChartContainerRef.current, {
      width: priceChartContainerRef.current.clientWidth,
      height: 440,
      layout: {
        background: { color: bgCol },
        textColor: mutedCol,
        fontFamily: 'Instrument Sans, sans-serif',
      },
      grid: {
        vertLines: { color: borderCol, style: 2 },
        horzLines: { color: borderCol, style: 2 },
      },
      timeScale: {
        borderColor: borderCol,
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: borderCol,
      },
      crosshair: {
        vertLine: { color: mutedCol, width: 1, style: 3 },
        horzLine: { color: mutedCol, width: 1, style: 3 },
      },
    });
    priceChartRef.current = priceChart;

    // Candlestick Series
    const candleSeries = priceChart.addSeries(CandlestickSeries, {
      upColor: isDark ? '#3ddba7' : '#0b7d5e',
      downColor: isDark ? '#ff7a63' : '#c2432f',
      borderVisible: false,
      wickUpColor: isDark ? '#3ddba7' : '#0b7d5e',
      wickDownColor: isDark ? '#ff7a63' : '#c2432f',
    });

    const candleData = data.candles.map((c) => ({
      time: c.t,
      open: c.o,
      high: c.h,
      low: c.l,
      close: c.c,
    }));
    candleSeries.setData(candleData);

    // Overlays: SMA 20, SMA 50, SMA 200, EMA 21, Bollinger Bands
    if (overlays.sma20) {
      const s20 = priceChart.addSeries(LineSeries, {
        color: isDark ? '#f0b04a' : '#b86a00',
        lineWidth: 1.5,
        title: 'SMA 20',
      });
      s20.setData(
        data.candles
          .map((c, i) => ({ time: c.t, value: data.sma20[i] }))
          .filter((d) => d.value !== null && d.value !== undefined)
      );
    }

    if (overlays.sma50) {
      const s50 = priceChart.addSeries(LineSeries, {
        color: '#06b6d4',
        lineWidth: 1.5,
        title: 'SMA 50',
      });
      s50.setData(
        data.candles
          .map((c, i) => ({ time: c.t, value: data.sma50[i] }))
          .filter((d) => d.value !== null && d.value !== undefined)
      );
    }

    if (overlays.sma200) {
      // 200 SMA: Thicker line, distinct purple
      const s200 = priceChart.addSeries(LineSeries, {
        color: '#a855f7',
        lineWidth: 2.5,
        title: 'SMA 200',
      });
      s200.setData(
        data.candles
          .map((c, i) => ({ time: c.t, value: data.sma200[i] }))
          .filter((d) => d.value !== null && d.value !== undefined)
      );
    }

    // Toggle: 200-day MA on all timeframes (shows daily 200 SMA on W and M)
    if (tf !== 'D' && overlays.d200OnAll && data.d200_sma) {
      const d200Series = priceChart.addSeries(LineSeries, {
        color: '#ec4899',
        lineWidth: 2,
        lineStyle: 2,
        title: '200-Day SMA',
      });
      d200Series.setData(
        data.candles
          .map((c, i) => ({ time: c.t, value: data.d200_sma[i] }))
          .filter((d) => d.value !== null && d.value !== undefined)
      );
    }

    if (overlays.ema21) {
      const e21 = priceChart.addSeries(LineSeries, {
        color: '#10b981',
        lineWidth: 1.5,
        title: 'EMA 21',
      });
      e21.setData(
        data.candles
          .map((c, i) => ({ time: c.t, value: data.ema21[i] }))
          .filter((d) => d.value !== null && d.value !== undefined)
      );
    }

    if (overlays.bb) {
      const bbU = priceChart.addSeries(LineSeries, {
        color: isDark ? '#6cb8e0' : '#2a6f97',
        lineWidth: 1,
        lineStyle: 2,
        title: 'BB Upper',
      });
      const bbL = priceChart.addSeries(LineSeries, {
        color: isDark ? '#6cb8e0' : '#2a6f97',
        lineWidth: 1,
        lineStyle: 2,
        title: 'BB Lower',
      });
      bbU.setData(
        data.candles
          .map((c, i) => ({ time: c.t, value: data.bb_upper[i] }))
          .filter((d) => d.value !== null && d.value !== undefined)
      );
      bbL.setData(
        data.candles
          .map((c, i) => ({ time: c.t, value: data.bb_lower[i] }))
          .filter((d) => d.value !== null && d.value !== undefined)
      );
    }

    // Overlay Volume on Price Chart (bottom 20%)
    if (panes.volume) {
      const volSeries = priceChart.addSeries(HistogramSeries, {
        color: isDark ? 'rgba(108, 184, 224, 0.25)' : 'rgba(42, 111, 151, 0.25)',
        priceFormat: { type: 'volume' },
        priceScaleId: '', // overlay
      });
      priceChart.priceScale('').applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
      });
      volSeries.setData(
        data.candles.map((c, i) => ({
          time: c.t,
          value: c.v,
          color: c.c >= c.o ? (isDark ? 'rgba(61, 219, 167, 0.25)' : 'rgba(11, 125, 94, 0.25)') : (isDark ? 'rgba(255, 122, 99, 0.25)' : 'rgba(194, 67, 47, 0.25)'),
        }))
      );
    }

    // Series Markers: Buy / Sell with Tooltip Reason
    const markers = [];
    if (data.signals) {
      data.signals.forEach((s) => {
        markers.push({
          time: s.t,
          position: s.side === 'B' ? 'belowBar' : 'aboveBar',
          color: s.side === 'B' ? (isDark ? '#3ddba7' : '#0b7d5e') : (isDark ? '#ff7a63' : '#c2432f'),
          shape: s.side === 'B' ? 'arrowUp' : 'arrowDown',
          text: s.side,
          size: 1.5,
          reason: s.reason,
        });
      });
    }

    // Golden / Death Cross Markers
    if (overlays.crosses) {
      if (data.golden_crosses) {
        data.golden_crosses.forEach((gc) => {
          markers.push({
            time: gc.t,
            position: 'belowBar',
            color: '#f0b04a',
            shape: 'circle',
            text: 'Golden Cross',
            size: 2,
            reason: 'Golden Cross: 50 SMA crossed above 200 SMA',
          });
        });
      }
      if (data.death_crosses) {
        data.death_crosses.forEach((dc) => {
          markers.push({
            time: dc.t,
            position: 'aboveBar',
            color: '#ff7a63',
            shape: 'circle',
            text: 'Death Cross',
            size: 2,
            reason: 'Death Cross: 50 SMA crossed below 200 SMA',
          });
        });
      }
    }

    // Paper Trading Open Positions: Horizontal Entry, Stop, and Target lines
    if (paperData.positions && paperData.positions.length > 0) {
      paperData.positions.forEach((p) => {
        if (p.avg_entry) {
          candleSeries.createPriceLine({
            price: p.avg_entry,
            color: '#06b6d4',
            lineWidth: 2,
            lineStyle: 2,
            axisLabelVisible: true,
            title: `Paper Entry (${p.shares} sh)`,
          });
        }
        if (p.stop_price) {
          candleSeries.createPriceLine({
            price: p.stop_price,
            color: '#ff7a63',
            lineWidth: 1.5,
            lineStyle: 3,
            axisLabelVisible: true,
            title: 'Paper Stop',
          });
        }
        if (p.target_price) {
          candleSeries.createPriceLine({
            price: p.target_price,
            color: '#3ddba7',
            lineWidth: 1.5,
            lineStyle: 3,
            axisLabelVisible: true,
            title: 'Paper Target',
          });
        }

        markers.push({
          time: p.entry_date,
          position: 'belowBar',
          color: '#06b6d4',
          shape: 'arrowUp',
          text: 'P-Open',
          size: 2,
          reason: `Open Paper Trade: ${p.shares} shares @ $${p.avg_entry} (${p.signal_tag || 'Manual'})`,
        });
      });
    }

    // Past Paper Trades
    if (paperData.trades && paperData.trades.length > 0) {
      paperData.trades.forEach((t) => {
        markers.push({
          time: t.exit_date,
          position: 'aboveBar',
          color: t.pnl >= 0 ? '#3ddba7' : '#ff7a63',
          shape: 'arrowDown',
          text: 'P-Exit',
          size: 1.5,
          reason: `Paper Exit (${t.exit_reason}): ${t.shares} sh @ $${t.exit_price} | P&L: ${t.pnl >= 0 ? '+' : ''}$${t.pnl}`,
        });
      });
    }

    if (markers.length > 0) {
      // Sort markers by time
      markers.sort((a, b) => (a.time > b.time ? 1 : -1));
      createSeriesMarkers(candleSeries, markers);
    }

    // 2. Synced Sub-Panes: RSI 14
    if (panes.rsi && rsiChartContainerRef.current) {
      const rsiChart = createChart(rsiChartContainerRef.current, {
        width: rsiChartContainerRef.current.clientWidth,
        height: 120,
        layout: { background: { color: bgCol }, textColor: mutedCol, fontFamily: 'Instrument Sans' },
        grid: { vertLines: { color: borderCol, style: 2 }, horzLines: { color: borderCol, style: 2 } },
        timeScale: { borderColor: borderCol, visible: false },
        rightPriceScale: { borderColor: borderCol },
      });
      rsiChartRef.current = rsiChart;

      const rsiSeries = rsiChart.addSeries(LineSeries, { color: '#a855f7', lineWidth: 1.5, title: 'RSI 14' });
      rsiSeries.setData(
        data.candles
          .map((c, i) => ({ time: c.t, value: data.rsi14[i] }))
          .filter((d) => d.value !== null && d.value !== undefined)
      );

      // 30 / 70 guide lines
      const rsi70 = rsiChart.addSeries(LineSeries, { color: 'rgba(255, 122, 99, 0.4)', lineWidth: 1, lineStyle: 2 });
      const rsi30 = rsiChart.addSeries(LineSeries, { color: 'rgba(61, 219, 167, 0.4)', lineWidth: 1, lineStyle: 2 });
      rsi70.setData(data.candles.map((c) => ({ time: c.t, value: 70 })));
      rsi30.setData(data.candles.map((c) => ({ time: c.t, value: 30 })));

      // Sync time scale
      priceChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        rsiChart.timeScale().setVisibleLogicalRange(range);
      });
    }

    // 3. Synced Sub-Panes: MACD (12, 26, 9)
    if (panes.macd && macdChartContainerRef.current) {
      const macdChart = createChart(macdChartContainerRef.current, {
        width: macdChartContainerRef.current.clientWidth,
        height: 120,
        layout: { background: { color: bgCol }, textColor: mutedCol, fontFamily: 'Instrument Sans' },
        grid: { vertLines: { color: borderCol, style: 2 }, horzLines: { color: borderCol, style: 2 } },
        timeScale: { borderColor: borderCol, visible: false },
        rightPriceScale: { borderColor: borderCol },
      });
      macdChartRef.current = macdChart;

      const macdLine = macdChart.addSeries(LineSeries, { color: '#06b6d4', lineWidth: 1.5, title: 'MACD' });
      const signalLine = macdChart.addSeries(LineSeries, { color: '#f59e0b', lineWidth: 1.5, title: 'Signal' });
      const histSeries = macdChart.addSeries(HistogramSeries, { title: 'Hist' });

      macdLine.setData(
        data.candles
          .map((c, i) => ({ time: c.t, value: data.macd[i] }))
          .filter((d) => d.value !== null && d.value !== undefined)
      );
      signalLine.setData(
        data.candles
          .map((c, i) => ({ time: c.t, value: data.macd_signal[i] }))
          .filter((d) => d.value !== null && d.value !== undefined)
      );
      histSeries.setData(
        data.candles
          .map((c, i) => ({
            time: c.t,
            value: data.macd_hist[i],
            color: (data.macd_hist[i] || 0) >= 0 ? '#3ddba7' : '#ff7a63',
          }))
          .filter((d) => d.value !== null && d.value !== undefined)
      );

      priceChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        macdChart.timeScale().setVisibleLogicalRange(range);
      });
    }

    // 4. Synced Sub-Pane: ATR (14)
    if (panes.atr && atrChartContainerRef.current) {
      const atrChart = createChart(atrChartContainerRef.current, {
        width: atrChartContainerRef.current.clientWidth,
        height: 120,
        layout: { background: { color: bgCol }, textColor: mutedCol, fontFamily: 'Instrument Sans' },
        grid: { vertLines: { color: borderCol, style: 2 }, horzLines: { color: borderCol, style: 2 } },
        timeScale: { borderColor: borderCol, visible: false },
        rightPriceScale: { borderColor: borderCol },
      });
      atrChartRef.current = atrChart;

      const atrLine = atrChart.addSeries(LineSeries, { color: '#f97316', lineWidth: 1.5, title: 'ATR 14' });
      atrLine.setData(
        data.candles
          .map((c, i) => ({ time: c.t, value: data.atr14[i] }))
          .filter((d) => d.value !== null && d.value !== undefined)
      );

      priceChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        atrChart.timeScale().setVisibleLogicalRange(range);
      });
    }

    // 5. Synced Sub-Pane: ADX (14)
    if (panes.adx && adxChartContainerRef.current) {
      const adxChart = createChart(adxChartContainerRef.current, {
        width: adxChartContainerRef.current.clientWidth,
        height: 120,
        layout: { background: { color: bgCol }, textColor: mutedCol, fontFamily: 'Instrument Sans' },
        grid: { vertLines: { color: borderCol, style: 2 }, horzLines: { color: borderCol, style: 2 } },
        timeScale: { borderColor: borderCol, visible: false },
        rightPriceScale: { borderColor: borderCol },
      });
      adxChartRef.current = adxChart;

      const adxLine = adxChart.addSeries(LineSeries, { color: '#38bdf8', lineWidth: 1.5, title: 'ADX 14' });
      adxLine.setData(
        data.candles
          .map((c, i) => ({ time: c.t, value: data.adx14[i] }))
          .filter((d) => d.value !== null && d.value !== undefined)
      );

      // 25 Trend threshold guide line
      const adx25 = adxChart.addSeries(LineSeries, { color: 'rgba(245, 158, 11, 0.4)', lineWidth: 1, lineStyle: 2 });
      adx25.setData(data.candles.map((c) => ({ time: c.t, value: 25 })));

      priceChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        adxChart.timeScale().setVisibleLogicalRange(range);
      });
    }

    // Crosshair Sync & Readout Listener
    priceChart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData.get(candleSeries)) {
        setReadout(null);
        setActiveTooltip(null);
        return;
      }

      const barData = param.seriesData.get(candleSeries);
      const matchIdx = data.candles.findIndex((c) => c.t === param.time);
      if (matchIdx !== -1) {
        const c = data.candles[matchIdx];
        setReadout({
          date: c.t,
          open: c.o,
          high: c.h,
          low: c.l,
          close: c.c,
          volume: c.v,
          sma20: data.sma20?.[matchIdx],
          sma50: data.sma50?.[matchIdx],
          sma200: data.sma200?.[matchIdx],
          rsi14: data.rsi14?.[matchIdx],
          macd: data.macd?.[matchIdx],
          atr14: data.atr14?.[matchIdx],
          adx14: data.adx14?.[matchIdx],
        });

        // Check if marker exists on this bar
        const sigMatch = data.signals?.find((s) => s.t === c.t);
        if (sigMatch) {
          setActiveTooltip({
            t: c.t,
            side: sigMatch.side,
            price: sigMatch.price,
            reason: sigMatch.reason,
          });
        } else {
          setActiveTooltip(null);
        }
      }
    });

    // Auto-resize on window change
    const handleResize = () => {
      if (priceChartContainerRef.current) {
        priceChart.applyOptions({ width: priceChartContainerRef.current.clientWidth });
      }
      if (rsiChartRef.current && rsiChartContainerRef.current) {
        rsiChartRef.current.applyOptions({ width: rsiChartContainerRef.current.clientWidth });
      }
      if (macdChartRef.current && macdChartContainerRef.current) {
        macdChartRef.current.applyOptions({ width: macdChartContainerRef.current.clientWidth });
      }
      if (atrChartRef.current && atrChartContainerRef.current) {
        atrChartRef.current.applyOptions({ width: atrChartContainerRef.current.clientWidth });
      }
      if (adxChartRef.current && adxChartContainerRef.current) {
        adxChartRef.current.applyOptions({ width: adxChartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      safeRemoveChart(priceChartRef);
      safeRemoveChart(rsiChartRef);
      safeRemoveChart(macdChartRef);
      safeRemoveChart(atrChartRef);
      safeRemoveChart(adxChartRef);
    };
  }, [data, theme, overlays, panes, tf, paperData]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        width: '100%',
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-card)',
        padding: '20px 24px',
      }}
    >
      {/* Top Controls: Timeframe, Range, Indicator Toggles, Open Debate */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          {/* Timeframe Switcher (D, W, M) */}
          <div style={{ display: 'inline-flex', padding: '3px', backgroundColor: 'var(--surface-raised)', borderRadius: 'var(--radius-pill)', border: '1px solid var(--border)' }}>
            {['D', 'W', 'M'].map((t) => (
              <button
                key={t}
                onClick={() => handleTfChange(t)}
                style={{
                  border: 'none',
                  borderRadius: 'var(--radius-pill)',
                  padding: '4px 12px',
                  fontSize: '12px',
                  fontWeight: tf === t ? 700 : 500,
                  backgroundColor: tf === t ? 'var(--amber-bg)' : 'transparent',
                  color: tf === t ? 'var(--accent)' : 'var(--muted)',
                  border: tf === t ? '1px solid var(--amber-border)' : '1px solid transparent',
                  cursor: 'pointer',
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Range Chips */}
          <div style={{ display: 'inline-flex', padding: '3px', backgroundColor: 'var(--surface-raised)', borderRadius: 'var(--radius-pill)', border: '1px solid var(--border)' }}>
            {['3M', '6M', '1Y', '3Y', '5Y', 'Max'].map((r) => (
              <button
                key={r}
                onClick={() => handleRangeChange(r)}
                style={{
                  border: 'none',
                  borderRadius: 'var(--radius-pill)',
                  padding: '4px 10px',
                  fontSize: '12px',
                  fontWeight: range === r ? 700 : 500,
                  backgroundColor: range === r ? 'var(--amber-bg)' : 'transparent',
                  color: range === r ? 'var(--accent)' : 'var(--muted)',
                  border: range === r ? '1px solid var(--amber-border)' : '1px solid transparent',
                  cursor: 'pointer',
                }}
              >
                {r}
              </button>
            ))}
          </div>

          {/* 200-day MA on all timeframes toggle */}
          {tf !== 'D' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: 'var(--text)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={overlays.d200OnAll}
                onChange={(e) => setOverlays((prev) => ({ ...prev, d200OnAll: e.target.checked }))}
              />
              <span>200-day MA overlay</span>
            </label>
          )}
        </div>

        {/* Right side buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={onToggleSignals}
            style={{
              padding: '7px 12px',
              backgroundColor: signalsOpen ? 'var(--amber-bg)' : 'var(--surface-raised)',
              border: signalsOpen ? '1px solid var(--amber-border)' : '1px solid var(--border)',
              borderRadius: 'var(--radius-input)',
              color: signalsOpen ? 'var(--accent)' : 'var(--text)',
              fontSize: '12.5px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>⚡ Signal Panel</span>
            <span>{signalsOpen ? '▶' : '◀'}</span>
          </button>

          <Link
            href="/debate"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              borderRadius: 'var(--radius-input)',
              backgroundColor: 'var(--surface-raised)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              fontSize: '12.5px',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            <span>Open debate</span>
            <span>→</span>
          </Link>
        </div>
      </div>

      {/* Indicator Overlay & Pane Toggles Bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', fontSize: '11.5px', borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
        <span style={{ color: 'var(--muted)', fontWeight: 600 }}>Overlays:</span>

        {[
          { key: 'sma20', label: 'SMA 20', color: 'var(--accent)' },
          { key: 'sma50', label: 'SMA 50', color: '#06b6d4' },
          { key: 'sma200', label: 'SMA 200', color: '#a855f7' },
          { key: 'ema21', label: 'EMA 21', color: '#10b981' },
          { key: 'bb', label: 'Bollinger Bands', color: 'var(--band)' },
          { key: 'crosses', label: 'Golden/Death Cross', color: 'var(--accent)' },
        ].map((item) => (
          <button
            key={item.key}
            onClick={() => setOverlays((prev) => ({ ...prev, [item.key]: !prev[item.key] }))}
            style={{
              border: overlays[item.key] ? '1px solid var(--border)' : '1px solid transparent',
              backgroundColor: overlays[item.key] ? 'var(--surface-raised)' : 'transparent',
              color: overlays[item.key] ? 'var(--text)' : 'var(--muted)',
              borderRadius: 'var(--radius-pill)',
              padding: '3px 8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: overlays[item.key] ? item.color : 'var(--border)' }} />
            <span>{item.label}</span>
          </button>
        ))}

        <div style={{ width: '1px', height: '14px', backgroundColor: 'var(--border)', margin: '0 4px' }} />

        <span style={{ color: 'var(--muted)', fontWeight: 600 }}>Panes:</span>
        {[
          { key: 'volume', label: 'Volume' },
          { key: 'rsi', label: 'RSI 14' },
          { key: 'macd', label: 'MACD' },
          { key: 'atr', label: 'ATR 14' },
          { key: 'adx', label: 'ADX 14' },
        ].map((pane) => (
          <button
            key={pane.key}
            onClick={() => setPanes((prev) => ({ ...prev, [pane.key]: !prev[pane.key] }))}
            style={{
              border: panes[pane.key] ? '1px solid var(--border)' : '1px solid transparent',
              backgroundColor: panes[pane.key] ? 'var(--surface-raised)' : 'transparent',
              color: panes[pane.key] ? 'var(--text)' : 'var(--muted)',
              borderRadius: 'var(--radius-pill)',
              padding: '3px 8px',
              cursor: 'pointer',
            }}
          >
            {pane.label}
          </button>
        ))}
      </div>

      {/* Shared OHLC & Indicator Readout Row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '14px',
          fontSize: '11.5px',
          padding: '4px 0',
          minHeight: '24px',
        }}
      >
        {readout ? (
          <>
            <span style={{ color: 'var(--muted)' }}>{readout.date}</span>
            <span>O: <strong className="price-val">{readout.open?.toFixed(2)}</strong></span>
            <span>H: <strong className="price-val">{readout.high?.toFixed(2)}</strong></span>
            <span>L: <strong className="price-val">{readout.low?.toFixed(2)}</strong></span>
            <span>
              C:{' '}
              <strong className="price-val" style={{ color: readout.close >= readout.open ? 'var(--gain)' : 'var(--loss)' }}>
                {readout.close?.toFixed(2)}
              </strong>
            </span>
            {overlays.sma20 && readout.sma20 && <span>SMA20: <strong className="price-val" style={{ color: 'var(--accent)' }}>{readout.sma20?.toFixed(2)}</strong></span>}
            {overlays.sma50 && readout.sma50 && <span>SMA50: <strong className="price-val" style={{ color: '#06b6d4' }}>{readout.sma50?.toFixed(2)}</strong></span>}
            {overlays.sma200 && readout.sma200 && <span>SMA200: <strong className="price-val" style={{ color: '#a855f7' }}>{readout.sma200?.toFixed(2)}</strong></span>}
            {panes.rsi && readout.rsi14 && <span>RSI: <strong className="tabular-nums" style={{ color: '#a855f7' }}>{readout.rsi14?.toFixed(1)}</strong></span>}
            {panes.atr && readout.atr14 && <span>ATR: <strong className="price-val" style={{ color: '#f97316' }}>{readout.atr14?.toFixed(2)}</strong></span>}
            {panes.adx && readout.adx14 && <span>ADX: <strong className="tabular-nums" style={{ color: '#38bdf8' }}>{readout.adx14?.toFixed(1)}</strong></span>}
          </>
        ) : (
          <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>
            Hover over chart candles to inspect indicators & signal triggers
          </span>
        )}

        {/* Marker Tooltip readout */}
        {activeTooltip && (
          <div
            style={{
              marginLeft: 'auto',
              padding: '2px 8px',
              backgroundColor: activeTooltip.side === 'B' ? 'var(--gain-bg)' : 'var(--loss-bg)',
              border: `1px solid ${activeTooltip.side === 'B' ? 'var(--gain-border)' : 'var(--loss-border)'}`,
              borderRadius: 'var(--radius-pill)',
              color: activeTooltip.side === 'B' ? 'var(--gain)' : 'var(--loss)',
              fontWeight: 600,
            }}
          >
            {activeTooltip.side === 'B' ? '▲ Buy Trigger' : '▼ Sell Trigger'}: {activeTooltip.reason}
          </div>
        )}
      </div>

      {/* Main Candlestick Chart Pane (Full width, TradingView lightweight-charts) */}
      <div style={{ position: 'relative', width: '100%', minHeight: '440px' }}>
        {loading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)', color: 'var(--muted)', zIndex: 10 }}>
            Loading TradingView chart data...
          </div>
        )}

        {error && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--loss)', zIndex: 10 }}>
            {error}
          </div>
        )}

        <div ref={priceChartContainerRef} style={{ width: '100%', height: '440px' }} />
      </div>

      {/* Synced Sub-Pane: RSI 14 */}
      {panes.rsi && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
          <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600 }}>RSI 14 (30/70)</span>
          <div ref={rsiChartContainerRef} style={{ width: '100%', height: '120px' }} />
        </div>
      )}

      {/* Synced Sub-Pane: MACD */}
      {panes.macd && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
          <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600 }}>MACD (12, 26, 9)</span>
          <div ref={macdChartContainerRef} style={{ width: '100%', height: '120px' }} />
        </div>
      )}

      {/* Synced Sub-Pane: ATR 14 */}
      {panes.atr && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
          <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600 }}>ATR 14</span>
          <div ref={atrChartContainerRef} style={{ width: '100%', height: '120px' }} />
        </div>
      )}

      {/* Synced Sub-Pane: ADX 14 */}
      {panes.adx && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
          <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600 }}>ADX 14 (&gt;25 Trend strength)</span>
          <div ref={adxChartContainerRef} style={{ width: '100%', height: '120px' }} />
        </div>
      )}
    </div>
  );
}
