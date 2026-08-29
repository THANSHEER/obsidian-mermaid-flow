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
	NodeStyle,
	emptyModel,
	groupSubtreeHasNodes,
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
	// Decode <br/> back to \n for multi-line labels, and unescape quotes
	return inner
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/&(?:quot|#34|#x22);/gi, '"')
		.replace(/#quot;/gi, '"');
}

interface ParsedToken {
	id: string;
	shape?: NodeShape;
	label?: string;
	classes?: string[];
}

/** Parse a single node token such as `A`, `A[Label]`, `B{Decision}`. */
function parseNodeToken(raw: string): ParsedToken | null {
	const token = raw.trim();
	if (!token) return null;

	// `:::class` shorthand. Handled first (recursively) so it composes with
	// every node form, including chains: `A[Label]:::a:::b`. The greedy prefix
	// is safe — a class name can't end with a label's closing bracket.
	const cls = token.match(/^(.*):::([A-Za-z0-9_-]+)$/);
	if (cls && cls[1] !== undefined && cls[2] !== undefined) {
		const inner = parseNodeToken(cls[1]);
		if (inner) {
			return { ...inner, classes: [...(inner.classes ?? []), cls[2]] };
		}
		// Prefix isn't a node (e.g. `A[x:::y]` — the ::: is inside an unquoted
		// label): fall through to the normal shape patterns on the full token.
	}

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

	// Mermaid v11 attribute syntax: `A@{shape: diamond, label: "Hi"}`.
	const v11 = token.match(/^([A-Za-z0-9_]+)@\{(.*)\}$/);
	if (v11 && v11[1] !== undefined && v11[2] !== undefined) {
		const props = parseV11Props(v11[2]);
		const shapeName = props.get("shape");
		const label = props.get("label");
		const result: ParsedToken = { id: v11[1] };
		// Unknown shape names degrade to rect (nearest supported shape).
		if (shapeName !== undefined) {
			result.shape = V11_SHAPE_MAP[shapeName.toLowerCase()] ?? "rect";
		}
		if (label !== undefined) result.label = label;
		return result;
	}

	// Bare identifier, no shape declared.
	const bare = token.match(/^([A-Za-z0-9_]+)$/);
	if (bare && bare[1] !== undefined) {
		return { id: bare[1] };
	}

	return null;
}

/**
 * Mermaid v11 `@{shape: …}` names → the nearest supported NodeShape.
 * Aliases per the Mermaid v11 shape table; unmapped names fall back to rect.
 */
const V11_SHAPE_MAP: Record<string, NodeShape> = {
	rect: "rect", process: "rect", proc: "rect", rectangle: "rect",
	rounded: "round", event: "round",
	stadium: "stadium", pill: "stadium", terminal: "stadium",
	subroutine: "subroutine", subproc: "subroutine", "fr-rect": "subroutine",
	"framed-rectangle": "subroutine",
	cyl: "cylinder", cylinder: "cylinder", db: "cylinder", database: "cylinder",
	circle: "circle", circ: "circle",
	"dbl-circ": "double-circle", "double-circle": "double-circle",
	diam: "diamond", diamond: "diamond", decision: "diamond", question: "diamond",
	hex: "hexagon", hexagon: "hexagon", prepare: "hexagon",
	"lean-r": "parallelogram", "lean-right": "parallelogram", "in-out": "parallelogram",
	"lean-l": "parallelogram-alt", "lean-left": "parallelogram-alt", "out-in": "parallelogram-alt",
	"trap-b": "trapezoid", "trapezoid-bottom": "trapezoid", trapezoid: "trapezoid",
	priority: "trapezoid",
	"trap-t": "trapezoid-alt", "trapezoid-top": "trapezoid-alt",
	"inv-trapezoid": "trapezoid-alt", manual: "trapezoid-alt",
	odd: "asymmetric",
};

/** Parse the body of `@{…}`: comma-separated key: value pairs, quote-aware. */
function parseV11Props(body: string): Map<string, string> {
	const props = new Map<string, string>();
	const parts: string[] = [];
	let cur = "";
	let inQuote = false;
	for (const ch of body) {
		if (ch === '"') inQuote = !inQuote;
		if (ch === "," && !inQuote) {
			parts.push(cur);
			cur = "";
			continue;
		}
		cur += ch;
	}
	parts.push(cur);
	for (const part of parts) {
		const m = part.match(/^\s*([\w-]+)\s*:\s*(.*?)\s*$/);
		if (m && m[1] !== undefined && m[2] !== undefined) {
			props.set(m[1].toLowerCase(), stripQuotes(m[2]));
		}
	}
	return props;
}

/**
 * Split a node segment on `&` (Mermaid multi-node syntax, `A & B --> C`),
 * ignoring `&` inside bracket labels (`A[Tom & Jerry]`) or quotes.
 */
function splitMultiNodes(segment: string): string[] {
	const parts: string[] = [];
	let cur = "";
	let depth = 0;
	let inQuote = false;
	for (let i = 0; i < segment.length; i++) {
		const ch = segment[i]!;
		const prev = i > 0 ? segment[i - 1] : "";
		if (ch === '"' && prev !== "\\") inQuote = !inQuote;
		if (!inQuote) {
			if (ch === "(" || ch === "[" || ch === "{") depth++;
			else if (ch === ")" || ch === "]" || ch === "}") {
				if (depth > 0) depth--;
			}
			else if (ch === "&" && depth === 0) {
				parts.push(cur);
				cur = "";
				continue;
			}
		}
		cur += ch;
	}
	parts.push(cur);
	return parts;
}

/**
 * Normalize Mermaid's "inline label" link forms (`A -- text --> B`) into the
 * pipe-label form (`A -->|text| B`) so the splitter only has to handle one
 * shape of labelled link.
 */
function normalizeInlineLabels(stmt: string): string {
	return stmt
		// bidirectional: <-- text -->
		.replace(/<--\s*("(?:[^"\\]|\\.)*"|[^-|>](?:[^-|]|-(?!->))*?)\s*-->/g, "<-->|$1|")
		// thick arrow:  == text ==>
		.replace(/==\s*("(?:[^"\\]|\\.)*"|[^=|>](?:[^=|]|=(?!=>))*?)\s*==>/g, "==>|$1|")
		// thick open:   == text ===
		.replace(/==\s*("(?:[^"\\]|\\.)*"|[^=|>](?:[^=|]|=(?!==))*?)\s*===/g, "===|$1|")
		// dotted arrow: -. text .->
		.replace(/-\.\s*("(?:[^"\\]|\\.)*"|[^.|>](?:[^.|]|\.(?!->))*?)\s*\.->/g, "-.->|$1|")
		// normal arrow: -- text -->
		.replace(/--\s*("(?:[^"\\]|\\.)*"|[^-|>](?:[^-|]|-(?!->))*?)\s*-->/g, "-->|$1|")
		// normal open:  -- text ---
		.replace(/--\s*("(?:[^"\\]|\\.)*"|[^-|>](?:[^-|]|-(?!--))*?)\s*---/g, "---|$1|");
}

/** A `key: value` prop with no recognized handler is preserved verbatim. */
type PropHandler<T> = (val: string, style: T) => void;

/** Parses an integer pixel value (`"18px"` or `"18"`); ignored if not a number. */
function parsePx(val: string, set: (n: number) => void): void {
	const n = parseInt(val.replace(/px$/i, ""), 10);
	if (!Number.isNaN(n)) set(n);
}

/**
 * Shared engine behind `parseStyleProps`/`parseEdgeStyleProps`: splits a
 * `key:value,key:value` string, dispatches each pair to its handler, and
 * preserves anything unrecognized in `style.extra` so it round-trips.
 */
function parseProps<T extends { extra?: string[] }>(
	propStr: string,
	handlers: Record<string, PropHandler<T>>,
): T {
	const style = {} as T;
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
		const handler = handlers[key];
		if (handler) handler(val, style);
		else extra.push(part);
	}
	if (extra.length > 0) style.extra = extra;
	return style;
}

