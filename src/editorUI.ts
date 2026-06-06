/*
 * DiagramEditorUI — host-agnostic coordinator.
 *
 * Owns the canvas, properties panel, toolbar, code view and export manager.
 * Each sub-component lives in its own file; this class wires them together,
 * handles the change pipeline (undo/redo, auto-save) and keyboard shortcuts.
 */

import { App, Menu, Modal, Notice, setIcon } from "obsidian";
import type { AlignDir, DistributeDir } from "./alignTools";
import { alignNodes, distributeNodes } from "./alignTools";
import { STYLE_PRESETS } from "./presets";
import { CanvasCallbacks, DiagramCanvas, EditorMode } from "./canvas";
import { CodeView } from "./codeView";
import { ExportManager } from "./exportManager";
import { autoLayout, layoutMissing } from "./layout";
import {
	DiagramModel,
	NodeShape,
	bringToFront,
	cloneModel,
	duplicateNode,
	newEdgeId,
	newGroupId,
	nextNodeId,
	removeEdge,
	removeGroup,
	removeNode,
	sendToBack,
} from "./model";
import { LAYOUT_PRESETS, SPACING_PRESETS, THEME_PRESETS } from "./presets";
import { PropertiesPanel } from "./propertiesPanel";
import { modelToMermaid } from "./serializer";
import { ToolbarRefs, ToolbarOps, buildSlottedActions, buildToolbar } from "./toolbar";
import { mermaidToModel } from "./parser";

export interface EditorHost {
	persist: (model: DiagramModel) => void;
	close: () => void;
	autoSave?: boolean;
	closeOnSave?: boolean;
	saveLabel?: string;
	toolbarStyle?: "native" | "floating";
	exportFolder?: string;
	/** Snap-to-grid cell size in pixels; 0 means no snap. */
	snapSize?: number;
	actionsSlot?: HTMLElement;
}

export class DiagramEditorUI {
	private app: App;
	private root: HTMLElement;
	private model: DiagramModel;
	private host: EditorHost;

	private canvas!: DiagramCanvas;
	private panel!: PropertiesPanel;
	private codeView!: CodeView;
	private exporter!: ExportManager;
	private tbRefs!: ToolbarRefs;

	private panelEl!: HTMLElement;
	private mode: EditorMode = "select";
	private lockLayout = false;

	// undo / redo
	private ready = false;
	private history: DiagramModel[] = [];
	private historyIndex = -1;
	private historyTimer = 0;
	private autoSaveTimer = 0;

	// copy-paste clipboard
	private copyBuffer: DiagramModel["nodes"] = [];

	// find bar
	private findBarEl: HTMLElement | null = null;
	private findActive = false;

	// keyboard handlers (stored for removal on destroy)
	private keyHandler?: (e: KeyboardEvent) => void;
	private trapHandler?: (e: KeyboardEvent) => void;

	constructor(app: App, root: HTMLElement, model: DiagramModel, host: EditorHost) {
		this.app = app;
		this.root = root;
		this.model = model;
		this.host = host;
	}

