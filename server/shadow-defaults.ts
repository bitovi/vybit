// Shared utility for extracting default shadow/ring colors from compiled CSS.
// Used by both v3 and v4 adapters to populate TailwindThemeSubset.shadowDefaults.

/**
 * Probe classes used to extract default colors for each shadow layer type.
 * One representative class per type is enough — the default color is the same
 * regardless of size.
 */
export const SHADOW_PROBE_CLASSES = [
	"shadow-md",
	"ring-2",
	"inset-shadow-sm",
	"inset-ring-1",
	"text-shadow-sm",
];

/** Maps each probe class to its layer type key. */
const PROBE_TO_TYPE: Record<string, string> = {
	"shadow-md": "shadow",
	"ring-2": "ring",
	"inset-shadow-sm": "inset-shadow",
	"inset-ring-1": "inset-ring",
	"text-shadow-sm": "text-shadow",
};

/**
 * V4 pattern: `var(--tw-shadow-color, rgb(0 0 0 / 0.1))`
 * The fallback value in `var(--tw-<type>-color, <fallback>)` IS the default color.
 */
const V4_VAR_FALLBACK =
	/var\(--tw-(?:shadow|ring|inset-shadow|inset-ring|text-shadow)-color,\s*([^)]+)\)/;

/**
 * Extract the last rgb/rgba color from a CSS value string.
 * Used for v3 shadow values where color is inline.
 */
function extractLastRgb(value: string): string | null {
	const matches = value.match(/rgba?\([^)]+\)/g);
	return matches ? matches[matches.length - 1] : null;
}

/**
 * Extract default shadow/ring colors from compiled CSS output.
 * Works for both v4 (var fallback pattern) and v3 (literal values) CSS.
 *
 * @param css The compiled CSS string containing rules for SHADOW_PROBE_CLASSES
 * @param ringColorFromBase Optional ring color from v3 base styles (--tw-ring-color).
 *   In v3, ring-2 uses `var(--tw-ring-color)` without an inline fallback, so the
 *   default must be extracted from `@tailwind base` separately.
 * @returns Map of layer type → default CSS color string
 */
export function extractShadowDefaults(
	css: string,
	ringColorFromBase?: string,
): Record<string, string> {
	const defaults: Record<string, string> = {};

	for (const [probeClass, layerType] of Object.entries(PROBE_TO_TYPE)) {
		// Find the rule block for this probe class
		const escaped = probeClass.replace(/-/g, "\\-");
		const ruleRegex = new RegExp(
			`\\.${escaped}\\s*\\{([^}]+)\\}`,
		);
		const ruleMatch = ruleRegex.exec(css);
		if (!ruleMatch) continue;

		const ruleBody = ruleMatch[1];

		// Strategy 1: V4 var(--tw-*-color, <fallback>) pattern
		const varMatch = V4_VAR_FALLBACK.exec(ruleBody);
		if (varMatch) {
			const fallback = varMatch[1].trim();
			// Skip "currentcolor" — it's context-dependent and can't be displayed as a swatch
			if (fallback !== "currentcolor") {
				defaults[layerType] = fallback;
				continue;
			}
		}

		// Strategy 2: V3 literal color in --tw-shadow value
		if (layerType === "shadow" || layerType === "inset-shadow" || layerType === "text-shadow") {
			const shadowMatch = ruleBody.match(
				/--tw-(?:shadow|inset-shadow):\s*([^;]+);/,
			);
			if (shadowMatch) {
				const color = extractLastRgb(shadowMatch[1]);
				if (color) {
					defaults[layerType] = color;
					continue;
				}
			}
			// Also check text-shadow property directly
			const textShadowMatch = ruleBody.match(/text-shadow:\s*([^;]+);/);
			if (textShadowMatch) {
				const color = extractLastRgb(textShadowMatch[1]);
				if (color) {
					defaults[layerType] = color;
					continue;
				}
			}
		}

		// Strategy 3: For ring/inset-ring in v3, use the base --tw-ring-color
		if ((layerType === "ring" || layerType === "inset-ring") && ringColorFromBase) {
			defaults[layerType] = ringColorFromBase;
		}
	}

	return defaults;
}
