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

/** Presentation properties copied onto exported elements so a serialized SVG
 *  renders identically without the editor's stylesheet. */
const EXPORT_STYLE_PROPS = [
	"fill",
	"fill-opacity",
	"fill-rule",
	"stroke",
	"stroke-width",
	"stroke-opacity",
	"stroke-dasharray",
	"stroke-linecap",
	"stroke-linejoin",
	"color",
	"opacity",
	"font-family",
	"font-size",
	"font-weight",
	"font-style",
	"text-anchor",
	"dominant-baseline",
	"letter-spacing",
	"text-decoration",
	"display",
	"visibility",
];

/**
 * Walk a live SVG subtree and its fresh clone in lockstep, copying each live
 * element's *computed* presentation style onto the clone as an inline `style`.
 * `getComputedStyle` resolves theme CSS variables and any per-node inline
 * colours to concrete values, so the clone no longer depends on the stylesheet.
 */
function inlineComputedStyles(src: Element, dst: Element): void {
	const cs = getComputedStyle(src);
	let inline = "";
	for (const prop of EXPORT_STYLE_PROPS) {
		// Keep "none" (e.g. an edge path's fill:none must survive, or it would
		// fall back to a solid black fill); only drop genuinely empty values.
		const value = cs.getPropertyValue(prop);
		if (value) inline += `${prop}:${value};`;
	}
	if (inline) dst.setAttribute("style", inline);

	const srcChildren = src.children;
	const dstChildren = dst.children;
	for (let i = 0; i < srcChildren.length; i++) {
		const sc = srcChildren[i];
		const dc = dstChildren[i];
		if (sc && dc) inlineComputedStyles(sc, dc);
	}
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
	/** empty=true when the click was on the canvas background (no element). */
	onContextMenu?: (event: MouseEvent, empty?: boolean) => void;
	onZoom?: (zoom: number) => void;
	/** Double-click on empty canvas at SVG coordinates. */
	onDblClickBackground?: (svgX: number, svgY: number) => void;
	/** Double-click on a node — its id is passed for inline edit. */
	onDblClickNode?: (id: string) => void;
	/** Called whenever the multi-selection set changes (for toolbar updates). */
	onMultiChange?: () => void;
	/** Shape dragged from palette and dropped at SVG coordinates. */
	onDrop?: (shape: string, svgX: number, svgY: number) => void;
	/** A .mmd file was dropped onto the canvas — raw Mermaid text. */
	onImportFile?: (text: string) => void;
}

interface Geom {
	w: number;
	h: number;
}

const NODE_H = 44;
const MIN_W = 80;
const PADDING = 80;
const CHAR_W = 8.2;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;

export class DiagramCanvas {
	private model: DiagramModel;
	private callbacks: CanvasCallbacks;

	private scroller: HTMLElement;
	private svg: SVGSVGElement;
	private groupLayer: SVGGElement;
	private edgeLayer: SVGGElement;
	private nodeLayer: SVGGElement;
	private overlayLayer: SVGGElement;
	private bgRect: SVGRectElement;
	private emptyState!: HTMLElement;

	private mode: EditorMode = "select";
	private selection: Selection = null;
	private zoom = 1;
	private snapSize = 0;  // 0 = off
	private spaceDown = false;

	private geomCache = new Map<string, Geom>();

	// drag state (delta-based)
	private dragId: string | null = null;
	private dragLast = { x: 0, y: 0 };

	// space/middle-click pan
	private panDrag: { startX: number; startY: number; scrollLeft: number; scrollTop: number } | null = null;

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

	// external drop callback (registered by toolbar)
	private dropCallback: ((shape: string, svgX: number, svgY: number) => void) | null = null;
	// edge-type picker callback: called with new edge id + mouse event after anchor-drag
	private newEdgePickerCb: ((edgeId: string, e: MouseEvent) => void) | null = null;