	build(): void {
		const floating = (this.host.toolbarStyle ?? "native") === "floating";
		this.root.addClass("mermaid-flow-editor");
		this.root.toggleClass("is-toolbar-floating", floating);
		this.root.toggleClass("is-toolbar-native", !floating);
		this.root.toggleClass("is-actions-docked", !this.host.actionsSlot);

		const bar = this.root.createDiv({ cls: "mermaid-flow-toolbar" });
		const body = this.root.createDiv({ cls: "mermaid-flow-body" });
		const canvasHost = body.createDiv({ cls: "mermaid-flow-canvas-host" });
		this.panelEl = body.createDiv({ cls: "mermaid-flow-panel" });

		// Canvas
		const callbacks: CanvasCallbacks = {
			onSelect: () => this.refreshPanel(),
			onChange: () => { this.refreshPanel(); this.commit(); },
			onContextMenu: (e, empty) => this.showContextMenu(e, empty),
			onZoom: (z) => this.tbRefs?.updateZoomLabel(z),
			onDblClickBackground: (x, y) => this.addNodeAt("rect", x, y),
			onDblClickNode: (id) => { this.canvas.select({ type: "node", id }); this.refreshPanel(); this.focusLabel(); },
			onMultiChange: () => this.tbRefs?.updateAlignGroup(),
			onImportFile: (text) => this.importMermaidText(text),
		};
		this.canvas = new DiagramCanvas(canvasHost, this.model, callbacks);

		this.canvas.setSnapGrid(this.host.snapSize ?? 0);

		// Edge-type picker: shown after drawing a new edge with anchor-drag
		this.canvas.setNewEdgePickerCallback((edgeId, e) => this.showEdgeTypePicker(edgeId, e));

		// Find bar (hidden until Ctrl+F)
		this.findBarEl = this.root.createDiv({ cls: "mermaid-flow-find-bar" });
		this.findBarEl.hide();
		this.buildFindBar(this.findBarEl);

		// Properties panel
		this.panel = new PropertiesPanel(
			this.panelEl,
			() => this.model,
			() => this.canvas,
			{
				commit: () => this.commit(),
				render: () => this.canvas.render(),
				refresh: () => this.refreshPanel(),
				quickAddStep: () => this.quickAddStep(),
				quickAddBranch: () => this.quickAddBranch(),
				quickAddChild: () => this.quickAddChild(),
				applyStylePreset: (id) => this.applyStylePreset(id),
				duplicateSelected: () => this.duplicateSelected(),
				deleteSelected: () => this.deleteSelected(),
				addSubgraph: () => this.addSubgraph(),
				ungroupSelected: () => this.ungroupSelected(),
				reverseSelectedEdge: () => this.reverseSelectedEdge(),
				focusLabel: () => this.focusLabel(),
			},
		);

		// Code view
		this.codeView = new CodeView({
			getModel: () => this.model,
			setModel: (m) => { this.model = m; },
			getCanvas: () => this.canvas,
			commit: () => this.commit(),
			refresh: () => this.refreshPanel(),
			pushHistory: () => this.pushHistory(),
		});
		this.codeView.build(this.root);

		// Export manager
		this.exporter = new ExportManager({
			app: this.app,
			getCanvas: () => this.canvas,
			getModel: () => this.model,
			getExportFolder: () => this.host.exportFolder ?? "mermaid flow",
		});

		// Toolbar
		const tbOps: ToolbarOps = {
			undo: () => this.undo(),
			redo: () => this.redo(),
			setMode: (m) => this.setMode(m),
			getMode: () => this.mode,
			addNode: (s) => this.addNode(s),
			addNodeAt: (s, x, y) => this.addNodeAt(s, x, y),
			showLayoutMenu: (e) => this.showLayoutMenu(e),
			toggleLock: () => this.toggleLock(),
			isLocked: () => this.lockLayout,
			addSubgraph: () => this.addSubgraph(),
			deleteSelected: () => this.deleteSelected(),
			toggleCode: () => this.codeView.toggle(),
			showExportMenu: (e) => this.exporter.showMenu(e),
			showHelpDialog: () => this.showHelpDialog(),
			zoomToFit: () => this.canvas.zoomToFit(),
			applyTheme: (id) => this.applyTheme(id),
			matchesTheme: (id) => this.matchesTheme(id),
			applyDirection: (d) => { this.model.direction = d; this.commit(); },
			getCurrentDirection: () => this.model.direction,
			alignSelected: (d) => this.alignSelected(d),
			distributeSelected: (d) => this.distributeSelected(d),
			discard: () => this.discard(),
			save: () => this.save(),
			getCanvas: () => this.canvas,
			getMultiCount: () => this.canvas.getMultiSelection().length,
			getSaveLabel: () => this.host.saveLabel ?? "Save",
			hasActionsSlot: () => !!this.host.actionsSlot,
		};
		this.tbRefs = buildToolbar(bar, tbOps);

		if (this.host.actionsSlot) buildSlottedActions(this.host.actionsSlot, tbOps);

		const footer = this.root.createDiv({ cls: "mermaid-flow-footer" });
		if (this.host.autoSave) {
			footer.createSpan({ cls: "mermaid-flow-autosave-note", text: "✓ Auto-saving enabled" });
		}

		this.registerKeys();
		this.refreshPanel();
		this.pushHistory();
		this.ready = true;
		this.updateUndoRedo();
	}

	destroy(): void {
		if (this.keyHandler) this.root.removeEventListener("keydown", this.keyHandler);
		if (this.trapHandler) this.root.removeEventListener("keydown", this.trapHandler);
		window.clearTimeout(this.historyTimer);
		window.clearTimeout(this.autoSaveTimer);
		this.codeView?.destroy();
		this.canvas?.destroy();
		this.root.empty();
		this.root.removeClass("mermaid-flow-editor");
	}

	// --- change pipeline ----------------------------------------------------

	private commit(): void {
		this.codeView.sync();
		if (!this.ready) return;
		this.scheduleHistory();
		this.scheduleAutoSave();
	}

	private scheduleHistory(): void {
		window.clearTimeout(this.historyTimer);
		this.historyTimer = window.setTimeout(() => this.pushHistory(), 400);
	}

	pushHistory(): void {
		const snapshot = cloneModel(this.model);
		const prev = this.history[this.historyIndex];
		if (prev && modelToMermaid(prev) === modelToMermaid(snapshot)) return;
		this.history = this.history.slice(0, this.historyIndex + 1);
		this.history.push(snapshot);
		if (this.history.length > 60) this.history.shift();
		this.historyIndex = this.history.length - 1;
		this.updateUndoRedo();
	}

	private undo(): void {
		window.clearTimeout(this.historyTimer);
		if (this.historyIndex <= 0) return;
		this.historyIndex--;
		this.restoreHistory();
	}

	private redo(): void {
		window.clearTimeout(this.historyTimer);
		if (this.historyIndex >= this.history.length - 1) return;
		this.historyIndex++;
		this.restoreHistory();
	}

