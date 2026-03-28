// CSS-in-JS style helpers for the overlay.
// Composable style objects keep inline styles DRY and readable.

type StyleObj = Record<string, string>;

/** Convert a camelCase style object to a cssText string. */
export function css(obj: StyleObj): string {
  let out = '';
  for (const key in obj) {
    // camelCase → kebab-case  (e.g. pointerEvents → pointer-events)
    const prop = key.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`);
    out += `${prop}:${obj[key]};`;
  }
  return out;
}

// ── Colors ───────────────────────────────────────────────────────────────

export const TEAL = '#00848B';
export const TEAL_06 = 'rgba(0,132,139,0.06)';

// ── Z-index layers ──────────────────────────────────────────────────────

export const Z_CURSOR = '2147483647';
export const Z_INDICATOR = '2147483645';
export const Z_LOCKED = '2147483644';

// ── Base style objects (compose via spread) ─────────────────────────────

export const FIXED_OVERLAY: StyleObj = {
  position: 'fixed',
  pointerEvents: 'none',
};

export const CURSOR_LABEL: StyleObj = {
  ...FIXED_OVERLAY,
  zIndex: Z_CURSOR,
  background: TEAL,
  color: '#fff',
  fontSize: '11px',
  fontFamily: 'system-ui,sans-serif',
  padding: '3px 8px',
  borderRadius: '4px',
  whiteSpace: 'nowrap',
  opacity: '0',
  boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
  transition: 'opacity 0.1s',
};

export const INDICATOR_BASE: StyleObj = {
  ...FIXED_OVERLAY,
  zIndex: Z_INDICATOR,
  display: 'none',
};

export const DASHED_BORDER: StyleObj = {
  border: `2px dashed ${TEAL}`,
  borderRadius: '4px',
  boxSizing: 'border-box',
};

export const ARROW_BASE: StyleObj = {
  position: 'absolute',
  width: '0',
  height: '0',
  borderStyle: 'solid',
};

export const LINE_BASE: StyleObj = {
  ...FIXED_OVERLAY,
  display: 'block',
  background: TEAL,
};

// ── Surface colors ──────────────────────────────────────────────────────

export const SURFACE = '#1e1e2e';
export const SURFACE_DARK = '#181825';
export const CANVAS_BG = '#FAFBFB';
export const BORDER_LIGHT = '#DFE2E2';

// ── Container z-index ───────────────────────────────────────────────────

export const Z_CONTAINER = '999999';

// ── Container bases ─────────────────────────────────────────────────────

export const CONTAINER_HOST: StyleObj = {
  position: 'fixed',
  zIndex: Z_CONTAINER,
  background: SURFACE,
  pointerEvents: 'auto',
};

export const PANEL_SHADOW: StyleObj = {
  boxShadow: '-4px 0 24px rgba(0,0,0,0.3)',
};

export const IFRAME_FILL: StyleObj = {
  width: '100%',
  height: '100%',
  border: 'none',
};

export const IFRAME_FLEX: StyleObj = {
  flex: '1',
  border: 'none',
};

// ── Drag handle ─────────────────────────────────────────────────────────

export const DRAG_HANDLE: StyleObj = {
  height: '28px',
  background: SURFACE_DARK,
  cursor: 'move',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: '0',
  userSelect: 'none',
};

// ── Resize handles ──────────────────────────────────────────────────────

export const RESIZE_HANDLE_H: StyleObj = {
  width: '6px',
  cursor: 'ew-resize',
  background: 'transparent',
  flexShrink: '0',
};

export const CORNER_GRIPPER: StyleObj = {
  position: 'absolute',
  bottom: '0',
  right: '0',
  width: '16px',
  height: '16px',
  cursor: 'nwse-resize',
};

// ── Design canvas ───────────────────────────────────────────────────────

export const DESIGN_CANVAS: StyleObj = {
  outline: `2px dashed ${TEAL}`,
  outlineOffset: '2px',
  borderRadius: '6px',
  background: CANVAS_BG,
  position: 'relative',
  overflow: 'hidden',
  minWidth: '300px',
  boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
  boxSizing: 'border-box',
};

export const DESIGN_CANVAS_IFRAME: StyleObj = {
  ...IFRAME_FILL,
  display: 'block',
};

export const CANVAS_RESIZE_HANDLE: StyleObj = {
  position: 'absolute',
  bottom: '0',
  left: '0',
  right: '0',
  height: '8px',
  cursor: 'ns-resize',
  background: `linear-gradient(transparent, ${TEAL_06})`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

export const CANVAS_RESIZE_BAR: StyleObj = {
  width: '32px',
  height: '3px',
  borderRadius: '2px',
  background: BORDER_LIGHT,
};

export const CANVAS_CORNER_HANDLE: StyleObj = {
  position: 'absolute',
  bottom: '0',
  right: '0',
  width: '14px',
  height: '14px',
  cursor: 'nwse-resize',
  zIndex: '5',
};

export const CANVAS_CORNER_DECO: StyleObj = {
  position: 'absolute',
  bottom: '2px',
  right: '2px',
  width: '8px',
  height: '8px',
  borderRight: `2px solid ${BORDER_LIGHT}`,
  borderBottom: `2px solid ${BORDER_LIGHT}`,
};

// ── Shadow host ─────────────────────────────────────────────────────────

export const SHADOW_HOST: StyleObj = {
  ...FIXED_OVERLAY,
  zIndex: Z_CURSOR,
  top: '0',
  left: '0',
  width: '0',
  height: '0',
};

// ── Submitted design image ──────────────────────────────────────────────

export const SUBMITTED_IMAGE: StyleObj = {
  width: '100%',
  height: 'auto',
  display: 'block',
  pointerEvents: 'none',
};
