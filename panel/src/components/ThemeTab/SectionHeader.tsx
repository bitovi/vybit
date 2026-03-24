export function SectionHeader({
	title,
	expanded,
	onToggle,
}: {
	title: string;
	expanded: boolean;
	onToggle: () => void;
}) {
	return (
		<button
			type="button"
			className="flex items-center gap-2 w-full px-3 py-2 bg-bv-surface-hi border-none border-b border-bv-border cursor-pointer hover:bg-white/4 transition-colors text-left"
			onClick={onToggle}
		>
			<svg
				width="8"
				height="8"
				viewBox="0 0 8 8"
				fill="currentColor"
				className={`text-bv-muted transition-transform shrink-0 ${expanded ? "rotate-90" : ""}`}
			>
				<title>{expanded ? "Collapse" : "Expand"}</title>
				<path d="M2 0l4 4-4 4z" />
			</svg>
			<span className="text-[11px] text-bv-text font-semibold uppercase tracking-wider">
				{title}
			</span>
		</button>
	);
}