	private restoreHistory(): void {
		const snap = this.history[this.historyIndex];
		if (!snap) return;
		this.model = cloneModel(snap);
		this.canvas.setModel(this.model);
		this.refreshPanel();
		this.codeView.sync();
		this.updateUndoRedo();
		this.scheduleAutoSave();
	}

	private scheduleAutoSave(): void {
		if (!this.host.autoSave) return;
		window.clearTimeout(this.autoSaveTimer);
		this.autoSaveTimer = window.setTimeout(() => this.host.persist(this.model), 700);
	}

	private updateUndoRedo(): void {
		this.tbRefs?.undoBtn?.toggleClass("is-disabled", this.historyIndex <= 0);
		this.tbRefs?.redoBtn?.toggleClass(
			"is-disabled",
			this.historyIndex >= this.history.length - 1,
		);
	}

	// --- panel --------------------------------------------------------------

	private refreshPanel(): void {
		this.panel?.refresh();
		this.tbRefs?.updateAlignGroup();
	}

	private focusLabel(): void {
		const input = this.panel?.getLabelInput();
		if (input) { input.focus(); input.select(); }
	}

	// --- node operations ----------------------------------------------------

	private addNode(shape: NodeShape): void {
		const id = nextNodeId(this.model);
		let x = 140, y = 90;
		const scroller = this.root.querySelector(".mermaid-flow-canvas-scroll") as HTMLElement | null;
		if (scroller) {
			x = scroller.scrollLeft + scroller.clientWidth / 2;
			y = scroller.scrollTop + scroller.clientHeight / 2;
		}
		const jitter = (this.model.nodes.length % 6) * 24;
		this.model.nodes.push({ id, label: id, shape, x: Math.round(x + jitter), y: Math.round(y + jitter) });
		this.canvas.render();
		this.canvas.select({ type: "node", id });
		this.commit();
	}

	private addNodeAt(shape: NodeShape, svgX: number, svgY: number): void {
		const id = nextNodeId(this.model);
		this.model.nodes.push({ id, label: id, shape, x: Math.round(svgX), y: Math.round(svgY) });
		this.canvas.render();
		this.canvas.select({ type: "node", id });
		this.commit();
	}

	private duplicateSelected(): void {
		const sel = this.canvas.getSelection();
		if (!sel || sel.type !== "node") return;
		const newId = duplicateNode(this.model, sel.id);
		if (!newId) return;
		this.canvas.render();
		this.canvas.select({ type: "node", id: newId });
		this.commit();
	}

	private copySelected(): void {
		const multi = this.canvas.getMultiSelection();
		const sel = this.canvas.getSelection();
		const ids = multi.length > 1 ? multi : sel?.type === "node" ? [sel.id] : [];
		if (ids.length === 0) return;
		this.copyBuffer = ids
			.map((id) => this.model.nodes.find((n) => n.id === id))
			.filter((n): n is DiagramModel["nodes"][number] => n !== undefined)
			.map((n) => ({ ...n, style: n.style ? { ...n.style } : undefined }));
		new Notice(`${this.copyBuffer.length} node(s) copied`);
	}

	private pasteNodes(): void {
		if (this.copyBuffer.length === 0) return;
		const offset = 30;
		const newIds: string[] = [];
		for (const src of this.copyBuffer) {
			const id = nextNodeId(this.model);
			this.model.nodes.push({
				...src,
				id,
				x: src.x + offset,
				y: src.y + offset,
				style: src.style ? { ...src.style } : undefined,
			});
			newIds.push(id);
		}
		this.canvas.render();
		// Select all pasted nodes
		if (newIds.length === 1 && newIds[0]) {
			this.canvas.select({ type: "node", id: newIds[0] });
		} else {
			this.canvas.selectIds(newIds);
		}
		this.commit();
	}

	private deleteSelected(): void {
		const multi = this.canvas.getMultiSelection();
		if (multi.length > 1) {
			for (const id of multi) removeNode(this.model, id);
			this.canvas.select(null);
			this.canvas.render();
			this.refreshPanel();
			this.commit();
			return;
		}
		const sel = this.canvas.getSelection();
		if (!sel) { new Notice("Nothing selected."); return; }
		if (sel.type === "node") removeNode(this.model, sel.id);
		else removeEdge(this.model, sel.id);
		this.canvas.select(null);
		this.canvas.render();
		this.refreshPanel();
		this.commit();
	}

	private addSubgraph(): void {
		const multi = this.canvas.getMultiSelection();
		const sel = this.canvas.getSelection();
		const members = multi.length > 0 ? multi : sel?.type === "node" ? [sel.id] : [];
		if (members.length === 0) {
			new Notice("Select one or more nodes (Shift-click or drag a box), then group.");
			return;
		}
		const id = newGroupId(this.model);
		const num = this.model.groups.length + 1;
		this.model.groups.push({ id, title: `Subgraph ${num}`, nodeIds: [...members] });
		this.canvas.render();
		this.canvas.select({ type: "group", id });
		this.commit();
	}

