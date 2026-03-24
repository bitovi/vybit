import { useCallback, useEffect, useRef, useState } from "react";
import {
	HUE_ORDER,
	SHADE_ORDER,
} from "../../../../overlay/src/tailwind/scales";
import type { TailwindThemeSubset } from "../../../../server/tailwind-adapter";
import { sendTo } from "../../ws";
import { type ColorEdit, CustomColorGroups, HueGroup } from "./ColorSection";
import { SectionHeader } from "./SectionHeader";
import { type TypoEdit, TypographySection } from "./TypographySection";

interface ThemeTabProps {
	tailwindConfig: TailwindThemeSubset | null;
	onStageThemeChange: (description: string) => void;
}

function getColorValue(
	colors: Record<string, unknown>,
	hue: string,
	shade: string,
): string {
	if (shade === "") {
		const val = colors[hue];
		return typeof val === "string" ? val : "#000000";
	}
	const hueObj = colors[hue];
	if (hueObj && typeof hueObj === "object") {
		return (hueObj as Record<string, string>)[shade] ?? "#000000";
	}
	return "#000000";
}

export function ThemeTab({
	tailwindConfig,
	onStageThemeChange,
}: ThemeTabProps) {
	const [edits, setEdits] = useState<Map<string, ColorEdit>>(new Map());
	const [typoEdits, setTypoEdits] = useState<Map<string, TypoEdit>>(new Map());
	const [expandedHues, setExpandedHues] = useState<Set<string>>(new Set());
	const [expandedSections, setExpandedSections] = useState<Set<string>>(
		() => new Set(["colors"]),
	);
	const pickerRefs = useRef<Map<string, HTMLInputElement>>(new Map());

	const colors = tailwindConfig?.colors ?? {};
	const version = tailwindConfig?.tailwindVersion;

	// Send live preview to overlay when edits change
	useEffect(() => {
		if (edits.size === 0 && typoEdits.size === 0) return;
		const overrides: Array<{ variable: string; value: string }> = [];
		for (const [key, edit] of edits) {
			overrides.push({
				variable: `--color-${key.replace(".", "-")}`,
				value: edit.current,
			});
		}
		for (const [key, edit] of typoEdits) {
			if (key.startsWith("fontSize.")) {
				const token = key.slice("fontSize.".length);
				overrides.push({ variable: `--text-${token}`, value: edit.current });
			} else if (key.startsWith("fontWeight.")) {
				const token = key.slice("fontWeight.".length);
				overrides.push({
					variable: `--font-weight-${token}`,
					value: edit.current,
				});
			}
		}
		sendTo("overlay", { type: "THEME_PREVIEW", overrides });
	}, [edits, typoEdits]);

	// Revert all previews on unmount
	useEffect(() => {
		return () => {
			sendTo("overlay", { type: "THEME_PREVIEW", overrides: [] });
		};
	}, []);

	const handleColorChange = useCallback(
		(hue: string, shade: string, newValue: string) => {
			const key = `${hue}.${shade}`;
			setEdits((prev) => {
				const next = new Map(prev);
				const existing = next.get(key);
				const original =
					existing?.original ?? getColorValue(colors, hue, shade);
				if (newValue === original) {
					next.delete(key);
				} else {
					next.set(key, { hue, shade, original, current: newValue });
				}
				return next;
			});
		},
		[colors],
	);

	const toggleHue = useCallback((hue: string) => {
		setExpandedHues((prev) => {
			const next = new Set(prev);
			if (next.has(hue)) next.delete(hue);
			else next.add(hue);
			return next;
		});
	}, []);

	const handleTypoChange = useCallback(
		(key: string, original: string, newValue: string) => {
			setTypoEdits((prev) => {
				const next = new Map(prev);
				if (newValue === original) {
					next.delete(key);
				} else {
					next.set(key, { key, original, current: newValue });
				}
				return next;
			});
		},
		[],
	);

	const toggleSection = useCallback((section: string) => {
		setExpandedSections((prev) => {
			const next = new Set(prev);
			if (next.has(section)) next.delete(section);
			else next.add(section);
			return next;
		});
	}, []);

	const totalEdits = edits.size + typoEdits.size;

	const handleStageAll = useCallback(() => {
		if (totalEdits === 0) return;
		const lines: string[] = [];
		const configFile =
			version === 4 ? "the CSS @theme block" : "tailwind.config.js";

		if (edits.size > 0) {
			lines.push(
				`Update the following Tailwind v${version ?? 4} theme colors in ${configFile}:`,
			);
			lines.push("");
			for (const [, edit] of edits) {
				lines.push(
					`- ${edit.hue}-${edit.shade}: ${edit.original} → ${edit.current}`,
				);
			}
		}

		if (typoEdits.size > 0) {
			if (lines.length > 0) lines.push("");
			lines.push(
				`Update the following Tailwind v${version ?? 4} typography tokens in ${configFile}:`,
			);
			lines.push("");
			for (const [, edit] of typoEdits) {
				lines.push(`- ${edit.key}: ${edit.original} → ${edit.current}`);
			}
		}

		onStageThemeChange(lines.join("\n"));
		setEdits(new Map());
		setTypoEdits(new Map());
	}, [totalEdits, edits, typoEdits, version, onStageThemeChange]);

	const handleRevertAll = useCallback(() => {
		setEdits(new Map());
		setTypoEdits(new Map());
	}, []);

	if (!tailwindConfig) {
		return (
			<div className="flex flex-col items-center justify-center p-8 text-bv-muted text-[12px]">
				<span>No theme data available.</span>
				<span className="mt-1 text-[10px]">
					Select an element first to load the theme config.
				</span>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full">
			{/* Header */}
			<div className="flex items-center justify-between px-3 py-2 border-b border-bv-border">
				<div className="flex items-center gap-2">
					<span className="text-[11px] font-medium text-bv-text">Theme</span>
					{version && (
						<span
							className={`px-1.5 py-0.5 rounded text-[9px] font-bold leading-none ${
								version === 4
									? "bg-sky-500/20 text-sky-400"
									: "bg-emerald-500/20 text-emerald-400"
							}`}
						>
							v{version}
						</span>
					)}
				</div>
				{totalEdits > 0 && (
					<div className="flex items-center gap-1.5">
						<span className="text-[10px] text-bv-orange font-medium">
							{totalEdits} change{totalEdits > 1 ? "s" : ""}
						</span>
						<button
							type="button"
							onClick={handleRevertAll}
							className="px-1.5 py-0.5 text-[10px] rounded border bg-transparent cursor-pointer border-bv-border text-bv-text-mid hover:text-bv-text hover:border-bv-text-mid transition-colors"
						>
							Revert
						</button>
						<button
							type="button"
							onClick={handleStageAll}
							className="px-1.5 py-0.5 text-[10px] rounded border bg-bv-teal cursor-pointer border-bv-teal text-white hover:brightness-110 transition-all"
						>
							Stage
						</button>
					</div>
				)}
			</div>

			{/* Scrollable content */}
			<div className="flex-1 overflow-auto">
				{/* ── Colors Section ── */}
				<SectionHeader
					title="Colors"
					expanded={expandedSections.has("colors")}
					onToggle={() => toggleSection("colors")}
				/>
				{expandedSections.has("colors") && (
					<div>
						{HUE_ORDER.map((hue) => {
					const hueColors = colors[hue];
					if (!hueColors || typeof hueColors !== "object") return null;
					const expanded = expandedHues.has(hue);
					const hueEdits = SHADE_ORDER.filter((s) =>
						edits.has(`${hue}.${s}`),
					).length;

					return (
						<HueGroup
							key={hue}
							hue={hue}
							hueColors={hueColors as Record<string, string>}
							edits={edits}
							expanded={expanded}
							editCount={hueEdits}
							onToggle={() => toggleHue(hue)}
							onColorChange={handleColorChange}
							pickerRefs={pickerRefs}
						/>
					);
				})}

						{/* Custom color groups */}
						<CustomColorGroups
							colors={colors}
							edits={edits}
							expandedHues={expandedHues}
							onToggle={toggleHue}
							onColorChange={handleColorChange}
							pickerRefs={pickerRefs}
						/>
					</div>
				)}

				{/* ── Typography Section ── */}
				<SectionHeader
					title="Typography"
					expanded={expandedSections.has("typography")}
					onToggle={() => toggleSection("typography")}
				/>
				{expandedSections.has("typography") && (
					<TypographySection
						fontSize={tailwindConfig.fontSize}
						fontWeight={tailwindConfig.fontWeight}
						typoEdits={typoEdits}
						onChange={handleTypoChange}
					/>
				)}
			</div>
		</div>
	);
}
