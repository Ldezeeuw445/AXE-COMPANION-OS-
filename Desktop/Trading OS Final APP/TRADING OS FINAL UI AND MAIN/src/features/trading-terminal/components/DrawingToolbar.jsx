import React, { useState, useCallback } from 'react';
import { TrendingUp, Minus, RectangleHorizontal, Trash2, MousePointer, Type, Lock, Unlock, SlidersHorizontal } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import FibSettingsPanel from './FibSettingsPanel';

const TOOLS = [
  { id: 'cursor', icon: MousePointer, label: 'Select / Drag', color: '#94A3B8' },
  { id: 'trendline', icon: TrendingUp, label: 'Trend Line', color: '#3B82F6' },
  { id: 'horizontal', icon: Minus, label: 'Horizontal Line', color: '#F59E0B' },
  { id: 'fibonacci', icon: () => <span className="text-[11px] font-mono font-bold">Fib</span>, label: 'Fibonacci Retracement', color: '#E879F9' },
  { id: 'rectangle', icon: RectangleHorizontal, label: 'Rectangle Zone', color: '#22D3EE' },
  { id: 'text', icon: Type, label: 'Text Label', color: '#94A3B8' },
];

const COLORS = ['#3B82F6', '#00E676', '#FF3B30', '#F59E0B', '#E879F9', '#22D3EE', '#FFFFFF', '#888888'];

const DrawingToolbar = ({ activeTool, onToolChange, onClear, drawingCount, selectedDrawing, onColorChange, onLockToggle, onDeleteSelected, onDrawingUpdate }) => {
  const [showColors, setShowColors] = useState(false);
  const [activeColor, setActiveColor] = useState('#3B82F6');
  const [showFibSettings, setShowFibSettings] = useState(false);

  const handleToolClick = useCallback((toolId) => {
    onToolChange?.(toolId, activeColor);
  }, [onToolChange, activeColor]);

  const handleColorChange = useCallback((color) => {
    setActiveColor(color);
    setShowColors(false);
    if (selectedDrawing) {
      // Change color of selected drawing
      onColorChange?.(selectedDrawing.id, color);
    } else if (activeTool && activeTool !== 'cursor') {
      onToolChange?.(activeTool, color);
    }
  }, [activeTool, onToolChange, selectedDrawing, onColorChange]);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col gap-1 p-1.5" data-testid="drawing-toolbar">
        {TOOLS.map(tool => {
          const Icon = tool.icon;
          const isActive = activeTool === tool.id;
          return (
            <Tooltip key={tool.id}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => handleToolClick(tool.id)}
                  className={`w-8 h-8 rounded-md flex items-center justify-center transition-all ${
                    isActive ? 'bg-[#06b6d4]/15 text-[#06b6d4]' : 'text-white/25 hover:text-white/60 hover:bg-white/5'
                  }`}
                  data-testid={`drawing-tool-${tool.id}`}
                >
                  <Icon className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="bg-[#1E293B] border-white/10 text-white text-xs">
                {tool.label}
              </TooltipContent>
            </Tooltip>
          );
        })}

        <div className="w-6 mx-auto border-b border-white/10 my-1" />

        {/* Color picker */}
        <div className="relative">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setShowColors(!showColors)}
                className="w-8 h-8 rounded-md flex items-center justify-center hover:bg-white/5"
                data-testid="drawing-color-picker"
              >
                <div className="w-4 h-4 rounded-full border border-white/20" style={{ backgroundColor: selectedDrawing?.color || activeColor }} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="bg-[#1E293B] border-white/10 text-white text-xs">
              {selectedDrawing ? 'Change color' : 'Drawing color'}
            </TooltipContent>
          </Tooltip>
          {showColors && (
            <div className="absolute left-10 top-0 z-50 bg-[#111] border border-white/10 rounded-lg p-2 flex flex-col gap-1 shadow-xl">
              {COLORS.map(color => (
                <button
                  key={color}
                  onClick={() => handleColorChange(color)}
                  className={`w-6 h-6 rounded-full border-2 transition-all ${
                    (selectedDrawing?.color || activeColor) === color ? 'border-white scale-110' : 'border-white/20 hover:border-white/50'
                  }`}
                  style={{ backgroundColor: color }}
                  data-testid={`drawing-color-${color}`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Lock/Unlock selected drawing */}
        {selectedDrawing && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => onLockToggle?.(selectedDrawing.id, !selectedDrawing.locked)}
                className={`w-8 h-8 rounded-md flex items-center justify-center transition-all ${
                  selectedDrawing.locked ? 'text-[#F59E0B] bg-[#F59E0B]/10' : 'text-white/25 hover:text-white/60 hover:bg-white/5'
                }`}
                data-testid="drawing-lock-toggle"
              >
                {selectedDrawing.locked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="bg-[#1E293B] border-white/10 text-white text-xs">
              {selectedDrawing.locked ? 'Unlock drawing' : 'Lock drawing'}
            </TooltipContent>
          </Tooltip>
        )}

        {/* Fib Settings — only for fibonacci drawings */}
        {selectedDrawing?.tool === 'fibonacci' && (
          <div className="relative">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setShowFibSettings(!showFibSettings)}
                  className={`w-8 h-8 rounded-md flex items-center justify-center transition-all ${
                    showFibSettings ? 'text-[#F97316] bg-[#F97316]/10' : 'text-white/25 hover:text-white/60 hover:bg-white/5'
                  }`}
                  data-testid="fib-settings-toggle"
                >
                  <SlidersHorizontal className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="bg-[#1E293B] border-white/10 text-white text-xs">
                Fib Level Settings
              </TooltipContent>
            </Tooltip>
            <FibSettingsPanel
              isOpen={showFibSettings}
              drawing={selectedDrawing}
              onUpdate={onDrawingUpdate}
              onClose={() => setShowFibSettings(false)}
            />
          </div>
        )}

        {/* Delete selected drawing */}
        {selectedDrawing && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => onDeleteSelected?.(selectedDrawing.id)}
                className="w-8 h-8 rounded-md flex items-center justify-center text-white/25 hover:text-[#FF3B30] hover:bg-[#FF3B30]/10 transition-all"
                data-testid="drawing-delete-selected"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="bg-[#1E293B] border-white/10 text-white text-xs">
              Delete selected
            </TooltipContent>
          </Tooltip>
        )}

        <div className="w-6 mx-auto border-b border-white/10 my-1" />

        {/* Clear all */}
        {drawingCount > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={onClear} className="w-8 h-8 rounded-md flex items-center justify-center text-white/25 hover:text-[#FF3B30] hover:bg-white/5 transition-all" data-testid="drawing-clear-all">
                <Trash2 className="w-3.5 h-3.5" />
                <span className="text-[7px] ml-0.5">{drawingCount}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="bg-[#1E293B] border-white/10 text-white text-xs">
              Clear All ({drawingCount})
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
};

export default DrawingToolbar;
