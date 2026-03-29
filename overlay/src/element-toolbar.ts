// Element toolbar — unified bar shown above the selected element.
// Extracted from index.ts. Contains showDrawButton() and showGroupPicker().

import { computePosition, flip, offset } from "@floating-ui/dom";
import { cancelInsert, clearLockedInsert, startBrowse } from "./drop-zone";
import { highlightElement, clearHighlights, removeDrawButton } from "./element-highlight";
import { computeNearGroups } from "./grouping";
import { state, resolveTab } from "./overlay-state";
import { revertPreview } from "./patcher";
import { SELECT_SVG, INSERT_SVG, DESIGN_SVG, TEXT_SVG, REPLACE_SVG, SEND_SVG } from "./svg-icons";
import { startTextEdit } from "./text-edit";
import { buildTextContext } from "./context";
import { send, sendTo } from "./ws";

// External callbacks set via initToolbar() — avoids circular dependencies
let setSelectMode: (on: boolean) => void;
let showToast: (message: string, duration?: number) => void;
let onBrowseLocked: (target: HTMLElement) => void;

export function initToolbar(deps: {
	setSelectMode: (on: boolean) => void;
	showToast: (message: string, duration?: number) => void;
	onBrowseLocked: (target: HTMLElement) => void;
}): void {
	setSelectMode = deps.setSelectMode;
	showToast = deps.showToast;
	onBrowseLocked = deps.onBrowseLocked;
}

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

export { positionWithFlip };

