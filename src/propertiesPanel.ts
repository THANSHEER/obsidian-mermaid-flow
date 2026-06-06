/*
 * The right-hand properties / inspector panel for the visual editor.
 */

import type { DiagramCanvas } from "./canvas";
import {
	DiagramEdge,
	DiagramModel,
	DiagramNode,
	EDGE_KINDS,
	EDGE_LABELS,
	NODE_SHAPES,
	SHAPE_LABELS,
	assignNodeToGroup,
	groupOf,
	hasEdgeStyle,
	hasStyle,
	newGroupId,
} from "./model";
import { STYLE_PRESETS } from "./presets";

export interface PanelOps {
	commit(): void;
	render(): void;
	refresh(): void;
	quickAddStep(): void;
	quickAddBranch(): void;
	quickAddChild(): void;
	applyStylePreset(id: string): void;
	duplicateSelected(): void;
	deleteSelected(): void;
	addSubgraph(): void;
	ungroupSelected(): void;
	reverseSelectedEdge(): void;
	focusLabel(): void;
}

export class PropertiesPanel {
	private panelEl: HTMLElement;
	private getModel: () => DiagramModel;
	private getCanvas: () => DiagramCanvas;
	private ops: PanelOps;

	private lastSelKey: string | null = null;
	private focusLabelOnBuild = false;

	constructor(
		panelEl: HTMLElement,
		getModel: () => DiagramModel,
		getCanvas: () => DiagramCanvas,
		ops: PanelOps,
	) {
		this.panelEl = panelEl;
		this.getModel = getModel;
		this.getCanvas = getCanvas;
		this.ops = ops;
	}

	refresh(): HTMLInputElement | null {
		const canvas = this.getCanvas();
		const model = this.getModel();
		const sel = canvas.getSelection();
		const multi = canvas.getMultiSelection();

		const selKey = sel ? `${sel.type}:${sel.id}` : null;
		this.focusLabelOnBuild = selKey !== this.lastSelKey;
		this.lastSelKey = selKey;
		this.panelEl.empty();

		// Multi-selection batch style panel
		if (multi.length > 1) {
			return this.buildMultiPanel(multi, model);
		}

		if (!sel) {
			const empty = model.nodes.length === 0;
			this.panelEl.createEl("h3", { text: empty ? "Get started" : "Properties" });
			const hint = this.panelEl.createDiv({ cls: "mermaid-flow-hint" });
			hint.createEl("p", {
				text: empty
					? "Build a flowchart visually — no Mermaid syntax needed."
					: "Select a node or edge to edit it.",
			});
			const list = hint.createEl("ul");
			list.createEl("li", { text: "Click a shape in the toolbar to add a node." });
			list.createEl("li", { text: "Drag a node to move it; drag a blue edge dot to connect." });
			list.createEl("li", { text: "Shift-click or drag a box to select several nodes." });
			list.createEl("li", { text: "Right-click a node or edge for more actions." });
			this.buildDiagramSection(model);
			this.panelEl.createDiv({
				cls: "mermaid-flow-stats",
				text: `${model.nodes.length} nodes · ${model.edges.length} edges`,
			});
			return null;
		}

		if (sel.type === "node") return this.buildNodePanel(sel.id, model);
		if (sel.type === "edge") { this.buildEdgePanel(sel.id, model); return null; }
		this.buildGroupPanel(sel.id, model);
		return null;
	}

	/** Returns the label input so the coordinator can focus it for F2. */
	getLabelInput(): HTMLInputElement | null {
		return this.panelEl.querySelector<HTMLInputElement>("input[type=text]");
	}

	// --- multi-select batch panel -------------------------------------------

