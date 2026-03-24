import { useCallback, useRef, useState } from "react";
import type {
	CommitSummary,
	Patch,
	PatchStatus,
	PatchSummary,
} from "../../../shared/types";
import { send, sendTo } from "../ws";

export interface PatchCounts {
	/** Number of patches in the draft (local staged count) */
	draft: number;
	/** Number of commits with status 'committed' */
	committed: number;
	/** Number of commits with status 'implementing' */
	implementing: number;
	/** Number of commits with status 'implemented' */
	implemented: number;
	/** Number of commits with status 'partial' */
	partial: number;
	/** Number of commits with status 'error' */
	error: number;
}

export interface QueueState {
	draft: PatchSummary[];
	commits: CommitSummary[];
}

export interface PatchManager {
	/** All local draft patches (staged only — committed patches live on the server) */
	patches: Patch[];
	/** Counts across all statuses */
	counts: PatchCounts;
	/** Full queue state from server */
	queueState: QueueState;
	/** True when at least one agent is long-polling implement_next_change */
	agentWaiting: boolean;
	/** Live-preview a class swap in the overlay */
	preview: (oldClass: string, newClass: string) => void;
	/** Live-preview multiple class swaps atomically in the overlay */
	previewBatch: (pairs: Array<{ oldClass: string; newClass: string }>) => void;
	/** Revert any active preview in the overlay */
	revertPreview: () => void;
	/** Stage a class-change — upserts by (elementKey, property). Removes if newClass === originalClass. */
	stage: (
		elementKey: string,
		property: string,
		originalClass: string,
		newClass: string,
	) => void;
	/** Stage a message patch */
	stageMessage: (
		message: string,
		elementKey: string,
		componentName?: string,
	) => void;
	/** Stage a text-change patch */
	stageTextChange: (
		originalText: string,
		newText: string,
		componentName: string,
	) => void;
	/** Commit all staged patches to the server */
	commitAll: () => void;
	/** Discard a single staged patch by id */
	discard: (id: string) => void;
	/** Discard all staged patches */
	discardAll: () => void;
	/** Reset local UI state (on element change) — does NOT clear patches */
	reset: () => void;
	/** Handle a QUEUE_UPDATE message from the server */
	handleQueueUpdate: (data: {
		draftCount: number;
		committedCount: number;
		implementingCount: number;
		implementedCount: number;
		partialCount: number;
		errorCount: number;
		draft: PatchSummary[];
		commits: CommitSummary[];
		agentWaiting?: boolean;
	}) => void;
	/** @deprecated Handle a legacy PATCH_UPDATE message */
	handlePatchUpdate: (data: {
		staged: number;
		committed: number;
		implementing: number;
		implemented: number;
		patches: {
			staged: PatchSummary[];
			committed: PatchSummary[];
			implementing: PatchSummary[];
			implemented: PatchSummary[];
		};
	}) => void;
}

