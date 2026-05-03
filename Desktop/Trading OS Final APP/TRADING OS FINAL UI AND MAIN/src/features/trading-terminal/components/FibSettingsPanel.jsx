import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, RotateCcw } from 'lucide-react';
import { Switch } from './ui/switch';
import { ScrollArea } from './ui/scroll-area';

const DEFAULT_FIB_LEVELS = [
  { level: 0,     color: '#888888', lineWidth: 1,   enabled: true },
  { level: 0.236, color: '#888888', lineWidth: 0.5, enabled: true },
  { level: 0.382, color: '#5B8DEF', lineWidth: 0.5, enabled: true },
  { level: 0.5,   color: '#5B8DEF', lineWidth: 1,   enabled: true },
  { level: 0.618, color: '#F97316', lineWidth: 1.5, enabled: true },
  { level: 0.65,  color: '#F97316', lineWidth: 1.5, enabled: true },
  { level: 0.786, color: '#5B8DEF', lineWidth: 0.5, enabled: true },
  { level: 1.0,   color: '#888888', lineWidth: 1,   enabled: true },
];

const FibSettingsPanel = ({ isOpen, drawing, onUpdate, onClose }) => {
  const [levels, setLevels] = useState(DEFAULT_FIB_LEVELS);
  const [newLevel, setNewLevel] = useState('');

  // Load from drawing meta on open
  useEffect(() => {
    if (drawing?.meta?.fibLevels) {
      setLevels(drawing.meta.fibLevels);
    } else {
      setLevels(DEFAULT_FIB_LEVELS);
    }
  }, [drawing?.id, drawing?.meta?.fibLevels]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen || !drawing) return null;

  const save = (updated) => {
    setLevels(updated);
    onUpdate?.(drawing.id, { meta: { ...drawing.meta, fibLevels: updated } });
  };

  const toggleLevel = (idx) => {
    const updated = levels.map((l, i) => i === idx ? { ...l, enabled: !l.enabled } : l);
    save(updated);
  };

  const changeColor = (idx, color) => {
    const updated = levels.map((l, i) => i === idx ? { ...l, color } : l);
    save(updated);
  };

  const changeWidth = (idx, lineWidth) => {
    const updated = levels.map((l, i) => i === idx ? { ...l, lineWidth } : l);
    save(updated);
  };

  const removeLevel = (idx) => {
    const updated = levels.filter((_, i) => i !== idx);
    save(updated);
  };

  const addLevel = () => {
    const val = parseFloat(newLevel);
    if (isNaN(val) || val < 0 || val > 10) return;
    // Accept both decimal (0.382, 1.618) and percentage (38.2) formats
    // Values > 2 are treated as percentages (e.g., 38.2 → 0.382)
    // Values <= 2 are kept as-is (e.g., 0.382, 1.618 for extensions)
    const frac = val > 2 ? val / 100 : val;
    if (levels.some(l => Math.abs(l.level - frac) < 0.001)) return; // duplicate
    const updated = [...levels, { level: frac, color: '#5B8DEF', lineWidth: 0.5, enabled: true }]
      .sort((a, b) => a.level - b.level);
    save(updated);
    setNewLevel('');
  };

  const resetDefaults = () => {
    save([...DEFAULT_FIB_LEVELS]);
  };

  return (
    <div className="absolute left-full top-0 ml-2 z-50 w-[280px] bg-[#0a0a0a] border border-white/10 rounded-lg shadow-2xl" data-testid="fib-settings-panel">
      {/* Header */}
      <div className="px-3 py-2 border-b border-white/[0.06] flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-widest text-[#F97316]">Fib Levels</span>
        <div className="flex items-center gap-1.5">
          <button onClick={resetDefaults} className="text-white/20 hover:text-white p-0.5" title="Reset to defaults" data-testid="fib-reset-defaults">
            <RotateCcw className="w-3 h-3" />
          </button>
          <button onClick={onClose} className="text-white/20 hover:text-white p-0.5" data-testid="fib-settings-close">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Levels list */}
      <ScrollArea className="max-h-[320px]">
        <div className="p-2 space-y-0.5">
          {levels.map((fl, idx) => (
            <div key={`${fl.level}-${idx}`} className={`flex items-center gap-1.5 px-2 py-1 rounded transition-all ${fl.enabled ? 'bg-white/[0.02]' : 'opacity-40'}`} data-testid={`fib-level-${fl.level}`}>
              {/* Toggle */}
              <Switch
                checked={fl.enabled}
                onCheckedChange={() => toggleLevel(idx)}
                className="data-[state=checked]:bg-[#06b6d4] h-3.5 w-6 flex-shrink-0"
              />
              {/* Color picker */}
              <input
                type="color"
                value={fl.color}
                onChange={e => changeColor(idx, e.target.value)}
                className="w-5 h-5 rounded cursor-pointer bg-transparent border-0 p-0 flex-shrink-0"
                data-testid={`fib-color-${fl.level}`}
              />
              {/* Level percentage */}
              <span className="text-[11px] font-mono text-white/70 w-[52px] flex-shrink-0">
                {(fl.level * 100).toFixed(fl.level === 0 || fl.level === 1 ? 1 : 1)}%
              </span>
              {/* Line width */}
              <select
                value={fl.lineWidth}
                onChange={e => changeWidth(idx, parseFloat(e.target.value))}
                className="bg-transparent text-[10px] font-mono text-white/40 border-0 focus:outline-none cursor-pointer flex-shrink-0"
                data-testid={`fib-width-${fl.level}`}
              >
                <option value="0.5" className="bg-[#111]">Thin</option>
                <option value="1" className="bg-[#111]">Normal</option>
                <option value="1.5" className="bg-[#111]">Thick</option>
                <option value="2" className="bg-[#111]">Bold</option>
              </select>
              {/* Color preview bar */}
              <div className="flex-1 h-[1px] rounded" style={{ backgroundColor: fl.color, height: Math.max(fl.lineWidth, 1) }} />
              {/* Remove (only custom levels) */}
              {![0, 0.236, 0.382, 0.5, 0.618, 0.65, 0.786, 1.0].some(d => Math.abs(d - fl.level) < 0.001) && (
                <button onClick={() => removeLevel(idx)} className="text-white/15 hover:text-[#FF3B30] flex-shrink-0" data-testid={`fib-remove-${fl.level}`}>
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Add custom level */}
      <div className="px-3 py-2 border-t border-white/[0.06] flex items-center gap-1.5">
        <input
          value={newLevel}
          onChange={e => setNewLevel(e.target.value)}
          placeholder="e.g. 1.618"
          className="flex-1 bg-white/[0.03] text-[11px] font-mono text-white px-2 py-1 rounded border border-white/10 focus:outline-none focus:border-[#06b6d4]/50 placeholder-white/20"
          onKeyDown={e => { if (e.key === 'Enter') addLevel(); }}
          data-testid="fib-add-level-input"
        />
        <button
          onClick={addLevel}
          className="px-2 py-1 rounded bg-[#06b6d4]/10 text-[#06b6d4] text-[10px] font-bold hover:bg-[#06b6d4]/20 transition-all flex items-center gap-0.5"
          data-testid="fib-add-level-btn"
        >
          <Plus className="w-3 h-3" />
          Add
        </button>
      </div>
    </div>
  );
};

export { DEFAULT_FIB_LEVELS };
export default FibSettingsPanel;
