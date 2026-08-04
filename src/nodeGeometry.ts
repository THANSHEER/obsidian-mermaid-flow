/*
 * Node size estimation, shared by the canvas renderer (geom cache) and the
 * auto layout so both always agree on node dimensions.
 */

import type { DiagramNode } from "./model";
import { measureTextWidth } from "./textMetrics";

export const NODE_H = 44;
export const MIN_W = 80;

/** Size a node from its manual w/h or its label text + shape padding. */
export function estimateNodeSize(node: DiagramNode): { w: number; h: number } {
	if (node.w && node.h) {
		return { w: node.w, h: node.h };
	}
	const rawLabel = node.label || node.id;
	const lines = rawLabel.split("\n");
	// Width uses the widest measured line; height grows for multi-line labels.
	const widest = Math.max(...lines.map((l) => measureTextWidth(l)));
	let w = Math.max(MIN_W, Math.ceil(widest) + 32);
	let h = NODE_H + Math.max(0, (lines.length - 1) * 16);
	switch (node.shape) {
		case "circle":
		case "double-circle": {
			const d = Math.max(w, 66);
			w = d;
			h = d;
			break;
		}
		case "diamond":
			w = Math.max(w + 28, 100);
			h = 72;
			break;
		case "hexagon":
			w += 40;
			break;
		case "parallelogram":
		case "parallelogram-alt":
		case "trapezoid":
		case "trapezoid-alt":
			w += 46;
			break;
		case "asymmetric":
			w += 26;
			break;
		case "cylinder":
			h += 20;
			break;
		case "stadium":
			w += 16;
			break;
	}
	return { w, h };
}
