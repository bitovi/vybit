import { useState, type ReactNode } from 'react';
import type { DrawingTool } from './types';
import { BASIC_COLORS } from './types';

const CursorIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 3l14 8-6 2-4 6z" />
    <path d="M13 13l6 6" />
  </svg>
);

const EraserIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m7 21-4-4 9.5-9.5 5.5 5.5L7 21Z" />
    <path d="M22 21H7" />
    <path d="m11.5 12.5 5.5 5.5" />
  </svg>
);

const TrashIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14H6L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4h6v2" />
  </svg>
);

interface CanvasToolbarProps {
  activeTool: DrawingTool;
  onToolChange: (tool: DrawingTool) => void;
  fillColor: string;
  onFillChange: (color: string) => void;
  strokeColor: string;
  onStrokeChange: (color: string) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
}

const TOOLS: { id: DrawingTool; label: string; icon: ReactNode }[] = [
  { id: 'select', label: 'Select', icon: <CursorIcon /> },
  { id: 'freehand', label: 'Freehand', icon: '✎' },
  { id: 'rectangle', label: 'Rectangle', icon: '□' },
  { id: 'circle', label: 'Circle', icon: '○' },
  { id: 'line', label: 'Line', icon: '╱' },
  { id: 'arrow', label: 'Arrow', icon: '→' },
  { id: 'text', label: 'Text', icon: 'T' },
  { id: 'eraser', label: 'Eraser', icon: <EraserIcon /> },
];

export function CanvasToolbar({
  activeTool,
  onToolChange,
  fillColor,
  onFillChange,
  strokeColor,
  onStrokeChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onClear,
}: CanvasToolbarProps) {
  const [showFillPalette, setShowFillPalette] = useState(false);
  const [showStrokePalette, setShowStrokePalette] = useState(false);

  return (
    <div className="flex items-center gap-0.5 px-1.5 py-1 bg-bv-bg border-b border-bv-border text-[10px] shrink-0 flex-wrap">
      {TOOLS.map(tool => (
        <button
          key={tool.id}
          title={tool.label}
          onClick={() => onToolChange(tool.id)}
          className={`w-7 h-[26px] rounded border flex items-center justify-center text-[13px] cursor-pointer transition-all
            ${activeTool === tool.id
              ? 'bg-bv-teal/10 border-bv-teal text-bv-teal'
              : 'bg-transparent border-transparent text-bv-text-mid hover:bg-bv-surface hover:border-bv-border hover:text-bv-text'
            }`}
        >
          {tool.icon}
        </button>
      ))}

      <div className="w-px h-[18px] bg-bv-border mx-1" />

      {/* Fill color */}
      <span className="text-[9px] font-mono text-bv-muted ml-0.5 mr-1">Fill</span>
      <div className="relative">
        <button
          className="w-5 h-5 rounded border-2 border-bv-border cursor-pointer transition-all hover:border-bv-teal hover:scale-110"
          style={{ background: fillColor === 'transparent' ? 'repeating-conic-gradient(#ddd 0% 25%, white 0% 50%) 50%/8px 8px' : fillColor }}
          onClick={() => { setShowFillPalette(!showFillPalette); setShowStrokePalette(false); }}
        />
        {showFillPalette && (
          <div className="absolute top-full left-0 mt-1 z-50 bg-bv-bg border border-bv-border rounded-lg shadow-lg p-2 w-[164px]">
            <div className="text-[9px] font-semibold uppercase tracking-wider text-bv-muted mb-1.5">Fill Color</div>
            <div className="grid grid-cols-6 gap-1 mb-2">
              {BASIC_COLORS.map(c => (
                <button
                  key={c}
                  className={`w-[22px] h-[22px] rounded cursor-pointer transition-all hover:scale-110
                    ${fillColor === c ? 'ring-2 ring-bv-teal ring-offset-1' : 'border border-black/10'}`}
                  style={{ background: c }}
                  onClick={() => { onFillChange(c); setShowFillPalette(false); }}
                />
              ))}
            </div>
            <div className="pt-1 border-t border-bv-border flex items-center gap-1.5">
              <button
                className={`w-[22px] h-[22px] rounded cursor-pointer border border-bv-border
                  ${fillColor === 'transparent' ? 'ring-2 ring-bv-teal ring-offset-1' : ''}`}
                style={{ background: 'repeating-conic-gradient(#ddd 0% 25%, white 0% 50%) 50%/8px 8px' }}
                onClick={() => { onFillChange('transparent'); setShowFillPalette(false); }}
              />
              <span className="text-[9px] text-bv-muted">None</span>
            </div>
          </div>
        )}
      </div>

      {/* Stroke color */}
      <span className="text-[9px] font-mono text-bv-muted ml-1.5 mr-1">Stroke</span>
      <div className="relative">
        <button
          className="w-5 h-5 rounded border-2 border-bv-border cursor-pointer transition-all hover:border-bv-teal hover:scale-110"
          style={{ background: strokeColor }}
          onClick={() => { setShowStrokePalette(!showStrokePalette); setShowFillPalette(false); }}
        />
        {showStrokePalette && (
          <div className="absolute top-full left-0 mt-1 z-50 bg-bv-bg border border-bv-border rounded-lg shadow-lg p-2 w-[164px]">
            <div className="text-[9px] font-semibold uppercase tracking-wider text-bv-muted mb-1.5">Stroke Color</div>
            <div className="grid grid-cols-6 gap-1">
              {BASIC_COLORS.map(c => (
                <button
                  key={c}
                  className={`w-[22px] h-[22px] rounded cursor-pointer transition-all hover:scale-110
                    ${strokeColor === c ? 'ring-2 ring-bv-teal ring-offset-1' : 'border border-black/10'}`}
                  style={{ background: c }}
                  onClick={() => { onStrokeChange(c); setShowStrokePalette(false); }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="w-px h-[18px] bg-bv-border mx-1" />

      {/* Undo/Redo/Clear */}
      <button
        title="Undo"
        onClick={onUndo}
        disabled={!canUndo}
        className={`w-7 h-[26px] rounded border border-transparent flex items-center justify-center text-[13px] cursor-pointer transition-all
          ${!canUndo ? 'opacity-35 cursor-default' : 'text-bv-text-mid hover:bg-bv-surface hover:border-bv-border hover:text-bv-text'}`}
      >
        ↶
      </button>
      <button
        title="Redo"
        onClick={onRedo}
        disabled={!canRedo}
        className={`w-7 h-[26px] rounded border border-transparent flex items-center justify-center text-[13px] cursor-pointer transition-all
          ${!canRedo ? 'opacity-35 cursor-default' : 'text-bv-text-mid hover:bg-bv-surface hover:border-bv-border hover:text-bv-text'}`}
      >
        ↷
      </button>
      <button
        title="Clear canvas"
        onClick={onClear}
        className="w-7 h-[26px] rounded border border-transparent flex items-center justify-center text-[13px] cursor-pointer text-bv-text-mid hover:bg-bv-surface hover:border-bv-border hover:text-bv-text transition-all"
      >
        <TrashIcon />
      </button>
    </div>
  );
}
