import { computePosition, flip, offset } from "@floating-ui/dom";
import type { ContainerName, IContainer } from "./containers/IContainer";
import { ModalContainer } from "./containers/ModalContainer";
import { PopoverContainer } from "./containers/PopoverContainer";
import { PopupContainer } from "./containers/PopupContainer";
import { SidebarContainer } from "./containers/SidebarContainer";
import { buildContext, getInnerText, hasOnlyTextChildren } from "./context";
import { armInsert, cancelInsert } from "./drop-zone";
import {
	findAllInstances,
	findComponentBoundary,
	findDOMEquivalents,
	findInlineRepeatedNodes,
	getChildPath,
	getFiber,
	getRootFiber,
	resolvePathToDOM,
} from "./fiber";
import type { ElementGroup } from "./grouping";
import { computeNearGroups, findExactMatches } from "./grouping";
import type { InsertMode } from "./messages";
import {
	applyPreview,
	applyPreviewBatch,
	applyStagedClassChange,
	commitPreview,
	getPreviewState,
	revertPreview,
} from "./patcher";
import { areSiblings, captureRegion } from "./screenshot";
import { parseClasses } from "./tailwind/class-parser";
import { connect, onMessage, send, sendTo } from "./ws";

let shadowRoot: ShadowRoot;
let shadowHost: HTMLElement;
let active = false;
let wasConnected = false;
let tailwindConfigCache: any = null;

// Current selection state for Patcher WS handlers
let currentEquivalentNodes: HTMLElement[] = [];
let currentTargetEl: HTMLElement | null = null;
let currentBoundary: { componentName: string } | null = null;
let currentInstances: Array<{ index: number; label: string; parent: string }> =
	[];

// Cached near-groups for the current selection (computed lazily on first + click)
let cachedNearGroups: ElementGroup[] | null = null;

// Text-editing state
let textEditActive = false;
let textEditOriginal = "";

function enterTextEditMode() {
	if (!currentTargetEl || textEditActive) return;
	textEditActive = true;
	textEditOriginal = currentTargetEl.innerText;
	currentTargetEl.contentEditable = "true";
	currentTargetEl.dataset.twTextEditing = "";
	currentTargetEl.focus();
	// Select all text
	const sel = window.getSelection();
	if (sel) {
		const range = document.createRange();
		range.selectNodeContents(currentTargetEl);
		sel.removeAllRanges();
		sel.addRange(range);
	}
	currentTargetEl.addEventListener("keydown", textEditKeyHandler);
	currentTargetEl.addEventListener("blur", textEditBlurHandler);
}

function exitTextEditMode(confirm: boolean) {
	if (!currentTargetEl || !textEditActive) return;
	textEditActive = false;
	currentTargetEl.removeEventListener("keydown", textEditKeyHandler);
	currentTargetEl.removeEventListener("blur", textEditBlurHandler);
	currentTargetEl.contentEditable = "false";
	delete currentTargetEl.dataset.twTextEditing;
	if (confirm) {
		const newText = currentTargetEl.innerText;
		if (newText !== textEditOriginal) {
			sendTo("panel", {
				type: "TEXT_EDIT_END",
				originalText: textEditOriginal,
				newText,
			});
		} else {
			sendTo("panel", { type: "TEXT_EDIT_CANCEL" });
		}
	} else {
		currentTargetEl.innerText = textEditOriginal;
		sendTo("panel", { type: "TEXT_EDIT_CANCEL" });
	}
}

function textEditKeyHandler(e: KeyboardEvent) {
	if (e.key === "Enter" && !e.shiftKey) {
		e.preventDefault();
		exitTextEditMode(true);
	} else if (e.key === "Escape") {
		e.preventDefault();
		e.stopPropagation();
		exitTextEditMode(false);
	}
}

function textEditBlurHandler() {
	// Small delay to allow Enter key handler to fire first
	setTimeout(() => {
		if (textEditActive) exitTextEditMode(true);
	}, 50);
}

// Hover preview state (shown while selection mode is active + mouse moves)
let hoverOutlineEl: HTMLElement | null = null;
let hoverTooltipEl: HTMLElement | null = null;
let lastHoveredEl: Element | null = null;
let lastMoveTime = 0;

// Container management
let containers: Record<ContainerName, IContainer>;
let activeContainer: IContainer;

const OVERLAY_CSS = `
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
  .highlight-overlay {
    position: fixed;
    pointer-events: none;
    border: 2px solid #00848B;
    border-radius: 2px;
    box-sizing: border-box;
    z-index: 999998;
    opacity: 1;
    transition: opacity 0.6s ease;
  }
  .highlight-overlay.secondary {
    border-style: dashed;
    opacity: 0.5;
  }
  .highlight-overlay.dimmed {
    opacity: 0.25;
  }
  .highlight-overlay.secondary.dimmed {
    opacity: 0.15;
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
  /* ── Element toolbar — single connected dark bar ── */
  .el-toolbar {
    position: fixed;
    z-index: 999999;
    display: flex;
    align-items: stretch;
    background: #003D40;
    border-radius: 6px;
    overflow: hidden;
    box-shadow: 0 4px 16px rgba(0,0,0,0.28);
    pointer-events: auto;
    height: 30px;
  }
  .el-toolbar-sep {
    width: 1px;
    background: rgba(255,255,255,0.15);
    flex-shrink: 0;
    align-self: stretch;
  }
  /* Base style for all buttons inside the toolbar */
  .draw-btn, .el-reselect-btn, .el-pick-btn, .el-add-btn, .el-visibility-btn {
    background: transparent;
    border: none;
    border-radius: 0;
    box-shadow: none;
    color: #E0F5F6;
    font-family: 'Inter', system-ui, sans-serif;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 0 10px;
    height: 30px;
    white-space: nowrap;
    transition: background 0.12s;
    pointer-events: auto;
  }
  .draw-btn { padding: 0 9px; }
  .el-pick-btn { gap: 3px; padding: 0 8px; font-size: 12px; font-weight: 600; letter-spacing: 0.01em; }
  .el-pick-btn svg { opacity: 0.7; flex-shrink: 0; }
  .el-add-btn { padding: 0 10px; font-size: 15px; font-weight: 400; }
  .el-reselect-btn { padding: 0 9px; }
  .el-visibility-btn { padding: 0 8px; }
  .el-visibility-btn.off { opacity: 0.45; }
  .el-visibility-btn.off:hover { opacity: 0.8; }
  .draw-btn:hover, .el-reselect-btn:hover, .el-pick-btn:hover, .el-add-btn:hover,
  .el-visibility-btn:hover,
  .el-pick-btn.open {
    background: rgba(255,255,255,0.12);
  }
  .highlight-overlay.hidden { display: none; }
  /* ── Text editing mode — dashed orange outline on the editable element ── */
  [data-tw-text-editing] {
    outline: 2px dashed #F5532D !important;
    outline-offset: 2px !important;
    cursor: text !important;
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
  .draw-popover {
    position: fixed;
    z-index: 999999;
    background: #fff;
    border: 1px solid #DFE2E2;
    border-radius: 10px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.15);
    padding: 6px 0;
    min-width: 210px;
    font-family: 'Inter', system-ui, sans-serif;
    pointer-events: auto;
  }
  .draw-popover-header {
    padding: 6px 14px 4px;
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #687879;
  }
  .draw-popover-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 14px;
    font-size: 13px;
    color: #1a2b2c;
    cursor: pointer;
    transition: background 0.1s;
    border: none;
    background: none;
    width: 100%;
    text-align: left;
    font-family: inherit;
  }
  .draw-popover-item:hover {
    background: rgba(0, 132, 139, 0.06);
  }
  .draw-popover-item:hover .draw-popover-icon {
    color: #00848B;
    background: rgba(0, 132, 139, 0.08);
    border-color: #00848B;
  }
  .draw-popover-icon {
    width: 26px;
    height: 26px;
    border-radius: 6px;
    border: 1px solid #DFE2E2;
    background: #F4F5F5;
    color: #687879;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    transition: all 0.1s;
    flex-shrink: 0;
  }
  .draw-popover-label {
    flex: 1;
    font-weight: 500;
  }
  .draw-popover-hint {
    font-size: 10px;
    color: #9DAAAB;
    font-weight: 400;
  }
`;

function highlightElement(el: HTMLElement, primary = false): void {
	const rect = el.getBoundingClientRect();
	const overlay = document.createElement("div");
	let cls = "highlight-overlay";
	if (!primary) cls += " secondary";
	if (!highlightsVisible) cls += " hidden";
	overlay.className = cls;
	overlay.style.top = `${rect.top - 3}px`;
	overlay.style.left = `${rect.left - 3}px`;
	overlay.style.width = `${rect.width + 6}px`;
	overlay.style.height = `${rect.height + 6}px`;
	shadowRoot.appendChild(overlay);
}

