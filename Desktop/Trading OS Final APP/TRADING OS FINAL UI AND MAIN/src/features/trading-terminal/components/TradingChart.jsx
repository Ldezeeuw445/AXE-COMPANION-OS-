import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, ColorType, CrosshairMode, CandlestickSeries, LineSeries, HistogramSeries } from 'lightweight-charts';

const TIMEFRAMES = [
  { label: '1m', value: '1min' },
  { label: '5m', value: '5min' },
  { label: '15m', value: '15min' },
  { label: '1H', value: '1hour' },
  { label: '4H', value: '4hour' },
  { label: 'D1', value: '1day' },
  { label: '1W', value: '1week' },
  { label: '1M', value: '1month' },
];

const TradingChart = ({ data, levels, symbol, indicators, activeTimeframe, onTimeframeChange, drawingTool, drawingColor, drawings, onDrawingCreated, onDrawingUpdate, onDrawingSelect, overlaySettings, chartColors, indicatorColors }) => {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const ema20Ref = useRef(null);
  const ema50Ref = useRef(null);
  const ema200Ref = useRef(null);
  const vwapRef = useRef(null);
  const markersRef = useRef([]);
  const priceLinesRef = useRef([]);
  const drawingLinesRef = useRef([]);
  const zoneLinesRef = useRef([]);
  const drawingStateRef = useRef({ isDrawing: false, startPoint: null, activeLine: null });

  // Selection & drag state
  const [selectedDrawingId, setSelectedDrawingId] = useState(null);
  const dragRef = useRef({ active: false, drawingId: null, handleIndex: -1, startY: 0, startPrice: 0 });

  // Initialize chart once
  useEffect(() => {
    if (!chartContainerRef.current) return;
    if (chartRef.current) chartRef.current.remove();

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#94A3B8',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.03)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.03)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(255, 255, 255, 0.2)', width: 1, style: 2, labelBackgroundColor: '#1E293B' },
        horzLine: { color: 'rgba(255, 255, 255, 0.2)', width: 1, style: 2, labelBackgroundColor: '#1E293B' },
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        scaleMargins: { top: 0.05, bottom: 0.12 },
        entireTextOnly: true,
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 12,
      },
      localization: { locale: 'en-US', dateFormat: 'yyyy-MM-dd' },
    });

    // Candlestick series - TradingView teal/coral style
    const upColor = chartColors?.candleUp || '#26a69a';
    const downColor = chartColors?.candleDown || '#ef5350';
    const candles = chart.addSeries(CandlestickSeries, {
      upColor,
      downColor,
      borderUpColor: upColor,
      borderDownColor: downColor,
      wickUpColor: '#749f9370',
      wickDownColor: '#b75a5a70',
    });

    // Volume histogram on bottom
    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.92, bottom: 0 },
    });

    // EMA 20
    const ema20 = chart.addSeries(LineSeries, {
      color: chartColors?.ema20 || '#FBBF24',
      lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
    });

    // EMA 50
    const ema50 = chart.addSeries(LineSeries, {
      color: chartColors?.ema50 || '#22D3EE',
      lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
    });

    // EMA 200
    const ema200 = chart.addSeries(LineSeries, {
      color: chartColors?.ema200 || '#E879F9',
      lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
    });

    // VWAP
    const vwap = chart.addSeries(LineSeries, {
      color: chartColors?.vwap || '#06b6d4',
      lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
    });

    chartRef.current = chart;
    candleSeriesRef.current = candles;
    volumeSeriesRef.current = volume;
    ema20Ref.current = ema20;
    ema50Ref.current = ema50;
    ema200Ref.current = ema200;
    vwapRef.current = vwap;

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        const w = chartContainerRef.current.clientWidth;
        const h = chartContainerRef.current.clientHeight;
        if (w > 0 && h > 0) {
          chartRef.current.resize(w, Math.max(h - 50, 100));
        }
      }
    };
    window.addEventListener('resize', handleResize);
    // ResizeObserver with multiple frames to catch flex reflow
    const ro = new ResizeObserver(() => {
      handleResize();
      requestAnimationFrame(() => {
        handleResize();
        requestAnimationFrame(handleResize);
      });
    });
    ro.observe(chartContainerRef.current);
    // Also observe the parent to detect sibling changes (panel open/close)
    if (chartContainerRef.current.parentElement?.parentElement) {
      ro.observe(chartContainerRef.current.parentElement.parentElement);
    }
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      ro.disconnect();
      if (overlayCanvasRef.current) { try { overlayCanvasRef.current.remove(); } catch(e) {} overlayCanvasRef.current = null; }
      if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; }
    };
  }, []);

  // Convert time helper
  const toTimestamp = useCallback((dateStr) => {
    const d = new Date(dateStr);
    return Math.floor(d.getTime() / 1000);
  }, []);

  // Keep user pan/zoom stable: only auto-fit on first load per (symbol,timeframe).
  const didAutoFitRef = useRef(false);
  const lastAutoFitKeyRef = useRef('');
  useEffect(() => {
    const k = `${String(symbol || '')}__${String(activeTimeframe || '')}`;
    if (k !== lastAutoFitKeyRef.current) {
      lastAutoFitKeyRef.current = k;
      didAutoFitRef.current = false;
    }
  }, [symbol, activeTimeframe]);

  // Avoid occasional rendering glitches: prefer incremental last-candle updates
  // instead of resetting the full series on every tick.
  const prevSeriesMetaRef = useRef({ len: 0, lastTime: 0 });

  // Update candle data
  useEffect(() => {
    if (!candleSeriesRef.current || !data?.length) return;
    const chartData = data.map(b => ({
      time: toTimestamp(b.date),
      open: b.open, high: b.high, low: b.low, close: b.close,
    })).sort((a, b) => a.time - b.time);
    const nextLen = chartData.length;
    const nextLast = chartData[nextLen - 1];
    const prev = prevSeriesMetaRef.current;

    // If only the last candle changed (same length + same last time), update it in-place.
    if (nextLast && prev.len === nextLen && prev.lastTime === nextLast.time) {
      try {
        candleSeriesRef.current.update(nextLast);
      } catch (e) {
        // Fallback to full set if update fails for any reason
        candleSeriesRef.current.setData(chartData);
      }
    } else {
      candleSeriesRef.current.setData(chartData);
    }

    prevSeriesMetaRef.current = { len: nextLen, lastTime: nextLast?.time ?? 0 };
    if (chartRef.current && !didAutoFitRef.current) {
      chartRef.current.timeScale().fitContent();
      didAutoFitRef.current = true;
    }
  }, [data, toTimestamp]);

  // Update indicators (respecting overlay toggles)
  useEffect(() => {
    if (!indicators || !data?.length) return;
    const settings = overlaySettings || {};

    // Volume
    if (volumeSeriesRef.current) {
      if (settings.volume !== false && indicators.volume_bars?.length) {
        const vData = indicators.volume_bars.map(v => ({ time: toTimestamp(v.time), value: v.value, color: v.color })).sort((a, b) => a.time - b.time);
        try { volumeSeriesRef.current.setData(vData); } catch(e) {}
      } else {
        try { volumeSeriesRef.current.setData([]); } catch(e) {}
      }
    }

    // EMA 20
    if (ema20Ref.current) {
      if (settings.ema20 !== false && indicators.ema20?.length) {
        const eData = indicators.ema20.map(e => ({ time: toTimestamp(e.time), value: e.value })).sort((a,b) => a.time - b.time);
        try { ema20Ref.current.setData(eData); } catch(e) {}
      } else { try { ema20Ref.current.setData([]); } catch(e) {} }
    }

    // EMA 50
    if (ema50Ref.current) {
      if (settings.ema50 !== false && indicators.ema50?.length) {
        const eData = indicators.ema50.map(e => ({ time: toTimestamp(e.time), value: e.value })).sort((a,b) => a.time - b.time);
        try { ema50Ref.current.setData(eData); } catch(e) {}
      } else { try { ema50Ref.current.setData([]); } catch(e) {} }
    }

    // EMA 200
    if (ema200Ref.current) {
      if (settings.ema200 !== false && indicators.ema200?.length) {
        const eData = indicators.ema200.map(e => ({ time: toTimestamp(e.time), value: e.value })).sort((a,b) => a.time - b.time);
        try { ema200Ref.current.setData(eData); } catch(e) {}
      } else { try { ema200Ref.current.setData([]); } catch(e) {} }
    }

    // VWAP
    if (vwapRef.current) {
      if (settings.vwap !== false && indicators.vwap?.length) {
        const vData = indicators.vwap.map(v => ({ time: toTimestamp(v.time), value: v.value })).sort((a,b) => a.time - b.time);
        try { vwapRef.current.setData(vData); } catch(e) {}
      } else { try { vwapRef.current.setData([]); } catch(e) {} }
    }

    // BOS/CHoCH + Liquidity Sweeps as markers
    const ic = indicatorColors || {};
    if (candleSeriesRef.current) {
      const allMarkers = [];
      if (settings.bos_choch !== false && indicators.bos_choch?.length) {
        indicators.bos_choch.forEach(s => {
          allMarkers.push({
            time: toTimestamp(s.time),
            position: s.type.includes('bullish') ? 'belowBar' : 'aboveBar',
            color: ic.bosColor || '#06b6d4',
            shape: s.type.includes('choch') ? 'circle' : 'arrowUp',
            text: s.description,
          });
        });
      }
      if (settings.liquidity !== false && indicators.liquidity_sweeps?.length) {
        indicators.liquidity_sweeps.forEach(s => {
          allMarkers.push({
            time: toTimestamp(s.time),
            position: s.type.includes('bullish') ? 'belowBar' : 'aboveBar',
            color: ic.liqColor || '#F59E0B',
            shape: 'square',
            text: s.description,
          });
        });
      }
      allMarkers.sort((a, b) => a.time - b.time);
      try { candleSeriesRef.current.setMarkers(allMarkers); } catch(e) {}
    }

    // PDH/PDL, PWH/PWL, PMH/PML, PQH/PQL as short right-side price lines
    const periodLevels = [];
    if (settings.pdhl !== false && indicators.pdhl) {
      periodLevels.push({ price: indicators.pdhl.high, title: 'PDH', color: ic.pdhlColor || '#94A3B870' });
      periodLevels.push({ price: indicators.pdhl.low, title: 'PDL', color: ic.pdhlColor || '#94A3B870' });
    }
    if (settings.pwhl && indicators.pwhl) {
      periodLevels.push({ price: indicators.pwhl.high, title: 'PWH', color: ic.pwhlColor || '#3B82F650' });
      periodLevels.push({ price: indicators.pwhl.low, title: 'PWL', color: ic.pwhlColor || '#3B82F650' });
    }
    if (settings.pmhl && indicators.pmhl) {
      periodLevels.push({ price: indicators.pmhl.high, title: 'PMH', color: ic.pmhlColor || '#E879F950' });
      periodLevels.push({ price: indicators.pmhl.low, title: 'PML', color: ic.pmhlColor || '#E879F950' });
    }
    if (settings.pqhl && indicators.pqhl) {
      periodLevels.push({ price: indicators.pqhl.high, title: 'PQH', color: ic.pqhlColor || '#F59E0B50' });
      periodLevels.push({ price: indicators.pqhl.low, title: 'PQL', color: ic.pqhlColor || '#F59E0B50' });
    }
    // Add period level price lines
    periodLevels.forEach(pl => {
      if (candleSeriesRef.current && pl.price) {
        try {
          const line = candleSeriesRef.current.createPriceLine({
            price: pl.price,
            color: pl.color,
            lineWidth: 1,
            lineStyle: 2, // dashed
            axisLabelVisible: true,
            title: pl.title,
          });
          priceLinesRef.current.push(line);
        } catch(e) {}
      }
    });

  }, [indicators, data, toTimestamp, overlaySettings, indicatorColors]);

  // ====== PREMIUM LUXALGO CANVAS OVERLAY ======
  const overlayCanvasRef = useRef(null);

  useEffect(() => {
    if (!chartRef.current || !candleSeriesRef.current || !indicators || !data?.length) return;
    const settings = overlaySettings || {};
    const ic = indicatorColors || {};
    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    const container = chartContainerRef.current;
    if (!container) return;
    zoneLinesRef.current.forEach(s => { try { chart.removeSeries(s); } catch(e) {} });
    zoneLinesRef.current = [];

    let canvas = overlayCanvasRef.current;
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:2';
      container.style.position = 'relative';
      container.appendChild(canvas);
      overlayCanvasRef.current = canvas;
    }
    const dpr = window.devicePixelRatio || 1;
    canvas.width = container.clientWidth * dpr;
    canvas.height = container.clientHeight * dpr;
    canvas.style.width = container.clientWidth + 'px';
    canvas.style.height = container.clientHeight + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const W = container.clientWidth, H = container.clientHeight;
    const ts = chart.timeScale();
    const tx = (t) => { try { return ts.timeToCoordinate(toTimestamp(t)); } catch { return null; } };
    const py = (p) => { try { return series.priceToCoordinate(p); } catch { return null; } };
    const lastT = data[data.length - 1]?.date;

    const drawAll = () => {
      ctx.clearRect(0, 0, W, H);

      // ========== ORDER BLOCKS ==========
      if (settings.order_blocks !== false && indicators.order_blocks?.length) {
        indicators.order_blocks.forEach(ob => {
          const bull = ob.type === 'bullish_ob';
          const c = bull ? (ic.obBullColor||'#26a69a') : (ic.obBearColor||'#ef5350');
          const x1=tx(ob.time),x2=tx(lastT),y1=py(ob.high),y2=py(ob.low);
          if(!x1||!x2||!y1||!y2)return;
          const rx=Math.min(x1,x2),ry=Math.min(y1,y2),rw=Math.abs(x2-x1),rh=Math.max(Math.abs(y2-y1),2);
          ctx.fillStyle=c+'20'; ctx.fillRect(rx,ry,rw,rh);
          ctx.fillStyle=c+'80'; ctx.fillRect(rx,ry,3,rh);
          ctx.strokeStyle=c+'40'; ctx.lineWidth=0.5; ctx.setLineDash([]);
          ctx.beginPath();ctx.moveTo(rx,ry);ctx.lineTo(rx+rw,ry);ctx.stroke();
          ctx.beginPath();ctx.moveTo(rx,ry+rh);ctx.lineTo(rx+rw,ry+rh);ctx.stroke();
          ctx.font='bold 8px system-ui';ctx.fillStyle=c+'cc';ctx.fillText('OB',rx+6,ry+10);
        });
      }

      // ========== FVG ZONES ==========
      if (settings.fvg !== false && indicators.fvg_zones?.length) {
        indicators.fvg_zones.forEach(fvg => {
          const bull = fvg.type === 'bullish_fvg';
          const c = bull ? (ic.fvgBullColor||'#26a69a') : (ic.fvgBearColor||'#ef5350');
          const x1=tx(fvg.time),x2=tx(lastT),y1=py(fvg.high),y2=py(fvg.low);
          if(!x1||!x2||!y1||!y2)return;
          const rx=Math.min(x1,x2),ry=Math.min(y1,y2),rw=Math.abs(x2-x1),rh=Math.max(Math.abs(y2-y1),1);
          ctx.fillStyle=c+'15'; ctx.fillRect(rx,ry,rw,rh);
          ctx.strokeStyle=c+'35'; ctx.lineWidth=0.5; ctx.setLineDash([2,2]);
          ctx.strokeRect(rx,ry,rw,rh); ctx.setLineDash([]);
          ctx.font='7px system-ui';ctx.fillStyle=c+'aa';ctx.fillText('FVG',rx+4,ry+8);
        });
      }

      // ========== IFVG ==========
      if (settings.ifvg !== false && indicators.ifvg_zones?.length) {
        indicators.ifvg_zones.forEach(ifvg => {
          const c = ic.ifvgColor||'#F59E0B';
          const x1=tx(ifvg.time),x2=tx(lastT),y1=py(ifvg.high),y2=py(ifvg.low);
          if(!x1||!x2||!y1||!y2)return;
          const rx=Math.min(x1,x2),ry=Math.min(y1,y2),rw=Math.abs(x2-x1),rh=Math.max(Math.abs(y2-y1),1);
          ctx.fillStyle=c+'12'; ctx.fillRect(rx,ry,rw,rh);
          ctx.strokeStyle=c+'40'; ctx.lineWidth=0.5; ctx.setLineDash([3,2]);
          ctx.strokeRect(rx,ry,rw,rh); ctx.setLineDash([]);
          ctx.font='7px system-ui';ctx.fillStyle=c+'aa';ctx.fillText('iFVG',rx+4,ry+8);
        });
      }

      // ========== ZIGZAG MARKET STRUCTURE LINES ==========
      if (settings.swing_structure !== false && indicators.swing_structure?.length > 1) {
        const sorted = [...indicators.swing_structure].sort((a,b) => {
          const ta = toTimestamp(a.time), tb = toTimestamp(b.time);
          return ta - tb;
        });
        // Draw zigzag line connecting alternating swings
        ctx.strokeStyle = (ic.swingColor || '#8B5CF6') + '60';
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        ctx.beginPath();
        let started = false;
        sorted.forEach(sw => {
          const x = tx(sw.time), y = py(sw.price);
          if (!x || !y) return;
          if (!started) { ctx.moveTo(x, y); started = true; }
          else { ctx.lineTo(x, y); }
        });
        ctx.stroke();

        // Draw swing points with HH/HL/LH/LL labels
        sorted.forEach(sw => {
          const x = tx(sw.time), y = py(sw.price);
          if (!x || !y) return;
          const isHigh = sw.type === 'swing_high';
          const label = sw.label || '';

          // Diamond shape for swing points
          ctx.fillStyle = isHigh ? '#ef5350' + 'aa' : '#26a69a' + 'aa';
          ctx.beginPath();
          ctx.moveTo(x, y - 4);
          ctx.lineTo(x + 3, y);
          ctx.lineTo(x, y + 4);
          ctx.lineTo(x - 3, y);
          ctx.closePath();
          ctx.fill();

          // Label (HH, HL, LH, LL)
          if (label) {
            const ly = isHigh ? y - 10 : y + 15;
            const labelColor = (label === 'HH' || label === 'HL') ? '#26a69a' : '#ef5350';
            ctx.font = 'bold 9px JetBrains Mono, monospace';
            const tw = ctx.measureText(label).width;
            ctx.fillStyle = labelColor + '20';
            ctx.beginPath();
            ctx.roundRect(x - tw/2 - 3, ly - 9, tw + 6, 13, 2);
            ctx.fill();
            ctx.fillStyle = labelColor;
            ctx.fillText(label, x - tw/2, ly);
          }
        });
      }

      // ========== BOS / CHoCH SLANTED LINES ==========
      if (settings.bos_choch !== false && indicators.bos_choch?.length) {
        indicators.bos_choch.forEach(sig => {
          const bull = sig.type.includes('bullish');
          const choch = sig.type.includes('choch');
          const c = choch ? '#F59E0B' : (ic.bosColor || '#06b6d4');
          const x1 = sig.from_time ? tx(sig.from_time) : null;
          const x2 = tx(sig.time);
          const levelPrice = sig.level_price || sig.from_price;
          const yLevel = levelPrice ? py(levelPrice) : null;
          const y2 = py(sig.price);
          if (!x2 || !y2) return;

          // 1) Draw the horizontal dashed level line from the origin swing to the break point
          if (x1 && yLevel) {
            ctx.strokeStyle = c + '40';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            ctx.moveTo(x1, yLevel);
            ctx.lineTo(x2, yLevel);
            ctx.stroke();
            ctx.setLineDash([]);
          }

          // 2) Draw the slanted break line (from level to the actual break price)
          if (x1 && yLevel) {
            ctx.strokeStyle = c + '80';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([]);
            ctx.beginPath();
            // Small diagonal "break" arrow near the break point
            const breakX = x2;
            const arrowLen = 12;
            const arrowDir = bull ? -1 : 1; // up for bullish, down for bearish
            ctx.moveTo(breakX, yLevel);
            ctx.lineTo(breakX, yLevel + arrowLen * arrowDir);
            ctx.stroke();

            // Small triangle arrow head
            ctx.fillStyle = c + 'cc';
            ctx.beginPath();
            const tipY = yLevel + (arrowLen + 4) * arrowDir;
            ctx.moveTo(breakX, tipY);
            ctx.lineTo(breakX - 3, tipY - 4 * arrowDir);
            ctx.lineTo(breakX + 3, tipY - 4 * arrowDir);
            ctx.closePath();
            ctx.fill();
          }

          // 3) Label badge at the midpoint
          const label = sig.description || (choch ? 'CHoCH' : 'BOS');
          ctx.font = 'bold 9px JetBrains Mono, monospace';
          const tw = ctx.measureText(label).width + 10;
          const badgeX = x1 ? (x1 + x2) / 2 - tw / 2 : x2 - tw / 2;
          const badgeY = yLevel ? yLevel - (bull ? 18 : -6) : y2 - 18;

          // Badge background
          ctx.fillStyle = c + '20';
          ctx.beginPath();
          ctx.roundRect(badgeX, badgeY, tw, 15, 3);
          ctx.fill();
          ctx.strokeStyle = c + '60';
          ctx.lineWidth = 0.5;
          ctx.stroke();

          // Badge text
          ctx.fillStyle = c;
          ctx.fillText(label, badgeX + 5, badgeY + 11);
        });
      }

      // ========== LIQUIDITY SWEEPS ==========
      if (settings.liquidity !== false && indicators.liquidity_sweeps?.length) {
        const c = ic.liqColor || '#ab47bc';
        indicators.liquidity_sweeps.forEach(sw => {
          const x = tx(sw.time), y = py(sw.price), ySw = py(sw.swept_level);
          if (!x || !y) return;
          // Vertical sweep line
          ctx.strokeStyle = c + '80'; ctx.lineWidth = 2; ctx.setLineDash([]);
          if (ySw) { ctx.beginPath(); ctx.moveTo(x, ySw); ctx.lineTo(x, y); ctx.stroke(); }
          // $ icon
          ctx.font = 'bold 9px system-ui'; ctx.fillStyle = c;
          ctx.fillText('$', x - 3, sw.type.includes('bullish') ? y + 12 : y - 5);
        });
      }

      // ========== AUTO FIBONACCI ==========
      if (settings.auto_fib !== false && indicators.auto_fib) {
        const fib = indicators.auto_fib, c = ic.fibColor || '#7c4dff';
        const xStart = fib.high_time ? tx(fib.high_time) : null;
        const xLow = fib.low_time ? tx(fib.low_time) : null;
        const xEnd = tx(lastT);
        // Get the actual price scale width to avoid overlap
        const priceScaleW = chartRef.current?.priceScale('right')?.width() || 65;
        const fibEnd = xEnd ? Math.min(xEnd, W - priceScaleW - 10) : W - priceScaleW - 10;
        const fibStart = Math.min(xStart || 0, xLow || 0) || 0;
        const labelX = W - priceScaleW - 8; // Labels just before price scale

        if (fib.levels) {
          const ops = {'0':'40','0.236':'25','0.382':'35','0.5':'45','0.618':'55','0.65':'45','0.786':'30','1.0':'40'};
          const fibEntries = Object.entries(fib.levels);

          // Draw filled zones between consecutive fib levels
          for (let fi = 0; fi < fibEntries.length - 1; fi++) {
            const [lv1, p1] = fibEntries[fi];
            const [lv2, p2] = fibEntries[fi + 1];
            const y1 = py(p1), y2f = py(p2);
            if (!y1 || !y2f) continue;
            const alpha = (parseFloat(lv1) >= 0.5 && parseFloat(lv1) <= 0.65) ? '12' : '06';
            ctx.fillStyle = c + alpha;
            ctx.fillRect(fibStart, Math.min(y1, y2f), fibEnd - fibStart, Math.abs(y2f - y1));
          }

          // Draw the fib level lines and labels
          fibEntries.forEach(([lv, price]) => {
            const y = py(price);
            if (!y) return;
            ctx.strokeStyle = c + (ops[lv] || '30');
            ctx.lineWidth = lv === '0.618' || lv === '0.5' ? 1 : 0.5;
            ctx.setLineDash(lv === '0' || lv === '1.0' ? [] : [5, 3]);
            ctx.beginPath(); ctx.moveTo(fibStart, y); ctx.lineTo(fibEnd, y); ctx.stroke();
            ctx.setLineDash([]);
            // Label
            ctx.font = '9px JetBrains Mono, monospace';
            ctx.fillStyle = c + '90';
            const pctLabel = `${(parseFloat(lv) * 100).toFixed(1)}%`;
            const priceLabel = ` ${price}`;
            const fullLabel = pctLabel + priceLabel;
            const labelWidth = ctx.measureText(fullLabel).width;
            ctx.fillText(fullLabel, labelX - labelWidth, y + 3);
          });

          // Golden Pocket highlight (0.618 - 0.65)
          const y618 = py(fib.levels['0.618']), y65 = py(fib.levels['0.65']);
          if (y618 && y65) {
            ctx.fillStyle = '#ffd600' + '10';
            ctx.fillRect(fibStart, Math.min(y618, y65), fibEnd - fibStart, Math.abs(y65 - y618));
            // Golden pocket label
            ctx.font = 'bold 8px JetBrains Mono, monospace';
            ctx.fillStyle = '#ffd600' + '60';
            ctx.fillText('GP', fibStart + 4, Math.min(y618, y65) + 10);
          }
        }
      }
    };
    // ========== ALL USER DRAWINGS (canvas rendered) ==========
    const drawUserDrawings = () => {
      if (!fibDrawingsRef.current?.length) return;
      const selId = selectedDrawingId;

      fibDrawingsRef.current.forEach(drawing => {
        if (!drawing.points || drawing.points.length < 1) return;
        const isSelected = drawing.id === selId;
        const isLocked = drawing.locked;
        const c = drawing.color || '#3B82F6';

        if (drawing.tool === 'horizontal' && drawing.points[0]) {
          const y = py(drawing.points[0].price);
          if (!y) return;
          ctx.strokeStyle = c;
          ctx.lineWidth = isSelected ? 2 : 1;
          ctx.setLineDash([]);
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W - 60, y); ctx.stroke();
          // Label
          ctx.font = '10px JetBrains Mono, monospace';
          ctx.fillStyle = c;
          ctx.fillText(drawing.points[0].price.toFixed(4), W - 58, y - 4);
          // Selection handles
          if (isSelected) {
            [W * 0.25, W * 0.5, W * 0.75].forEach(hx => {
              ctx.fillStyle = '#06b6d4';
              ctx.fillRect(hx - 4, y - 4, 8, 8);
              ctx.strokeStyle = '#06b6d4'; ctx.lineWidth = 1; ctx.strokeRect(hx - 4, y - 4, 8, 8);
            });
          }
          if (isLocked) {
            ctx.font = '10px system-ui'; ctx.fillStyle = '#F59E0B80';
            ctx.fillText('\u{1F512}', 6, y - 4);
          }

        } else if (drawing.tool === 'trendline' && drawing.points?.length >= 2) {
          const x1 = tx(drawing.points[0].time || drawing.points[0].date);
          const y1 = py(drawing.points[0].price);
          const x2 = tx(drawing.points[1].time || drawing.points[1].date);
          const y2 = py(drawing.points[1].price);
          if (!x1 || !y1 || !x2 || !y2) return;
          ctx.strokeStyle = c;
          ctx.lineWidth = isSelected ? 2.5 : 2;
          ctx.setLineDash([]);
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
          // Handles
          if (isSelected) {
            [{ x: x1, y: y1 }, { x: x2, y: y2 }].forEach(h => {
              ctx.fillStyle = '#06b6d4';
              ctx.beginPath(); ctx.arc(h.x, h.y, 5, 0, Math.PI * 2); ctx.fill();
              ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
            });
          }
          if (isLocked) {
            ctx.font = '10px system-ui'; ctx.fillStyle = '#F59E0B80';
            ctx.fillText('\u{1F512}', x1 + 8, y1 - 8);
          }

        } else if (drawing.tool === 'rectangle' && drawing.points?.length >= 2) {
          const x1 = tx(drawing.points[0].time || drawing.points[0].date);
          const y1 = py(drawing.points[0].price);
          const x2 = tx(drawing.points[1].time || drawing.points[1].date);
          const y2 = py(drawing.points[1].price);
          if (!x1 || !y1 || !x2 || !y2) return;
          const rx = Math.min(x1, x2), ry = Math.min(y1, y2);
          const rw = Math.abs(x2 - x1), rh = Math.abs(y2 - y1);
          ctx.fillStyle = c + '15';
          ctx.fillRect(rx, ry, rw, rh);
          ctx.strokeStyle = c + (isSelected ? 'cc' : '60');
          ctx.lineWidth = isSelected ? 2 : 1;
          ctx.setLineDash([]);
          ctx.strokeRect(rx, ry, rw, rh);
          if (isSelected) {
            [{x:rx,y:ry},{x:rx+rw,y:ry},{x:rx,y:ry+rh},{x:rx+rw,y:ry+rh}].forEach(h => {
              ctx.fillStyle = '#06b6d4';
              ctx.fillRect(h.x - 4, h.y - 4, 8, 8);
            });
          }
          if (isLocked) {
            ctx.font = '10px system-ui'; ctx.fillStyle = '#F59E0B80';
            ctx.fillText('\u{1F512}', rx + 4, ry + 12);
          }

        } else if (drawing.tool === 'fibonacci' && drawing.points?.length >= 2) {
          const high = Math.max(drawing.points[0].price, drawing.points[1].price);
          const low = Math.min(drawing.points[0].price, drawing.points[1].price);
          const diff = high - low;
          if (diff === 0) return;
          const x0 = drawing.points[0].time ? tx(drawing.points[0].time) : null;
          const x1f = drawing.points[1].time ? tx(drawing.points[1].time) : null;
          const fibLeft = Math.min(x0 || 0, x1f || 0);
          const fibRight = Math.max(x0 || 0, x1f || 0);
          if (fibRight - fibLeft < 5) return; // too small to draw
          const decPl = high < 10 ? 4 : 2;

          // Use custom levels from meta, or fall back to defaults
          const activeLevels = (drawing.meta?.fibLevels || FIB_LEVELS).filter(fl => fl.enabled !== false);

          // Filled zones
          for (let i = 0; i < activeLevels.length - 1; i++) {
            const p1 = high - diff * activeLevels[i].level;
            const p2 = high - diff * activeLevels[i + 1].level;
            const fy1 = py(p1), fy2 = py(p2);
            if (!fy1 || !fy2) continue;
            const isGP = activeLevels[i].level >= 0.618 && activeLevels[i].level <= 0.65;
            ctx.fillStyle = isGP ? 'rgba(249, 115, 22, 0.08)' : 'rgba(255, 255, 255, 0.012)';
            ctx.fillRect(fibLeft, Math.min(fy1, fy2), fibRight - fibLeft, Math.abs(fy2 - fy1));
          }
          // Level lines + labels
          activeLevels.forEach(fl => {
            const price = high - diff * fl.level;
            const fy = py(price);
            if (!fy) return;
            ctx.strokeStyle = fl.color;
            ctx.lineWidth = isSelected ? fl.lineWidth + 0.5 : fl.lineWidth;
            ctx.setLineDash([]); ctx.beginPath();
            ctx.moveTo(fibLeft, fy); ctx.lineTo(fibRight, fy); ctx.stroke();
            const label = `${(fl.level * 100).toFixed(2)}% (${price.toFixed(decPl)})`;
            ctx.font = '10px JetBrains Mono, monospace';
            ctx.fillStyle = fl.color;
            ctx.fillText(label, fibRight + 6, fy - 4);
          });
          // Anchor dots
          if (isSelected) {
            drawing.points.forEach(p => {
              const px2 = p.time ? tx(p.time) : null;
              const py2 = py(p.price);
              if (!px2 || !py2) return;
              ctx.fillStyle = '#06b6d4';
              ctx.beginPath(); ctx.arc(px2, py2, 6, 0, Math.PI * 2); ctx.fill();
              ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
            });
          } else {
            drawing.points.forEach(p => {
              const px2 = p.time ? tx(p.time) : null;
              const py2 = py(p.price);
              if (!px2 || !py2) return;
              ctx.fillStyle = '#06b6d4';
              ctx.beginPath(); ctx.arc(px2, py2, 3, 0, Math.PI * 2); ctx.fill();
            });
          }
          if (isLocked) {
            ctx.font = '10px system-ui'; ctx.fillStyle = '#F59E0B80';
            ctx.fillText('\u{1F512}', fibLeft + 4, py(high) ? py(high) - 8 : 20);
          }

        } else if (drawing.tool === 'text' && drawing.points?.[0]) {
          const xt = tx(drawing.points[0].time || drawing.points[0].date);
          const yt = py(drawing.points[0].price);
          if (!xt || !yt) return;
          const text = drawing.text || 'Label';
          ctx.font = 'bold 12px JetBrains Mono, monospace';
          const tw = ctx.measureText(text).width;
          // Background
          ctx.fillStyle = c + '20';
          ctx.beginPath(); ctx.roundRect(xt - 4, yt - 14, tw + 8, 18, 3); ctx.fill();
          if (isSelected) { ctx.strokeStyle = '#06b6d4'; ctx.lineWidth = 1; ctx.stroke(); }
          // Text
          ctx.fillStyle = c;
          ctx.fillText(text, xt, yt);
          if (isLocked) {
            ctx.font = '9px system-ui'; ctx.fillStyle = '#F59E0B80';
            ctx.fillText('\u{1F512}', xt + tw + 6, yt - 2);
          }
        }
      });
    };

    const drawEverything = () => {
      drawAll();
      drawUserDrawings();
    };
    drawEverything();
    ts.subscribeVisibleLogicalRangeChange(drawEverything);
    return () => { try { ts.unsubscribeVisibleLogicalRangeChange(drawEverything); } catch(e) {} };
  }, [indicators, data, toTimestamp, overlaySettings, indicatorColors, drawings]);

  // Price lines for key levels (using indicator colors)
  useEffect(() => {
    if (!candleSeriesRef.current || !levels?.length) return;
    const ic = indicatorColors || {};
    priceLinesRef.current.forEach(pl => {
      try { candleSeriesRef.current.removePriceLine(pl); } catch(e) {}
    });
    priceLinesRef.current = [];
    if (overlaySettings?.support_resistance === false) return;
    levels.forEach(level => {
      const color = level.type === 'resistance'
        ? (ic.resistanceColor || '#ef4444')
        : level.type === 'support'
          ? (ic.supportColor || '#22c55e')
          : '#F59E0B';
      try {
        const pl = candleSeriesRef.current.createPriceLine({
          price: level.price, color,
          lineWidth: level.strength === 'strong' ? 2 : 1,
          lineStyle: level.strength === 'strong' ? 0 : level.strength === 'moderate' ? 1 : 2,
          axisLabelVisible: true,
          title: level.description || level.type,
        });
        priceLinesRef.current.push(pl);
      } catch(e) {}
    });
  }, [levels, indicatorColors, overlaySettings]);

  // Default Fibonacci level config matching user's reference image
  const FIB_LEVELS = [
    { level: 0,     color: '#888888', lineWidth: 1 },
    { level: 0.236, color: '#888888', lineWidth: 0.5 },
    { level: 0.382, color: '#5B8DEF', lineWidth: 0.5 },
    { level: 0.5,   color: '#5B8DEF', lineWidth: 1 },
    { level: 0.618, color: '#F97316', lineWidth: 1.5 },
    { level: 0.65,  color: '#F97316', lineWidth: 1.5 },
    { level: 0.786, color: '#5B8DEF', lineWidth: 0.5 },
    { level: 1.0,   color: '#888888', lineWidth: 1 },
  ];

  // ALL user drawings rendered on canvas
  const fibDrawingsRef = useRef([]);

  useEffect(() => {
    if (!candleSeriesRef.current || !chartRef.current) return;
    // Clear old native drawing objects (legacy cleanup)
    drawingLinesRef.current.forEach(dl => {
      try {
        if (dl.type === 'priceLine') candleSeriesRef.current.removePriceLine(dl.ref);
        else if (dl.type === 'series') chartRef.current.removeSeries(dl.ref);
      } catch(e) {}
    });
    drawingLinesRef.current = [];
    fibDrawingsRef.current = [];
    // All drawings now rendered on canvas — store them for the overlay
    if (drawings?.length) {
      fibDrawingsRef.current = drawings;
    }
  }, [drawings]);

  // Handle drawing interactions — creating new drawings
  // INSTANT PLACEMENT: when tool is selected, immediately place at chart center
  useEffect(() => {
    if (!chartRef.current || !candleSeriesRef.current || !drawingTool || drawingTool === 'cursor') return;
    if (!data || data.length < 2) return;

    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    const container = chartContainerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const centerY = rect.height / 2;
    const centerPrice = series.coordinateToPrice(centerY);
    if (centerPrice === null) return;

    // Get visible time range
    const visibleRange = chart.timeScale().getVisibleLogicalRange();
    if (!visibleRange) return;

    const totalBars = data.length;
    const midIdx = Math.floor((visibleRange.from + visibleRange.to) / 2);
    const leftIdx = Math.floor(visibleRange.from + (visibleRange.to - visibleRange.from) * 0.35);
    const rightIdx = Math.floor(visibleRange.from + (visibleRange.to - visibleRange.from) * 0.65);

    const getBarDate = (idx) => {
      const clampIdx = Math.max(0, Math.min(totalBars - 1, idx));
      return data[clampIdx]?.date || data[data.length - 1]?.date;
    };

    // Get price range in visible area
    const visibleBars = data.slice(
      Math.max(0, Math.floor(visibleRange.from)),
      Math.min(totalBars, Math.ceil(visibleRange.to))
    );
    const visHigh = visibleBars.length ? Math.max(...visibleBars.map(b => b.high)) : centerPrice * 1.02;
    const visLow = visibleBars.length ? Math.min(...visibleBars.map(b => b.low)) : centerPrice * 0.98;
    const range = visHigh - visLow;

    if (drawingTool === 'horizontal') {
      onDrawingCreated?.({ tool: 'horizontal', points: [{ price: centerPrice }], color: drawingColor });
    } else if (drawingTool === 'trendline') {
      const p1 = { time: getBarDate(leftIdx), price: centerPrice + range * 0.1 };
      const p2 = { time: getBarDate(rightIdx), price: centerPrice - range * 0.1 };
      onDrawingCreated?.({ tool: 'trendline', points: [p1, p2], color: drawingColor });
    } else if (drawingTool === 'fibonacci') {
      const p1 = { time: getBarDate(leftIdx), price: visHigh - range * 0.15 };
      const p2 = { time: getBarDate(rightIdx), price: visLow + range * 0.15 };
      onDrawingCreated?.({ tool: 'fibonacci', points: [p1, p2], color: drawingColor });
    } else if (drawingTool === 'rectangle') {
      const p1 = { time: getBarDate(leftIdx), price: centerPrice + range * 0.1 };
      const p2 = { time: getBarDate(rightIdx), price: centerPrice - range * 0.1 };
      onDrawingCreated?.({ tool: 'rectangle', points: [p1, p2], color: drawingColor });
    } else if (drawingTool === 'text') {
      const text = prompt('Tekst invoeren:', 'Label');
      if (text) {
        onDrawingCreated?.({ tool: 'text', points: [{ time: getBarDate(midIdx), price: centerPrice }], color: drawingColor, text });
      }
    }

    // After placing, auto-switch to cursor for immediate dragging
    // Small timeout so the drawing is saved first
    setTimeout(() => {
      if (typeof handleDrawingToolChange === 'function') return; // handled by parent
    }, 50);

  }, [drawingTool]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle selection in cursor mode — click near a drawing to select it
  useEffect(() => {
    if (!chartRef.current || !candleSeriesRef.current || drawingTool !== 'cursor') return;
    const chart = chartRef.current;
    const series = candleSeriesRef.current;

    const handleCursorClick = (param) => {
      if (!param.point || !drawings?.length) { setSelectedDrawingId(null); return; }
      const clickPrice = series.coordinateToPrice(param.point.y);
      const clickX = param.point.x;
      if (clickPrice === null) { setSelectedDrawingId(null); return; }

      // Hit-test: find closest drawing within threshold
      let bestDist = 15; // pixel threshold
      let bestId = null;

      drawings.forEach(d => {
        if (d.tool === 'horizontal' && d.points?.[0]) {
          const yLine = series.priceToCoordinate(d.points[0].price);
          if (yLine !== null) {
            const dist = Math.abs(param.point.y - yLine);
            if (dist < bestDist) { bestDist = dist; bestId = d.id; }
          }
        } else if (d.tool === 'fibonacci' && d.points?.length >= 2) {
          // Hit-test against all fib level prices, not just anchors
          const high = Math.max(d.points[0].price, d.points[1].price);
          const low = Math.min(d.points[0].price, d.points[1].price);
          const diff = high - low;
          const fibLvls = d.meta?.fibLevels || FIB_LEVELS;
          fibLvls.forEach(fl => {
            if (fl.enabled === false) return;
            const price = high - diff * fl.level;
            const yLvl = series.priceToCoordinate(price);
            if (yLvl !== null) {
              const dist = Math.abs(param.point.y - yLvl);
              if (dist < bestDist) { bestDist = dist; bestId = d.id; }
            }
          });
          // Also check anchor points
          d.points.forEach(p => {
            const py2 = series.priceToCoordinate(p.price);
            if (py2 !== null) {
              const dist = Math.abs(param.point.y - py2);
              if (dist < bestDist) { bestDist = dist; bestId = d.id; }
            }
          });
        } else if ((d.tool === 'trendline' || d.tool === 'rectangle') && d.points?.length >= 2) {
          d.points.forEach(p => {
            const py2 = series.priceToCoordinate(p.price);
            if (py2 !== null) {
              const dist = Math.abs(param.point.y - py2);
              if (dist < bestDist) { bestDist = dist; bestId = d.id; }
            }
          });
        } else if (d.tool === 'text' && d.points?.[0]) {
          const yt = series.priceToCoordinate(d.points[0].price);
          if (yt !== null && Math.abs(param.point.y - yt) < 20) { bestDist = 5; bestId = d.id; }
        }
      });

      setSelectedDrawingId(bestId);
      onDrawingSelect?.(bestId);
    };

    chart.subscribeClick(handleCursorClick);
    return () => { try { chart.unsubscribeClick(handleCursorClick); } catch(e) {} };
  }, [drawingTool, drawings, onDrawingSelect]);

  // Drag system — mousedown on chart container, drag X+Y for all drawing handles
  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container || !candleSeriesRef.current || !chartRef.current) return;
    const series = candleSeriesRef.current;
    const chart = chartRef.current;

    const timeToX = (timeStr) => {
      if (!timeStr) return null;
      const ts = toTimestamp(timeStr);
      return chart.timeScale().timeToCoordinate(ts);
    };

    const xToTime = (x) => {
      const logical = chart.timeScale().coordinateToLogical(x);
      if (logical === null || !data || data.length === 0) return null;
      const idx = Math.max(0, Math.min(data.length - 1, Math.round(logical)));
      return data[idx]?.date || null;
    };

    const handleMouseDown = (e) => {
      if (!selectedDrawingId || drawingTool !== 'cursor') return;
      const drawing = drawings?.find(d => d.id === selectedDrawingId);
      if (!drawing || drawing.locked) return;

      const rect = container.getBoundingClientRect();
      const mouseY = e.clientY - rect.top;
      const mouseX = e.clientX - rect.left;

      let hitHandle = -1;
      const hitThreshold = 14;

      if (drawing.tool === 'horizontal') {
        const yLine = series.priceToCoordinate(drawing.points[0].price);
        if (yLine !== null && Math.abs(mouseY - yLine) < hitThreshold) hitHandle = 0;
      } else if (drawing.points?.length >= 2) {
        drawing.points.forEach((p, i) => {
          const py2 = series.priceToCoordinate(p.price);
          const px2 = p.time ? timeToX(p.time) : null;
          if (py2 !== null) {
            const distY = Math.abs(mouseY - py2);
            const distX = px2 !== null ? Math.abs(mouseX - px2) : 0;
            const dist = Math.sqrt(distX * distX + distY * distY);
            if (dist < hitThreshold * 1.5) hitHandle = i;
          }
        });
      } else if (drawing.tool === 'text' && drawing.points?.[0]) {
        const yt = series.priceToCoordinate(drawing.points[0].price);
        if (yt !== null && Math.abs(mouseY - yt) < 18) hitHandle = 0;
      }

      if (hitHandle >= 0) {
        e.preventDefault();
        e.stopPropagation();
        chart.applyOptions({ handleScroll: false, handleScale: false });
        dragRef.current = {
          active: true, drawingId: drawing.id, handleIndex: hitHandle,
          startY: mouseY, startX: mouseX,
          startPrice: drawing.points[hitHandle].price,
          startTime: drawing.points[hitHandle].time,
        };
        container.style.cursor = 'grabbing';
      }
    };

    const handleMouseMove = (e) => {
      if (!dragRef.current.active) return;
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const mouseY = e.clientY - rect.top;
      const mouseX = e.clientX - rect.left;
      const newPrice = series.coordinateToPrice(mouseY);
      const newTime = xToTime(mouseX);
      if (newPrice === null) return;

      const drawing = drawings?.find(d => d.id === dragRef.current.drawingId);
      if (!drawing || !drawing.points[dragRef.current.handleIndex]) return;

      // Update price (Y-axis)
      drawing.points[dragRef.current.handleIndex].price = newPrice;

      // Update time (X-axis) — for all tools except horizontal
      if (drawing.tool !== 'horizontal' && newTime) {
        drawing.points[dragRef.current.handleIndex].time = newTime;
      }

      // Force canvas redraw
      fibDrawingsRef.current = [...(drawings || [])];
    };

    const handleMouseUp = () => {
      if (!dragRef.current.active) return;
      const { drawingId } = dragRef.current;
      const drawing = drawings?.find(d => d.id === drawingId);
      if (drawing) {
        onDrawingUpdate?.(drawingId, { points: [...drawing.points] });
      }
      chart.applyOptions({ handleScroll: true, handleScale: true });
      dragRef.current = { active: false, drawingId: null, handleIndex: -1, startY: 0, startX: 0, startPrice: 0, startTime: null };
      container.style.cursor = '';
    };

    container.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      container.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [selectedDrawingId, drawings, drawingTool, onDrawingUpdate, data, toTimestamp]);

  return (
    <div className="flex flex-col h-full w-full">
      {/* Timeframe selector + indicator legend */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/5">
        <div className="flex items-center gap-1" data-testid="timeframe-selector">
          {TIMEFRAMES.map(tf => (
            <button
              key={tf.value}
              onClick={() => onTimeframeChange?.(tf.value)}
              className={`px-2.5 py-1 rounded text-[11px] font-mono font-medium transition-all ${
                activeTimeframe === tf.value
                  ? 'bg-white/10 text-white'
                  : 'text-slate-500 hover:text-white hover:bg-white/5'
              }`}
              data-testid={`timeframe-btn-${tf.value}`}
            >
              {tf.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-[10px]">
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-[#FBBF24] inline-block rounded" />EMA20</span>
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-[#22D3EE] inline-block rounded" />EMA50</span>
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-[#E879F9] inline-block rounded" />EMA200</span>
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-[#3B82F6] inline-block rounded" style={{borderStyle: 'dashed'}} />VWAP</span>
        </div>
      </div>

      {/* Order Block / FVG / SMC legend */}
      {indicators && (
        <div className="flex items-center gap-3 px-3 py-1 text-[10px] border-b border-white/5">
          {overlaySettings?.order_blocks !== false && indicators.order_blocks?.length > 0 && (
            <span className="text-[#22D3EE]">{indicators.order_blocks.length} OB</span>
          )}
          {overlaySettings?.fvg !== false && indicators.fvg_zones?.length > 0 && (
            <span className="text-[#E879F9]">{indicators.fvg_zones.length} FVG</span>
          )}
          {overlaySettings?.ifvg !== false && indicators.ifvg_zones?.length > 0 && (
            <span className="text-[#F59E0B]">{indicators.ifvg_zones.length} IFVG</span>
          )}
          {overlaySettings?.bos_choch !== false && indicators.bos_choch?.length > 0 && (
            <span className="text-slate-500">{indicators.bos_choch.length} BOS/CHoCH</span>
          )}
          {overlaySettings?.liquidity !== false && indicators.liquidity_sweeps?.length > 0 && (
            <span className="text-[#F59E0B]">{indicators.liquidity_sweeps.length} Sweeps</span>
          )}
        </div>
      )}

          {/* Chart canvas */}
      <div className="flex-1 w-full overflow-hidden min-w-0">
        <div ref={chartContainerRef} className="w-full h-full overflow-hidden" data-testid="trading-chart" style={{maxWidth: '100%'}} />
      </div>
    </div>
  );
};

export default TradingChart;