	private ungroupSelected(): void {
		const sel = this.canvas.getSelection();
		if (!sel || sel.type !== "group") return;
		removeGroup(this.model, sel.id);
		this.canvas.select(null);
		this.canvas.render();
		this.refreshPanel();
		this.commit();
	}

	private quickAddStep(): void {
		const sel = this.canvas.getSelection();
		if (!sel || sel.type !== "node") return;
		const id = this.addConnectedNode(sel.id, "Step", "rect", this.flowOffset());
		if (!id) return;
		this.canvas.render();
		this.canvas.select({ type: "node", id });
		this.commit();
	}

	private quickAddChild(): void {
		const sel = this.canvas.getSelection();
		if (!sel || sel.type !== "node") return;
		const id = this.addConnectedNode(sel.id, "Child", "rect", this.flowOffset());
		if (!id) return;
		this.canvas.render();
		this.canvas.select({ type: "node", id });
		this.commit();
	}

	private quickAddBranch(): void {
		const sel = this.canvas.getSelection();
		if (!sel || sel.type !== "node") return;
		const { dx, dy } = this.flowOffset();
		const horiz = dx !== 0;
		const off1 = horiz ? { dx, dy: -90 } : { dx: -130, dy };
		const off2 = horiz ? { dx, dy: 90 } : { dx: 130, dy };
		const yes = this.addConnectedNode(sel.id, "Yes path", "rect", off1);
		const no = this.addConnectedNode(sel.id, "No path", "rect", off2);
		const edges = this.model.edges.filter((e) => e.from === sel.id);
		const yesEdge = edges.find((e) => e.to === yes);
		const noEdge = edges.find((e) => e.to === no);
		if (yesEdge) yesEdge.label = "Yes";
		if (noEdge) noEdge.label = "No";
		this.canvas.render();
		this.canvas.select(null);
		this.commit();
	}

	private addConnectedNode(
		fromId: string,
		label: string,
		shape: NodeShape,
		offset: { dx: number; dy: number },
	): string | null {
		const src = this.model.nodes.find((n) => n.id === fromId);
		if (!src) return null;
		const id = nextNodeId(this.model);
		this.model.nodes.push({
			id, label, shape,
			x: Math.max(40, Math.round(src.x + offset.dx)),
			y: Math.max(30, Math.round(src.y + offset.dy)),
		});
		this.model.edges.push({ id: newEdgeId(), from: fromId, to: id, label: "", kind: "arrow" });
		return id;
	}

	private flowOffset(): { dx: number; dy: number } {
		switch (this.model.direction) {
			case "LR": return { dx: 220, dy: 0 };
			case "RL": return { dx: -220, dy: 0 };
			case "BT": return { dx: 0, dy: -150 };
			default:   return { dx: 0, dy: 150 };
		}
	}

	private applyStylePreset(presetId: string): void {
		const sel = this.canvas.getSelection();
		if (!sel || sel.type !== "node") return;
		const node = this.model.nodes.find((n) => n.id === sel.id);
		const preset = STYLE_PRESETS.find((p) => p.id === presetId);
		if (!node || !preset) return;
		node.shape = preset.shape;
		node.style = { ...preset.style };
		this.canvas.render();
		this.refreshPanel();
		this.commit();
	}

	private reverseSelectedEdge(): void {
		const sel = this.canvas.getSelection();
		if (!sel || sel.type !== "edge") return;
		const edge = this.model.edges.find((ed) => ed.id === sel.id);
		if (!edge) return;
		const tmp = edge.from;
		edge.from = edge.to;
		edge.to = tmp;
		this.canvas.render();
		this.commit();
	}

	private bringToFront(): void {
		const sel = this.canvas.getSelection();
		if (!sel || sel.type !== "node") return;
		bringToFront(this.model, sel.id);
		this.canvas.render();
		this.commit();
	}

	private sendToBack(): void {
		const sel = this.canvas.getSelection();
		if (!sel || sel.type !== "node") return;
		sendToBack(this.model, sel.id);
		this.canvas.render();
		this.commit();
	}

	private showEdgeTypePicker(edgeId: string, e: MouseEvent): void {
		const edge = this.model.edges.find((ed) => ed.id === edgeId);
		if (!edge) return;
		const menu = new Menu();
		const kinds: Array<{ label: string; kind: import("./model").EdgeKind; icon: string }> = [
			{ label: "Arrow →", kind: "arrow", icon: "arrow-right" },
			{ label: "Open line —", kind: "open", icon: "minus" },
			{ label: "Dotted -→", kind: "dotted", icon: "more-horizontal" },
			{ label: "Thick ⇒", kind: "thick", icon: "chevrons-right" },
			{ label: "Bidirectional ↔", kind: "bidirectional", icon: "arrow-left-right" },
		];
		for (const { label, kind, icon } of kinds) {
			menu.addItem((item) =>
				item.setTitle(label).setIcon(icon).onClick(() => {
					edge.kind = kind;
					this.canvas.render();
					this.refreshPanel();
					this.commit();
				}),
			);
		}
		menu.showAtMouseEvent(e);
	}