	constructor(
		parent: HTMLElement,
		model: DiagramModel,
		callbacks: CanvasCallbacks,
	) {
		this.model = model;
		this.callbacks = callbacks;

		this.scroller = parent.createDiv({ cls: "mermaid-flow-canvas-scroll" });
		this.svg = document.createElementNS(SVG_NS, "svg");
		this.svg.classList.add("mermaid-flow-svg");
		this.scroller.appendChild(this.svg);

		this.buildDefs();
		this.bgRect = document.createElementNS(SVG_NS, "rect");
		this.bgRect.classList.add("mermaid-flow-bg-rect");
		this.bgRect.setAttribute("x", "0");
		this.bgRect.setAttribute("y", "0");
		this.groupLayer = document.createElementNS(SVG_NS, "g");
		this.edgeLayer = document.createElementNS(SVG_NS, "g");
		this.nodeLayer = document.createElementNS(SVG_NS, "g");
		this.overlayLayer = document.createElementNS(SVG_NS, "g");
		this.svg.appendChild(this.bgRect);
		this.svg.appendChild(this.groupLayer);
		this.svg.appendChild(this.edgeLayer);
		this.svg.appendChild(this.nodeLayer);
		this.svg.appendChild(this.overlayLayer);

		this.svg.addEventListener("pointerdown", (e) => this.onBackgroundDown(e));
		this.svg.addEventListener("pointermove", (e) => this.onPointerMove(e));
		this.svg.addEventListener("pointerup", (e) => this.onPointerUp(e));
		this.svg.addEventListener("contextmenu", (e) => this.onBackgroundContext(e));
		this.svg.addEventListener("dblclick", (e) => this.onDblClick(e));
		this.scroller.addEventListener("wheel", (e) => this.onWheel(e), { passive: false });
		// Safari pinch-zoom via GestureChange events
		this.scroller.addEventListener("gesturestart", (e) => e.preventDefault(), { passive: false });
		this.scroller.addEventListener("gesturechange", (e) => {
			e.preventDefault();
			const ge = e as Event & { scale?: number };
			if (ge.scale !== undefined) this.setZoom(this.zoom * ge.scale, undefined, undefined);
		}, { passive: false });
		// Drag-from-palette drop target
		this.scroller.addEventListener("dragover", (e) => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = "copy"; });
		this.scroller.addEventListener("drop", (e) => this.onDrop(e));

		// Overlay shown only when the diagram has no nodes (first-open / cleared).
		this.emptyState = parent.createDiv({ cls: "mermaid-flow-canvas-empty" });
		this.buildEmptyState();

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

	getZoom(): number {
		return this.zoom;
	}

	zoomIn(): void {
		this.setZoom(this.zoom * 1.2);
	}

	zoomOut(): void {
		this.setZoom(this.zoom / 1.2);
	}

	zoomReset(): void {
		this.zoom = 1;
		this.resizeCanvas();
		this.callbacks.onZoom?.(this.zoom);
	}

	/**
	 * Set the zoom level, keeping the point under (clientX, clientY) — or the
	 * viewport centre when omitted — stationary on screen.
	 */
	private setZoom(z: number, clientX?: number, clientY?: number): void {
		const old = this.zoom;
		const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
		if (Math.abs(next - old) < 0.0001) return;
		const rect = this.scroller.getBoundingClientRect();
		const offsetX = (clientX ?? rect.left + rect.width / 2) - rect.left;
		const offsetY = (clientY ?? rect.top + rect.height / 2) - rect.top;
		const ratio = next / old;
		this.zoom = next;
		this.resizeCanvas();
		this.scroller.scrollLeft =
			(this.scroller.scrollLeft + offsetX) * ratio - offsetX;
		this.scroller.scrollTop =
			(this.scroller.scrollTop + offsetY) * ratio - offsetY;
		this.callbacks.onZoom?.(this.zoom);
	}

	private onWheel(e: WheelEvent): void {
		if (!(e.ctrlKey || e.metaKey)) return; // plain scroll keeps native panning
		e.preventDefault();
		const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
		this.setZoom(this.zoom * factor, e.clientX, e.clientY);
	}

	getSelection(): Selection {
		return this.selection;
	}

	getSVG(): SVGSVGElement {
		return this.svg;
	}

	/** Clear all selection (e.g. before exporting a clean image). */
	deselect(): void {
		this.multi.clear();
		this.setSelection(null);
	}

