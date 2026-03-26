import type { DesignCanvasProps } from './types';
import { useFabricCanvas } from './useFabricCanvas';
import { CanvasToolbar } from './CanvasToolbar';

export function DesignCanvas({ onSubmit, onClose, backgroundImage, armedComponent, onComponentPlaced }: DesignCanvasProps) {
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
    ghostPos,
    ghostSize,
  } = useFabricCanvas({ onSubmit, backgroundImage, armedComponent, onComponentPlaced });

  const isArmed = !!armedComponent;

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
        className={`bg-white overflow-hidden relative ${isArmed ? 'cursor-crosshair' : ''}`}
        style={lockedHeight !== null ? { height: lockedHeight } : { flex: 1 }}
      >
        <canvas ref={canvasElRef} />
        {/* Ghost HTML preview following cursor when a component is armed */}
        {isArmed && ghostPos && armedComponent?.ghostHtml && (
          <div
            style={{
              position: 'absolute',
              left: ghostPos.x - (ghostSize?.width ?? 0) / 2,
              top: ghostPos.y - (ghostSize?.height ?? 0) / 2,
              pointerEvents: 'none',
              opacity: 0.6,
              outline: '2px dashed #00848B',
              outlineOffset: 2,
              zIndex: 10,
            }}
            dangerouslySetInnerHTML={{ __html: armedComponent.ghostHtml }}
          />
        )}
        {/* Armed indicator banner */}
        {isArmed && (
          <div
            style={{
              position: 'absolute',
              top: 4,
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(0, 132, 139, 0.9)',
              color: '#fff',
              fontSize: 11,
              fontWeight: 600,
              padding: '2px 10px',
              borderRadius: 4,
              pointerEvents: 'none',
              zIndex: 20,
              whiteSpace: 'nowrap',
            }}
          >
            Click to place {armedComponent?.componentName}
          </div>
        )}
      </div>
    </div>
  );
}
