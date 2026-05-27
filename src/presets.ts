/*
 * Semantic presets that map draw.io-style choices onto Mermaid concepts:
 *   - THEME_PRESETS  -> Mermaid `theme` / `themeVariables`
 *   - LAYOUT_PRESETS -> diagram direction + spacing
 *   - STYLE_PRESETS  -> node shape + node style (semantic roles)
 */

import { Direction, NodeShape, NodeStyle } from "./model";

export interface ThemePreset {
	id: string;
	label: string;
	/** Mermaid theme name; for custom palettes use "base" + variables. */
	theme: string;
	themeVariables?: Record<string, string>;
}

export const THEME_PRESETS: ThemePreset[] = [
	{ id: "default", label: "Default", theme: "default" },
	{ id: "dark", label: "Dark", theme: "dark" },
	{ id: "forest", label: "Forest", theme: "forest" },
	{ id: "neutral", label: "Neutral", theme: "neutral" },
	{
		id: "ocean",
		label: "Ocean",
		theme: "base",
		themeVariables: {
			primaryColor: "#dff1ff",
			primaryBorderColor: "#1c7ed6",
			primaryTextColor: "#0b3d66",
			lineColor: "#1c7ed6",
			secondaryColor: "#e7f5ff",
			tertiaryColor: "#f1f8ff",
		},
	},
	{
		id: "solarized",
		label: "Solarized",
		theme: "base",
		themeVariables: {
			primaryColor: "#fdf6e3",
			primaryBorderColor: "#b58900",
			primaryTextColor: "#586e75",
			lineColor: "#859900",
			secondaryColor: "#eee8d5",
			tertiaryColor: "#fdf6e3",
		},
	},
];

export interface LayoutPreset {
	id: string;
	label: string;
	direction: Direction;
}

export const LAYOUT_PRESETS: LayoutPreset[] = [
	{ id: "flow-lr", label: "Flow — Left to right", direction: "LR" },
	{ id: "flow-tb", label: "Flow — Top to bottom", direction: "TB" },
	{ id: "tree-v", label: "Tree — Vertical", direction: "TB" },
	{ id: "tree-h", label: "Tree — Horizontal", direction: "LR" },
];

export interface SpacingPreset {
	id: string;
	label: string;
	nodeSpacing: number;
	rankSpacing: number;
}

export const SPACING_PRESETS: SpacingPreset[] = [
	{ id: "compact", label: "Compact", nodeSpacing: 30, rankSpacing: 40 },
	{ id: "normal", label: "Normal", nodeSpacing: 50, rankSpacing: 60 },
	{ id: "spacious", label: "Spacious", nodeSpacing: 80, rankSpacing: 110 },
];

export interface StylePreset {
	id: string;
	label: string;
	shape: NodeShape;
	style: NodeStyle;
}

/** Semantic node roles, draw.io-style, mapped to shape + color. */
export const STYLE_PRESETS: StylePreset[] = [
	{
		id: "start",
		label: "Start",
		shape: "stadium",
		style: { fillColor: "#d3f9d8", strokeColor: "#2f9e44", textColor: "#1b4332" },
	},
	{
		id: "end",
		label: "End",
		shape: "stadium",
		style: { fillColor: "#ffe3e3", strokeColor: "#e03131", textColor: "#5c0011" },
	},
	{
		id: "process",
		label: "Process",
		shape: "rect",
		style: { fillColor: "#e7f5ff", strokeColor: "#1c7ed6", textColor: "#0b3d66" },
	},
	{
		id: "decision",
		label: "Decision",
		shape: "diamond",
		style: { fillColor: "#fff3bf", strokeColor: "#f08c00", textColor: "#663c00" },
	},
	{
		id: "io",
		label: "Data / IO",
		shape: "parallelogram",
		style: { fillColor: "#f3d9fa", strokeColor: "#9c36b5", textColor: "#3b0764" },
	},
];
