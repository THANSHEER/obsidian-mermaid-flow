/*
 * Toolbar builder for the visual editor.
 * All toolbar DOM construction and palette drag-to-canvas lives here.
 */

import { Menu, setIcon } from "obsidian";
import { AlignDir, DistributeDir } from "./alignTools";
import type { DiagramCanvas, EditorMode } from "./canvas";
import {
	DIRECTIONS,
	DIRECTION_LABELS,
	Direction,
	NODE_SHAPES,
	NodeShape,
	SHAPE_LABELS,
} from "./model";
import { THEME_PRESETS } from "./presets";
import { createShapeIcon } from "./shapes";

export interface ToolbarOps {
	undo(): void;
	redo(): void;
	setMode(mode: EditorMode): void;
	getMode(): EditorMode;
	addNode(shape: NodeShape): void;
	addNodeAt(shape: NodeShape, svgX: number, svgY: number): void;
	showLayoutMenu(e: MouseEvent): void;
	toggleLock(): void;
	addSubgraph(): void;
	deleteSelected(): void;
	toggleCode(): void;
	showExportMenu(e: MouseEvent): void;
	showHelpDialog(): void;
	showComponentMenu?(e: MouseEvent): void;
	zoomToFit(): void;
	applyTheme(id: string): void;
	matchesTheme(id: string): boolean;
	applyDirection(dir: Direction): void;
	getCurrentDirection(): Direction;
	alignSelected(dir: AlignDir): void;
	distributeSelected(dir: DistributeDir): void;
	discard(): void;
	save(): void;
	getCanvas(): DiagramCanvas;
	getMultiCount(): number;
	getSaveLabel(): string;
	/** Present only when AI assistance is enabled for this editor session. */
	showAiMenu?(e: MouseEvent): void;
}

export interface ToolbarRefs {
	undoBtn: HTMLButtonElement;
	redoBtn: HTMLButtonElement;
	lockBtn: HTMLButtonElement;
	zoomLabel: HTMLButtonElement;
	updateModeButtons(): void;
	updateZoomLabel(zoom: number): void;
	updateAlignGroup(): void;
}

