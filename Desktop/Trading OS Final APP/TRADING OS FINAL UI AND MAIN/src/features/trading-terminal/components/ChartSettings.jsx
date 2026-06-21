import React, { useState } from 'react';
import { Settings, X } from 'lucide-react';
import { Button } from './ui/button';

const DEFAULT_COLORS = {
  candleUp: '#26a69a',
  candleDown: '#ef5350',
  wickUp: '#749f9370',
  wickDown: '#b75a5a70',
  background: 'transparent',
  gridColor: 'rgba(255,255,255,0.03)',
  textColor: '#94A3B8',
  crosshairColor: 'rgba(255,255,255,0.2)',
  ema20: '#FBBF24',
  ema50: '#22D3EE',
  ema200: '#E879F9',
  vwap: '#06b6d4',
};

const COLOR_PRESETS = [
  { name: 'Default', colors: DEFAULT_COLORS },
  { name: 'Classic', colors: { ...DEFAULT_COLORS, candleUp: '#00E676', candleDown: '#FF3B30', wickUp: '#00E67699', wickDown: '#FF3B3099' } },
  { name: 'Mono', colors: { ...DEFAULT_COLORS, candleUp: '#FFFFFF', candleDown: '#666666', wickUp: '#FFFFFF80', wickDown: '#66666680', ema20: '#FFFFFF', ema50: '#AAAAAA', ema200: '#666666' } },
  { name: 'Ocean', colors: { ...DEFAULT_COLORS, candleUp: '#06b6d4', candleDown: '#f97316', wickUp: '#06b6d499', wickDown: '#f9731699', ema20: '#06b6d4', ema50: '#3b82f6', ema200: '#8b5cf6' } },
];

const ChartSettings = ({ isOpen, onClose, chartColors, onColorsChange }) => {
  const [colors, setColors] = useState(chartColors || DEFAULT_COLORS);

  const handleColorChange = (key, value) => {
    const updated = { ...colors, [key]: value };
    setColors(updated);
    onColorsChange?.(updated);
  };

  const applyPreset = (preset) => {
    setColors(preset.colors);
    onColorsChange?.(preset.colors);
  };

  if (!isOpen) return null;

  const colorFields = [
    { key: 'candleUp', label: 'Candle Up' },
    { key: 'candleDown', label: 'Candle Down' },
    { key: 'ema20', label: 'EMA 20' },
    { key: 'ema50', label: 'EMA 50' },
    { key: 'ema200', label: 'EMA 200' },
    { key: 'vwap', label: 'VWAP' },
  ];

  return (
    <div className="absolute right-0 top-full mt-2 z-50 w-64 glass-panel shadow-2xl animate-fade-in" data-testid="chart-settings">
      <div className="p-3 border-b border-white/[0.04] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-[#06b6d4]" />
          <span className="font-heading font-medium text-sm">Chart Colors</span>
        </div>
        <button onClick={onClose} className="text-white/30 hover:text-white" data-testid="chart-settings-close">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-3 space-y-3">
        {/* Presets */}
        <div>
          <span className="text-[9px] uppercase tracking-widest text-white/30 font-semibold">Presets</span>
          <div className="flex gap-1.5 mt-1.5">
            {COLOR_PRESETS.map(preset => (
              <button
                key={preset.name}
                onClick={() => applyPreset(preset)}
                className="px-2 py-1 rounded text-[10px] font-medium transition-all bg-white/[0.04] border border-white/[0.04] text-white/60 hover:border-[#06b6d4]/30 hover:text-white"
                data-testid={`preset-${preset.name.toLowerCase()}`}
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>

        {/* Color pickers */}
        <div className="space-y-2">
          {colorFields.map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-[10px] text-white/40">{label}</span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={colors[key]}
                  onChange={e => handleColorChange(key, e.target.value)}
                  className="w-6 h-6 rounded cursor-pointer bg-transparent border border-white/10"
                  data-testid={`color-${key}`}
                />
                <span className="text-[9px] font-mono text-white/30">{colors[key]}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export { DEFAULT_COLORS };
export default ChartSettings;