/** Parse `fill:#fff,stroke:#000,color:#111,font-size:18px,font-family:Arial`. */
function parseStyleProps(propStr: string): NodeStyle {
	return parseProps<NodeStyle>(propStr, {
		fill: (v, s) => (s.fillColor = v),
		stroke: (v, s) => (s.strokeColor = v),
		color: (v, s) => (s.textColor = v),
		"font-size": (v, s) => parsePx(v, (n) => (s.fontSize = n)),
		"font-family": (v, s) => (s.fontFamily = v),
	});
}

/** Merge a `style <id> ...` property string into a node or group style. */
function applyStyleProps(target: { style?: NodeStyle }, propStr: string): void {
	const parsed = parseStyleProps(propStr);
	const style: NodeStyle = target.style ?? {};
	if (parsed.fillColor !== undefined) style.fillColor = parsed.fillColor;
	if (parsed.strokeColor !== undefined) style.strokeColor = parsed.strokeColor;
	if (parsed.textColor !== undefined) style.textColor = parsed.textColor;
	if (parsed.fontSize !== undefined) style.fontSize = parsed.fontSize;
	if (parsed.fontFamily !== undefined) style.fontFamily = parsed.fontFamily;
	if (parsed.extra && parsed.extra.length > 0) {
		style.extra = [...(style.extra ?? []), ...parsed.extra];
	}
	target.style = style;
}

