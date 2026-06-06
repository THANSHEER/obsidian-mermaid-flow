/*
 * Mermaid flowchart -> DiagramModel.
 *
 * This is a focused, line-based parser for the common flowchart / graph subset
 * (the MVP scope). It is intentionally forgiving: anything it cannot interpret
 * is preserved in `model.extras` and re-emitted on save, so we never corrupt a
 * user's advanced syntax.
 */

import {
	DiagramEdge,
	DiagramGroup,
	DiagramModel,
	DiagramNode,
	Direction,
	EdgeKind,
	EdgeStyle,
	NodeShape,
	emptyModel,
	newEdgeId,
	newGroupId,
} from "./model";

export interface ParseResult {
	model: DiagramModel;
	warnings: string[];
}

const HEADER_RE = /^\s*(?:flowchart|graph)\s+(TB|TD|BT|LR|RL)\b/i;

// Position hint comment we write ourselves so manual layout survives a round
// trip. Mermaid treats `%%` lines as comments, so this stays valid.
const POS_RE = /^\s*%%\s*mermaid-flow:pos\s+(.*)$/i;

/** Operators, longest/most-specific first so the regex matches greedily. */
const LINK_OP_RE = /(<-->|-\.->|-\.-|-->|---|==>|===|~~~)/;
const LINK_OP_RE_G = /(<-->|-\.->|-\.-|-->|---|==>|===|~~~)/g;

function opToKind(op: string): EdgeKind {
	if (op.startsWith("<")) return "bidirectional";
	if (op.startsWith("~")) return "invisible";
	if (op.startsWith("-.")) return "dotted";
	if (op.startsWith("==") || op === "===") return "thick";
	if (op === "---") return "open";
	return "arrow";
}

function stripQuotes(s: string): string {
	const t = s.trim();
	let inner = t;
	if (inner.length >= 2 && inner.startsWith('"') && inner.endsWith('"')) {
		inner = inner.slice(1, -1);
	}
	// Decode <br/> back to \n for multi-line labels
	return inner.replace(/<br\s*\/?>/gi, "\n");
}

interface ParsedToken {
	id: string;
	shape?: NodeShape;
	label?: string;
}

/** Parse a single node token such as `A`, `A[Label]`, `B{Decision}`. */
function parseNodeToken(raw: string): ParsedToken | null {
	const token = raw.trim();
	if (!token) return null;

	// Ordered so multi-character shape brackets are matched before their
	// single-bracket counterparts (e.g. `((( )))` before `(( ))` before `( )`).
	const id = "([A-Za-z0-9_]+)";
	const patterns: Array<{ re: RegExp; shape: NodeShape }> = [
		{ re: new RegExp(`^${id}\\(\\(\\((.*)\\)\\)\\)$`), shape: "double-circle" },
		{ re: new RegExp(`^${id}\\(\\((.*)\\)\\)$`), shape: "circle" },
		{ re: new RegExp(`^${id}\\(\\[(.*)\\]\\)$`), shape: "stadium" },
		{ re: new RegExp(`^${id}\\[\\[(.*)\\]\\]$`), shape: "subroutine" },
		{ re: new RegExp(`^${id}\\[\\((.*)\\)\\]$`), shape: "cylinder" },
		{ re: new RegExp(`^${id}\\{\\{(.*)\\}\\}$`), shape: "hexagon" },
		{ re: new RegExp(`^${id}\\[/(.*)\\\\\\]$`), shape: "trapezoid" },
		{ re: new RegExp(`^${id}\\[\\\\(.*)/\\]$`), shape: "trapezoid-alt" },
		{ re: new RegExp(`^${id}\\[/(.*)/\\]$`), shape: "parallelogram" },
		{ re: new RegExp(`^${id}\\[\\\\(.*)\\\\\\]$`), shape: "parallelogram-alt" },
		{ re: new RegExp(`^${id}\\{(.*)\\}$`), shape: "diamond" },
		{ re: new RegExp(`^${id}>(.*)\\]$`), shape: "asymmetric" },
		{ re: new RegExp(`^${id}\\[(.*)\\]$`), shape: "rect" },
		{ re: new RegExp(`^${id}\\((.*)\\)$`), shape: "round" },
	];

	for (const { re, shape } of patterns) {
		const m = token.match(re);
		if (m && m[1] !== undefined && m[2] !== undefined) {
			return { id: m[1], shape, label: stripQuotes(m[2]) };
		}
	}

	// Bare identifier, no shape declared.
	const bare = token.match(/^([A-Za-z0-9_]+)$/);
	if (bare && bare[1] !== undefined) {
		return { id: bare[1] };
	}

	return null;
}

