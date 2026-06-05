/*
 * Editable viewer for a diagram's raw Mermaid code, opened from the "code"
 * icon on a rendered diagram. When an onSave callback is supplied the user can
 * edit and save directly; otherwise it falls back to a read-only copy-only view.
 */

import { App, Modal, Notice } from "obsidian";

export class CodeViewModal extends Modal {
	private code: string;
	private onSave?: (code: string) => void;

	constructor(app: App, code: string, onSave?: (code: string) => void) {
		super(app);
		this.code = code;
		this.onSave = onSave;
	}

	onOpen(): void {
		this.titleEl.setText("Mermaid code");
		this.contentEl.addClass("mermaid-flow-code-modal");

		const area = this.contentEl.createEl("textarea", {
			cls: "mermaid-flow-code",
		});
		area.value = this.code;
		area.readOnly = !this.onSave;
		area.spellcheck = false;

		const footer = this.contentEl.createDiv({ cls: "mermaid-flow-footer" });

		const copy = footer.createEl("button", { text: "Copy" });
		copy.addEventListener("click", () => {
			void navigator.clipboard.writeText(area.value).then(
				() => new Notice("Mermaid code copied."),
				() => new Notice("Copy failed."),
			);
		});

		if (this.onSave) {
			const save = footer.createEl("button", {
				text: "Save",
				cls: "mod-cta",
			});
			save.addEventListener("click", () => {
				this.onSave!(area.value);
				this.close();
			});

			const cancel = footer.createEl("button", { text: "Cancel" });
			cancel.addEventListener("click", () => this.close());
		} else {
			const close = footer.createEl("button", { text: "Close", cls: "mod-cta" });
			close.addEventListener("click", () => this.close());
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
