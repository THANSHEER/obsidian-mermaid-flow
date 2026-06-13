/*
 * The internal diagram model. This is the single source of truth the visual
 * editor manipulates. It is converted to/from Mermaid text by parser.ts and
 * serializer.ts.
 */

export type Direction = "TB" | "BT" | "LR" | "RL";

export const DIRECTIONS: Direction[] = ["TB", "BT", "LR", "RL"];

export const DIRECTION_LABELS: Record<Direction, string> = {
	TB: "Top to bottom",
	BT: "Bottom to top",
	LR: "Left to right",
	RL: "Right to left",
};

export type NodeShape =
	| "rect"
	| "round"
	| "stadium"
	| "subroutine"
	| "cylinder"
	| "circle"
	| "double-circle"
	| "diamond"
	| "hexagon"
	| "parallelogram"
	| "parallelogram-alt"
	| "trapezoid"
	| "trapezoid-alt"
	| "asymmetric";

export const NODE_SHAPES: NodeShape[] = [
	"rect",
	"round",
	"stadium",
	"subroutine",
	"cylinder",
	"circle",
	"double-circle",
	"diamond",
	"hexagon",
	"parallelogram",
	"parallelogram-alt",
	"trapezoid",
	"trapezoid-alt",
	"asymmetric",
];

export const SHAPE_LABELS: Record<NodeShape, string> = {
	rect: "Rectangle",
	round: "Rounded",
	stadium: "Stadium",
	subroutine: "Subroutine",
	cylinder: "Cylinder / database",
	circle: "Circle",
	"double-circle": "Double circle",
	diamond: "Decision",
	hexagon: "Hexagon",
	parallelogram: "Parallelogram",
	"parallelogram-alt": "Parallelogram (alt)",
	trapezoid: "Trapezoid",
	"trapezoid-alt": "Trapezoid (alt)",
	asymmetric: "Asymmetric",
};

export type EdgeKind =
	| "arrow"
	| "open"
	| "dotted"
	| "thick"
	| "bidirectional"
	| "invisible";

export const EDGE_KINDS: EdgeKind[] = [
	"arrow",
	"open",
	"dotted",
	"thick",
	"bidirectional",
	"invisible",
];

export const EDGE_LABELS: Record<EdgeKind, string> = {
	arrow: "Arrow",
	open: "Open line",
	dotted: "Dotted",
	thick: "Thick",
	bidirectional: "Bidirectional",
	invisible: "Invisible",
};

export interface NodeStyle {
	fillColor?: string;
	strokeColor?: string;
	textColor?: string;
	fontSize?: number;
	fontFamily?: string;
	/** Any style props we don't model explicitly, kept verbatim (e.g. stroke-width). */
	extra?: string[];
}

export interface EdgeStyle {
	strokeColor?: string;
	strokeWidth?: number;
	textColor?: string;
	fontSize?: number;
	extra?: string[];
}

/** A Mermaid classDef: a named, reusable node style (`classDef hot fill:#f96`). */
export interface ClassDef {
	name: string;
	/** Unknown props are preserved verbatim in style.extra for round-trip. */
	style: NodeStyle;
}

export interface DiagramNode {
	id: string;
	label: string;
	shape: NodeShape;
	x: number;
	y: number;
	/** Manual size overrides (editor hint; auto-sized from the label when unset). */
	w?: number;
	h?: number;
	style?: NodeStyle;
	/** classDef names assigned via `class A name` / `A:::name` — order matters. */
	classes?: string[];
	/** When true the node cannot be dragged on the canvas. */
	locked?: boolean;
}

/** A Mermaid `subgraph` — a labelled container grouping member nodes. */
export interface DiagramGroup {
	id: string;
	title: string;
	nodeIds: string[];
}

/** Diagram-level Mermaid config, emitted as a `%%{init: …}%%` directive. */
export interface DiagramConfig {
	theme?: string;
	/** Diagram background colour; undefined = transparent. Emitted as themeVariables.background. */
	background?: string;
	themeVariables?: Record<string, string>;
	nodeSpacing?: number;
	rankSpacing?: number;
}

