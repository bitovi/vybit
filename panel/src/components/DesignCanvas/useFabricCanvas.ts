import { useRef, useEffect, useState, useCallback } from 'react';
import { Canvas as FabricCanvas, PencilBrush, Rect, Circle, Line, Textbox, FabricImage, type TPointerEventInfo } from 'fabric';
import type { DrawingTool } from './types';

export interface UseFabricCanvasOptions {
  onSubmit: (imageDataUrl: string, width: number, height: number) => void;
  backgroundImage?: string;
}

export function useFabricCanvas({ onSubmit, backgroundImage }: UseFabricCanvasOptions) {
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<FabricCanvas | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeTool, setActiveTool] = useState<DrawingTool>('freehand');
  const [fillColor, setFillColor] = useState('#3B82F6');
  const [strokeColor, setStrokeColor] = useState('#000000');
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);
  const drawStartRef = useRef<{ x: number; y: number } | null>(null);
  const isDrawingShapeRef = useRef(false);
  // Track whether a background image has been pinned — prevents ResizeObserver from clobbering dimensions
  const hasBackgroundRef = useRef(false);
  const clipboardRef = useRef<any[]>([]);
  const pasteOffsetRef = useRef(0);
  const [lockedHeight, setLockedHeight] = useState<number | null>(null);

  // Initialize Fabric.js canvas
  useEffect(() => {
    if (!canvasElRef.current || fabricRef.current) return;

    const canvas = new FabricCanvas(canvasElRef.current, {
      backgroundColor: '#ffffff',
      selection: true,
    });

    fabricRef.current = canvas;

    // Fit to container — skip if a screenshot background has locked the dimensions
    const resize = () => {
      if (!containerRef.current || hasBackgroundRef.current) return;
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

  // Load background image when provided (screenshot annotation flow)
  useEffect(() => {
    if (!backgroundImage) return;
    const canvas = fabricRef.current;
    if (!canvas) return;

    FabricImage.fromURL(backgroundImage).then((img) => {
      if (!img.width || !img.height) return;
      // Resize canvas to match the screenshot exactly and lock out the ResizeObserver
      hasBackgroundRef.current = true;
      canvas.setDimensions({ width: img.width, height: img.height });
      setLockedHeight(img.height);
      img.set({ selectable: false, evented: false, hasBorders: false, hasControls: false });
      canvas.backgroundImage = img;
      canvas.requestRenderAll();
    });
  }, [backgroundImage]);

  // Apply fill/stroke color changes to currently selected objects
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObjects();
    if (active.length === 0) return;
    active.forEach(obj => {
      if ('fill' in obj && obj.fill !== '' && obj.fill !== null) {
        obj.set('fill', fillColor);
      }
    });
    canvas.requestRenderAll();
  }, [fillColor]);

  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObjects();
    if (active.length === 0) return;
    active.forEach(obj => {
      if ('stroke' in obj) {
        obj.set('stroke', strokeColor);
      }
    });
    canvas.requestRenderAll();
  }, [strokeColor]);

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

    // Restore interactivity on all objects (in case we're leaving a drawing mode)
    canvas.getObjects().forEach(obj => {
      obj.evented = true;
      obj.selectable = true;
      obj.hasControls = true;
      obj.hasBorders = true;
      obj.setCoords(); // rebuild hit-test bounding box so direct clicks register
    });
    canvas.requestRenderAll();

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
      canvas.on('path:created', (e) => {
        saveState();
        const path = (e as any).path;
        if (path) {
          canvas.setActiveObject(path);
          canvas.requestRenderAll();
        }
        setActiveTool('select');
      });
    } else if (activeTool === 'eraser') {
      canvas.selection = false;
      const eraserSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="%23555" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 21-4-4 9.5-9.5 5.5 5.5L7 21Z"/><path d="M22 21H7"/><path d="m11.5 12.5 5.5 5.5"/></svg>`;
      canvas.defaultCursor = `url("data:image/svg+xml,${eraserSvg}") 4 18, auto`;
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
        text.selectAll();
        saveState();
      });
    } else if (['rectangle', 'circle', 'line', 'arrow'].includes(activeTool)) {
      canvas.selection = false;
      canvas.defaultCursor = 'crosshair';

      // Make existing objects non-interactive so they can't be moved while drawing
      canvas.getObjects().forEach(obj => { obj.evented = false; obj.selectable = false; });

      let shapeObj: any = null;

      canvas.on('mouse:down', (opt: TPointerEventInfo) => {
        // Disable any objects added since mode was entered (e.g. previous draw in this session)
        canvas.getObjects().forEach(obj => { obj.evented = false; obj.selectable = false; });
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

          // Auto-switch to select tool and select the drawn shape
          shapeObj.set({ evented: true, selectable: true, hasControls: true, hasBorders: true });
          shapeObj.setCoords();
          canvas.setActiveObject(shapeObj);
          canvas.requestRenderAll();
          setActiveTool('select');
        }
        shapeObj = null;
        drawStartRef.current = null;
        isDrawingShapeRef.current = false;
      });
    }
  }, [activeTool, fillColor, strokeColor, saveState]);

  const handleUndo = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas || undoStack.length <= 1) return;
    const current = undoStack[undoStack.length - 1];
    const prev = undoStack[undoStack.length - 2];
    setRedoStack(r => [...r, current]);
    setUndoStack(s => s.slice(0, -1));
    canvas.loadFromJSON(JSON.parse(prev)).then(() => canvas.requestRenderAll());
  }, [undoStack]);

  const handleRedo = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas || redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack(r => r.slice(0, -1));
    setUndoStack(s => [...s, next]);
    canvas.loadFromJSON(JSON.parse(next)).then(() => canvas.requestRenderAll());
  }, [redoStack]);

  const handleClear = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.clear();
    if (backgroundImage) {
      // Restore screenshot as background (only annotations are cleared)
      FabricImage.fromURL(backgroundImage).then((img) => {
        if (!img.width || !img.height) return;
        img.set({ selectable: false, evented: false, hasBorders: false, hasControls: false });
        canvas.backgroundImage = img;
        canvas.requestRenderAll();
      });
    } else {
      canvas.backgroundColor = '#ffffff';
      canvas.requestRenderAll();
    }
    saveState();
  }, [saveState, backgroundImage]);

  const handleSubmit = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL({ format: 'png', multiplier: 1 });
    onSubmit(dataUrl, canvas.getWidth(), canvas.getHeight());
  }, [onSubmit]);

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

  const handleCopy = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObjects();
    if (active.length === 0) return;
    Promise.all(active.map(obj => obj.clone())).then(clones => {
      clipboardRef.current = clones;
      pasteOffsetRef.current = 0;
    });
  }, []);

  const handlePaste = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas || clipboardRef.current.length === 0) return;
    const STEP = 20;
    pasteOffsetRef.current += STEP;
    const offset = pasteOffsetRef.current;
    Promise.all(clipboardRef.current.map(obj => obj.clone())).then(clones => {
      canvas.discardActiveObject();
      clones.forEach(clone => {
        clone.set({
          left: (clone.left ?? 0) + offset,
          top: (clone.top ?? 0) + offset,
          evented: true,
          selectable: true,
        });
        clone.setCoords();
        canvas.add(clone);
      });
      if (clones.length === 1) {
        canvas.setActiveObject(clones[0]);
      } else {
        const sel = new (canvas.constructor as any).ActiveSelection(clones, { canvas });
        canvas.setActiveObject(sel);
      }
      canvas.requestRenderAll();
      saveState();
    });
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
      if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
        // Don't intercept if editing text
        const canvas = fabricRef.current;
        if (canvas) {
          const active = canvas.getActiveObject();
          if (active && active.type === 'textbox' && (active as Textbox).isEditing) return;
        }
        handleCopy();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
        const canvas = fabricRef.current;
        if (canvas) {
          const active = canvas.getActiveObject();
          if (active && active.type === 'textbox' && (active as Textbox).isEditing) return;
        }
        e.preventDefault();
        handlePaste();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleDelete, handleUndo, handleRedo, handleCopy, handlePaste]);

  return {
    canvasElRef,
    containerRef,
    lockedHeight,
    activeTool,
    setActiveTool,
    fillColor,
    setFillColor,
    strokeColor,
    setStrokeColor,
    canUndo: undoStack.length > 1,
    canRedo: redoStack.length > 0,
    handleUndo,
    handleRedo,
    handleClear,
    handleSubmit,
  };
}