	// --- find node -----------------------------------------------------------

	private buildFindBar(bar: HTMLElement): void {
		const input = bar.createEl("input", {
			type: "text",
			cls: "mermaid-flow-find-input",
			attr: { placeholder: "Find nodes…" },
		});
		const close = bar.createEl("button", { cls: "mermaid-flow-icon-btn" });
		setIcon(close, "x");
		close.setAttribute("aria-label", "Close find bar");

		let lastQuery = "";
		const run = () => {
			const q = input.value.trim().toLowerCase();
			if (q === lastQuery) return;
			lastQuery = q;
			if (!q) {
				this.canvas.highlightNodes(new Set());
				return;
			}
			const matched = new Set(
				this.model.nodes
					.filter((n) => n.label.toLowerCase().includes(q) || n.id.toLowerCase().includes(q))
					.map((n) => n.id),
			);
			this.canvas.highlightNodes(matched);
			const first = [...matched][0];
			if (first) this.canvas.scrollNodeIntoView(first);
		};
		input.addEventListener("input", run);
		input.addEventListener("keydown", (e) => {
			if (e.key === "Escape") this.closeFindBar();
			if (e.key === "Enter") {
				// Cycle to next match
				const q = input.value.trim().toLowerCase();
				const matches = this.model.nodes.filter(
					(n) => n.label.toLowerCase().includes(q) || n.id.toLowerCase().includes(q),
				);
				if (matches.length > 1) {
					const sel = this.canvas.getSelection();
					const curIdx = sel?.type === "node" ? matches.findIndex((n) => n.id === sel.id) : -1;
					const next = matches[(curIdx + 1) % matches.length];
					if (next) {
						this.canvas.select({ type: "node", id: next.id });
						this.canvas.scrollNodeIntoView(next.id);
					}
				}
			}
		});
		close.addEventListener("click", () => this.closeFindBar());
	}

	private openFindBar(): void {
		if (!this.findBarEl) return;
		this.findActive = true;
		this.findBarEl.show();
		const input = this.findBarEl.querySelector<HTMLInputElement>("input");
		window.setTimeout(() => { input?.focus(); input?.select(); }, 0);
	}

	private closeFindBar(): void {
		if (!this.findBarEl) return;
		this.findActive = false;
		this.findBarEl.hide();
		this.canvas.highlightNodes(new Set());
		const input = this.findBarEl.querySelector<HTMLInputElement>("input");
		if (input) input.value = "";
	}

	// --- align & distribute -------------------------------------------------

	private importMermaidText(text: string): void {
		try {
			const { model, warnings } = mermaidToModel(text);
			layoutMissing(model);
			this.model = model;
			this.canvas.setModel(this.model);
			this.refreshPanel();
			this.codeView.sync();
			this.pushHistory();
			if (warnings.length > 0) new Notice(`Imported with ${warnings.length} warning(s).`);
			else new Notice("Diagram imported.");
		} catch {
			new Notice("Could not import: invalid Mermaid syntax.");
		}
	}

	private alignSelected(dir: AlignDir): void {
		const ids = this.canvas.getMultiSelection();
		if (ids.length < 2) return;
		alignNodes(this.model, ids, dir);
		this.canvas.render();
		this.commit();
	}

	private distributeSelected(dir: DistributeDir): void {
		const ids = this.canvas.getMultiSelection();
		if (ids.length < 3) { new Notice("Select at least 3 nodes to distribute."); return; }
		distributeNodes(this.model, ids, dir);
		this.canvas.render();
		this.commit();
	}

	// --- mode / lock / theme ------------------------------------------------

	private setMode(mode: EditorMode): void {
		this.mode = mode;
		this.canvas.setMode(mode);
		this.tbRefs?.updateModeButtons();
	}

	private toggleLock(): void {
		this.lockLayout = !this.lockLayout;
		const btn = this.tbRefs?.lockBtn;
		if (btn) {
			setIcon(btn, this.lockLayout ? "lock" : "lock-open");
			btn.toggleClass("is-active", this.lockLayout);
			btn.setAttribute("aria-label", this.lockLayout ? "Layout locked" : "Lock layout");
		}
		new Notice(this.lockLayout ? "Layout locked." : "Layout unlocked.");
	}

	private guardLocked(): boolean {
		if (this.lockLayout) { new Notice("Layout is locked. Unlock it to change layout."); return true; }
		return false;
	}

	private matchesTheme(presetId: string): boolean {
		const preset = THEME_PRESETS.find((p) => p.id === presetId);
		if (!preset) return false;
		return (
			this.model.config.theme === preset.theme &&
			JSON.stringify(this.model.config.themeVariables ?? null) ===
				JSON.stringify(preset.themeVariables ?? null)
		);
	}