export function buildToolbar(bar: HTMLElement, ops: ToolbarOps): ToolbarRefs {
	// Undo / redo
	const historyGroup = bar.createDiv({ cls: "mermaid-flow-tb-group" });
	const undoBtn = iconButton(historyGroup, "undo-2", "Undo (Ctrl+Z)", () => ops.undo());
	const redoBtn = iconButton(historyGroup, "redo-2", "Redo (Ctrl+Shift+Z)", () => ops.redo());

	// Mode toggle
	const modeGroup = bar.createDiv({ cls: "mermaid-flow-tb-group" });
	const selectModeBtn = iconButton(modeGroup, "mouse-pointer-2", "Select / move (S)", () => ops.setMode("select"));
	const connectModeBtn = iconButton(modeGroup, "spline", "Connect nodes (C)", () => ops.setMode("connect"));

	const updateModeButtons = () => {
		const mode = ops.getMode();
		selectModeBtn.toggleClass("is-active", mode === "select");
		connectModeBtn.toggleClass("is-active", mode === "connect");
	};
	updateModeButtons();

	// Shape palette (hover dropdown with drag-to-canvas support)
	buildShapeMenu(bar, ops);

	// Layout + lock
	const layoutGroup = bar.createDiv({ cls: "mermaid-flow-tb-group" });
	iconButtonEv(layoutGroup, "layout-template", "Layout presets", (e) => ops.showLayoutMenu(e));
	const lockBtn = iconButton(layoutGroup, "lock-open", "Lock layout", () => ops.toggleLock());

	// Align & distribute (always visible; dims when < 2 nodes selected)
	const alignGroup = bar.createDiv({ cls: "mermaid-flow-tb-group mermaid-flow-align-group" });
	buildAlignGroup(alignGroup, ops);

	const updateAlignGroup = () => {
		const count = ops.getMultiCount();
		alignGroup.toggleClass("is-disabled", count < 2);
	};
	updateAlignGroup();

	// Group + delete
	const opsGroup = bar.createDiv({ cls: "mermaid-flow-tb-group" });
	iconButton(opsGroup, "group", "Group selected node into a subgraph (Ctrl+G)", () => ops.addSubgraph());
	iconButton(opsGroup, "trash-2", "Delete selected (Del)", () => ops.deleteSelected());

	// Code + export
	const codeGroup = bar.createDiv({ cls: "mermaid-flow-tb-group" });
	iconButton(codeGroup, "code", "Toggle code view", () => ops.toggleCode());
	iconButtonEv(codeGroup, "download", "Export diagram", (e) => ops.showExportMenu(e));
	if (ops.showComponentMenu) {
		iconButtonEv(codeGroup, "library", "Component library", (e) => ops.showComponentMenu!(e));
	}

	// AI assist (only when the host enabled AI for this session)
	const showAiMenu = ops.showAiMenu?.bind(ops);
	if (showAiMenu) {
		const aiGroup = bar.createDiv({ cls: "mermaid-flow-tb-group" });
		iconButtonEv(aiGroup, "sparkles", "AI assist", (e) => showAiMenu(e));
	}

	// Help
	const helpGroup = bar.createDiv({ cls: "mermaid-flow-tb-group" });
	iconButton(helpGroup, "help-circle", "Keyboard shortcuts & Help", () => ops.showHelpDialog());

	// Zoom controls
	const zoomGroup = bar.createDiv({ cls: "mermaid-flow-tb-group" });
	iconButton(zoomGroup, "zoom-out", "Zoom out (Ctrl/Cmd −)", () => ops.getCanvas().zoomOut());
	const zoomLabel = zoomGroup.createEl("button", {
		cls: "mermaid-flow-tb-btn mermaid-flow-zoom-label",
		text: "100%",
		attr: { "aria-label": "Reset zoom to 100%" },
	});
	zoomLabel.addEventListener("click", () => ops.getCanvas().zoomReset());
	iconButton(zoomGroup, "zoom-in", "Zoom in (Ctrl/Cmd +)", () => ops.getCanvas().zoomIn());
	iconButton(zoomGroup, "maximize-2", "Zoom to fit (Ctrl+Shift+F)", () => ops.zoomToFit());

	const updateZoomLabel = (zoom: number) => {
		zoomLabel.setText(`${Math.round(zoom * 100)}%`);
	};

	// Spacer
	bar.createDiv({ cls: "mermaid-flow-spacer" });

	// Direction dropdown
	const dirGroup = bar.createDiv({ cls: "mermaid-flow-tb-group" });
	dirGroup.createSpan({ cls: "mermaid-flow-tb-label", text: "Direction" });
	const dirSelect = dirGroup.createEl("select", {
		cls: "dropdown mermaid-flow-select",
		attr: { "aria-label": "Select direction" },
	});
	for (const dir of DIRECTIONS) {
		const opt = dirSelect.createEl("option", { text: DIRECTION_LABELS[dir], value: dir });
		if (dir === ops.getCurrentDirection()) opt.selected = true;
	}
	dirSelect.addEventListener("change", () => ops.applyDirection(dirSelect.value as Direction));

	// Theme dropdown
	const themeGroup = bar.createDiv({ cls: "mermaid-flow-tb-group" });
	themeGroup.createSpan({ cls: "mermaid-flow-tb-label", text: "Theme" });
	const themeSelect = themeGroup.createEl("select", {
		cls: "dropdown mermaid-flow-select",
		attr: { "aria-label": "Select theme" },
	});
	for (const preset of THEME_PRESETS) {
		const o = themeSelect.createEl("option", { text: preset.label, value: preset.id });
		if (ops.matchesTheme(preset.id)) o.selected = true;
	}
	themeSelect.addEventListener("change", () => ops.applyTheme(themeSelect.value));

	// Save / Discard (docked text buttons)
	buildDockedActions(bar, ops);

	return { undoBtn, redoBtn, lockBtn, zoomLabel, updateModeButtons, updateZoomLabel, updateAlignGroup };
}

// --- shape menu (hover dropdown with drag support) --------------------------