let dimTimer: ReturnType<typeof setTimeout> | null = null;

function clearHighlights(): void {
	if (dimTimer) { clearTimeout(dimTimer); dimTimer = null; }
	shadowRoot
		.querySelectorAll(".highlight-overlay")
		.forEach((el) => el.remove());
	removeDrawButton();
	highlightsVisible = true;
}

/** Add .dimmed to all highlights after a delay so they fade out of the way */
function scheduleDim(): void {
	if (dimTimer) clearTimeout(dimTimer);
	dimTimer = setTimeout(() => {
		shadowRoot
			.querySelectorAll(".highlight-overlay")
			.forEach((el) => el.classList.add("dimmed"));
	}, 2000);
}

// Whether selection highlight borders are visible (toggled by eye button)
let highlightsVisible = true;

// Element toolbar (wraps draw button + matching controls) shown on selected element
let toolbarEl: HTMLElement | null = null;
let drawPopoverEl: HTMLElement | null = null;
let pickerEl: HTMLElement | null = null;
let pickerCloseHandler: ((e: MouseEvent) => void) | null = null;

function removeDrawButton(): void {
	toolbarEl?.remove();
	toolbarEl = null;
	drawPopoverEl?.remove();
	drawPopoverEl = null;
	pickerEl?.remove();
	pickerEl = null;
}

// ── Hover preview ─────────────────────────────────────────────

function clearHoverPreview(): void {
	hoverOutlineEl?.remove();
	hoverOutlineEl = null;
	hoverTooltipEl?.remove();
	hoverTooltipEl = null;
	lastHoveredEl = null;
}

function showHoverPreview(el: HTMLElement, componentName: string): void {
	const rect = el.getBoundingClientRect();

	if (!hoverOutlineEl) {
		hoverOutlineEl = document.createElement("div");
		hoverOutlineEl.className = "hover-target-outline";
		shadowRoot.appendChild(hoverOutlineEl);
	}
	hoverOutlineEl.style.top = `${rect.top - 3}px`;
	hoverOutlineEl.style.left = `${rect.left - 3}px`;
	hoverOutlineEl.style.width = `${rect.width + 6}px`;
	hoverOutlineEl.style.height = `${rect.height + 6}px`;

	if (!hoverTooltipEl) {
		hoverTooltipEl = document.createElement("div");
		hoverTooltipEl.className = "hover-tooltip";
		shadowRoot.appendChild(hoverTooltipEl);
	}
	const tag = el.tagName.toLowerCase();
	const cls =
		(typeof el.className === "string"
			? el.className.trim().split(/\s+/)[0]
			: "") ?? "";
	hoverTooltipEl.innerHTML = `<span class="ht-dim">&lt;</span>${componentName}<span class="ht-dim">&gt;</span> <span class="ht-dim">${tag}${cls ? `.${cls}` : ""}</span>`;

	// Position tooltip just above the element (with 6px gap)
	const tooltipHeight = 24; // approximate before DOM paint
	const ttTop = rect.top - tooltipHeight - 6;
	hoverTooltipEl.style.top = `${ttTop < 4 ? rect.bottom + 6 : ttTop}px`;
	hoverTooltipEl.style.left = `${Math.max(4, Math.min(rect.left, window.innerWidth - 200))}px`;
}

function mouseMoveHandler(e: MouseEvent): void {
	const now = Date.now();
	if (now - lastMoveTime < 16) return;
	lastMoveTime = now;

	// Ignore events originating from our shadow DOM
	const composed = e.composedPath();
	if (composed.some((n) => n === shadowHost)) {
		clearHoverPreview();
		return;
	}

	const target = e.target as Element;
	if (!target || !(target instanceof HTMLElement)) {
		clearHoverPreview();
		return;
	}
	if (target === lastHoveredEl) return;
	lastHoveredEl = target;

	const rect = target.getBoundingClientRect();
	if (rect.width < 10 || rect.height < 10) {
		clearHoverPreview();
		return;
	}

	const fiber = getFiber(target);
	const boundary = fiber ? findComponentBoundary(fiber) : null;
	const label = boundary?.componentName ?? target.tagName.toLowerCase();

	showHoverPreview(target, label);
}

const PENCIL_SVG = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M15,0H1C0.448,0,0,0.448,0,1v9c0,0.552,0.448,1,1,1h2.882l-1.776,3.553c-0.247,0.494-0.047,1.095,0.447,1.342C2.696,15.966,2.849,16,2.999,16c0.367,0,0.72-0.202,0.896-0.553L4.618,14h6.764l0.724,1.447C12.281,15.798,12.634,16,13.001,16c0.15,0,0.303-0.034,0.446-0.105c0.494-0.247,0.694-0.848,0.447-1.342L12.118,11H15c0.552,0,1-0.448,1-1V1C16,0.448,15.552,0,15,0z M5.618,12l0.5-1h3.764l0.5,1H5.618z M14,9H2V2h12V9z"/></svg>`;

const CHEVRON_SVG = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;

const EYE_ON_SVG = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8,14c4.707,0,7.744-5.284,7.871-5.508c0.171-0.304,0.172-0.676,0.001-0.98C15.746,7.287,12.731,2,8,2C3.245,2,0.251,7.289,0.126,7.514c-0.169,0.303-0.168,0.672,0.002,0.975C0.254,8.713,3.269,14,8,14z M8,4c2.839,0,5.036,2.835,5.818,4C13.034,9.166,10.837,12,8,12c-2.841,0-5.038-2.838-5.819-4.001C2.958,6.835,5.146,4,8,4z"/><circle cx="8" cy="8" r="2"/></svg>`;

const EYE_OFF_SVG = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M14.574,5.669l-1.424,1.424C13.428,7.44,13.656,7.757,13.819,8c-0.76,1.13-2.85,3.82-5.561,3.985L6.443,13.8C6.939,13.924,7.457,14,8,14c4.707,0,7.744-5.284,7.871-5.508c0.171-0.304,0.172-0.676,0.001-0.98C15.825,7.427,15.372,6.631,14.574,5.669z"/><path d="M0.293,15.707C0.488,15.902,0.744,16,1,16s0.512-0.098,0.707-0.293l14-14c0.391-0.391,0.391-1.023,0-1.414s-1.023-0.391-1.414,0l-2.745,2.745C10.515,2.431,9.331,2,8,2C3.245,2,0.251,7.289,0.126,7.514c-0.169,0.303-0.168,0.672,0.002,0.975c0.07,0.125,1.044,1.802,2.693,3.276l-2.529,2.529C-0.098,14.684-0.098,15.316,0.293,15.707z M2.181,7.999C2.958,6.835,5.146,4,8,4c0.742,0,1.437,0.201,2.078,0.508L8.512,6.074C8.348,6.029,8.178,6,8,6C6.895,6,6,6.895,6,8c0,0.178,0.029,0.348,0.074,0.512L4.24,10.346C3.285,9.51,2.559,8.562,2.181,7.999z"/></svg>`;

const RESELECT_SVG = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M14,0H2C.895,0,0,.895,0,2V14c0,1.105,.895,2,2,2H6c.552,0,1-.448,1-1h0c0-.552-.448-1-1-1H2V2H14V6c0,.552,.448,1,1,1h0c.552,0,1-.448,1-1V2c0-1.105-.895-2-2-2Z"/><path d="M12.043,10.629l2.578-.644c.268-.068,.43-.339,.362-.607-.043-.172-.175-.308-.345-.358l-7-2c-.175-.051-.363-.002-.492,.126-.128,.129-.177,.317-.126,.492l2,7c.061,.214,.257,.362,.48,.362h.009c.226-.004,.421-.16,.476-.379l.644-2.578,3.664,3.664c.397,.384,1.03,.373,1.414-.025,.374-.388,.374-1.002,0-1.389l-3.664-3.664Z"/></svg>`;

const TEXT_EDIT_SVG = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M14.895,2.553l-1-2c-.169-.339-.516-.553-.895-.553H3c-.379,0-.725,.214-.895,.553L1.105,2.553c-.247,.494-.047,1.095,.447,1.342,.496,.248,1.095,.046,1.342-.447l.724-1.447h3.382V14h-2c-.552,0-1,.448-1,1s.448,1,1,1h6c.552,0,1-.448,1-1s-.448-1-1-1h-2V2h3.382l.724,1.447c.175,.351,.528,.553,.896,.553,.15,0,.303-.034,.446-.105,.494-.247,.694-.848,.447-1.342Z"/></svg>`;

async function positionWithFlip(
	anchor: HTMLElement,
	floating: HTMLElement,
	placement: "top-start" | "bottom-start" = "top-start",
): Promise<void> {
	const { x, y } = await computePosition(anchor, floating, {
		placement,
		middleware: [offset(6), flip()],
	});
	floating.style.left = `${x}px`;
	floating.style.top = `${y}px`;
}