export function showDrawButton(targetEl: HTMLElement): void {
	removeDrawButton();

	const instanceCount = state.currentEquivalentNodes.length;

	// ── Build 3f unified toolbar ──────────────────────────────
	const toolbar = document.createElement("div");
	toolbar.className = "el-toolbar";
	toolbar.style.left = "0px";
	toolbar.style.top = "0px";
	state.shadowRoot.appendChild(toolbar);
	state.toolbarEl = toolbar;

	// ── Select mode group (ring when active) or standalone Select button ──
	if (state.currentMode === 'select') {
		// Full group: Select + separator + N+
		const selectGroup = document.createElement("div");
		selectGroup.className = 'mode-group ring';

		const selectBtn = document.createElement("button");
		selectBtn.className = 'tb tb-combo tb-select';
		selectBtn.innerHTML = `${SELECT_SVG} Select`;
		selectBtn.style.cssText = 'color: #5fd4da; border-radius: 0;';
		selectBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			cancelInsert();
			clearLockedInsert();
			revertPreview();
			clearHighlights();
			state.currentEquivalentNodes = [];
			state.currentTargetEl = null;
			state.currentBoundary = null;
			state.cachedNearGroups = null;
			state.currentMode = 'select';
			state.currentTab = resolveTab();
			sendTo("panel", { type: "MODE_CHANGED", mode: "select" });
			setSelectMode(true);
		});
		selectGroup.appendChild(selectBtn);

		const innerSep = document.createElement("div");
		innerSep.className = "mode-sep";
		selectGroup.appendChild(innerSep);

		const addGroupBtn = document.createElement("button");
		addGroupBtn.className = "tb tb-adjunct";
		addGroupBtn.innerHTML = `${instanceCount} <span style="font-size:9px;margin-left:1px;opacity:0.6;">+</span>`;
		addGroupBtn.style.cssText = 'color: #5fd4da; border-radius: 0;';
		addGroupBtn.title = `${instanceCount} matching element${instanceCount !== 1 ? "s" : ""} selected — click to add similar`;
		addGroupBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			if (state.pickerEl) {
				state.pickerEl.remove();
				state.pickerEl = null;
			} else {
				showGroupPicker(
					addGroupBtn,
					() => {},
					(totalCount) => {
						addGroupBtn.innerHTML = `${totalCount} <span style="font-size:9px;margin-left:1px;opacity:0.6;">+</span>`;
						addGroupBtn.title = `${totalCount} matching element${totalCount !== 1 ? "s" : ""} selected — click to add similar`;
					},
				);
			}
		});
		selectGroup.appendChild(addGroupBtn);
		toolbar.appendChild(selectGroup);
	} else {
		// Insert mode: standalone Select button (no N+ group)
		const selectBtn = document.createElement("button");
		selectBtn.className = 'tb tb-combo tb-select';
		selectBtn.innerHTML = `${SELECT_SVG} Select`;
		selectBtn.style.cssText = 'opacity: 0.4;';
		selectBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			cancelInsert();
			clearLockedInsert();
			revertPreview();
			clearHighlights();
			state.currentEquivalentNodes = [];
			state.currentTargetEl = null;
			state.currentBoundary = null;
			state.cachedNearGroups = null;
			state.currentMode = 'select';
			state.currentTab = resolveTab();
			sendTo("panel", { type: "MODE_CHANGED", mode: "select" });
			setSelectMode(true);
		});
		toolbar.appendChild(selectBtn);
	}

	// ── Insert button (separate, ring when active) ──
	const insertBtn = document.createElement("button");
	insertBtn.className = `tb tb-combo`;
	insertBtn.innerHTML = `${INSERT_SVG} Insert`;
	if (state.currentMode === 'insert') {
		insertBtn.style.cssText = `box-shadow: inset 0 0 0 1.5px #00848B; color: #5fd4da;`;
	} else {
		insertBtn.style.cssText = `opacity: 0.4;`;
	}
	insertBtn.addEventListener("click", (e) => {
		e.stopPropagation();
		cancelInsert();
		clearLockedInsert();
		revertPreview();
		clearHighlights();
		state.currentEquivalentNodes = [];
		state.currentTargetEl = null;
		state.currentBoundary = null;
		state.cachedNearGroups = null;
		state.currentMode = 'insert';
		if (state.tabPreference === 'design') state.tabPreference = 'component';
		state.currentTab = resolveTab();
		sendTo("panel", { type: "MODE_CHANGED", mode: "insert" });
		startBrowse(state.shadowHost, onBrowseLocked);
	});
	toolbar.appendChild(insertBtn);

	// ── Separator ──
	const sep = document.createElement("div");
	sep.className = "tb-sep";
	toolbar.appendChild(sep);

	// ── Action buttons (mode-dependent) ──
	if (state.currentMode === 'select') {
		const actions = [
			{ id: 'design', label: 'Design', svg: DESIGN_SVG },
			{ id: 'text', label: 'Text', svg: TEXT_SVG },
			{ id: 'replace', label: 'Replace', svg: REPLACE_SVG },
		];
		for (const action of actions) {
			const btn = document.createElement("button");
			btn.className = `tb tb-combo ${state.currentTab === action.id ? 'active' : ''}`;
			btn.innerHTML = `${action.svg} ${action.label}`;
			btn.addEventListener("click", (e) => {
				e.stopPropagation();
				if (action.id === 'text') {
					startTextEdit(targetEl, {
						sendTo,
						send,
						currentBoundary: state.currentBoundary,
						currentTargetEl: targetEl,
						currentEquivalentNodes: state.currentEquivalentNodes,
						buildTextContext,
						positionToolbar: () => positionWithFlip(targetEl, toolbar),
						shadowRoot: state.shadowRoot,
						onDone: () => showDrawButton(targetEl),
					});
					removeDrawButton();
					return;
				}
				state.currentTab = action.id;
				state.tabPreference = (action.id === 'replace' || action.id === 'place') ? 'component' : 'design';
				state.replaceDirection = action.id === 'replace' ? 'element-first' : null;
				sendTo("panel", { type: "TAB_CHANGED", tab: action.id as any });
				showDrawButton(targetEl);
			});
			toolbar.appendChild(btn);
		}
	} else {
		const placeBtn = document.createElement("button");
		placeBtn.className = "tb tb-combo active";
		placeBtn.innerHTML = `Place`;
		toolbar.appendChild(placeBtn);
	}

	// Position toolbar using @floating-ui/dom
	positionWithFlip(targetEl, toolbar);

	// ── Message row (below element) ──
	const msgRow = document.createElement("div");
	msgRow.className = "msg-row";
	msgRow.style.left = "0px";
	msgRow.style.top = "0px";
	state.shadowRoot.appendChild(msgRow);
	state.msgRowEl = msgRow;

	const msgInput = document.createElement("textarea");
	msgInput.rows = 1;
	msgInput.placeholder = "add your message";
	msgRow.appendChild(msgInput);

	const msgSendBtn = document.createElement("button");
	msgSendBtn.className = "msg-send";
	msgSendBtn.innerHTML = SEND_SVG;
	msgRow.appendChild(msgSendBtn);

	function sendMessage() {
		const text = msgInput.value.trim();
		if (!text) return;
		const id = crypto.randomUUID();
		send({
			type: "MESSAGE_STAGE",
			id,
			message: text,
			elementKey: state.currentBoundary?.componentName ?? "",
			component: state.currentBoundary ? { name: state.currentBoundary.componentName } : undefined,
		});
		msgInput.value = "";
		msgInput.style.height = "auto";
		positionWithFlip(targetEl, msgRow, "bottom-start");
		showToast("Message staged");
	}

	msgSendBtn.addEventListener("click", (e) => {
		e.stopPropagation();
		sendMessage();
	});

	msgInput.addEventListener("keydown", (e) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			sendMessage();
		}
		if (e.key === "Escape") {
			msgInput.blur();
		}
	});

	msgInput.addEventListener("input", () => {
		msgInput.style.height = "auto";
		msgInput.style.height = msgInput.scrollHeight + "px";
		positionWithFlip(targetEl, msgRow, "bottom-start");
	});

	// Prevent clicks on the message row from triggering page click handlers
	msgRow.addEventListener("click", (e) => e.stopPropagation());

	// Position message row below the element
	positionWithFlip(targetEl, msgRow, "bottom-start");
}

