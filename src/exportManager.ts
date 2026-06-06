/*
 * Export logic: PNG / SVG to vault, clipboard helpers.
 */

import { App, Menu, Modal, Notice, normalizePath } from "obsidian";
import type { DiagramCanvas } from "./canvas";
import { modelToMermaid } from "./serializer";
import type { DiagramModel } from "./model";

export interface ExportManagerOptions {
	app: App;
	getCanvas: () => DiagramCanvas;
	getModel: () => DiagramModel;
	getExportFolder: () => string;
}

export class ExportManager {
	private opts: ExportManagerOptions;

	constructor(opts: ExportManagerOptions) {
		this.opts = opts;
	}

	showMenu(e: MouseEvent): void {
		const menu = new Menu();
		menu.addItem((item) =>
			item
				.setTitle("Export as PNG…")
				.setIcon("image")
				.onClick(() => this.showExportDialog("png")),
		);
		menu.addItem((item) =>
			item
				.setTitle("Export as SVG…")
				.setIcon("file-text")
				.onClick(() => this.showExportDialog("svg")),
		);
		menu.addSeparator();
		menu.addItem((item) =>
			item
				.setTitle("Copy PNG to clipboard")
				.setIcon("clipboard-copy")
				.onClick(() => void this.copyPNG()),
		);
		menu.addItem((item) =>
			item
				.setTitle("Copy code to clipboard")
				.setIcon("copy")
				.onClick(() => this.copyCode()),
		);
		menu.showAtMouseEvent(e);
	}

	private showExportDialog(format: "png" | "svg"): void {
		const modal = new Modal(this.opts.app);
		modal.titleEl.setText(`Export as ${format.toUpperCase()}`);
		const c = modal.contentEl;
		c.addClass("mermaid-flow-export-settings");

		const fnField = c.createDiv({ cls: "mermaid-flow-field" });
		fnField.createEl("label", { text: "Filename" });
		const fnInput = fnField.createEl("input", { type: "text", cls: "mermaid-flow-input" });
		const stamp = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
		fnInput.value = `diagram-${stamp}`;
		fnInput.placeholder = `diagram-${stamp}`;

		const folderField = c.createDiv({ cls: "mermaid-flow-field" });
		folderField.createEl("label", { text: "Save to folder" });
		const folderInput = folderField.createEl("input", { type: "text", cls: "mermaid-flow-input" });
		folderInput.value = this.opts.getExportFolder();
		folderInput.placeholder = "mermaid flow";

		let scale = 2;
		let transparent = false;

		if (format === "png") {
			const scaleField = c.createDiv({ cls: "mermaid-flow-field" });
			scaleField.createEl("label", { text: "Scale" });
			const scaleSelect = scaleField.createEl("select", { cls: "dropdown mermaid-flow-input" });
			[["1×", "1"], ["2× (recommended)", "2"], ["3×", "3"]].forEach(([label, val]) => {
				const o = scaleSelect.createEl("option", { text: label, value: val });
				if (val === "2") o.selected = true;
			});
			scaleSelect.addEventListener("change", () => { scale = parseInt(scaleSelect.value, 10); });

			const transpField = c.createDiv({ cls: "mermaid-flow-field-inline" });
			transpField.createEl("label", { text: "Transparent background" });
			const transpCheck = transpField.createEl("input", { type: "checkbox" });
			transpCheck.addEventListener("change", () => { transparent = transpCheck.checked; });
		}

		const footer = c.createDiv({ cls: "mermaid-flow-footer" });
		const exportBtn = footer.createEl("button", { text: "Export", cls: "mod-cta" });
		const cancelBtn = footer.createEl("button", { text: "Cancel" });
		cancelBtn.addEventListener("click", () => modal.close());
		exportBtn.addEventListener("click", () => {
			modal.close();
			void this.exportDiagramWithOptions(
				format,
				(fnInput.value.trim() || fnInput.placeholder).replace(/\.(svg|png)$/i, ""),
				folderInput.value.trim() || this.opts.getExportFolder(),
				scale,
				transparent,
			);
		});
		modal.open();
		fnInput.focus();
		fnInput.select();
	}

	private async exportDiagramWithOptions(
		format: "png" | "svg",
		filename: string,
		folder: string,
		scale: number,
		transparent: boolean,
	): Promise<void> {
		try {
			const canvas = this.opts.getCanvas();
			canvas.deselect();
			const { svg: svgString, width, height, background } = canvas.getExportSVG();
			if (!svgString) { new Notice("Could not export: SVG not available"); return; }

			let data: string | ArrayBuffer = svgString;
			if (format === "png") {
				data = await this.rasterize(svgString, width, height, background, transparent, scale);
			}
			await this.saveToVault(format, data, filename, folder);
		} catch (err) {
			new Notice("Export failed: " + (err instanceof Error ? err.message : "Unknown error"));
		}
	}

	private async saveToVault(
		format: "png" | "svg",
		data: string | ArrayBuffer,
		filename: string,
		folder: string,
	): Promise<void> {
		const vault = this.opts.app.vault;
		const folderPath = normalizePath(folder || "mermaid flow");
		if (!vault.getAbstractFileByPath(folderPath)) await vault.createFolder(folderPath);
		let path = normalizePath(`${folderPath}/${filename}.${format}`);
		let i = 1;
		while (vault.getAbstractFileByPath(path)) {
			path = normalizePath(`${folderPath}/${filename}-${i++}.${format}`);
		}
		if (typeof data === "string") await vault.create(path, data);
		else await vault.createBinary(path, data);
		new Notice(`${format.toUpperCase()} saved to ${path}`);
	}

	private rasterize(
		svgString: string,
		width: number,
		height: number,
		background: string,
		transparent = false,
		scale = 2,
	): Promise<ArrayBuffer> {
		return new Promise((resolve, reject) => {
			const canvasEl = activeDocument.createElement("canvas");
			const ctx = canvasEl.getContext("2d");
			if (!ctx) { reject(new Error("Canvas context unavailable")); return; }
			canvasEl.width  = Math.max(1, Math.round(width  * scale));
			canvasEl.height = Math.max(1, Math.round(height * scale));

			const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
			const url  = URL.createObjectURL(blob);
			const img  = new Image();

			img.onload = () => {
				if (!transparent) {
					ctx.fillStyle = background;
					ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);
				}
				ctx.drawImage(img, 0, 0, canvasEl.width, canvasEl.height);
				URL.revokeObjectURL(url);
				canvasEl.toBlob((pngBlob) => {
					if (!pngBlob) { reject(new Error("Failed to render PNG")); return; }
					pngBlob.arrayBuffer().then(resolve, reject);
				}, "image/png");
			};
			img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Failed to load SVG")); };
			img.src = url;
		});
	}

	async copyPNG(): Promise<void> {
		try {
			const canvas = this.opts.getCanvas();
			canvas.deselect();
			const { svg: svgString, width, height, background } = canvas.getExportSVG();
			if (!svgString) { new Notice("Could not export: SVG not available"); return; }
			const buf     = await this.rasterize(svgString, width, height, background);
			const pngBlob = new Blob([buf], { type: "image/png" });
			await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob })]);
			new Notice("PNG copied to clipboard");
		} catch (err) {
			new Notice("Failed to copy PNG: " + (err instanceof Error ? err.message : "Unknown"));
		}
	}

	copyCode(): void {
		const code = modelToMermaid(this.opts.getModel());
		void navigator.clipboard
			.writeText(code)
			.then(() => new Notice("Diagram code copied to clipboard"))
			.catch(() => new Notice("Failed to copy code"));
	}
}
