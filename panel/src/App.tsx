import { lazy, Suspense, useEffect, useState } from "react";
import { parseTokens, TAILWIND_PARSERS } from '../../overlay/src/grammar';
import type { ParsedToken } from '../../overlay/src/grammar';
import { ContainerSwitcher } from "./components/ContainerSwitcher";
import { MessageTab } from "./components/MessageTab";
import { PatchPopover } from "./components/PatchPopover";
import type { Tab } from "./components/TabBar";
import { TabBar } from "./components/TabBar";
import { usePatchManager } from "./hooks/usePatchManager";
import { Picker } from "./Picker";
import {
	connect,
	isConnected,
	onConnect,
	onDisconnect,
	onMessage,
	sendTo,
} from "./ws";

const DesignMode = lazy(() =>
	import("./DesignMode").then((m) => ({ default: m.DesignMode })),
);

// URL param routing: ?mode=design renders the drawing canvas instead of the Picker
const urlParams = new URLSearchParams(window.location.search);
const appMode = urlParams.get("mode");

const TABS: Tab[] = [
	{ id: "design", label: "Design" },
	{ id: "message", label: "Message" },
];

interface ElementData {
	componentName: string;
	instanceCount: number;
	classes: string;
	parsedClasses: ParsedToken[];
	tailwindConfig: any;
}

export function App() {
	// If URL has ?mode=design, render the design canvas (used inside the overlay iframe)
	if (appMode === "design") {
		return (
			<Suspense fallback={null}>
				<DesignMode />
			</Suspense>
		);
	}

	return <InspectorApp />;
}

