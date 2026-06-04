/*
 * Shared visual-editor UI: toolbar + SVG canvas + properties panel + optional
 * raw-code view. Renders into any container element, so it can be hosted by
 * both a Modal (popup) and an ItemView (embedded pane).
 *
 * The host supplies save/close behaviour via EditorHost.
 */

import { App, Menu, Modal, Notice, setIcon } from "obsidian";
import { CanvasCallbacks, DiagramCanvas, EditorMode } from "./canvas";
import { autoLayout, layoutMissing } from "./layout";
import {
	DIRECTIONS,
	DIRECTION_LABELS,
	Direction,
	DiagramEdge,
	DiagramModel,
	DiagramNode,
	EDGE_KINDS,
	EDGE_LABELS,
	EdgeKind,
	NODE_SHAPES,
	NodeShape,
	SHAPE_LABELS,
	assignNodeToGroup,
	cloneModel,
	duplicateNode,
	groupOf,
	hasEdgeStyle,
	hasStyle,
	newEdgeId,
	newGroupId,
	nextNodeId,
	removeEdge,
	removeGroup,
	removeNode,
} from "./model";
import { mermaidToModel } from "./parser";
import { modelToMermaid } from "./serializer";
import { createShapeIcon } from "./shapes";
import {
	LAYOUT_PRESETS,
	SPACING_PRESETS,
	STYLE_PRESETS,
	THEME_PRESETS,
} from "./presets";

export interface EditorHost {
	/** Write the diagram to the note (no dismissal). */
	persist: (model: DiagramModel) => void;
	/** Dismiss the editor (close modal / detach leaf). */
	close: () => void;
	/** When true, the editor persists automatically (debounced) on change. */
	autoSave?: boolean;
	/** When true, the Save button also closes the editor (modal). */
	closeOnSave?: boolean;
	/** Label for the save button. */
	saveLabel?: string;
}

export class DiagramEditorUI {
	private app: App;
	private root: HTMLElement;
	private model: DiagramModel;
	private host: EditorHost;

	private canvas!: DiagramCanvas;
	private panelEl!: HTMLElement;
	private codeWrap!: HTMLElement;
	private codeArea!: HTMLTextAreaElement;
	private modeButtons: Partial<Record<EditorMode, HTMLButtonElement>> = {};
	private mode: EditorMode = "select";
	private codeVisible = false;
	private lockLayout = false;
	private keyHandler?: (e: KeyboardEvent) => void;

	// properties-panel focus management: only focus the label on selection change
	private lastSelKey: string | null = null;
	private focusLabelOnBuild = false;

	// undo/redo
	private ready = false;
	private history: DiagramModel[] = [];
	private historyIndex = -1;
	private historyTimer = 0;
	private autoSaveTimer = 0;
	private undoBtn?: HTMLButtonElement;
	private redoBtn?: HTMLButtonElement;
	private lockBtn?: HTMLButtonElement;

	// code view auto-apply
	private autoApplyCode = false;
	private codeApplyTimer = 0;
	private codeErrorEl?: HTMLElement;

	constructor(
		app: App,
		root: HTMLElement,
		model: DiagramModel,
		host: EditorHost,
	) {
		this.app = app;
		this.root = root;
		this.model = model;
		this.host = host;
	}

	build(): void {
		this.root.addClass("mermaid-flow-editor");

		// Create the DOM skeleton in visual order first, then create the canvas
		// (so it exists before the toolbar wires itself up).
		const bar = this.root.createDiv({ cls: "mermaid-flow-toolbar" });
		const body = this.root.createDiv({ cls: "mermaid-flow-body" });
		const canvasHost = body.createDiv({ cls: "mermaid-flow-canvas-host" });
		this.panelEl = body.createDiv({ cls: "mermaid-flow-panel" });

		const callbacks: CanvasCallbacks = {
			onSelect: () => this.refreshPanel(),
			onChange: () => {
				this.refreshPanel();
				this.commit();
			},
			onContextMenu: (e) => this.showContextMenu(e),
		};
		this.canvas = new DiagramCanvas(canvasHost, this.model, callbacks);

		this.buildToolbar(bar);
		this.buildCodeView(this.root);
		this.buildFooter(this.root);

		this.registerKeys();
		this.refreshPanel();

		// Seed the undo history with the initial state, then go live.
		this.pushHistory();
		this.ready = true;
		this.updateUndoRedo();
	}

	destroy(): void {
		if (this.keyHandler) {
			this.root.removeEventListener("keydown", this.keyHandler);
		}
		window.clearTimeout(this.historyTimer);
		window.clearTimeout(this.autoSaveTimer);
		window.clearTimeout(this.codeApplyTimer);
		this.canvas?.destroy();
		this.root.empty();
		this.root.removeClass("mermaid-flow-editor");
	}

	// --- change pipeline: code view + history + auto-save -------------------

	private commit(): void {
		this.syncCodeView();
		if (!this.ready) return;
		this.scheduleHistory();
		this.scheduleAutoSave();
	}

	private scheduleHistory(): void {
		window.clearTimeout(this.historyTimer);
		this.historyTimer = window.setTimeout(() => this.pushHistory(), 400);
	}

	private pushHistory(): void {
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
		this.syncCodeView();
		this.updateUndoRedo();
		this.scheduleAutoSave();
	}

	private scheduleAutoSave(): void {
		if (!this.host.autoSave) return;
		window.clearTimeout(this.autoSaveTimer);
		this.autoSaveTimer = window.setTimeout(
			() => this.host.persist(this.model),
			700,
		);
	}