	private buildMultiPanel(ids: string[], model: DiagramModel): null {
		const nodes = ids
			.map((id) => model.nodes.find((n) => n.id === id))
			.filter((n): n is DiagramNode => n !== undefined);

		this.panelEl.createEl("h3", { text: `${ids.length} nodes selected` });
		this.panelEl.createDiv({
			cls: "mermaid-flow-hint",
			text: "Style changes apply to all selected nodes.",
		});

		this.panelEl.createEl("h4", { cls: "mermaid-flow-subhead", text: "Style as" });
		const chipRow = this.panelEl.createDiv({ cls: "mermaid-flow-chip-row" });
		for (const preset of STYLE_PRESETS) {
			const chip = chipRow.createEl("button", {
				cls: "mermaid-flow-chip",
				text: preset.label,
			});
			chip.style.borderColor = preset.style.strokeColor ?? "";
			chip.addEventListener("click", () => {
				for (const n of nodes) {
					n.shape = preset.shape;
					n.style = { ...preset.style };
				}
				this.ops.render();
				this.ops.commit();
				this.refresh();
			});
		}

		this.panelEl.createEl("h4", { cls: "mermaid-flow-subhead", text: "Text & style" });

		this.colorField("Fill color", undefined, "#ffffff", (value) => {
			for (const n of nodes) { if (!n.style) n.style = {}; n.style.fillColor = value; }
			this.ops.render(); this.ops.commit();
		});
		this.colorField("Border color", undefined, "#888888", (value) => {
			for (const n of nodes) { if (!n.style) n.style = {}; n.style.strokeColor = value; }
			this.ops.render(); this.ops.commit();
		});
		this.colorField("Text color", undefined, "#333333", (value) => {
			for (const n of nodes) { if (!n.style) n.style = {}; n.style.textColor = value; }
			this.ops.render(); this.ops.commit();
		});

		const resetRow = this.panelEl.createDiv({ cls: "mermaid-flow-panel-buttons" });
		resetRow.createEl("button", {
			text: "Reset style for all",
			cls: "mermaid-flow-panel-btn mod-warning",
		}).addEventListener("click", () => {
			for (const n of nodes) n.style = undefined;
			this.ops.render(); this.ops.commit(); this.refresh();
		});

		return null;
	}

	// --- diagram-level section ----------------------------------------------

	private buildDiagramSection(model: DiagramModel): void {
		this.sectionHead("Diagram");
		const field = this.panelEl.createDiv({ cls: "mermaid-flow-field-inline" });
		field.createEl("label", { text: "Background" });
		const controls = field.createDiv({ cls: "mermaid-flow-bg-controls" });

		const color = controls.createEl("input", {
			type: "color",
			attr: { "aria-label": "Diagram background color" },
		});
		color.value = model.config.background ?? "#ffffff";

		const transparent = controls.createEl("button", {
			cls: "mermaid-flow-chip",
			text: "Transparent",
		});
		transparent.toggleClass("is-active", !model.config.background);

		color.addEventListener("input", () => {
			model.config.background = color.value;
			transparent.toggleClass("is-active", false);
			this.getCanvas().refreshBackground();
			this.ops.commit();
		});
		transparent.addEventListener("click", () => {
			delete model.config.background;
			transparent.toggleClass("is-active", true);
			this.getCanvas().refreshBackground();
			this.ops.commit();
		});
	}

	// --- group panel --------------------------------------------------------

	private buildGroupPanel(id: string, model: DiagramModel): void {
		const group = model.groups.find((g) => g.id === id);
		if (!group) return;
		this.panelEl.createEl("h3", { text: "Subgraph" });
		this.panelEl.createDiv({
			cls: "mermaid-flow-field-readonly",
			text: `id: ${group.id} · ${group.nodeIds.length} nodes`,
		});
		this.labelField("Title", group.title, (value) => {
			group.title = value;
			this.ops.render();
			this.ops.commit();
		});
		this.panelEl.createDiv({
			cls: "mermaid-flow-hint",
			text: "Drag the title bar to move the whole group. Assign more nodes from each node's panel.",
		});
		this.dangerButton("Ungroup (keep nodes)", () => this.ops.ungroupSelected());
	}

	// --- node panel ---------------------------------------------------------

	private buildNodePanel(id: string, model: DiagramModel): HTMLInputElement | null {
		const node = model.nodes.find((n) => n.id === id);
		if (!node) return null;

		this.panelEl.createEl("h3", { text: "Node" });
		this.panelEl.createDiv({ cls: "mermaid-flow-field-readonly", text: `id: ${node.id}` });

		this.sectionHead("Content");
		const labelInput = this.labelField("Label", node.label, (value) => {
			node.label = value;
			this.ops.render();
			this.ops.commit();
		});

		this.sectionHead("Shape & size");
		this.selectField("Shape", NODE_SHAPES, (s) => SHAPE_LABELS[s], node.shape, (value) => {
			node.shape = value;
			this.ops.render();
			this.ops.commit();
		});
		this.buildNodeSizeField(node);
		this.buildNodeGroupField(node, model);

		this.buildStyleAsRow();
		this.buildNodeStyleSection(node);
		this.buildQuickAddRow();

		// Lock toggle
		const lockRow = this.panelEl.createDiv({ cls: "mermaid-flow-field-inline" });
		lockRow.createEl("label", { text: "Lock position" });
		const lockToggle = lockRow.createEl("input", { type: "checkbox" });
		lockToggle.checked = !!node.locked;
		lockToggle.addEventListener("change", () => {
			node.locked = lockToggle.checked || undefined;
			this.ops.render();
			this.ops.commit();
		});

		const dupRow = this.panelEl.createDiv({ cls: "mermaid-flow-panel-buttons" });
		dupRow.createEl("button", {
			text: "Duplicate",
			cls: "mermaid-flow-panel-btn",
		}).addEventListener("click", () => this.ops.duplicateSelected());

		this.dangerButton("Delete node", () => this.ops.deleteSelected());
		return labelInput;
	}

