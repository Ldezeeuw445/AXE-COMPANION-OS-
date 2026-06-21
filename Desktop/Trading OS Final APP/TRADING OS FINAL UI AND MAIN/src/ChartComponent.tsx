import { useEffect, useRef } from 'react';
import { createChart, ColorType, CandlestickSeries, LineSeries } from 'lightweight-charts';

// Mock candlestick data for EUR/USD
const candleData = [
  { time: '2024-01-01', open: 1.1040, high: 1.1080, low: 1.1020, close: 1.1060 },
  { time: '2024-01-02', open: 1.1060, high: 1.1100, low: 1.1045, close: 1.1085 },
  { time: '2024-01-03', open: 1.1085, high: 1.1120, low: 1.1070, close: 1.1095 },
  { time: '2024-01-04', open: 1.1095, high: 1.1110, low: 1.1060, close: 1.1070 },
  { time: '2024-01-05', open: 1.1070, high: 1.1085, low: 1.1040, close: 1.1050 },
  { time: '2024-01-08', open: 1.1050, high: 1.1070, low: 1.1020, close: 1.1065 },
  { time: '2024-01-09', open: 1.1065, high: 1.1100, low: 1.1050, close: 1.1090 },
  { time: '2024-01-10', open: 1.1090, high: 1.1130, low: 1.1080, close: 1.1120 },
  { time: '2024-01-11', open: 1.1120, high: 1.1150, low: 1.1100, close: 1.1135 },
  { time: '2024-01-12', open: 1.1135, high: 1.1140, low: 1.1090, close: 1.1100 },
  { time: '2024-01-15', open: 1.1100, high: 1.1120, low: 1.1070, close: 1.1080 },
  { time: '2024-01-16', open: 1.1080, high: 1.1100, low: 1.1060, close: 1.1090 },
  { time: '2024-01-17', open: 1.1090, high: 1.1110, low: 1.1075, close: 1.1105 },
  { time: '2024-01-18', open: 1.1105, high: 1.1130, low: 1.1090, close: 1.1115 },
  { time: '2024-01-19', open: 1.1115, high: 1.1120, low: 1.1080, close: 1.1090 },
  { time: '2024-01-22', open: 1.1090, high: 1.1100, low: 1.1050, close: 1.1060 },
  { time: '2024-01-23', open: 1.1060, high: 1.1080, low: 1.1040, close: 1.1070 },
  { time: '2024-01-24', open: 1.1070, high: 1.1090, low: 1.1060, close: 1.1085 },
  { time: '2024-01-25', open: 1.1085, high: 1.1100, low: 1.1070, close: 1.1095 },
  { time: '2024-01-26', open: 1.1095, high: 1.1100, low: 1.1060, close: 1.1070 },
  { time: '2024-01-29', open: 1.1070, high: 1.1080, low: 1.1040, close: 1.1050 },
  { time: '2024-01-30', open: 1.1050, high: 1.1060, low: 1.1020, close: 1.1030 },
  { time: '2024-01-31', open: 1.1030, high: 1.1050, low: 1.1010, close: 1.1040 },
  { time: '2024-02-01', open: 1.1040, high: 1.1070, low: 1.1030, close: 1.1065 },
  { time: '2024-02-02', open: 1.1065, high: 1.1080, low: 1.1050, close: 1.1070 },
  { time: '2024-02-05', open: 1.1070, high: 1.1090, low: 1.1060, close: 1.1080 },
  { time: '2024-02-06', open: 1.1080, high: 1.1100, low: 1.1070, close: 1.1095 },
  { time: '2024-02-07', open: 1.1095, high: 1.1120, low: 1.1080, close: 1.1110 },
  { time: '2024-02-08', open: 1.1110, high: 1.1130, low: 1.1100, close: 1.1120 },
  { time: '2024-02-09', open: 1.1120, high: 1.1140, low: 1.1100, close: 1.1110 },
  { time: '2024-02-12', open: 1.1110, high: 1.1120, low: 1.1080, close: 1.1090 },
  { time: '2024-02-13', open: 1.1090, high: 1.1100, low: 1.1060, close: 1.1070 },
  { time: '2024-02-14', open: 1.1070, high: 1.1085, low: 1.1050, close: 1.1060 },
  { time: '2024-02-15', open: 1.1060, high: 1.1080, low: 1.1040, close: 1.1050 },
  { time: '2024-02-16', open: 1.1050, high: 1.1070, low: 1.1030, close: 1.1065 },
  { time: '2024-02-19', open: 1.1065, high: 1.1080, low: 1.1050, close: 1.1075 },
  { time: '2024-02-20', open: 1.1075, high: 1.1100, low: 1.1060, close: 1.1090 },
  { time: '2024-02-21', open: 1.1090, high: 1.1110, low: 1.1080, close: 1.1100 },
  { time: '2024-02-22', open: 1.1100, high: 1.1120, low: 1.1090, close: 1.1115 },
  { time: '2024-02-23', open: 1.1115, high: 1.1130, low: 1.1100, close: 1.1120 },
  { time: '2024-02-26', open: 1.1120, high: 1.1140, low: 1.1110, close: 1.1130 },
  { time: '2024-02-27', open: 1.1130, high: 1.1150, low: 1.1120, close: 1.1140 },
  { time: '2024-02-28', open: 1.1140, high: 1.1160, low: 1.1130, close: 1.1150 },
  { time: '2024-02-29', open: 1.1150, high: 1.1170, low: 1.1140, close: 1.1160 },
  { time: '2024-03-01', open: 1.1160, high: 1.1180, low: 1.1150, close: 1.1170 },
  { time: '2024-03-04', open: 1.1170, high: 1.1190, low: 1.1160, close: 1.1180 },
  { time: '2024-03-05', open: 1.1180, high: 1.1200, low: 1.1170, close: 1.1190 },
  { time: '2024-03-06', open: 1.1190, high: 1.1210, low: 1.1180, close: 1.1200 },
  { time: '2024-03-07', open: 1.1200, high: 1.1220, low: 1.1190, close: 1.1210 },
  { time: '2024-03-08', open: 1.1210, high: 1.1230, low: 1.1200, close: 1.1220 },
  { time: '2024-03-11', open: 1.1220, high: 1.1240, low: 1.1210, close: 1.1230 },
  { time: '2024-03-12', open: 1.1230, high: 1.1250, low: 1.1220, close: 1.1240 },
  { time: '2024-03-13', open: 1.1240, high: 1.1260, low: 1.1230, close: 1.1250 },
  { time: '2024-03-14', open: 1.1250, high: 1.1270, low: 1.1240, close: 1.1260 },
  { time: '2024-03-15', open: 1.1260, high: 1.1280, low: 1.1250, close: 1.1270 },
  { time: '2024-03-18', open: 1.1270, high: 1.1290, low: 1.1260, close: 1.1280 },
  { time: '2024-03-19', open: 1.1280, high: 1.1300, low: 1.1270, close: 1.1290 },
  { time: '2024-03-20', open: 1.1290, high: 1.1310, low: 1.1280, close: 1.1300 },
  { time: '2024-03-21', open: 1.1300, high: 1.1300, low: 1.1250, close: 1.1260 },
  { time: '2024-03-22', open: 1.1260, high: 1.1270, low: 1.1220, close: 1.1230 },
  { time: '2024-03-25', open: 1.1230, high: 1.1250, low: 1.1220, close: 1.1240 },
  { time: '2024-03-26', open: 1.1240, high: 1.1260, low: 1.1230, close: 1.1250 },
  { time: '2024-03-27', open: 1.1250, high: 1.1270, low: 1.1240, close: 1.1260 },
  { time: '2024-03-28', open: 1.1260, high: 1.1280, low: 1.1250, close: 1.1270 },
  { time: '2024-03-29', open: 1.1270, high: 1.1290, low: 1.1260, close: 1.1280 },
  { time: '2024-04-01', open: 1.1280, high: 1.1300, low: 1.1270, close: 1.1290 },
  { time: '2024-04-02', open: 1.1290, high: 1.1280, low: 1.1240, close: 1.1250 },
  { time: '2024-04-03', open: 1.1250, high: 1.1260, low: 1.1220, close: 1.1230 },
  { time: '2024-04-04', open: 1.1230, high: 1.1240, low: 1.1200, close: 1.1210 },
  { time: '2024-04-05', open: 1.1210, high: 1.1220, low: 1.1180, close: 1.1190 },
  { time: '2024-04-08', open: 1.1190, high: 1.1200, low: 1.1160, close: 1.1170 },
  { time: '2024-04-09', open: 1.1170, high: 1.1180, low: 1.1140, close: 1.1150 },
  { time: '2024-04-10', open: 1.1150, high: 1.1170, low: 1.1140, close: 1.1160 },
  { time: '2024-04-11', open: 1.1160, high: 1.1180, low: 1.1150, close: 1.1170 },
  { time: '2024-04-12', open: 1.1170, high: 1.1190, low: 1.1160, close: 1.1180 },
  { time: '2024-04-15', open: 1.1180, high: 1.1160, low: 1.1120, close: 1.1130 },
  { time: '2024-04-16', open: 1.1130, high: 1.1140, low: 1.1100, close: 1.1110 },
  { time: '2024-04-17', open: 1.1110, high: 1.1120, low: 1.1080, close: 1.1090 },
  { time: '2024-04-18', open: 1.1090, high: 1.1100, low: 1.1070, close: 1.1080 },
  { time: '2024-04-19', open: 1.1080, high: 1.1090, low: 1.1060, close: 1.1070 },
];

