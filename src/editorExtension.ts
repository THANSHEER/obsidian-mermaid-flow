/*
 * Live Preview support.
 *
 * In Live Preview, Mermaid blocks are rendered as CodeMirror block widgets, so
 * the reading-mode Markdown post-processor's `getSectionInfo` returns null and
 * never adds our buttons. This CM6 ViewPlugin instead:
 *   1. scans the document for ```mermaid fences (reliable, version-independent),
 *   2. watches the editor DOM for rendered embed blocks,
 *   3. maps each embed back to its source line range via posAtDOM, and
 *   4. injects the Edit / Code overlay buttons into the embed.
 *
 * Line ranges are read straight from editor state, so write-back is reliable.
 */

import { setIcon } from "obsidian";
import { EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";

export interface MermaidBlockRange {
	/** 0-based line of the opening ```mermaid fence. */
	startLine: number;
	/** 0-based line of the closing fence. */
	endLine: number;
}

export interface LivePreviewCallbacks {
	edit: (range: MermaidBlockRange) => void;
	viewCode: (range: MermaidBlockRange) => void;
}

const OPEN_FENCE_RE = /^(\s*)(`{3,}|~{3,})\s*mermaid\s*$/i;

function closeFenceRe(marker: string): RegExp {
	const ch = marker[0] === "~" ? "~" : "`";
	return new RegExp(`^\\s*${ch}{${marker.length},}\\s*$`);
}

/** Find every ```mermaid block in the document (line numbers are 0-based). */
function scanMermaidBlocks(view: EditorView): MermaidBlockRange[] {
	const doc = view.state.doc;
	const blocks: MermaidBlockRange[] = [];
	const total = doc.lines;
	for (let i = 1; i <= total; i++) {
		const open = doc.line(i).text.match(OPEN_FENCE_RE);
		if (!open) continue;
		const marker = open[2] ?? "```";
		const cre = closeFenceRe(marker);
		for (let j = i + 1; j <= total; j++) {
			if (cre.test(doc.line(j).text)) {
				blocks.push({ startLine: i - 1, endLine: j - 1 });
				i = j;
				break;
			}
		}
	}
	return blocks;
}

export function mermaidLivePreviewExtension(cb: LivePreviewCallbacks) {
	return ViewPlugin.fromClass(
		class {
			private view: EditorView;
			private observer: MutationObserver;
			private timer = 0;

			constructor(view: EditorView) {
				this.view = view;
				this.observer = new MutationObserver(() => this.schedule());
				this.observer.observe(view.contentDOM, {
					childList: true,
					subtree: true,
				});
				this.schedule();
			}

			update(u: ViewUpdate): void {
				if (u.docChanged || u.viewportChanged) this.schedule();
			}

			destroy(): void {
				this.observer.disconnect();
				window.clearTimeout(this.timer);
			}

			private schedule(): void {
				window.clearTimeout(this.timer);
				this.timer = window.setTimeout(() => this.inject(), 60);
			}

			private inject(): void {
				const blocks = scanMermaidBlocks(this.view);
				if (blocks.length === 0) return;

				const embeds =
					this.view.contentDOM.querySelectorAll<HTMLElement>(
						".cm-embed-block",
					);
				embeds.forEach((embed) => {
					if (embed.querySelector(":scope > .mermaid-flow-overlay")) return;

					let pos: number;
					try {
						pos = this.view.posAtDOM(embed);
					} catch {
						return;
					}
					const lineNo = this.view.state.doc.lineAt(pos).number - 1;
					const block =
						blocks.find(
							(b) => lineNo >= b.startLine && lineNo <= b.endLine,
						) ?? blocks.find((b) => Math.abs(b.startLine - lineNo) <= 1);
					if (!block) return; // not a mermaid embed

					this.addOverlay(embed, block);
				});
			}

			private addOverlay(embed: HTMLElement, block: MermaidBlockRange): void {
				embed.classList.add("mermaid-flow-block");
				const overlay = embed.createDiv({ cls: "mermaid-flow-overlay" });

				const codeBtn = overlay.createEl("button", {
					cls: "mermaid-flow-overlay-btn",
					attr: { "aria-label": "Edit Mermaid code" },
				});
				setIcon(codeBtn, "code");

				const editBtn = overlay.createEl("button", {
					cls: "mermaid-flow-overlay-btn mermaid-flow-edit-btn mod-cta",
					text: "Edit",
				});

				// Prevent the click from moving the editor cursor into the block.
				const guard = (e: Event) => {
					e.preventDefault();
					e.stopPropagation();
				};
				overlay.addEventListener("mousedown", guard);
				codeBtn.addEventListener("click", (e) => {
					guard(e);
					cb.viewCode(block);
				});
				editBtn.addEventListener("click", (e) => {
					guard(e);
					cb.edit(block);
				});
			}
		},
	);
}
