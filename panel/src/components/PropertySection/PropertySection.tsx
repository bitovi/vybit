import { useState, useRef, useEffect } from "react";
import { FocusTrapContainer } from "../FocusTrapContainer";
import type { PropertySectionProps } from "./types";

export function PropertySection({
	label,
	availableProperties = [],
	onAddProperty,
	isEmpty = false,
	children,
}: PropertySectionProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
	const [collapsed, setCollapsed] = useState(isEmpty);
	const dropdownContainerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!dropdownOpen) return;
		function handleMouseDown(e: MouseEvent) {
			if (dropdownContainerRef.current && !dropdownContainerRef.current.contains(e.target as Node)) {
				setDropdownOpen(false);
			}
		}
		document.addEventListener('mousedown', handleMouseDown);
		return () => document.removeEventListener('mousedown', handleMouseDown);
	}, [dropdownOpen]);

	function handleSelect(prefix: string) {
		onAddProperty?.(prefix);
		setDropdownOpen(false);
	}

	return (
		<div className="px-4 py-3">
			{/* Section header — clickable to toggle collapse */}
			<div
				className="group/sec flex items-center gap-1.5 cursor-pointer select-none"
				onClick={() => setCollapsed((c) => !c)}
			>
				<svg
					className={`w-3 h-3 text-bv-muted transition-transform ${collapsed ? "" : "rotate-90"}`}
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
				</svg>
				<span className="text-[10px] font-semibold text-bv-text">{label}</span>
				{availableProperties.length > 0 && (
					<div ref={dropdownContainerRef} className="relative ml-auto">
						<button
							type="button"
							aria-label={`Add ${label} property`}
							className={`w-5 h-5 flex items-center justify-center rounded transition-all cursor-pointer border-none ${
								dropdownOpen
									? "text-bv-text bg-bv-surface-hi"
									: "text-bv-muted bg-transparent opacity-75 group-hover/sec:opacity-100 hover:text-bv-text hover:bg-bv-surface-hi"
							}`}
							onClick={(e) => { e.stopPropagation(); setDropdownOpen((o) => !o); }}
						>
							<svg
								className="w-3.5 h-3.5"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth="1.5"
									d="M12 5v14m-7-7h14"
								/>
							</svg>
						</button>
						{dropdownOpen && (
							<FocusTrapContainer
								className="absolute z-50 top-[calc(100%+2px)] right-0 bg-bv-bg border border-bv-border rounded-md shadow-[0_4px_16px_rgba(0,0,0,0.10)] min-w-[180px] max-w-[calc(100vw-16px)] py-1"
								onClose={() => setDropdownOpen(false)}
							>
								{availableProperties.map((prop) => (
									<button
										type="button"
										key={prop.prefix}
										className="w-full px-2.5 py-[5px] text-[11px] font-[family-name:var(--font-ui)] text-bv-text-mid flex items-center gap-1.5 transition-colors hover:bg-bv-teal/10 hover:text-bv-teal cursor-pointer border-none bg-transparent text-left whitespace-nowrap"
										onClick={() => handleSelect(prop.prefix)}
									>
										{prop.name}
										<span className="font-mono text-[10px] text-bv-muted group-hover:text-bv-teal/60">
											{prop.prefixHint}
										</span>
									</button>
								))}
							</FocusTrapContainer>
						)}
					</div>
				)}
			</div>

			{/* Collapsible content area */}
			<div
				className={`overflow-hidden transition-[max-height,opacity] duration-200 ease-in-out ${
					collapsed ? "max-h-0 opacity-0" : "max-h-[600px] opacity-100"
				}`}
			>
				{isEmpty ? (
					<div className="text-[10px] text-bv-muted italic mt-2">
						No {label.toLowerCase()} classes — click + to add
					</div>
				) : (
					<div className="flex flex-wrap gap-1 mt-2.5">{children}</div>
				)}
			</div>
		</div>
	);
}