function showDrawButton(targetEl: HTMLElement): void {
	removeDrawButton();

	const instanceCount = currentEquivalentNodes.length;

	// ── Build toolbar ──────────────────────────────────────────
	const toolbar = document.createElement("div");
	toolbar.className = "el-toolbar";
	toolbar.style.left = "0px";
	toolbar.style.top = "0px";
	shadowRoot.appendChild(toolbar);
	toolbarEl = toolbar;

	// Re-select button — activates crosshair to pick a new element
	const reselectBtn = document.createElement("button");
	reselectBtn.className = "el-reselect-btn";
	reselectBtn.innerHTML = RESELECT_SVG;
	reselectBtn.title = "Re-select element";
	toolbar.appendChild(reselectBtn);

	reselectBtn.addEventListener("click", (e) => {
		e.stopPropagation();
		clearHighlights();
		setSelectMode(true);
	});

	// Draw button
	const drawBtn = document.createElement("button");
	drawBtn.className = "draw-btn";
	drawBtn.innerHTML = PENCIL_SVG;
	drawBtn.title = "Insert drawing canvas";
	toolbar.appendChild(drawBtn);

	drawBtn.addEventListener("click", (e) => {
		e.stopPropagation();
		pickerEl?.remove();
		pickerEl = null;
		if (drawPopoverEl) {
			drawPopoverEl.remove();
			drawPopoverEl = null;
		} else {
			showDrawPopover(drawBtn);
		}
	});

	// Text edit button — only shown for elements with editable text
	if (hasOnlyTextChildren(targetEl)) {
		const textBtn = document.createElement("button");
		textBtn.className = "draw-btn";
		textBtn.innerHTML = TEXT_EDIT_SVG;
		textBtn.title = "Edit text content";
		toolbar.appendChild(textBtn);

		textBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			pickerEl?.remove();
			pickerEl = null;
			drawPopoverEl?.remove();
			drawPopoverEl = null;
			enterTextEditMode();
		});
	}

	// Visibility toggle — show/hide selection borders
	const visBtn = document.createElement("button");
	visBtn.className = `el-visibility-btn${highlightsVisible ? "" : " off"}`;
	visBtn.innerHTML = highlightsVisible ? EYE_ON_SVG : EYE_OFF_SVG;
	visBtn.title = highlightsVisible
		? "Hide selection borders"
		: "Show selection borders";
	toolbar.appendChild(visBtn);

	visBtn.addEventListener("click", (e) => {
		e.stopPropagation();
		highlightsVisible = !highlightsVisible;
		visBtn.innerHTML = highlightsVisible ? EYE_ON_SVG : EYE_OFF_SVG;
		visBtn.title = highlightsVisible
			? "Hide selection borders"
			: "Show selection borders";
		visBtn.classList.toggle("off", !highlightsVisible);
		shadowRoot
			.querySelectorAll(".highlight-overlay")
			.forEach((el) => {
				el.classList.toggle("hidden", !highlightsVisible);
				if (highlightsVisible) el.classList.remove("dimmed");
			});
		if (highlightsVisible) scheduleDim();
	});

	// Separator
	const sep = document.createElement("div");
	sep.className = "el-toolbar-sep";
	toolbar.appendChild(sep);

	// Combined "N +" button — shows count and opens group dropdown
	const addGroupBtn = document.createElement("button");
	addGroupBtn.className = "el-add-btn";
	addGroupBtn.textContent = `${instanceCount} +`;
	addGroupBtn.title = `${instanceCount} matching element${instanceCount !== 1 ? "s" : ""} selected — click to add similar`;
	toolbar.appendChild(addGroupBtn);

	addGroupBtn.addEventListener("click", (e) => {
		e.stopPropagation();
		drawPopoverEl?.remove();
		drawPopoverEl = null;
		if (pickerEl) {
			pickerEl.remove();
			pickerEl = null;
			addGroupBtn.classList.remove("open");
		} else {
			addGroupBtn.classList.add("open");
			showGroupPicker(
				addGroupBtn,
				() => addGroupBtn.classList.remove("open"),
				(totalCount) => {
					addGroupBtn.textContent = `${totalCount} +`;
					addGroupBtn.title = `${totalCount} matching element${totalCount !== 1 ? "s" : ""} selected — click to add similar`;
				},
			);
		}
	});

	// Position toolbar using @floating-ui/dom
	positionWithFlip(targetEl, toolbar);
}

function showGroupPicker(
	anchorBtn: HTMLElement,
	onClose: () => void,
	onCountChange: (totalCount: number) => void,
): void {
	if (pickerCloseHandler) {
		document.removeEventListener("click", pickerCloseHandler, {
			capture: true,
		});
		pickerCloseHandler = null;
	}
	pickerEl?.remove();

	// Lazily compute near-groups on first open
	if (!cachedNearGroups && currentTargetEl) {
		const exactSet = new Set(currentEquivalentNodes);
		cachedNearGroups = computeNearGroups(currentTargetEl, exactSet, shadowHost);
	}
	const groups = cachedNearGroups ?? [];

	const picker = document.createElement("div");
	picker.className = "el-picker";
	picker.style.left = "0px";
	picker.style.top = "0px";
	shadowRoot.appendChild(picker);
	pickerEl = picker;

	// Header
	const header = document.createElement("div");
	header.className = "el-picker-header";
	const title = document.createElement("span");
	title.className = "el-picker-title";
	title.textContent = "Selection";
	header.appendChild(title);
	picker.appendChild(header);

	// Exact match summary
	const exactCount = currentEquivalentNodes.length;
	const exactRow = document.createElement("div");
	exactRow.className = "el-group-exact";
	const chip = document.createElement("span");
	chip.className = "el-count-chip";
	chip.textContent = String(exactCount);
	exactRow.appendChild(chip);
	const exactLabel = document.createElement("span");
	exactLabel.textContent = `exact match${exactCount !== 1 ? "es" : ""} selected`;
	exactRow.appendChild(exactLabel);
	picker.appendChild(exactRow);

	// Divider before similar section
	const divider = document.createElement("div");
	divider.className = "el-group-divider";
	divider.textContent = "Similar";
	picker.appendChild(divider);

	if (groups.length === 0) {
		const empty = document.createElement("div");
		empty.className = "el-group-empty";
		empty.textContent = "No additional similar elements found";
		picker.appendChild(empty);
	} else {
		const list = document.createElement("div");
		list.className = "el-picker-list";
		picker.appendChild(list);

		// Track which groups are checked (includes their elements in selection)
		const checkedGroups = new Set<number>();
		// Base exact-match nodes that are always included
		const baseNodes = [...currentEquivalentNodes];

		function clearPreviewHighlights() {
			shadowRoot
				.querySelectorAll(".highlight-preview")
				.forEach((el) => el.remove());
		}

		function updateSelection() {
			// Rebuild currentEquivalentNodes from base + checked groups
			const allNodes = [...baseNodes];
			for (const idx of checkedGroups) {
				for (const el of groups[idx].elements) {
					if (!allNodes.includes(el)) allNodes.push(el);
				}
			}
			currentEquivalentNodes = allNodes;
			// Redraw highlights
			shadowRoot
				.querySelectorAll(".highlight-overlay")
				.forEach((el) => el.remove());
			currentEquivalentNodes.forEach((n) => highlightElement(n, n === currentTargetEl));
			scheduleDim();
			onCountChange(currentEquivalentNodes.length);
			// Update panel
			if (currentTargetEl && currentBoundary) {
				sendTo("panel", {
					type: "ELEMENT_SELECTED",
					componentName: currentBoundary.componentName,
					instanceCount: currentEquivalentNodes.length,
					classes:
						typeof currentTargetEl.className === "string"
							? currentTargetEl.className
							: "",
					tailwindConfig: tailwindConfigCache,
				});
			}
		}

		groups.forEach((group, idx) => {
			const row = document.createElement("label");
			row.className = "el-group-row";

			const cb = document.createElement("input");
			cb.type = "checkbox";
			cb.checked = false;
			cb.addEventListener("change", () => {
				if (cb.checked) checkedGroups.add(idx);
				else checkedGroups.delete(idx);
				updateSelection();
			});

			const count = document.createElement("span");
			count.className = "el-group-count";
			count.textContent = `(${group.elements.length})`;

			const diff = document.createElement("span");
			diff.className = "el-group-diff";
			const parts: string[] = [];
			for (const a of group.added)
				parts.push(`<span class="diff-add">+${a}</span>`);
			for (const r of group.removed)
				parts.push(`<span class="diff-rem">-${r}</span>`);
			diff.innerHTML = parts.join(" ");

			row.appendChild(cb);
			row.appendChild(count);
			row.appendChild(diff);
			list.appendChild(row);

			// Hover preview: show dashed outlines for this group's elements
			row.addEventListener("mouseenter", () => {
				clearPreviewHighlights();
				for (const el of group.elements) {
					const rect = el.getBoundingClientRect();
					const preview = document.createElement("div");
					preview.className = "highlight-preview";
					preview.style.top = `${rect.top - 3}px`;
					preview.style.left = `${rect.left - 3}px`;
					preview.style.width = `${rect.width + 6}px`;
					preview.style.height = `${rect.height + 6}px`;
					shadowRoot.appendChild(preview);
				}
			});

			row.addEventListener("mouseleave", () => {
				clearPreviewHighlights();
			});
		});
	}

	// Position
	positionWithFlip(anchorBtn, picker);

	// Close on outside click
	const removePicker = () => {
		shadowRoot
			.querySelectorAll(".highlight-preview")
			.forEach((el) => el.remove());
		if (pickerCloseHandler) {
			document.removeEventListener("click", pickerCloseHandler, {
				capture: true,
			});
			pickerCloseHandler = null;
		}
		pickerEl?.remove();
		pickerEl = null;
	};

	setTimeout(() => {
		pickerCloseHandler = (e: MouseEvent) => {
			const path = e.composedPath();
			if (!path.includes(picker) && !path.includes(anchorBtn)) {
				removePicker();
				onClose();
			}
		};
		document.addEventListener("click", pickerCloseHandler, { capture: true });
	}, 0);
}

