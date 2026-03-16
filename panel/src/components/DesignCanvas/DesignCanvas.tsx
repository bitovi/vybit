import { useRef, useEffect, useState, useCallback } from 'react';
import { Canvas as FabricCanvas, PencilBrush, Rect, Circle, Line, Textbox, type TPointerEventInfo } from 'fabric';
import type { DesignCanvasProps, DrawingTool } from './types';
import { BASIC_COLORS } from './types';

export function DesignCanvas({ onSubmit, onClose }: DesignCanvasProps) {
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<FabricCanvas | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeTool, setActiveTool] = useState<DrawingTool>('freehand');
  const [fillColor, setFillColor] = useState('#3B82F6');
  const [strokeColor, setStrokeColor] = useState('#000000');
  const [showFillPalette, setShowFillPalette] = useState(false);
  const [showStrokePalette, setShowStrokePalette] = useState(false);
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);
  const drawStartRef = useRef<{ x: number; y: number } | null>(null);
  const isDrawingShapeRef = useRef(false);

  // Initialize Fabric.js canvas
  useEffect(() => {
    if (!canvasElRef.current || fabricRef.current) return;

    const canvas = new FabricCanvas(canvasElRef.current, {
      backgroundColor: '#ffffff',
      selection: true,
    });

    fabricRef.current = canvas;

    // Fit to container
    const resize = () => {
      if (!containerRef.current) return;
      const { width, height } = containerRef.current.getBoundingClientRect();
      canvas.setDimensions({ width, height });
    };
    resize();
    const observer = new ResizeObserver(resize);
    if (containerRef.current) observer.observe(containerRef.current);

    // Save initial state
    setUndoStack([JSON.stringify(canvas.toJSON())]);

    return () => {
      observer.disconnect();
      canvas.dispose();
      fabricRef.current = null;
    };
  }, []);

  // Save state after modifications for undo/redo
  const saveState = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const json = JSON.stringify(canvas.toJSON());
    setUndoStack(prev => [...prev, json]);
    setRedoStack([]);
  }, []);

  // Configure tool mode
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    // Reset drawing mode
    canvas.isDrawingMode = false;
    canvas.selection = true;
    canvas.defaultCursor = 'default';

    // Remove shape-drawing listeners
    canvas.off('mouse:down');
    canvas.off('mouse:move');
    canvas.off('mouse:up');

    if (activeTool === 'freehand') {
      canvas.isDrawingMode = true;
      const brush = new PencilBrush(canvas);
      brush.color = strokeColor;
      brush.width = 2;
      canvas.freeDrawingBrush = brush;
      canvas.on('path:created', () => saveState());
    } else if (activeTool === 'eraser') {
      canvas.selection = false;
      canvas.defaultCursor = 'crosshair';
      canvas.on('mouse:down', (opt: TPointerEventInfo) => {
        const target = canvas.findTarget(opt.e);
        if (target) {
          canvas.remove(target);
          saveState();
        }
      });
    } else if (activeTool === 'select') {
      // Default selection mode — nothing extra needed
    } else if (activeTool === 'text') {
      canvas.selection = false;
      canvas.defaultCursor = 'text';
      canvas.on('mouse:down', (opt: TPointerEventInfo) => {
        if (isDrawingShapeRef.current) return;
        const pointer = canvas.getScenePoint(opt.e);
        const text = new Textbox('Text', {
          left: pointer.x,
          top: pointer.y,
          fontSize: 16,
          fill: strokeColor,
          width: 120,
        });
        canvas.add(text);
        canvas.setActiveObject(text);
        text.enterEditing();
        saveState();
      });
    } else if (['rectangle', 'circle', 'line', 'arrow'].includes(activeTool)) {
      canvas.selection = false;
      canvas.defaultCursor = 'crosshair';
      let shapeObj: any = null;

      canvas.on('mouse:down', (opt: TPointerEventInfo) => {
        isDrawingShapeRef.current = true;
        const pointer = canvas.getScenePoint(opt.e);
        drawStartRef.current = { x: pointer.x, y: pointer.y };

        if (activeTool === 'rectangle') {
          shapeObj = new Rect({
            left: pointer.x,
            top: pointer.y,
            width: 0,
            height: 0,
            fill: fillColor === 'transparent' ? 'transparent' : fillColor,
            stroke: strokeColor,
            strokeWidth: 2,
            selectable: false,
          });
          canvas.add(shapeObj);
        } else if (activeTool === 'circle') {
          shapeObj = new Circle({
            left: pointer.x,
            top: pointer.y,
            radius: 0,
            fill: fillColor === 'transparent' ? 'transparent' : fillColor,
            stroke: strokeColor,
            strokeWidth: 2,
            selectable: false,
          });
          canvas.add(shapeObj);
        } else if (activeTool === 'line' || activeTool === 'arrow') {
          shapeObj = new Line([pointer.x, pointer.y, pointer.x, pointer.y], {
            stroke: strokeColor,
            strokeWidth: 2,
            selectable: false,
          });
          canvas.add(shapeObj);
        }
      });

      canvas.on('mouse:move', (opt: TPointerEventInfo) => {
        if (!drawStartRef.current || !shapeObj) return;
        const pointer = canvas.getScenePoint(opt.e);
        const start = drawStartRef.current;

        if (activeTool === 'rectangle') {
          const left = Math.min(start.x, pointer.x);
          const top = Math.min(start.y, pointer.y);
          shapeObj.set({
            left,
            top,
            width: Math.abs(pointer.x - start.x),
            height: Math.abs(pointer.y - start.y),
          });
        } else if (activeTool === 'circle') {
          const rx = Math.abs(pointer.x - start.x) / 2;
          const ry = Math.abs(pointer.y - start.y) / 2;
          shapeObj.set({
            left: Math.min(start.x, pointer.x),
            top: Math.min(start.y, pointer.y),
            radius: Math.max(rx, ry),
          });
        } else if (activeTool === 'line' || activeTool === 'arrow') {
          shapeObj.set({ x2: pointer.x, y2: pointer.y });
        }
        canvas.requestRenderAll();
      });

      canvas.on('mouse:up', () => {
        if (shapeObj) {
          shapeObj.set({ selectable: true });
          canvas.setActiveObject(shapeObj);

          // For arrow, add arrowhead triangle
          if (activeTool === 'arrow' && drawStartRef.current) {
            const x1 = shapeObj.x1 as number;
            const y1 = shapeObj.y1 as number;
            const x2 = shapeObj.x2 as number;
            const y2 = shapeObj.y2 as number;
            const angle = Math.atan2(y2 - y1, x2 - x1);
            const headLen = 12;

            const head = new Line(
              [x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6),
               x2, y2],
              { stroke: strokeColor, strokeWidth: 2, selectable: false }
            );
            const head2 = new Line(
              [x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6),
               x2, y2],
              { stroke: strokeColor, strokeWidth: 2, selectable: false }
            );
            canvas.add(head, head2);
          }

          saveState();
        }
        shapeObj = null;
        drawStartRef.current = null;
        isDrawingShapeRef.current = false;
      });
    }
  }, [activeTool, fillColor, strokeColor, saveState]);

  const handleUndo = () => {
    const canvas = fabricRef.current;
    if (!canvas || undoStack.length <= 1) return;
    const current = undoStack[undoStack.length - 1];
    const prev = undoStack[undoStack.length - 2];
    setRedoStack(r => [...r, current]);
    setUndoStack(s => s.slice(0, -1));
    canvas.loadFromJSON(JSON.parse(prev)).then(() => canvas.requestRenderAll());
  };

  const handleRedo = () => {
    const canvas = fabricRef.current;
    if (!canvas || redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack(r => r.slice(0, -1));
    setUndoStack(s => [...s, next]);
    canvas.loadFromJSON(JSON.parse(next)).then(() => canvas.requestRenderAll());
  };

  const handleClear = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.clear();
    canvas.backgroundColor = '#ffffff';
    canvas.requestRenderAll();
    saveState();
  };

  const handleSubmit = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL({ format: 'png', multiplier: 1 });
    onSubmit(dataUrl, canvas.getWidth(), canvas.getHeight());
  };

  const handleDelete = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObjects();
    if (active.length > 0) {
      for (const obj of active) canvas.remove(obj);
      canvas.discardActiveObject();
      canvas.requestRenderAll();
      saveState();
    }
  }, [saveState]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Don't intercept if editing text
        const canvas = fabricRef.current;
        if (canvas) {
          const active = canvas.getActiveObject();
          if (active && active.type === 'textbox' && (active as Textbox).isEditing) return;
        }
        handleDelete();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleDelete, undoStack, redoStack]);

  const tools: { id: DrawingTool; label: string; icon: string }[] = [
    { id: 'select', label: 'Select', icon: '◇' },
    { id: 'freehand', label: 'Freehand', icon: '✎' },
    { id: 'rectangle', label: 'Rectangle', icon: '□' },
    { id: 'circle', label: 'Circle', icon: '○' },
    { id: 'line', label: 'Line', icon: '╱' },
    { id: 'arrow', label: 'Arrow', icon: '→' },
    { id: 'text', label: 'Text', icon: 'T' },
    { id: 'eraser', label: 'Eraser', icon: '⊘' },
  ];

  return (
    <div className="flex flex-col h-full" data-testid="design-canvas">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-1.5 py-1 bg-bv-bg border-b border-bv-border text-[10px] shrink-0 flex-wrap">
        {tools.map(tool => (
          <button
            key={tool.id}
            title={tool.label}
            onClick={() => setActiveTool(tool.id)}
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
                    onClick={() => { setFillColor(c); setShowFillPalette(false); }}
                  />
                ))}
              </div>
              <div className="pt-1 border-t border-bv-border flex items-center gap-1.5">
                <button
                  className={`w-[22px] h-[22px] rounded cursor-pointer border border-bv-border
                    ${fillColor === 'transparent' ? 'ring-2 ring-bv-teal ring-offset-1' : ''}`}
                  style={{ background: 'repeating-conic-gradient(#ddd 0% 25%, white 0% 50%) 50%/8px 8px' }}
                  onClick={() => { setFillColor('transparent'); setShowFillPalette(false); }}
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
                    onClick={() => { setStrokeColor(c); setShowStrokePalette(false); }}
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
          onClick={handleUndo}
          disabled={undoStack.length <= 1}
          className={`w-7 h-[26px] rounded border border-transparent flex items-center justify-center text-[13px] cursor-pointer transition-all
            ${undoStack.length <= 1 ? 'opacity-35 cursor-default' : 'text-bv-text-mid hover:bg-bv-surface hover:border-bv-border hover:text-bv-text'}`}
        >
          ↶
        </button>
        <button
          title="Redo"
          onClick={handleRedo}
          disabled={redoStack.length === 0}
          className={`w-7 h-[26px] rounded border border-transparent flex items-center justify-center text-[13px] cursor-pointer transition-all
            ${redoStack.length === 0 ? 'opacity-35 cursor-default' : 'text-bv-text-mid hover:bg-bv-surface hover:border-bv-border hover:text-bv-text'}`}
        >
          ↷
        </button>
        <button
          title="Clear canvas"
          onClick={handleClear}
          className="w-7 h-[26px] rounded border border-transparent flex items-center justify-center text-[13px] cursor-pointer text-bv-text-mid hover:bg-bv-surface hover:border-bv-border hover:text-bv-text transition-all"
        >
          🗑
        </button>
      </div>

      {/* Canvas area */}
      <div ref={containerRef} className="flex-1 bg-white cursor-crosshair overflow-hidden relative">
        <canvas ref={canvasElRef} />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-2 py-1.5 bg-bv-bg border-t border-bv-border text-[10px] shrink-0">
        <div className="flex gap-1.5">
          {onClose && (
            <button
              onClick={onClose}
              className="px-2.5 py-0.5 rounded border border-bv-border bg-bv-bg text-bv-muted text-[10px] font-medium cursor-pointer hover:bg-bv-orange/10 hover:border-bv-orange hover:text-bv-orange transition-all"
            >
              ✕ Close
            </button>
          )}
        </div>
        <button
          onClick={handleSubmit}
          className="px-2.5 py-0.5 rounded border border-bv-teal bg-bv-teal text-white text-[10px] font-medium cursor-pointer hover:bg-bv-teal/80 transition-all"
        >
          ✓ Queue as Change
        </button>
      </div>
    </div>
  );
}
