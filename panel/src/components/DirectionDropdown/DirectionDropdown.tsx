import {
	autoUpdate,
	FloatingPortal,
	flip,
	offset,
	shift,
	useDismiss,
	useFloating,
	useInteractions,
} from "@floating-ui/react";
import { useState } from "react";
import { DIR_LABELS, DIRECTION_ORDER } from "../GradientEditor/types";
import type { DirectionDropdownProps } from "./types";

export function DirectionDropdown({
	direction,
	onHover,
	onLeave,
	onClick,
}: DirectionDropdownProps) {
	const [open, setOpen] = useState(false);

	const { refs, floatingStyles, context } = useFloating({
		open,
		onOpenChange: (newOpen) => {
			if (!newOpen) onLeave();
			setOpen(newOpen);
		},
		placement: "bottom-start",
		middleware: [offset(4), flip(), shift({ padding: 8 })],
		whileElementsMounted: autoUpdate,
	});

	const dismiss = useDismiss(context);
	const { getReferenceProps, getFloatingProps } = useInteractions([dismiss]);

	const current = DIR_LABELS[direction];

	return (
		<>
			<button
				ref={refs.setReference}
				type="button"
				className={`flex items-center gap-1 h-6.5 px-1.5 rounded border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.04)] text-[11px] font-mono cursor-pointer transition-colors hover:bg-[rgba(255,255,255,0.08)] ${
					open ? "text-bv-teal" : "text-bv-text-mid"
				}`}
				onClick={() => setOpen((o) => !o)}
				{...getReferenceProps()}
			>
				<span className="text-xs">{current.arrow}</span>
				<span className="truncate max-w-20">{current.label}</span>
				<svg
					className="w-2.5 h-2.5 shrink-0 opacity-50"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
					aria-hidden="true"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth="2"
						d="M19 9l-7 7-7-7"
					/>
				</svg>
			</button>

			{open && (
				<FloatingPortal>
					<div
						ref={refs.setFloating}
						style={floatingStyles}
						className="z-50 min-w-35 rounded-md border border-bv-border bg-bv-surface shadow-lg py-0.5"
						{...getFloatingProps()}
					>
						{DIRECTION_ORDER.map((dir) => {
							const info = DIR_LABELS[dir];
							const isActive = dir === direction;
							return (
								<button
									key={dir}
									type="button"
									className={`w-full flex items-center gap-2 px-2.5 py-1 text-[11px] font-mono cursor-pointer border-none transition-colors ${
										isActive
											? "bg-bv-teal/15 text-bv-teal"
											: "bg-transparent text-bv-text-mid hover:bg-[rgba(255,255,255,0.06)] hover:text-bv-text"
									}`}
									onMouseEnter={() => onHover(dir)}
									onMouseLeave={onLeave}
									onClick={() => {
										onClick(dir);
										setOpen(false);
									}}
								>
									<span className="w-4 text-center text-xs">{info.arrow}</span>
									<span>{info.label}</span>
								</button>
							);
						})}
					</div>
				</FloatingPortal>
			)}
		</>
	);
}
