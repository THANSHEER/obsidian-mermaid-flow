import {
	Editor,
	MarkdownPostProcessorContext,
	MarkdownView,
	Modal,
	Notice,
	Plugin,
	setIcon,
	TFile,
} from "obsidian";
import { CodeViewModal } from "./codeModal";
import {
	findMermaidBlockAtCursor,
	insertBlockAtCursor,
	MermaidBlock,
	replaceBlockContent,
} from "./editorBridge";
import { MermaidEditorModal } from "./editorModal";
import {
	MermaidBlockRange,
	mermaidLivePreviewExtension,
} from "./editorExtension";
import { MermaidEditorView, VIEW_TYPE_MERMAID_FLOW } from "./editorView";
import { layoutMissing } from "./layout";
import { DiagramModel, cloneModel, starterModel } from "./model";
import { DIAGRAM_TEMPLATES } from "./templates";
import { mermaidToModel } from "./parser";
import { modelToFencedBlock, modelToMermaid } from "./serializer";
import {
	DEFAULT_SETTINGS,
	MermaidFlowSettingTab,
	MermaidFlowSettings,
} from "./settings";

const OPEN_FENCE_RE = /^(\s*)(`{3,}|~{3,})\s*mermaid\s*$/i;

export default class MermaidFlowPlugin extends Plugin {
	settings!: MermaidFlowSettings;
	private observedBlocks = new WeakSet<HTMLElement>();
	private blockObservers: MutationObserver[] = [];

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new MermaidFlowSettingTab(this.app, this));

		this.registerView(
			VIEW_TYPE_MERMAID_FLOW,
			(leaf) => new MermaidEditorView(leaf),
		);

		this.addRibbonIcon("workflow", "Mermaid Flow Editor", () => {
			this.editOrInsert();
		});

		this.addCommand({
			id: "insert-visual-mermaid",
			name: "Insert visual Mermaid diagram",
			editorCallback: (editor) => this.openInsert(editor),
		});

		this.addCommand({
			id: "edit-mermaid-visually",
			name: "Edit Mermaid diagram visually",
			editorCallback: (editor) => this.openEditAtCursor(editor),
		});

		this.addCommand({
			id: "insert-from-template",
			name: "Insert Mermaid diagram from template",
			editorCallback: (editor) => this.openTemplatesPicker(editor),
		});

		this.registerMarkdownPostProcessor((el, ctx) =>
			this.addEditButton(el, ctx),
		);

		// Live Preview: reading-mode post-processors can't resolve the source
		// line range, so a CM6 extension injects the buttons there instead.
		this.registerEditorExtension(
			mermaidLivePreviewExtension({
				edit: (range) => this.editFromLines(range),
				viewCode: (range) => this.viewCodeFromLines(range),
			}),
		);
	}

	private openTemplatesPicker(editor: Editor): void {
		const modal = new Modal(this.app);
		modal.titleEl.setText("Insert from template");
		const content = modal.contentEl;
		content.addClass("mermaid-flow-templates-modal");

		const grid = content.createDiv({ cls: "mermaid-flow-templates-grid" });
		for (const tpl of DIAGRAM_TEMPLATES) {
			const card = grid.createDiv({ cls: "mermaid-flow-template-card" });
			const icon = card.createDiv({ cls: "mermaid-flow-template-icon" });
			setIcon(icon, tpl.icon);
			card.createEl("strong", { text: tpl.label });
			card.createEl("p", { text: tpl.description, cls: "mermaid-flow-template-desc" });
			card.addEventListener("click", () => {
				modal.close();
				const model = cloneModel(tpl.model());
				this.openEditor(model, (result) => {
					const block = modelToFencedBlock(result, {
						includePositions: this.settings.savePositions,
					});
					insertBlockAtCursor(editor, block);
				});
			});
		}
		modal.open();
	}

	onunload(): void {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_MERMAID_FLOW);
		for (const obs of this.blockObservers) obs.disconnect();
		this.blockObservers = [];
	}

	/** Open the editor as a popup or embedded pane per the user's setting. */
	private openEditor(
		model: DiagramModel,
		onSave: (model: DiagramModel) => void,
		allowAutoSave = false,
	): void {
		if (this.settings.openMode === "pane") {
			void this.openInPane(
				model,
				onSave,
				allowAutoSave && this.settings.autoSave,
			);
		} else {
			new MermaidEditorModal(
				this.app,
				model,
				onSave,
				this.settings.toolbarStyle,
				this.settings.exportFolder,
				this.settings.snapToGrid ? this.settings.snapSize : 0,
			).open();
		}
	}

	private async openInPane(
		model: DiagramModel,
		onSave: (model: DiagramModel) => void,
		autoSave: boolean,
	): Promise<void> {
		const leaf = this.app.workspace.getLeaf("split", "vertical");
		await leaf.setViewState({ type: VIEW_TYPE_MERMAID_FLOW, active: true });
		this.app.workspace.revealLeaf(leaf);
		const view = leaf.view;
		if (view instanceof MermaidEditorView) {
			view.setData(
				model,
				onSave,
				autoSave,
				this.settings.toolbarStyle,
				this.settings.exportFolder,
				this.settings.snapToGrid ? this.settings.snapSize : 0,
			);
		}
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private getEditor(): Editor | null {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		return view?.editor ?? null;
	}

	/** Ribbon action: edit the block under the cursor, else insert a new one. */
	private editOrInsert(): void {
		const editor = this.getEditor();
		if (!editor) {
			new Notice("Open a note in editing mode first.");
			return;
		}
		const block = findMermaidBlockAtCursor(editor);
		if (block) {
			this.openEditBlock(editor, block);
		} else {
			this.openInsert(editor);
		}
	}

	private openInsert(editor: Editor): void {
		const model = starterModel(this.settings.defaultDirection);
		this.openEditor(model, (result) => {
			const block = modelToFencedBlock(result, {
				includePositions: this.settings.savePositions,
			});
			insertBlockAtCursor(editor, block);
		});
	}

	private openEditAtCursor(editor: Editor): void {
		const block = findMermaidBlockAtCursor(editor);
		if (!block) {
			new Notice("No Mermaid block here — inserting a new one.");
			this.openInsert(editor);
			return;
		}
		this.openEditBlock(editor, block);
	}

	private openEditBlock(editor: Editor, block: MermaidBlock): void {
		const model = this.parseOrEmpty(block.content);
		this.openEditor(
			model,
			(result) => {
				const code = modelToMermaid(result, {
					includePositions: this.settings.savePositions,
				});
				// Re-locate the block in case the document shifted while editing.
				const fresh = this.relocateBlock(editor, block);
				replaceBlockContent(editor, fresh ?? block, code);
			},
			true,
		);
	}

	private parseOrEmpty(content: string): DiagramModel {
		const { model, warnings } = mermaidToModel(content);
		layoutMissing(model);
		if (warnings.length > 0) {
			new Notice(`Parsed diagram with ${warnings.length} warning(s).`);
		}
		return model;
	}

	/**
	 * Find the same block again by scanning from the original start line. Guards
	 * against small line shifts between opening the editor and saving.
	 */
	private relocateBlock(
		editor: Editor,
		original: MermaidBlock,
	): MermaidBlock | null {
		const lineCount = editor.lineCount();
		const probe = Math.min(original.fenceStart, lineCount - 1);
		if (probe < 0) return null;
		// Search a small window around the original position for the fence.
		const radius = 5;
		for (let d = 0; d <= radius; d++) {
			for (const line of [probe + d, probe - d]) {
				if (line < 0 || line >= lineCount) continue;
				if (OPEN_FENCE_RE.test(editor.getLine(line))) {
					editor.setCursor({ line: line + 1, ch: 0 });
					return findMermaidBlockAtCursor(editor);
				}
			}
		}
		return null;
	}

	/** Adds "Edit" + "Code" button overlays on rendered mermaid blocks. */
	private addEditButton(
		el: HTMLElement,
		ctx: MarkdownPostProcessorContext,
	): void {
		const info = ctx.getSectionInfo(el);
		if (!info) return;
		const first = info.text.split("\n")[info.lineStart] ?? "";
		if (!OPEN_FENCE_RE.test(first)) return;

		this.attachOverlay(el, ctx);

		// Mermaid renders asynchronously and may replace the block's content
		// after we run, wiping the overlay. Re-attach for a short window.
		if (!this.observedBlocks.has(el)) {
			this.observedBlocks.add(el);
			const observer = new MutationObserver(() => {
				if (el.isConnected && !el.querySelector(":scope > .mermaid-flow-overlay")) {
					this.attachOverlay(el, ctx);
				}
			});
			observer.observe(el, { childList: true });
			this.blockObservers.push(observer);
			window.setTimeout(() => observer.disconnect(), 3000);
		}
	}

	private attachOverlay(
		el: HTMLElement,
		ctx: MarkdownPostProcessorContext,
	): void {
		if (el.querySelector(":scope > .mermaid-flow-overlay")) return;
		el.addClass("mermaid-flow-block");
		const overlay = el.createDiv({ cls: "mermaid-flow-overlay" });

		const codeBtn = overlay.createEl("button", {
			cls: "mermaid-flow-overlay-btn",
			attr: { "aria-label": "Edit Mermaid code" },
		});
		setIcon(codeBtn, "code");
		codeBtn.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.viewCodeFromReading(el, ctx);
		});

		const editBtn = overlay.createEl("button", {
			cls: "mermaid-flow-overlay-btn mermaid-flow-edit-btn mod-cta",
			text: "Edit",
		});
		editBtn.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			void this.editFromReading(el, ctx);
		});
	}

	private viewCodeFromReading(
		el: HTMLElement,
		ctx: MarkdownPostProcessorContext,
	): void {
		const info = ctx.getSectionInfo(el);
		if (!info) {
			new Notice("Could not locate the diagram source.");
			return;
		}
		const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
		if (!(file instanceof TFile)) return;

		const lines = info.text.split("\n");
		const lineStart = info.lineStart;
		const lineEnd = info.lineEnd;
		const code = lines.slice(lineStart + 1, lineEnd).join("\n");

		new CodeViewModal(this.app, code, (edited) => {
			void this.app.vault.process(file, (data) => {
				const dl = data.split("\n");
				const before = dl.slice(0, lineStart + 1);
				const after = dl.slice(lineEnd);
				return [...before, ...edited.split("\n"), ...after].join("\n");
			});
		}).open();
	}

	// --- Live Preview entry points (driven by the CM6 extension) ------------

	private readBlockContent(
		editor: Editor,
		startLine: number,
		endLine: number,
	): string {
		const parts: string[] = [];
		for (let i = startLine + 1; i < endLine; i++) parts.push(editor.getLine(i));
		return parts.join("\n");
	}

	private editFromLines(range: MermaidBlockRange): void {
		const editor = this.getEditor();
		if (!editor) {
			new Notice("Open the note in an editor pane to edit this diagram.");
			return;
		}
		const block: MermaidBlock = {
			fenceStart: range.startLine,
			fenceEnd: range.endLine,
			content: this.readBlockContent(editor, range.startLine, range.endLine),
		};
		this.openEditBlock(editor, block);
	}

	private viewCodeFromLines(range: MermaidBlockRange): void {
		const editor = this.getEditor();
		if (!editor) return;
		const code = this.readBlockContent(editor, range.startLine, range.endLine);
		new CodeViewModal(this.app, code, (edited) => {
			// Replace just the inner lines of the fence, keeping the ``` delimiters.
			editor.replaceRange(
				edited + "\n",
				{ line: range.startLine + 1, ch: 0 },
				{ line: range.endLine, ch: 0 },
			);
		}).open();
	}

	private async editFromReading(
		el: HTMLElement,
		ctx: MarkdownPostProcessorContext,
	): Promise<void> {
		const info = ctx.getSectionInfo(el);
		if (!info) {
			new Notice("Could not locate the diagram source.");
			return;
		}
		const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
		if (!(file instanceof TFile)) return;

		const lines = info.text.split("\n");
		const content = lines.slice(info.lineStart + 1, info.lineEnd).join("\n");
		const model = this.parseOrEmpty(content);

		const lineStart = info.lineStart;
		const lineEnd = info.lineEnd;

		this.openEditor(
			model,
			(result) => {
				const code = modelToMermaid(result, {
					includePositions: this.settings.savePositions,
				});
				void this.app.vault.process(file, (data) => {
					const dl = data.split("\n");
					const before = dl.slice(0, lineStart + 1);
					const after = dl.slice(lineEnd);
					return [...before, ...code.split("\n"), ...after].join("\n");
				});
			},
			true,
		);
	}
}

