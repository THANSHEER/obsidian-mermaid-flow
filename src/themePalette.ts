/*
 * Maps a diagram's theme config to the default node/edge colours the canvas
 * paints, so the interactive editor visually tracks the rendered Mermaid.
 *
 * Per-node / per-edge explicit styles and classDefs still win — they are applied
 * on top of this in canvas.ts (via resolveNodeStyle / edge.style). This only
 * supplies the *defaults* that a themed Mermaid diagram gets from its theme, the
 * gap that made the canvas look grey while the render was purple.
 *
 * Colours may be CSS `var(--…)` (default, no-theme case — follows the Obsidian
 * theme exactly as Obsidian's own Mermaid render does) or concrete hex (when the
 * diagram explicitly selects a Mermaid theme).
 */

import { DiagramConfig } from "./model";

export interface ThemePalette {
	nodeFill: string;
	nodeStroke: string;
	nodeText: string;
	lineColor: string;
}

/**
 * No explicit theme: follow the Obsidian theme like Obsidian's bundled Mermaid
 * does (so it tracks light/dark), but keep Mermaid's stock purple node border —
 * Obsidian leaves `nodeBorder` untouched, which is the lavender border seen in
 * the render.
 */
const OBSIDIAN_DEFAULT: ThemePalette = {
	nodeFill: "var(--background-primary-alt)",
	nodeStroke: "#9370db",
	nodeText: "var(--text-normal)",
	lineColor: "var(--text-muted)",
};

/** Approximate node colours of the built-in Mermaid themes. */
const BUILTIN: Record<string, ThemePalette> = {
	default: { nodeFill: "#ececff", nodeStroke: "#9370db", nodeText: "#333333", lineColor: "#333333" },
	dark: { nodeFill: "#1f2020", nodeStroke: "#bbbbbb", nodeText: "#cccccc", lineColor: "#cccccc" },
	forest: { nodeFill: "#cde498", nodeStroke: "#13540c", nodeText: "#333333", lineColor: "#13540c" },
	neutral: { nodeFill: "#eeeeee", nodeStroke: "#999999", nodeText: "#333333", lineColor: "#999999" },
};

export function resolveThemePalette(
	config: DiagramConfig | undefined,
): ThemePalette {
	// A `base` theme with explicit themeVariables (e.g. the Ocean/Solarized
	// presets) drives the render's colours directly — mirror them.
	const tv = config?.themeVariables;
	if (tv && (tv.primaryColor || tv.primaryBorderColor || tv.lineColor)) {
		return {
			nodeFill: tv.primaryColor ?? OBSIDIAN_DEFAULT.nodeFill,
			nodeStroke: tv.primaryBorderColor ?? OBSIDIAN_DEFAULT.nodeStroke,
			nodeText: tv.primaryTextColor ?? OBSIDIAN_DEFAULT.nodeText,
			lineColor: tv.lineColor ?? OBSIDIAN_DEFAULT.lineColor,
		};
	}
	const theme = config?.theme;
	if (theme && theme !== "base") {
		const builtin = BUILTIN[theme];
		if (builtin) return builtin;
	}
	return OBSIDIAN_DEFAULT;
}
