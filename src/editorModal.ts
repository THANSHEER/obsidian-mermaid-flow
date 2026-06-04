/*
 * Popup (Modal) host for the visual editor.
 */

import { App, Modal } from "obsidian";
import { DiagramEditorUI } from "./editorUI";
import { DiagramModel } from "./model";

export class MermaidEditorModal extends Modal {
	private model: DiagramModel;
	private onSave: (model: DiagramModel) => void;
	private toolbarStyle: "native" | "floating";
	private ui: DiagramEditorUI | null = null;

	constructor(
		app: App,
		model: DiagramModel,
		onSave: (model: DiagramModel) => void,
		toolbarStyle: "native" | "floating" = "native",
	) {
		super(app);
		this.model = model;
		this.onSave = onSave;
		this.toolbarStyle = toolbarStyle;
	}

	onOpen(): void {
		this.modalEl.addClass("mermaid-flow-modal");
		this.titleEl.setText("Visual Mermaid Editor");
		this.ui = new DiagramEditorUI(this.app, this.contentEl, this.model, {
			persist: (m) => this.onSave(m),
			close: () => this.close(),
			closeOnSave: true,
			toolbarStyle: this.toolbarStyle,
		});
		this.ui.build();
	}

	onClose(): void {
		this.ui?.destroy();
		this.ui = null;
		this.contentEl.empty();
	}
}
