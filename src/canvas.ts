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
	NodeStyle,
	descendantNodeIds,
	newEdgeId,
	resolveNodeStyle,
} from "./model";
import { createShapeElements } from "./shapes";
import { estimateNodeSize, MIN_W, NODE_H } from "./nodeGeometry";
import { measureTextWidth } from "./textMetrics";
import { resolveThemePalette, ThemePalette } from "./themePalette";
import { parseInlineMarkup, plainTextFromMarkup } from "./richText";

const SVG_NS = "http://www.w3.org/2000/svg";
// HTML elements embedded in an SVG <foreignObject> must be created in the XHTML
// namespace (used by the in-place label editor).
const XHTML_NS = "http://www.w3.org/1999/xhtml";

/**
 * Concrete fallbacks for `resolveColor()` when live CSS custom-property
 * resolution fails (jsdom, popout-window mismatches, or a theme that doesn't
 * define the var). Mirrors `BUILTIN.default` in themePalette.ts (Mermaid's own
 * stock palette), which reads fine on both light and dark Obsidian themes.
 */
const VAR_FALLBACK: Record<string, string> = {
	"--background-primary-alt": "#ececff",
	"--text-normal": "#333333",
	"--text-muted": "#333333",
};
const VAR_FALLBACK_DEFAULT = "#333333";



function clearChildren(el: Element): void {
	while (el.firstChild) el.removeChild(el.firstChild);
}

/** Round to 0.1px to keep path data compact and test-stable. */
function rnd(n: number): number {
	return Math.round(n * 10) / 10;
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
	/** An image file was dropped onto the canvas (AI image-to-diagram). */
	onImportImage?: (file: File) => void;
}

interface Geom {
	w: number;
	h: number;
}