	/**
	 * Build a standalone, self-contained SVG string for file export.
	 *
	 * The live SVG relies entirely on CSS (theme variables for fills, strokes,
	 * fonts) so a naive serialize produces an image with no colours or text
	 * styling. Here we clone the tree, inline every element's *computed* style
	 * (which resolves CSS variables and per-node custom colours to concrete
	 * values), drop the interactive overlay layer, and emit a properly namespaced
	 * document with explicit dimensions.
	 *
	 * @returns the SVG markup plus pixel dimensions and the canvas background
	 *   colour (used to flatten PNG exports so text stays legible).
	 */
	getExportSVG(): {
		svg: string;
		width: number;
		height: number;
		background: string;
	} {
		const live = this.svg;
		const clone = live.cloneNode(true) as SVGSVGElement;

		// Inline computed styles in lockstep — clone mirrors live exactly here.
		inlineComputedStyles(live, clone);

		// Remove the interactive overlay layer (selection handles, ghost lines,
		// rubber-band) — it must never appear in an exported image. The overlay
		// is the last child, so map it by index from the live tree.
		const overlayIndex = Array.prototype.indexOf.call(
			live.children,
			this.overlayLayer,
		);
		const cloneOverlay = clone.children[overlayIndex];
		if (overlayIndex >= 0 && cloneOverlay) cloneOverlay.remove();

		const rect = live.getBoundingClientRect();
		const width = live.viewBox.baseVal.width || rect.width;
		const height = live.viewBox.baseVal.height || rect.height;
		clone.setAttribute("width", String(Math.round(width)));
		clone.setAttribute("height", String(Math.round(height)));
		clone.setAttribute("viewBox", `0 0 ${width} ${height}`);
		clone.setAttribute("xmlns", SVG_NS);
		clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");

		const scrollerBg = getComputedStyle(this.scroller).backgroundColor;
		const background =
			scrollerBg && scrollerBg !== "rgba(0, 0, 0, 0)" && scrollerBg !== "transparent"
				? scrollerBg
				: "#ffffff";

		const svg = new XMLSerializer().serializeToString(clone);
		return { svg, width, height, background };
	}

	/** Public select: also clears any multi-selection. */
	select(sel: Selection): void {
		this.multi.clear();
		this.setSelection(sel);
		this.callbacks.onMultiChange?.();
	}

	/** Select a set of node IDs as a multi-selection. */
	selectIds(ids: string[]): void {
		this.multi.clear();
		for (const id of ids) this.multi.add(id);
		const first = ids[0];
		this.setSelection(first ? { type: "node", id: first } : null);
		this.callbacks.onMultiChange?.();
	}

	/** Select all nodes into the multi-selection. */
	selectAll(): void {
		this.multi.clear();
		for (const n of this.model.nodes) this.multi.add(n.id);
		const first = this.model.nodes[0];
		this.setSelection(first ? { type: "node", id: first.id } : null);
		this.callbacks.onMultiChange?.();
	}

	/** Configure optional snap-to-grid. size=0 disables snap. */
	setSnapGrid(size: number): void {
		this.snapSize = Math.max(0, size);
	}

	/** Notify canvas that Space key is held (enables pan mode). */
	setSpaceDown(down: boolean): void {
		this.spaceDown = down;
		this.scroller.style.cursor = down ? "grab" : "";
	}

	/** Move all currently-selected node(s) by dx/dy pixels. */
	nudgeSelected(dx: number, dy: number): void {
		const ids = this.multi.size > 0 ? [...this.multi] : [];
		if (ids.length === 0) {
			if (this.selection?.type === "node") ids.push(this.selection.id);
		}
		if (ids.length === 0) return;
		this.moveNodes(ids, dx, dy);
		this.resizeCanvas();
		this.renderGroups();
		this.renderEdges();
		this.renderNodes();
	}

	/** Scale and scroll to fit all nodes in the visible viewport. */
	zoomToFit(): void {
		if (this.model.nodes.length === 0) return;
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		for (const node of this.model.nodes) {
			const g = this.geomCache.get(node.id) ?? this.geom(node);
			minX = Math.min(minX, node.x - g.w / 2);
			minY = Math.min(minY, node.y - g.h / 2);
			maxX = Math.max(maxX, node.x + g.w / 2);
			maxY = Math.max(maxY, node.y + g.h / 2);
		}
		const pad = 60;
		const cw = maxX - minX + pad * 2;
		const ch = maxY - minY + pad * 2;
		const dw = this.scroller.clientWidth;
		const dh = this.scroller.clientHeight;
		if (dw === 0 || dh === 0) return;
		const newZoom = Math.min(dw / cw, dh / ch, MAX_ZOOM);
		this.zoom = Math.max(MIN_ZOOM, newZoom);
		this.resizeCanvas();
		this.callbacks.onZoom?.(this.zoom);
		// Scroll to center
		this.scroller.scrollLeft = (minX - pad) * this.zoom;
		this.scroller.scrollTop = (minY - pad) * this.zoom;
	}

