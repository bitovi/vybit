// Element highlight & hover preview utilities.
// Extracted from index.ts — operates on shared overlay state.

import { findComponentBoundary, getFiber } from "./fiber";
import { state } from "./overlay-state";

export function highlightElement(el: HTMLElement): void {
	const rect = el.getBoundingClientRect();
	const overlay = document.createElement("div");
	overlay.className = "highlight-overlay";
	overlay.style.top = `${rect.top - 3}px`;
	overlay.style.left = `${rect.left - 3}px`;
	overlay.style.width = `${rect.width + 6}px`;
	overlay.style.height = `${rect.height + 6}px`;
	state.shadowRoot.appendChild(overlay);
}

export function removeDrawButton(): void {
	state.toolbarEl?.remove();
	state.toolbarEl = null;
	state.msgRowEl?.remove();
	state.msgRowEl = null;
	state.pickerEl?.remove();
	state.pickerEl = null;
}

export function clearHighlights(): void {
	state.shadowRoot
		.querySelectorAll(".highlight-overlay")
		.forEach((el) => el.remove());
	removeDrawButton();
}

export function clearHoverPreview(): void {
	state.hoverOutlineEl?.remove();
	state.hoverOutlineEl = null;
	state.hoverTooltipEl?.remove();
	state.hoverTooltipEl = null;
	state.lastHoveredEl = null;
}

export function showHoverPreview(el: HTMLElement, componentName: string): void {
	const rect = el.getBoundingClientRect();

	if (!state.hoverOutlineEl) {
		state.hoverOutlineEl = document.createElement("div");
		state.hoverOutlineEl.className = "hover-target-outline";
		state.shadowRoot.appendChild(state.hoverOutlineEl);
	}
	state.hoverOutlineEl.style.top = `${rect.top - 3}px`;
	state.hoverOutlineEl.style.left = `${rect.left - 3}px`;
	state.hoverOutlineEl.style.width = `${rect.width + 6}px`;
	state.hoverOutlineEl.style.height = `${rect.height + 6}px`;

	if (!state.hoverTooltipEl) {
		state.hoverTooltipEl = document.createElement("div");
		state.hoverTooltipEl.className = "hover-tooltip";
		state.shadowRoot.appendChild(state.hoverTooltipEl);
	}
	const tag = el.tagName.toLowerCase();
	const cls =
		(typeof el.className === "string"
			? el.className.trim().split(/\s+/)[0]
			: "") ?? "";
	state.hoverTooltipEl.innerHTML = `<span class="ht-dim">&lt;</span>${componentName}<span class="ht-dim">&gt;</span> <span class="ht-dim">${tag}${cls ? `.${cls}` : ""}</span>`;

	const tooltipHeight = 24;
	const ttTop = rect.top - tooltipHeight - 6;
	state.hoverTooltipEl.style.top = `${ttTop < 4 ? rect.bottom + 6 : ttTop}px`;
	state.hoverTooltipEl.style.left = `${Math.max(4, Math.min(rect.left, window.innerWidth - 200))}px`;
}

export function mouseMoveHandler(e: MouseEvent): void {
	const now = Date.now();
	if (now - state.lastMoveTime < 16) return;
	state.lastMoveTime = now;

	const composed = e.composedPath();
	if (composed.some((n) => n === state.shadowHost)) {
		clearHoverPreview();
		return;
	}

	const target = e.target as Element;
	if (!target || !(target instanceof HTMLElement)) {
		clearHoverPreview();
		return;
	}
	if (target === state.lastHoveredEl) return;
	state.lastHoveredEl = target;

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
