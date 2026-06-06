/*
 * The SVG visual editor surface. Renders the DiagramModel as draggable nodes
 * and connecting edges, and handles all pointer interaction (select, drag,
 * connect). It mutates the model in place and notifies the owner via callbacks.
 *
 * node.x / node.y are treated as the CENTRE of each node.
 */

import {
	DiagramEdge,
	DiagramModel,
	DiagramNode,
	EdgeKind,
	newEdgeId,
} from "./model";
import { createShapeElements } from "./shapes";

const SVG_NS = "http://www.w3.org/2000/svg";

function clearChildren(el: Element): void {
	while (el.firstChild) el.removeChild(el.firstChild);
}

export type EditorMode = "select" | "connect";

export type Selection =
	| { type: "node"; id: string }
	| { type: "edge"; id: string }
	| { type: "group"; id: string }
	| null;

export interface CanvasCallbacks {
	onSelect: (sel: Selection) => void;
	onChange: () => void;
	onContextMenu?: (event: MouseEvent) => void;
}

interface Geom {
	w: number;
	h: number;
}

const NODE_H = 44;
const MIN_W = 80;
const PADDING = 80;
const CHAR_W = 8.2;

export class DiagramCanvas {
	private model: DiagramModel;
	private callbacks: CanvasCallbacks;

	private scroller: HTMLElement;
	private svg: SVGSVGElement;
	private groupLayer: SVGGElement;
	private edgeLayer: SVGGElement;
	private nodeLayer: SVGGElement;
	private overlayLayer: SVGGElement;

	private mode: EditorMode = "select";
	private selection: Selection = null;

	private geomCache = new Map<string, Geom>();

	// drag state (delta-based)
	private dragId: string | null = null;
	private dragLast = { x: 0, y: 0 };

	// multi-selection
	private multi = new Set<string>();

	// rubber-band selection
	private rubber: { x0: number; y0: number } | null = null;
	private rubberRect: SVGRectElement | null = null;
	private rubberMoved = false;

	// resize
	private resizeId: string | null = null;

	// connect state
	private connectFrom: string | null = null;
	private ghostLine: SVGLineElement | null = null;

	// drag-to-connect (from a hover anchor)
	private linkFrom: string | null = null;

	// group (subgraph) drag
	private groupDragId: string | null = null;
	private groupDragLast = { x: 0, y: 0 };

	constructor(
		parent: HTMLElement,
		model: DiagramModel,
		callbacks: CanvasCallbacks,
	) {
		this.model = model;
		this.callbacks = callbacks;

		this.scroller = parent.createDiv({ cls: "mermaid-flow-canvas-scroll" });
		this.svg = activeDocument.createElementNS(SVG_NS, "svg");
		this.svg.classList.add("mermaid-flow-svg");
		this.scroller.appendChild(this.svg);

		this.buildDefs();
		this.groupLayer = activeDocument.createElementNS(SVG_NS, "g");
		this.edgeLayer = activeDocument.createElementNS(SVG_NS, "g");
		this.nodeLayer = activeDocument.createElementNS(SVG_NS, "g");
		this.overlayLayer = activeDocument.createElementNS(SVG_NS, "g");
		this.svg.appendChild(this.groupLayer);
		this.svg.appendChild(this.edgeLayer);
		this.svg.appendChild(this.nodeLayer);
		this.svg.appendChild(this.overlayLayer);

		this.svg.addEventListener("pointerdown", (e) => this.onBackgroundDown(e));
		this.svg.addEventListener("pointermove", (e) => this.onPointerMove(e));
		this.svg.addEventListener("pointerup", (e) => this.onPointerUp(e));

		this.render();
	}

	setModel(model: DiagramModel): void {
		this.model = model;
		this.selection = null;
		this.connectFrom = null;
		this.linkFrom = null;
		this.groupDragId = null;
		this.resizeId = null;
		this.multi.clear();
		this.render();
	}

	getMultiSelection(): string[] {
		return [...this.multi];
	}