	/** Register the callback used by the toolbar's drop handler. */
	registerDropTarget(cb: (shape: string, svgX: number, svgY: number) => void): void {
		this.dropCallback = cb;
	}

	/** Add/remove the `is-highlighted` class on node groups matching ids. */
	highlightNodes(ids: Set<string>): void {
		this.nodeLayer.querySelectorAll<SVGGElement>(".mermaid-flow-node").forEach((g, i) => {
			const node = this.model.nodes[i];
			if (node) g.classList.toggle("is-highlighted", ids.has(node.id));
		});
	}

	/** Scroll the first node whose id is in ids into the visible area. */
	scrollNodeIntoView(id: string): void {
		const node = this.model.nodes.find((n) => n.id === id);
		if (!node) return;
		const g = this.geomCache.get(node.id) ?? this.geom(node);
		const cx = node.x * this.zoom;
		const cy = node.y * this.zoom;
		const hw = (g.w / 2) * this.zoom + 40;
		const hh = (g.h / 2) * this.zoom + 40;
		const vw = this.scroller.clientWidth;
		const vh = this.scroller.clientHeight;
		const sl = this.scroller.scrollLeft;
		const st = this.scroller.scrollTop;
		if (cx - hw < sl || cx + hw > sl + vw) this.scroller.scrollLeft = cx - vw / 2;
		if (cy - hh < st || cy + hh > st + vh) this.scroller.scrollTop  = cy - vh / 2;
	}

	/** Called after anchor-drag creates an edge — fire the edge-type picker. */
	setNewEdgePickerCallback(cb: ((edgeId: string, e: MouseEvent) => void) | null): void {
		this.newEdgePickerCb = cb;
	}

	private setSelection(sel: Selection): void {
		this.selection = sel;
		this.callbacks.onSelect(sel);
		this.render();
	}

	destroy(): void {
		this.scroller.remove();
		this.emptyState?.remove();
	}

	private buildEmptyState(): void {
		const inner = this.emptyState.createDiv({
			cls: "mermaid-flow-canvas-empty-inner",
		});
		inner.createDiv({ cls: "mermaid-flow-canvas-empty-glyph", text: "◆" });
		// Use standard DOM so this method works in the test environment (jsdom),
		// which does not polyfill Obsidian's createEl helper.
		const title = document.createElement("p");
		title.className = "mermaid-flow-canvas-empty-title";
		title.textContent = "Start your diagram";
		inner.appendChild(title);
		const hint = document.createElement("p");
		hint.className = "mermaid-flow-canvas-empty-hint";
		hint.textContent =
			"Use the Add shape button in the toolbar to place your first node, then drag from a node's edge dot to connect.";
		inner.appendChild(hint);
	}

	// --- geometry -----------------------------------------------------------

	private geom(node: DiagramNode): Geom {
		if (node.w && node.h) {
			const g = { w: node.w, h: node.h };
			this.geomCache.set(node.id, g);
			return g;
		}
		const rawLabel = node.label || node.id;
		const lines = rawLabel.split("\n");
		// Width uses the longest line; height grows for multi-line labels.
		const longestLine = lines.reduce((a, b) => (a.length > b.length ? a : b), "");
		let w = Math.max(MIN_W, Math.round(longestLine.length * CHAR_W) + 32);
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
		// classList.toggle is standard DOM; toggleClass is Obsidian-only and
		// unavailable in the test environment (jsdom).
		this.emptyState?.classList.toggle("is-visible", this.model.nodes.length === 0);
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

			const g = document.createElementNS(SVG_NS, "g");
			g.classList.add("mermaid-flow-group");
			if (this.selection?.type === "group" && this.selection.id === grp.id) {
				g.classList.add("is-selected");
			}

			const box = document.createElementNS(SVG_NS, "rect");
			box.setAttribute("x", String(bx));
			box.setAttribute("y", String(by));
			box.setAttribute("width", String(bw));
			box.setAttribute("height", String(bh));
			box.setAttribute("rx", "8");
			box.classList.add("mermaid-flow-group-box");

			const header = document.createElementNS(SVG_NS, "rect");
			header.setAttribute("x", String(bx));
			header.setAttribute("y", String(by));
			header.setAttribute("width", String(bw));
			header.setAttribute("height", String(titleH));
			header.setAttribute("rx", "8");
			header.classList.add("mermaid-flow-group-header");

			const title = document.createElementNS(SVG_NS, "text");
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
		this.svg.setAttribute("width", String(Math.round(w * this.zoom)));
		this.svg.setAttribute("height", String(Math.round(h * this.zoom)));
		this.svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
		this.bgRect.setAttribute("width", String(w));
		this.bgRect.setAttribute("height", String(h));
		this.paintBackground();
	}