function showGroupPicker(
	anchorBtn: HTMLElement,
	onClose: () => void,
	onCountChange: (totalCount: number) => void,
): void {
	if (state.pickerCloseHandler) {
		document.removeEventListener("click", state.pickerCloseHandler, {
			capture: true,
		});
		state.pickerCloseHandler = null;
	}
	state.pickerEl?.remove();

	// Lazily compute near-groups on first open
	if (!state.cachedNearGroups && state.currentTargetEl) {
		const exactSet = new Set(state.currentEquivalentNodes);
		state.cachedNearGroups = computeNearGroups(state.currentTargetEl, exactSet, state.shadowHost);
	}
	const groups = state.cachedNearGroups ?? [];

	const picker = document.createElement("div");
	picker.className = "el-picker";
	picker.style.left = "0px";
	picker.style.top = "0px";
	state.shadowRoot.appendChild(picker);
	state.pickerEl = picker;

	// Header
	const header = document.createElement("div");
	header.className = "el-picker-header";
	const title = document.createElement("span");
	title.className = "el-picker-title";
	title.textContent = "Selection";
	header.appendChild(title);
	picker.appendChild(header);

	// Exact match summary
	const exactCount = state.currentEquivalentNodes.length;
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

		const checkedGroups = new Set<number>();
		const baseNodes = [...state.currentEquivalentNodes];

		function clearPreviewHighlights() {
			state.shadowRoot
				.querySelectorAll(".highlight-preview")
				.forEach((el) => el.remove());
		}

		function updateSelection() {
			const allNodes = [...baseNodes];
			for (const idx of checkedGroups) {
				for (const el of groups[idx].elements) {
					if (!allNodes.includes(el)) allNodes.push(el);
				}
			}
			state.currentEquivalentNodes = allNodes;
			state.shadowRoot
				.querySelectorAll(".highlight-overlay")
				.forEach((el) => el.remove());
			state.currentEquivalentNodes.forEach((n) => highlightElement(n));
			onCountChange(state.currentEquivalentNodes.length);
			if (state.currentTargetEl && state.currentBoundary) {
				sendTo("panel", {
					type: "ELEMENT_SELECTED",
					componentName: state.currentBoundary.componentName,
					instanceCount: state.currentEquivalentNodes.length,
					classes:
						typeof state.currentTargetEl.className === "string"
							? state.currentTargetEl.className
							: "",
					tailwindConfig: state.tailwindConfigCache,
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
					state.shadowRoot.appendChild(preview);
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
		state.shadowRoot
			.querySelectorAll(".highlight-preview")
			.forEach((el) => el.remove());
		if (state.pickerCloseHandler) {
			document.removeEventListener("click", state.pickerCloseHandler, {
				capture: true,
			});
			state.pickerCloseHandler = null;
		}
		state.pickerEl?.remove();
		state.pickerEl = null;
	};

	setTimeout(() => {
		state.pickerCloseHandler = (e: MouseEvent) => {
			const path = e.composedPath();
			if (!path.includes(picker) && !path.includes(anchorBtn)) {
				removePicker();
				onClose();
			}
		};
		document.addEventListener("click", state.pickerCloseHandler, { capture: true });
	}, 0);
}
