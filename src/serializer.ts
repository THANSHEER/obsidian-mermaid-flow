/*
 * DiagramModel -> Mermaid flowchart text.
 *
 * Output shape:
 *   flowchart LR
 *       A["Start"]
 *       B{"Decision"}
 *       A --> B
 *       %% mermaid-flow:pos A=80,60 B=240,60
 */

import {
	DiagramConfig,
	DiagramEdge,
	DiagramModel,
	DiagramNode,
	EdgeKind,
	hasConfig,
	hasEdgeStyle,
	hasStyle,
} from "./model";

const INDENT = "    ";

/** Wrap a label so Mermaid treats spaces/punctuation safely. */
function quoteLabel(label: string): string {
	// Collapse newlines (a multi-line label would split the single-line Mermaid
	// statement) and escape embedded double quotes with the entity Mermaid
	// understands — together this keeps a label from breaking out of its node.
	const safe = label.replace(/\r?\n/g, " ").replace(/"/g, "&quot;");
	return `"${safe}"`;
}

/**
 * Mermaid node/subgraph identifiers must be alphanumeric or underscore. IDs are
 * generated internally (see `nextNodeId`) and parsed from a restricted charset,
 * so this is defense-in-depth: it guarantees an id can never carry extra Mermaid
 * tokens into the output, even if a malformed id ever reaches the serializer.
 */
function sanitizeId(id: string): string {
	const safe = id.replace(/[^A-Za-z0-9_]/g, "_");
	return safe.length > 0 ? safe : "_";
}

function nodeDeclaration(node: DiagramNode): string {
	const label = quoteLabel(node.label);
	const id = sanitizeId(node.id);
	switch (node.shape) {
		case "round":
			return `${id}(${label})`;
		case "stadium":
			return `${id}([${label}])`;
		case "subroutine":
			return `${id}[[${label}]]`;
		case "cylinder":
			return `${id}[(${label})]`;
		case "circle":
			return `${id}((${label}))`;
		case "double-circle":
			return `${id}(((${label})))`;
		case "diamond":
			return `${id}{${label}}`;
		case "hexagon":
			return `${id}{{${label}}}`;
		case "parallelogram":
			return `${id}[/${label}/]`;
		case "parallelogram-alt":
			return `${id}[\\${label}\\]`;
		case "trapezoid":
			return `${id}[/${label}\\]`;
		case "trapezoid-alt":
			return `${id}[\\${label}/]`;
		case "asymmetric":
			return `${id}>${label}]`;
		case "rect":
		default:
			return `${id}[${label}]`;
	}
}

function edgeOperator(kind: EdgeKind): string {
	switch (kind) {
		case "open":
			return "---";
		case "dotted":
			return "-.->";
		case "thick":
			return "==>";
		case "bidirectional":
			return "<-->";
		case "invisible":
			return "~~~";
		case "arrow":
		default:
			return "-->";
	}
}

function edgeLine(edge: DiagramEdge): string {
	const op = edgeOperator(edge.kind);
	const from = sanitizeId(edge.from);
	const to = sanitizeId(edge.to);
	// Invisible links carry no label in Mermaid.
	if (edge.kind !== "invisible" && edge.label && edge.label.trim() !== "") {
		return `${from} ${op}|${quoteLabel(edge.label)}| ${to}`;
	}
	return `${from} ${op} ${to}`;
}

function styleLine(node: DiagramNode): string | null {
	const s = node.style;
	if (!hasStyle(s) || !s) return null;
	const props: string[] = [];
	if (s.fillColor) props.push(`fill:${s.fillColor}`);
	if (s.strokeColor) props.push(`stroke:${s.strokeColor}`);
	if (s.textColor) props.push(`color:${s.textColor}`);
	if (s.fontSize) props.push(`font-size:${s.fontSize}px`);
	if (s.fontFamily) props.push(`font-family:${s.fontFamily}`);
	if (s.extra) props.push(...s.extra);
	if (props.length === 0) return null;
	return `style ${sanitizeId(node.id)} ${props.join(",")}`;
}

function linkStyleLine(edge: DiagramEdge, index: number): string | null {
	const s = edge.style;
	if (!hasEdgeStyle(s) || !s) return null;
	const props: string[] = [];
	if (s.strokeColor) props.push(`stroke:${s.strokeColor}`);
	if (s.strokeWidth) props.push(`stroke-width:${s.strokeWidth}px`);
	if (s.textColor) props.push(`color:${s.textColor}`);
	if (s.fontSize) props.push(`font-size:${s.fontSize}px`);
	if (s.extra) props.push(...s.extra);
	if (props.length === 0) return null;
	return `linkStyle ${index} ${props.join(",")}`;
}

function configDirective(cfg: DiagramConfig): string | null {
	if (!hasConfig(cfg)) return null;
	const init: Record<string, unknown> = {};
	if (cfg.theme) init.theme = cfg.theme;
	if (cfg.themeVariables && Object.keys(cfg.themeVariables).length > 0) {
		init.themeVariables = cfg.themeVariables;
	}
	const fc: Record<string, number> = {};
	if (cfg.nodeSpacing !== undefined) fc.nodeSpacing = cfg.nodeSpacing;
	if (cfg.rankSpacing !== undefined) fc.rankSpacing = cfg.rankSpacing;
	if (Object.keys(fc).length > 0) init.flowchart = fc;
	if (Object.keys(init).length === 0) return null;
	return `%%{init: ${JSON.stringify(init)}}%%`;
}

function positionComment(model: DiagramModel): string | null {
	const parts = model.nodes
		.filter((n) => Number.isFinite(n.x) && Number.isFinite(n.y))
		.map((n) => {
			const base = `${sanitizeId(n.id)}=${Math.round(n.x)},${Math.round(n.y)}`;
			if (n.w && n.h) return `${base},${Math.round(n.w)},${Math.round(n.h)}`;
			return base;
		});
	if (parts.length === 0) return null;
	return `%% mermaid-flow:pos ${parts.join(" ")}`;
}

export interface SerializeOptions {
	includePositions?: boolean;
}

/** Serialize just the inner Mermaid code (no fences). */
export function modelToMermaid(
	model: DiagramModel,
	opts: SerializeOptions = {},
): string {
	const includePositions = opts.includePositions ?? true;
	const lines: string[] = [];
	const directive = configDirective(model.config);
	if (directive) lines.push(directive);
	lines.push(`flowchart ${model.direction}`);

	const nodeById = new Map(model.nodes.map((n) => [n.id, n]));
	const grouped = new Set<string>();

	// Subgraphs first, declaring their member nodes inside.
	for (const group of model.groups) {
		const members = group.nodeIds.filter((id) => nodeById.has(id));
		if (members.length === 0) continue;
		const title = group.title && group.title !== group.id
			? ` [${quoteLabel(group.title)}]`
			: "";
		lines.push(`${INDENT}subgraph ${sanitizeId(group.id)}${title}`);
		for (const id of members) {
			grouped.add(id);
			const node = nodeById.get(id);
			if (node) lines.push(INDENT + INDENT + nodeDeclaration(node));
		}
		lines.push(`${INDENT}end`);
	}

	// Remaining (ungrouped) nodes.
	for (const node of model.nodes) {
		if (grouped.has(node.id)) continue;
		lines.push(INDENT + nodeDeclaration(node));
	}

	for (const edge of model.edges) {
		lines.push(INDENT + edgeLine(edge));
	}

	for (const node of model.nodes) {
		const sl = styleLine(node);
		if (sl) lines.push(INDENT + sl);
	}

	model.edges.forEach((edge, i) => {
		const ls = linkStyleLine(edge, i);
		if (ls) lines.push(INDENT + ls);
	});

	for (const extra of model.extras) {
		lines.push(INDENT + extra);
	}

	if (includePositions) {
		const pos = positionComment(model);
		if (pos) lines.push(INDENT + pos);
	}

	return lines.join("\n");
}

/** Serialize a full fenced ```mermaid block. */
export function modelToFencedBlock(
	model: DiagramModel,
	opts: SerializeOptions = {},
): string {
	return "```mermaid\n" + modelToMermaid(model, opts) + "\n```";
}
