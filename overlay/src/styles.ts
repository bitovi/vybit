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

// ── Shadow DOM stylesheet ───────────────────────────────────────────────
// Injected into the overlay's shadow root as a <style> element.

export const OVERLAY_CSS = `
  .toggle-btn {
    position: fixed;
    bottom: 16px;
    right: 16px;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 1.5px solid #DFE2E2;
    cursor: pointer;
    z-index: 999999;
    background: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s;
    animation: vybit-breathe 3s ease-in-out infinite;
    pointer-events: auto;
  }
  @keyframes vybit-breathe {
    0%, 100% { box-shadow: 0 0 0 0 rgba(0,132,139,0), 0 2px 8px rgba(0,0,0,0.08); }
    50%       { box-shadow: 0 0 0 3px rgba(0,132,139,0.09), 0 0 12px rgba(0,132,139,0.07), 0 2px 8px rgba(0,0,0,0.08); }
  }
  .toggle-btn:hover {
    border-color: #00848B;
    transform: scale(1.08);
    animation: none;
    box-shadow: 0 0 0 5px rgba(0,132,139,0.12), 0 0 18px rgba(0,132,139,0.12), 0 2px 8px rgba(0,0,0,0.10);
  }
  .toggle-btn:active { transform: scale(0.95); }
  .toggle-btn svg { display: block; }
  .toggle-btn .eb-fill { fill: #00848B; }
  @keyframes rainbow-eyes {
    0%   { fill: #ff4040; }
    14%  { fill: #ff9800; }
    28%  { fill: #ffee00; }
    42%  { fill: #3dff6e; }
    57%  { fill: #00bfff; }
    71%  { fill: #5050ff; }
    85%  { fill: #cc44ff; }
    100% { fill: #ff4040; }
  }
  .toggle-btn:hover .eb-eye-l { animation: rainbow-eyes 1.8s linear infinite; }
  .toggle-btn:hover .eb-eye-r { animation: rainbow-eyes 1.8s linear infinite; animation-delay: -0.45s; }
  .toast {
    position: fixed;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    background: #00464A;
    color: #F4F5F5;
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 12px;
    font-family: 'Inter', system-ui, sans-serif;
    z-index: 999999;
    box-shadow: 0 4px 16px rgba(0,0,0,0.15);
    opacity: 0;
    transition: opacity 0.2s;
  }
  .toast.visible {
    opacity: 1;
  }
  @keyframes highlight-pulse {
    0%, 100% { border-color: #00848B; box-shadow: 0 0 6px rgba(0,132,139,0.5); }
    50%       { border-color: #F5532D; box-shadow: 0 0 6px rgba(245,83,45,0.5); }
  }
  .highlight-overlay {
    position: fixed;
    pointer-events: none;
    border: 2px solid #00848B;
    border-radius: 2px;
    box-sizing: border-box;
    z-index: 999998;
    animation: highlight-pulse 2s ease-in-out infinite;
  }
  /* Hover preview — lightweight outline shown while selection mode is active */
  .hover-target-outline {
    position: fixed;
    pointer-events: none;
    border: 2px solid #00848B;
    border-radius: 2px;
    box-sizing: border-box;
    z-index: 999999;
    transition: top 80ms ease, left 80ms ease, width 80ms ease, height 80ms ease;
  }
  .hover-tooltip {
    position: fixed;
    pointer-events: none;
    z-index: 1000000;
    background: #003D40;
    color: #E0F5F6;
    font-family: 'Inter', system-ui, sans-serif;
    font-size: 11px;
    line-height: 1;
    padding: 4px 8px;
    border-radius: 4px;
    white-space: nowrap;
    box-shadow: 0 2px 8px rgba(0,0,0,0.25);
    max-width: 280px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .hover-tooltip .ht-dim { opacity: 0.55; }
  /* ── Element toolbar — 3f unified bar ── */
  .el-toolbar {
    position: fixed;
    z-index: 999999;
    display: flex;
    align-items: center;
    background: #1a1a1a;
    border-radius: 8px;
    padding: 3px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.06);
    pointer-events: auto;
    gap: 1px;
  }
  .el-toolbar .tb {
    height: 28px;
    border-radius: 5px;
    border: none;
    background: transparent;
    color: #aaa;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 120ms ease-out;
    position: relative;
    flex-shrink: 0;
    font-family: 'Inter', system-ui, sans-serif;
    padding: 0;
  }
  .el-toolbar .tb:hover { background: #333; color: white; }
  .el-toolbar .tb.active { background: #00464A; color: #5fd4da; }
  .el-toolbar .tb svg { width: 14px; height: 14px; }
  .el-toolbar .tb-icon { width: 28px; }
  .el-toolbar .tb-combo {
    gap: 4px;
    padding: 0 8px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.2px;
  }
  .el-toolbar .tb-combo svg { width: 12px; height: 12px; }
  .el-toolbar .tb-adjunct {
    padding: 0 6px;
    font-size: 10px;
    font-weight: 700;
    background: transparent;
    border-radius: 0;
  }
  .el-toolbar .mode-group {
    display: flex;
    align-items: center;
    border-radius: 5px;
    overflow: hidden;
    transition: opacity 120ms ease-out;
  }
  .el-toolbar .mode-group.ring {
    box-shadow: inset 0 0 0 1.5px #00848B;
  }
  .el-toolbar .mode-group.dim { opacity: 0.4; }
  .el-toolbar .mode-group .mode-sep {
    width: 1px;
    height: 14px;
    background: rgba(0,132,139,0.5);
    flex-shrink: 0;
  }
  .el-toolbar .tb-sep {
    width: 1px;
    height: 16px;
    background: #3a3a3a;
    margin: 0 2px;
    flex-shrink: 0;
  }
  /* ── Message row ── */
  .msg-row {
    position: fixed;
    z-index: 999999;
    display: flex;
    align-items: flex-end;
    gap: 4px;
    background: #1a1a1a;
    border-radius: 8px;
    padding: 3px 4px 3px 8px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.06);
    pointer-events: auto;
  }
  .msg-row textarea {
    width: 260px;
    border: none;
    background: #2a2a2a;
    color: #e5e5e5;
    font-family: 'Inter', system-ui, sans-serif;
    font-size: 13px;
    line-height: 1.4;
    padding: 4px 8px;
    border-radius: 5px;
    outline: none;
    resize: none;
    overflow: hidden;
    height: 26px;
    box-sizing: border-box;
    margin: 0;
  }
  .msg-row textarea::placeholder { color: #888; }
  .msg-send {
    width: 24px;
    height: 24px;
    border-radius: 5px;
    border: none;
    background: #00848B;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
  }
  .msg-send svg { width: 12px; height: 12px; }

  /* ── Text editing action bar ── */
  .text-action-bar {
    position: fixed;
    z-index: 999999;
    display: flex;
    gap: 6px;
    padding: 4px;
    background: #1a1a1a;
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.4);
    pointer-events: auto;
    font-family: 'Inter', system-ui, sans-serif;
  }
  .text-action-confirm {
    padding: 4px 10px;
    border-radius: 5px;
    border: 1px solid #00848B;
    background: #00848B;
    color: white;
    font-size: 10px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.12s;
  }
  .text-action-confirm:hover { background: #006E74; }
  .text-action-cancel {
    padding: 4px 10px;
    border-radius: 5px;
    border: 1px solid rgba(255,255,255,0.15);
    background: transparent;
    color: #ccc;
    font-size: 10px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.12s;
  }
  .text-action-cancel:hover {
    border-color: #F5532D;
    color: #F5532D;
    background: rgba(245,83,45,0.1);
  }

  .el-toolbar-sep {
    width: 1px;
    background: rgba(255,255,255,0.15);
    flex-shrink: 0;
    align-self: stretch;
  }
  /* ── Hover preview highlight (dashed, for group hover) ── */
  .highlight-preview {
    position: fixed;
    pointer-events: none;
    border: 2px dashed #00848B;
    border-radius: 2px;
    box-sizing: border-box;
    z-index: 999998;
  }
  /* ── Group picker popover (replaces instance picker) ── */
  .el-group-exact {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    font-size: 11px;
    color: #A0ABAB;
  }
  .el-group-exact .el-count-chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    padding: 1px 6px;
    font-size: 10px;
    font-weight: 600;
    color: #fff;
    background: #00848B;
    border-radius: 9999px;
  }
  .el-group-divider {
    padding: 6px 12px 4px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #687879;
    border-top: 1px solid #DFE2E2;
  }
  .el-group-empty {
    padding: 12px 14px;
    font-size: 11px;
    color: #687879;
    text-align: left;
  }
  .el-group-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 12px;
    cursor: pointer;
    transition: background 0.1s;
  }
  .el-group-row:hover { background: rgba(0,132,139,0.05); }
  .el-group-row input[type=checkbox] {
    accent-color: #00848B;
    width: 13px;
    height: 13px;
    flex-shrink: 0;
    cursor: pointer;
  }
  .el-group-count {
    font-size: 11px;
    font-weight: 600;
    color: #334041;
    min-width: 20px;
  }
  .el-group-diff {
    flex: 1;
    font-size: 10px;
    font-family: 'SF Mono', 'JetBrains Mono', 'Fira Code', monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .el-group-diff .diff-add { color: #16a34a; }
  .el-group-diff .diff-rem { color: #dc2626; }
  /* ── Instance picker popover ── */
  .el-picker {
    position: fixed;
    z-index: 1000000;
    background: #fff;
    border: 1px solid #DFE2E2;
    border-radius: 8px;
    box-shadow: 0 8px 28px rgba(0,0,0,0.14);
    min-width: 240px;
    max-width: 320px;
    font-family: 'Inter', system-ui, sans-serif;
    pointer-events: auto;
    overflow: hidden;
  }
  .el-picker-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px 6px;
    border-bottom: 1px solid #DFE2E2;
  }
  .el-picker-title {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #687879;
  }
  .el-picker-actions {
    display: flex;
    gap: 8px;
  }
  .el-picker-actions a {
    font-size: 10px;
    color: #00848B;
    cursor: pointer;
    text-decoration: none;
    font-weight: 500;
  }
  .el-picker-actions a:hover { text-decoration: underline; }
  .el-picker-list {
    max-height: 240px;
    overflow-y: auto;
    padding: 4px 0;
  }
  .el-picker-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 12px;
    cursor: pointer;
    transition: background 0.1s;
  }
  .el-picker-row:hover { background: rgba(0,132,139,0.05); }
  .el-picker-row input[type=checkbox] {
    accent-color: #00848B;
    width: 13px;
    height: 13px;
    flex-shrink: 0;
    cursor: pointer;
  }
  .el-picker-badge {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 1px solid #DFE2E2;
    background: #F4F5F5;
    color: #687879;
    font-size: 8px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .el-picker-badge.checked {
    border-color: #00848B;
    background: rgba(0,132,139,0.08);
    color: #00848B;
  }
  .el-picker-label {
    flex: 1;
    font-size: 11px;
    color: #334041;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .el-picker-tag {
    font-size: 9px;
    color: #A3ADAD;
    font-weight: 400;
  }
  .el-picker-footer {
    padding: 6px 10px;
    border-top: 1px solid #DFE2E2;
    display: flex;
    justify-content: flex-end;
  }
  .el-picker-apply {
    height: 26px;
    padding: 0 12px;
    border-radius: 5px;
    border: none;
    background: #00848B;
    color: #fff;
    font-size: 11px;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    transition: background 0.15s;
  }
  .el-picker-apply:hover { background: #006E74; }
`;