/**
 * Normalize Mermaid's "inline label" link forms (`A -- text --> B`) into the
 * pipe-label form (`A -->|text| B`) so the splitter only has to handle one
 * shape of labelled link.
 */
function normalizeInlineLabels(stmt: string): string {
	return stmt
		// bidirectional: <-- text -->
		.replace(/<--\s*([^-|>][^-|]*?)\s*-->/g, "<-->|$1|")
		// thick arrow:  == text ==>
		.replace(/==\s*([^=|>][^=|]*?)\s*==>/g, "==>|$1|")
		// thick open:   == text ===
		.replace(/==\s*([^=|>][^=|]*?)\s*===/g, "===|$1|")
		// dotted arrow: -. text .->
		.replace(/-\.\s*([^.|>][^.|]*?)\s*\.->/g, "-.->|$1|")
		// normal arrow: -- text -->
		.replace(/--\s*([^-|>][^-|]*?)\s*-->/g, "-->|$1|")
		// normal open:  -- text ---
		.replace(/--\s*([^-|>][^-|]*?)\s*---/g, "---|$1|");
}

/** Parse `fill:#fff,stroke:#000,color:#111,font-size:18px,stroke-width:2px`. */
function applyStyleProps(node: DiagramNode, propStr: string): void {
	const style: NonNullable<DiagramNode["style"]> = node.style ?? {};
	const extra: string[] = style.extra ?? [];
	for (const raw of propStr.split(",")) {
		const part = raw.trim();
		if (!part) continue;
		const idx = part.indexOf(":");
		if (idx === -1) {
			extra.push(part);
			continue;
		}
		const key = part.slice(0, idx).trim().toLowerCase();
		const val = part.slice(idx + 1).trim();
		switch (key) {
			case "fill":
				style.fillColor = val;
				break;
			case "stroke":
				style.strokeColor = val;
				break;
			case "color":
				style.textColor = val;
				break;
			case "font-size": {
				const n = parseInt(val.replace(/px$/i, ""), 10);
				if (!Number.isNaN(n)) style.fontSize = n;
				break;
			}
			case "font-family":
				style.fontFamily = val;
				break;
			default:
				extra.push(part);
		}
	}
	if (extra.length > 0) style.extra = extra;
	node.style = style;
}

/** Parse a `linkStyle` property string into an EdgeStyle. */
function parseEdgeStyleProps(propStr: string): EdgeStyle {
	const style: EdgeStyle = {};
	const extra: string[] = [];
	for (const raw of propStr.split(",")) {
		const part = raw.trim();
		if (!part) continue;
		const idx = part.indexOf(":");
		if (idx === -1) {
			extra.push(part);
			continue;
		}
		const key = part.slice(0, idx).trim().toLowerCase();
		const val = part.slice(idx + 1).trim();
		switch (key) {
			case "stroke":
				style.strokeColor = val;
				break;
			case "stroke-width": {
				const n = parseInt(val.replace(/px$/i, ""), 10);
				if (!Number.isNaN(n)) style.strokeWidth = n;
				break;
			}
			case "color":
				style.textColor = val;
				break;
			case "font-size": {
				const n = parseInt(val.replace(/px$/i, ""), 10);
				if (!Number.isNaN(n)) style.fontSize = n;
				break;
			}
			default:
				extra.push(part);
		}
	}
	if (extra.length > 0) style.extra = extra;
	return style;
}