/** Parse a `linkStyle` property string into an EdgeStyle. */
function parseEdgeStyleProps(propStr: string): EdgeStyle {
	return parseProps<EdgeStyle>(propStr, {
		stroke: (v, s) => (s.strokeColor = v),
		"stroke-width": (v, s) => parsePx(v, (n) => (s.strokeWidth = n)),
		color: (v, s) => (s.textColor = v),
		"font-size": (v, s) => parsePx(v, (n) => (s.fontSize = n)),
	});
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

/**
 * Split a line into statements on `;`, ignoring `;` inside double quotes,
 * shape delimiters (`[]`, `()`, `{}`), and edge pipe labels (`|...|`).
 */
function splitStatements(line: string): string[] {
	const stmts: string[] = [];
	let cur = "";
	let inQuote = false;
	let depth = 0;
	let inPipe = false;

	for (let i = 0; i < line.length; i++) {
		const ch = line[i]!;
		const prev = i > 0 ? line[i - 1] : "";

		if (ch === '"' && prev !== "\\") {
			inQuote = !inQuote;
		}

		if (!inQuote) {
			if (ch === "|" && depth === 0) {
				inPipe = !inPipe;
			} else if (!inPipe) {
				if (ch === "[" || ch === "(" || ch === "{") {
					depth++;
				} else if (ch === "]" || ch === ")" || ch === "}") {
					if (depth > 0) depth--;
				} else if (ch === ";" && depth === 0) {
					const stmt = cur.trim();
					if (stmt) stmts.push(stmt);
					cur = "";
					continue;
				}
			}
		}

		cur += ch;
	}

	const stmt = cur.trim();
	if (stmt) stmts.push(stmt);
	return stmts;
}

const KNOWN_LINK_OPS = [
	"<-->",
	"-.->",
	"-.-",
	"-->",
	"---",
	"==>",
	"===",
	"~~~",
] as const;

/**
 * Split a statement into alternating [nodeSegment, op, nodeSegment, op, ...]
 * pieces, ignoring operator substrings inside quotes, brackets, or pipe labels.
 */
function splitLinkPieces(stmt: string): string[] {
	const pieces: string[] = [];
	let cur = "";
	let inQuote = false;
	let depth = 0;
	let inPipe = false;
	let i = 0;

	while (i < stmt.length) {
		const ch = stmt[i]!;
		const prev = i > 0 ? stmt[i - 1] : "";

		if (ch === '"' && prev !== "\\") {
			inQuote = !inQuote;
			cur += ch;
			i++;
			continue;
		}

		if (!inQuote) {
			if (ch === "|" && depth === 0) {
				inPipe = !inPipe;
				cur += ch;
				i++;
				continue;
			}
			if (!inPipe) {
				if (ch === "[" || ch === "(" || ch === "{") {
					depth++;
					cur += ch;
					i++;
					continue;
				}
				if (ch === "]" || ch === ")" || ch === "}") {
					if (depth > 0) depth--;
					cur += ch;
					i++;
					continue;
				}
				if (depth === 0) {
					let matchedOp: string | null = null;
					for (const op of KNOWN_LINK_OPS) {
						if (stmt.startsWith(op, i)) {
							matchedOp = op;
							break;
						}
					}
					if (matchedOp) {
						pieces.push(cur.trim());
						pieces.push(matchedOp);
						cur = "";
						i += matchedOp.length;
						continue;
					}
				}
			}
		}

		cur += ch;
		i++;
	}

	pieces.push(cur.trim());
	return pieces;
}

/**
 * Split leading YAML frontmatter (Mermaid v10.5+) off the source and store it,
 * fences included, on `model.frontmatter`. Mermaid only accepts frontmatter as
 * the first content of a diagram, so it cannot round-trip through `extras`
 * (which is re-emitted at the end of the block). Recognized only when the
 * opening `---` is closed, which keeps the `---` link operator (`A --- B`)
 * out of it. Returns the lines left to parse.
 */
function takeFrontmatter(lines: string[], model: DiagramModel): string[] {
	let start = 0;
	while (start < lines.length && (lines[start] ?? "").trim() === "") start++;
	if ((lines[start] ?? "").trim() !== "---") return lines;
	for (let end = start + 1; end < lines.length; end++) {
		if ((lines[end] ?? "").trim() !== "---") continue;
		model.frontmatter = lines.slice(start, end + 1);
		return lines.slice(end + 1);
	}
	// Never closed, so not frontmatter — leave every line to the parser.
	return lines;
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
	const styleDirectives: Array<{ id: string; props: string }> = [];
	const classAssignments: Array<{ ids: string[]; className: string }> = [];
	const clickBindings: Array<{ id: string; target: string; raw: string }> = [];

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
		for (const c of token.classes ?? []) {
			if (!node.classes?.includes(c)) (node.classes ??= []).push(c);
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
		if (model.groups.some((g) => g.id === id) || groupStack.some((g) => g.id === id)) {
			id = newGroupId(model);
			title = rest || title;
		}
		const parent = groupStack[groupStack.length - 1];
		const group: DiagramGroup = { id, title, nodeIds: [] };
		if (parent) group.parentId = parent.id;
		model.groups.push(group);
		groupStack.push(group);
	};

	const rawLines = takeFrontmatter(
		text.replace(/\r\n/g, "\n").split("\n"),
		model,
	);
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

		// Other comments — keep them in current group scope or root extras.
		if (trimmed.startsWith("%%")) {
			const currentGroup = groupStack[groupStack.length - 1];
			if (currentGroup) {
				(currentGroup.extras ??= []).push(trimmed);
			} else {
				model.extras.push(trimmed);
			}
			continue;
		}

		// Split line into statements on `;`, ignoring `;` inside quotes or brackets.
		const stmts = splitStatements(trimmed);
		for (const stmt of stmts) {
			const header = stmt.match(HEADER_RE);
			if (header && header[1] !== undefined) {
				let dir = header[1].toUpperCase();
				if (dir === "TD") dir = "TB";
				model.direction = dir as Direction;
				headerSeen = true;
				continue;
			}

			// Subgraph open / close.
			const subMatch = stmt.match(/^subgraph\b\s*(.*)$/i);
			if (subMatch) {
				openGroup((subMatch[1] ?? "").trim());
				continue;
			}
			if (/^end$/i.test(stmt)) {
				groupStack.pop();
				continue;
			}

			// `direction <dir>` — if inside subgraph, apply to group; else diagram direction.
			const dirMatch = stmt.match(/^direction\s+(TB|TD|BT|LR|RL)\b/i);
			if (dirMatch && dirMatch[1] !== undefined) {
				let dir = dirMatch[1].toUpperCase();
				if (dir === "TD") dir = "TB";
				const currentGroup = groupStack[groupStack.length - 1];
				if (currentGroup) {
					currentGroup.direction = dir as Direction;
				} else {
					model.direction = dir as Direction;
					headerSeen = true;
				}
				continue;
			}

			// `style <id> prop:val,...` — collect; applied after parse to target node or group.
			const styleMatch = stmt.match(/^style\s+([A-Za-z0-9_]+)\s+(.+)$/i);
			if (styleMatch && styleMatch[1] && styleMatch[2]) {
				styleDirectives.push({ id: styleMatch[1], props: styleMatch[2] });
				continue;
			}

			// `linkStyle <i>[,<j>...] prop:val,...` — collect; applied after parse.
			const linkMatch = stmt.match(/^linkStyle\s+([\d,\s]+?)\s+(.+)$/i);
			if (linkMatch && linkMatch[1] && linkMatch[2]) {
				const props = linkMatch[2];
				for (const tok of linkMatch[1].split(/[,\s]+/)) {
					const n = parseInt(tok, 10);
					if (!Number.isNaN(n)) linkStyleDirectives.push({ index: n, props });
				}
				continue;
			}

			// `classDef name[,name2] prop:val,...` — named reusable styles.
			const classDefMatch = stmt.match(
				/^classDef\s+([A-Za-z0-9_-]+(?:\s*,\s*[A-Za-z0-9_-]+)*)\s+(.+)$/i,
			);
			if (classDefMatch && classDefMatch[1] && classDefMatch[2]) {
				const style = parseStyleProps(classDefMatch[2]);
				for (const rawName of classDefMatch[1].split(",")) {
					const name = rawName.trim();
					if (!name) continue;
					const existing = model.classDefs.find((c) => c.name === name);
					if (existing) existing.style = style;
					else model.classDefs.push({ name, style });
				}
				continue;
			}

			// `class A,B name` — assign a classDef to nodes or groups.
			const classMatch = stmt.match(
				/^class\s+([A-Za-z0-9_]+(?:\s*,\s*[A-Za-z0-9_]+)*)\s+([A-Za-z0-9_-]+)\s*$/i,
			);
			if (classMatch && classMatch[1] && classMatch[2]) {
				const className = classMatch[2];
				const ids = classMatch[1]
					.split(",")
					.map((id) => id.trim())
					.filter((id) => id.length > 0);
				if (ids.length > 0) {
					classAssignments.push({ ids, className });
				}
				continue;
			}

			// `click <id> "<target>"` / `click <id> href "<target>"` — a node hyperlink.
			if (/^click\b/i.test(stmt)) {
				const m = stmt.match(
					/^click\s+([A-Za-z0-9_]+)\s+(?:href\s+)?"([^"]*)"\s*;?\s*$/i,
				);
				if (m && m[1] && m[2]) {
					clickBindings.push({ id: m[1], target: m[2], raw: stmt });
				} else {
					const currentGroup = groupStack[groupStack.length - 1];
					if (currentGroup) (currentGroup.extras ??= []).push(stmt);
					else model.extras.push(stmt);
				}
				continue;
			}

			const currentGroup = groupStack[groupStack.length - 1];
			const targetExtras = currentGroup ? (currentGroup.extras ??= []) : model.extras;

			if (isStructuralLine(stmt)) {
				targetExtras.push(stmt);
				warnings.push(`Unsupported line kept as-is: "${stmt}"`);
				continue;
			}

			parseStatement(stmt, ensureNode, model.edges, warnings, targetExtras);
		}
	}

	if (!headerSeen && model.nodes.length === 0 && model.edges.length === 0) {
		warnings.push("No flowchart content detected.");
	}

	// Apply collected style directives (targeting groups or nodes)
	for (const { id, props } of styleDirectives) {
		const group = model.groups.find((g) => g.id === id);
		if (group) {
			applyStyleProps(group, props);
		} else {
			const node = ensureNode({ id });
			applyStyleProps(node, props);
		}
	}

	// Apply collected class assignments (targeting groups or nodes)
	for (const { ids, className } of classAssignments) {
		for (const id of ids) {
			const group = model.groups.find((g) => g.id === id);
			if (group) {
				if (!group.classes?.includes(className)) {
					(group.classes ??= []).push(className);
				}
			} else {
				const node = ensureNode({ id });
				if (!node.classes?.includes(className)) {
					(node.classes ??= []).push(className);
				}
			}
		}
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

	// Drop groups with no nodes in their entire subtree (keeps outer shells
	// that only contain nested subgraphs).
	model.groups = model.groups.filter((g) => groupSubtreeHasNodes(model, g.id));

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

	// Apply collected click bindings as node hyperlinks. A binding whose target
	// node never appeared keeps its original line in extras (never dropped).
	for (const { id, target, raw } of clickBindings) {
		const node = nodeMap.get(id);
		if (node) node.link = target;
		else model.extras.push(raw);
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
	const pieces = splitLinkPieces(normalized);

	if (pieces.length === 1) {
		// No link operator: standalone node declaration(s), possibly `A & B`.
		const rawSegment = pieces[0] ?? "";
		const segments = splitMultiNodes(rawSegment);
		const tokens = segments
			.map((t) => parseNodeToken(t))
			.filter((t): t is ParsedToken => t !== null);
		if (tokens.length > 0 && tokens.length === segments.length) {
			for (const token of tokens) ensureNode(token);
		} else {
			extras.push(stmt);
			warnings.push(`Could not parse: "${stmt}"`);
		}
		return;
	}

	// pieces = [node, op, node, op, node, ...]
	let prevNodes: DiagramNode[] = [];
	let pendingOp: string | null = null;

	for (let i = 0; i < pieces.length; i++) {
		const piece = pieces[i] ?? "";
		const isOp = i % 2 === 1;

		if (isOp) {
			pendingOp = piece;
			continue;
		}

		// Node piece. It may carry a leading pipe-label belonging to the
		// previous operator: `|label| B` or `|"label"| B`.
		let label = "";
		let nodePart = piece;
		if (piece.startsWith("|")) {
			let inQ = false;
			let closeIdx = -1;
			for (let j = 1; j < piece.length; j++) {
				const ch = piece[j]!;
				const prev = piece[j - 1]!;
				if (ch === '"' && prev !== "\\") {
					inQ = !inQ;
				} else if (ch === "|" && !inQ) {
					closeIdx = j;
					break;
				}
			}
			if (closeIdx !== -1) {
				label = stripQuotes(piece.slice(1, closeIdx));
				nodePart = piece.slice(closeIdx + 1).trim();
			}
		}

		// A segment may name several nodes joined with `&` (`A & B --> C`).
		const tokens = splitMultiNodes(nodePart)
			.map((t) => t.trim())
			.filter((t) => t.length > 0);
		if (tokens.length === 0) {
			extras.push(stmt);
			warnings.push(`Could not parse node "${nodePart}" in "${stmt}"`);
			return;
		}
		const currentNodes: DiagramNode[] = [];
		for (const tk of tokens) {
			const token = parseNodeToken(tk);
			if (!token) {
				extras.push(stmt);
				warnings.push(`Could not parse node "${tk}" in "${stmt}"`);
				return;
			}
			currentNodes.push(ensureNode(token));
		}

		if (prevNodes.length > 0 && pendingOp) {
			// `A & B --> C & D` connects every left node to every right node.
			for (const from of prevNodes) {
				for (const to of currentNodes) {
					edges.push({
						id: newEdgeId(),
						from: from.id,
						to: to.id,
						label,
						kind: opToKind(pendingOp),
					});
				}
			}
		}

		prevNodes = currentNodes;
		pendingOp = null;
	}
}