export function hasConfig(cfg: DiagramConfig | undefined): boolean {
	if (!cfg) return false;
	return (
		cfg.theme !== undefined ||
		cfg.background !== undefined ||
		cfg.nodeSpacing !== undefined ||
		cfg.rankSpacing !== undefined ||
		(cfg.themeVariables !== undefined &&
			Object.keys(cfg.themeVariables).length > 0)
	);
}

export function hasStyle(style: NodeStyle | undefined): boolean {
	if (!style) return false;
	return (
		style.fillColor !== undefined ||
		style.strokeColor !== undefined ||
		style.textColor !== undefined ||
		style.fontSize !== undefined ||
		style.fontFamily !== undefined ||
		(style.extra !== undefined && style.extra.length > 0)
	);
}

export function hasEdgeStyle(style: EdgeStyle | undefined): boolean {
	if (!style) return false;
	return (
		style.strokeColor !== undefined ||
		style.strokeWidth !== undefined ||
		style.textColor !== undefined ||
		style.fontSize !== undefined ||
		(style.extra !== undefined && style.extra.length > 0)
	);
}

export interface DiagramEdge {
	id: string;
	from: string;
	to: string;
	label: string;
	kind: EdgeKind;
	style?: EdgeStyle;
	/** Show a marching-ants CSS animation on the edge line. */
	animated?: boolean;
}

export interface DiagramModel {
	direction: Direction;
	nodes: DiagramNode[];
	edges: DiagramEdge[];
	groups: DiagramGroup[];
	config: DiagramConfig;
	/** Named reusable styles (`classDef`), in declaration order. */
	classDefs: ClassDef[];
	/**
	 * Lines from the original Mermaid source that we do not understand
	 * (click bindings, malformed directives, ...). We round-trip these
	 * untouched so the visual editor never destroys advanced syntax.
	 */
	extras: string[];
}

export function emptyModel(direction: Direction = "TB"): DiagramModel {
	return {
		direction,
		nodes: [],
		edges: [],
		groups: [],
		config: {},
		classDefs: [],
		extras: [],
	};
}

export function starterModel(direction: Direction = "TB"): DiagramModel {
	return {
		direction,
		nodes: [{ id: "A", label: "Start", shape: "round", x: 80, y: 60 }],
		edges: [],
		groups: [],
		config: {},
		classDefs: [],
		extras: [],
	};
}

/**
 * Effective render style for a node. Per-property merge, lowest to highest
 * precedence: theme CSS defaults (returned undefined keeps them) <
 * `classDef default` < the node's classes in assignment order (later class
 * wins per property) < the node's explicit `style` (style line / panel edits).
 * `extra` props are round-trip-only and never merged.
 */
export function resolveNodeStyle(
	model: DiagramModel,
	node: DiagramNode,
): NodeStyle | undefined {
	const byName = new Map(model.classDefs.map((c) => [c.name, c.style]));
	const layers: Array<NodeStyle | undefined> = [byName.get("default")];
	for (const name of node.classes ?? []) layers.push(byName.get(name));
	layers.push(node.style);

	const merged: NodeStyle = {};
	for (const layer of layers) {
		if (!layer) continue;
		if (layer.fillColor !== undefined) merged.fillColor = layer.fillColor;
		if (layer.strokeColor !== undefined) merged.strokeColor = layer.strokeColor;
		if (layer.textColor !== undefined) merged.textColor = layer.textColor;
		if (layer.fontSize !== undefined) merged.fontSize = layer.fontSize;
		if (layer.fontFamily !== undefined) merged.fontFamily = layer.fontFamily;
	}
	return Object.keys(merged).length > 0 ? merged : undefined;
}

export function findNode(
	model: DiagramModel,
	id: string,
): DiagramNode | undefined {
	return model.nodes.find((n) => n.id === id);
}

/** Generate a node id that does not collide with existing nodes. */
export function nextNodeId(model: DiagramModel): string {
	const used = new Set(model.nodes.map((n) => n.id));
	// Try single uppercase letters first (A, B, C, ...), then N1, N2, ...
	for (let i = 0; i < 26; i++) {
		const id = String.fromCharCode(65 + i);
		if (!used.has(id)) return id;
	}
	let n = 1;
	while (used.has(`N${n}`)) n++;
	return `N${n}`;
}

