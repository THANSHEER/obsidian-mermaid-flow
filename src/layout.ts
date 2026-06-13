/*
 * Auto layout. Used when a parsed diagram has no saved positions, or when the
 * user clicks "Auto layout".
 *
 * The engine is dagre (the same Sugiyama-style layered algorithm Mermaid itself
 * uses): proper rank assignment, crossing minimisation, and compound clusters
 * keeping subgraph members together. If dagre ever throws, a trivial grid
 * fallback still places the nodes so the editor has something to show.
 */

import * as dagre from "@dagrejs/dagre";
import { DiagramModel } from "./model";
import { estimateNodeSize } from "./nodeGeometry";

const DEFAULT_RANK_GAP = 200; // distance between successive ranks (grid fallback)
const DEFAULT_CROSS_GAP = 110; // distance between siblings within a rank (grid fallback)
const ORIGIN = 60;

export function autoLayout(model: DiagramModel): void {
	if (model.nodes.length === 0) return;
	try {
		dagreLayout(model);
	} catch (e) {
		console.error("[mermaid-flow] dagre layout failed, using grid fallback:", e);
		gridFallback(model);
	}
}

function dagreLayout(model: DiagramModel): void {
	const g = new dagre.graphlib.Graph({ compound: true });
	g.setGraph({
		rankdir: model.direction,
		// Defaults match Mermaid's flowchart defaults (nodeSpacing/rankSpacing 50)
		// so the auto-laid-out canvas tracks the render when spacing is unset.
		nodesep: model.config.nodeSpacing ?? 50,
		ranksep: model.config.rankSpacing ?? 50,
		marginx: ORIGIN,
		marginy: ORIGIN,
	});
	g.setDefaultEdgeLabel(() => ({}));

	const nodeIds = new Set(model.nodes.map((n) => n.id));
	for (const node of model.nodes) {
		const s = estimateNodeSize(node);
		g.setNode(node.id, { width: s.w, height: s.h });
	}

	// Subgraphs become compound clusters so members stay together.
	const claimed = new Set<string>();
	for (const grp of model.groups) {
		if (nodeIds.has(grp.id)) continue; // id collision with a node — skip
		const members = grp.nodeIds.filter(
			(id) => nodeIds.has(id) && !claimed.has(id),
		);
		if (members.length === 0) continue;
		g.setNode(grp.id, {});
		for (const id of members) {
			g.setParent(id, grp.id);
			claimed.add(id);
		}
	}

	for (const e of model.edges) {
		// Self-loops don't affect ranking; dangling edges have no geometry.
		if (e.from === e.to) continue;
		if (!nodeIds.has(e.from) || !nodeIds.has(e.to)) continue;
		g.setEdge(e.from, e.to);
	}

	dagre.layout(g);

	// dagre x/y are node centres — the same convention as DiagramNode.x/y.
	for (const node of model.nodes) {
		const p = g.node(node.id);
		if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
			throw new Error(`dagre produced no position for "${node.id}"`);
		}
		node.x = Math.max(40, Math.round(p.x));
		node.y = Math.max(30, Math.round(p.y));
	}
}

/**
 * Last-resort placement if dagre throws: a simple square-ish grid so the editor
 * still shows the nodes. dagre is the real engine — this only guards a crash.
 */
function gridFallback(model: DiagramModel): void {
	const cols = Math.max(1, Math.ceil(Math.sqrt(model.nodes.length)));
	model.nodes.forEach((n, i) => {
		n.x = ORIGIN + (i % cols) * DEFAULT_CROSS_GAP;
		n.y = ORIGIN + Math.floor(i / cols) * DEFAULT_RANK_GAP;
	});
}

/**
 * Nudge overlapping node boxes apart with minimal movement so boxes never cover
 * each other. Runs on load so a diagram whose saved positions predate a box-size
 * change (e.g. a larger label font) still displays cleanly without re-running a
 * full layout (which would discard the user's manual arrangement).
 *
 * Idempotent: a diagram with no overlaps is left untouched, so well-spaced manual
 * layouts are preserved exactly.
 */
export function resolveOverlaps(model: DiagramModel, margin = 12): void {
	if (model.nodes.length < 2) return;
	const boxes = model.nodes.map((n) => {
		const s = estimateNodeSize(n);
		return { n, hw: s.w / 2, hh: s.h / 2 };
	});

	const MAX_PASSES = 20;
	for (let pass = 0; pass < MAX_PASSES; pass++) {
		let moved = false;
		for (let i = 0; i < boxes.length; i++) {
			for (let j = i + 1; j < boxes.length; j++) {
				const A = boxes[i]!;
				const B = boxes[j]!;
				let dx = B.n.x - A.n.x;
				const dy = B.n.y - A.n.y;
				const ox = A.hw + B.hw + margin - Math.abs(dx);
				const oy = A.hh + B.hh + margin - Math.abs(dy);
				if (ox <= 0 || oy <= 0) continue; // boxes clear each other
				moved = true;
				if (dx === 0 && dy === 0) dx = i < j ? -1 : 1; // coincident: split
				// Separate along the axis of least penetration (least disruptive).
				if (ox < oy) {
					const push = (ox / 2) * (dx >= 0 ? 1 : -1);
					A.n.x -= push;
					B.n.x += push;
				} else {
					const push = (oy / 2) * (dy >= 0 ? 1 : -1);
					A.n.y -= push;
					B.n.y += push;
				}
			}
		}
		if (!moved) break;
	}

	// Keep everything in positive space after pushing.
	let minX = Infinity;
	let minY = Infinity;
	for (const b of boxes) {
		minX = Math.min(minX, b.n.x - b.hw);
		minY = Math.min(minY, b.n.y - b.hh);
	}
	const shiftX = minX < 20 ? 20 - minX : 0;
	const shiftY = minY < 20 ? 20 - minY : 0;
	if (shiftX || shiftY) {
		for (const b of boxes) {
			b.n.x = Math.round(b.n.x + shiftX);
			b.n.y = Math.round(b.n.y + shiftY);
		}
	} else {
		for (const b of boxes) {
			b.n.x = Math.round(b.n.x);
			b.n.y = Math.round(b.n.y);
		}
	}
}

/** Place nodes that still have no position (x===0 && y===0) onto a fallback grid. */
export function layoutMissing(model: DiagramModel): void {
	const unplaced = model.nodes.filter((n) => n.x === 0 && n.y === 0);
	if (unplaced.length === 0) return;
	if (unplaced.length === model.nodes.length) {
		autoLayout(model);
		return;
	}
	// A few new nodes among placed ones: drop them on a small grid past the
	// existing content in the diagram's flow direction, so they land where the
	// eye goes next instead of always far right.
	const horizontal = model.direction === "LR" || model.direction === "RL";
	if (horizontal) {
		let maxX = ORIGIN;
		for (const n of model.nodes) maxX = Math.max(maxX, n.x);
		unplaced.forEach((n, i) => {
			n.x = maxX + DEFAULT_RANK_GAP;
			n.y = ORIGIN + i * DEFAULT_CROSS_GAP;
		});
	} else {
		let maxY = ORIGIN;
		for (const n of model.nodes) maxY = Math.max(maxY, n.y);
		unplaced.forEach((n, i) => {
			n.x = ORIGIN + i * DEFAULT_CROSS_GAP;
			n.y = maxY + DEFAULT_RANK_GAP;
		});
	}
}