	/** The current rendered size of a node (manual override or auto-computed). */
	effectiveSize(id: string): { w: number; h: number } {
		const node = this.model.nodes.find((n) => n.id === id);
		if (!node) return { w: 80, h: 44 };
		const g = this.geom(node);
		return { w: Math.round(g.w), h: Math.round(g.h) };
	}

	setMode(mode: EditorMode): void {
		this.mode = mode;
		this.connectFrom = null;
		this.clearGhost();
		this.render();
	}

	getMode(): EditorMode {
		return this.mode;
	}

	getSelection(): Selection {
		return this.selection;
	}

	getSVG(): SVGSVGElement {
		return this.svg;
	}

	/** Public select: also clears any multi-selection. */
	select(sel: Selection): void {
		this.multi.clear();
		this.setSelection(sel);
	}

	private setSelection(sel: Selection): void {
		this.selection = sel;
		this.callbacks.onSelect(sel);
		this.render();
	}

	destroy(): void {
		this.scroller.remove();
	}

	// --- geometry -----------------------------------------------------------

	private geom(node: DiagramNode): Geom {
		if (node.w && node.h) {
			const g = { w: node.w, h: node.h };
			this.geomCache.set(node.id, g);
			return g;
		}
		const text = node.label || node.id;
		let w = Math.max(MIN_W, Math.round(text.length * CHAR_W) + 32);
		let h = NODE_H;
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
		const g = { w, h };
		this.geomCache.set(node.id, g);
		return g;
	}

	private borderPoint(
		node: DiagramNode,
		towardX: number,
		towardY: number,
	): { x: number; y: number } {
		const g = this.geomCache.get(node.id) ?? this.geom(node);
		const dx = towardX - node.x;
		const dy = towardY - node.y;
		if (dx === 0 && dy === 0) return { x: node.x, y: node.y };
		const hw = g.w / 2;
		const hh = g.h / 2;
		const scaleX = dx !== 0 ? hw / Math.abs(dx) : Infinity;
		const scaleY = dy !== 0 ? hh / Math.abs(dy) : Infinity;
		const scale = Math.min(scaleX, scaleY);
		return { x: node.x + dx * scale, y: node.y + dy * scale };
	}

	// --- rendering ----------------------------------------------------------

	render(): void {
		// Pre-compute geometry so edge math has node sizes available.
		for (const node of this.model.nodes) this.geom(node);

		this.resizeCanvas();
		this.renderGroups();
		this.renderEdges();
		this.renderNodes();
	}

	private static readonly GROUP_PAD = 26;
	private static readonly GROUP_TITLE_H = 24;

	private renderGroups(): void {
		clearChildren(this.groupLayer);
		const byId = new Map(this.model.nodes.map((n) => [n.id, n]));
		for (const grp of this.model.groups) {
			const members = grp.nodeIds
				.map((id) => byId.get(id))
				.filter((n): n is DiagramNode => !!n);
			if (members.length === 0) continue;

			let minX = Infinity;
			let minY = Infinity;
			let maxX = -Infinity;
			let maxY = -Infinity;
			for (const node of members) {
				const g = this.geomCache.get(node.id) ?? this.geom(node);
				minX = Math.min(minX, node.x - g.w / 2);
				minY = Math.min(minY, node.y - g.h / 2);
				maxX = Math.max(maxX, node.x + g.w / 2);
				maxY = Math.max(maxY, node.y + g.h / 2);
			}
			const pad = DiagramCanvas.GROUP_PAD;
			const titleH = DiagramCanvas.GROUP_TITLE_H;
			const bx = minX - pad;
			const by = minY - pad - titleH;
			const bw = maxX - minX + pad * 2;
			const bh = maxY - minY + pad * 2 + titleH;

			const g = activeDocument.createElementNS(SVG_NS, "g");
			g.classList.add("mermaid-flow-group");
			if (this.selection?.type === "group" && this.selection.id === grp.id) {
				g.classList.add("is-selected");
			}

			const box = activeDocument.createElementNS(SVG_NS, "rect");
			box.setAttribute("x", String(bx));
			box.setAttribute("y", String(by));
			box.setAttribute("width", String(bw));
			box.setAttribute("height", String(bh));
			box.setAttribute("rx", "8");
			box.classList.add("mermaid-flow-group-box");

			const header = activeDocument.createElementNS(SVG_NS, "rect");
			header.setAttribute("x", String(bx));
			header.setAttribute("y", String(by));
			header.setAttribute("width", String(bw));
			header.setAttribute("height", String(titleH));
			header.setAttribute("rx", "8");
			header.classList.add("mermaid-flow-group-header");

			const title = activeDocument.createElementNS(SVG_NS, "text");
			title.setAttribute("x", String(bx + 10));
			title.setAttribute("y", String(by + titleH / 2));
			title.setAttribute("dominant-baseline", "central");
			title.classList.add("mermaid-flow-group-title");
			title.textContent = grp.title || grp.id;

			g.appendChild(box);
			g.appendChild(header);
			g.appendChild(title);

			header.addEventListener("pointerdown", (e) =>
				this.onGroupHeaderDown(e, grp.id),
			);
			title.addEventListener("pointerdown", (e) =>
				this.onGroupHeaderDown(e, grp.id),
			);
			header.addEventListener("contextmenu", (e) =>
				this.onGroupContext(e, grp.id),
			);
			this.groupLayer.appendChild(g);
		}
	}

