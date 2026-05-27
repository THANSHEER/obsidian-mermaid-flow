/*
 * Popup (Modal) host for the visual editor.
 */

import { App, Modal } from "obsidian";
import { DiagramEditorUI } from "./editorUI";
import { DiagramModel } from "./model";

export class MermaidEditorModal extends Modal {
	private model: DiagramModel;
	private onSave: (model: DiagramModel) => void;
	private ui: DiagramEditorUI | null = null;

	constructor(
		app: App,
		model: DiagramModel,
		onSave: (model: DiagramModel) => void,
	) {
		super(app);
		this.model = model;
		this.onSave = onSave;
	}

	onOpen(): void {
		this.modalEl.addClass("mermaid-flow-modal");
		this.titleEl.setText("Visual Mermaid Editor");
		this.ui = new DiagramEditorUI(this.app, this.contentEl, this.model, {
			persist: (m) => this.onSave(m),
			close: () => this.close(),
			closeOnSave: true,
		});
		this.ui.build();
	}

	onClose(): void {
		this.ui?.destroy();
		this.ui = null;
		this.contentEl.empty();
	}
}