	private buildNodeSizeField(node: DiagramNode): void {
		const size = this.getCanvas().effectiveSize(node.id);
		const row = this.panelEl.createDiv({ cls: "mermaid-flow-field" });
		row.createEl("label", { text: "Size" });
		const inputs = row.createDiv({ cls: "mermaid-flow-size-row" });

		inputs.createSpan({ cls: "mermaid-flow-size-affix", text: "W" });
		const wInput = inputs.createEl("input", {
			type: "number",
			cls: "mermaid-flow-input",
			attr: { "aria-label": "Node width" },
		});
		wInput.value = String(node.w ?? size.w);
		inputs.createSpan({ cls: "mermaid-flow-size-affix", text: "H" });
		const hInput = inputs.createEl("input", {
			type: "number",
			cls: "mermaid-flow-input",
			attr: { "aria-label": "Node height" },
		});
		hInput.value = String(node.h ?? size.h);

		const apply = () => {
			const w = parseInt(wInput.value, 10);
			const h = parseInt(hInput.value, 10);
			if (!Number.isNaN(w)) node.w = Math.max(48, w);
			if (!Number.isNaN(h)) node.h = Math.max(32, h);
			this.ops.render();
			this.ops.commit();
		};
		wInput.addEventListener("change", apply);
		hInput.addEventListener("change", apply);

		row.createEl("button", { cls: "mermaid-flow-chip", text: "Auto size" })
			.addEventListener("click", () => {
				delete node.w;
				delete node.h;
				this.ops.render();
				this.refresh();
				this.ops.commit();
			});
	}

	private buildNodeGroupField(node: DiagramNode, model: DiagramModel): void {
		const field = this.panelEl.createDiv({ cls: "mermaid-flow-field" });
		field.createEl("label", { text: "Subgraph" });
		const select = field.createEl("select", { cls: "dropdown mermaid-flow-input" });
		const current = groupOf(model, node.id);
		select.createEl("option", { text: "(none)", value: "__none__" });
		for (const g of model.groups) {
			const o = select.createEl("option", { text: g.title || g.id, value: g.id });
			if (current && current.id === g.id) o.selected = true;
		}
		select.createEl("option", { text: "+ New subgraph", value: "__new__" });
		select.addEventListener("change", () => {
			const v = select.value;
			if (v === "__new__") {
				const id = newGroupId(model);
				const num = model.groups.length + 1;
				model.groups.push({ id, title: `Subgraph ${num}`, nodeIds: [node.id] });
				assignNodeToGroup(model, node.id, id);
			} else {
				assignNodeToGroup(model, node.id, v === "__none__" ? null : v);
			}
			this.ops.render();
			this.ops.commit();
			this.refresh();
		});
	}

	private buildStyleAsRow(): void {
		this.panelEl.createEl("h4", { cls: "mermaid-flow-subhead", text: "Style as" });
		const row = this.panelEl.createDiv({ cls: "mermaid-flow-chip-row" });
		for (const preset of STYLE_PRESETS) {
			const chip = row.createEl("button", { cls: "mermaid-flow-chip", text: preset.label });
			chip.style.borderColor = preset.style.strokeColor ?? "";
			chip.addEventListener("click", () => this.ops.applyStylePreset(preset.id));
		}
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
		resetRow.createEl("button", { text: "Reset style", cls: "mermaid-flow-panel-btn" })
			.addEventListener("click", () => {
				node.style = undefined;
				this.ops.render();
				this.ops.commit();
				this.refresh();
			});
	}

	private buildQuickAddRow(): void {
		this.panelEl.createEl("h4", { cls: "mermaid-flow-subhead", text: "Quick add" });
		const row = this.panelEl.createDiv({ cls: "mermaid-flow-chip-row" });
		const mk = (label: string, fn: () => void) =>
			row.createEl("button", { cls: "mermaid-flow-chip", text: label })
				.addEventListener("click", fn);
		mk("Step after", () => this.ops.quickAddStep());
		mk("Yes/No branch", () => this.ops.quickAddBranch());
		mk("Child", () => this.ops.quickAddChild());
	}

	// --- edge panel ---------------------------------------------------------

