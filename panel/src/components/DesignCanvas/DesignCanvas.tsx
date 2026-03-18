import type { DesignCanvasProps } from './types';
import { useFabricCanvas } from './useFabricCanvas';
import { CanvasToolbar } from './CanvasToolbar';

export function DesignCanvas({ onSubmit, onClose, backgroundImage }: DesignCanvasProps) {
  const {
    canvasElRef,
    containerRef,
    lockedHeight,
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
  } = useFabricCanvas({ onSubmit, backgroundImage });

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
        onSubmit={handleSubmit}
        onClose={onClose}
      />

      <div
        ref={containerRef}
        className="bg-white cursor-crosshair overflow-hidden relative"
        style={lockedHeight !== null ? { height: lockedHeight } : { flex: 1 }}
      >
        <canvas ref={canvasElRef} />
      </div>
    </div>
  );
}
