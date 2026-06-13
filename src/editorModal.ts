/*
 * Popup (Modal) host for the visual editor.
 */

import { App, Modal } from "obsidian";
import { AiHostBridge, DiagramEditorUI } from "./editorUI";
import { DiagramModel } from "./model";

export class MermaidEditorModal extends Modal {
	private model: DiagramModel;
	private onSave: (model: DiagramModel) => void;
	private toolbarStyle: "native" | "floating";
	private exportFolder: string;
	private snapSize: number;
	private ai?: AiHostBridge;
	private ui: DiagramEditorUI | null = null;

	constructor(
		app: App,
		model: DiagramModel,
		onSave: (model: DiagramModel) => void,
		toolbarStyle: "native" | "floating" = "native",
		exportFolder = "mermaid flow",
		snapSize = 0,
		ai?: AiHostBridge,
	) {
		super(app);
		this.model = model;
		this.onSave = onSave;
		this.toolbarStyle = toolbarStyle;
		this.exportFolder = exportFolder;
		this.snapSize = snapSize;
		this.ai = ai;
	}

	onOpen(): void {
		this.modalEl.addClass("mermaid-flow-modal");
		this.titleEl.setText("Visual Mermaid Editor");
		// Replace the native close X with our own Discard/Save icon actions, sat
		// at the title-bar level. Esc still closes (acts as Discard).
		this.modalEl.querySelector(".modal-close-button")?.remove();
		const actionsSlot = this.modalEl.createDiv({
			cls: "mermaid-flow-title-actions-slot",
		});
		this.ui = new DiagramEditorUI(this.app, this.contentEl, this.model, {
			persist: (m) => this.onSave(m),
			close: () => this.close(),
			closeOnSave: true,
			toolbarStyle: this.toolbarStyle,
			exportFolder: this.exportFolder,
			snapSize: this.snapSize,
			actionsSlot,
			ai: this.ai,
		});
		this.ui.build();
	}

	onClose(): void {
		this.ui?.destroy();
		this.ui = null;
		this.contentEl.empty();
	}
}