	private resizeCanvas(): void {
		let maxX = 600;
		let maxY = 400;
		for (const node of this.model.nodes) {
			const g = this.geomCache.get(node.id) ?? this.geom(node);
			maxX = Math.max(maxX, node.x + g.w / 2);
			maxY = Math.max(maxY, node.y + g.h / 2);
		}
		const w = Math.round(maxX + PADDING);
		const h = Math.round(maxY + PADDING);
		this.svg.setAttribute("width", String(w));
		this.svg.setAttribute("height", String(h));
		this.svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
	}

	private renderNodes(): void {
		clearChildren(this.nodeLayer);
		for (const node of this.model.nodes) {
			const g = this.geomCache.get(node.id) ?? this.geom(node);
			const group = activeDocument.createElementNS(SVG_NS, "g");
			group.classList.add("mermaid-flow-node");
			const isSelected =
				this.selection?.type === "node" && this.selection.id === node.id;
			if (isSelected) group.classList.add("is-selected");
			if (this.multi.has(node.id)) group.classList.add("is-multi");
			if (this.connectFrom === node.id) {
				group.classList.add("is-connect-source");
			}

			for (const el of createShapeElements(node.shape, node.x, node.y, g.w, g.h)) {
				el.classList.add("mermaid-flow-shape");
				this.applyShapeStyle(el, node);
				group.appendChild(el);
			}
			group.appendChild(this.nodeLabel(node));
			this.appendAnchors(group, node, g);

			// Resize handle on the single-selected node.
			if (isSelected && this.multi.size === 0) {
				const handle = activeDocument.createElementNS(SVG_NS, "rect");
				const hs = 9;
				handle.setAttribute("x", String(node.x + g.w / 2 - hs / 2));
				handle.setAttribute("y", String(node.y + g.h / 2 - hs / 2));
				handle.setAttribute("width", String(hs));
				handle.setAttribute("height", String(hs));
				handle.classList.add("mermaid-flow-resize");
				handle.addEventListener("pointerdown", (e) =>
					this.onResizeDown(e, node.id),
				);
				group.appendChild(handle);
			}

			group.addEventListener("pointerdown", (e) =>
				this.onNodeDown(e, node.id),
			);
			group.addEventListener("contextmenu", (e) =>
				this.onNodeContext(e, node.id),
			);
			this.nodeLayer.appendChild(group);
		}
	}

	private applyShapeStyle(el: SVGElement, node: DiagramNode): void {
		const s = node.style;
		if (!s) return;
		if (s.fillColor && el.getAttribute("fill") !== "none") {
			el.setAttribute("fill", s.fillColor);
		}
		if (s.strokeColor) {
			el.setAttribute("stroke", s.strokeColor);
		}
	}