function buildShapeMenu(bar: HTMLElement, ops: ToolbarOps): void {
	const menu = bar.createDiv({ cls: "mermaid-flow-tb-group mermaid-flow-shape-menu" });
	const btn = menu.createEl("button", {
		cls: "mermaid-flow-icon-btn",
		attr: { "aria-label": "Add shape" },
	});
	setIcon(btn, "shapes");
	btn.createSpan({ cls: "mermaid-flow-caret", text: "▾" });

	const popup = menu.createDiv({ cls: "mermaid-flow-shape-popup" });
	const grid = popup.createDiv({ cls: "mermaid-flow-palette-grid" });

	// Click-toggled (not hover-only) so the palette also opens on touch/tap,
	// and survives the mouse crossing the gap between the button and the
	// popup below it (that gap sits outside menu's own layout box, so a
	// mouseleave-based close used to fire before the pointer ever reached
	// the popup).
	let outsideMousedown: ((e: MouseEvent) => void) | null = null;
	const closeMenu = () => {
		menu.removeClass("is-open");
		if (outsideMousedown) {
			activeDocument.removeEventListener("mousedown", outsideMousedown, true);
			outsideMousedown = null;
		}
	};
	const openMenu = () => {
		menu.addClass("is-open");
		outsideMousedown = (e: MouseEvent) => {
			if (!menu.contains(e.target as Node)) closeMenu();
		};
		activeDocument.addEventListener("mousedown", outsideMousedown, true);
	};
	btn.addEventListener("click", (e) => {
		e.preventDefault();
		e.stopPropagation();
		if (menu.hasClass("is-open")) closeMenu(); else openMenu();
	});

	for (const shape of NODE_SHAPES) {
		const item = grid.createEl("button", {
			cls: "mermaid-flow-shape-btn",
			attr: {
				"aria-label": SHAPE_LABELS[shape],
				draggable: "true",
			},
		});
		item.appendChild(createShapeIcon(shape));

		// Click: add at viewport centre, then close the popup
		item.addEventListener("click", (e) => {
			e.preventDefault();
			ops.addNode(shape);
			closeMenu();
		});

		// Drag-to-canvas: drop at the pointer position
		item.addEventListener("dragstart", (e) => {
			if (!e.dataTransfer) return;
			e.dataTransfer.setData("text/plain", shape);
			e.dataTransfer.effectAllowed = "copy";
		});
	}

	// Wire dragover / drop on the canvas scroller (accessed via the canvas public API)
	const canvas = ops.getCanvas();
	canvas.registerDropTarget((shape: string, svgX: number, svgY: number) => {
		ops.addNodeAt(shape as NodeShape, svgX, svgY);
	});
}

// --- align & distribute toolbar group ---------------------------------------

function buildAlignGroup(group: HTMLElement, ops: ToolbarOps): void {
	const alignMenu = (e: MouseEvent) => {
		if (ops.getMultiCount() < 2) return;
		const menu = new Menu();
		menu.addItem((item) => item.setTitle("Align left edges").setIcon("align-left").onClick(() => ops.alignSelected("left")));
		menu.addItem((item) => item.setTitle("Align right edges").setIcon("align-right").onClick(() => ops.alignSelected("right")));
		menu.addItem((item) => item.setTitle("Align top edges").setIcon("align-start-horizontal").onClick(() => ops.alignSelected("top")));
		menu.addItem((item) => item.setTitle("Align bottom edges").setIcon("align-end-horizontal").onClick(() => ops.alignSelected("bottom")));
		menu.addItem((item) => item.setTitle("Centre horizontally").setIcon("align-center-horizontal").onClick(() => ops.alignSelected("center-x")));
		menu.addItem((item) => item.setTitle("Centre vertically").setIcon("align-center-vertical").onClick(() => ops.alignSelected("center-y")));
		menu.addSeparator();
		menu.addItem((item) => item.setTitle("Distribute horizontally").setIcon("columns-3").onClick(() => ops.distributeSelected("horizontal")));
		menu.addItem((item) => item.setTitle("Distribute vertically").setIcon("rows-3").onClick(() => ops.distributeSelected("vertical")));
		menu.showAtMouseEvent(e);
	};

	iconButtonEv(group, "layout-panel-left", "Align & distribute", alignMenu);
}

// --- docked save/discard actions --------------------------------------------

function buildDockedActions(bar: HTMLElement, ops: ToolbarOps): void {
	const group = bar.createDiv({ cls: "mermaid-flow-tb-group mermaid-flow-actions" });
	const discardBtn = group.createEl("button", {
		text: "Discard",
		cls: "mermaid-flow-tb-btn",
		attr: { "aria-label": "Discard changes and close" },
	});
	discardBtn.addEventListener("click", () => ops.discard());
	const saveBtn = group.createEl("button", {
		text: ops.getSaveLabel(),
		cls: "mermaid-flow-tb-btn mod-cta",
		attr: { "aria-label": "Save diagram to note" },
	});
	saveBtn.addEventListener("click", () => ops.save());
}

// --- icon button helpers (private to this module) ---------------------------

function iconButton(
	parent: HTMLElement,
	icon: string,
	tooltip: string,
	onClick: () => void,
): HTMLButtonElement {
	const btn = parent.createEl("button", {
		cls: "mermaid-flow-icon-btn",
		attr: { "aria-label": tooltip },
	});
	setIcon(btn, icon);
	btn.addEventListener("click", (e) => { e.preventDefault(); onClick(); });
	return btn;
}

function iconButtonEv(
	parent: HTMLElement,
	icon: string,
	tooltip: string,
	onClick: (e: MouseEvent) => void,
): HTMLButtonElement {
	const btn = parent.createEl("button", {
		cls: "mermaid-flow-icon-btn",
		attr: { "aria-label": tooltip },
	});
	setIcon(btn, icon);
	btn.addEventListener("click", (e) => { e.preventDefault(); onClick(e); });
	return btn;
}
