import { useEffect, useRef, useState } from "react";
import type { Patch, PatchSummary } from "../../../../shared/types";

type PatchItem = Patch | PatchSummary;

function describeComponentDrop(item: PatchItem): string {
	const droppedName = item.component?.name ?? "component";
	const dropped = `<${droppedName}>`;
	const insertMode = "insertMode" in item ? item.insertMode : undefined;
	// Priority: ghost chain target > React parent component > CSS selector fallback
	const componentTargetName =
		("targetComponentName" in item && item.targetComponentName) ||
		("parentComponent" in item && item.parentComponent?.name) ||
		null;
	const rawTargetName = componentTargetName || (item.elementKey || null);
	// Wrap component names with <>, but not CSS selector fallbacks
	const wrappedTargetName = componentTargetName ? `<${rawTargetName}>` : rawTargetName;
	// Prefix with "new " when the target itself is a pending (ghost) drop
	const isNewTarget = "targetPatchId" in item && !!item.targetPatchId;
	const targetName = wrappedTargetName && isNewTarget ? `new ${wrappedTargetName}` : wrappedTargetName;

	switch (insertMode) {
		case "after":
			return targetName ? `Appended ${dropped} after ${targetName}` : `Appended ${dropped}`;
		case "before":
			return targetName ? `Prepended ${dropped} before ${targetName}` : `Prepended ${dropped}`;
		case "last-child":
			return targetName ? `Inserted ${dropped} bottom of ${targetName}` : `Inserted ${dropped}`;
		case "first-child":
			return targetName ? `Inserted ${dropped} top of ${targetName}` : `Inserted ${dropped}`;
		default:
			return targetName ? `Inserted ${dropped} in ${targetName}` : `Inserted ${dropped}`;
	}
}

/** Strip HTML tags and collapse whitespace, then truncate. */
function stripHtml(html: string, maxLen: number): string {
	const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
	return text.length > maxLen ? text.slice(0, maxLen) + "…" : text;
}

interface PatchPopoverProps {
	label: string;
	count: number;
	items: PatchItem[];
	activeColor: string;
	/** Tailwind bg class for the status dot indicator */
	dotColor?: string;
	/** Action buttons per item (e.g. commit, discard) */
	onCommit?: (id: string) => void;
	onDiscard?: (id: string) => void;
	/** Bulk actions shown at the bottom */
	onCommitAll?: () => void;
	onDiscardAll?: () => void;
}

