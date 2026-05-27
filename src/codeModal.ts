/*
 * Read-only viewer for a diagram's raw Mermaid code, opened from the "code"
 * icon on a rendered diagram.
 */

import { App, Modal, Notice } from "obsidian";

export class CodeViewModal extends Modal {
	private code: string;

	constructor(app: App, code: string) {
		super(app);
		this.code = code;
	}

	onOpen(): void {
		this.titleEl.setText("Mermaid code");
		this.contentEl.addClass("mermaid-flow-code-modal");

		const area = this.contentEl.createEl("textarea", {
			cls: "mermaid-flow-code",
		});
		area.value = this.code;
		area.readOnly = true;
		area.spellcheck = false;

		const footer = this.contentEl.createDiv({ cls: "mermaid-flow-footer" });
		const copy = footer.createEl("button", {
			text: "Copy",
			cls: "mod-cta",
		});
		copy.addEventListener("click", () => {
			void navigator.clipboard.writeText(this.code).then(
				() => new Notice("Mermaid code copied."),
				() => new Notice("Copy failed."),
			);
		});
		const close = footer.createEl("button", { text: "Close" });
		close.addEventListener("click", () => this.close());
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