	private nodeLabel(node: DiagramNode): SVGTextElement {
		const text = activeDocument.createElementNS(SVG_NS, "text");
		text.setAttribute("x", String(node.x));
		text.setAttribute("y", String(node.y));
		text.setAttribute("text-anchor", "middle");
		text.setAttribute("dominant-baseline", "central");
		text.classList.add("mermaid-flow-node-label");
		text.textContent = node.label || node.id;
		const s = node.style;
		if (s?.textColor) text.setAttribute("fill", s.textColor);
		if (s?.fontSize) text.setAttribute("font-size", `${s.fontSize}px`);
		if (s?.fontFamily) text.setAttribute("font-family", s.fontFamily);
		return text;
	}

	/** Border-midpoint handles, shown on hover, used to drag out new edges. */
	private appendAnchors(group: SVGGElement, node: DiagramNode, g: Geom): void {
		const hw = g.w / 2;
		const hh = g.h / 2;
		const points: Array<[number, number]> = [
			[node.x, node.y - hh],
			[node.x + hw, node.y],
			[node.x, node.y + hh],
			[node.x - hw, node.y],
		];
		for (const [ax, ay] of points) {
			const dot = activeDocument.createElementNS(SVG_NS, "circle");
			dot.setAttribute("cx", String(ax));
			dot.setAttribute("cy", String(ay));
			dot.setAttribute("r", "5");
			dot.classList.add("mermaid-flow-anchor");
			dot.addEventListener("pointerdown", (e) => this.onAnchorDown(e, node.id));
			group.appendChild(dot);
		}
	}

	private renderEdges(): void {
		clearChildren(this.edgeLayer);
		const nodeById = new Map(this.model.nodes.map((n) => [n.id, n]));
		for (const edge of this.model.edges) {
			const from = nodeById.get(edge.from);
			const to = nodeById.get(edge.to);
			if (!from || !to) continue;

			const start = this.borderPoint(from, to.x, to.y);
			const end = this.borderPoint(to, from.x, from.y);

			const group = activeDocument.createElementNS(SVG_NS, "g");
			group.classList.add("mermaid-flow-edge");
			if (this.selection?.type === "edge" && this.selection.id === edge.id) {
				group.classList.add("is-selected");
			}

			// Wide invisible hit line for easy clicking.
			const hit = activeDocument.createElementNS(SVG_NS, "line");
			hit.setAttribute("x1", String(start.x));
			hit.setAttribute("y1", String(start.y));
			hit.setAttribute("x2", String(end.x));
			hit.setAttribute("y2", String(end.y));
			hit.classList.add("mermaid-flow-edge-hit");

			const line = activeDocument.createElementNS(SVG_NS, "line");
			line.setAttribute("x1", String(start.x));
			line.setAttribute("y1", String(start.y));
			line.setAttribute("x2", String(end.x));
			line.setAttribute("y2", String(end.y));
			line.classList.add("mermaid-flow-edge-line");
			this.styleEdgeLine(line, edge.kind);
			if (edge.style?.strokeColor) line.setAttribute("stroke", edge.style.strokeColor);
			if (edge.style?.strokeWidth) {
				line.setAttribute("stroke-width", String(edge.style.strokeWidth));
			}

			group.appendChild(hit);
			group.appendChild(line);

			if (
				edge.kind !== "invisible" &&
				edge.label &&
				edge.label.trim() !== ""
			) {
				group.appendChild(
					this.edgeLabel(
						edge.label,
						(start.x + end.x) / 2,
						(start.y + end.y) / 2,
						edge,
					),
				);
			}

			group.addEventListener("pointerdown", (e) =>
				this.onEdgeDown(e, edge.id),
			);
			group.addEventListener("contextmenu", (e) =>
				this.onEdgeContext(e, edge.id),
			);
			this.edgeLayer.appendChild(group);
		}
	}

