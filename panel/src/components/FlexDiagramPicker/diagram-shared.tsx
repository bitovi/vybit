import type { CSSProperties } from 'react';
import { useState } from 'react';

// ─── Design tokens (from HTML spec) ──────────────────────────────────────────
export const TEAL      = '#00848B';
export const TEAL_DIM  = 'rgba(0,132,139,0.09)';
export const ORANGE    = '#F5532D';
export const BORDER    = '#DFE2E2';
export const SURFACE   = '#F4F5F5';
export const TEXT_MID  = '#687879';
export const FONT_MONO = "'Roboto Mono', 'Menlo', ui-monospace, monospace";

// ─── Base CSS objects ─────────────────────────────────────────────────────────
export const BOX_BASE: CSSProperties = {
  width: 60, height: 60,
  borderRadius: 5,
  borderWidth: '1.5px',
  borderStyle: 'solid',
  borderColor: BORDER,        // always explicit — never use the `border` shorthand alongside borderColor
  background: SURFACE,
  display: 'flex',
  padding: 4,
  overflow: 'hidden',
  // Transition only the visual-state properties, not layout ones (flexDirection, gap, etc.)
  transition: 'border-color 150ms ease-in-out, background-color 150ms ease-in-out, box-shadow 150ms ease-in-out',
  boxSizing: 'border-box',
};

// Teal items — 50% opacity at rest, 80% when lit (hover/active)
export const ITEM: CSSProperties = {
  background: TEAL,
  opacity: 0.5,
  borderRadius: 2,
  flexShrink: 0,
  transition: 'opacity 150ms ease-in-out',
};
export const ITEM_LIT: CSSProperties = { ...ITEM, opacity: 0.8 };

// Orange gap zones — 10% at rest, 22% when lit
export const GAP: CSSProperties = {
  flexShrink: 0,
  background: ORANGE,
  opacity: 0.1,
  borderRadius: 1,
  transition: 'opacity 150ms ease-in-out',
};
export const GAP_LIT: CSSProperties = { ...GAP, opacity: 0.22 };

// Baseline items — same as ITEM but shows a 't' glyph
export const ITEM_T: CSSProperties = {
  background: TEAL,
  opacity: 0.5,
  borderRadius: 2,
  flexShrink: 0,
  fontSize: 5,
  color: 'rgba(255,255,255,0.8)',
  lineHeight: 1,
  overflow: 'hidden',
  textAlign: 'center',
  transition: 'opacity 150ms ease-in-out',
};
export const ITEM_T_LIT: CSSProperties = { ...ITEM_T, opacity: 0.8 };

// ─── DiagramCell ──────────────────────────────────────────────────────────────
/**
 * The 60×60 box + label wrapper used by every diagram option.
 * Manages its own hover state and passes a `lit` boolean to children
 * so they can switch between rest and hover/active item styles.
 */
export function DiagramCell({ label, isActive, containerStyle, onClick, onHover, children }: {
  label: string;
  isActive: boolean;
  containerStyle: CSSProperties;
  onClick?: () => void;
  onHover?: () => void;
  children: (lit: boolean) => React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  const lit = isActive || hovered;

  const boxStyle: CSSProperties = {
    ...BOX_BASE,
    borderColor: lit ? TEAL : BORDER,
    background: lit ? TEAL_DIM : SURFACE,
    boxShadow: isActive ? '0 0 0 2px rgba(0,132,139,0.18)' : 'none',
    ...containerStyle,
  };

  return (
    <div
      className="cursor-pointer"
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}
      onMouseEnter={() => { setHovered(true); onHover?.(); }}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      <div style={boxStyle}>
        {children(lit)}
      </div>
      <span style={{
        fontSize: 9,
        fontFamily: FONT_MONO,
        color: lit ? TEAL : TEXT_MID,
        fontWeight: lit ? 600 : 400,
        textAlign: 'center',
        transition: 'color 150ms ease-in-out',
      }}>
        {label}
      </span>
    </div>
  );
}