	private applyTheme(presetId: string): void {
		const preset = THEME_PRESETS.find((p) => p.id === presetId);
		if (!preset) return;
		if (preset.id === "default") {
			delete this.model.config.theme;
			delete this.model.config.themeVariables;
		} else {
			this.model.config.theme = preset.theme;
			if (preset.themeVariables) this.model.config.themeVariables = { ...preset.themeVariables };
			else delete this.model.config.themeVariables;
		}
		this.commit();
	}

	private showLayoutMenu(e: MouseEvent): void {
		const menu = new Menu();
		for (const preset of LAYOUT_PRESETS) {
			menu.addItem((item) =>
				item.setTitle(preset.label).onClick(() => {
					if (this.guardLocked()) return;
					this.model.direction = preset.direction;
					autoLayout(this.model);
					this.canvas.render();
					this.commit();
				}),
			);
		}
		menu.addSeparator();
		for (const sp of SPACING_PRESETS) {
			menu.addItem((item) =>
				item.setTitle(`Spacing: ${sp.label}`).onClick(() => {
					if (this.guardLocked()) return;
					this.model.config.nodeSpacing = sp.nodeSpacing;
					this.model.config.rankSpacing = sp.rankSpacing;
					autoLayout(this.model);
					this.canvas.render();
					this.commit();
				}),
			);
		}
		menu.addSeparator();
		menu.addItem((item) =>
			item.setTitle("Clean up layout").setIcon("sparkles").onClick(() => {
				if (this.guardLocked()) return;
				autoLayout(this.model);
				this.canvas.render();
				this.commit();
			}),
		);
		menu.showAtMouseEvent(e);
	}

	// --- context menu -------------------------------------------------------

	private showContextMenu(e: MouseEvent, empty?: boolean): void {
		const sel = this.canvas.getSelection();

		if (empty || !sel) {
			// Right-click on empty canvas
			const p = (e as { svgX?: number; svgY?: number });
			const svgX = p.svgX ?? 200;
			const svgY = p.svgY ?? 200;
			const menu = new Menu();
			menu.addItem((item) =>
				item.setTitle("Add node here").setIcon("plus-circle").onClick(() => this.addNodeAt("rect", svgX, svgY)),
			);
			menu.addItem((item) =>
				item.setTitle("Select all (Ctrl+A)").setIcon("square-dashed").onClick(() => {
					this.canvas.selectAll();
					this.refreshPanel();
				}),
			);
			if (this.copyBuffer.length > 0) {
				menu.addItem((item) =>
					item.setTitle(`Paste ${this.copyBuffer.length} node(s)`).setIcon("clipboard").onClick(() => this.pasteNodes()),
				);
			}
			menu.addSeparator();
			menu.addItem((item) =>
				item.setTitle("Auto-layout").setIcon("sparkles").onClick(() => {
					if (this.guardLocked()) return;
					autoLayout(this.model);
					this.canvas.render();
					this.commit();
				}),
			);
			menu.showAtMouseEvent(e);
			return;
		}

		const menu = new Menu();
		if (sel.type === "node") {
			menu.addItem((item) => item.setTitle("Duplicate").setIcon("copy").onClick(() => this.duplicateSelected()));
			menu.addItem((item) => item.setTitle("Connect from here").setIcon("spline").onClick(() => this.setMode("connect")));
			menu.addSeparator();
			menu.addItem((item) => item.setTitle("Add step after").setIcon("plus").onClick(() => this.quickAddStep()));
			menu.addItem((item) => item.setTitle("Add Yes/No branch").setIcon("git-branch").onClick(() => this.quickAddBranch()));
			menu.addItem((item) => item.setTitle("Group into new subgraph").setIcon("group").onClick(() => this.addSubgraph()));
			menu.addSeparator();
			menu.addItem((item) => item.setTitle("Bring to front").setIcon("layers").onClick(() => this.bringToFront()));
			menu.addItem((item) => item.setTitle("Send to back").setIcon("layers").onClick(() => this.sendToBack()));
			menu.addSeparator();
			menu.addItem((item) => item.setTitle("Delete node").setIcon("trash-2").onClick(() => this.deleteSelected()));
		} else if (sel.type === "edge") {
			menu.addItem((item) => item.setTitle("Reverse direction").setIcon("arrow-left-right").onClick(() => this.reverseSelectedEdge()));
			menu.addSeparator();
			menu.addItem((item) => item.setTitle("Delete edge").setIcon("trash-2").onClick(() => this.deleteSelected()));
		} else {
			menu.addItem((item) => item.setTitle("Ungroup").setIcon("ungroup").onClick(() => this.ungroupSelected()));
		}
		menu.showAtMouseEvent(e);
	}

	// --- save / discard -----------------------------------------------------

	private discard(): void { this.host.close(); }

	private save(): void {
		this.host.persist(this.model);
		if (this.host.closeOnSave) this.host.close();
		else new Notice("Diagram saved to note.");
	}

	// --- keyboard shortcuts -------------------------------------------------

