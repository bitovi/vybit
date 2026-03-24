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
import type { FillType } from "../GradientEditor/types";
import type { TypeDropdownProps } from "./types";

const OPTIONS: { value: FillType; label: string }[] = [
	{ value: "solid", label: "Solid" },
	{ value: "linear", label: "Linear" },
];

export function TypeDropdown({ fillType, onChange }: TypeDropdownProps) {
	const [open, setOpen] = useState(false);

	const { refs, floatingStyles, context } = useFloating({
		open,
		onOpenChange: setOpen,
		placement: "bottom-start",
		middleware: [offset(4), flip(), shift({ padding: 8 })],
		whileElementsMounted: autoUpdate,
	});

	const dismiss = useDismiss(context);
	const { getReferenceProps, getFloatingProps } = useInteractions([dismiss]);

	const current = OPTIONS.find((o) => o.value === fillType) ?? OPTIONS[0];

	return (
		<>
			<button
				ref={refs.setReference}
				type="button"
				className={`flex items-center gap-1 h-6.5 px-1.5 rounded border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.04)] text-[11px] cursor-pointer transition-colors hover:bg-[rgba(255,255,255,0.08)] ${
					open ? "text-bv-teal" : "text-bv-text-mid"
				}`}
				onClick={() => setOpen((o) => !o)}
				{...getReferenceProps()}
			>
				<span>{current.label}</span>
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
						className="z-50 min-w-20 rounded-md border border-bv-border bg-bv-surface shadow-lg py-0.5"
						{...getFloatingProps()}
					>
						{OPTIONS.map((opt) => (
							<button
								key={opt.value}
								type="button"
								className={`w-full flex items-center px-2.5 py-1 text-[11px] cursor-pointer border-none transition-colors ${
									opt.value === fillType
										? "bg-bv-teal/15 text-bv-teal"
										: "bg-transparent text-bv-text-mid hover:bg-[rgba(255,255,255,0.06)] hover:text-bv-text"
								}`}
								onClick={() => {
									onChange(opt.value);
									setOpen(false);
								}}
							>
								{opt.label}
							</button>
						))}
					</div>
				</FloatingPortal>
			)}
		</>
	);
}