let edgeCounter = 0;
export function newEdgeId(): string {
	edgeCounter += 1;
	return `e${edgeCounter}-${Date.now().toString(36)}`;
}

export function removeNode(model: DiagramModel, id: string): void {
	model.nodes = model.nodes.filter((n) => n.id !== id);
	model.edges = model.edges.filter((e) => e.from !== id && e.to !== id);
	for (const g of model.groups) {
		g.nodeIds = g.nodeIds.filter((nid) => nid !== id);
	}
}

let groupCounter = 0;
export function newGroupId(model: DiagramModel): string {
	const used = new Set(model.groups.map((g) => g.id));
	let n = ++groupCounter;
	while (used.has(`sub${n}`)) n++;
	groupCounter = n;
	return `sub${n}`;
}

export function groupOf(
	model: DiagramModel,
	nodeId: string,
): DiagramGroup | undefined {
	return model.groups.find((g) => g.nodeIds.includes(nodeId));
}

/** Move a node into `groupId`, or remove it from any group when null. */
export function assignNodeToGroup(
	model: DiagramModel,
	nodeId: string,
	groupId: string | null,
): void {
	for (const g of model.groups) {
		g.nodeIds = g.nodeIds.filter((id) => id !== nodeId);
	}
	if (groupId) {
		const g = model.groups.find((gr) => gr.id === groupId);
		if (g && !g.nodeIds.includes(nodeId)) g.nodeIds.push(nodeId);
	}
}

/** Delete a group but keep its member nodes (ungroup). */
export function removeGroup(model: DiagramModel, groupId: string): void {
	model.groups = model.groups.filter((g) => g.id !== groupId);
}

export function removeEdge(model: DiagramModel, id: string): void {
	model.edges = model.edges.filter((e) => e.id !== id);
}

/** Copy a node (label + shape) to a new id offset slightly. Returns new id. */
export function duplicateNode(
	model: DiagramModel,
	id: string,
): string | null {
	const src = findNode(model, id);
	if (!src) return null;
	const newId = nextNodeId(model);
	model.nodes.push({
		id: newId,
		label: src.label,
		shape: src.shape,
		x: src.x + 40,
		y: src.y + 40,
		w: src.w,
		h: src.h,
		style: src.style ? { ...src.style, extra: src.style.extra ? [...src.style.extra] : undefined } : undefined,
		classes: src.classes ? [...src.classes] : undefined,
	});
	return newId;
}

/** Move a node to the end of the nodes array (rendered on top). */
export function bringToFront(model: DiagramModel, id: string): void {
	const idx = model.nodes.findIndex((n) => n.id === id);
	if (idx < 0 || idx === model.nodes.length - 1) return;
	const [node] = model.nodes.splice(idx, 1);
	if (node) model.nodes.push(node);
}

/** Move a node to the start of the nodes array (rendered at back). */
export function sendToBack(model: DiagramModel, id: string): void {
	const idx = model.nodes.findIndex((n) => n.id === id);
	if (idx <= 0) return;
	const [node] = model.nodes.splice(idx, 1);
	if (node) model.nodes.unshift(node);
}

/** Deep clone so the editor can discard changes on cancel. */
export function cloneModel(model: DiagramModel): DiagramModel {
	return {
		direction: model.direction,
		nodes: model.nodes.map((n) => ({
			...n,
			style: n.style
				? { ...n.style, extra: n.style.extra ? [...n.style.extra] : undefined }
				: undefined,
			classes: n.classes ? [...n.classes] : undefined,
		})),
		edges: model.edges.map((e) => ({
			...e,
			animated: e.animated,
			style: e.style
				? { ...e.style, extra: e.style.extra ? [...e.style.extra] : undefined }
				: undefined,
		})),
		groups: model.groups.map((g) => ({ ...g, nodeIds: [...g.nodeIds] })),
		classDefs: model.classDefs.map((c) => ({
			name: c.name,
			style: { ...c.style, extra: c.style.extra ? [...c.style.extra] : undefined },
		})),
		config: {
			...model.config,
			themeVariables: model.config.themeVariables
				? { ...model.config.themeVariables }
				: undefined,
		},
		extras: [...model.extras],
	};
}
