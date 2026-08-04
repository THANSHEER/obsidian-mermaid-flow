/*
 * Mindmap parse ↔ serialize (Mermaid indentation-based mindmap syntax).
 */

import { MindmapModel, MindmapNode, emptyMindmap } from "./types";

let mindId = 0;
function nextId(): string {
	return `m${++mindId}`;
}

export function parseMindmap(text: string): MindmapModel {
	const model = emptyMindmap();
	const lines = text.replace(/\r\n/g, "\n").split("\n");
	const stack: Array<{ depth: number; node: MindmapNode }> = [];
	let headerSeen = false;
	let first = true;

	for (const raw of lines) {
		if (/^\s*$/.test(raw)) continue;
		const trimmed = raw.trim();
		if (/^mindmap\b/i.test(trimmed)) {
			headerSeen = true;
			continue;
		}
		if (!headerSeen && trimmed.startsWith("%%")) {
			model.extras.push(trimmed);
			continue;
		}
		if (!headerSeen) {
			model.extras.push(trimmed);
			continue;
		}

		const indent = raw.match(/^(\s*)/)?.[1]?.length ?? 0;
		const depth = Math.floor(indent / 2);
		const label = trimmed.replace(/^root\s*\(\((.*)\)\)$/i, "$1").replace(/^root\s+/i, "");

		const node: MindmapNode = { id: nextId(), label, children: [] };

		if (first) {
			model.root = node;
			stack.length = 0;
			stack.push({ depth, node });
			first = false;
			continue;
		}

		while (stack.length > 0 && (stack[stack.length - 1]?.depth ?? 0) >= depth) {
			stack.pop();
		}
		const parent = stack[stack.length - 1]?.node ?? model.root;
		parent.children.push(node);
		stack.push({ depth, node });
	}

	return model;
}

function emitNode(node: MindmapNode, depth: number, lines: string[]): void {
	const pad = "  ".repeat(depth);
	if (depth === 0) {
		lines.push(`${pad}root((${node.label}))`);
	} else {
		lines.push(`${pad}${node.label}`);
	}
	for (const child of node.children) {
		emitNode(child, depth + 1, lines);
	}
}

export function serializeMindmap(model: MindmapModel): string {
	const lines: string[] = ["mindmap"];
	emitNode(model.root, 0, lines);
	for (const extra of model.extras) {
		lines.push(`  ${extra}`);
	}
	return lines.join("\n");
}

export function addMindmapChild(parent: MindmapNode, label: string): MindmapNode {
	const child: MindmapNode = { id: nextId(), label, children: [] };
	parent.children.push(child);
	return child;
}

export type { MindmapModel, MindmapNode };