	private styleEdgeLine(line: SVGLineElement, kind: EdgeKind): void {
		line.removeAttribute("stroke-dasharray");
		line.removeAttribute("marker-start");
		line.classList.remove("is-thick", "is-open", "is-invisible");
		const arrow = "url(#mermaid-flow-arrow)";
		switch (kind) {
			case "dotted":
				line.setAttribute("stroke-dasharray", "5 5");
				line.setAttribute("marker-end", arrow);
				break;
			case "thick":
				line.classList.add("is-thick");
				line.setAttribute("marker-end", arrow);
				break;
			case "open":
				line.classList.add("is-open");
				line.removeAttribute("marker-end");
				break;
			case "bidirectional":
				line.setAttribute("marker-end", arrow);
				line.setAttribute("marker-start", arrow);
				break;
			case "invisible":
				line.classList.add("is-invisible");
				line.setAttribute("stroke-dasharray", "2 6");
				line.removeAttribute("marker-end");
				break;
			case "arrow":
			default:
				line.setAttribute("marker-end", arrow);
				break;
		}
	}

	private edgeLabel(
		label: string,
		x: number,
		y: number,
		edge: DiagramEdge,
	): SVGGElement {
		const fontSize = edge.style?.fontSize ?? 11;
		const g = activeDocument.createElementNS(SVG_NS, "g");
		const rect = activeDocument.createElementNS(SVG_NS, "rect");
		const approxW = label.length * (fontSize * 0.6) + 10;
		const half = fontSize * 0.85;
		rect.setAttribute("x", String(x - approxW / 2));
		rect.setAttribute("y", String(y - half));
		rect.setAttribute("width", String(approxW));
		rect.setAttribute("height", String(half * 2));
		rect.classList.add("mermaid-flow-edge-label-bg");
		const text = activeDocument.createElementNS(SVG_NS, "text");
		text.setAttribute("x", String(x));
		text.setAttribute("y", String(y));
		text.setAttribute("text-anchor", "middle");
		text.setAttribute("dominant-baseline", "central");
		text.classList.add("mermaid-flow-edge-label");
		text.textContent = label;
		if (edge.style?.textColor) text.setAttribute("fill", edge.style.textColor);
		if (edge.style?.fontSize) text.setAttribute("font-size", `${edge.style.fontSize}px`);
		g.appendChild(rect);
		g.appendChild(text);
		return g;
	}

	private buildDefs(): void {
		const defs = activeDocument.createElementNS(SVG_NS, "defs");
		const marker = activeDocument.createElementNS(SVG_NS, "marker");
		marker.setAttribute("id", "mermaid-flow-arrow");
		marker.setAttribute("viewBox", "0 0 10 10");
		marker.setAttribute("refX", "9");
		marker.setAttribute("refY", "5");
		marker.setAttribute("markerWidth", "7");
		marker.setAttribute("markerHeight", "7");
		marker.setAttribute("orient", "auto-start-reverse");
		const path = activeDocument.createElementNS(SVG_NS, "path");
		path.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
		path.classList.add("mermaid-flow-arrowhead");
		marker.appendChild(path);
		defs.appendChild(marker);
		this.svg.appendChild(defs);
	}

	// --- coordinate helpers -------------------------------------------------

	private toSvgPoint(e: PointerEvent): { x: number; y: number } {
		const rect = this.svg.getBoundingClientRect();
		const vbW = this.svg.viewBox.baseVal.width || rect.width;
		const vbH = this.svg.viewBox.baseVal.height || rect.height;
		const scaleX = rect.width ? vbW / rect.width : 1;
		const scaleY = rect.height ? vbH / rect.height : 1;
		return {
			x: (e.clientX - rect.left) * scaleX,
			y: (e.clientY - rect.top) * scaleY,
		};
	}

	// --- interaction --------------------------------------------------------