	private buildEdgePanel(id: string, model: DiagramModel): void {
		const edge = model.edges.find((e) => e.id === id);
		if (!edge) return;
		this.panelEl.createEl("h3", { text: "Edge" });
		this.panelEl.createDiv({
			cls: "mermaid-flow-field-readonly",
			text: `${edge.from} → ${edge.to}`,
		});

		this.labelField("Label", edge.label, (value) => {
			edge.label = value;
			this.ops.render();
			this.ops.commit();
		});

		this.selectField("Type", EDGE_KINDS, (k) => EDGE_LABELS[k], edge.kind, (value) => {
			edge.kind = value;
			this.ops.render();
			this.ops.commit();
		});

		this.buildEdgeStyleSection(edge);

		// Animated toggle
		const animRow = this.panelEl.createDiv({ cls: "mermaid-flow-field-inline" });
		animRow.createEl("label", { text: "Animated" });
		const animToggle = animRow.createEl("input", { type: "checkbox" });
		animToggle.checked = !!edge.animated;
		animToggle.addEventListener("change", () => {
			edge.animated = animToggle.checked || undefined;
			this.ops.render();
			this.ops.commit();
		});

		const btnRow = this.panelEl.createDiv({ cls: "mermaid-flow-panel-buttons" });
		btnRow.createEl("button", { text: "Reverse direction", cls: "mermaid-flow-panel-btn" })
			.addEventListener("click", () => this.ops.reverseSelectedEdge());

		this.dangerButton("Delete edge", () => this.ops.deleteSelected());
	}

	private buildEdgeStyleSection(edge: DiagramEdge): void {
		this.panelEl.createEl("h4", { cls: "mermaid-flow-subhead", text: "Line & label style" });

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
		resetRow.createEl("button", { text: "Reset style", cls: "mermaid-flow-panel-btn" })
			.addEventListener("click", () => {
				edge.style = undefined;
				this.ops.render();
				this.ops.commit();
				this.refresh();
			});
	}

	// --- shared field helpers -----------------------------------------------

	private sectionHead(text: string): void {
		this.panelEl.createEl("h4", { cls: "mermaid-flow-subhead", text });
	}

	private labelField(
		label: string,
		value: string,
		onInput: (value: string) => void,
	): HTMLInputElement {
		const field = this.panelEl.createDiv({ cls: "mermaid-flow-field" });
		field.createEl("label", { text: label });
		const input = field.createEl("input", { type: "text", cls: "mermaid-flow-input" });
		input.value = value;
		input.addEventListener("input", () => onInput(input.value));
		if (this.focusLabelOnBuild) {
			this.focusLabelOnBuild = false;
			window.setTimeout(() => { input.focus(); input.select(); }, 0);
		}
		return input;
	}

	private numberField(
		label: string,
		value: number | undefined,
		onChange: (value: number | null) => void,
	): void {
		const field = this.panelEl.createDiv({ cls: "mermaid-flow-field" });
		field.createEl("label", { text: label });
		const input = field.createEl("input", { type: "number", cls: "mermaid-flow-input" });
		input.placeholder = "auto";
		input.min = "6";
		if (value !== undefined) input.value = String(value);
		input.addEventListener("input", () => {
			const t = input.value.trim();
			if (t === "") { onChange(null); return; }
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
		const select = field.createEl("select", { cls: "dropdown mermaid-flow-input" });
		for (const opt of options) {
			const o = select.createEl("option", { text: labelFor(opt), value: opt });
			if (opt === current) o.selected = true;
		}
		select.addEventListener("change", () => onChange(select.value as T));
	}

	private fontFamilyField(
		current: string | undefined,
		onChange: (value: string) => void,
	): void {
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
		const select = field.createEl("select", { cls: "dropdown mermaid-flow-input" });
		for (const f of families) {
			const o = select.createEl("option", { text: f.label, value: f.value });
			if ((current ?? "") === f.value) o.selected = true;
		}
		select.addEventListener("change", () => onChange(select.value));
	}

	private dangerButton(text: string, onClick: () => void): void {
		const row = this.panelEl.createDiv({ cls: "mermaid-flow-panel-buttons" });
		row.createEl("button", { text, cls: "mermaid-flow-panel-btn mod-warning" })
			.addEventListener("click", onClick);
	}

	private ensureStyle(node: DiagramNode): NonNullable<DiagramNode["style"]> {
		if (!node.style) node.style = {};
		return node.style;
	}

	private afterStyleChange(node: DiagramNode): void {
		if (!hasStyle(node.style)) node.style = undefined;
		this.ops.render();
		this.ops.commit();
	}

	private ensureEdgeStyle(edge: DiagramEdge): NonNullable<DiagramEdge["style"]> {
		if (!edge.style) edge.style = {};
		return edge.style;
	}

	private afterEdgeStyleChange(edge: DiagramEdge): void {
		if (!hasEdgeStyle(edge.style)) edge.style = undefined;
		this.ops.render();
		this.ops.commit();
	}
}