function showDrawPopover(anchorBtn: HTMLElement): void {
	drawPopoverEl?.remove();

	const popover = document.createElement("div");
	popover.className = "draw-popover";
	popover.style.left = "0px";
	popover.style.top = "0px";

	const header = document.createElement("div");
	header.className = "draw-popover-header";
	header.textContent = "Insert Drawing Canvas";
	popover.appendChild(header);

	const items: {
		mode: InsertMode;
		icon: string;
		label: string;
		hint: string;
	}[] = [
		{ mode: "before", icon: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect y="12" width="16" height="4" rx="1"/><path d="M4.707,5.707,7,3.414V9A1,1,0,0,0,9,9V3.414l2.293,2.293a1,1,0,0,0,1.414-1.414l-4-4a1,1,0,0,0-1.414,0l-4,4A1,1,0,0,0,4.707,5.707Z"/></svg>', label: "Before element", hint: "sibling" },
		{ mode: "after", icon: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M14,0H2A1,1,0,0,0,2,2H14a1,1,0,0,0,0-2Z"/><path d="M12.293,9.293,9,12.586V5A1,1,0,0,0,7,5v7.586L3.707,9.293a1,1,0,0,0-1.414,1.414l5,5a1,1,0,0,0,1.414,0l5-5a1,1,0,0,0-1.414-1.414Z"/></svg>', label: "After element", hint: "sibling" },
		{ mode: "first-child", icon: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="12" width="4" height="16" rx="1"/><path d="M9,7H3.414L5.707,4.707A1,1,0,0,0,4.293,3.293l-4,4a1,1,0,0,0,0,1.414l4,4a1,1,0,1,0,1.414-1.414L3.414,9H9A1,1,0,0,0,9,7Z"/></svg>', label: "First child", hint: "child" },
		{ mode: "last-child", icon: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect width="4" height="16" rx="1"/><path d="M11.707,3.293a1,1,0,0,0-1.414,1.414L12.586,7H7A1,1,0,0,0,7,9h5.586l-2.293,2.293a1,1,0,1,0,1.414,1.414l4-4a1,1,0,0,0,0-1.414Z"/></svg>', label: "Last child", hint: "child" },
	];

	for (const item of items) {
		const row = document.createElement("button");
		row.className = "draw-popover-item";
		row.innerHTML = `
      <span class="draw-popover-icon">${item.icon}</span>
      <span class="draw-popover-label">${item.label}</span>
      <span class="draw-popover-hint">${item.hint}</span>
    `;
		row.addEventListener("click", (e) => {
			e.stopPropagation();
			drawPopoverEl?.remove();
			drawPopoverEl = null;
			injectDesignCanvas(item.mode);
		});
		popover.appendChild(row);
	}

	// Separator
	const sep = document.createElement("div");
	sep.style.cssText = "height:1px;background:#DFE2E2;margin:4px 0;";
	popover.appendChild(sep);

	// Screenshot & Annotate header
	const screenshotHeader = document.createElement("div");
	screenshotHeader.className = "draw-popover-header";
	screenshotHeader.textContent = "Screenshot & Annotate";
	popover.appendChild(screenshotHeader);

	// Screenshot button
	const screenshotRow = document.createElement("button");
	screenshotRow.className = "draw-popover-item";
	screenshotRow.innerHTML = `
    <span class="draw-popover-icon"><svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="4" y="4" width="8" height="8" rx="1" ry="1"/><path d="M2,2H6V0H2C.895,0,0,.895,0,2V6H2V2Z"/><path d="M14,0h-4V2h4V6h2V2c0-1.105-.895-2-2-2Z"/><path d="M14,14h-4v2h4c1.105,0,2-.895,2-2v-4h-2v4Z"/><path d="M2,10H0v4c0,1.105,.895,2,2,2H6v-2H2v-4Z"/></svg></span>
    <span class="draw-popover-label">Screenshot & Annotate</span>
  `;
	screenshotRow.addEventListener("click", (e) => {
		e.stopPropagation();
		drawPopoverEl?.remove();
		drawPopoverEl = null;
		handleCaptureScreenshot();
	});
	popover.appendChild(screenshotRow);

	drawPopoverEl = popover;
	shadowRoot.appendChild(popover);

	// Position to the right of the anchor, flipping if needed
	positionWithFlip(anchorBtn, popover, "top-start");

	// Close popover when clicking outside
	const closeHandler = (e: MouseEvent) => {
		const path = e.composedPath();
		if (!path.includes(popover) && !path.includes(anchorBtn)) {
			drawPopoverEl?.remove();
			drawPopoverEl = null;
			document.removeEventListener("click", closeHandler, { capture: true });
		}
	};
	// Delay so the current click doesn't immediately close it
	setTimeout(() => {
		document.addEventListener("click", closeHandler, { capture: true });
	}, 0);
}
function getServerOrigin(): string {
	const scripts = document.querySelectorAll('script[src*="overlay.js"]');
	for (const s of scripts) {
		const src = (s as HTMLScriptElement).src;
		if (src) {
			try {
				const url = new URL(src);
				return url.origin;
			} catch {
				/* ignore */
			}
		}
	}
	return "http://localhost:3333";
}

const SERVER_ORIGIN = getServerOrigin();
console.log("[vybit-overlay] SERVER_ORIGIN =", SERVER_ORIGIN);

// When running inside a Storybook iframe, the panel is already shown in
// the Storybook addon tab — suppress the overlay's own panel container.
const insideStorybook = !!(window as any).__STORYBOOK_PREVIEW__;
console.log("[vybit-overlay] insideStorybook =", insideStorybook);

async function fetchTailwindConfig(): Promise<any> {
	if (tailwindConfigCache) {
		return tailwindConfigCache;
	}
	try {
		const res = await fetch(`${SERVER_ORIGIN}/tailwind-config`);
		tailwindConfigCache = await res.json();
		return tailwindConfigCache;
	} catch (err) {
		console.error("[tw-overlay] Failed to fetch tailwind config:", err);
		return {};
	}
}

/**
 * Resolve CSS variable references in the tailwind config's color values.
 * Since the overlay runs in the target app's DOM, it can use getComputedStyle
 * to resolve `var(--destructive)` → actual color value.
 */
function resolveConfigCssVars(config: any): any {
	if (!config || !config.colors) return config;

	const resolved = { ...config, colors: resolveColorObject(config.colors) };
	return resolved;
}

function resolveColorObject(obj: any): any {
	if (typeof obj === 'string') {
		return resolveCssVar(obj);
	}
	if (obj && typeof obj === 'object') {
		const result: Record<string, any> = {};
		for (const key of Object.keys(obj)) {
			result[key] = resolveColorObject(obj[key]);
		}
		return result;
	}
	return obj;
}

function resolveCssVar(value: string): string {
	if (!value.startsWith('var(')) return value;
	// Extract the variable name from var(--name) or var(--name, fallback)
	const match = value.match(/^var\(\s*(--[^,)]+)/);
	if (!match) return value;
	const computed = getComputedStyle(document.documentElement).getPropertyValue(match[1]).trim();
	if (!computed) return value;

	// The resolved value might be a fully valid CSS color (hex, rgb, hsl) — try it directly
	const directColor = normalizeToHex(computed);
	if (directColor) return directColor;

	// shadcn/ui pattern: the config has `var(--destructive)` and --destructive is bare HSL
	// channels like "0 84.2% 60.2%". Try wrapping in hsl().
	const hslColor = normalizeToHex(`hsl(${computed})`);
	if (hslColor) return hslColor;

	return computed;
}

/** Use the browser to normalize any CSS color string to a hex code, or return null. */
function normalizeToHex(cssColor: string): string | null {
	const el = document.createElement('div');
	el.style.color = cssColor;
	if (!el.style.color) return null; // browser rejected it
	document.body.appendChild(el);
	const rgb = getComputedStyle(el).color;
	document.body.removeChild(el);
	// rgb is like "rgb(239, 68, 68)" — convert to hex
	const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
	if (!m) return null;
	const hex = '#' + [m[1], m[2], m[3]].map(n => Number(n).toString(16).padStart(2, '0')).join('');
	return hex;
}

async function clickHandler(e: MouseEvent): Promise<void> {
	console.log(
		"[vybit-overlay] clickHandler fired on",
		(e.target as Element)?.tagName,
		(e.target as Element)?.className,
	);
	// Ignore clicks on our own shadow DOM UI
	const composed = e.composedPath();
	if (composed.some((el) => el === shadowHost)) {
		console.log("[vybit-overlay] click ignored — shadow host");
		return;
	}

	// Ignore clicks inside an active design canvas wrapper
	if (
		composed.some(
			(el) =>
				el instanceof HTMLElement && el.hasAttribute("data-tw-design-canvas"),
		)
	)
		return;

	e.preventDefault();
	e.stopPropagation();

	const target = e.target as Element;
	const targetEl = target as HTMLElement;
	const classString =
		typeof targetEl.className === "string" ? targetEl.className : "";

	// Use the new exact-match grouping logic
	const result = findExactMatches(targetEl, shadowHost);
	const componentName = result.componentName ?? targetEl.tagName.toLowerCase();

	clearHighlights();
	for (const node of result.exactMatch) {
		highlightElement(node, node === targetEl);
	}
	scheduleDim();

	// Fetch tailwind config (cached after first fetch)
	const config = await fetchTailwindConfig();

	// Store selection state for Patcher WS handlers
	currentEquivalentNodes = result.exactMatch;
	currentTargetEl = targetEl;
	currentBoundary = { componentName };
	cachedNearGroups = null; // Reset cached groups for new selection

	// Build instances metadata for context
	currentInstances = result.exactMatch.map((node, i) => ({
		index: i,
		label: (node.innerText || "").trim().slice(0, 40) || `#${i + 1}`,
		parent: node.parentElement?.tagName.toLowerCase() ?? "",
	}));

	// Selection complete — deactivate hover preview and selection mode cursor
	clearHoverPreview();
	setSelectMode(false);

	// Show the element toolbar at the top-left of the selected element
	showDrawButton(targetEl);

	// Open the container if not already open (skip in Storybook — panel lives in addon tab)
	if (!insideStorybook) {
		const panelUrl = `${SERVER_ORIGIN}/panel`;
		if (!activeContainer.isOpen()) {
			activeContainer.open(panelUrl);
		}
	}

	// Send element data to Panel via WS
	// Resolve CSS variable color values using the live DOM context
	const resolvedConfig = config ? resolveConfigCssVars(config) : config;
	const textContent = getInnerText(targetEl);
	const editableText = hasOnlyTextChildren(targetEl);

	// Capture computed styles for sections that may have no explicit Tailwind classes
	const cs = getComputedStyle(targetEl);
	const computedStyles: Record<string, string> = {
		// Margin
		marginTop: cs.marginTop,
		marginRight: cs.marginRight,
		marginBottom: cs.marginBottom,
		marginLeft: cs.marginLeft,
		// Padding
		paddingTop: cs.paddingTop,
		paddingRight: cs.paddingRight,
		paddingBottom: cs.paddingBottom,
		paddingLeft: cs.paddingLeft,
		// Sizing
		width: cs.width,
		height: cs.height,
		minWidth: cs.minWidth,
		maxWidth: cs.maxWidth,
		minHeight: cs.minHeight,
		maxHeight: cs.maxHeight,
		// Layout
		display: cs.display,
		position: cs.position,
		// Flexbox
		flexDirection: cs.flexDirection,
		flexWrap: cs.flexWrap,
		justifyContent: cs.justifyContent,
		alignItems: cs.alignItems,
		gap: cs.gap,
		// Typography
		fontSize: cs.fontSize,
		fontWeight: cs.fontWeight,
		lineHeight: cs.lineHeight,
		letterSpacing: cs.letterSpacing,
		color: cs.color,
		// Borders
		borderTopWidth: cs.borderTopWidth,
		borderRightWidth: cs.borderRightWidth,
		borderBottomWidth: cs.borderBottomWidth,
		borderLeftWidth: cs.borderLeftWidth,
		borderRadius: cs.borderRadius,
		// Effects
		opacity: cs.opacity,
		// Background
		backgroundColor: cs.backgroundColor,
	};

	sendTo("panel", {
		type: "ELEMENT_SELECTED",
		componentName,
		instanceCount: result.exactMatch.length,
		classes: classString,
		tailwindConfig: resolvedConfig,
		textContent: textContent || undefined,
		hasEditableText: editableText || undefined,
		computedStyles,
	});
}

function setSelectMode(on: boolean): void {
	console.log("[vybit-overlay] setSelectMode", on);
	if (on) {
		document.documentElement.style.cursor = "crosshair";
		document.addEventListener("click", clickHandler, { capture: true });
		document.addEventListener("mousemove", mouseMoveHandler, { passive: true });
	} else {
		document.documentElement.style.cursor = "";
		document.removeEventListener("click", clickHandler, { capture: true });
		document.removeEventListener("mousemove", mouseMoveHandler);
		clearHoverPreview();
	}
	sendTo("panel", { type: "SELECT_MODE_CHANGED", active: on });
}

const PANEL_OPEN_KEY = "tw-inspector-panel-open";

function toggleInspect(btn: HTMLButtonElement): void {
	console.log("[vybit-overlay] toggleInspect, active will be", !active);
	active = !active;
	if (active) {
		btn.classList.add("active");
		sessionStorage.setItem(PANEL_OPEN_KEY, "1");
		if (insideStorybook) {
			// In Storybook the panel is already in the addon tab — go straight to select mode
			setSelectMode(true);
		} else {
			// Open the container — select mode is activated via the panel's SelectElementButton
			const panelUrl = `${SERVER_ORIGIN}/panel`;
			if (!activeContainer.isOpen()) {
				activeContainer.open(panelUrl);
			}
		}
		// Restore element toolbar if an element was previously selected
		if (currentTargetEl) {
			showDrawButton(currentTargetEl);
		}
	} else {
		btn.classList.remove("active");
		sessionStorage.removeItem(PANEL_OPEN_KEY);
		setSelectMode(false);
		if (!insideStorybook) {
			activeContainer.close();
		}
		revertPreview();
		clearHighlights();
	}
}

export function showToast(message: string, duration: number = 3000): void {
	const toast = document.createElement("div");
	toast.className = "toast";
	toast.textContent = message;
	shadowRoot.appendChild(toast);
	requestAnimationFrame(() => toast.classList.add("visible"));
	setTimeout(() => {
		toast.classList.remove("visible");
		setTimeout(() => toast.remove(), 200);
	}, duration);
}

// Active design canvas wrappers (tracked for cleanup / cancel restore)
interface DesignCanvasEntry {
	wrapper: HTMLElement;
	replacedNodes: HTMLElement[] | null; // null for inject (no replaced nodes)
	parent: HTMLElement | null;
	anchor: ChildNode | null;
}
const designCanvasWrappers: DesignCanvasEntry[] = [];

function injectDesignCanvas(insertMode: InsertMode): void {
	if (!currentTargetEl || !currentBoundary) {
		showToast("Select an element first");
		return;
	}

	// Remove selection highlights and draw button
	clearHighlights();

	const targetEl = currentTargetEl;

	// Create the wrapper div inserted into the DOM flow based on insertMode
	const wrapper = document.createElement("div");
	wrapper.setAttribute("data-tw-design-canvas", "true");
	wrapper.style.cssText = `
    outline: 2px dashed #00848B;
    outline-offset: 2px;
    border-radius: 6px;
    background: #FAFBFB;
    position: relative;
    overflow: hidden;
    width: 100%;
    height: 400px;
    min-width: 300px;
    min-height: 200px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.15);
    box-sizing: border-box;
  `;

	// Create iframe for the design canvas
	const iframe = document.createElement("iframe");
	iframe.src = `${SERVER_ORIGIN}/panel/?mode=design`;
	iframe.allow = "microphone";
	iframe.style.cssText = `
    width: 100%;
    height: 100%;
    border: none;
    display: block;
  `;

	wrapper.appendChild(iframe);

	// Add resize handle at bottom
	const resizeHandle = document.createElement("div");
	resizeHandle.style.cssText = `
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 8px;
    cursor: ns-resize;
    background: linear-gradient(transparent, rgba(0,132,139,0.06));
    display: flex;
    align-items: center;
    justify-content: center;
  `;
	const resizeBar = document.createElement("div");
	resizeBar.style.cssText = `
    width: 32px;
    height: 3px;
    border-radius: 2px;
    background: #DFE2E2;
  `;
	resizeHandle.appendChild(resizeBar);
	wrapper.appendChild(resizeHandle);

	// Resize logic (vertical)
	let startY = 0;
	let startHeight = 0;
	const onResizeMove = (e: MouseEvent) => {
		const delta = e.clientY - startY;
		const newHeight = Math.max(150, startHeight + delta);
		wrapper.style.height = `${newHeight}px`;
	};
	const onResizeUp = () => {
		iframe.style.pointerEvents = "";
		document.removeEventListener("mousemove", onResizeMove);
		document.removeEventListener("mouseup", onResizeUp);
		document.documentElement.style.cursor = "";
	};
	resizeHandle.addEventListener("mousedown", (e) => {
		e.preventDefault();
		iframe.style.pointerEvents = "none";
		startY = e.clientY;
		startHeight = wrapper.offsetHeight;
		document.documentElement.style.cursor = "ns-resize";
		document.addEventListener("mousemove", onResizeMove);
		document.addEventListener("mouseup", onResizeUp);
	});

	// Add corner resize handle (both axes)
	const cornerHandle = document.createElement("div");
	cornerHandle.style.cssText = `
    position: absolute;
    bottom: 0;
    right: 0;
    width: 14px;
    height: 14px;
    cursor: nwse-resize;
    z-index: 5;
  `;
	const cornerDeco = document.createElement("div");
	cornerDeco.style.cssText = `
    position: absolute;
    bottom: 2px;
    right: 2px;
    width: 8px;
    height: 8px;
    border-right: 2px solid #DFE2E2;
    border-bottom: 2px solid #DFE2E2;
  `;
	cornerHandle.appendChild(cornerDeco);
	wrapper.appendChild(cornerHandle);

	let cornerStartX = 0;
	let cornerStartY = 0;
	let cornerStartWidth = 0;
	let cornerStartHeight = 0;
	const onCornerMove = (e: MouseEvent) => {
		const dw = e.clientX - cornerStartX;
		const dh = e.clientY - cornerStartY;
		wrapper.style.width = `${Math.max(200, cornerStartWidth + dw)}px`;
		wrapper.style.height = `${Math.max(150, cornerStartHeight + dh)}px`;
	};
	const onCornerUp = () => {
		iframe.style.pointerEvents = "";
		document.removeEventListener("mousemove", onCornerMove);
		document.removeEventListener("mouseup", onCornerUp);
		document.documentElement.style.cursor = "";
	};
	cornerHandle.addEventListener("mousedown", (e) => {
		e.preventDefault();
		iframe.style.pointerEvents = "none";
		cornerStartX = e.clientX;
		cornerStartY = e.clientY;
		cornerStartWidth = wrapper.offsetWidth;
		cornerStartHeight = wrapper.offsetHeight;
		document.documentElement.style.cursor = "nwse-resize";
		document.addEventListener("mousemove", onCornerMove);
		document.addEventListener("mouseup", onCornerUp);
	});

	// Insert into the DOM based on insertMode
	switch (insertMode) {
		case "before":
			targetEl.insertAdjacentElement("beforebegin", wrapper);
			break;
		case "after":
			targetEl.insertAdjacentElement("afterend", wrapper);
			break;
		case "first-child":
			targetEl.insertAdjacentElement("afterbegin", wrapper);
			break;
		case "last-child":
			targetEl.appendChild(wrapper);
			break;
		default:
			targetEl.insertAdjacentElement("beforebegin", wrapper);
	}

	designCanvasWrappers.push({
		wrapper,
		replacedNodes: null,
		parent: null,
		anchor: null,
	});
	// Use a short delay to allow the iframe's WS client to connect and register
	iframe.addEventListener("load", () => {
		const contextMsg = {
			type: "ELEMENT_CONTEXT",
			componentName: currentBoundary?.componentName ?? "",
			instanceCount: currentEquivalentNodes.length,
			target: {
				tag: targetEl.tagName.toLowerCase(),
				classes:
					typeof targetEl.className === "string" ? targetEl.className : "",
				innerText: (targetEl.innerText || "").trim().slice(0, 60),
			},
			context: buildContext(targetEl, "", "", new Map()),
			insertMode,
		};
		// Retry a few times so the design iframe's WS has time to register
		let attempts = 0;
		const trySend = () => {
			sendTo("design", contextMsg);
			attempts++;
			if (attempts < 5) setTimeout(trySend, 300);
		};
		setTimeout(trySend, 200);
	});
}

async function handleCaptureScreenshot(): Promise<void> {
	if (!currentTargetEl || !currentBoundary) {
		showToast("Select an element first");
		return;
	}

	if (!areSiblings(currentEquivalentNodes)) {
		showToast(
			"Screenshot & Annotate requires all selected elements to be siblings in the DOM.",
		);
		return;
	}

	let screenshot: string;
	let screenshotWidth: number;
	let screenshotHeight: number;
	try {
		({
			dataUrl: screenshot,
			width: screenshotWidth,
			height: screenshotHeight,
		} = await captureRegion(currentEquivalentNodes));
	} catch (err) {
		showToast("Screenshot capture failed");
		return;
	}

	// Record insertion anchor before we remove nodes
	const parent = currentEquivalentNodes[0].parentElement;
	if (!parent) {
		showToast("Cannot find parent element");
		return;
	}
	// Use a marker node so the anchor survives sibling removal
	const marker = document.createComment("tw-placeholder");
	parent.insertBefore(marker, currentEquivalentNodes[0]);

	// Capture margins from the outer nodes before removal
	const firstStyle = getComputedStyle(currentEquivalentNodes[0]);
	const lastStyle = getComputedStyle(
		currentEquivalentNodes[currentEquivalentNodes.length - 1],
	);
	const marginTop = firstStyle.marginTop;
	const marginBottom = lastStyle.marginBottom;
	const marginLeft = firstStyle.marginLeft;
	const marginRight = firstStyle.marginRight;

	// Snapshot the nodes to restore on cancel — take references before removal
	const replacedNodes = [...currentEquivalentNodes];

	// Snapshot context before DOM mutation
	const targetEl = currentTargetEl;
	const boundary = currentBoundary;
	const instanceCount = currentEquivalentNodes.length;

	// Remove selection highlights and draw button
	clearHighlights();

	// Remove all selected nodes from the DOM
	for (const node of currentEquivalentNodes) {
		node.remove();
	}

	// toolbar ~40px = no footer now
	const PANEL_CHROME_HEIGHT = 40;

	// Build wrapper + iframe (same structure as injectDesignCanvas)
	const wrapper = document.createElement("div");
	wrapper.setAttribute("data-tw-design-canvas", "true");
	wrapper.style.cssText = `
    outline: 2px dashed #00848B;
    outline-offset: 2px;
    border-radius: 6px;
    background: #FAFBFB;
    position: relative;
    overflow: hidden;
    width: ${screenshotWidth}px;
    height: ${screenshotHeight + PANEL_CHROME_HEIGHT}px;
    min-width: 300px;
    margin-top: ${marginTop};
    margin-bottom: ${marginBottom};
    margin-left: ${marginLeft};
    margin-right: ${marginRight};
    box-shadow: 0 4px 24px rgba(0,0,0,0.15);
    box-sizing: border-box;
  `;

	const iframe = document.createElement("iframe");
	iframe.src = `${SERVER_ORIGIN}/panel/?mode=design`;
	iframe.style.cssText = `
    width: 100%;
    height: 100%;
    border: none;
    display: block;
  `;
	wrapper.appendChild(iframe);

	// Insert at original position, then remove marker
	parent.insertBefore(wrapper, marker);
	marker.remove();

	designCanvasWrappers.push({
		wrapper,
		replacedNodes,
		parent,
		anchor: wrapper.nextSibling,
	});
	iframe.addEventListener("load", () => {
		const contextMsg = {
			type: "ELEMENT_CONTEXT",
			componentName: boundary.componentName,
			instanceCount,
			target: {
				tag: targetEl.tagName.toLowerCase(),
				classes:
					typeof targetEl.className === "string" ? targetEl.className : "",
				innerText: (targetEl.innerText || "").trim().slice(0, 60),
			},
			context: buildContext(targetEl, "", "", new Map()),
			insertMode: "replace" as InsertMode,
			screenshot,
		};
		let attempts = 0;
		const trySend = () => {
			sendTo("design", contextMsg);
			attempts++;
			if (attempts < 5) setTimeout(trySend, 300);
		};
		setTimeout(trySend, 200);
	});
}

function removeAllDesignCanvases(): void {
	for (const entry of designCanvasWrappers) {
		entry.wrapper.remove();
	}
	designCanvasWrappers.length = 0;
}

function getDefaultContainer(): ContainerName {
	try {
		const stored = localStorage.getItem("tw-panel-container");
		if (
			stored &&
			(stored === "modal" ||
				stored === "popover" ||
				stored === "sidebar" ||
				stored === "popup")
		) {
			return stored as ContainerName;
		}
	} catch {
		/* ignore */
	}
	return "popover";
}

function init(): void {
	console.log("[vybit-overlay] init() called");
	shadowHost = document.createElement("div");
	shadowHost.id = "tw-visual-editor-host";
	shadowHost.style.cssText =
		"position:fixed;z-index:2147483647;top:0;left:0;width:0;height:0;pointer-events:none;";
	document.body.appendChild(shadowHost);

	shadowRoot = shadowHost.attachShadow({ mode: "open" });

	const style = document.createElement("style");
	style.textContent = OVERLAY_CSS;
	shadowRoot.appendChild(style);

	// Initialize containers
	containers = {
		popover: new PopoverContainer(shadowRoot),
		modal: new ModalContainer(shadowRoot),
		sidebar: new SidebarContainer(shadowRoot),
		popup: new PopupContainer(),
	};
	activeContainer = containers[getDefaultContainer()];

	const btn = document.createElement("button");
	btn.className = "toggle-btn";
	btn.setAttribute("aria-label", "Open VyBit inspector");
	btn.innerHTML = `<svg width="26" height="27" viewBox="0 0 210 221" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path class="eb-fill" d="M141.54 137.71L103.87 140.38C102.98 140.44 102.2 140.97 101.8 141.77C101.41 142.57 101.47 143.51 101.96 144.25C102.27 144.72 109.46 155.39 121.96 155.39C122.3 155.39 122.65 155.39 123 155.37C138.61 154.64 143.83 141.66 144.05 141.11C144.36 140.31 144.24 139.41 143.73 138.72C143.22 138.03 142.4 137.65 141.54 137.71Z"/>
    <path class="eb-eye-l eb-fill" d="M80.6401 93.03C76.7801 93.22 73.8 96.5 73.99 100.36L74.7501 115.96C74.9401 119.85 78.2701 122.84 82.1501 122.61C85.9801 122.38 88.9101 119.11 88.7301 115.28L87.9701 99.68C87.7801 95.82 84.5001 92.84 80.6401 93.03Z"/>
    <path class="eb-eye-r eb-fill" d="M149.46 96.67L150.32 111.72C150.54 115.58 153.85 118.53 157.71 118.31C161.57 118.09 164.52 114.78 164.3 110.92L163.44 95.87C163.22 92.03 159.94 89.08 156.09 89.28C152.22 89.48 149.24 92.79 149.47 96.67H149.46Z"/>
    <path class="eb-fill" d="M203.62 90.36C200.83 87.64 198.15 86.1 195.79 84.75C194 83.73 192.46 82.84 190.96 81.51C189.22 79.95 187.1 75.74 186.15 73.24C186.14 73.21 186.12 73.17 186.11 73.14C180.84 57.81 173.51 43.77 164.58 32.13C148.57 11.27 129.15 0.16 108.42 0C108.28 0 108.13 0 107.99 0C85.65 0 64.34 13.17 47.95 37.12C42.28 45.4 37.04 56.95 33.2 65.38C32.31 67.35 31.51 69.09 30.84 70.52C29.88 72.54 28.87 74.32 27.74 75.95L21.06 15.98C24.27 14.61 26.42 11.74 26.24 8.54C26 4.26 21.69 1.03 16.61 1.31C11.53 1.59 7.61002 5.29 7.85002 9.57C8.04002 12.85 10.61 15.51 14.09 16.45L16.67 85.85L16.29 86.08C13.19 87.96 9.98002 89.9 7.71002 92.09C4.65002 95.04 2.40002 99.48 1.21002 104.92C-1.62998 117.95 0.120019 138.77 10.82 143.95C18.87 147.85 25.1 154.71 28.83 163.79C42.17 198.91 71.91 219.98 108.4 220.16C108.56 220.16 108.71 220.16 108.87 220.16C133.9 220.16 156.3 210.08 171.97 191.74C183.26 178.53 190.59 161.68 193.54 142.92C194.26 139.76 197.48 136.44 200.62 133.23C204.14 129.62 207.78 125.89 209.22 121.16C210.85 115.82 209.93 96.53 203.62 90.36ZM173.3 73.25C176.99 83.04 179.72 93.27 181.36 103.35C183.29 115.23 183.53 126.81 182.18 137.69C180.99 142.99 176.46 157.5 161.58 165.93C141.26 177.45 110.38 180.84 88.16 174.01C63.16 166.32 48.04 142.7 47.72 110.85C47.39 78.09 63.77 70.45 80.58 65.42C101.92 59.04 133.9 57.44 153.39 61.79C163.19 63.98 168.32 67.53 170.9 70.13C172.08 71.32 172.83 72.4 173.3 73.25ZM162.85 183.94C149.31 199.79 130.66 208.15 108.89 208.15C108.75 208.15 108.61 208.15 108.46 208.15C77.09 207.99 51.5 189.77 40 159.41C39.96 159.32 39.93 159.22 39.89 159.13C36.77 151.59 32.28 145.21 26.65 140.22C26.61 140.17 26.57 140.13 26.53 140.08C23.64 137.25 24.55 133.1 24.74 131.41C26.16 118.65 22.59 108.63 21.57 106.52C20.4 104.1 19.23 105.15 19.49 106.56C19.78 108.18 20.09 110.5 20.28 112.89C21.07 122.72 19.28 131.47 17.02 133.03C16.74 133.22 16.46 133.27 16.16 133.19C16.12 133.17 16.08 133.15 16.04 133.13C13.44 131.87 10.36 119.2 12.92 107.46C13.86 103.16 15.4 101.31 16.02 100.71C17.32 99.45 19.95 97.87 22.48 96.33L23.24 95.87C32.05 90.52 37.38 84.66 41.66 75.64C42.36 74.17 43.18 72.36 44.1 70.33C47.54 62.75 52.75 51.3 57.82 43.89C71.91 23.31 89.7 12 107.96 12C108.07 12 108.18 12 108.29 12C133.67 12.19 154.63 33.4 167.85 60.64C164.47 58.82 160.16 57.16 154.65 55.93C134.31 51.39 101 53.03 78.82 59.67C59.32 65.5 41.33 75.74 41.68 110.91C42.03 145.51 58.73 171.25 86.35 179.75C94.55 182.27 103.85 183.49 113.4 183.49C131.42 183.49 150.35 179.17 164.49 171.16C169.1 168.55 172.84 165.45 175.87 162.21C172.6 170.28 168.23 177.61 162.81 183.95L162.85 183.94ZM197.75 117.65C197.4 118.8 196.34 120.21 195.01 121.7C194.91 115.06 194.32 108.28 193.21 101.43C192.95 99.84 192.67 98.26 192.37 96.69C193.34 97.32 194.27 98.01 195.19 98.9C196.86 101.11 198.85 113.73 197.76 117.66L197.75 117.65Z"/>
  </svg>`;
	btn.addEventListener("click", () => toggleInspect(btn));
	if (insideStorybook) {
		btn.style.display = 'none';
	}
	shadowRoot.appendChild(btn);

	// Escape key — clear current selection (skip during text editing — handled by text edit keydown)
	document.addEventListener("keydown", (e) => {
		if (e.key === "Escape" && currentTargetEl && !textEditActive) {
			revertPreview();
			clearHighlights();
			currentEquivalentNodes = [];
			currentTargetEl = null;
			currentBoundary = null;
			cachedNearGroups = null;
			sendTo("panel", { type: "RESET_SELECTION" });
		}
	});

	// WebSocket connection — derive WS URL from script src
	const wsUrl = SERVER_ORIGIN.replace(/^http/, "ws");
	connect(wsUrl);

	// ─── Theme preview: inject CSS custom property overrides ───────
	const THEME_STYLE_ID = "vybit-theme-preview";
	function applyThemePreview(overrides: Array<{ variable: string; value: string }>) {
		let styleEl = document.getElementById(THEME_STYLE_ID) as HTMLStyleElement | null;
		if (overrides.length === 0) {
			if (styleEl) styleEl.remove();
			return;
		}
		if (!styleEl) {
			styleEl = document.createElement("style");
			styleEl.id = THEME_STYLE_ID;
			document.head.appendChild(styleEl);
		}
		const rules = overrides.map(o => `  ${o.variable}: ${o.value} !important;`).join("\n");
		styleEl.textContent = `:root {\n${rules}\n}`;
	}

	// Handle messages from Panel via WS
	onMessage((msg: any) => {
		console.log("[vybit-overlay] WS message received:", msg.type);
		if (msg.type === "TOGGLE_SELECT_MODE") {
			if (msg.active) {
				setSelectMode(true);
				// Ensure panel is open (skip in Storybook — panel lives in addon tab)
				if (!insideStorybook) {
					const panelUrl = `${SERVER_ORIGIN}/panel`;
					if (!activeContainer.isOpen()) activeContainer.open(panelUrl);
				}
			} else {
				setSelectMode(false);
			}
		} else if (
			msg.type === "PATCH_PREVIEW" &&
			currentEquivalentNodes.length > 0
		) {
			applyPreview(
				currentEquivalentNodes,
				msg.oldClass,
				msg.newClass,
				SERVER_ORIGIN,
			);
		} else if (
			msg.type === "PATCH_PREVIEW_BATCH" &&
			currentEquivalentNodes.length > 0
		) {
			applyPreviewBatch(currentEquivalentNodes, msg.pairs, SERVER_ORIGIN);
		} else if (msg.type === "PATCH_REVERT") {
			revertPreview();
		} else if (
			msg.type === "PATCH_REVERT_STAGED" &&
			currentEquivalentNodes.length > 0
		) {
			// Undo a previously committed staged change: apply the reverse swap to the DOM
			// and commit it as the new baseline without telling the server.
			applyPreview(
				currentEquivalentNodes,
				msg.oldClass,
				msg.newClass,
				SERVER_ORIGIN,
			).then(() => commitPreview());
		} else if (
			msg.type === "PATCH_STAGE" &&
			currentTargetEl &&
			currentBoundary
		) {
			// Build context and send PATCH_STAGED to server
			const state = getPreviewState();
			const originalClassMap = new Map<HTMLElement, string>();
			if (state) {
				for (let i = 0; i < state.elements.length; i++) {
					originalClassMap.set(state.elements[i], state.originalClasses[i]);
				}
			}

			const targetElIndex = currentEquivalentNodes.indexOf(currentTargetEl);
			const originalClassString =
				state && targetElIndex !== -1
					? state.originalClasses[targetElIndex]
					: currentTargetEl.className;

			const context = buildContext(
				currentTargetEl,
				msg.oldClass,
				msg.newClass,
				originalClassMap,
			);

			send({
				type: "PATCH_STAGED",
				patch: {
					id: msg.id,
					elementKey: currentBoundary.componentName,
					status: "staged",
					originalClass: msg.oldClass,
					newClass: msg.newClass,
					property: msg.property,
					timestamp: new Date().toISOString(),
					pageUrl: window.location.href,
					component: { name: currentBoundary.componentName },
					target: {
						tag: currentTargetEl.tagName.toLowerCase(),
						classes: originalClassString,
						innerText: (currentTargetEl.innerText || "").trim().slice(0, 60),
					},
					context,
				},
			});

			showToast("Change staged");

			if (state) {
				// Active hover preview already applied the change — freeze it as baseline
				commitPreview();
			} else if (msg.oldClass || msg.newClass) {
				// No preview — apply directly to DOM (synchronous, handles rapid sequential stages)
				applyStagedClassChange(currentEquivalentNodes, msg.oldClass, msg.newClass, SERVER_ORIGIN);
			}
		} else if (msg.type === "CLEAR_HIGHLIGHTS") {
			revertPreview();
			clearHighlights();
			if (msg.deselect) {
				currentEquivalentNodes = [];
				currentTargetEl = null;
				currentBoundary = null;
				cachedNearGroups = null;
			}
		} else if (msg.type === "SWITCH_CONTAINER") {
			const newName = msg.container as ContainerName;
			if (containers[newName] && newName !== activeContainer.name) {
				if (!insideStorybook) {
					const wasOpen = activeContainer.isOpen();
					activeContainer.close();
					activeContainer = containers[newName];
					if (wasOpen) {
						activeContainer.open(`${SERVER_ORIGIN}/panel`);
					}
				} else {
					activeContainer = containers[newName];
				}
			}
		} else if (msg.type === "TEXT_EDIT_START") {
			enterTextEditMode();
		} else if (
			msg.type === "TEXT_CHANGE_STAGE" &&
			currentTargetEl &&
			currentBoundary
		) {
			const context = buildContext(currentTargetEl, "", "", new Map());
			send({
				type: "PATCH_STAGED",
				patch: {
					id: msg.id,
					kind: "text-change",
					elementKey: currentBoundary.componentName,
					status: "staged",
					originalClass: "",
					newClass: "",
					property: "",
					timestamp: new Date().toISOString(),
					pageUrl: window.location.href,
					component: { name: currentBoundary.componentName },
					target: {
						tag: currentTargetEl.tagName.toLowerCase(),
						classes: typeof currentTargetEl.className === "string" ? currentTargetEl.className : "",
						innerText: (msg.originalText || "").trim().slice(0, 60),
					},
					context,
					originalText: msg.originalText,
					newText: msg.newText,
				},
			});
			showToast("Text change staged");
		} else if (msg.type === "THEME_PREVIEW") {
			applyThemePreview(msg.overrides ?? []);
		} else if (msg.type === "INSERT_DESIGN_CANVAS") {
			injectDesignCanvas(msg.insertMode as InsertMode);
		} else if (msg.type === "CAPTURE_SCREENSHOT") {
			handleCaptureScreenshot();
		} else if (msg.type === "DESIGN_SUBMITTED") {
			// Replace the most recent canvas iframe with a static image preview
			const lastEntry = designCanvasWrappers[designCanvasWrappers.length - 1];
			const last = lastEntry?.wrapper;
			if (last) {
				const iframe = last.querySelector("iframe");
				if (iframe && msg.image) {
					const img = document.createElement("img");
					img.src = msg.image;
					img.style.cssText = `
            width: 100%;
            height: auto;
            display: block;
            pointer-events: none;
          `;
					// Remove all children (iframe, resize handles) and show just the image
					last.innerHTML = "";
					last.style.height = "auto";
					last.style.minHeight = "0";
					last.style.overflow = "hidden";
					last.appendChild(img);
				}
			}
		} else if (msg.type === "CLOSE_PANEL") {
			if (active) toggleInspect(btn);
		} else if (msg.type === "COMPONENT_ARM") {
			armInsert(msg, shadowHost);
		} else if (msg.type === "COMPONENT_DISARM") {
			cancelInsert();
		} else if (msg.type === "DESIGN_CLOSE") {
			// Remove the most recently added canvas wrapper, restoring replaced nodes if any
			const last = designCanvasWrappers.pop();
			if (last) {
				if (last.replacedNodes && last.parent) {
					// Restore the original nodes at the same position
					for (const node of last.replacedNodes) {
						if (last.anchor) {
							last.parent.insertBefore(node, last.anchor);
						} else {
							last.parent.appendChild(node);
						}
					}
				}
				last.wrapper.remove();

				// Re-apply selection highlights and toolbar so the user can keep editing
				if (currentTargetEl && currentEquivalentNodes.length > 0) {
					for (const n of currentEquivalentNodes) {
						highlightElement(n, n === currentTargetEl);
					}
					scheduleDim();
					showDrawButton(currentTargetEl);
				}
			}
		}
	});

	window.addEventListener("resize", () => {
		if (currentEquivalentNodes.length > 0) {
			shadowRoot
				.querySelectorAll(".highlight-overlay")
				.forEach((el) => el.remove());
			currentEquivalentNodes.forEach((n) => highlightElement(n, n === currentTargetEl));
		}
		if (toolbarEl && currentTargetEl) {
			positionWithFlip(currentTargetEl, toolbarEl);
		}
	});

	window.addEventListener(
		"scroll",
		() => {
			if (currentEquivalentNodes.length > 0) {
				shadowRoot
					.querySelectorAll(".highlight-overlay")
					.forEach((el) => el.remove());
				currentEquivalentNodes.forEach((n) => highlightElement(n, n === currentTargetEl));
			}
			if (toolbarEl && currentTargetEl) {
				positionWithFlip(currentTargetEl, toolbarEl);
			}
		},
		{ capture: true, passive: true },
	);

	// Auto-open panel if it was open before the last page refresh
	if (sessionStorage.getItem(PANEL_OPEN_KEY) === "1") {
		active = true;
		btn.classList.add("active");
		if (!insideStorybook) {
			activeContainer.open(`${SERVER_ORIGIN}/panel`);
		}
	}

	window.addEventListener("overlay-ws-connected", () => {
		if (wasConnected) {
			showToast("Reconnected");
		}
		wasConnected = true;
	});

	window.addEventListener("overlay-ws-disconnected", () => {
		if (wasConnected) {
			showToast("Connection lost — restart the server and refresh.", 5000);
		}
	});
}

export { shadowRoot };

init();