	private registerKeys(): void {
		this.keyHandler = (e: KeyboardEvent) => {
			const mod = e.ctrlKey || e.metaKey;
			const target = e.target as HTMLElement | null;
			const tag = target?.tagName?.toLowerCase();
			const inInput = tag === "input" || tag === "textarea" || tag === "select";

			// Undo / redo
			if (mod && !e.shiftKey && (e.key === "z" || e.key === "Z")) { e.preventDefault(); this.undo(); return; }
			if (mod && (e.shiftKey && (e.key === "z" || e.key === "Z") || e.key === "y" || e.key === "Y")) { e.preventDefault(); this.redo(); return; }

			// Zoom
			if (mod && (e.key === "=" || e.key === "+")) { e.preventDefault(); this.canvas.zoomIn(); return; }
			if (mod && e.key === "-") { e.preventDefault(); this.canvas.zoomOut(); return; }
			if (mod && e.key === "0") { e.preventDefault(); this.canvas.zoomReset(); return; }
			if (mod && e.shiftKey && (e.key === "f" || e.key === "F")) { e.preventDefault(); this.canvas.zoomToFit(); return; }

			// Selection
			if (mod && !inInput && (e.key === "a" || e.key === "A")) { e.preventDefault(); this.canvas.selectAll(); this.refreshPanel(); return; }

			// Copy / paste (not in inputs)
			if (mod && !inInput && (e.key === "c" || e.key === "C")) { e.preventDefault(); this.copySelected(); return; }
			if (mod && !inInput && (e.key === "v" || e.key === "V")) { e.preventDefault(); this.pasteNodes(); return; }

			// Duplicate / group
			if (mod && !inInput && (e.key === "d" || e.key === "D")) { e.preventDefault(); this.duplicateSelected(); return; }
			if (mod && !inInput && (e.key === "g" || e.key === "G")) { e.preventDefault(); this.addSubgraph(); return; }

			// Delete
			if (!inInput && (e.key === "Delete" || e.key === "Backspace")) { e.preventDefault(); this.deleteSelected(); return; }

			// Escape: deselect / cancel connect
			if (!inInput && e.key === "Escape") { e.preventDefault(); this.canvas.deselect(); this.setMode("select"); this.refreshPanel(); return; }

			// F2: focus label
			if (!inInput && e.key === "F2") { e.preventDefault(); this.focusLabel(); return; }

			// Mode shortcuts
			if (!inInput && (e.key === "s" || e.key === "S")) { e.preventDefault(); this.setMode("select"); return; }
			if (!inInput && (e.key === "c" || e.key === "C")) { e.preventDefault(); this.setMode("connect"); return; }

			// Arrow nudge (1px; Shift = 10px)
			if (!inInput && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
				e.preventDefault();
				const step = e.shiftKey ? 10 : 1;
				const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
				const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
				this.canvas.nudgeSelected(dx, dy);
				this.commit();
				return;
			}

			// Find bar
			if (mod && !e.shiftKey && (e.key === "f" || e.key === "F")) { e.preventDefault(); if (this.findActive) this.closeFindBar(); else this.openFindBar(); return; }

			// Space = pan mode (communicated to canvas)
			if (!inInput && e.key === " ") { e.preventDefault(); this.canvas.setSpaceDown(true); return; }
		};
		this.root.addEventListener("keydown", this.keyHandler);

		// Release space on keyup
		const keyUp = (e: KeyboardEvent) => { if (e.key === " ") this.canvas.setSpaceDown(false); };
		this.root.addEventListener("keyup", keyUp);

		this.trapFocus();
	}

	private trapFocus(): void {
		this.trapHandler = (e: KeyboardEvent) => {
			if (e.key !== "Tab") return;
			const focusable = this.root.querySelectorAll<HTMLElement>(
				"button, [href], input, select, textarea, [tabindex]:not([tabindex=\"-1\"])",
			);
			if (focusable.length === 0) return;
			const first = focusable[0];
			const last = focusable[focusable.length - 1];
			if (e.shiftKey) {
				if (activeDocument.activeElement === firstElement) {
					e.preventDefault();
					lastElement?.focus();
				}
			} else {
				if (activeDocument.activeElement === lastElement) {
					e.preventDefault();
					firstElement?.focus();
				}
			}
		};
		this.root.addEventListener("keydown", this.trapHandler);
	}

	// --- help dialog --------------------------------------------------------

