interface TypoEdit {
	key: string;
	original: string;
	current: string;
}

const FONT_SIZE_KEYS = [
	"xs",
	"sm",
	"base",
	"lg",
	"xl",
	"2xl",
	"3xl",
	"4xl",
	"5xl",
	"6xl",
	"7xl",
	"8xl",
	"9xl",
] as const;

const FONT_WEIGHT_KEYS = [
	"thin",
	"extralight",
	"light",
	"normal",
	"medium",
	"semibold",
	"bold",
	"extrabold",
	"black",
] as const;

const WEIGHT_NUMERIC: Record<string, string> = {
	thin: "100",
	extralight: "200",
	light: "300",
	normal: "400",
	medium: "500",
	semibold: "600",
	bold: "700",
	extrabold: "800",
	black: "900",
};

const FONT_SIZE_DEFAULTS: Record<string, string> = {
	xs: "0.75rem",
	sm: "0.875rem",
	base: "1rem",
	lg: "1.125rem",
	xl: "1.25rem",
	"2xl": "1.5rem",
	"3xl": "1.875rem",
	"4xl": "2.25rem",
	"5xl": "3rem",
	"6xl": "3.75rem",
	"7xl": "4.5rem",
	"8xl": "6rem",
	"9xl": "8rem",
};

/** Extract the size string from a fontSize entry (handles v3 tuple vs v4 string) */
function resolveFontSize(entry: unknown): string {
	if (Array.isArray(entry)) return String(entry[0]);
	if (typeof entry === "string") return FONT_SIZE_DEFAULTS[entry] ?? entry;
	return "1rem";
}

/** Extract line-height from a fontSize entry (v3 only) */
function resolveFontLineHeight(entry: unknown): string | null {
	if (Array.isArray(entry) && entry[1] && typeof entry[1] === "object") {
		return (entry[1] as Record<string, string>).lineHeight ?? null;
	}
	return null;
}

/** Resolve fontWeight value */
function resolveFontWeight(entry: unknown, key: string): string {
	if (typeof entry === "string" && /^\d+$/.test(entry)) return entry;
	return WEIGHT_NUMERIC[key] ?? "400";
}

export type { TypoEdit };

export function TypographySection({
	fontSize,
	fontWeight,
	typoEdits,
	onChange,
}: {
	fontSize: Record<string, unknown>;
	fontWeight: Record<string, unknown>;
	typoEdits: Map<string, TypoEdit>;
	onChange: (key: string, original: string, newValue: string) => void;
}) {
	return (
		<div className="pb-2">
			{/* Font Sizes */}
			<div className="px-3 py-1.5">
				<span className="text-[10px] text-bv-text-mid font-medium uppercase tracking-wider">
					Font Size
				</span>
			</div>
			{FONT_SIZE_KEYS.map((key) => {
				const entry = fontSize[key];
				if (entry === undefined) return null;
				const size = resolveFontSize(entry);
				const lineHeight = resolveFontLineHeight(entry);
				const editKey = `fontSize.${key}`;
				const isEdited = typoEdits.has(editKey);
				const currentValue = isEdited
					? (typoEdits.get(editKey)?.current ?? size)
					: size;

				return (
					<FontSizeRow
						key={key}
						name={key}
						value={currentValue}
						lineHeight={lineHeight}
						isEdited={isEdited}
						onChange={(newVal) => onChange(editKey, size, newVal)}
					/>
				);
			})}

			{/* Font Weights */}
			<div className="px-3 py-1.5 mt-2">
				<span className="text-[10px] text-bv-text-mid font-medium uppercase tracking-wider">
					Font Weight
				</span>
			</div>
			{FONT_WEIGHT_KEYS.map((key) => {
				const entry = fontWeight[key];
				if (entry === undefined) return null;
				const weight = resolveFontWeight(entry, key);
				const editKey = `fontWeight.${key}`;
				const isEdited = typoEdits.has(editKey);
				const currentValue = isEdited
					? (typoEdits.get(editKey)?.current ?? weight)
					: weight;

				return (
					<FontWeightRow
						key={key}
						name={key}
						value={currentValue}
						isEdited={isEdited}
						onChange={(newVal) => onChange(editKey, weight, newVal)}
					/>
				);
			})}
		</div>
	);
}

/** A single font-size row with preview text, name, and editable value */
function FontSizeRow({
	name,
	value,
	lineHeight,
	isEdited,
	onChange,
}: {
	name: string;
	value: string;
	lineHeight: string | null;
	isEdited: boolean;
	onChange: (newValue: string) => void;
}) {
	return (
		<div
			className={`flex items-center gap-2 px-3 py-1 hover:bg-white/4 transition-colors ${
				isEdited ? "bg-bv-orange/5" : ""
			}`}
		>
			{/* Preview text */}
			<span
				className="w-8 text-bv-text shrink-0 leading-tight truncate"
				style={{ fontSize: value, lineHeight: lineHeight ?? undefined }}
			>
				Aa
			</span>

			{/* Token name */}
			<span className="text-[11px] text-bv-text flex-1 min-w-0 truncate">
				text-{name}
			</span>

			{/* Editable value */}
			<input
				type="text"
				className={`w-18 px-1.5 py-0.5 text-[10px] font-mono rounded border bg-transparent text-bv-text-mid transition-colors focus:outline-none focus:border-bv-teal focus:text-bv-text ${
					isEdited ? "border-bv-orange text-bv-text" : "border-bv-border"
				}`}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				onBlur={(e) => {
					const v = e.target.value.trim();
					if (v) onChange(v);
				}}
			/>

			{/* Line height hint */}
			{lineHeight && (
				<span className="text-[9px] text-bv-muted font-mono shrink-0">
					/{lineHeight}
				</span>
			)}

			{isEdited && (
				<div className="w-1.5 h-1.5 rounded-full bg-bv-orange shrink-0" />
			)}
		</div>
	);
}

/** A single font-weight row with preview text, name, and editable numeric value */
function FontWeightRow({
	name,
	value,
	isEdited,
	onChange,
}: {
	name: string;
	value: string;
	isEdited: boolean;
	onChange: (newValue: string) => void;
}) {
	return (
		<div
			className={`flex items-center gap-2 px-3 py-1 hover:bg-white/4 transition-colors ${
				isEdited ? "bg-bv-orange/5" : ""
			}`}
		>
			{/* Preview text */}
			<span
				className="w-8 text-[13px] text-bv-text shrink-0 leading-tight truncate"
				style={{ fontWeight: Number(value) || 400 }}
			>
				Aa
			</span>

			{/* Token name */}
			<span className="text-[11px] text-bv-text flex-1 min-w-0 truncate">
				font-{name}
			</span>

			{/* Editable numeric value */}
			<input
				type="text"
				className={`w-12 px-1.5 py-0.5 text-[10px] font-mono rounded border bg-transparent text-bv-text-mid transition-colors focus:outline-none focus:border-bv-teal focus:text-bv-text ${
					isEdited ? "border-bv-orange text-bv-text" : "border-bv-border"
				}`}
				value={value}
				onChange={(e) => {
					const v = e.target.value;
					if (/^\d{0,4}$/.test(v)) onChange(v);
				}}
				onBlur={(e) => {
					const v = e.target.value.trim();
					if (/^\d{1,4}$/.test(v)) onChange(v);
				}}
			/>

			{isEdited && (
				<div className="w-1.5 h-1.5 rounded-full bg-bv-orange shrink-0" />
			)}
		</div>
	);
}
