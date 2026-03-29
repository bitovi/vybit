// Shared mutable state for the overlay.
// All overlay modules import from here instead of using module-level lets in index.ts.

import type { ContainerName, IContainer } from "./containers/IContainer";
import type { ElementGroup } from "./grouping";

export interface DesignCanvasEntry {
	wrapper: HTMLElement;
	replacedNodes: HTMLElement[] | null;
	parent: HTMLElement | null;
	anchor: ChildNode | null;
}

export const state = {
	shadowRoot: null as unknown as ShadowRoot,
	shadowHost: null as unknown as HTMLElement,
	active: false,
	wasConnected: false,
	tailwindConfigCache: null as any,

	// Current selection
	currentEquivalentNodes: [] as HTMLElement[],
	currentTargetEl: null as HTMLElement | null,
	currentBoundary: null as { componentName: string } | null,
	currentInstances: [] as Array<{ index: number; label: string; parent: string }>,

	// Cached near-groups (computed lazily on first + click)
	cachedNearGroups: null as ElementGroup[] | null,

	// Hover preview
	hoverOutlineEl: null as HTMLElement | null,
	hoverTooltipEl: null as HTMLElement | null,
	lastHoveredEl: null as Element | null,
	lastMoveTime: 0,

	// Mode
	currentMode: 'select' as 'select' | 'insert',
	currentTab: 'design' as string,
	tabPreference: 'design' as 'design' | 'component',
	selectModeOn: false,
	replaceDirection: null as 'element-first' | null,

	// Containers
	containers: null as unknown as Record<ContainerName, IContainer>,
	activeContainer: null as unknown as IContainer,

	// Toolbar elements
	toolbarEl: null as HTMLElement | null,
	msgRowEl: null as HTMLElement | null,
	pickerEl: null as HTMLElement | null,
	pickerCloseHandler: null as ((e: MouseEvent) => void) | null,

	// Design canvas wrappers
	designCanvasWrappers: [] as DesignCanvasEntry[],
};

/** Derive the concrete tab ID from the current mode + tab preference */
export function resolveTab(): string {
	if (state.currentMode === 'insert') return 'place';
	return state.tabPreference === 'component' ? 'replace' : 'design';
}
