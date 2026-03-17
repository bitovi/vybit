import type { DesignCanvasProps } from './types';
import { useFabricCanvas } from './useFabricCanvas';
import { CanvasToolbar } from './CanvasToolbar';
import { CanvasFooter } from './CanvasFooter';

export function DesignCanvas({ onSubmit, onClose }: DesignCanvasProps) {
  const {
    canvasElRef,
    containerRef,
    activeTool,
    setActiveTool,
    fillColor,
    setFillColor,
    strokeColor,
    setStrokeColor,
    canUndo,
    canRedo,
    handleUndo,
    handleRedo,
    handleClear,
    handleSubmit,
  } = useFabricCanvas({ onSubmit });

  return (
    <div className="flex flex-col h-full" data-testid="design-canvas">
      <CanvasToolbar
        activeTool={activeTool}
        onToolChange={setActiveTool}
        fillColor={fillColor}
        onFillChange={setFillColor}
        strokeColor={strokeColor}
        onStrokeChange={setStrokeColor}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onClear={handleClear}
      />

      <div ref={containerRef} className="flex-1 bg-white cursor-crosshair overflow-hidden relative">
        <canvas ref={canvasElRef} />
      </div>

      <CanvasFooter onSubmit={handleSubmit} onClose={onClose} />
    </div>
  );
}
