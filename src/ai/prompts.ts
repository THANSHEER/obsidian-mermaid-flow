/*
 * Prompt construction and response post-processing for AI diagram generation.
 * Pure functions — no Obsidian imports — so everything here is unit-testable.
 */

export const SYSTEM_PROMPT =
	"You are a Mermaid flowchart generator. Respond with ONLY a Mermaid " +
	"flowchart definition - no prose, no explanation, no markdown fences. " +
	"The first line must be 'flowchart TB' (or LR/RL/BT as appropriate). " +
	"Use only flowchart syntax: nodes, edges, labels, subgraphs. " +
	"Keep node ids short (A, B, C...). Do not use click or callback directives.";

export function buildImagePrompt(userHint: string): string {
	const hint = userHint.trim();
	return (
		"Convert the diagram shown in the attached image into an equivalent " +
		"Mermaid flowchart. Reproduce every node, connection, label and " +
		"grouping you can see." + (hint ? `\n\nAdditional instructions: ${hint}` : "")
	);
}

export function buildTextPrompt(description: string): string {
	return `Create a Mermaid flowchart for the following description:\n\n${description.trim()}`;
}

export function buildImprovePrompt(code: string, instruction: string): string {
	const extra = instruction.trim();
	return (
		"Improve the Mermaid flowchart below: fix any syntax problems, make " +
		"labels clearer, and simplify the structure where possible. Preserve " +
		"the diagram's meaning and keep every line starting with %% exactly " +
		"as it is (they store editor metadata)." +
		(extra ? `\n\nAdditional instructions: ${extra}` : "") +
		`\n\n${code.trim()}`
	);
}

const FENCE_OPEN_RE = /^\s*(`{3,}|~{3,})\s*(?:mermaid)?\s*$/i;
const FLOWCHART_START_RE = /^\s*(flowchart|graph)\s/i;

/**
 * Pull the Mermaid flowchart out of a raw model response: prefer fenced-block
 * content, else slice from the first flowchart/graph line; drop trailing
 * fences or commentary after the diagram.
 */
export function extractMermaid(raw: string): string {
	const lines = raw.split("\n");

	// Prefer a fenced block whose body contains a flowchart line.
	const openIdx = lines.findIndex((l) => FENCE_OPEN_RE.test(l));
	if (openIdx >= 0) {
		let closeIdx = lines.length;
		for (let i = openIdx + 1; i < lines.length; i++) {
			const line = lines[i] ?? "";
			if (/^\s*(`{3,}|~{3,})\s*$/.test(line)) { closeIdx = i; break; }
		}
		const body = lines.slice(openIdx + 1, closeIdx);
		if (body.some((l) => FLOWCHART_START_RE.test(l))) {
			return sliceFromFlowchart(body).join("\n").trim();
		}
	}

	return sliceFromFlowchart(lines).join("\n").trim();
}

/** From the first flowchart/graph line to the end, minus trailing fence lines. */
function sliceFromFlowchart(lines: string[]): string[] {
	const start = lines.findIndex((l) => FLOWCHART_START_RE.test(l));
	const sliced = start >= 0 ? lines.slice(start) : lines;
	// Cut at a trailing fence (model wrapped the diagram and kept talking).
	const fence = sliced.findIndex(
		(l, i) => i > 0 && /^\s*(`{3,}|~{3,})/.test(l),
	);
	return fence > 0 ? sliced.slice(0, fence) : sliced;
}