	private updateUndoRedo(): void {
		this.undoBtn?.toggleClass("is-disabled", this.historyIndex <= 0);
		this.redoBtn?.toggleClass(
			"is-disabled",
			this.historyIndex >= this.history.length - 1,
		);
	}

	// --- toolbar ------------------------------------------------------------

	private buildToolbar(bar: HTMLElement): void {
		// Undo / redo
		const historyGroup = bar.createDiv({ cls: "mermaid-flow-tb-group" });
		this.undoBtn = this.iconButton(historyGroup, "undo-2", "Undo (Ctrl+Z)", () =>
			this.undo(),
		);
		this.redoBtn = this.iconButton(
			historyGroup,
			"redo-2",
			"Redo (Ctrl+Shift+Z)",
			() => this.redo(),
		);

		// Mode toggle
		const modeGroup = bar.createDiv({ cls: "mermaid-flow-tb-group" });
		this.modeButtons.select = this.iconButton(
			modeGroup,
			"mouse-pointer-2",
			"Select / move (S)",
			() => this.setMode("select"),
		);
		this.modeButtons.connect = this.iconButton(
			modeGroup,
			"spline",
			"Connect nodes (C)",
			() => this.setMode("connect"),
		);

		// Shape menu (hover dropdown)
		this.buildShapeMenu(bar);

		// Layout menu + lock
		const layoutGroup = bar.createDiv({ cls: "mermaid-flow-tb-group" });
		this.iconButtonEv(layoutGroup, "layout-template", "Layout presets", (ev) =>
			this.showLayoutMenu(ev),
		);
		this.lockBtn = this.iconButton(
			layoutGroup,
			"lock-open",
			"Lock layout",
			() => this.toggleLock(),
		);

		// Group + delete
		const opsGroup = bar.createDiv({ cls: "mermaid-flow-tb-group" });
		this.iconButton(opsGroup, "group", "Group selected node into a subgraph", () =>
			this.addSubgraph(),
		);
		this.iconButton(opsGroup, "trash-2", "Delete selected (Del)", () =>
			this.deleteSelected(),
		);

		// Code toggle + Export
		const codeGroup = bar.createDiv({ cls: "mermaid-flow-tb-group" });
		this.iconButton(codeGroup, "code", "Toggle code", () => this.toggleCode());
		this.iconButtonEv(codeGroup, "download", "Export diagram", (ev) =>
			this.showExportMenu(ev),
		);

		// Help/Shortcuts
		const helpGroup = bar.createDiv({ cls: "mermaid-flow-tb-group" });
		this.iconButton(helpGroup, "help-circle", "Keyboard shortcuts & Help", () =>
			this.showHelpDialog(),
		);

		// Spacer to push theme/direction to the right
		bar.createDiv({ cls: "mermaid-flow-spacer" });

		// Theme (moved to end)
		const themeGroup = bar.createDiv({ cls: "mermaid-flow-tb-group" });
		themeGroup.createSpan({ cls: "mermaid-flow-tb-label", text: "Theme" });
		const themeSelect = themeGroup.createEl("select", {
			cls: "dropdown mermaid-flow-select",
			attr: { "aria-label": "Select theme" },
		});
		for (const preset of THEME_PRESETS) {
			const o = themeSelect.createEl("option", {
				text: preset.label,
				value: preset.id,
			});
			if (this.matchesTheme(preset.id)) o.selected = true;
		}
		themeSelect.addEventListener("change", () =>
			this.applyTheme(themeSelect.value),
		);

		// Direction (moved to end)
		const dirGroup = bar.createDiv({ cls: "mermaid-flow-tb-group" });
		dirGroup.createSpan({ cls: "mermaid-flow-tb-label", text: "Direction" });
		const dirSelect = dirGroup.createEl("select", {
			cls: "dropdown mermaid-flow-select",
			attr: { "aria-label": "Select direction" },
		});
		for (const dir of DIRECTIONS) {
			const opt = dirSelect.createEl("option", {
				text: DIRECTION_LABELS[dir],
				value: dir,
			});
			if (dir === this.model.direction) opt.selected = true;
		}
		dirSelect.addEventListener("change", () => {
			this.model.direction = dirSelect.value as Direction;
			this.commit();
		});

		// Save and Close buttons at top right
		const actionGroup = bar.createDiv({ cls: "mermaid-flow-tb-group" });
		const closeBtn = actionGroup.createEl("button", {
			text: "Close",
			cls: "mermaid-flow-tb-btn",
			attr: { "aria-label": "Close editor" },
		});
		closeBtn.addEventListener("click", () => this.host.close());

		const saveBtn = actionGroup.createEl("button", {
			text: this.host.saveLabel ?? "OK",
			cls: "mermaid-flow-tb-btn mod-cta",
			attr: { "aria-label": "Save diagram to note" },
		});
		saveBtn.addEventListener("click", () => {
			this.host.persist(this.model);
			if (this.host.closeOnSave) this.host.close();
			else new Notice("Diagram saved to note.");
		});

		this.updateModeButtons();
	}

	private iconButtonEv(
		parent: HTMLElement,
		icon: string,
		tooltip: string,
		onClick: (e: MouseEvent) => void,
	): HTMLButtonElement {
		const btn = parent.createEl("button", {
			cls: "mermaid-flow-icon-btn",
			attr: { "aria-label": tooltip, title: tooltip },
		});
		setIcon(btn, icon);
		btn.addEventListener("click", (e) => {
			e.preventDefault();
			onClick(e);
		});
		return btn;
	}

