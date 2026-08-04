/*
 * AiGenerateModal — one modal for all three AI tasks:
 *   "image"   pick / drop / paste a diagram screenshot
 *   "text"    describe the diagram in natural language
 *   "improve" clean up an existing diagram (optional instruction)
 *
 * On success the resulting Mermaid code is handed to onResult; on failure an
 * inline error is shown and the modal stays open for a retry.
 */

import { App, Modal, Notice, Setting, setIcon } from "obsidian";
import { AiService } from "./service";

export type AiModalMode = "image" | "text" | "improve";

export interface AiModalOptions {
	/** Existing diagram code (improve mode). */
	currentCode?: string;
	/** Pre-filled image, e.g. from a canvas drop (image mode). */
	initialImage?: { base64: string; mime: string };
	onResult: (code: string) => void;
}

const TITLES: Record<AiModalMode, string> = {
	image: "Generate diagram from image",
	text: "Generate diagram from description",
	improve: "Improve diagram with AI",
};

const ACCEPTED_MIMES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export class AiGenerateModal extends Modal {
	private image: { base64: string; mime: string } | null = null;
	private generating = false;

	private dropZone: HTMLElement | null = null;
	private thumb: HTMLImageElement | null = null;
	private textInput: HTMLTextAreaElement | null = null;
	private hintInput: HTMLInputElement | null = null;
	private generateBtn: HTMLButtonElement | null = null;
	private statusEl: HTMLElement | null = null;
	private errorEl: HTMLElement | null = null;
	private pasteHandler: ((e: ClipboardEvent) => void) | null = null;

	constructor(
		app: App,
		private ai: AiService,
		private mode: AiModalMode,
		private opts: AiModalOptions,
	) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass("mermaid-flow-ai-modal");
		this.titleEl.setText(TITLES[this.mode]);
		const content = this.contentEl;

		if (!this.ai.isConfigured()) {
			content.createEl("p", {
				cls: "mermaid-flow-ai-error",
				text: this.ai.configurationHint(),
			});
			return;
		}

		if (this.mode === "image") this.buildImageInputs(content);
		if (this.mode === "text") this.buildTextInputs(content);
		if (this.mode === "improve") this.buildImproveInputs(content);

		this.errorEl = content.createEl("p", { cls: "mermaid-flow-ai-error" });
		this.errorEl.hide();

		const footer = content.createDiv({ cls: "mermaid-flow-ai-footer" });
		this.statusEl = footer.createSpan({ cls: "mermaid-flow-ai-status" });
		this.statusEl.hide();
		this.generateBtn = footer.createEl("button", { text: "Generate", cls: "mod-cta" });
		this.generateBtn.addEventListener("click", () => {
			this.generate().catch((e) => console.error("[mermaid-flow]", e));
		});
	}

	onClose(): void {
		if (this.pasteHandler) {
			activeDocument.removeEventListener("paste", this.pasteHandler);
			this.pasteHandler = null;
		}
		this.contentEl.empty();
	}

	// --- mode-specific inputs -------------------------------------------------

	private buildImageInputs(content: HTMLElement): void {
		const zone = content.createDiv({ cls: "mermaid-flow-ai-dropzone" });
		this.dropZone = zone;
		const icon = zone.createDiv({ cls: "mermaid-flow-ai-dropzone-icon" });
		setIcon(icon, "image-plus");
		zone.createDiv({
			cls: "mermaid-flow-ai-dropzone-hint",
			text: "Click to pick an image, drop one here, or paste from the clipboard",
		});
		this.thumb = zone.createEl("img", { cls: "mermaid-flow-ai-thumb" });
		this.thumb.hide();

		const fileInput = content.createEl("input", {
			cls: "mermaid-flow-ai-file-input",
			attr: { type: "file", accept: ACCEPTED_MIMES.join(",") },
		});
		fileInput.addEventListener("change", () => {
			const f = fileInput.files?.[0];
			if (f) this.loadImageFile(f);
		});
		zone.addEventListener("click", () => fileInput.click());
		zone.addEventListener("dragover", (e) => {
			e.preventDefault();
			zone.addClass("is-dragover");
		});
		zone.addEventListener("dragleave", () => zone.removeClass("is-dragover"));
		zone.addEventListener("drop", (e) => {
			e.preventDefault();
			zone.removeClass("is-dragover");
			const f = e.dataTransfer?.files?.[0];
			if (f && f.type.startsWith("image/")) this.loadImageFile(f);
		});

		this.pasteHandler = (e: ClipboardEvent) => {
			const f = Array.from(e.clipboardData?.files ?? []).find((x) =>
				x.type.startsWith("image/"),
			);
			if (f) {
				e.preventDefault();
				this.loadImageFile(f);
			}
		};
		activeDocument.addEventListener("paste", this.pasteHandler);

		new Setting(content)
			.setName("Extra instructions (optional)")
			.addText((text) => {
				text.setPlaceholder("e.g. use left-to-right direction");
				this.hintInput = text.inputEl;
			});

		if (this.opts.initialImage) this.setImage(this.opts.initialImage);
	}

	private buildTextInputs(content: HTMLElement): void {
		content.createEl("p", {
			cls: "setting-item-description",
			text: "Describe the flowchart you want — steps, decisions, branches.",
		});
		this.textInput = content.createEl("textarea", {
			cls: "mermaid-flow-ai-textarea",
			attr: { rows: "6", placeholder: "e.g. user login flow with retry on wrong password" },
		});
		this.textInput.focus();
	}

	private buildImproveInputs(content: HTMLElement): void {
		content.createEl("p", {
			cls: "setting-item-description",
			text: "The AI will fix syntax, clarify labels and simplify structure while keeping the diagram's meaning.",
		});
		const details = content.createEl("details", { cls: "mermaid-flow-ai-code-preview" });
		details.createEl("summary", { text: "Current diagram code" });
		details.createEl("pre", { text: this.opts.currentCode ?? "" });

		new Setting(content)
			.setName("Instructions (optional)")
			.addText((text) => {
				text.setPlaceholder("e.g. make the labels shorter");
				this.hintInput = text.inputEl;
			});
	}

	// --- image handling ---------------------------------------------------------

	private loadImageFile(file: File): void {
		if (!ACCEPTED_MIMES.includes(file.type)) {
			this.showError("Unsupported image type. Use PNG, JPEG, WebP or GIF.");
			return;
		}
		const reader = new FileReader();
		reader.onload = () => {
			const dataUrl = reader.result as string;
			const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
			this.setImage({ base64, mime: file.type });
		};
		reader.readAsDataURL(file);
	}

	private setImage(img: { base64: string; mime: string }): void {
		this.image = img;
		this.showError(null);
		if (this.thumb) {
			this.thumb.setAttribute("src", `data:${img.mime};base64,${img.base64}`);
			this.thumb.show();
		}
		this.dropZone?.addClass("has-image");
	}

	// --- generation ---------------------------------------------------------------

	private async generate(): Promise<void> {
		if (this.generating) return;
		const task = this.buildTask();
		if (!task) return;

		this.generating = true;
		this.showError(null);
		this.generateBtn?.setAttribute("disabled", "true");
		if (this.statusEl) {
			this.statusEl.setText("Generating…");
			this.statusEl.show();
		}

		try {
			const { code, warnings } = await this.ai.generateDiagram(task);
			if (warnings.length > 0) {
				new Notice(`Generated with ${warnings.length} parser warning(s).`);
			}
			this.opts.onResult(code);
			this.close();
		} catch (err) {
			this.showError(err instanceof Error ? err.message : "AI generation failed.");
		} finally {
			this.generating = false;
			this.generateBtn?.removeAttribute("disabled");
			this.statusEl?.hide();
		}
	}

	private buildTask():
		| Parameters<AiService["generateDiagram"]>[0]
		| null {
		const hint = this.hintInput?.value ?? "";
		switch (this.mode) {
			case "image":
				if (!this.image) {
					this.showError("Pick, drop or paste an image first.");
					return null;
				}
				return {
					kind: "image",
					imageBase64: this.image.base64,
					imageMime: this.image.mime,
					hint,
				};
			case "text": {
				const description = this.textInput?.value.trim() ?? "";
				if (!description) {
					this.showError("Describe the diagram first.");
					return null;
				}
				return { kind: "text", description };
			}
			case "improve":
				return { kind: "improve", code: this.opts.currentCode ?? "", instruction: hint };
		}
	}

	private showError(msg: string | null): void {
		if (!this.errorEl) return;
		if (msg) {
			this.errorEl.setText(msg);
			this.errorEl.show();
		} else {
			this.errorEl.hide();
		}
	}
}