	private showHelpDialog(): void {
		const modal = new Modal(this.app);
		modal.titleEl.setText("Keyboard Shortcuts & Help");
		const content = modal.contentEl;
		content.addClass("mermaid-flow-help-modal");

		content.createEl("h3", { text: "⌨️ Keyboard Shortcuts" });
		const shortcuts = [
			{ key: "Ctrl+Z / Cmd+Z", action: "Undo" },
			{ key: "Ctrl+Shift+Z / Cmd+Shift+Z", action: "Redo" },
			{ key: "Ctrl+Y / Cmd+Y", action: "Redo (alt)" },
			{ key: "Ctrl+A", action: "Select all nodes" },
			{ key: "Escape", action: "Deselect / cancel connect mode" },
			{ key: "Ctrl+C / Cmd+C", action: "Copy selected node(s)" },
			{ key: "Ctrl+V / Cmd+V", action: "Paste copied node(s)" },
			{ key: "Ctrl+D / Cmd+D", action: "Duplicate selected node" },
			{ key: "Ctrl+G / Cmd+G", action: "Group selected into subgraph" },
			{ key: "Delete / Backspace", action: "Delete selected" },
			{ key: "F2", action: "Rename / edit label" },
			{ key: "Arrow keys", action: "Nudge node 1 px (Shift = 10 px)" },
			{ key: "Ctrl/Cmd + = / − / 0", action: "Zoom in / out / reset" },
			{ key: "Ctrl+Shift+F", action: "Zoom to fit all nodes" },
			{ key: "S", action: "Select/Move mode" },
			{ key: "C", action: "Connect nodes mode" },
			{ key: "Space+drag", action: "Pan canvas" },
		];
		const table = content.createEl("table", { cls: "mermaid-flow-shortcuts-table" });
		for (const { key, action } of shortcuts) {
			const row = table.createEl("tr");
			row.createEl("td", { text: key, cls: "mermaid-flow-key" });
			row.createEl("td", { text: action });
		}

		content.createEl("h3", { text: "🖱️ Canvas Controls" });
		const controls = [
			"Scroll or use scrollbars to pan; Space+drag also pans",
			"Ctrl/Cmd+Scroll to zoom, or use toolbar +/− buttons",
			"Double-click empty canvas to add a node at that position",
			"Double-click a node to edit its label inline",
			"Drag a shape from the palette directly onto the canvas",
			"Shift-click nodes, or drag a box on empty canvas, to select several",
			"Hover a node and drag a blue edge dot to draw a connection",
			"Right-click anywhere for context actions",
		];
		const ul = content.createEl("ul");
		for (const c of controls) ul.createEl("li", { text: c });

		content.createEl("h3", { text: "💡 Tips" });
		const tips = [
			"Select 2+ nodes to access Align & Distribute in the toolbar",
			"Use the Code button to view and edit raw Mermaid",
			"Lock layout to prevent accidental position changes",
			"Subgraphs keep related nodes visually grouped",
		];
		const tipsList = content.createEl("ul");
		for (const tip of tips) tipsList.createEl("li", { text: tip });

		const closeBtn = content.createEl("button", { text: "Close", cls: "mermaid-flow-modal-close-btn" });
		closeBtn.addEventListener("click", () => modal.close());
		modal.open();
	}

	private showExportMenu(e: MouseEvent): void {
		const menu = new Menu();
		menu.addItem((item) =>
			item
				.setTitle("Export as PNG")
				.setIcon("image")
				.onClick(() => this.exportDiagram("png")),
		);
		menu.addItem((item) =>
			item
				.setTitle("Export as SVG")
				.setIcon("file-text")
				.onClick(() => this.exportDiagram("svg")),
		);
		menu.addSeparator();
		menu.addItem((item) =>
			item
				.setTitle("Copy code to clipboard")
				.setIcon("copy")
				.onClick(() => this.copyDiagramCode()),
		);
		menu.showAtMouseEvent(e);
	}

	private exportDiagram(format: "png" | "svg"): void {
		try {
			const svg = this.canvas.getSVG();
			if (!svg) {
				new Notice("Could not export: SVG not available");
				return;
			}

			if (format === "svg") {
				const serializer = new XMLSerializer();
				const svgString = serializer.serializeToString(svg);
				void navigator.clipboard
					.writeText(svgString)
					.then(() => new Notice("SVG copied to clipboard"))
					.catch(() => new Notice("Failed to copy SVG"));
			} else if (format === "png") {
				const canvasEl = activeDocument.createElement("canvas");
				const ctx = canvasEl.getContext("2d");
				if (!ctx) {
					new Notice("Could not export: Canvas context unavailable");
					return;
				}

				const rect = svg.getBoundingClientRect();
				canvasEl.width = rect.width;
				canvasEl.height = rect.height;

				const img = new Image();
				const serializer = new XMLSerializer();
				const svgString = serializer.serializeToString(svg);
				const blob = new Blob([svgString], { type: "image/svg+xml" });
				const url = URL.createObjectURL(blob);

				img.onload = () => {
					ctx.drawImage(img, 0, 0);
					canvasEl.toBlob((pngBlob) => {
						if (pngBlob) {
							void navigator.clipboard
								.write([
									new ClipboardItem({
										"image/png": pngBlob,
									}),
								])
								.then(() => new Notice("PNG copied to clipboard"))
								.catch(() => new Notice("Failed to copy PNG"));
						}
					});
					URL.revokeObjectURL(url);
				};
				img.src = url;
			}
		} catch (err) {
			new Notice("Export failed: " + (err instanceof Error ? err.message : "Unknown error"));
		}
	}

	private copyDiagramCode(): void {
		const code = modelToMermaid(this.model);
		void navigator.clipboard
			.writeText(code)
			.then(() => new Notice("Diagram code copied to clipboard"))
			.catch(() => new Notice("Failed to copy code"));
	}
}