	private paintBackground(): void {
		const bg = this.model.config.background;
		if (bg) {
			this.bgRect.setAttribute("fill", bg);
			this.bgRect.style.removeProperty("display");
		} else {
			this.bgRect.style.display = "none";
		}
	}

	/** Repaint only the diagram background after model.config.background changes. */
	refreshBackground(): void {
		this.paintBackground();
	}

	private renderNodes(): void {
		clearChildren(this.nodeLayer);
		for (const node of this.model.nodes) {
			const g = this.geomCache.get(node.id) ?? this.geom(node);
			const group = document.createElementNS(SVG_NS, "g");
			group.classList.add("mermaid-flow-node");
			const isSelected =
				this.selection?.type === "node" && this.selection.id === node.id;
			if (isSelected) group.classList.add("is-selected");
			if (this.multi.has(node.id)) group.classList.add("is-multi");
			if (this.connectFrom === node.id) group.classList.add("is-connect-source");
			if (node.locked) group.classList.add("is-locked");

			for (const el of createShapeElements(node.shape, node.x, node.y, g.w, g.h)) {
				el.classList.add("mermaid-flow-shape");
				this.applyShapeStyle(el, node);
				group.appendChild(el);
			}
			group.appendChild(this.nodeLabel(node));
			this.appendAnchors(group, node, g);

			// Resize handle on the single-selected node.
			if (isSelected && this.multi.size === 0) {
				const handle = document.createElementNS(SVG_NS, "rect");
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
			group.addEventListener("dblclick", (e) => {
				e.stopPropagation();
				this.callbacks.onDblClickNode?.(node.id);
			});
			this.nodeLayer.appendChild(group);
		}
	}

	private applyShapeStyle(el: SVGElement, node: DiagramNode): void {
		const s = node.style;
		if (!s) return;
		if (s.fillColor && el.getAttribute("fill") !== "none") {
			(el as SVGElement & { style: CSSStyleDeclaration }).style.fill =
				s.fillColor;
		}
		if (s.strokeColor) {
			(el as SVGElement & { style: CSSStyleDeclaration }).style.stroke =
				s.strokeColor;
		}
	}

	private nodeLabel(node: DiagramNode): SVGTextElement {
		const text = document.createElementNS(SVG_NS, "text");
		const s = node.style;
		const fontSize = s?.fontSize ?? 12;
		const rawLabel = node.label || node.id;
		const lines = rawLabel.split("\n");

		text.setAttribute("x", String(node.x));
		text.setAttribute("text-anchor", "middle");
		text.classList.add("mermaid-flow-node-label");
		if (s?.textColor) text.style.fill = s.textColor;
		if (s?.fontSize) text.style.fontSize = `${s.fontSize}px`;
		if (s?.fontFamily) text.style.fontFamily = s.fontFamily;

		if (lines.length === 1) {
			text.setAttribute("y", String(node.y));
			text.setAttribute("dominant-baseline", "central");
			text.textContent = rawLabel;
		} else {
			// Multi-line: stack tspan elements centred on node.y
			const lineH = fontSize * 1.3;
			const totalH = lineH * (lines.length - 1);
			lines.forEach((line, i) => {
				const tspan = document.createElementNS(SVG_NS, "tspan");
				tspan.setAttribute("x", String(node.x));
				tspan.setAttribute("dy", i === 0 ? String(-totalH / 2) : String(lineH));
				tspan.textContent = line;
				text.appendChild(tspan);
			});
			text.setAttribute("y", String(node.y));
			text.setAttribute("dominant-baseline", "central");
		}
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
			const dot = document.createElementNS(SVG_NS, "circle");
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

			const group = document.createElementNS(SVG_NS, "g");
			group.classList.add("mermaid-flow-edge");
			if (this.selection?.type === "edge" && this.selection.id === edge.id) {
				group.classList.add("is-selected");
			}

			// Wide invisible hit line for easy clicking.
			const hit = document.createElementNS(SVG_NS, "line");
			hit.setAttribute("x1", String(start.x));
			hit.setAttribute("y1", String(start.y));
			hit.setAttribute("x2", String(end.x));
			hit.setAttribute("y2", String(end.y));
			hit.classList.add("mermaid-flow-edge-hit");

			const line = document.createElementNS(SVG_NS, "line");
			line.setAttribute("x1", String(start.x));
			line.setAttribute("y1", String(start.y));
			line.setAttribute("x2", String(end.x));
			line.setAttribute("y2", String(end.y));
			line.classList.add("mermaid-flow-edge-line");
			this.styleEdgeLine(line, edge.kind);
			if (edge.animated) line.classList.add("is-animated");
			if (edge.style?.strokeColor) line.style.stroke = edge.style.strokeColor;
			if (edge.style?.strokeWidth) {
				line.style.strokeWidth = `${edge.style.strokeWidth}px`;
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
		const g = document.createElementNS(SVG_NS, "g");
		const rect = document.createElementNS(SVG_NS, "rect");
		const approxW = label.length * (fontSize * 0.6) + 10;
		const half = fontSize * 0.85;
		rect.setAttribute("x", String(x - approxW / 2));
		rect.setAttribute("y", String(y - half));
		rect.setAttribute("width", String(approxW));
		rect.setAttribute("height", String(half * 2));
		rect.classList.add("mermaid-flow-edge-label-bg");
		const text = document.createElementNS(SVG_NS, "text");
		text.setAttribute("x", String(x));
		text.setAttribute("y", String(y));
		text.setAttribute("text-anchor", "middle");
		text.setAttribute("dominant-baseline", "central");
		text.classList.add("mermaid-flow-edge-label");
		text.textContent = label;
		if (edge.style?.textColor) text.style.fill = edge.style.textColor;
		if (edge.style?.fontSize) text.style.fontSize = `${edge.style.fontSize}px`;
		g.appendChild(rect);
		g.appendChild(text);
		return g;
	}

	private buildDefs(): void {
		const defs = document.createElementNS(SVG_NS, "defs");
		const marker = document.createElementNS(SVG_NS, "marker");
		marker.setAttribute("id", "mermaid-flow-arrow");
		marker.setAttribute("viewBox", "0 0 10 10");
		marker.setAttribute("refX", "9");
		marker.setAttribute("refY", "5");
		marker.setAttribute("markerWidth", "7");
		marker.setAttribute("markerHeight", "7");
		marker.setAttribute("orient", "auto-start-reverse");
		const path = document.createElementNS(SVG_NS, "path");
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
		if (e.button !== 0) return;
		e.stopPropagation();
		e.preventDefault();

		if (this.mode === "connect") {
			this.handleConnectClick(id);
			return;
		}

		// Locked nodes can still be selected but not dragged.
		const node = this.model.nodes.find((n) => n.id === id);
		if (node?.locked) {
			this.setSelection({ type: "node", id });
			return;
		}

		// Shift-click toggles multi-selection (for grouping); no drag.
		if (e.shiftKey) {
			if (this.multi.has(id)) this.multi.delete(id);
			else this.multi.add(id);
			this.setSelection({ type: "node", id });
			this.callbacks.onMultiChange?.();
			return;
		}

		// Plain click on a node outside the current multi-selection clears it.
		if (!this.multi.has(id)) {
			this.multi.clear();
			this.callbacks.onMultiChange?.();
		}
		this.setSelection({ type: "node", id });

		const dragNode = this.model.nodes.find((n) => n.id === id);
		if (!dragNode) return;
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
		// Middle-click or Space+left-click: start pan
		if (e.button === 1 || (e.button === 0 && this.spaceDown)) {
			e.preventDefault();
			this.panDrag = {
				startX: e.clientX,
				startY: e.clientY,
				scrollLeft: this.scroller.scrollLeft,
				scrollTop: this.scroller.scrollTop,
			};
			this.scroller.style.cursor = "grabbing";
			try { this.svg.setPointerCapture(e.pointerId); } catch { /* ignore */ }
			return;
		}

		if (e.button !== 0) return;

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
		this.rubberRect = document.createElementNS(SVG_NS, "rect");
		this.rubberRect.classList.add("mermaid-flow-rubber");
		this.overlayLayer.appendChild(this.rubberRect);
		try {
			this.svg.setPointerCapture(e.pointerId);
		} catch {
			/* ignore */
		}
	}

	private onBackgroundContext(e: MouseEvent): void {
		// Only fire when the click was directly on the background, not on a node.
		if (e.target !== this.svg && e.target !== this.bgRect) return;
		e.preventDefault();
		e.stopPropagation();
		// Attach SVG coordinates to the event so the context menu can place a new node.
		const p = this.toSvgPoint(e as unknown as PointerEvent);
		Object.assign(e, { svgX: p.x, svgY: p.y });
		this.multi.clear();
		this.setSelection(null);
		this.callbacks.onContextMenu?.(e, true);
	}

	private onDblClick(e: MouseEvent): void {
		if (e.target === this.svg || e.target === this.bgRect) {
			// Double-click on empty canvas: add node at this position
			const p = this.toSvgPoint(e as unknown as PointerEvent);
			this.callbacks.onDblClickBackground?.(p.x, p.y);
		}
	}

	private onDrop(e: DragEvent): void {
		e.preventDefault();
		// Check for .mmd file drop first
		const files = e.dataTransfer?.files;
		if (files && files.length > 0) {
			const file = files[0];
			if (file && (file.name.endsWith(".mmd") || file.type === "text/plain")) {
				const reader = new FileReader();
				reader.onload = () => {
					const text = reader.result as string;
					this.callbacks.onImportFile?.(text);
				};
				reader.readAsText(file);
				return;
			}
		}
		const shape = e.dataTransfer?.getData("text/plain");
		if (!shape) return;
		const svgRect = this.svg.getBoundingClientRect();
		const vbW = this.svg.viewBox.baseVal.width || svgRect.width;
		const vbH = this.svg.viewBox.baseVal.height || svgRect.height;
		const scaleX = svgRect.width ? vbW / svgRect.width : 1;
		const scaleY = svgRect.height ? vbH / svgRect.height : 1;
		const svgX = (e.clientX - svgRect.left) * scaleX;
		const svgY = (e.clientY - svgRect.top) * scaleY;
		(this.dropCallback ?? this.callbacks.onDrop)?.(shape, svgX, svgY);
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
		if (this.panDrag) {
			this.scroller.scrollLeft = this.panDrag.scrollLeft - (e.clientX - this.panDrag.startX);
			this.scroller.scrollTop  = this.panDrag.scrollTop  - (e.clientY - this.panDrag.startY);
			return;
		}

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

	private snap(val: number): number {
		if (!this.snapSize) return Math.round(val);
		return Math.round(val / this.snapSize) * this.snapSize;
	}

	private moveNodes(ids: string[], dx: number, dy: number): void {
		const set = new Set(ids);
		for (const node of this.model.nodes) {
			if (!set.has(node.id)) continue;
			node.x = Math.max(40, this.snap(node.x + dx));
			node.y = Math.max(30, this.snap(node.y + dy));
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
		this.callbacks.onMultiChange?.();
	}

	private onPointerUp(e: PointerEvent): void {
		if (this.panDrag) {
			this.panDrag = null;
			this.scroller.style.cursor = this.spaceDown ? "grab" : "";
			try { this.svg.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
			return;
		}

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
				// If a picker callback is registered, show it so the user can
				// choose the edge type right after drawing the connection.
				if (this.newEdgePickerCb) {
					const mouseEv = new MouseEvent("click", { clientX: e.clientX, clientY: e.clientY, bubbles: true });
					this.newEdgePickerCb(edge.id, mouseEv);
				}
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
			this.ghostLine = document.createElementNS(SVG_NS, "line");
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
			this.ghostLine = document.createElementNS(SVG_NS, "line");
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
