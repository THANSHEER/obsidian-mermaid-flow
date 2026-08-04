/*
 * User-saved reusable diagram snippets (component library).
 * Stored in plugin settings and inserted as Mermaid fragments.
 */

import {
	DiagramEdge,
	DiagramModel,
	DiagramNode,
	emptyModel,
	nextNodeId,
	newEdgeId,
} from "./model";
import { mermaidToModel } from "./parser";
import { modelToMermaid } from "./serializer";

export interface LibraryComponent {
	id: string;
	name: string;
	/** Full flowchart Mermaid for the snippet (positions optional). */
	mermaid: string;
	createdAt: number;
}

/** Build a component from a subset of nodes (and edges between them). */
export function componentFromSelection(
	model: DiagramModel,
	nodeIds: string[],
	name: string,
): LibraryComponent | null {
	if (nodeIds.length === 0) return null;
	const idSet = new Set(nodeIds);
	const nodes = model.nodes.filter((n) => idSet.has(n.id)).map((n) => ({ ...n }));
	const edges = model.edges
		.filter((e) => idSet.has(e.from) && idSet.has(e.to))
		.map((e) => ({ ...e }));
	if (nodes.length === 0) return null;

	// Normalize coordinates so the snippet is origin-relative.
	let minX = Infinity;
	let minY = Infinity;
	for (const n of nodes) {
		minX = Math.min(minX, n.x);
		minY = Math.min(minY, n.y);
	}
	for (const n of nodes) {
		n.x -= minX - 80;
		n.y -= minY - 60;
	}

	const snippet: DiagramModel = {
		...emptyModel(model.direction),
		nodes,
		edges,
		classDefs: model.classDefs
			.filter((c) => nodes.some((n) => n.classes?.includes(c.name)))
			.map((c) => ({ name: c.name, style: { ...c.style } })),
	};

	return {
		id: `comp-${Date.now().toString(36)}`,
		name: name.trim() || "Untitled component",
		mermaid: modelToMermaid(snippet, { includePositions: true }),
		createdAt: Date.now(),
	};
}

/** Paste a library component into `target`, remapping ids to avoid collisions. */
export function insertComponent(
	target: DiagramModel,
	comp: LibraryComponent,
	offsetX = 40,
	offsetY = 40,
): string[] {
	const { model } = mermaidToModel(comp.mermaid);
	const idMap = new Map<string, string>();
	const placed: string[] = [];

	for (const node of model.nodes) {
		const newId = nextNodeId(target);
		idMap.set(node.id, newId);
		const copy: DiagramNode = {
			...node,
			id: newId,
			x: node.x + offsetX,
			y: node.y + offsetY,
			style: node.style ? { ...node.style } : undefined,
			classes: node.classes ? [...node.classes] : undefined,
		};
		target.nodes.push(copy);
		placed.push(newId);
	}

	for (const edge of model.edges) {
		const from = idMap.get(edge.from);
		const to = idMap.get(edge.to);
		if (!from || !to) continue;
		const copy: DiagramEdge = {
			...edge,
			id: newEdgeId(),
			from,
			to,
			style: edge.style ? { ...edge.style } : undefined,
		};
		target.edges.push(copy);
	}

	for (const def of model.classDefs) {
		if (!target.classDefs.some((c) => c.name === def.name)) {
			target.classDefs.push({
				name: def.name,
				style: { ...def.style },
			});
		}
	}

	return placed;
}