	private onNodeDown(e: PointerEvent, id: string): void {
		if (e.button !== 0) return; // let right-click open the context menu
		e.stopPropagation();
		e.preventDefault();

		if (this.mode === "connect") {
			this.handleConnectClick(id);
			return;
		}

		// Shift-click toggles multi-selection (for grouping); no drag.
		if (e.shiftKey) {
			if (this.multi.has(id)) this.multi.delete(id);
			else this.multi.add(id);
			this.setSelection({ type: "node", id });
			return;
		}

		// Plain click on a node outside the current multi-selection clears it.
		if (!this.multi.has(id)) this.multi.clear();
		this.setSelection({ type: "node", id });

		const node = this.model.nodes.find((n) => n.id === id);
		if (!node) return;
		this.dragId = id;
		this.dragLast = this.toSvgPoint(e);
		try {
			this.svg.setPointerCapture(e.pointerId);
		} catch {
			/* ignore */
		}
	}

	private onResizeDown(e: PointerEvent, id: string): void {
		if (e.button !== 0) return;
		e.stopPropagation();
		e.preventDefault();
		this.resizeId = id;
		try {
			this.svg.setPointerCapture(e.pointerId);
		} catch {
			/* ignore */
		}
	}

	private onEdgeDown(e: PointerEvent, id: string): void {
		if (e.button !== 0) return; // let right-click open the context menu
		if (this.mode === "connect") return;
		e.stopPropagation();
		this.select({ type: "edge", id });
	}

	private onNodeContext(e: MouseEvent, id: string): void {
		e.preventDefault();
		e.stopPropagation();
		this.select({ type: "node", id });
		this.callbacks.onContextMenu?.(e);
	}

	private onEdgeContext(e: MouseEvent, id: string): void {
		e.preventDefault();
		e.stopPropagation();
		this.select({ type: "edge", id });
		this.callbacks.onContextMenu?.(e);
	}

	private onGroupHeaderDown(e: PointerEvent, id: string): void {
		if (e.button !== 0) return;
		e.stopPropagation();
		e.preventDefault();
		this.select({ type: "group", id });
		this.groupDragId = id;
		this.groupDragLast = this.toSvgPoint(e);
		try {
			this.svg.setPointerCapture(e.pointerId);
		} catch {
			/* ignore */
		}
	}

	private onGroupContext(e: MouseEvent, id: string): void {
		e.preventDefault();
		e.stopPropagation();
		this.select({ type: "group", id });
		this.callbacks.onContextMenu?.(e);
	}

	private onBackgroundDown(e: PointerEvent): void {
		if (e.button !== 0) return; // ignore right/middle clicks on the canvas
		if (this.mode === "connect") {
			this.connectFrom = null;
			this.clearGhost();
			this.render();
			return;
		}
		// Begin a rubber-band selection.
		const p = this.toSvgPoint(e);
		this.rubber = { x0: p.x, y0: p.y };
		this.rubberMoved = false;
		this.rubberRect = activeDocument.createElementNS(SVG_NS, "rect");
		this.rubberRect.classList.add("mermaid-flow-rubber");
		this.overlayLayer.appendChild(this.rubberRect);
		try {
			this.svg.setPointerCapture(e.pointerId);
		} catch {
			/* ignore */
		}
	}

	private onAnchorDown(e: PointerEvent, id: string): void {
		if (e.button !== 0) return;
		e.stopPropagation();
		e.preventDefault();
		this.linkFrom = id;
		this.updateGhostFrom(id, e);
		try {
			this.svg.setPointerCapture(e.pointerId);
		} catch {
			/* ignore */
		}
	}