function InspectorApp() {
	const [wsConnected, setWsConnected] = useState(false);
	const [elementData, setElementData] = useState<ElementData | null>(null);
	const [selectionId, setSelectionId] = useState(0);
	const [activeTab, setActiveTab] = useState("design");
	const [selectModeActive, setSelectModeActive] = useState(false);
	const patchManager = usePatchManager();

	useEffect(() => {
		const offConnect = onConnect(() => {
			setWsConnected(true);
			// Sync stored container preference to the overlay on every (re)connect,
			// since the overlay and panel run on different origins (different localStorage).
			try {
				const stored = localStorage.getItem("tw-panel-container");
				if (stored && stored !== "popover") {
					sendTo("overlay", { type: "SWITCH_CONTAINER", container: stored });
				}
			} catch {
				/* ignore */
			}
		});
		const offDisconnect = onDisconnect(() => setWsConnected(false));

		const offMessage = onMessage((msg) => {
			if (msg.type === "ELEMENT_SELECTED") {
				setElementData({
					componentName: msg.componentName,
					instanceCount: msg.instanceCount,
					classes: msg.classes,
					parsedClasses: parseTokens(msg.classes, TAILWIND_PARSERS),
					tailwindConfig: msg.tailwindConfig,
				});
				setSelectionId((prev) => prev + 1);
				setSelectModeActive(false);
			} else if (msg.type === "SELECT_MODE_CHANGED") {
				setSelectModeActive(!!msg.active);
			} else if (msg.type === "QUEUE_UPDATE") {
				patchManager.handleQueueUpdate({
					draftCount: msg.draftCount,
					committedCount: msg.committedCount,
					implementingCount: msg.implementingCount,
					implementedCount: msg.implementedCount,
					partialCount: msg.partialCount,
					errorCount: msg.errorCount,
					draft: msg.draft,
					commits: msg.commits,
					agentWaiting: msg.agentWaiting,
				});
			} else if (msg.type === "PATCH_UPDATE") {
				// Legacy backward compat
				patchManager.handlePatchUpdate({
					staged: msg.staged,
					committed: msg.committed,
					implementing: msg.implementing,
					implemented: msg.implemented,
					patches: msg.patches,
				});
			}
		});

		connect();
		setWsConnected(isConnected());
		return () => {
			offConnect();
			offDisconnect();
			offMessage();
		};
	}, []);

	const { draft, committed, implementing, implemented, partial, error } =
		patchManager.counts;
	const showNoAgentWarning =
		committed > 0 && !patchManager.agentWaiting && implementing === 0;

	// Merge server draft + local patches for display.
	// Server draft is the source of truth for IDs; local patches carry richer detail.
	// Any server-only draft (e.g. from a second overlay) is also shown.
	const localById = new Map(
		patchManager.patches
			.filter((p) => p.status === "staged")
			.map((p) => [
				p.id,
				{
					id: p.id,
					kind: p.kind ?? ("class-change" as const),
					elementKey: p.elementKey,
					status: p.status,
					originalClass: p.originalClass,
					newClass: p.newClass,
					property: p.property,
					timestamp: p.timestamp,
					component: p.component,
					message: p.message,
					image: p.image,
				},
			]),
	);
	const serverIds = new Set(patchManager.queueState.draft.map((p) => p.id));
	const draftPatches = [
		// All server drafts (use local version if available for richer data)
		...patchManager.queueState.draft.map((p) => localById.get(p.id) ?? p),
		// Any local patches not yet acknowledged by the server
		...patchManager.patches
			.filter((p) => p.status === "staged" && !serverIds.has(p.id))
			.map((p) => localById.get(p.id)!),
	];

	const committedCommits = patchManager.queueState.commits.filter(
		(c) => c.status === "committed",
	);
	const implementingCommits = patchManager.queueState.commits.filter(
		(c) => c.status === "implementing",
	);
	const implementedCommits = patchManager.queueState.commits.filter(
		(c) => c.status === "implemented",
	);

	const VYBIT_PROMPT =
		"Please implement the next change and continue implementing changes with VyBit.";

	async function copyToClipboard(text: string) {
		if (navigator.clipboard) {
			try {
				const permission = await navigator.permissions.query({
					name: "clipboard-write" as PermissionName,
				});
				if (permission.state === "denied") {
					execCommandCopy(text);
					return;
				}
			} catch {
				// permissions API not supported — proceed anyway
			}
			navigator.clipboard.writeText(text).catch(() => execCommandCopy(text));
		} else {
			execCommandCopy(text);
		}
	}

	function execCommandCopy(text: string) {
		const el = document.createElement("textarea");
		el.value = text;
		el.style.position = "fixed";
		el.style.opacity = "0";
		document.body.appendChild(el);
		el.select();
		document.execCommand("copy");
		document.body.removeChild(el);
	}

	const queueFooter = (
		<div className="shrink-0">
			{showNoAgentWarning && (
				<div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-950/40 border-t border-amber-800/40 text-amber-300 text-[10px] font-medium">
					<svg
						width="12"
						height="12"
						viewBox="0 0 20 20"
						fill="currentColor"
						className="shrink-0 text-amber-400"
					>
						<path
							fillRule="evenodd"
							d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.19-1.458-1.516-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
							clipRule="evenodd"
						/>
					</svg>
					<span className="flex-1 leading-tight">
						No agent watching —{" "}
						<a
							href="https://github.com/bitovi/vybit?tab=readme-ov-file#telling-your-agent-to-start-making-features"
							target="_blank"
							rel="noreferrer"
							className="underline hover:text-amber-100"
						>
							ask your agent
						</a>{" "}
						to start
					</span>
					<button
						onClick={() => copyToClipboard(VYBIT_PROMPT)}
						className="shrink-0 px-1.5 py-0.5 rounded border border-amber-700/50 bg-amber-900/40 hover:bg-amber-800/40 text-amber-300 font-semibold text-[9px] transition-colors"
						title={`Copy: "${VYBIT_PROMPT}"`}
					>
						Copy prompt
					</button>
				</div>
			)}
			<div className="flex items-center justify-center px-3 py-1.5 border-t border-bv-border gap-3 text-[9px]">
				<PatchPopover
					label="draft"
					count={draft}
					items={draftPatches}
					activeColor="text-bv-text"
					dotColor="bg-amber-400"
					onDiscard={(id: string) => patchManager.discard(id)}
					onCommitAll={() => patchManager.commitAll()}
					onDiscardAll={() => patchManager.discardAll()}
				/>
				<PatchPopover
					label="committed"
					count={committed}
					items={committedCommits.flatMap((c) => c.patches)}
					activeColor="text-bv-orange"
					dotColor="bg-emerald-400"
				/>
				<PatchPopover
					label="implementing"
					count={implementing}
					items={implementingCommits.flatMap((c) => c.patches)}
					activeColor="text-bv-orange"
					dotColor="bg-blue-400"
				/>
				<PatchPopover
					label="implemented"
					count={implemented}
					items={implementedCommits.flatMap((c) => c.patches)}
					activeColor="text-bv-teal"
					dotColor="bg-green-400"
				/>
			</div>
		</div>
	);

	if (!wsConnected) {
		return (
			<div className="h-full flex flex-col">
				<div className="flex flex-1 flex-col items-center justify-center gap-2 p-6">
					<div className="w-2 h-2 rounded-full bg-bv-orange animate-pulse" />
					<span className="text-bv-text-mid text-[12px]">
						Waiting for connection…
					</span>
				</div>
				{queueFooter}
			</div>
		);
	}

	if (!elementData) {
		return (
			<div className="h-full flex flex-col">
				<div className="px-3 pt-3 pb-2 border-b border-bv-border">
					<div className="flex items-center justify-between gap-2">
						<SelectElementButton
							active={selectModeActive}
							onToggle={() => {
								const next = !selectModeActive;
								setSelectModeActive(next);
								sendTo("overlay", { type: "TOGGLE_SELECT_MODE", active: next });
							}}
						/>
						<div className="flex-1 min-w-0">
							{selectModeActive ? (
								<span className="text-[11px] text-bv-teal font-medium">
									● Selecting… click an element on the page
								</span>
							) : (
								<span className="text-[12px] text-bv-muted">
									No element selected
								</span>
							)}
						</div>
						<ContainerSwitcher />
					</div>
				</div>
				<TabBar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />
				<div className="flex-1 overflow-auto">
					{activeTab === "message" ? (
						<MessageTab
							draft={draftPatches}
							currentElementKey=""
							onAddMessage={(message, elementKey) =>
								patchManager.stageMessage(message, elementKey)
							}
							onDiscard={(id) => patchManager.discard(id)}
						/>
					) : selectModeActive ? (
						<div className="flex flex-1 flex-col items-center justify-center gap-2 p-8">
							<div className="w-10 h-10 rounded-full bg-bv-teal text-white flex items-center justify-center">
								<svg
									width="20"
									height="20"
									viewBox="0 0 16 16"
									fill="currentColor"
								>
									<path d="M14,0H2C.895,0,0,.895,0,2V14c0,1.105,.895,2,2,2H6c.552,0,1-.448,1-1h0c0-.552-.448-1-1-1H2V2H14V6c0,.552,.448,1,1,1h0c.552,0,1-.448,1-1V2c0-1.105-.895-2-2-2Z" />
									<path d="M12.043,10.629l2.578-.644c.268-.068,.43-.339,.362-.607-.043-.172-.175-.308-.345-.358l-7-2c-.175-.051-.363-.002-.492,.126-.128,.129-.177,.317-.126,.492l2,7c.061,.214,.257,.362,.48,.362h.009c.226-.004,.421-.16,.476-.379l.644-2.578,3.664,3.664c.397,.384,1.03,.373,1.414-.025,.374-.388,.374-1.002,0-1.389l-3.664-3.664Z" />
								</svg>
							</div>
							<span className="text-[12px] text-bv-teal font-medium">
								Selection mode active
							</span>
							<span className="text-[12px] text-bv-muted text-center leading-relaxed">
								Hover over elements on the page to preview, then click to
								select.
								<br />
								Press{" "}
								<span className="inline-flex items-center px-1.5 py-0.5 rounded bg-white/6 border border-white/8 font-mono text-[10px] text-bv-text-mid leading-none">Esc</span>{" "}
								to cancel.
							</span>
						</div>
					) : (
						<div className="flex flex-1 flex-col justify-center p-4">
							<button
								onClick={() => {
									setSelectModeActive(true);
									sendTo("overlay", {
										type: "TOGGLE_SELECT_MODE",
										active: true,
									});
								}}
								className="w-full flex flex-col items-center gap-3 px-6 py-5 rounded-lg border border-bv-border bg-bv-surface hover:border-bv-teal hover:bg-bv-teal/5 transition-all cursor-pointer"
							>
								<div className="w-14 h-14 rounded-full bg-bv-teal/10 text-bv-teal flex items-center justify-center">
									<svg
										width="28"
										height="28"
										viewBox="0 0 64 64"
										fill="currentColor"
									>
										<path d="M2,9C1.447,9,1,8.552,1,8V2c0-0.552,0.447-1,1-1h6c0.553,0,1,0.448,1,1S8.553,3,8,3H3v5C3,8.552,2.553,9,2,9z" />
										<path d="M8,48H2c-0.553,0-1-0.448-1-1v-6c0-0.552,0.447-1,1-1s1,0.448,1,1v5h5c0.553,0,1,0.448,1,1S8.553,48,8,48z" />
										<path d="M47,9c-0.553,0-1-0.448-1-1V3h-5c-0.553,0-1-0.448-1-1s0.447-1,1-1h6c0.553,0,1,0.448,1,1v6C48,8.552,47.553,9,47,9z" />
										<path d="M21,3h-6c-0.553,0-1-0.448-1-1s0.447-1,1-1h6c0.553,0,1,0.448,1,1S21.553,3,21,3z" />
										<path d="M2,22c-0.553,0-1-0.448-1-1v-6c0-0.552,0.447-1,1-1s1,0.448,1,1v6C3,21.552,2.553,22,2,22z" />
										<path d="M2,35c-0.553,0-1-0.448-1-1v-6c0-0.552,0.447-1,1-1s1,0.448,1,1v6C3,34.552,2.553,35,2,35z" />
										<path d="M47,22c-0.553,0-1-0.448-1-1v-6c0-0.552,0.447-1,1-1s1,0.448,1,1v6C48,21.552,47.553,22,47,22z" />
										<path d="M47,31c-0.553,0-1-0.448-1-1v-2c0-0.552,0.447-1,1-1s1,0.448,1,1v2C48,30.552,47.553,31,47,31z" />
										<path d="M34,3h-6c-0.553,0-1-0.448-1-1s0.447-1,1-1h6c0.553,0,1,0.448,1,1S34.553,3,34,3z" />
										<path d="M21,48h-6c-0.553,0-1-0.448-1-1s0.447-1,1-1h6c0.553,0,1,0.448,1,1S21.553,48,21,48z" />
										<path d="M30,48h-2c-0.553,0-1-0.448-1-1s0.447-1,1-1h2c0.553,0,1,0.448,1,1S30.553,48,30,48z" />
										<path d="M62.707,57.293L51.688,46.274l10.759-5.379c0.368-0.184,0.586-0.575,0.549-0.985c-0.037-0.41-0.322-0.755-0.717-0.87l-31-9c-0.355-0.1-0.729-0.005-0.986,0.253c-0.258,0.258-0.355,0.636-0.253,0.986l9,31c0.114,0.396,0.46,0.68,0.869,0.717C39.94,62.999,39.971,63,40,63c0.376,0,0.724-0.212,0.895-0.553l5.38-10.759l11.019,11.019c0.391,0.391,1.023,0.391,1.414,0l4-4C63.098,58.316,63.098,57.684,62.707,57.293z" />
									</svg>
								</div>
								<span className="text-[12px] text-bv-text font-medium">
									Select an element to inspect
								</span>
								<span className="inline-flex items-center gap-1">
									<span className="w-5 h-5 rounded flex items-center justify-center bg-white/6 border border-white/8 font-mono text-[10px] font-semibold text-bv-text-mid leading-none">⌘</span>
									<span className="w-5 h-5 rounded flex items-center justify-center bg-white/6 border border-white/8 font-mono text-[10px] font-semibold text-bv-text-mid leading-none">⇧</span>
									<span className="w-5 h-5 rounded flex items-center justify-center bg-white/6 border border-white/8 font-mono text-[10px] font-semibold text-bv-text-mid leading-none">C</span>
								</span>
							</button>
						</div>
					)}
				</div>
				{queueFooter}
			</div>
		);
	}

	const parsedClasses = elementData.parsedClasses;

	return (
		<div className="h-full flex flex-col">
			<div className="px-3 pt-3 pb-2 border-b border-bv-border">
				<div className="flex items-center justify-between gap-2">
					<div className="flex items-center gap-2 min-w-0">
						<SelectElementButton
							active={selectModeActive}
							onToggle={() => {
								const next = !selectModeActive;
								setSelectModeActive(next);
								sendTo("overlay", { type: "TOGGLE_SELECT_MODE", active: next });
							}}
						/>
						<div className="font-[family-name:var(--font-display)] font-bold text-[13px] text-bv-text leading-tight truncate">
							{elementData.componentName}{" "}
							<span className="font-[family-name:var(--font-ui)] font-normal text-bv-text-mid">
								— {elementData.instanceCount} instance
								{elementData.instanceCount !== 1 ? "s" : ""}
							</span>
						</div>
					</div>
					<ContainerSwitcher />
				</div>
			</div>
			<TabBar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />
			<div className="flex-1 overflow-auto">
				{activeTab === "design" && (
					<Picker
						key={selectionId}
						componentName={elementData.componentName}
						instanceCount={elementData.instanceCount}
						parsedClasses={parsedClasses}
						tailwindConfig={elementData.tailwindConfig}
						patchManager={patchManager}
					/>
				)}
				{activeTab === "message" && (
					<MessageTab
						draft={draftPatches}
						currentElementKey={elementData.componentName}
						onAddMessage={(message, elementKey) =>
							patchManager.stageMessage(
								message,
								elementKey,
								elementData.componentName,
							)
						}
						onDiscard={(id) => patchManager.discard(id)}
					/>
				)}
			</div>
			{queueFooter}
		</div>
	);
}