export function PatchPopover({
	label,
	count,
	items,
	activeColor,
	dotColor,
	onCommit,
	onDiscard,
	onCommitAll,
	onDiscardAll,
}: PatchPopoverProps) {
	const [open, setOpen] = useState(false);
	const wrapperRef = useRef<HTMLDivElement>(null);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const [popoverLeft, setPopoverLeft] = useState<number | undefined>(undefined);

	// Compute clamped horizontal position when popover opens
	useEffect(() => {
		if (!open || !buttonRef.current) return;
		const btn = buttonRef.current;
		const btnRect = btn.getBoundingClientRect();
		const popoverWidth = 220;
		const viewportWidth = window.innerWidth;
		const pad = 4;

		// Ideal: center the popover over the button
		let idealLeft = btnRect.left + btnRect.width / 2 - popoverWidth / 2;
		// Clamp within the iframe viewport
		idealLeft = Math.max(
			pad,
			Math.min(idealLeft, viewportWidth - popoverWidth - pad),
		);
		// Convert to offset relative to the wrapper (which wraps the button)
		setPopoverLeft(idealLeft - btnRect.left);
	}, [open]);

	// Close on outside click
	useEffect(() => {
		if (!open) return;
		function handleClick(e: MouseEvent) {
			if (
				wrapperRef.current &&
				!wrapperRef.current.contains(e.target as Node)
			) {
				setOpen(false);
			}
		}
		document.addEventListener("mousedown", handleClick);
		return () => document.removeEventListener("mousedown", handleClick);
	}, [open]);

	// Close on Escape
	useEffect(() => {
		if (!open) return;
		function handleKey(e: KeyboardEvent) {
			if (e.key === "Escape") setOpen(false);
		}
		document.addEventListener("keydown", handleKey);
		return () => document.removeEventListener("keydown", handleKey);
	}, [open]);

	const isActive = count > 0;
	const hasActions = onCommit || onDiscard || onCommitAll || onDiscardAll;

	return (
		<div ref={wrapperRef} className="relative">
			<button
				ref={buttonRef}
				className={`flex items-center gap-1 text-[11px] tabular-nums border-none bg-transparent cursor-pointer px-0 py-0 ${
					isActive ? `${activeColor} font-medium` : "text-bv-muted"
				} ${isActive ? "hover:underline" : ""}`}
				onClick={() => isActive && setOpen(!open)}
				disabled={!isActive}
				type="button"
			>
				{dotColor && (
					<span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
				)}
				{count} {label}
			</button>

			{open && (
				<div
					className="absolute bottom-full mb-1 min-w-[220px] bg-bv-surface border border-bv-border rounded-lg shadow-lg overflow-hidden flex flex-col z-[9999]"
					style={
						popoverLeft !== undefined ? { left: `${popoverLeft}px` } : undefined
					}
				>
					{/* Header */}
					<div className="px-3 py-1.5 border-b border-bv-border text-[11px] font-semibold text-bv-text-mid uppercase tracking-wide">
						{label} ({count})
					</div>

					{/* Patch list */}
					<div className="flex-1 overflow-auto">
						{items.length === 0 ? (
							<div className="px-3 py-2 text-[11px] text-bv-muted italic">
								No patches
							</div>
						) : (
							items.map((item) => {
								const isMessage = "kind" in item && item.kind === "message";
								const isDesign = "kind" in item && item.kind === "design";
								const isComponentDrop = "kind" in item && item.kind === "component-drop";
								const isTextChange = "kind" in item && item.kind === "text-change";
								return (
									<div
										key={item.id}
										className="flex items-center gap-1.5 px-3 py-1.5 border-b border-bv-border last:border-b-0 group"
									>
										<div className="flex-1 min-w-0">
											{!isMessage && !isDesign && !isComponentDrop && !isTextChange && item.component?.name && (
												<div className="text-[10px] text-bv-muted truncate">
													{item.component.name}
												</div>
											)}
											{isComponentDrop ? (
												<div className="text-[11px] text-bv-text truncate">
												{describeComponentDrop(item)}
												</div>
											) : isDesign ? (
												<div className="text-[11px] text-bv-text">
													<div className="flex items-center gap-1.5 mb-1">
														<span>✏️</span>
														<span className="truncate">
															Drawing
															{item.component?.name
																? ` in ${item.component.name}`
																: ""}
														</span>
													</div>
													{"image" in item && item.image && (
														<img
															src={item.image as string}
															alt="Design drawing"
															className="max-w-full max-h-16 object-contain rounded border border-bv-border bg-white"
														/>
													)}
												</div>
											) : isMessage ? (
												<div className="text-[11px] text-bv-text truncate">
													<span className="mr-1">💬</span>"
													{("message" in item && item.message) || ""}"
												</div>
											) : isTextChange ? (
												<div className="text-[11px] text-bv-text">
													<div className="flex items-center gap-1.5">
														<span>✏️</span>
														<span className="truncate">
															Text edit
															{item.component?.name
																? ` in ${item.component.name}`
																: ""}
														</span>
													</div>
													{"originalHtml" in item && item.originalHtml && "newHtml" in item && item.newHtml && (
														<div className="mt-0.5 text-[10px] font-mono text-bv-muted break-words">
															<span className="line-through">{stripHtml(item.originalHtml as string, 30)}</span>
															{" → "}
															<span className="text-bv-teal">{stripHtml(item.newHtml as string, 30)}</span>
														</div>
													)}
												</div>
											) : (
												<div className="text-[11px] font-mono text-bv-text truncate">
													{item.originalClass ? (
														<>
															<span className="line-through text-bv-muted">
																{item.originalClass}
															</span>
															{" → "}
															<span className="text-bv-teal">
																{item.newClass}
															</span>
														</>
													) : (
														<span className="text-bv-teal">
															+{item.newClass}
														</span>
													)}
												</div>
											)}
										</div>

										{/* Per-item actions (only for staged) */}
										{(onCommit || onDiscard) && (
											<div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
												{onCommit && (
													<button
														className="text-[10px] px-1.5 py-0.5 rounded border-none cursor-pointer bg-bv-teal text-white hover:bg-bv-teal-dark transition-colors"
														onClick={(e) => {
															e.stopPropagation();
															onCommit(item.id);
														}}
														title="Commit to Agent"
														type="button"
													>
														✓
													</button>
												)}
												{onDiscard && (
													<button
														className="text-[10px] px-1.5 py-0.5 rounded border-none cursor-pointer bg-transparent text-bv-muted hover:text-bv-orange hover:bg-bv-surface-hi transition-colors"
														onClick={(e) => {
															e.stopPropagation();
															onDiscard(item.id);
														}}
														title="Discard"
														type="button"
													>
														✕
													</button>
												)}
											</div>
										)}
									</div>
								);
							})
						)}
					</div>

					{/* Bulk actions footer */}
					{hasActions && items.length > 0 && (onCommitAll || onDiscardAll) && (
						<div className="flex gap-2 px-3 py-1.5 border-t border-bv-border">
							{onCommitAll && (
								<button
									className="text-[10px] px-2 py-1 rounded border-none cursor-pointer font-semibold bg-bv-teal text-white hover:bg-bv-teal-dark transition-colors"
									onClick={() => {
										onCommitAll();
										setOpen(false);
									}}
									type="button"
								>
									Commit All
								</button>
							)}
							{onDiscardAll && (
								<button
									className="text-[10px] px-2 py-1 rounded cursor-pointer font-semibold bg-transparent border border-bv-border text-bv-text-mid hover:text-bv-orange hover:border-bv-orange transition-colors"
									onClick={() => {
										onDiscardAll();
										setOpen(false);
									}}
									type="button"
								>
									Discard All
								</button>
							)}
						</div>
					)}
				</div>
			)}
		</div>
	);
}
