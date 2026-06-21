import React from 'react';
import { Switch } from './ui/switch';
import { X, EyeOff, Eye } from 'lucide-react';
import { ScrollArea } from './ui/scroll-area';

const SECTIONS = [
  {
    title: 'Price Action',
    items: [
      { key: 'bos_choch', label: 'Market Structure (BOS/CHoCH)', colorKey: 'bosColor' },
      { key: 'swing_structure', label: 'Swing Points (HH/HL/LH/LL)', colorKey: 'swingColor' },
      { key: 'order_blocks', label: 'Order Blocks', colorKey: 'obBullColor', colorKey2: 'obBearColor' },
      { key: 'fvg', label: 'Fair Value Gaps (FVG)', colorKey: 'fvgBullColor', colorKey2: 'fvgBearColor' },
      { key: 'ifvg', label: 'Inverse FVG (IFVG)', colorKey: 'ifvgColor' },
      { key: 'liquidity', label: 'Liquidity Sweeps', colorKey: 'liqColor' },
      { key: 'auto_fib', label: 'Auto Fibonacci', colorKey: 'fibColor' },
    ],
  },
  {
    title: 'Levels',
    items: [
      { key: 'support_resistance', label: 'Support / Resistance', colorKey: 'supportColor', colorKey2: 'resistanceColor' },
      { key: 'pdhl', label: 'Previous Day H/L', colorKey: 'pdhlColor' },
      { key: 'pwhl', label: 'Previous Week H/L', colorKey: 'pwhlColor' },
      { key: 'pmhl', label: 'Previous Month H/L', colorKey: 'pmhlColor' },
      { key: 'pqhl', label: 'Previous Quarter H/L', colorKey: 'pqhlColor' },
    ],
  },
  {
    title: 'Indicators',
    items: [
      { key: 'ema20', label: 'EMA 20', colorKey: 'ema20' },
      { key: 'ema50', label: 'EMA 50', colorKey: 'ema50' },
      { key: 'ema200', label: 'EMA 200', colorKey: 'ema200' },
      { key: 'vwap', label: 'VWAP', colorKey: 'vwap' },
      { key: 'volume', label: 'Volume' },
    ],
  },
];

const DEFAULT_INDICATOR_COLORS = {
  bosColor: '#06b6d4',
  swingColor: '#64748b',
  obBullColor: '#26a69a',
  obBearColor: '#ef5350',
  fvgBullColor: '#26a69a',
  fvgBearColor: '#ef5350',
  ifvgColor: '#F59E0B',
  liqColor: '#ab47bc',
  fibColor: '#7c4dff',
  supportColor: '#26a69a',
  resistanceColor: '#ef5350',
  pdhlColor: '#78909c',
  pwhlColor: '#5c6bc0',
  pmhlColor: '#ab47bc',
  pqhlColor: '#f57c00',
  ema20: '#ffb74d',
  ema50: '#4dd0e1',
  ema200: '#ce93d8',
  vwap: '#42a5f5',
};

const SmartMoneyOverlay = ({ isOpen, onClose, overlaySettings, onSettingsChange, obLimit, fvgLimit, onObLimitChange, onFvgLimitChange, indicatorColors, onIndicatorColorsChange }) => {
  if (!isOpen) return null;

  const colors = { ...DEFAULT_INDICATOR_COLORS, ...indicatorColors };

  const handleToggle = (key) => {
    onSettingsChange({ ...overlaySettings, [key]: !overlaySettings[key] });
  };

  const handleColorChange = (colorKey, value) => {
    onIndicatorColorsChange?.({ ...colors, [colorKey]: value });
  };

  // Check if everything is off
  const allOff = Object.values(overlaySettings).every(v => v === false);

  const toggleAll = () => {
    const newState = {};
    const keys = SECTIONS.flatMap(s => s.items.map(i => i.key));
    keys.forEach(k => { newState[k] = allOff ? true : false; });
    onSettingsChange(newState);
  };

  return (
    <div className="absolute right-0 top-full mt-2 z-50 w-80 glass-panel shadow-2xl animate-fade-in" data-testid="smc-overlay-panel">
      <div className="p-3 border-b border-white/[0.04] flex items-center justify-between">
        <span className="font-heading font-medium text-sm text-white/80">Smart Money Overlay</span>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleAll}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider hover:bg-white/5 transition-all"
            style={{ color: allOff ? '#22c55e' : '#ef4444' }}
            data-testid="smc-toggle-all"
          >
            {allOff ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            {allOff ? 'Show All' : 'Clear All'}
          </button>
          <button onClick={onClose} className="text-white/20 hover:text-white" data-testid="smc-overlay-close">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <ScrollArea className="max-h-[450px]">
        <div className="p-3 space-y-4">
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <h4 className="text-[9px] font-bold uppercase tracking-widest text-[#06b6d4] mb-2">{section.title}</h4>
              <div className="space-y-1.5">
                {section.items.map((item) => (
                  <div key={item.key} className="flex items-center justify-between py-1 group" data-testid={`smc-toggle-${item.key}`}>
                    <div className="flex items-center gap-2">
                      {/* Color pickers */}
                      {item.colorKey && (
                        <input
                          type="color"
                          value={colors[item.colorKey]?.substring(0, 7) || colors[item.colorKey] || '#000000'}
                          onChange={e => handleColorChange(item.colorKey, e.target.value)}
                          className="w-4 h-4 rounded cursor-pointer bg-transparent border-0 p-0"
                          title={`${item.label} color`}
                          data-testid={`smc-color-${item.colorKey}`}
                        />
                      )}
                      {item.colorKey2 && (
                        <input
                          type="color"
                          value={colors[item.colorKey2]?.substring(0, 7) || colors[item.colorKey2] || '#000000'}
                          onChange={e => handleColorChange(item.colorKey2, e.target.value)}
                          className="w-4 h-4 rounded cursor-pointer bg-transparent border-0 p-0"
                          title={`${item.label} 2nd color`}
                          data-testid={`smc-color-${item.colorKey2}`}
                        />
                      )}
                      <span className="text-[11px] text-white/60 group-hover:text-white/80 transition-colors">{item.label}</span>
                    </div>
                    <Switch
                      checked={overlaySettings[item.key] !== false}
                      onCheckedChange={() => handleToggle(item.key)}
                      className="data-[state=checked]:bg-[#06b6d4] h-4 w-7"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Count Limits */}
          <div>
            <h4 className="text-[9px] font-bold uppercase tracking-widest text-[#F59E0B] mb-2">Count Limits</h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-white/60">Order Blocks (max)</span>
                <div className="flex items-center gap-1">
                  {[1, 2, 5, 10].map(n => (
                    <button
                      key={n}
                      onClick={() => onObLimitChange(n)}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                        obLimit === n ? 'bg-white/10 text-white' : 'text-white/30 hover:text-white'
                      }`}
                      data-testid={`ob-limit-${n}`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-white/60">FVG Zones (max)</span>
                <div className="flex items-center gap-1">
                  {[1, 2, 5, 10].map(n => (
                    <button
                      key={n}
                      onClick={() => onFvgLimitChange(n)}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                        fvgLimit === n ? 'bg-white/10 text-white' : 'text-white/30 hover:text-white'
                      }`}
                      data-testid={`fvg-limit-${n}`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
};

export { DEFAULT_INDICATOR_COLORS };
export default SmartMoneyOverlay;
