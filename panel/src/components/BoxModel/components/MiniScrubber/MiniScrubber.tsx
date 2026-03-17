import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { MiniScrubberProps } from './types';

const SCRUB_THRESHOLD = 4;
const PX_PER_STEP = 10;

export function MiniScrubber({
  placeholder,
  values,
  currentValue,
  displayValue,
  formatValue,
  axis = 'x',
  disabled,
  onHover,
  onLeave,
  onClick,
  onScrubStart,
  onScrubEnd,
  onOpen,
  onClose,
}: MiniScrubberProps) {
  const [open, setOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);
  const [scrubIndex, setScrubIndex] = useState<number | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startIndex: number;
    didScrub: boolean;
  } | null>(null);
  const containerRef = useRef<HTMLSpanElement>(null);
  const activeItemRef = useRef<HTMLDivElement>(null);

  const hasVal = currentValue != null;
  const currentIndex = currentValue ? values.indexOf(currentValue) : -1;

  // Text shown on the chip
  const scrubValue = scrubIndex !== null ? values[scrubIndex] : null;
  const chipText = scrubValue
    ? (formatValue ? formatValue(scrubValue) : scrubValue)
    : (displayValue ?? placeholder);

  // Update dropdown position when open
  useEffect(() => {
    if (!open) { setDropdownPos(null); return; }
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      setDropdownPos({ top: rect.bottom + 4, left: rect.left + rect.width / 2 });
    }
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        onClose?.();
        onLeave?.();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onLeave, onClose]);

  // Scroll active item into view when dropdown opens
  useEffect(() => {
    if (open && activeItemRef.current) {
      activeItemRef.current.scrollIntoView?.({ block: 'nearest' });
    }
  }, [open]);

  function handlePointerDown(e: React.PointerEvent) {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    const idx = currentIndex >= 0 ? currentIndex : 0;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startIndex: idx,
      didScrub: false,
    };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;

    const delta = axis === 'y'
      ? -(e.clientY - drag.startY)   // up = increase
      : (e.clientX - drag.startX);   // right = increase

    if (!drag.didScrub && Math.abs(delta) > SCRUB_THRESHOLD) {
      drag.didScrub = true;
      setOpen(false);
      onScrubStart?.();
    }

    if (drag.didScrub) {
      const steps = Math.round(delta / PX_PER_STEP);
      const idx = Math.max(0, Math.min(values.length - 1, drag.startIndex + steps));
      setScrubIndex(idx);
      onHover?.(values[idx]);
    }
  }

  function handlePointerUp() {
    const drag = dragRef.current;
    if (!drag) return;

    if (drag.didScrub && scrubIndex !== null) {
      onClick?.(values[scrubIndex]);
      setScrubIndex(null);
      dragRef.current = null;
      onScrubEnd?.();
    } else if (!drag.didScrub) {
      setScrubIndex(null);
      dragRef.current = null;
      setOpen(prev => {
        if (prev) {
          onClose?.();
          onLeave?.();
          return false;
        }
        onOpen?.();
        return true;
      });
    }
  }

  const isScrubbing = scrubIndex !== null;
  const isActive = hasVal || isScrubbing;
  const className = [
    'bm-slot',
    isActive ? 'bm-has-val' : '',
    isScrubbing ? 'bm-scrubbing' : '',
  ].filter(Boolean).join(' ');

  const cursor = disabled ? 'default' : axis === 'y' ? 'ns-resize' : 'ew-resize';

  return (
    <span
      ref={containerRef}
      className={className}
      style={{ position: 'relative', cursor }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      role="button"
      tabIndex={disabled ? -1 : 0}
    >
      {chipText}

      {open && dropdownPos && createPortal(
        <div
          className="bm-mini-dropdown"
          style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, transform: 'translateX(-50%)' }}
          onClick={e => e.stopPropagation()}
          onMouseLeave={() => onLeave?.()}
          onMouseDown={e => e.stopPropagation()}
        >
          {values.map(val => {
            const isActiveItem = val === currentValue;
            return (
              <div
                key={val}
                ref={isActiveItem ? activeItemRef : undefined}
                className={`bm-mini-dropdown-item${isActiveItem ? ' bm-active' : ''}`}
                onMouseEnter={() => onHover?.(val)}
                onClick={e => {
                  e.stopPropagation();
                  onClick?.(val);
                  setOpen(false);
                  onClose?.();
                }}
              >
                {val}
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </span>
  );
}
