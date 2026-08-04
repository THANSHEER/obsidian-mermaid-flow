/*
 * Click-to-navigate for rendered Mermaid flowcharts.
 *
 * Obsidian renders the diagram SVG itself; this plugin only overlays buttons.
 * To make node links work we attach our OWN click handlers to the rendered node
 * groups after Mermaid finishes — we never rely on Mermaid's native `click`
 * binding (Obsidian's securityLevel may strip it, and it can't resolve `[[wiki]]`
 * links anyway). The `click` line we serialise is only for storage / portability.
 */

import { App } from "obsidian";
import { DiagramModel } from "./model";
import { mermaidToModel } from "./parser";

export interface NodeLink {
	id: string;
	label: string;
	target: string;
}

/** Linked (id, label, target) triples for a parsed diagram. */
function linksFromModel(model: DiagramModel): NodeLink[] {
	const out: NodeLink[] = [];
	for (const n of model.nodes) {
		const target = n.link?.trim();
		if (target) out.push({ id: n.id, label: n.label, target });
	}
	return out;
}

/** Parse a block's Mermaid source and return its linked nodes. */
export function collectNodeLinks(mermaidSource: string): NodeLink[] {
	return linksFromModel(mermaidToModel(mermaidSource).model);
}

/**
 * Mermaid names a rendered node group `flowchart-<id>-<n>` (the counter and even
 * the prefix have varied across versions), so try the raw DOM id, the
 * `flowchart-<id>-<n>` form and the `flowchart-<id>` form, validating each
 * candidate against the set of known linked ids.
 */
function idCandidates(domId: string): string[] {
	const out: string[] = [domId];
	const withCounter = domId.match(/^flowchart-(.+?)-\d+$/);
	if (withCounter && withCounter[1]) out.push(withCounter[1]);
	const plain = domId.match(/^flowchart-(.+)$/);
	if (plain && plain[1]) out.push(plain[1]);
	return out;
}

function resolveTarget(
	node: Element,
	byId: Map<string, string>,
	byLabel: Map<string, string>,
): string | undefined {
	for (const cand of idCandidates(node.id ?? "")) {
		const t = byId.get(cand);
		if (t !== undefined) return t;
	}
	// Fallback for unexpected id shapes: match the visible label text.
	const label = node.querySelector(".nodeLabel")?.textContent?.trim();
	if (label) return byLabel.get(label);
	return undefined;
}

/**
 * Attach a pointer affordance + click navigation to every rendered node that has
 * a link. Idempotent: a node already wired carries `data-mermaid-flow-link`, so
 * this is safe to call repeatedly from a MutationObserver as Mermaid re-renders.
 */
export function wireDiagramLinks(
	root: ParentNode,
	links: NodeLink[],
	navigate: (target: string) => void,
): void {
	if (links.length === 0) return;
	const byId = new Map(links.map((l) => [l.id, l.target]));
	const byLabel = new Map(links.map((l) => [l.label, l.target]));

	root.querySelectorAll<SVGGElement>("g.node").forEach((node) => {
		if (node.hasAttribute("data-mermaid-flow-link")) return;
		const target = resolveTarget(node, byId, byLabel);
		if (target === undefined) return;
		node.setAttribute("data-mermaid-flow-link", target);
		node.classList.add("mermaid-flow-linked");
		node.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			navigate(target);
		});
	});
}

/**
 * Navigate a node's link target: external URLs open in the browser, anything
 * else is treated as an Obsidian link (an optional `[[ ]]` wrapper is stripped,
 * so `#heading` / `^block` subpaths are preserved).
 */
export function navigateNodeLink(app: App, target: string): void {
	const t = target.trim();
	if (!t) return;
	if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) {
		activeWindow.open(t, "_blank");
		return;
	}
	const inner = t.replace(/^\[\[/, "").replace(/\]\]$/, "");
	const from = app.workspace.getActiveFile()?.path ?? "";
	app.workspace
		.openLinkText(inner, from, false)
		.catch((e) => console.error("[mermaid-flow]", e));
}
