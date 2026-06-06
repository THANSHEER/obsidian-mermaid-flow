/*
 * Pure geometry helpers for aligning and distributing selected nodes.
 * Uses the same size heuristic as canvas.ts (no canvas dependency).
 */

import type { DiagramModel, DiagramNode } from "./model";

const CHAR_W = 8.2;
const NODE_H = 44;
const MIN_W = 80;

function approxHalf(node: DiagramNode): { hw: number; hh: number } {
	const w = node.w ?? Math.max(MIN_W, (node.label ?? "").length * CHAR_W + 32);
	const h = node.h ?? NODE_H;
	return { hw: w / 2, hh: h / 2 };
}

export type AlignDir = "left" | "right" | "top" | "bottom" | "center-x" | "center-y";
export type DistributeDir = "horizontal" | "vertical";

export function alignNodes(model: DiagramModel, ids: string[], dir: AlignDir): void {
	const nodes = ids
		.map((id) => model.nodes.find((n) => n.id === id))
		.filter((n): n is DiagramNode => n !== undefined);
	if (nodes.length < 2) return;

	switch (dir) {
		case "left": {
			const ref = Math.min(...nodes.map((n) => n.x - approxHalf(n).hw));
			for (const n of nodes) n.x = Math.round(ref + approxHalf(n).hw);
			break;
		}
		case "right": {
			const ref = Math.max(...nodes.map((n) => n.x + approxHalf(n).hw));
			for (const n of nodes) n.x = Math.round(ref - approxHalf(n).hw);
			break;
		}
		case "top": {
			const ref = Math.min(...nodes.map((n) => n.y - approxHalf(n).hh));
			for (const n of nodes) n.y = Math.round(ref + approxHalf(n).hh);
			break;
		}
		case "bottom": {
			const ref = Math.max(...nodes.map((n) => n.y + approxHalf(n).hh));
			for (const n of nodes) n.y = Math.round(ref - approxHalf(n).hh);
			break;
		}
		case "center-x": {
			const ref = Math.round(nodes.reduce((s, n) => s + n.x, 0) / nodes.length);
			for (const n of nodes) n.x = ref;
			break;
		}
		case "center-y": {
			const ref = Math.round(nodes.reduce((s, n) => s + n.y, 0) / nodes.length);
			for (const n of nodes) n.y = ref;
			break;
		}
	}
}

export function distributeNodes(
	model: DiagramModel,
	ids: string[],
	dir: DistributeDir,
): void {
	const nodes = ids
		.map((id) => model.nodes.find((n) => n.id === id))
		.filter((n): n is DiagramNode => n !== undefined);
	if (nodes.length < 3) return;

	if (dir === "horizontal") {
		nodes.sort((a, b) => a.x - b.x);
		const lo = nodes[0]!.x;
		const hi = nodes[nodes.length - 1]!.x;
		const step = (hi - lo) / (nodes.length - 1);
		for (let i = 1; i < nodes.length - 1; i++) {
			const n = nodes[i];
			if (n) n.x = Math.round(lo + step * i);
		}
	} else {
		nodes.sort((a, b) => a.y - b.y);
		const lo = nodes[0]!.y;
		const hi = nodes[nodes.length - 1]!.y;
		const step = (hi - lo) / (nodes.length - 1);
		for (let i = 1; i < nodes.length - 1; i++) {
			const n = nodes[i];
			if (n) n.y = Math.round(lo + step * i);
		}
	}
}