function SelectElementButton({
	active,
	onToggle,
}: {
	active: boolean;
	onToggle: () => void;
}) {
	return (
		<button
			onClick={onToggle}
			title={`${active ? "Stop selecting" : "Select an element"} (⌘⇧C)`}
			className={`w-7 h-7 rounded flex items-center justify-center shrink-0 border transition-all
        ${
					active
						? "bg-bv-teal border-bv-teal text-white"
						: "bg-transparent border-bv-border text-bv-text-mid hover:border-bv-teal hover:text-bv-teal hover:bg-bv-teal/10"
				}`}
		>
			{/* Select element icon */}
			<svg
				width="14"
				height="14"
				viewBox="0 0 16 16"
				fill="currentColor"
			>
				<path d="M14,0H2C.895,0,0,.895,0,2V14c0,1.105,.895,2,2,2H6c.552,0,1-.448,1-1h0c0-.552-.448-1-1-1H2V2H14V6c0,.552,.448,1,1,1h0c.552,0,1-.448,1-1V2c0-1.105-.895-2-2-2Z" />
				<path d="M12.043,10.629l2.578-.644c.268-.068,.43-.339,.362-.607-.043-.172-.175-.308-.345-.358l-7-2c-.175-.051-.363-.002-.492,.126-.128,.129-.177,.317-.126,.492l2,7c.061,.214,.257,.362,.48,.362h.009c.226-.004,.421-.16,.476-.379l.644-2.578,3.664,3.664c.397,.384,1.03,.373,1.414-.025,.374-.388,.374-1.002,0-1.389l-3.664-3.664Z" />
			</svg>
		</button>
	);
}
