import {
	autoUpdate,
	FloatingPortal,
	flip,
	offset,
	shift,
	useFloating,
} from "@floating-ui/react";
import { useEffect, useRef, useState } from "react";
import { FocusTrapContainer } from "../FocusTrapContainer";
import type { ScaleScrubberProps } from "./types";

/** Pixels of horizontal drag required before scrub mode activates */
const SCRUB_THRESHOLD = 4;
/** Pixels per one step when scrubbing */
const PX_PER_STEP = 10;

export function ScaleScrubber({
	values,
	currentValue,
	lockedValue,
	locked,
	ghost,
	onStart,
	onHover,
	onLeave,
	onClick,
	onRemove,
	onRemoveHover,
}: ScaleScrubberProps) {
	const [open, setOpen] = useState(false);
	const [scrubIndex, setScrubIndex] = useState<number | null>(null);
	const dragRef = useRef<{
		startX: number;
		startIndex: number;
		didScrub: boolean;
	} | null>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const activeItemRef = useRef<HTMLDivElement>(null);

	const { refs, floatingStyles } = useFloating({
		open,
		strategy: "fixed",
		placement: "bottom-start",
		middleware: [offset(2), flip(), shift({ padding: 4 })],
		whileElementsMounted: autoUpdate,
	});

	// Only treat lockedValue as "ours" if it actually appears in this scrubber's values
	const isThisLocked = lockedValue !== null && values.includes(lockedValue);

	const displayValue =
		scrubIndex !== null
			? values[scrubIndex]
			: isThisLocked
				? lockedValue!
				: currentValue;

	// Scroll active item into view when dropdown opens
	useEffect(() => {
		if (open && activeItemRef.current) {
			activeItemRef.current.scrollIntoView?.({ block: "nearest" });
		}
	}, [open]);

	// A foreign lock (another property staged) fully disables this scrubber.
	// Our own lock (isThisLocked) keeps it interactive so the value can be revised.
	const foreignLocked = locked && !isThisLocked;

	function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
		if (foreignLocked) return;
		onStart?.();
		const activeValue = isThisLocked ? lockedValue! : currentValue;
		const currentIndex = values.indexOf(activeValue);
		dragRef.current = {
			startX: e.clientX,
			startIndex: currentIndex >= 0 ? currentIndex : 0,
			didScrub: false,
		};
		e.currentTarget.setPointerCapture(e.pointerId);
		e.preventDefault();
	}

	function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
		const drag = dragRef.current;
		if (!drag) return;
		const dx = e.clientX - drag.startX;
		if (!drag.didScrub && Math.abs(dx) > SCRUB_THRESHOLD) {
			drag.didScrub = true;
			setOpen(false);
		}
		if (drag.didScrub) {
			const steps = Math.round(dx / PX_PER_STEP);
			const idx = Math.max(
				0,
				Math.min(values.length - 1, drag.startIndex + steps),
			);
			setScrubIndex(idx);
			onHover(values[idx]);
		}
	}

	function handlePointerUp() {
		const drag = dragRef.current;
		if (!drag) return;
		if (drag.didScrub && scrubIndex !== null) {
			onClick(values[scrubIndex]);
		} else if (!drag.didScrub) {
			setOpen((prev) => {
				if (prev) onLeave();
				return !prev;
			});
		}
		setScrubIndex(null);
		dragRef.current = null;
	}

	const isScrubbing = scrubIndex !== null;

	const chipStyle = isScrubbing
		? "bg-bv-teal/9 text-bv-teal border border-bv-teal"
		: isThisLocked
			? "bg-bv-surface-hi text-bv-text border border-bv-border hover:bg-bv-teal/9 hover:text-bv-teal hover:border-bv-teal"
			: open
				? "bg-bv-surface-hi text-bv-text border border-bv-border"
				: foreignLocked
					? "bg-bv-surface text-bv-text-mid border border-transparent"
					: ghost
						? "border border-dashed border-bv-border text-bv-muted bg-transparent hover:border-bv-teal hover:text-bv-teal"
						: "bg-[rgba(255,255,255,0.04)] text-bv-text-mid border border-[rgba(255,255,255,0.10)] hover:border-bv-teal hover:text-bv-teal hover:bg-bv-teal/10";

	return (
		<div ref={containerRef} className="relative w-full">
			<div
				ref={refs.setReference}
				className={`group relative select-none px-1.5 py-0.5 rounded text-[11px] font-mono transition-colors w-full text-center ${foreignLocked ? "cursor-default" : "cursor-ew-resize"} ${chipStyle}`}
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={handlePointerUp}
			>
				{!foreignLocked && (
					<span
						className={`absolute left-0.5 top-1/2 -translate-y-1/2 text-[9px] transition-opacity pointer-events-none ${isScrubbing ? "opacity-100" : "opacity-0 group-hover:opacity-50"}`}
					>
						‹
					</span>
				)}
				{displayValue}
				{!foreignLocked && (
					<span
						className={`absolute right-0.5 top-1/2 -translate-y-1/2 text-[9px] transition-opacity pointer-events-none ${isScrubbing ? "opacity-100" : "opacity-0 group-hover:opacity-50"}`}
					>
						›
					</span>
				)}
			</div>

			{open && (
				<FloatingPortal>
					<FocusTrapContainer
						ref={refs.setFloating}
						style={floatingStyles}
						className="z-50 max-h-52 overflow-y-auto bg-bv-bg border border-bv-border rounded shadow-lg shadow-black/30 min-w-20"
						onPointerDown={(e) => e.stopPropagation()}
						onMouseLeave={onLeave}
						onClose={() => {
							setOpen(false);
							onLeave();
						}}
					>
						{onRemove && (
							<div
								className={`flex items-center gap-1.5 px-2.5 py-0.75 text-[11px] font-mono cursor-pointer border-b border-bv-border text-bv-muted hover:text-red-400 ${
									currentValue === "" || lockedValue === ""
										? "text-bv-orange"
										: ""
								}`}
								onMouseEnter={onRemoveHover}
								onClick={(e) => {
									e.stopPropagation();
									onRemove();
									setOpen(false);
								}}
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="12"
									height="12"
									viewBox="0 0 12 12"
									fill="none"
									stroke="currentColor"
									strokeLinecap="round"
									strokeLinejoin="round"
									className="shrink-0 opacity-70"
								>
									<circle cx="6" cy="6" r="5.5" />
									<line x1="4" y1="4" x2="8" y2="8" />
									<line x1="8" y1="4" x2="4" y2="8" />
								</svg>
								remove
							</div>
						)}
						{values.map((val) => {
							const isActive = val === (lockedValue ?? currentValue);
							const itemStyle = isActive
								? "bg-bv-teal/9 text-bv-teal"
								: "text-bv-text-mid hover:bg-bv-surface hover:text-bv-text";
							return (
								<div
									key={val}
									ref={isActive ? activeItemRef : undefined}
									className={`px-2.5 py-0.75 text-[11px] font-mono cursor-pointer ${itemStyle}`}
									onMouseEnter={() => onHover(val)}
									onClick={(e) => {
										e.stopPropagation();
										onClick(val);
										setOpen(false);
									}}
								>
									{val}
								</div>
							);
						})}
					</FocusTrapContainer>
				</FloatingPortal>
			)}
		</div>
	);
}
