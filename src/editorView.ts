/*
 * Embedded (ItemView) host for the visual editor. Lives in a workspace pane
 * beside the note instead of as a popup.
 */

import { ItemView, WorkspaceLeaf } from "obsidian";
import { DiagramEditorUI } from "./editorUI";
import { DiagramModel } from "./model";

export const VIEW_TYPE_MERMAID_FLOW = "mermaid-flow-editor-view";

export class MermaidEditorView extends ItemView {
	private ui: DiagramEditorUI | null = null;
	private model: DiagramModel | null = null;
	private onSave: ((model: DiagramModel) => void) | null = null;
	private autoSave = false;
	private toolbarStyle: "native" | "floating" = "native";

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_MERMAID_FLOW;
	}

	getDisplayText(): string {
		return "Mermaid Flow Editor";
	}

	getIcon(): string {
		return "workflow";
	}

	/** Populate the pane with a diagram and a save handler, then render. */
	setData(
		model: DiagramModel,
		onSave: (model: DiagramModel) => void,
		autoSave = false,
		toolbarStyle: "native" | "floating" = "native",
	): void {
		this.model = model;
		this.onSave = onSave;
		this.autoSave = autoSave;
		this.toolbarStyle = toolbarStyle;
		this.rebuild();
	}

	async onOpen(): Promise<void> {
		this.rebuild();
	}

	async onClose(): Promise<void> {
		this.ui?.destroy();
		this.ui = null;
	}

	private rebuild(): void {
		this.ui?.destroy();
		this.ui = null;

		const container = this.contentEl;
		container.empty();
		container.addClass("mermaid-flow-view");

		if (!this.model) {
			container.createDiv({
				cls: "mermaid-flow-empty",
				text: "Open a Mermaid diagram with the “Edit Mermaid diagram visually” command to start editing.",
			});
			return;
		}

		this.ui = new DiagramEditorUI(this.app, container, this.model, {
			saveLabel: "Save to note",
			persist: (m) => this.onSave?.(m),
			close: () => this.leaf.detach(),
			autoSave: this.autoSave,
			toolbarStyle: this.toolbarStyle,
		});
		this.ui.build();
	}
}
