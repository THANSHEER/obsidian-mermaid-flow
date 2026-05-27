/*
 * Simple layered (rank-based) auto layout. Used when a parsed diagram has no
 * saved positions, or when the user clicks "Auto layout".
 *
 * Nodes are assigned ranks by a longest-path pass over the edges, then spread
 * along the cross axis. Direction decides which axis is the rank axis.
 */

import { DiagramModel, Direction } from "./model";

const DEFAULT_RANK_GAP = 200; // distance between successive ranks
const DEFAULT_CROSS_GAP = 110; // distance between siblings within a rank
const ORIGIN = 60;

export function autoLayout(model: DiagramModel): void {
	const ids = model.nodes.map((n) => n.id);
	if (ids.length === 0) return;

	// Map Mermaid spacing config onto our layout gaps so the editor preview and
	// the rendered diagram stay roughly consistent.
	const RANK_GAP = Math.max(
		120,
		(model.config.rankSpacing ?? 60) + DEFAULT_RANK_GAP - 60,
	);
	const CROSS_GAP = Math.max(
		70,
		(model.config.nodeSpacing ?? 50) + DEFAULT_CROSS_GAP - 50,
	);

	const indegree = new Map<string, number>();
	const outgoing = new Map<string, string[]>();
	for (const id of ids) {
		indegree.set(id, 0);
		outgoing.set(id, []);
	}
	for (const e of model.edges) {
		if (!indegree.has(e.from) || !indegree.has(e.to)) continue;
		if (e.from === e.to) continue; // ignore self-loops for ranking
		outgoing.get(e.from)!.push(e.to);
		indegree.set(e.to, (indegree.get(e.to) ?? 0) + 1);
	}

	// Longest-path ranking with a visited guard so cycles terminate.
	const rank = new Map<string, number>();
	for (const id of ids) rank.set(id, 0);

	// Seed from roots (indegree 0); if none (pure cycle), seed from first node.
	const queue: string[] = ids.filter((id) => (indegree.get(id) ?? 0) === 0);
	if (queue.length === 0 && ids[0]) queue.push(ids[0]);

	const seen = new Set<string>();
	let guard = 0;
	const maxIterations = ids.length * ids.length + ids.length + 10;
	while (queue.length > 0 && guard++ < maxIterations) {
		const id = queue.shift()!;
		const r = rank.get(id) ?? 0;
		for (const next of outgoing.get(id) ?? []) {
			if ((rank.get(next) ?? 0) < r + 1) {
				rank.set(next, r + 1);
			}
			const key = `${id}->${next}`;
			if (!seen.has(key)) {
				seen.add(key);
				queue.push(next);
			}
		}
	}

	// Group nodes by rank, preserving model order within each rank.
	const byRank = new Map<number, string[]>();
	for (const id of ids) {
		const r = rank.get(id) ?? 0;
		if (!byRank.has(r)) byRank.set(r, []);
		byRank.get(r)!.push(id);
	}

	const horizontal = model.direction === "LR" || model.direction === "RL";

	const pos = new Map<string, { x: number; y: number }>();
	const sortedRanks = [...byRank.keys()].sort((a, b) => a - b);
	for (const r of sortedRanks) {
		const members = byRank.get(r) ?? [];
		members.forEach((id, i) => {
			if (horizontal) {
				pos.set(id, { x: ORIGIN + r * RANK_GAP, y: ORIGIN + i * CROSS_GAP });
			} else {
				pos.set(id, { x: ORIGIN + i * CROSS_GAP, y: ORIGIN + r * RANK_GAP });
			}
		});
	}

	applyReversedAxis(model.direction, pos);

	for (const node of model.nodes) {
		const p = pos.get(node.id);
		if (p) {
			node.x = p.x;
			node.y = p.y;
		}
	}
}

/** For BT / RL we mirror the rank axis so flow reads in the expected direction. */
function applyReversedAxis(
	direction: Direction,
	pos: Map<string, { x: number; y: number }>,
): void {
	if (direction !== "BT" && direction !== "RL") return;
	if (pos.size === 0) return;

	if (direction === "BT") {
		let maxY = -Infinity;
		for (const p of pos.values()) maxY = Math.max(maxY, p.y);
		for (const p of pos.values()) p.y = maxY - p.y + ORIGIN;
	} else {
		let maxX = -Infinity;
		for (const p of pos.values()) maxX = Math.max(maxX, p.x);
		for (const p of pos.values()) p.x = maxX - p.x + ORIGIN;
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
	// A few new nodes among placed ones: drop them on a small grid to the side.
	let maxX = ORIGIN;
	for (const n of model.nodes) maxX = Math.max(maxX, n.x);
	unplaced.forEach((n, i) => {
		n.x = maxX + DEFAULT_RANK_GAP;
		n.y = ORIGIN + i * DEFAULT_CROSS_GAP;
	});
}