function ChartComponent() {
  const chartContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0a0a0a' },
        textColor: 'rgba(255, 255, 255, 0.5)',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.03)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.03)' },
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: 'rgba(6, 182, 212, 0.5)',
          width: 1,
          style: 2,
          labelBackgroundColor: '#06b6d4',
        },
        horzLine: {
          color: 'rgba(6, 182, 212, 0.5)',
          width: 1,
          style: 2,
          labelBackgroundColor: '#06b6d4',
        },
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.05)',
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.05)',
        timeVisible: false,
      },
      handleScroll: {
        vertTouchDrag: false,
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });

    candleSeries.setData(candleData);

    // Add EMA 20 line
    const ema20 = chart.addSeries(LineSeries, {
      color: '#eab308',
      lineWidth: 1,
      title: 'EMA 20',
    });
    
    const ema20Data = candleData.map((d, i) => {
      const slice = candleData.slice(Math.max(0, i - 19), i + 1);
      const avg = slice.reduce((sum, c) => sum + c.close, 0) / slice.length;
      return { time: d.time, value: avg };
    });
    ema20.setData(ema20Data);

    // Fit content
    chart.timeScale().fitContent();

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  return (
    <div 
      ref={chartContainerRef} 
      style={{ 
        width: '100%', 
        height: '100%', 
        background: '#0a0a0a',
        border: 'none',
      }} 
    />
  );
}

export default ChartComponent;