	private iconButton(
		parent: HTMLElement,
		icon: string,
		tooltip: string,
		onClick: () => void,
	): HTMLButtonElement {
		const btn = parent.createEl("button", {
			cls: "mermaid-flow-icon-btn",
			attr: { "aria-label": tooltip, title: tooltip },
		});
		setIcon(btn, icon);
		btn.addEventListener("click", (e) => {
			e.preventDefault();
			onClick();
		});
		return btn;
	}

	private setMode(mode: EditorMode): void {
		this.mode = mode;
		this.canvas.setMode(mode);
		this.updateModeButtons();
	}

	private updateModeButtons(): void {
		for (const [mode, btn] of Object.entries(this.modeButtons)) {
			if (!btn) continue;
			btn.toggleClass("is-active", mode === this.mode);
		}
	}

	// --- theme / layout / lock ---------------------------------------------

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
			if (preset.themeVariables) {
				this.model.config.themeVariables = { ...preset.themeVariables };
			} else {
				delete this.model.config.themeVariables;
			}
		}
		this.commit();
	}

	private toggleLock(): void {
		this.lockLayout = !this.lockLayout;
		if (this.lockBtn) {
			setIcon(this.lockBtn, this.lockLayout ? "lock" : "lock-open");
			this.lockBtn.toggleClass("is-active", this.lockLayout);
			this.lockBtn.setAttribute(
				"aria-label",
				this.lockLayout ? "Layout locked" : "Lock layout",
			);
		}
		new Notice(this.lockLayout ? "Layout locked." : "Layout unlocked.");
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
			item
				.setTitle("Clean up layout")
				.setIcon("sparkles")
				.onClick(() => {
					if (this.guardLocked()) return;
					autoLayout(this.model);
					this.canvas.render();
					this.commit();
				}),
		);
		menu.showAtMouseEvent(e);
	}

	private guardLocked(): boolean {
		if (this.lockLayout) {
			new Notice("Layout is locked. Unlock it to change layout.");
			return true;
		}
		return false;
	}

	// --- shape menu (hover dropdown) ----------------------------------------

	private buildShapeMenu(bar: HTMLElement): void {
		const menu = bar.createDiv({
			cls: "mermaid-flow-tb-group mermaid-flow-shape-menu",
		});
		const btn = menu.createEl("button", {
			cls: "mermaid-flow-icon-btn",
			attr: { "aria-label": "Add shape", title: "Add shape" },
		});
		setIcon(btn, "shapes");
		btn.createSpan({ cls: "mermaid-flow-caret", text: "▾" });

		const popup = menu.createDiv({ cls: "mermaid-flow-shape-popup" });
		const grid = popup.createDiv({ cls: "mermaid-flow-palette-grid" });
		for (const shape of NODE_SHAPES) {
			const item = grid.createEl("button", {
				cls: "mermaid-flow-shape-btn",
				attr: { "aria-label": SHAPE_LABELS[shape], title: SHAPE_LABELS[shape] },
			});
			item.appendChild(createShapeIcon(shape));
			item.addEventListener("click", (e) => {
				e.preventDefault();
				this.addNode(shape);
			});
		}
	}

	// --- node / edge operations --------------------------------------------

	private addNode(shape: NodeShape): void {
		const id = nextNodeId(this.model);
		// Place near the centre of the current viewport, nudged so repeated
		// clicks don't stack perfectly on top of each other.
		let x = 140;
		let y = 90;
		const scroller = this.root.querySelector(
			".mermaid-flow-canvas-scroll",
		) as HTMLElement | null;
		if (scroller) {
			x = scroller.scrollLeft + scroller.clientWidth / 2;
			y = scroller.scrollTop + scroller.clientHeight / 2;
		}
		const jitter = (this.model.nodes.length % 6) * 24;
		this.model.nodes.push({
			id,
			label: id,
			shape,
			x: Math.round(x + jitter),
			y: Math.round(y + jitter),
		});
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

	private flowOffset(): { dx: number; dy: number } {
		switch (this.model.direction) {
			case "LR":
				return { dx: 220, dy: 0 };
			case "RL":
				return { dx: -220, dy: 0 };
			case "BT":
				return { dx: 0, dy: -150 };
			case "TB":
			default:
				return { dx: 0, dy: 150 };
		}
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
			id,
			label,
			shape,
			x: Math.max(40, Math.round(src.x + offset.dx)),
			y: Math.max(30, Math.round(src.y + offset.dy)),
		});
		this.model.edges.push({
			id: newEdgeId(),
			from: fromId,
			to: id,
			label: "",
			kind: "arrow",
		});
		return id;
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
		const horizontal = dx !== 0;
		const off1 = horizontal ? { dx, dy: -90 } : { dx: -130, dy };
		const off2 = horizontal ? { dx, dy: 90 } : { dx: 130, dy };
		const yes = this.addConnectedNode(sel.id, "Yes path", "rect", off1);
		const no = this.addConnectedNode(sel.id, "No path", "rect", off2);
		// Label the two new edges.
		const edges = this.model.edges.filter((e) => e.from === sel.id);
		const yesEdge = edges.find((e) => e.to === yes);
		const noEdge = edges.find((e) => e.to === no);
		if (yesEdge) yesEdge.label = "Yes";
		if (noEdge) noEdge.label = "No";
		this.canvas.render();
		this.canvas.select(null);
		this.commit();
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

	private addSubgraph(): void {
		const multi = this.canvas.getMultiSelection();
		const sel = this.canvas.getSelection();
		let members: string[] = [];
		if (multi.length > 0) {
			members = multi;
		} else if (sel && sel.type === "node") {
			members = [sel.id];
		}
		if (members.length === 0) {
			new Notice(
				"Select one or more nodes (Shift-click or drag a box), then group.",
			);
			return;
		}
		const id = newGroupId(this.model);
		const num = this.model.groups.length + 1;
		this.model.groups.push({
			id,
			title: `Subgraph ${num}`,
			nodeIds: [...members],
		});
		this.canvas.render();
		this.canvas.select({ type: "group", id });
		this.commit();
	}

	private deleteSelected(): void {
		const sel = this.canvas.getSelection();
		if (!sel) {
			new Notice("Nothing selected.");
			return;
		}
		if (sel.type === "node") {
			removeNode(this.model, sel.id);
		} else {
			removeEdge(this.model, sel.id);
		}
		this.canvas.select(null);
		this.canvas.render();
		this.refreshPanel();
		this.commit();
	}

	// --- context menu -------------------------------------------------------

	private showContextMenu(e: MouseEvent): void {
		const sel = this.canvas.getSelection();
		if (!sel) return;
		const menu = new Menu();

		if (sel.type === "node") {
			menu.addItem((item) =>
				item
					.setTitle("Duplicate")
					.setIcon("copy")
					.onClick(() => this.duplicateSelected()),
			);
			menu.addItem((item) =>
				item
					.setTitle("Connect from here")
					.setIcon("spline")
					.onClick(() => this.startConnectFrom()),
			);
			menu.addSeparator();
			menu.addItem((item) =>
				item
					.setTitle("Add step after")
					.setIcon("plus")
					.onClick(() => this.quickAddStep()),
			);
			menu.addItem((item) =>
				item
					.setTitle("Add Yes/No branch")
					.setIcon("git-branch")
					.onClick(() => this.quickAddBranch()),
			);
			menu.addItem((item) =>
				item
					.setTitle("Group into new subgraph")
					.setIcon("group")
					.onClick(() => this.addSubgraph()),
			);
			menu.addSeparator();
			menu.addItem((item) =>
				item
					.setTitle("Delete node")
					.setIcon("trash-2")
					.onClick(() => this.deleteSelected()),
			);
		} else if (sel.type === "edge") {
			menu.addItem((item) =>
				item
					.setTitle("Reverse direction")
					.setIcon("arrow-left-right")
					.onClick(() => this.reverseSelectedEdge()),
			);
			menu.addSeparator();
			menu.addItem((item) =>
				item
					.setTitle("Delete edge")
					.setIcon("trash-2")
					.onClick(() => this.deleteSelected()),
			);
		} else {
			menu.addItem((item) =>
				item
					.setTitle("Ungroup")
					.setIcon("ungroup")
					.onClick(() => this.ungroupSelected()),
			);
		}

		menu.showAtMouseEvent(e);
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

	private startConnectFrom(): void {
		this.setMode("connect");
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

	// --- properties panel ---------------------------------------------------

	private refreshPanel(): void {
		const sel = this.canvas.getSelection();
		// Only auto-focus the label input when the selection actually changes, so
		// committing an edit (e.g. finishing a drag) doesn't steal focus mid-work.
		const selKey = sel ? `${sel.type}:${sel.id}` : null;
		this.focusLabelOnBuild = selKey !== this.lastSelKey;
		this.lastSelKey = selKey;
		this.panelEl.empty();

		if (!sel) {
			const empty = this.model.nodes.length === 0;
			this.panelEl.createEl("h3", {
				text: empty ? "Get started" : "Properties",
			});
			const hint = this.panelEl.createDiv({ cls: "mermaid-flow-hint" });
			hint.createEl("p", {
				text: empty
					? "Build a flowchart visually — no Mermaid syntax needed."
					: "Select a node or edge to edit it.",
			});
			const list = hint.createEl("ul");
			list.createEl("li", { text: "Click a shape in the toolbar to add a node." });
			list.createEl("li", {
				text: "Drag a node to move it; drag a blue edge dot to connect.",
			});
			list.createEl("li", {
				text: "Shift-click or drag a box to select several nodes.",
			});
			list.createEl("li", {
				text: "Right-click a node or edge for more actions.",
			});
			this.panelEl.createDiv({
				cls: "mermaid-flow-stats",
				text: `${this.model.nodes.length} nodes · ${this.model.edges.length} edges`,
			});
			return;
		}

		if (sel.type === "node") {
			this.buildNodePanel(sel.id);
		} else if (sel.type === "edge") {
			this.buildEdgePanel(sel.id);
		} else {
			this.buildGroupPanel(sel.id);
		}
	}

	private buildGroupPanel(id: string): void {
		const group = this.model.groups.find((g) => g.id === id);
		if (!group) return;
		this.panelEl.createEl("h3", { text: "Subgraph" });
		this.panelEl.createDiv({
			cls: "mermaid-flow-field-readonly",
			text: `id: ${group.id} · ${group.nodeIds.length} nodes`,
		});

		this.labelField("Title", group.title, (value) => {
			group.title = value;
			this.canvas.render();
			this.commit();
		});

		this.panelEl.createDiv({
			cls: "mermaid-flow-hint",
			text: "Drag the title bar to move the whole group. Assign more nodes from each node's panel.",
		});

		this.dangerButton("Ungroup (keep nodes)", () => this.ungroupSelected());
	}

	private buildNodePanel(id: string): void {
		const node = this.model.nodes.find((n) => n.id === id);
		if (!node) return;
		this.panelEl.createEl("h3", { text: "Node" });
		this.panelEl.createDiv({
			cls: "mermaid-flow-field-readonly",
			text: `id: ${node.id}`,
		});

		this.labelField("Label", node.label, (value) => {
			node.label = value;
			this.canvas.render();
			this.commit();
		});

		this.selectField(
			"Shape",
			NODE_SHAPES,
			(s) => SHAPE_LABELS[s],
			node.shape,
			(value) => {
				node.shape = value as NodeShape;
				this.canvas.render();
				this.commit();
			},
		);

		this.buildNodeSizeField(node);
		this.buildStyleAsRow();
		this.buildQuickAddRow();
		this.buildNodeGroupField(node);
		this.buildNodeStyleSection(node);

		const dupRow = this.panelEl.createDiv({ cls: "mermaid-flow-panel-buttons" });
		const dup = dupRow.createEl("button", {
			text: "Duplicate",
			cls: "mermaid-flow-panel-btn",
		});
		dup.addEventListener("click", () => this.duplicateSelected());

		this.dangerButton("Delete node", () => this.deleteSelected());
	}

	private buildNodeSizeField(node: DiagramNode): void {
		const size = this.canvas.effectiveSize(node.id);
		const row = this.panelEl.createDiv({ cls: "mermaid-flow-field" });
		row.createEl("label", { text: "Size (W × H)" });
		const inputs = row.createDiv({ cls: "mermaid-flow-size-row" });

		const wInput = inputs.createEl("input", {
			type: "number",
			cls: "mermaid-flow-input",
		});
		wInput.value = String(node.w ?? size.w);
		inputs.createSpan({ text: "×" });
		const hInput = inputs.createEl("input", {
			type: "number",
			cls: "mermaid-flow-input",
		});
		hInput.value = String(node.h ?? size.h);

		const apply = () => {
			const w = parseInt(wInput.value, 10);
			const h = parseInt(hInput.value, 10);
			if (!Number.isNaN(w)) node.w = Math.max(48, w);
			if (!Number.isNaN(h)) node.h = Math.max(32, h);
			this.canvas.render();
			this.commit();
		};
		wInput.addEventListener("change", apply);
		hInput.addEventListener("change", apply);

		const auto = row.createEl("button", {
			cls: "mermaid-flow-chip",
			text: "Auto size",
		});
		auto.addEventListener("click", () => {
			delete node.w;
			delete node.h;
			this.canvas.render();
			this.refreshPanel();
			this.commit();
		});
	}

	private buildStyleAsRow(): void {
		this.panelEl.createEl("h4", { cls: "mermaid-flow-subhead", text: "Style as" });
		const row = this.panelEl.createDiv({ cls: "mermaid-flow-chip-row" });
		for (const preset of STYLE_PRESETS) {
			const chip = row.createEl("button", {
				cls: "mermaid-flow-chip",
				text: preset.label,
			});
			chip.style.borderColor = preset.style.strokeColor ?? "";
			chip.addEventListener("click", () => this.applyStylePreset(preset.id));
		}
	}

	private buildQuickAddRow(): void {
		this.panelEl.createEl("h4", { cls: "mermaid-flow-subhead", text: "Quick add" });
		const row = this.panelEl.createDiv({ cls: "mermaid-flow-chip-row" });
		const mk = (label: string, fn: () => void) => {
			const chip = row.createEl("button", { cls: "mermaid-flow-chip", text: label });
			chip.addEventListener("click", fn);
		};
		mk("Step after", () => this.quickAddStep());
		mk("Yes/No branch", () => this.quickAddBranch());
		mk("Child", () => this.quickAddChild());
	}

	private buildNodeGroupField(node: DiagramNode): void {
		const field = this.panelEl.createDiv({ cls: "mermaid-flow-field" });
		field.createEl("label", { text: "Subgraph" });
		const select = field.createEl("select", {
			cls: "dropdown mermaid-flow-input",
		});
		const current = groupOf(this.model, node.id);
		select.createEl("option", { text: "(none)", value: "__none__" });
		for (const g of this.model.groups) {
			const o = select.createEl("option", {
				text: g.title || g.id,
				value: g.id,
			});
			if (current && current.id === g.id) o.selected = true;
		}
		select.createEl("option", { text: "+ New subgraph", value: "__new__" });

		select.addEventListener("change", () => {
			const v = select.value;
			if (v === "__new__") {
				const id = newGroupId(this.model);
				const num = this.model.groups.length + 1;
				this.model.groups.push({
					id,
					title: `Subgraph ${num}`,
					nodeIds: [node.id],
				});
				assignNodeToGroup(this.model, node.id, id);
			} else {
				assignNodeToGroup(this.model, node.id, v === "__none__" ? null : v);
			}
			this.canvas.render();
			this.commit();
			this.refreshPanel();
		});
	}

	private fontFamilyField(
		current: string | undefined,
		onChange: (value: string) => void,
	): void {
		// Values must not contain commas — Mermaid `style` props are
		// comma-separated, so a comma in font-family would be misparsed.
		const families: Array<{ label: string; value: string }> = [
			{ label: "Default", value: "" },
			{ label: "Sans-serif", value: "sans-serif" },
			{ label: "Serif", value: "serif" },
			{ label: "Monospace", value: "monospace" },
			{ label: "Arial", value: "Arial" },
			{ label: "Georgia", value: "Georgia" },
			{ label: "Courier New", value: "'Courier New'" },
			{ label: "Trebuchet MS", value: "'Trebuchet MS'" },
			{ label: "Verdana", value: "Verdana" },
		];
		const field = this.panelEl.createDiv({ cls: "mermaid-flow-field" });
		field.createEl("label", { text: "Font family" });
		const select = field.createEl("select", {
			cls: "dropdown mermaid-flow-input",
		});
		for (const f of families) {
			const o = select.createEl("option", { text: f.label, value: f.value });
			if ((current ?? "") === f.value) o.selected = true;
		}
		select.addEventListener("change", () => onChange(select.value));
	}

	private buildNodeStyleSection(node: DiagramNode): void {
		this.panelEl.createEl("h4", { cls: "mermaid-flow-subhead", text: "Text & style" });

		this.numberField("Font size (px)", node.style?.fontSize, (value) => {
			const s = this.ensureStyle(node);
			if (value === null) delete s.fontSize;
			else s.fontSize = value;
			this.afterStyleChange(node);
		});

		this.colorField("Text color", node.style?.textColor, "#e0e0e0", (value) => {
			this.ensureStyle(node).textColor = value;
			this.afterStyleChange(node);
		});

		this.colorField("Fill color", node.style?.fillColor, "#ffffff", (value) => {
			this.ensureStyle(node).fillColor = value;
			this.afterStyleChange(node);
		});

		this.colorField("Border color", node.style?.strokeColor, "#888888", (value) => {
			this.ensureStyle(node).strokeColor = value;
			this.afterStyleChange(node);
		});

		this.fontFamilyField(node.style?.fontFamily, (value) => {
			const s = this.ensureStyle(node);
			if (value === "") delete s.fontFamily;
			else s.fontFamily = value;
			this.afterStyleChange(node);
		});

		const resetRow = this.panelEl.createDiv({ cls: "mermaid-flow-panel-buttons" });
		const reset = resetRow.createEl("button", {
			text: "Reset style",
			cls: "mermaid-flow-panel-btn",
		});
		reset.addEventListener("click", () => {
			node.style = undefined;
			this.canvas.render();
			this.commit();
			this.refreshPanel();
		});
	}

	private ensureStyle(node: DiagramNode): NonNullable<DiagramNode["style"]> {
		if (!node.style) node.style = {};
		return node.style;
	}

	private afterStyleChange(node: DiagramNode): void {
		if (!hasStyle(node.style)) node.style = undefined;
		this.canvas.render();
		this.commit();
	}

	private buildEdgePanel(id: string): void {
		const edge = this.model.edges.find((e) => e.id === id);
		if (!edge) return;
		this.panelEl.createEl("h3", { text: "Edge" });
		this.panelEl.createDiv({
			cls: "mermaid-flow-field-readonly",
			text: `${edge.from} → ${edge.to}`,
		});

		this.labelField("Label", edge.label, (value) => {
			edge.label = value;
			this.canvas.render();
			this.commit();
		});

		this.selectField(
			"Type",
			EDGE_KINDS,
			(k) => EDGE_LABELS[k],
			edge.kind,
			(value) => {
				edge.kind = value as EdgeKind;
				this.canvas.render();
				this.commit();
			},
		);

		this.buildEdgeStyleSection(edge);

		const btnRow = this.panelEl.createDiv({ cls: "mermaid-flow-panel-buttons" });
		const reverse = btnRow.createEl("button", {
			text: "Reverse direction",
			cls: "mermaid-flow-panel-btn",
		});
		reverse.addEventListener("click", () => {
			const tmp = edge.from;
			edge.from = edge.to;
			edge.to = tmp;
			this.canvas.render();
			this.commit();
		});

		this.dangerButton("Delete edge", () => this.deleteSelected());
	}

	private buildEdgeStyleSection(edge: DiagramEdge): void {
		this.panelEl.createEl("h4", {
			cls: "mermaid-flow-subhead",
			text: "Line & label style",
		});

		this.colorField("Line color", edge.style?.strokeColor, "#888888", (value) => {
			this.ensureEdgeStyle(edge).strokeColor = value;
			this.afterEdgeStyleChange(edge);
		});

		this.numberField("Line width (px)", edge.style?.strokeWidth, (value) => {
			const s = this.ensureEdgeStyle(edge);
			if (value === null) delete s.strokeWidth;
			else s.strokeWidth = value;
			this.afterEdgeStyleChange(edge);
		});

		this.colorField("Label color", edge.style?.textColor, "#e0e0e0", (value) => {
			this.ensureEdgeStyle(edge).textColor = value;
			this.afterEdgeStyleChange(edge);
		});

		this.numberField("Label size (px)", edge.style?.fontSize, (value) => {
			const s = this.ensureEdgeStyle(edge);
			if (value === null) delete s.fontSize;
			else s.fontSize = value;
			this.afterEdgeStyleChange(edge);
		});

		const resetRow = this.panelEl.createDiv({ cls: "mermaid-flow-panel-buttons" });
		const reset = resetRow.createEl("button", {
			text: "Reset style",
			cls: "mermaid-flow-panel-btn",
		});
		reset.addEventListener("click", () => {
			edge.style = undefined;
			this.canvas.render();
			this.commit();
			this.refreshPanel();
		});
	}

	private ensureEdgeStyle(edge: DiagramEdge): NonNullable<DiagramEdge["style"]> {
		if (!edge.style) edge.style = {};
		return edge.style;
	}

	private afterEdgeStyleChange(edge: DiagramEdge): void {
		if (!hasEdgeStyle(edge.style)) edge.style = undefined;
		this.canvas.render();
		this.commit();
	}

	private labelField(
		label: string,
		value: string,
		onInput: (value: string) => void,
	): void {
		const field = this.panelEl.createDiv({ cls: "mermaid-flow-field" });
		field.createEl("label", { text: label });
		const input = field.createEl("input", {
			type: "text",
			cls: "mermaid-flow-input",
		});
		input.value = value;
		input.addEventListener("input", () => onInput(input.value));
		if (this.focusLabelOnBuild) {
			this.focusLabelOnBuild = false;
			window.setTimeout(() => {
				input.focus();
				input.select();
			}, 0);
		}
	}

	private numberField(
		label: string,
		value: number | undefined,
		onChange: (value: number | null) => void,
	): void {
		const field = this.panelEl.createDiv({ cls: "mermaid-flow-field" });
		field.createEl("label", { text: label });
		const input = field.createEl("input", {
			type: "number",
			cls: "mermaid-flow-input",
		});
		input.placeholder = "auto";
		input.min = "6";
		if (value !== undefined) input.value = String(value);
		input.addEventListener("input", () => {
			const t = input.value.trim();
			if (t === "") {
				onChange(null);
				return;
			}
			const n = parseInt(t, 10);
			if (!Number.isNaN(n)) onChange(n);
		});
	}

	private colorField(
		label: string,
		value: string | undefined,
		fallback: string,
		onChange: (value: string) => void,
	): void {
		const field = this.panelEl.createDiv({ cls: "mermaid-flow-field-inline" });
		field.createEl("label", { text: label });
		const input = field.createEl("input", { type: "color" });
		input.value = value ?? fallback;
		input.addEventListener("input", () => onChange(input.value));
	}

	private selectField<T extends string>(
		label: string,
		options: T[],
		labelFor: (value: T) => string,
		current: T,
		onChange: (value: T) => void,
	): void {
		const field = this.panelEl.createDiv({ cls: "mermaid-flow-field" });
		field.createEl("label", { text: label });
		const select = field.createEl("select", {
			cls: "dropdown mermaid-flow-input",
		});
		for (const opt of options) {
			const o = select.createEl("option", { text: labelFor(opt), value: opt });
			if (opt === current) o.selected = true;
		}
		select.addEventListener("change", () => onChange(select.value as T));
	}

	private dangerButton(text: string, onClick: () => void): void {
		const row = this.panelEl.createDiv({ cls: "mermaid-flow-panel-buttons" });
		const btn = row.createEl("button", {
			text,
			cls: "mermaid-flow-panel-btn mod-warning",
		});
		btn.addEventListener("click", onClick);
	}

	// --- code view ----------------------------------------------------------

	private buildCodeView(parent: HTMLElement): void {
		this.codeWrap = parent.createDiv({ cls: "mermaid-flow-code-wrap" });
		this.codeWrap.hide();
		const header = this.codeWrap.createDiv({ cls: "mermaid-flow-code-header" });
		header.createSpan({ text: "Mermaid code" });

		// Auto-apply toggle
		const toggleDiv = header.createDiv({ cls: "mermaid-flow-code-controls" });
		toggleDiv.createSpan({ text: "Auto-apply: " });
		const autoToggle = toggleDiv.createEl("input", {
			type: "checkbox",
			cls: "mermaid-flow-auto-apply-toggle",
			attr: { "aria-label": "Toggle auto-apply for code changes" },
		});
		autoToggle.addEventListener("change", () => {
			this.autoApplyCode = autoToggle.checked;
		});

		const apply = header.createEl("button", {
			text: "Apply to diagram",
			cls: "mermaid-flow-panel-btn",
			attr: { "aria-label": "Apply code changes to diagram" },
		});
		apply.addEventListener("click", () => this.applyCode());

		const copyBtn = header.createEl("button", {
			text: "Copy",
			cls: "mermaid-flow-panel-btn",
			attr: { "aria-label": "Copy diagram code to clipboard" },
		});
		copyBtn.addEventListener("click", () => this.copyDiagramCode());

		this.codeArea = this.codeWrap.createEl("textarea", {
			cls: "mermaid-flow-code",
			attr: {
				spellcheck: "false",
				"aria-label": "Edit Mermaid diagram code",
			},
		});
		this.codeArea.addEventListener("input", () => this.scheduleCodeApply());

		// Error display
		this.codeErrorEl = this.codeWrap.createDiv({
			cls: "mermaid-flow-code-error",
		});
		this.codeErrorEl.hide();

		this.commit();
	}

	private toggleCode(): void {
		this.codeVisible = !this.codeVisible;
		if (this.codeVisible) {
			this.syncCodeView();
			this.codeWrap.show();
		} else {
			this.codeWrap.hide();
		}
	}

	private syncCodeView(): void {
		if (!this.codeArea) return;
		this.codeArea.value = modelToMermaid(this.model);
	}

	private scheduleCodeApply(): void {
		if (!this.autoApplyCode) return;
		window.clearTimeout(this.codeApplyTimer);
		this.codeApplyTimer = window.setTimeout(() => this.applyCode(true), 600);
	}

	private applyCode(isAuto = false): void {
		try {
			const { model, warnings } = mermaidToModel(this.codeArea.value);
			layoutMissing(model);
			this.model.direction = model.direction;
			this.model.nodes = model.nodes;
			this.model.edges = model.edges;
			this.model.groups = model.groups;
			this.model.config = model.config;
			this.model.extras = model.extras;
			this.canvas.setModel(this.model);
			this.refreshPanel();
			this.commit();
			// Add to history for code changes
			if (!isAuto) this.pushHistory();
			// Clear error display
			if (this.codeErrorEl) this.codeErrorEl.hide();
			if (!isAuto && warnings.length > 0) {
				new Notice(`Applied with ${warnings.length} warning(s).`);
			}
		} catch (err: unknown) {
			const errorMsg =
				err instanceof Error ? err.message : "Unknown parsing error";
			const errorText = `Syntax Error: ${errorMsg}`;

			if (this.codeErrorEl) {
				this.codeErrorEl.empty();
				this.codeErrorEl.createEl("span", {
					cls: "mermaid-flow-error-icon",
					text: "⚠️ ",
				});
				this.codeErrorEl.createEl("span", { text: errorText });
				this.codeErrorEl.show();
			}

			if (!isAuto) {
				new Notice("Invalid Mermaid code. Check the error message below.");
			}
		}
	}

	// --- footer + keys ------------------------------------------------------

	private buildFooter(parent: HTMLElement): void {
		const footer = parent.createDiv({ cls: "mermaid-flow-footer" });
		if (this.host.autoSave) {
			footer.createSpan({
				cls: "mermaid-flow-autosave-note",
				text: "✓ Auto-saving enabled",
			});
		}
	}

	private registerKeys(): void {
		this.keyHandler = (e: KeyboardEvent) => {
			const mod = e.ctrlKey || e.metaKey;
			const target = e.target as HTMLElement | null;
			const tag = target?.tagName?.toLowerCase();
			// Let inputs keep native editing (incl. their own undo).
			if (tag === "input" || tag === "textarea" || tag === "select") return;

			if (mod && (e.key === "z" || e.key === "Z")) {
				e.preventDefault();
				if (e.shiftKey) this.redo();
				else this.undo();
				return;
			}
			if (mod && (e.key === "y" || e.key === "Y")) {
				e.preventDefault();
				this.redo();
				return;
			}

			if (mod && (e.key === "d" || e.key === "D")) {
				e.preventDefault();
				this.duplicateSelected();
				return;
			}
			if (e.key === "Delete" || e.key === "Backspace") {
				e.preventDefault();
				this.deleteSelected();
			}
			// Mode shortcuts
			if (e.key === "s" || e.key === "S") {
				if (tag !== "input" && tag !== "textarea") {
					e.preventDefault();
					this.setMode("select");
				}
			}
			if (e.key === "c" || e.key === "C") {
				if (tag !== "input" && tag !== "textarea") {
					e.preventDefault();
					this.setMode("connect");
				}
			}
		};
		this.root.addEventListener("keydown", this.keyHandler);

		// Focus trap: prevent tabbing out of modal
		this.trapFocus();
	}

	private trapFocus(): void {
		const focusableElements = this.root.querySelectorAll(
			"button, [href], input, select, textarea, [tabindex]:not([tabindex=\"-1\"])"
		);
		const firstElement = focusableElements[0] as HTMLElement;
		const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

		this.root.addEventListener("keydown", (e: KeyboardEvent) => {
			if (e.key !== "Tab") return;
			if (e.shiftKey) {
				if (document.activeElement === firstElement) {
					e.preventDefault();
					lastElement?.focus();
				}
			} else {
				if (document.activeElement === lastElement) {
					e.preventDefault();
					firstElement?.focus();
				}
			}
		});
	}

	private showHelpDialog(): void {
		const modal = new Modal(this.app);
		modal.titleEl.setText("Keyboard Shortcuts & Help");

		const content = modal.contentEl;
		content.addClass("mermaid-flow-help-modal");

		// Keyboard Shortcuts
		content.createEl("h3", { text: "⌨️ Keyboard Shortcuts" });
		const shortcuts = [
			{ key: "Ctrl+Z / Cmd+Z", action: "Undo" },
			{ key: "Ctrl+Shift+Z / Cmd+Shift+Z", action: "Redo" },
			{ key: "Ctrl+Y / Cmd+Y", action: "Redo (alternative)" },
			{ key: "Ctrl+D / Cmd+D", action: "Duplicate selected node" },
			{ key: "Delete / Backspace", action: "Delete selected element" },
			{ key: "S", action: "Select/Move mode" },
			{ key: "C", action: "Connect nodes mode" },
		];

		const shortcutsTable = content.createEl("table", { cls: "mermaid-flow-shortcuts-table" });
		for (const { key, action } of shortcuts) {
			const row = shortcutsTable.createEl("tr");
			row.createEl("td", { text: key, cls: "mermaid-flow-key" });
			row.createEl("td", { text: action });
		}

		// Canvas Controls
		content.createEl("h3", { text: "🖱️ Canvas Controls" });
		const controls = [
			"Drag to pan the canvas",
			"Scroll to zoom in/out",
			"Click nodes to select them",
			"Drag nodes to move them",
			"Drag from blue dot on node to connect to another node",
			"Right-click for context menu with quick actions",
		];
		const controlsList = content.createEl("ul");
		for (const control of controls) {
			controlsList.createEl("li", { text: control });
		}

		// Tips
		content.createEl("h3", { text: "💡 Tips" });
		const tips = [
			"Use Code view (toggle with 📝 button) to edit raw Mermaid code",
			"Enable Auto-apply in code view for real-time diagram updates",
			"Lock layout to prevent accidental position changes",
			"Use Quick add buttons to add nodes quickly",
			"Subgraphs help organize complex diagrams",
		];
		const tipsList = content.createEl("ul");
		for (const tip of tips) {
			tipsList.createEl("li", { text: tip });
		}

		const closeBtn = content.createEl("button", {
			text: "Close",
			cls: "mermaid-flow-modal-close-btn",
		});
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
				const canvasEl = document.createElement("canvas");
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
