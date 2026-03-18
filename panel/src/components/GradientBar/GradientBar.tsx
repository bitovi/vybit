import { useRef, useCallback } from 'react';
import type { GradientBarProps, GradientStop } from './types';

function buildGradientCSS(stops: GradientStop[], direction: string): string {
  const sorted = [...stops].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const colorStops = sorted.map((s) =>
    s.position != null ? `${s.hex} ${s.position}%` : s.hex
  );
  return `linear-gradient(${direction}, ${colorStops.join(', ')})`;
}

function snapTo5(value: number): number {
  return Math.round(Math.max(0, Math.min(100, value)) / 5) * 5;
}

interface PentagonHandleProps {
  stop: GradientStop;
  isEndpoint: boolean;
  isSelected: boolean;
  onDragStart: (stopId: string, startX: number) => void;
  onClick: (stopId: string, anchorEl: Element) => void;
  onRemove: (stopId: string) => void;
}

function PentagonHandle({ stop, isEndpoint, isSelected, onDragStart, onClick, onRemove }: PentagonHandleProps) {
  const didDrag = useRef(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    didDrag.current = false;
    onDragStart(stop.id, e.clientX);

    const onMove = () => { didDrag.current = true; };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [stop.id, onDragStart]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!didDrag.current) {
      onClick(stop.id, e.currentTarget);
    }
  }, [stop.id, onClick]);

  const handleRemove = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove(stop.id);
  }, [stop.id, onRemove]);

  const pos = stop.position ?? 0;

  return (
    <div
      className={`absolute top-0 cursor-grab select-none z-10
        hover:z-20
        ${isSelected ? 'z-25' : ''}`}
      style={{
        left: `${pos}%`,
        transform: 'translateX(-50%)',
        width: 22,
        height: 26,
        filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.2))',
      }}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      title={`${stop.role}-${stop.colorName}${stop.position != null ? ` ${stop.position}%` : ''}`}
    >
      <svg viewBox="0 0 22 26" width={22} height={26} xmlns="http://www.w3.org/2000/svg">
        <path
          d="M2 1 L20 1 L20 16 L11 25 L2 16 Z"
          fill={stop.hex}
          stroke={isSelected ? '#00848B' : 'white'}
          strokeWidth={isSelected ? 2 : 1.5}
          strokeLinejoin="round"
        />
      </svg>

      {/* Remove button — only for via stops */}
      {!isEndpoint && (
        <div
          className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-bv-orange text-white text-[9px] leading-3.5 text-center cursor-pointer z-40 hidden group-hover/handle:block hover:block!"
          style={{ display: undefined }}
          onClick={handleRemove}
          onMouseDown={(e) => e.stopPropagation()}
        >
          ×
        </div>
      )}
    </div>
  );
}

export function GradientBar({
  stops,
  direction,
  onStopDrag,
  onStopDragEnd,
  onStopClick,
  onBarClick,
  onStopRemove,
  selectedStopId,
}: GradientBarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ stopId: string; startX: number; startPos: number } | null>(null);

  const sorted = [...stops].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  const handleDragStart = useCallback((stopId: string, startX: number) => {
    const stop = stops.find((s) => s.id === stopId);
    if (!stop) return;
    dragState.current = { stopId, startX, startPos: stop.position ?? 0 };

    const onMove = (e: MouseEvent) => {
      const ds = dragState.current;
      if (!ds || !trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const dx = e.clientX - ds.startX;
      const pctDelta = (dx / rect.width) * 100;
      const newPos = snapTo5(ds.startPos + pctDelta);
      onStopDrag(ds.stopId, newPos);
    };

    const onUp = (e: MouseEvent) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      const ds = dragState.current;
      if (ds && trackRef.current) {
        const rect = trackRef.current.getBoundingClientRect();
        const dx = e.clientX - ds.startX;
        const pctDelta = (dx / rect.width) * 100;
        const finalPos = snapTo5(ds.startPos + pctDelta);
        onStopDragEnd(ds.stopId, finalPos);
      }
      dragState.current = null;
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [stops, onStopDrag, onStopDragEnd]);

  const handleTrackClick = useCallback((e: React.MouseEvent) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    onBarClick(snapTo5(pct));
  }, [onBarClick]);

  const gradientCSS = buildGradientCSS(sorted, direction);

  return (
    <div className="relative flex-1 min-w-0" style={{ paddingTop: 28 }}>
      {/* Pentagon handles */}
      {sorted.map((stop, i) => (
        <PentagonHandle
          key={stop.id}
          stop={stop}
          isEndpoint={i === 0 || i === sorted.length - 1}
          isSelected={stop.id === selectedStopId}
          onDragStart={handleDragStart}
          onClick={onStopClick}
          onRemove={onStopRemove}
        />
      ))}

      {/* Gradient track */}
      <div
        ref={trackRef}
        className="h-9 rounded-md cursor-pointer relative"
        style={{
          background: gradientCSS,
          border: '1px solid rgba(0,0,0,0.08)',
          boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.06)',
        }}
        onClick={handleTrackClick}
      >
        {/* + indicator on hover */}
        <div className="absolute inset-0 flex items-center justify-center text-lg font-bold text-white/0 hover:text-white/60 transition-colors pointer-events-none">
          +
        </div>
      </div>
    </div>
  );
}