	private onPointerMove(e: PointerEvent): void {
		if (this.resizeId) {
			const node = this.model.nodes.find((n) => n.id === this.resizeId);
			if (!node) return;
			const p = this.toSvgPoint(e);
			node.w = Math.max(48, Math.round((p.x - node.x) * 2));
			node.h = Math.max(32, Math.round((p.y - node.y) * 2));
			this.geomCache.delete(node.id);
			this.resizeCanvas();
			this.renderGroups();
			this.renderEdges();
			this.renderNodes();
			return;
		}

		if (this.dragId) {
			const p = this.toSvgPoint(e);
			const dx = p.x - this.dragLast.x;
			const dy = p.y - this.dragLast.y;
			this.dragLast = p;
			const moveIds =
				this.multi.has(this.dragId) && this.multi.size > 1
					? [...this.multi]
					: [this.dragId];
			this.moveNodes(moveIds, dx, dy);
			this.resizeCanvas();
			this.renderGroups();
			this.renderEdges();
			this.renderNodes();
			return;
		}

		if (this.linkFrom) {
			this.updateGhostFrom(this.linkFrom, e);
			return;
		}

		if (this.rubber) {
			this.updateRubber(e);
			return;
		}

		if (this.groupDragId) {
			const p = this.toSvgPoint(e);
			const dx = p.x - this.groupDragLast.x;
			const dy = p.y - this.groupDragLast.y;
			this.groupDragLast = p;
			this.moveGroup(this.groupDragId, dx, dy);
			this.resizeCanvas();
			this.renderGroups();
			this.renderEdges();
			this.renderNodes();
			return;
		}

		if (this.mode === "connect" && this.connectFrom) {
			this.updateGhost(e);
		}
	}

	private moveGroup(groupId: string, dx: number, dy: number): void {
		const grp = this.model.groups.find((g) => g.id === groupId);
		if (!grp) return;
		this.moveNodes(grp.nodeIds, dx, dy);
	}

	private moveNodes(ids: string[], dx: number, dy: number): void {
		const set = new Set(ids);
		for (const node of this.model.nodes) {
			if (!set.has(node.id)) continue;
			node.x = Math.max(40, Math.round(node.x + dx));
			node.y = Math.max(30, Math.round(node.y + dy));
		}
	}

	private updateRubber(e: PointerEvent): void {
		if (!this.rubber || !this.rubberRect) return;
		const p = this.toSvgPoint(e);
		const x = Math.min(this.rubber.x0, p.x);
		const y = Math.min(this.rubber.y0, p.y);
		const w = Math.abs(p.x - this.rubber.x0);
		const h = Math.abs(p.y - this.rubber.y0);
		if (w > 3 || h > 3) this.rubberMoved = true;
		this.rubberRect.setAttribute("x", String(x));
		this.rubberRect.setAttribute("y", String(y));
		this.rubberRect.setAttribute("width", String(w));
		this.rubberRect.setAttribute("height", String(h));
	}

	private finishRubber(e: PointerEvent): void {
		const start = this.rubber;
		this.rubber = null;
		if (this.rubberRect) {
			this.rubberRect.remove();
			this.rubberRect = null;
		}
		if (!start) return;

		if (!this.rubberMoved) {
			// A plain click on empty space: clear everything.
			this.multi.clear();
			this.setSelection(null);
			return;
		}

		const p = this.toSvgPoint(e);
		const rx0 = Math.min(start.x0, p.x);
		const ry0 = Math.min(start.y0, p.y);
		const rx1 = Math.max(start.x0, p.x);
		const ry1 = Math.max(start.y0, p.y);

		this.multi.clear();
		for (const node of this.model.nodes) {
			const g = this.geomCache.get(node.id) ?? this.geom(node);
			const nx0 = node.x - g.w / 2;
			const ny0 = node.y - g.h / 2;
			const nx1 = node.x + g.w / 2;
			const ny1 = node.y + g.h / 2;
			const overlaps = nx0 <= rx1 && nx1 >= rx0 && ny0 <= ry1 && ny1 >= ry0;
			if (overlaps) this.multi.add(node.id);
		}
		const first = [...this.multi][0];
		this.setSelection(first ? { type: "node", id: first } : null);
	}

