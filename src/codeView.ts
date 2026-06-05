/*
 * The raw-Mermaid code view panel (toggle with the toolbar Code button).
 */

import { Notice } from "obsidian";
import { layoutMissing } from "./layout";
import type { DiagramCanvas } from "./canvas";
import type { DiagramModel } from "./model";
import { mermaidToModel } from "./parser";
import { modelToMermaid } from "./serializer";

export interface CodeViewOps {
	getModel: () => DiagramModel;
	setModel: (model: DiagramModel) => void;
	getCanvas: () => DiagramCanvas;
	commit: () => void;
	refresh: () => void;
	pushHistory: () => void;
}

export class CodeView {
	private wrap!: HTMLElement;
	private area!: HTMLTextAreaElement;
	private errorEl!: HTMLElement;
	private autoApply = false;
	private applyTimer = 0;
	private visible = false;
	private ops: CodeViewOps;

	constructor(ops: CodeViewOps) {
		this.ops = ops;
	}

	build(parent: HTMLElement): void {
		this.wrap = parent.createDiv({ cls: "mermaid-flow-code-wrap" });
		this.wrap.hide();

		const header = this.wrap.createDiv({ cls: "mermaid-flow-code-header" });
		header.createSpan({ text: "Mermaid code" });

		const toggleDiv = header.createDiv({ cls: "mermaid-flow-code-controls" });
		toggleDiv.createSpan({ text: "Auto-apply: " });
		const autoToggle = toggleDiv.createEl("input", {
			type: "checkbox",
			cls: "mermaid-flow-auto-apply-toggle",
			attr: { "aria-label": "Toggle auto-apply for code changes" },
		});
		autoToggle.addEventListener("change", () => {
			this.autoApply = autoToggle.checked;
		});

		const actions = header.createDiv({ cls: "mermaid-flow-code-actions" });
		const apply = actions.createEl("button", {
			text: "Apply to diagram",
			cls: "mermaid-flow-panel-btn",
			attr: { "aria-label": "Apply code changes to diagram" },
		});
		apply.addEventListener("click", () => this.applyCode());

		const copyBtn = actions.createEl("button", {
			text: "Copy",
			cls: "mermaid-flow-panel-btn",
			attr: { "aria-label": "Copy diagram code to clipboard" },
		});
		copyBtn.addEventListener("click", () => {
			const code = modelToMermaid(this.ops.getModel());
			void navigator.clipboard
				.writeText(code)
				.then(() => new Notice("Diagram code copied to clipboard"))
				.catch(() => new Notice("Failed to copy code"));
		});

		this.area = this.wrap.createEl("textarea", {
			cls: "mermaid-flow-code",
			attr: { spellcheck: "false", "aria-label": "Edit Mermaid diagram code" },
		});
		this.area.addEventListener("input", () => this.scheduleAutoApply());

		this.errorEl = this.wrap.createDiv({ cls: "mermaid-flow-code-error" });
		this.errorEl.hide();

		// Populate immediately so opening the panel always shows fresh code.
		this.sync();
	}

	toggle(): void {
		this.visible = !this.visible;
		if (this.visible) {
			this.sync();
			this.wrap.show();
		} else {
			this.wrap.hide();
		}
	}

	/** Sync code area from the current model (called on every canvas change). */
	sync(): void {
		if (!this.area) return;
		this.area.value = modelToMermaid(this.ops.getModel());
	}

	destroy(): void {
		window.clearTimeout(this.applyTimer);
	}

	private scheduleAutoApply(): void {
		if (!this.autoApply) return;
		window.clearTimeout(this.applyTimer);
		this.applyTimer = window.setTimeout(() => this.applyCode(true), 600);
	}

	private applyCode(isAuto = false): void {
		try {
			const { model, warnings } = mermaidToModel(this.area.value);
			layoutMissing(model);
			const current = this.ops.getModel();
			current.direction = model.direction;
			current.nodes = model.nodes;
			current.edges = model.edges;
			current.groups = model.groups;
			current.config = model.config;
			current.extras = model.extras;
			this.ops.getCanvas().setModel(current);
			this.ops.refresh();
			this.ops.commit();
			if (!isAuto) this.ops.pushHistory();
			this.errorEl.hide();
			if (!isAuto && warnings.length > 0) {
				new Notice(`Applied with ${warnings.length} warning(s).`);
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Unknown parsing error";
			this.errorEl.empty();
			this.errorEl.createEl("span", { cls: "mermaid-flow-error-icon", text: "⚠️ " });
			this.errorEl.createEl("span", { text: `Syntax Error: ${msg}` });
			this.errorEl.show();
			if (!isAuto) new Notice("Invalid Mermaid code. Check the error below.");
		}
	}
}