/** Parse the JSON body of an `init` directive into model.config (best effort). */
function applyInitConfig(model: DiagramModel, jsonBody: string): void {
	let obj: Record<string, unknown>;
	try {
		obj = JSON.parse(jsonBody) as Record<string, unknown>;
	} catch {
		// Mermaid examples often use single quotes; normalize and retry.
		try {
			const normalized = jsonBody
				.replace(/'/g, '"')
				.replace(/([{,]\s*)([A-Za-z0-9_-]+)\s*:/g, '$1"$2":');
			obj = JSON.parse(normalized) as Record<string, unknown>;
		} catch {
			model.extras.push(`%%{init: ${jsonBody}}%%`);
			return;
		}
	}
	if (!obj) return;
	if (typeof obj.theme === "string") model.config.theme = obj.theme;
	if (obj.themeVariables && typeof obj.themeVariables === "object") {
		model.config.themeVariables = obj.themeVariables as Record<string, string>;
		// Background is modelled as its own field, not a raw theme variable.
		const tv = model.config.themeVariables;
		if (typeof tv.background === "string") {
			model.config.background = tv.background;
			delete tv.background;
			if (Object.keys(tv).length === 0) delete model.config.themeVariables;
		}
	}
	const fc = obj.flowchart as Record<string, unknown> | undefined;
	if (fc && typeof fc === "object") {
		if (typeof fc.nodeSpacing === "number") model.config.nodeSpacing = fc.nodeSpacing;
		if (typeof fc.rankSpacing === "number") model.config.rankSpacing = fc.rankSpacing;
	}
}

function isStructuralLine(line: string): boolean {
	const t = line.trim().toLowerCase();
	return (
		t.startsWith("subgraph") ||
		t === "end" ||
		t.startsWith("style ") ||
		t.startsWith("classdef") ||
		t.startsWith("class ") ||
		t.startsWith("click ") ||
		t.startsWith("linkstyle") ||
		t.startsWith("direction ")
	);
}

export function mermaidToModel(text: string): ParseResult {
	const warnings: string[] = [];
	const model = emptyModel("TB");

	const nodeMap = new Map<string, DiagramNode>();
	const posHints = new Map<
		string,
		{ x: number; y: number; w?: number; h?: number }
	>();
	const groupStack: DiagramGroup[] = [];
	const groupedNodes = new Set<string>();
	const linkStyleDirectives: Array<{ index: number; props: string }> = [];

	const ensureNode = (token: ParsedToken): DiagramNode => {
		let node = nodeMap.get(token.id);
		if (!node) {
			node = {
				id: token.id,
				label: token.label ?? token.id,
				shape: token.shape ?? "rect",
				x: 0,
				y: 0,
			};
			nodeMap.set(token.id, node);
			model.nodes.push(node);
		} else {
			// A later, richer declaration wins (e.g. shape/label defined inline
			// in an edge statement after a bare reference).
			if (token.shape) node.shape = token.shape;
			if (token.label !== undefined) node.label = token.label;
		}
		// First mention inside a subgraph assigns membership.
		const current = groupStack[groupStack.length - 1];
		if (current && !groupedNodes.has(node.id)) {
			current.nodeIds.push(node.id);
			groupedNodes.add(node.id);
		}
		return node;
	};

	const openGroup = (rest: string): void => {
		let id: string;
		let title: string;
		let m: RegExpMatchArray | null;
		if (rest === "") {
			id = newGroupId(model);
			title = id;
		} else if ((m = rest.match(/^([A-Za-z0-9_]+)\s*\[(.+)\]$/))) {
			id = m[1] as string;
			title = stripQuotes(m[2] as string);
		} else if ((m = rest.match(/^"(.+)"$/))) {
			id = newGroupId(model);
			title = m[1] as string;
		} else if ((m = rest.match(/^([A-Za-z0-9_]+)$/))) {
			id = m[1] as string;
			title = id;
		} else {
			id = newGroupId(model);
			title = rest;
		}
		const group: DiagramGroup = { id, title, nodeIds: [] };
		model.groups.push(group);
		groupStack.push(group);
	};

	const rawLines = text.replace(/\r\n/g, "\n").split("\n");
	let headerSeen = false;

	for (const rawLine of rawLines) {
		const line = rawLine.replace(/\t/g, "    ");
		const trimmed = line.trim();
		if (trimmed === "") continue;

		// Our own position hint comment.
		const posMatch = line.match(POS_RE);
		if (posMatch && posMatch[1] !== undefined) {
			for (const part of posMatch[1].split(/[;\s]+/)) {
				const m = part.match(
					/^([A-Za-z0-9_]+)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,(\d+(?:\.\d+)?),(\d+(?:\.\d+)?))?$/,
				);
				if (m && m[1] && m[2] && m[3]) {
					const hint: { x: number; y: number; w?: number; h?: number } = {
						x: parseFloat(m[2]),
						y: parseFloat(m[3]),
					};
					if (m[4] && m[5]) {
						hint.w = parseFloat(m[4]);
						hint.h = parseFloat(m[5]);
					}
					posHints.set(m[1], hint);
				}
			}
			continue;
		}

		// `%%{init: {...}}%%` config directive.
		const initMatch = trimmed.match(/^%%\{\s*init\s*:\s*(\{[\s\S]*\})\s*\}%%$/i);
		if (initMatch && initMatch[1]) {
			applyInitConfig(model, initMatch[1]);
			continue;
		}

		// Other comments — keep them.
		if (trimmed.startsWith("%%")) {
			model.extras.push(trimmed);
			continue;
		}

		const header = line.match(HEADER_RE);
		if (header && header[1] !== undefined) {
			let dir = header[1].toUpperCase();
			if (dir === "TD") dir = "TB";
			model.direction = dir as Direction;
			headerSeen = true;
			continue;
		}

		// Subgraph open / close.
		const subMatch = trimmed.match(/^subgraph\b\s*(.*)$/i);
		if (subMatch) {
			openGroup((subMatch[1] ?? "").trim());
			continue;
		}
		if (/^end$/i.test(trimmed)) {
			groupStack.pop();
			continue;
		}

		// `style <id> prop:val,...` — fold into the node's style.
		const styleMatch = trimmed.match(/^style\s+([A-Za-z0-9_]+)\s+(.+)$/i);
		if (styleMatch && styleMatch[1] && styleMatch[2]) {
			const node = ensureNode({ id: styleMatch[1] });
			applyStyleProps(node, styleMatch[2]);
			continue;
		}

		// `linkStyle <i>[,<j>...] prop:val,...` — collect; applied after parse.
		const linkMatch = trimmed.match(/^linkStyle\s+([\d,\s]+?)\s+(.+)$/i);
		if (linkMatch && linkMatch[1] && linkMatch[2]) {
			const props = linkMatch[2];
			for (const tok of linkMatch[1].split(/[,\s]+/)) {
				const n = parseInt(tok, 10);
				if (!Number.isNaN(n)) linkStyleDirectives.push({ index: n, props });
			}
			continue;
		}

		if (isStructuralLine(line)) {
			model.extras.push(trimmed);
			warnings.push(`Unsupported line kept as-is: "${trimmed}"`);
			continue;
		}

		// One statement may hold several `;`-separated statements.
		for (const part of trimmed.split(";")) {
			const stmt = part.trim();
			if (!stmt) continue;
			parseStatement(stmt, ensureNode, model.edges, warnings, model.extras);
		}
	}

	if (!headerSeen && model.nodes.length === 0 && model.edges.length === 0) {
		warnings.push("No flowchart content detected.");
	}

	// Apply collected linkStyle directives to edges by index.
	for (const { index, props } of linkStyleDirectives) {
		const edge = model.edges[index];
		if (!edge) continue;
		const parsed = parseEdgeStyleProps(props);
		// Lift animated marker out of extra before merging into style
		if (parsed.extra) {
			const animIdx = parsed.extra.indexOf("mermaid-flow-animated:1");
			if (animIdx >= 0) {
				edge.animated = true;
				parsed.extra.splice(animIdx, 1);
				if (parsed.extra.length === 0) delete parsed.extra;
			}
		}
		edge.style = { ...edge.style, ...parsed };
	}

	// Drop groups that ended up empty.
	model.groups = model.groups.filter((g) => g.nodeIds.length > 0);

	// Apply saved position hints; everything else gets laid out by the caller.
	for (const node of model.nodes) {
		const hint = posHints.get(node.id);
		if (hint) {
			node.x = hint.x;
			node.y = hint.y;
			if (hint.w && hint.h) {
				node.w = hint.w;
				node.h = hint.h;
			}
		}
	}

	return { model, warnings };
}

function parseStatement(
	stmt: string,
	ensureNode: (t: ParsedToken) => DiagramNode,
	edges: DiagramEdge[],
	warnings: string[],
	extras: string[],
): void {
	const normalized = normalizeInlineLabels(stmt);

	if (!LINK_OP_RE.test(normalized)) {
		// No link operator: this is a standalone node declaration.
		const token = parseNodeToken(normalized);
		if (token) {
			ensureNode(token);
		} else {
			extras.push(stmt);
			warnings.push(`Could not parse: "${stmt}"`);
		}
		return;
	}

	// Split into alternating node / operator pieces, preserving the operators.
	const pieces = normalized.split(LINK_OP_RE_G).map((p) => p.trim());
	// pieces = [node, op, node, op, node, ...]

	let prevNode: DiagramNode | null = null;
	let pendingOp: string | null = null;

	for (let i = 0; i < pieces.length; i++) {
		const piece = pieces[i] ?? "";
		const isOp = i % 2 === 1;

		if (isOp) {
			pendingOp = piece;
			continue;
		}

		// Node piece. It may carry a leading pipe-label belonging to the
		// previous operator: `|label| B`.
		let label = "";
		let nodePart = piece;
		const labelMatch = piece.match(/^\|([^|]*)\|\s*(.*)$/);
		if (labelMatch && labelMatch[1] !== undefined && labelMatch[2] !== undefined) {
			label = stripQuotes(labelMatch[1]);
			nodePart = labelMatch[2].trim();
		}

		const token = parseNodeToken(nodePart);
		if (!token) {
			extras.push(stmt);
			warnings.push(`Could not parse node "${nodePart}" in "${stmt}"`);
			return;
		}

		const node = ensureNode(token);

		if (prevNode && pendingOp) {
			edges.push({
				id: newEdgeId(),
				from: prevNode.id,
				to: node.id,
				label,
				kind: opToKind(pendingOp),
			});
		}

		prevNode = node;
		pendingOp = null;
	}
}
