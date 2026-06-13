/*
 * Mermaid diagram-type detection.
 *
 * The visual editor only understands flowcharts; every other Mermaid diagram
 * type would otherwise open as a blank canvas (all lines land in
 * `model.extras`) — and saving from there can rewrite the block as a broken
 * flowchart. The entry points (main.ts, editorExtension.ts) use this module to
 * route known non-flowchart blocks to the code view instead.
 */

/** Opening fence of a ```mermaid block. Shared by every entry point. */
export const OPEN_FENCE_RE = /^(\s*)(`{3,}|~{3,})\s*mermaid\s*$/i;

export type DiagramType =
	| "flowchart"
	| "sequence"
	| "class"
	| "state"
	| "er"
	| "gantt"
	| "pie"
	| "journey"
	| "git"
	| "mindmap"
	| "timeline"
	| "quadrant"
	| "requirement"
	| "c4"
	| "sankey"
	| "xychart"
	| "block"
	| "packet"
	| "kanban"
	| "architecture"
	| "zenuml"
	| "unknown";

/**
 * First-word → diagram type. The `(?=\s|$)` lookahead (rather than `\b`)
 * keeps flowchart node lines like `pie[Pie chart]` or `graph[Graph]` in a
 * headerless snippet from being mistaken for other diagram types.
 */
const KEYWORDS: ReadonlyArray<[RegExp, DiagramType]> = [
	[/^(flowchart|graph)(?=\s|$)/i, "flowchart"],
	[/^sequenceDiagram(?=\s|$)/i, "sequence"],
	[/^classDiagram(-v2)?(?=\s|$)/i, "class"],
	[/^stateDiagram(-v2)?(?=\s|$)/i, "state"],
	[/^erDiagram(?=\s|$)/i, "er"],
	[/^gantt(?=\s|$)/i, "gantt"],
	[/^pie(?=\s|$)/i, "pie"],
	[/^journey(?=\s|$)/i, "journey"],
	[/^gitGraph(?=\s|$|:)/i, "git"],
	[/^mindmap(?=\s|$)/i, "mindmap"],
	[/^timeline(?=\s|$)/i, "timeline"],
	[/^quadrantChart(?=\s|$)/i, "quadrant"],
	[/^requirementDiagram(?=\s|$)/i, "requirement"],
	[/^C4(Context|Container|Component|Dynamic|Deployment)(?=\s|$)/, "c4"],
	[/^sankey(-beta)?(?=\s|$)/i, "sankey"],
	[/^xychart(-beta)?(?=\s|$)/i, "xychart"],
	[/^block-beta(?=\s|$)/i, "block"],
	[/^packet(-beta)?(?=\s|$)/i, "packet"],
	[/^kanban(?=\s|$)/i, "kanban"],
	[/^architecture(-beta)?(?=\s|$)/i, "architecture"],
	[/^zenuml(?=\s|$)/i, "zenuml"],
];

const DESCRIPTIONS: Record<DiagramType, string> = {
	flowchart: "flowchart",
	sequence: "sequence diagram",
	class: "class diagram",
	state: "state diagram",
	er: "entity-relationship diagram",
	gantt: "Gantt chart",
	pie: "pie chart",
	journey: "user journey diagram",
	git: "git graph",
	mindmap: "mind map",
	timeline: "timeline",
	quadrant: "quadrant chart",
	requirement: "requirement diagram",
	c4: "C4 diagram",
	sankey: "Sankey diagram",
	xychart: "XY chart",
	block: "block diagram",
	packet: "packet diagram",
	kanban: "kanban board",
	architecture: "architecture diagram",
	zenuml: "ZenUML diagram",
	unknown: "diagram",
};

/**
 * Detect the diagram type from the first meaningful line of a mermaid block
 * (skipping blanks, `%%` comments/directives, and YAML frontmatter).
 */
export function detectDiagramType(source: string): DiagramType {
	const lines = source.split("\n");
	let inFrontmatter = false;
	for (let i = 0; i < lines.length; i++) {
		const line = (lines[i] ?? "").trim();
		if (line === "") continue;
		// Mermaid v10.5+ YAML config frontmatter: --- … --- at the very top.
		if (line === "---") {
			if (i === 0 || inFrontmatter) {
				inFrontmatter = !inFrontmatter;
				continue;
			}
			return "unknown";
		}
		if (inFrontmatter) continue;
		// Comments and %%{init}%% directives carry no type information.
		if (line.startsWith("%%")) continue;
		for (const [re, type] of KEYWORDS) {
			if (re.test(line)) return type;
		}
		return "unknown";
	}
	return "unknown";
}

/**
 * Whether the visual editor can meaningfully open this diagram. "unknown"
 * stays editable: headerless `A --> B` snippets parse fine, and the regex
 * parser preserves anything else in extras.
 */
export function isVisuallyEditable(type: DiagramType): boolean {
	return type === "flowchart" || type === "unknown";
}

/** Human-readable name for notices and empty-state messages. */
export function describeDiagramType(type: DiagramType): string {
	return DESCRIPTIONS[type];
}