const PADDING = 80;
const MIN_ZOOM = 0.1;
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
	// When false, the viewBox only ever grows to cover new content — it never
	// shrinks back down as nodes move, so panning beyond content stays stable.
	private autoResize = true;

	// Current viewBox origin. Stays (0,0) for all-positive content; extends
	// into negative space when nodes/groups sit at negative coordinates so
	// they are never clipped top/left.
	private vbX = 0;
	private vbY = 0;
	private vbW = 0;
	private vbH = 0;

	// Watches the scroller until it gains real dimensions (fitWhenReady).
	private fitObserver: ResizeObserver | null = null;

	private geomCache = new Map<string, Geom>();

	// The shared arrowhead marker path, recoloured per theme on each edge render.
	private arrowPath: SVGPathElement | null = null;

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
	// node hovered as a valid drop target while linkFrom/reconnectEdge is active
	private linkHoverTarget: string | null = null;

	// group (subgraph) drag
	private groupDragId: string | null = null;
	private groupDragLast = { x: 0, y: 0 };

	// group (subgraph) resize — scales member node positions/sizes proportionally
	private groupResizeId: string | null = null;
	private groupResizeOrigin: {
		bx: number;
		by: number;
		bw: number;
		bh: number;
		nodes: Map<string, { x: number; y: number; w: number; h: number }>;
	} | null = null;

	// existing-edge endpoint reconnection (drag a selected edge's end to another node)
	private reconnectEdge: { edgeId: string; end: "from" | "to" } | null = null;

	// smart alignment guides shown while dragging a single node
	private guideLines: SVGLineElement[] = [];

	// in-place (draw.io-style) label editing — a <foreignObject> textarea drawn
	// in SVG coordinate space so it tracks zoom/pan/scroll automatically.
	private editingNodeId: string | null = null;
	private editingEdgeId: string | null = null;
	private labelEditor: SVGForeignObjectElement | null = null;
	private labelInput: HTMLTextAreaElement | null = null;

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
		this.svg = activeDocument.createElementNS(SVG_NS, "svg");
		this.svg.classList.add("mermaid-flow-svg");
		this.svg.tabIndex = -1;
		this.scroller.appendChild(this.svg);

		this.buildDefs();
		this.bgRect = activeDocument.createElementNS(SVG_NS, "rect");
		this.bgRect.classList.add("mermaid-flow-bg-rect", "mermaid-flow-bg-hidden");
		this.svg.appendChild(this.bgRect);
		this.groupLayer = activeDocument.createElementNS(SVG_NS, "g");
		this.edgeLayer = activeDocument.createElementNS(SVG_NS, "g");
		this.nodeLayer = activeDocument.createElementNS(SVG_NS, "g");
		this.overlayLayer = activeDocument.createElementNS(SVG_NS, "g");
		this.svg.appendChild(this.groupLayer);
		this.svg.appendChild(this.edgeLayer);
		this.svg.appendChild(this.nodeLayer);
		this.svg.appendChild(this.overlayLayer);

		// Keyboard shortcuts (Delete, arrows, ...) live on the editor's root
		// container; without this, focus never moves into the canvas on a plain
		// node/edge click (SVG children aren't focusable), so those keydowns
		// never bubble to the listener. Capture phase fires before any
		// node/edge/handle-specific pointerdown that calls stopPropagation().
		this.svg.addEventListener(
			"pointerdown",
			(e) => {
				// Don't steal focus from the in-place label editor — that would
				// blur the textarea and immediately close it on the first click.
				if (this.labelEditor && this.labelEditor.contains(e.target as Node)) return;
				this.svg.focus({ preventScroll: true });
			},
			{ capture: true },
		);
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
		this.teardownLabelEditor();
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
		if (!node) return { w: MIN_W, h: NODE_H };
		const g = this.geom(node);
		return { w: Math.round(g.w), h: Math.round(g.h) };
	}

	setMode(mode: EditorMode): void {
		this.mode = mode;
		this.connectFrom = null;
		this.clearGhost();
		this.scroller.classList.toggle("mermaid-flow-mode-connect", mode === "connect");
		this.render();
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
		clone.setAttribute("viewBox", `${this.vbX} ${this.vbY} ${width} ${height}`);
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

	/**
	 * When false, the canvas viewBox only grows to cover new content and never
	 * shrinks as nodes move, giving a stable fixed viewport you can pan beyond.
	 */
	setAutoResize(enabled: boolean): void {
		this.autoResize = enabled;
		this.resizeCanvas();
	}

	/** Notify canvas that Space key is held (enables pan mode). */
	setSpaceDown(down: boolean): void {
		this.spaceDown = down;
		this.scroller.classList.toggle("mermaid-flow-cursor-grab", down);
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

	/**
	 * Content bounds including node half-extents and, when subgraphs exist,
	 * the group box overhang (padding + title bar above the top member).
	 */
	private contentBounds(): { minX: number; minY: number; maxX: number; maxY: number } | null {
		if (this.model.nodes.length === 0) return null;
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		for (const node of this.model.nodes) {
			const g = this.geomCache.get(node.id) ?? this.geom(node);
			minX = Math.min(minX, node.x - g.w / 2);
			minY = Math.min(minY, node.y - g.h / 2);
			maxX = Math.max(maxX, node.x + g.w / 2);
			maxY = Math.max(maxY, node.y + g.h / 2);
		}
		if (this.model.groups.length > 0) {
			minX -= DiagramCanvas.GROUP_PAD;
			maxX += DiagramCanvas.GROUP_PAD;
			minY -= DiagramCanvas.GROUP_PAD + DiagramCanvas.GROUP_TITLE_H;
			maxY += DiagramCanvas.GROUP_PAD;
		}
		return { minX, minY, maxX, maxY };
	}

	/** Scale and scroll to fit all nodes in the visible viewport. */
	zoomToFit(maxZoom: number = MAX_ZOOM): void {
		const b = this.contentBounds();
		if (!b) return;
		const dw = this.scroller.clientWidth;
		const dh = this.scroller.clientHeight;
		if (dw === 0 || dh === 0) return;
		const pad = 60;
		const cw = b.maxX - b.minX + pad * 2;
		const ch = b.maxY - b.minY + pad * 2;
		this.zoom = Math.max(MIN_ZOOM, Math.min(dw / cw, dh / ch, maxZoom));
		this.resizeCanvas();
		this.callbacks.onZoom?.(this.zoom);
		// Centre the content in the viewport so small diagrams don't sit top-left.
		const cx = ((b.minX + b.maxX) / 2 - this.vbX) * this.zoom;
		const cy = ((b.minY + b.maxY) / 2 - this.vbY) * this.zoom;
		this.scroller.scrollLeft = Math.max(0, cx - dw / 2);
		this.scroller.scrollTop = Math.max(0, cy - dh / 2);
	}

	/**
	 * Zoom-to-fit (capped at 100%) as soon as the scroller has real
	 * dimensions. On open the modal is still animating (or the pane is not
	 * laid out yet), so clientWidth/Height can be 0 for several frames.
	 */
	fitWhenReady(): void {
		const tryFit = (): boolean => {
			if (this.scroller.clientWidth > 0 && this.scroller.clientHeight > 0) {
				this.zoomToFit(1);
				return true;
			}
			return false;
		};
		if (tryFit()) return;
		if (typeof ResizeObserver !== "undefined") {
			this.fitObserver = new ResizeObserver(() => {
				if (tryFit()) this.stopFitObserver();
			});
			this.fitObserver.observe(this.scroller);
			window.setTimeout(() => this.stopFitObserver(), 5000);
		} else {
			let attempts = 0;
			const step = () => {
				if (!tryFit() && attempts++ < 30) window.requestAnimationFrame(step);
			};
			window.requestAnimationFrame(step);
		}
	}

	private stopFitObserver(): void {
		this.fitObserver?.disconnect();
		this.fitObserver = null;
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
		const cx = (node.x - this.vbX) * this.zoom;
		const cy = (node.y - this.vbY) * this.zoom;
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
		this.teardownLabelEditor();
		this.stopFitObserver();
		this.scroller.remove();
		this.emptyState?.remove();
	}

	private buildEmptyState(): void {
		const inner = this.emptyState.createDiv({
			cls: "mermaid-flow-canvas-empty-inner",
		});
		inner.createDiv({ cls: "mermaid-flow-canvas-empty-glyph", text: "◆" });
		inner.createEl("p", {
			cls: "mermaid-flow-canvas-empty-title",
			text: "Start your diagram",
		});
		inner.createEl("p", {
			cls: "mermaid-flow-canvas-empty-hint",
			text: "Use the Add shape button in the toolbar to place your first node, then drag from a node's edge dot to connect.",
		});
	}

	/**
	 * Replace the empty-state message, e.g. when the block holds content the
	 * visual editor cannot show (a non-flowchart diagram kept in extras).
	 */
	setEmptyState(opts: {
		title: string;
		hint: string;
		actionLabel?: string;
		onAction?: () => void;
	}): void {
		const inner = this.emptyState.querySelector(
			".mermaid-flow-canvas-empty-inner",
		);
		if (!inner) return;
		clearChildren(inner);
		inner.createDiv({ cls: "mermaid-flow-canvas-empty-glyph", text: "◆" });
		inner.createEl("p", { cls: "mermaid-flow-canvas-empty-title", text: opts.title });
		inner.createEl("p", { cls: "mermaid-flow-canvas-empty-hint", text: opts.hint });
		if (opts.actionLabel && opts.onAction) {
			const btn = inner.createEl("button", {
				cls: "mermaid-flow-canvas-empty-action",
				text: opts.actionLabel,
			});
			btn.addEventListener("click", (e) => {
				e.preventDefault();
				opts.onAction?.();
			});
		}
	}

	// --- geometry -----------------------------------------------------------

	private geom(node: DiagramNode): Geom {
		const g = estimateNodeSize(node);
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
		// Deepest groups first so nested boxes paint above their parents.
		const depth = (id: string, seen = new Set<string>()): number => {
			if (seen.has(id)) return 0;
			seen.add(id);
			const g = this.model.groups.find((x) => x.id === id);
			if (!g?.parentId) return 0;
			return 1 + depth(g.parentId, seen);
		};
		const ordered = [...this.model.groups].sort(
			(a, b) => depth(a.id) - depth(b.id),
		);
		for (const grp of ordered) {
			const memberIds = descendantNodeIds(this.model, grp.id);
			const members = memberIds
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
			const isSelected =
				this.selection?.type === "group" && this.selection.id === grp.id;
			if (isSelected) g.classList.add("is-selected");

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

			if (isSelected) {
				const handle = activeDocument.createElementNS(SVG_NS, "rect");
				const hs = 9;
				handle.setAttribute("x", String(bx + bw - hs / 2));
				handle.setAttribute("y", String(by + bh - hs / 2));
				handle.setAttribute("width", String(hs));
				handle.setAttribute("height", String(hs));
				handle.classList.add("mermaid-flow-resize");
				handle.addEventListener("pointerdown", (e) =>
					this.onGroupResizeDown(e, grp.id),
				);
				g.appendChild(handle);
			}

			this.groupLayer.appendChild(g);
		}
	}

	private resizeCanvas(): void {
		const b = this.contentBounds();
		// Origin stays (0,0) for all-positive content (the common case) and only
		// extends into negative space actually occupied, so nothing clips top/left.
		let vbX = b ? Math.min(0, Math.floor(b.minX - PADDING)) : 0;
		let vbY = b ? Math.min(0, Math.floor(b.minY - PADDING)) : 0;
		const maxX = Math.max(600, b ? b.maxX : 0);
		const maxY = Math.max(400, b ? b.maxY : 0);
		let w = Math.round(maxX + PADDING) - vbX;
		let h = Math.round(maxY + PADDING) - vbY;

		if (!this.autoResize && this.vbW > 0 && this.vbH > 0) {
			// Union with the current viewport instead of refitting to content,
			// so the canvas only ever grows and never shrinks/re-centers.
			const prevMaxX = this.vbX + this.vbW;
			const prevMaxY = this.vbY + this.vbH;
			const nextMinX = Math.min(this.vbX, vbX);
			const nextMinY = Math.min(this.vbY, vbY);
			const nextMaxX = Math.max(prevMaxX, vbX + w);
			const nextMaxY = Math.max(prevMaxY, vbY + h);
			vbX = nextMinX;
			vbY = nextMinY;
			w = nextMaxX - nextMinX;
			h = nextMaxY - nextMinY;
		}

		this.vbX = vbX;
		this.vbY = vbY;
		this.vbW = w;
		this.vbH = h;
		this.svg.setAttribute("width", String(Math.round(w * this.zoom)));
		this.svg.setAttribute("height", String(Math.round(h * this.zoom)));
		this.svg.setAttribute("viewBox", `${this.vbX} ${this.vbY} ${w} ${h}`);
		this.bgRect.setAttribute("x", String(this.vbX));
		this.bgRect.setAttribute("y", String(this.vbY));
		this.bgRect.setAttribute("width", String(w));
		this.bgRect.setAttribute("height", String(h));
		this.paintBackground();
	}

	private paintBackground(): void {
		const bg = this.model.config.background;
		if (bg) {
			this.bgRect.setAttribute("fill", bg);
			this.bgRect.classList.remove("mermaid-flow-bg-hidden");
		} else {
			this.bgRect.classList.add("mermaid-flow-bg-hidden");
		}
	}

	/** Repaint only the diagram background after model.config.background changes. */
	refreshBackground(): void {
		this.paintBackground();
	}

	private renderNodes(): void {
		clearChildren(this.nodeLayer);
		const palette = this.resolvePalette(resolveThemePalette(this.model.config));
		for (const node of this.model.nodes) {
			const g = this.geomCache.get(node.id) ?? this.geom(node);
			const group = activeDocument.createElementNS(SVG_NS, "g");
			group.classList.add("mermaid-flow-node");
			const isSelected =
				this.selection?.type === "node" && this.selection.id === node.id;
			if (isSelected) group.classList.add("is-selected");
			if (this.multi.has(node.id)) group.classList.add("is-multi");
			if (this.connectFrom === node.id) group.classList.add("is-connect-source");
			if (this.linkHoverTarget === node.id) group.classList.add("is-link-target");
			if (node.locked) group.classList.add("is-locked");

			// Effective style: classDef layers resolved beneath the node's own.
			const eff = resolveNodeStyle(this.model, node);
			for (const el of createShapeElements(node.shape, node.x, node.y, g.w, g.h)) {
				el.classList.add("mermaid-flow-shape");
				this.applyShapeStyle(el, eff, palette);
				group.appendChild(el);
			}
			// While editing this node's label in place, hide the baked-in SVG
			// text so it doesn't show through the editor textarea.
			if (this.editingNodeId !== node.id) {
				group.appendChild(this.nodeLabel(node, eff, palette));
			}
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
			group.addEventListener("dblclick", (e) => {
				e.stopPropagation();
				e.preventDefault();
				this.callbacks.onDblClickNode?.(node.id);
				this.beginNodeLabelEdit(node.id);
			});
			this.nodeLayer.appendChild(group);
		}
	}

	/**
	 * Resolve a CSS `var(--x)` colour to a concrete value. `var()` is not honoured
	 * inside SVG presentation attributes (only in stylesheets), so for the default
	 * theme — which uses Obsidian variables to follow the active theme — we read
	 * the computed value here. Concrete colours pass through unchanged.
	 *
	 * Critical: never hand back the raw unresolved `var(...)` string — an invalid
	 * `<paint>` value on a presentation attribute silently falls back to fill's
	 * initial value (black), which is exactly how a previous version of this
	 * function broke the editor (solid black nodes, invisible text) whenever
	 * resolution failed (jsdom in tests, and apparently some live-app cases too).
	 * Always fall back to a concrete hex instead.
	 */
	private resolveColor(c: string): string {
		if (!c.startsWith("var(")) return c;
		const name = c.slice(4, -1).split(",")[0]?.trim() ?? "";
		const fallback = VAR_FALLBACK[name] ?? VAR_FALLBACK_DEFAULT;
		try {
			const v = activeWindow
				.getComputedStyle(activeDocument.body)
				.getPropertyValue(name)
				.trim();
			return v || fallback;
		} catch {
			return fallback;
		}
	}

	/** Resolve every colour in a palette to a concrete value (once per render). */
	private resolvePalette(p: ThemePalette): ThemePalette {
		return {
			nodeFill: this.resolveColor(p.nodeFill),
			nodeStroke: this.resolveColor(p.nodeStroke),
			nodeText: this.resolveColor(p.nodeText),
			lineColor: this.resolveColor(p.lineColor),
		};
	}

	private applyShapeStyle(
		el: SVGElement,
		s: NodeStyle | undefined,
		palette: ThemePalette,
	): void {
		// The node's explicit/classDef style wins; otherwise fall back to the theme
		// palette so a themed diagram looks themed on the canvas, not grey. Shapes
		// that opt out of a fill (fill="none") keep it. Selection/lock state strokes
		// come from CSS, which still overrides these presentation attributes.
		if (el.getAttribute("fill") !== "none") {
			el.setAttribute("fill", s?.fillColor ?? palette.nodeFill);
		}
		el.setAttribute("stroke", s?.strokeColor ?? palette.nodeStroke);
	}

	private nodeLabel(
		node: DiagramNode,
		s: NodeStyle | undefined,
		palette: ThemePalette,
	): SVGTextElement {
		const text = activeDocument.createElementNS(SVG_NS, "text");
		text.setAttribute("x", String(node.x));
		// Anchor at the node centre and centre vertically — without an explicit
		// y the text defaults to y=0 (the top of the canvas).
		text.setAttribute("y", String(node.y));
		text.setAttribute("text-anchor", "middle");
		text.setAttribute("dominant-baseline", "central");
		text.classList.add("mermaid-flow-node-label");
		// Labels carry \n for line breaks (parser decodes <br/> → \n). SVG <text>
		// ignores \n, so render one <tspan> per line, centred around node.y.
		// Each line may also carry inline markup (<b>, <i>, <font color>) —
		// rendered as nested <tspan> runs, never via innerHTML.
		const lines = (node.label || node.id).split("\n");
		if (lines.length <= 1) {
			this.appendInlineRuns(text, lines[0] ?? node.id);
		} else {
			const lineHeight = s?.fontSize ?? 16;
			lines.forEach((line, i) => {
				const tspan = activeDocument.createElementNS(SVG_NS, "tspan");
				tspan.setAttribute("x", String(node.x));
				tspan.setAttribute(
					"dy",
					String(i === 0 ? -((lines.length - 1) / 2) * lineHeight : lineHeight),
				);
				this.appendInlineRuns(tspan, line);
				text.appendChild(tspan);
			});
		}
		text.setAttribute("fill", s?.textColor ?? palette.nodeText);
		if (s?.fontSize) text.setAttribute("font-size", `${s.fontSize}px`);
		if (s?.fontFamily) text.setAttribute("font-family", s.fontFamily);
		return text;
	}

	/**
	 * Render one line of label text into `parent` (a <text> or <tspan>),
	 * expanding supported inline markup (<b>, <i>, <font color>) into nested
	 * <tspan> runs. Plain lines take a fast path identical to the old
	 * `textContent =` assignment.
	 */
	private appendInlineRuns(parent: SVGTextElement | SVGTSpanElement, line: string): void {
		const runs = parseInlineMarkup(line);
		const only = runs.length === 1 ? runs[0] : undefined;
		if (only && !only.bold && !only.italic && !only.color) {
			parent.textContent = only.text;
			return;
		}
		for (const run of runs) {
			const span = activeDocument.createElementNS(SVG_NS, "tspan");
			if (run.bold) span.setAttribute("font-weight", "bold");
			if (run.italic) span.setAttribute("font-style", "italic");
			if (run.color) span.setAttribute("fill", run.color);
			span.textContent = run.text;
			parent.appendChild(span);
		}
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
		const palette = this.resolvePalette(resolveThemePalette(this.model.config));
		// Recolour the shared arrowhead marker to match the theme's line colour.
		this.arrowPath?.setAttribute("fill", palette.lineColor);

		// Parallel-edge separation: edges that connect the same node pair (in
		// either direction) fan out perpendicular to their straight line.
		const pairGroups = new Map<string, DiagramEdge[]>();
		for (const e of this.model.edges) {
			if (e.from === e.to) continue;
			const key = [e.from, e.to].sort().join("|");
			const list = pairGroups.get(key);
			if (list) list.push(e);
			else pairGroups.set(key, [e]);
		}
		const offsets = new Map<string, number>();
		for (const [key, list] of pairGroups) {
			if (list.length < 2) continue;
			const first = key.split("|")[0];
			list.forEach((e, i) => {
				let off = (i - (list.length - 1) / 2) * 18;
				// Opposite-direction edges flip perpendicular sign; mirror the
				// offset so they fan out symmetrically instead of overlapping.
				if (e.from !== first) off = -off;
				offsets.set(e.id, off);
			});
		}

		for (const edge of this.model.edges) {
			const from = nodeById.get(edge.from);
			const to = nodeById.get(edge.to);
			if (!from || !to) continue;

			const geo =
				edge.from === edge.to
					? this.selfLoopPathD(from)
					: this.edgePathD(from, to, offsets.get(edge.id) ?? 0);

			const group = activeDocument.createElementNS(SVG_NS, "g");
			group.classList.add("mermaid-flow-edge");
			const isSelected =
				this.selection?.type === "edge" && this.selection.id === edge.id;
			if (isSelected) group.classList.add("is-selected");

			// Wide invisible hit path for easy clicking.
			const hit = activeDocument.createElementNS(SVG_NS, "path");
			hit.setAttribute("d", geo.d);
			hit.classList.add("mermaid-flow-edge-hit");

			const line = activeDocument.createElementNS(SVG_NS, "path");
			line.setAttribute("d", geo.d);
			line.classList.add("mermaid-flow-edge-line");
			this.styleEdgeLine(line, edge.kind);
			if (edge.animated) line.classList.add("is-animated");
			// Explicit edge colour wins; otherwise the theme line colour. CSS state
			// rules (.is-selected / .is-invisible) still override these.
			line.setAttribute("stroke", edge.style?.strokeColor ?? palette.lineColor);
			if (edge.style?.strokeWidth) {
				line.setAttribute("stroke-width", String(edge.style.strokeWidth));
			}

			group.appendChild(hit);
			group.appendChild(line);

			if (
				edge.kind !== "invisible" &&
				edge.label &&
				edge.label.trim() !== "" &&
				this.editingEdgeId !== edge.id
			) {
				group.appendChild(
					this.edgeLabel(edge.label, geo.mid.x, geo.mid.y, edge),
				);
			}

			group.addEventListener("pointerdown", (e) =>
				this.onEdgeDown(e, edge.id),
			);
			group.addEventListener("contextmenu", (e) =>
				this.onEdgeContext(e, edge.id),
			);
			const labelPoint = geo.mid;
			group.addEventListener("dblclick", (e) => {
				e.stopPropagation();
				e.preventDefault();
				this.beginEdgeLabelEdit(edge.id, labelPoint.x, labelPoint.y);
			});

			if (isSelected) {
				for (const [point, end] of [
					[geo.start, "from"],
					[geo.end, "to"],
				] as const) {
					const handle = activeDocument.createElementNS(SVG_NS, "circle");
					handle.setAttribute("cx", String(point.x));
					handle.setAttribute("cy", String(point.y));
					handle.setAttribute("r", "5");
					handle.classList.add("mermaid-flow-edge-handle");
					handle.addEventListener("pointerdown", (e) =>
						this.onEdgeHandleDown(e, edge.id, end),
					);
					group.appendChild(handle);
				}
			}

			this.edgeLayer.appendChild(group);
		}
	}

	/**
	 * Cubic-bezier path between two nodes. Control points extend along the
	 * diagram's flow axis so paths leave/enter perpendicular to node sides;
	 * `offset` bows the curve sideways for parallel-edge separation.
	 */
	private edgePathD(
		from: DiagramNode,
		to: DiagramNode,
		offset: number,
	): {
		d: string;
		mid: { x: number; y: number };
		start: { x: number; y: number };
		end: { x: number; y: number };
	} {
		const dx = to.x - from.x;
		const dy = to.y - from.y;
		// Flow axis from the diagram direction; fall back to the dominant axis
		// when the nodes sit mostly side-on to it (e.g. manually dragged).
		let horizontal =
			this.model.direction === "LR" || this.model.direction === "RL";
		if (horizontal && Math.abs(dy) > 2 * Math.abs(dx)) horizontal = false;
		else if (!horizontal && Math.abs(dx) > 2 * Math.abs(dy)) horizontal = true;

		const dist = Math.hypot(dx, dy);
		const k = Math.min(120, Math.max(30, 0.4 * dist));
		const ax = horizontal ? Math.sign(dx) || 1 : 0;
		const ay = horizontal ? 0 : Math.sign(dy) || 1;

		// Two-pass: preliminary controls from centres, then border points that
		// aim at them, then final controls from the border points.
		const start = this.borderPoint(from, from.x + ax * k, from.y + ay * k);
		const end = this.borderPoint(to, to.x - ax * k, to.y - ay * k);

		const sx = end.x - start.x;
		const sy = end.y - start.y;
		const len = Math.hypot(sx, sy) || 1;
		const px = (-sy / len) * offset;
		const py = (sx / len) * offset;

		const c1 = { x: start.x + ax * k + px, y: start.y + ay * k + py };
		const c2 = { x: end.x - ax * k + px, y: end.y - ay * k + py };
		const d =
			`M ${rnd(start.x)} ${rnd(start.y)} ` +
			`C ${rnd(c1.x)} ${rnd(c1.y)}, ${rnd(c2.x)} ${rnd(c2.y)}, ` +
			`${rnd(end.x)} ${rnd(end.y)}`;
		// Cubic point at t = 0.5 — where the label sits.
		const mid = {
			x: (start.x + 3 * c1.x + 3 * c2.x + end.x) / 8,
			y: (start.y + 3 * c1.y + 3 * c2.y + end.y) / 8,
		};
		return { d, mid, start, end };
	}

	/** Self-loop (`A --> A`): an arc out the right side (TB/BT) or below (LR/RL). */
	private selfLoopPathD(node: DiagramNode): {
		d: string;
		mid: { x: number; y: number };
		start: { x: number; y: number };
		end: { x: number; y: number };
	} {
		const g = this.geomCache.get(node.id) ?? this.geom(node);
		const horizontal =
			this.model.direction === "LR" || this.model.direction === "RL";
		const reach = Math.max(50, 0.6 * Math.min(g.w, 140));
		let p1: { x: number; y: number };
		let p2: { x: number; y: number };
		let c1: { x: number; y: number };
		let c2: { x: number; y: number };
		if (horizontal) {
			// Loop below the node.
			p1 = { x: node.x - g.w * 0.2, y: node.y + g.h / 2 };
			p2 = { x: node.x + g.w * 0.2, y: node.y + g.h / 2 };
			c1 = { x: p1.x - reach * 0.4, y: p1.y + reach };
			c2 = { x: p2.x + reach * 0.4, y: p2.y + reach };
		} else {
			// Loop out the right side.
			p1 = { x: node.x + g.w / 2, y: node.y - g.h * 0.2 };
			p2 = { x: node.x + g.w / 2, y: node.y + g.h * 0.2 };
			c1 = { x: p1.x + reach, y: p1.y - reach * 0.4 };
			c2 = { x: p2.x + reach, y: p2.y + reach * 0.4 };
		}
		const d =
			`M ${rnd(p1.x)} ${rnd(p1.y)} ` +
			`C ${rnd(c1.x)} ${rnd(c1.y)}, ${rnd(c2.x)} ${rnd(c2.y)}, ` +
			`${rnd(p2.x)} ${rnd(p2.y)}`;
		const mid = {
			x: (p1.x + 3 * c1.x + 3 * c2.x + p2.x) / 8,
			y: (p1.y + 3 * c1.y + 3 * c2.y + p2.y) / 8,
		};
		return { d, mid, start: p1, end: p2 };
	}

	private styleEdgeLine(line: SVGPathElement, kind: EdgeKind): void {
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
		const approxW = measureTextWidth(plainTextFromMarkup(label), `${fontSize}px sans-serif`) + 12;
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
		this.appendInlineRuns(text, label);
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
		this.arrowPath = path;
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
			x: this.vbX + (e.clientX - rect.left) * scaleX,
			y: this.vbY + (e.clientY - rect.top) * scaleY,
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

	/** Drag a selected edge's "from" or "to" endpoint onto a different node. */
	private onEdgeHandleDown(e: PointerEvent, edgeId: string, end: "from" | "to"): void {
		if (e.button !== 0) return;
		e.stopPropagation();
		e.preventDefault();
		this.reconnectEdge = { edgeId, end };
		const edge = this.model.edges.find((ed) => ed.id === edgeId);
		if (edge) {
			const fixedId = end === "from" ? edge.to : edge.from;
			this.updateGhostFrom(fixedId, e);
		}
		try {
			this.svg.setPointerCapture(e.pointerId);
		} catch {
			/* ignore */
		}
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

	/** Snapshot the group's current derived bbox + member geometry for resize. */
	private groupBBox(groupId: string): {
		bx: number;
		by: number;
		bw: number;
		bh: number;
	} | null {
		const byId = new Map(this.model.nodes.map((n) => [n.id, n]));
		const members = descendantNodeIds(this.model, groupId)
			.map((id) => byId.get(id))
			.filter((n): n is DiagramNode => !!n);
		if (members.length === 0) return null;
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
		return {
			bx: minX - pad,
			by: minY - pad - titleH,
			bw: maxX - minX + pad * 2,
			bh: maxY - minY + pad * 2 + titleH,
		};
	}

	private onGroupResizeDown(e: PointerEvent, id: string): void {
		if (e.button !== 0) return;
		e.stopPropagation();
		e.preventDefault();
		const grp = this.model.groups.find((g) => g.id === id);
		const bbox = grp ? this.groupBBox(id) : null;
		if (!grp || !bbox) return;
		const nodes = new Map<string, { x: number; y: number; w: number; h: number }>();
		const byId = new Map(this.model.nodes.map((n) => [n.id, n]));
		for (const nodeId of descendantNodeIds(this.model, id)) {
			const node = byId.get(nodeId);
			if (!node) continue;
			const g = this.geomCache.get(node.id) ?? this.geom(node);
			nodes.set(nodeId, { x: node.x, y: node.y, w: g.w, h: g.h });
		}
		this.groupResizeId = id;
		this.groupResizeOrigin = { ...bbox, nodes };
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
			this.scroller.classList.remove("mermaid-flow-cursor-grab");
			this.scroller.classList.add("mermaid-flow-cursor-grabbing");
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
		this.rubberRect = activeDocument.createElementNS(SVG_NS, "rect");
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

	// --- in-place label editing (draw.io style) -----------------------------

	/** Double-click a node to edit its label directly on the canvas. */
	private beginNodeLabelEdit(nodeId: string): void {
		const node = this.model.nodes.find((n) => n.id === nodeId);
		if (!node || node.locked) return;
		const g = this.geomCache.get(node.id) ?? this.geom(node);
		const w = Math.max(60, g.w);
		const h = Math.max(28, g.h);
		this.editingNodeId = nodeId;
		this.editingEdgeId = null;
		this.renderNodes(); // hide the baked-in label underneath
		this.openLabelEditor(
			{ x: node.x - w / 2, y: node.y - h / 2, w, h },
			node.label,
			(value) => {
				node.label = value;
				this.geomCache.delete(node.id);
				this.callbacks.onChange();
			},
		);
	}

	/** Double-click an edge to edit its label directly on the canvas. */
	private beginEdgeLabelEdit(edgeId: string, midX: number, midY: number): void {
		const edge = this.model.edges.find((ed) => ed.id === edgeId);
		if (!edge) return;
		const w = 120;
		const h = 30;
		this.editingEdgeId = edgeId;
		this.editingNodeId = null;
		this.renderEdges(); // hide the baked-in label underneath
		this.openLabelEditor(
			{ x: midX - w / 2, y: midY - h / 2, w, h },
			edge.label,
			(value) => {
				edge.label = value;
				this.callbacks.onChange();
			},
		);
	}

	/**
	 * Open a <foreignObject> textarea over the given SVG-space rect. Because it
	 * lives in the SVG, it tracks zoom/pan/scroll for free. Enter commits,
	 * Shift+Enter inserts a newline, Escape/blur-elsewhere cancels.
	 */
	private openLabelEditor(
		rect: { x: number; y: number; w: number; h: number },
		value: string,
		commit: (value: string) => void,
	): void {
		this.cancelLabelEdit(); // never stack two editors

		const fo = activeDocument.createElementNS(SVG_NS, "foreignObject");
		fo.setAttribute("x", String(rect.x));
		fo.setAttribute("y", String(rect.y));
		fo.setAttribute("width", String(rect.w));
		fo.setAttribute("height", String(rect.h));
		fo.classList.add("mermaid-flow-label-editor");

		const input = activeDocument.createElementNS(XHTML_NS, "textarea") as HTMLTextAreaElement;
		input.className = "mermaid-flow-label-input";
		input.value = value;
		input.rows = 1;
		fo.appendChild(input);
		this.overlayLayer.appendChild(fo);
		this.labelEditor = fo;
		this.labelInput = input;

		let done = false;
		const finish = (save: boolean) => {
			if (done) return;
			done = true;
			const text = save ? input.value : null;
			this.teardownLabelEditor();
			if (save && text !== null) commit(text);
			// Re-render either way so the previously-hidden label reappears
			// (the host's onChange handler doesn't itself re-render the canvas).
			this.render();
		};

		// Stop canvas pointer handlers (select/rubber-band/pan) firing underneath.
		fo.addEventListener("pointerdown", (e) => e.stopPropagation());
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				e.stopPropagation();
				finish(true);
			} else if (e.key === "Escape") {
				e.preventDefault();
				e.stopPropagation();
				finish(false);
			}
		});
		input.addEventListener("blur", () => finish(true));

		// Focus after the current event settles so the dblclick doesn't re-blur it.
		window.setTimeout(() => {
			input.focus();
			input.select();
		}, 0);
	}

	/** Public/cancel entry point — discard any open editor without saving. */
	private cancelLabelEdit(): void {
		if (!this.labelEditor) return;
		this.teardownLabelEditor();
	}

	private teardownLabelEditor(): void {
		this.editingNodeId = null;
		this.editingEdgeId = null;
		if (this.labelEditor) {
			this.labelEditor.remove();
			this.labelEditor = null;
		}
		this.labelInput = null;
	}

	private onDrop(e: DragEvent): void {
		e.preventDefault();
		// Check for .mmd file drop first
		const files = e.dataTransfer?.files;
		if (files && files.length > 0) {
			const file = files[0];
			if (file && file.type.startsWith("image/")) {
				this.callbacks.onImportImage?.(file);
				return;
			}
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
		const svgX = this.vbX + (e.clientX - svgRect.left) * scaleX;
		const svgY = this.vbY + (e.clientY - svgRect.top) * scaleY;
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
			this.clearGuides();
			if (moveIds.length === 1) {
				const dragged = this.model.nodes.find((n) => n.id === moveIds[0]);
				if (dragged) this.updateAlignmentGuides(dragged);
			}
			this.resizeCanvas();
			this.renderGroups();
			this.renderEdges();
			this.renderNodes();
			return;
		}

		if (this.groupResizeId && this.groupResizeOrigin) {
			const p = this.toSvgPoint(e);
			const origin = this.groupResizeOrigin;
			const minW = 80;
			const minH = 60 + DiagramCanvas.GROUP_TITLE_H;
			const newW = Math.max(minW, p.x - origin.bx);
			const newH = Math.max(minH, p.y - origin.by);
			const scaleX = newW / origin.bw;
			const scaleY = newH / origin.bh;
			for (const [nodeId, orig] of origin.nodes) {
				const node = this.model.nodes.find((n) => n.id === nodeId);
				if (!node) continue;
				node.x = origin.bx + (orig.x - origin.bx) * scaleX;
				node.y = origin.by + (orig.y - origin.by) * scaleY;
				if (node.w && node.h) {
					node.w = Math.max(48, orig.w * scaleX);
					node.h = Math.max(32, orig.h * scaleY);
				}
				this.geomCache.delete(nodeId);
			}
			this.resizeCanvas();
			this.renderGroups();
			this.renderEdges();
			this.renderNodes();
			return;
		}

		if (this.reconnectEdge) {
			const p = this.toSvgPoint(e);
			const edge = this.model.edges.find((ed) => ed.id === this.reconnectEdge?.edgeId);
			if (edge) {
				const fixedId = this.reconnectEdge.end === "from" ? edge.to : edge.from;
				const hit = this.nodeAt(p.x, p.y);
				this.linkHoverTarget = hit && hit.id !== fixedId ? hit.id : null;
				this.updateGhostFrom(fixedId, e);
				this.renderNodes();
			}
			return;
		}

		if (this.linkFrom) {
			const p = this.toSvgPoint(e);
			const hit = this.nodeAt(p.x, p.y);
			this.linkHoverTarget = hit && hit.id !== this.linkFrom ? hit.id : null;
			this.updateGhostFrom(this.linkFrom, e);
			this.renderNodes();
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
		const ids = descendantNodeIds(this.model, groupId);
		if (ids.length === 0) return;
		this.moveNodes(ids, dx, dy);
	}

	private snap(val: number): number {
		if (!this.snapSize) return Math.round(val);
		return Math.round(val / this.snapSize) * this.snapSize;
	}

	private moveNodes(ids: string[], dx: number, dy: number): void {
		const set = new Set(ids);
		for (const node of this.model.nodes) {
			if (!set.has(node.id)) continue;
			// Free canvas movement — no hard min clamp. Optional grid snap only.
			node.x = this.snap(node.x + dx);
			node.y = this.snap(node.y + dy);
		}
	}

	private clearGuides(): void {
		for (const line of this.guideLines) line.remove();
		this.guideLines = [];
	}

	/**
	 * Draw.io-style smart guides: while dragging a single node, show dashed
	 * lines when edges/centres line up with another node. Guides are visual
	 * only — they must not mutate position (that felt like sticky anchoring).
	 */
	private updateAlignmentGuides(node: DiagramNode): void {
		const g = this.geomCache.get(node.id) ?? this.geom(node);
		const threshold = 4 / this.zoom;
		const xCandidates = [node.x - g.w / 2, node.x, node.x + g.w / 2];
		const yCandidates = [node.y - g.h / 2, node.y, node.y + g.h / 2];

		let guideX: { at: number; y0: number; y1: number } | null = null;
		let guideY: { at: number; x0: number; x1: number } | null = null;

		for (const other of this.model.nodes) {
			if (other.id === node.id) continue;
			const og = this.geomCache.get(other.id) ?? this.geom(other);
			const oxs = [other.x - og.w / 2, other.x, other.x + og.w / 2];
			const oys = [other.y - og.h / 2, other.y, other.y + og.h / 2];

			if (guideX === null) {
				for (const xc of xCandidates) {
					const match = oxs.find((ox) => Math.abs(xc - ox) <= threshold);
					if (match !== undefined) {
						guideX = {
							at: match,
							y0: Math.min(node.y, other.y),
							y1: Math.max(node.y, other.y),
						};
						break;
					}
				}
			}
			if (guideY === null) {
				for (const yc of yCandidates) {
					const match = oys.find((oy) => Math.abs(yc - oy) <= threshold);
					if (match !== undefined) {
						guideY = {
							at: match,
							x0: Math.min(node.x, other.x),
							x1: Math.max(node.x, other.x),
						};
						break;
					}
				}
			}
			if (guideX !== null && guideY !== null) break;
		}

		if (guideX) {
			const line = activeDocument.createElementNS(SVG_NS, "line");
			line.classList.add("mermaid-flow-guide");
			line.setAttribute("x1", String(guideX.at));
			line.setAttribute("y1", String(guideX.y0 - 20));
			line.setAttribute("x2", String(guideX.at));
			line.setAttribute("y2", String(guideX.y1 + 20));
			this.overlayLayer.appendChild(line);
			this.guideLines.push(line);
		}
		if (guideY) {
			const line = activeDocument.createElementNS(SVG_NS, "line");
			line.classList.add("mermaid-flow-guide");
			line.setAttribute("x1", String(guideY.x0 - 20));
			line.setAttribute("y1", String(guideY.at));
			line.setAttribute("x2", String(guideY.x1 + 20));
			line.setAttribute("y2", String(guideY.at));
			this.overlayLayer.appendChild(line);
			this.guideLines.push(line);
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
			this.scroller.classList.remove("mermaid-flow-cursor-grabbing");
			this.scroller.classList.toggle("mermaid-flow-cursor-grab", this.spaceDown);
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
			this.clearGuides();
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

		if (this.groupResizeId) {
			this.groupResizeId = null;
			this.groupResizeOrigin = null;
			try {
				this.svg.releasePointerCapture(e.pointerId);
			} catch {
				/* ignore */
			}
			this.callbacks.onChange();
			return;
		}

		if (this.reconnectEdge) {
			const p = this.toSvgPoint(e);
			const target = this.nodeAt(p.x, p.y);
			const { edgeId, end } = this.reconnectEdge;
			this.reconnectEdge = null;
			this.linkHoverTarget = null;
			this.clearGhost();
			try {
				this.svg.releasePointerCapture(e.pointerId);
			} catch {
				/* ignore */
			}
			const edge = this.model.edges.find((ed) => ed.id === edgeId);
			if (edge && target) {
				if (end === "from") edge.from = target.id;
				else edge.to = target.id;
				this.callbacks.onChange();
			}
			this.render();
			return;
		}

		if (this.linkFrom) {
			const p = this.toSvgPoint(e);
			const target = this.nodeAt(p.x, p.y);
			const from = this.linkFrom;
			this.linkFrom = null;
			this.linkHoverTarget = null;
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
			this.ghostLine = activeDocument.createElementNS(SVG_NS, "line");
			this.ghostLine.classList.add("mermaid-flow-ghost-line");
			this.overlayLayer.appendChild(this.ghostLine);
		}
		const start = this.borderPoint(from, p.x, p.y);
		// Snap the free end to the hovered target's border (facing the source)
		// instead of the raw cursor, like draw.io's connection-point feedback.
		const hoverNode = this.linkHoverTarget
			? this.model.nodes.find((n) => n.id === this.linkHoverTarget)
			: undefined;
		const endPoint = hoverNode
			? this.borderPoint(hoverNode, from.x, from.y)
			: p;
		this.ghostLine.setAttribute("x1", String(start.x));
		this.ghostLine.setAttribute("y1", String(start.y));
		this.ghostLine.setAttribute("x2", String(endPoint.x));
		this.ghostLine.setAttribute("y2", String(endPoint.y));
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
		if (!this.connectFrom) return;
		this.updateGhostFrom(this.connectFrom, e);
	}

	private clearGhost(): void {
		if (this.ghostLine) {
			this.ghostLine.remove();
			this.ghostLine = null;
		}
	}
}