export function usePatchManager(): PatchManager {
	const [patches, setPatches] = useState<Patch[]>([]);
	const [serverCounts, setServerCounts] = useState<PatchCounts>({
		draft: 0,
		committed: 0,
		implementing: 0,
		implemented: 0,
		partial: 0,
		error: 0,
	});
	const [queueState, setQueueState] = useState<QueueState>({
		draft: [],
		commits: [],
	});
	const [agentWaiting, setAgentWaiting] = useState(false);
	const patchesRef = useRef(patches);
	patchesRef.current = patches;
	const queueStateRef = useRef(queueState);
	queueStateRef.current = queueState;

	const preview = useCallback((oldClass: string, newClass: string) => {
		sendTo("overlay", { type: "PATCH_PREVIEW", oldClass, newClass });
	}, []);

	const previewBatch = useCallback(
		(pairs: Array<{ oldClass: string; newClass: string }>) => {
			sendTo("overlay", { type: "PATCH_PREVIEW_BATCH", pairs });
		},
		[],
	);

	const revertPreview = useCallback(() => {
		sendTo("overlay", { type: "PATCH_REVERT" });
	}, []);

	const stage = useCallback(
		(
			elementKey: string,
			property: string,
			originalClass: string,
			newClass: string,
		) => {
			// Self-removal: if reverting to original, remove the patch
			if (newClass === originalClass) {
				// Find the existing staged patch so we know what's currently in the DOM
				setPatches((prev) => {
					const existing = prev.find(
						(p) =>
							p.kind === "class-change" &&
							p.elementKey === elementKey &&
							p.property === property,
					);
					if (
						existing &&
						existing.kind === "class-change" &&
						existing.newClass !== originalClass
					) {
						// The overlay has committed existing.newClass into the DOM baseline.
						// We need to explicitly reverse it and commit, without staging to the server.
						sendTo("overlay", {
							type: "PATCH_REVERT_STAGED",
							oldClass: existing.newClass,
							newClass: originalClass,
						});
					} else {
						sendTo("overlay", { type: "PATCH_REVERT" });
					}
					return prev.filter(
						(p) =>
							!(
								p.kind === "class-change" &&
								p.elementKey === elementKey &&
								p.property === property
							),
					);
				});
				return;
			}

			const id = crypto.randomUUID();

			setPatches((prev) => {
				// Dedup: remove existing class-change patch for same element+property
				const filtered = prev.filter(
					(p) =>
						!(
							p.kind === "class-change" &&
							p.elementKey === elementKey &&
							p.property === property
						),
				);
				const patch: Patch = {
					id,
					kind: "class-change",
					elementKey,
					status: "staged",
					originalClass,
					newClass,
					property,
					timestamp: new Date().toISOString(),
				};
				return [...filtered, patch];
			});

			// Tell the overlay to stage (it will fill in context and send PATCH_STAGED to server)
			sendTo("overlay", {
				type: "PATCH_STAGE",
				id,
				oldClass: originalClass,
				newClass,
				property,
			});
		},
		[],
	);

	const stageMessage = useCallback(
		(message: string, elementKey: string, componentName?: string) => {
			const id = crypto.randomUUID();
			const component = componentName ? { name: componentName } : undefined;

			setPatches((prev) => {
				const patch: Patch = {
					id,
					kind: "message",
					elementKey,
					status: "staged",
					originalClass: "",
					newClass: "",
					property: "",
					timestamp: new Date().toISOString(),
					message,
					component,
				};
				return [...prev, patch];
			});

			// Send message patch directly to server (no overlay context needed)
			send(
				component
					? { type: "MESSAGE_STAGE", id, message, elementKey, component }
					: { type: "MESSAGE_STAGE", id, message, elementKey },
			);
		},
		[],
	);

	const stageTextChange = useCallback(
		(originalText: string, newText: string, componentName: string) => {
			const id = crypto.randomUUID();

			setPatches((prev) => {
				const patch: Patch = {
					id,
					kind: "text-change",
					elementKey: componentName,
					status: "staged",
					originalClass: "",
					newClass: "",
					property: "",
					timestamp: new Date().toISOString(),
					originalText,
					newText,
					component: { name: componentName },
				};
				return [...prev, patch];
			});

			// Send text-change patch to overlay (it will fill in context and send PATCH_STAGED to server)
			sendTo("overlay", {
				type: "TEXT_CHANGE_STAGE",
				id,
				originalText,
				newText,
				componentName,
			});
		},
		[],
	);

	const commitAll = useCallback(() => {
		// Use server draft as authoritative source — it includes designs and messages
		// staged directly by the overlay, which are not in local React state.
		const serverDraftIds = queueStateRef.current.draft.map((p) => p.id);
		// Also include any local patches not yet acknowledged by the server
		const localIds = patchesRef.current
			.filter((p) => p.status === "staged")
			.map((p) => p.id);
		const allIds = Array.from(new Set([...serverDraftIds, ...localIds]));
		if (allIds.length === 0) return;

		send({ type: "PATCH_COMMIT", ids: allIds });
		setPatches([]);
	}, []);

	const discard = useCallback((id: string) => {
		setPatches((prev) => prev.filter((p) => p.id !== id));
		send({ type: "DISCARD_DRAFTS", ids: [id] });
		sendTo("overlay", { type: "PATCH_REVERT" });
	}, []);

	const discardAll = useCallback(() => {
		const serverIds = queueStateRef.current.draft.map((p) => p.id);
		const localIds = patchesRef.current
			.filter((p) => p.status === "staged")
			.map((p) => p.id);
		const allIds = Array.from(new Set([...serverIds, ...localIds]));
		setPatches([]);
		if (allIds.length > 0) {
			send({ type: "DISCARD_DRAFTS", ids: allIds });
		}
		sendTo("overlay", { type: "PATCH_REVERT" });
	}, []);

	const reset = useCallback(() => {
		// Only reset local UI state — patches persist across element switches
	}, []);

	const handleQueueUpdate = useCallback(
		(data: {
			draftCount: number;
			committedCount: number;
			implementingCount: number;
			implementedCount: number;
			partialCount: number;
			errorCount: number;
			draft: PatchSummary[];
			commits: CommitSummary[];
		}) => {
			setServerCounts({
				draft: data.draftCount,
				committed: data.committedCount,
				implementing: data.implementingCount,
				implemented: data.implementedCount,
				partial: data.partialCount,
				error: data.errorCount,
			});
			setQueueState({ draft: data.draft, commits: data.commits });
			setAgentWaiting(!!data.agentWaiting);
		},
		[],
	);

	// Legacy handler for backward compatibility
	const handlePatchUpdate = useCallback(
		(data: {
			staged: number;
			committed: number;
			implementing: number;
			implemented: number;
			patches: {
				staged: PatchSummary[];
				committed: PatchSummary[];
				implementing: PatchSummary[];
				implemented: PatchSummary[];
			};
		}) => {
			setServerCounts({
				draft: data.staged,
				committed: data.committed,
				implementing: data.implementing,
				implemented: data.implemented,
				partial: 0,
				error: 0,
			});
		},
		[],
	);

	const stagedCount = patches.filter((p) => p.status === "staged").length;

	const counts: PatchCounts = {
		draft: Math.max(stagedCount, serverCounts.draft),
		committed: serverCounts.committed,
		implementing: serverCounts.implementing,
		implemented: serverCounts.implemented,
		partial: serverCounts.partial,
		error: serverCounts.error,
	};

	return {
		patches,
		counts,
		queueState,
		agentWaiting,
		preview,
		previewBatch,
		revertPreview,
		stage,
		stageMessage,
		stageTextChange,
		commitAll,
		discard,
		discardAll,
		reset,
		handleQueueUpdate,
		handlePatchUpdate,
	};
}