	private onPointerUp(e: PointerEvent): void {
		if (this.resizeId) {
			this.resizeId = null;
			try {
				this.svg.releasePointerCapture(e.pointerId);
			} catch {
				/* ignore */
			}
			this.callbacks.onChange();
			return;
		}

		if (this.dragId) {
			this.dragId = null;
			try {
				this.svg.releasePointerCapture(e.pointerId);
			} catch {
				/* ignore */
			}
			this.callbacks.onChange();
			return;
		}

		if (this.rubber) {
			this.finishRubber(e);
			try {
				this.svg.releasePointerCapture(e.pointerId);
			} catch {
				/* ignore */
			}
			return;
		}

		if (this.groupDragId) {
			this.groupDragId = null;
			try {
				this.svg.releasePointerCapture(e.pointerId);
			} catch {
				/* ignore */
			}
			this.callbacks.onChange();
			return;
		}

		if (this.linkFrom) {
			const p = this.toSvgPoint(e);
			const target = this.nodeAt(p.x, p.y);
			const from = this.linkFrom;
			this.linkFrom = null;
			this.clearGhost();
			try {
				this.svg.releasePointerCapture(e.pointerId);
			} catch {
				/* ignore */
			}
			if (target && target.id !== from) {
				const edge: DiagramEdge = {
					id: newEdgeId(),
					from,
					to: target.id,
					label: "",
					kind: "arrow",
				};
				this.model.edges.push(edge);
				this.callbacks.onChange();
				this.select({ type: "edge", id: edge.id });
			} else {
				this.render();
			}
		}
	}

	/** Topmost node whose bounding box contains the point, if any. */
	private nodeAt(x: number, y: number): DiagramNode | null {
		for (let i = this.model.nodes.length - 1; i >= 0; i--) {
			const node = this.model.nodes[i];
			if (!node) continue;
			const g = this.geomCache.get(node.id) ?? this.geom(node);
			if (
				x >= node.x - g.w / 2 &&
				x <= node.x + g.w / 2 &&
				y >= node.y - g.h / 2 &&
				y <= node.y + g.h / 2
			) {
				return node;
			}
		}
		return null;
	}

	private updateGhostFrom(fromId: string, e: PointerEvent): void {
		const from = this.model.nodes.find((n) => n.id === fromId);
		if (!from) return;
		const p = this.toSvgPoint(e);
		if (!this.ghostLine) {
			this.ghostLine = activeDocument.createElementNS(SVG_NS, "line");
			this.ghostLine.classList.add("mermaid-flow-ghost-line");
			this.overlayLayer.appendChild(this.ghostLine);
		}
		const start = this.borderPoint(from, p.x, p.y);
		this.ghostLine.setAttribute("x1", String(start.x));
		this.ghostLine.setAttribute("y1", String(start.y));
		this.ghostLine.setAttribute("x2", String(p.x));
		this.ghostLine.setAttribute("y2", String(p.y));
	}

	private handleConnectClick(id: string): void {
		if (!this.connectFrom) {
			this.connectFrom = id;
			this.render();
			return;
		}
		if (this.connectFrom === id) {
			// Clicking the source again cancels.
			this.connectFrom = null;
			this.clearGhost();
			this.render();
			return;
		}
		const edge: DiagramEdge = {
			id: newEdgeId(),
			from: this.connectFrom,
			to: id,
			label: "",
			kind: "arrow",
		};
		this.model.edges.push(edge);
		this.connectFrom = null;
		this.clearGhost();
		this.callbacks.onChange();
		this.select({ type: "edge", id: edge.id });
	}

	private updateGhost(e: PointerEvent): void {
		const from = this.model.nodes.find((n) => n.id === this.connectFrom);
		if (!from) return;
		const p = this.toSvgPoint(e);
		if (!this.ghostLine) {
			this.ghostLine = activeDocument.createElementNS(SVG_NS, "line");
			this.ghostLine.classList.add("mermaid-flow-ghost-line");
			this.overlayLayer.appendChild(this.ghostLine);
		}
		const start = this.borderPoint(from, p.x, p.y);
		this.ghostLine.setAttribute("x1", String(start.x));
		this.ghostLine.setAttribute("y1", String(start.y));
		this.ghostLine.setAttribute("x2", String(p.x));
		this.ghostLine.setAttribute("y2", String(p.y));
	}

	private clearGhost(): void {
		if (this.ghostLine) {
			this.ghostLine.remove();
			this.ghostLine = null;
		}
	}
}
