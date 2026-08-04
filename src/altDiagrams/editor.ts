/*
 * Lightweight visual editor modal for sequence / mindmap / ER diagrams.
 */

import { App, Modal, Notice, setIcon } from "obsidian";
import {
	addErEntity,
	parseEr,
	serializeEr,
} from "./er";
import {
	addMindmapChild,
	parseMindmap,
	serializeMindmap,
} from "./mindmap";
import {
	addSequenceMessage,
	addSequenceParticipant,
	parseSequence,
	serializeSequence,
} from "./sequence";
import {
	AltDiagramKind,
	AltDiagramModel,
	ErModel,
	MindmapModel,
	MindmapNode,
	SequenceModel,
} from "./types";

const SVG_NS = "http://www.w3.org/2000/svg";

function parseAltDiagram(
	kind: AltDiagramKind,
	text: string,
): AltDiagramModel {
	switch (kind) {
		case "sequence":
			return parseSequence(text);
		case "mindmap":
			return parseMindmap(text);
		case "er":
			return parseEr(text);
	}
}

function serializeAltDiagram(model: AltDiagramModel): string {
	switch (model.kind) {
		case "sequence":
			return serializeSequence(model);
		case "mindmap":
			return serializeMindmap(model);
		case "er":
			return serializeEr(model);
	}
}

export class AltDiagramModal extends Modal {
	private kind: AltDiagramKind;
	private model: AltDiagramModel;
	private onSave: (code: string) => Promise<void>;
	private canvasHost!: HTMLElement;
	private listHost!: HTMLElement;

	constructor(
		app: App,
		kind: AltDiagramKind,
		source: string,
		onSave: (code: string) => Promise<void>,
	) {
		super(app);
		this.kind = kind;
		this.model = parseAltDiagram(kind, source);
		this.onSave = onSave;
	}

	onOpen(): void {
		this.modalEl.addClass("mermaid-flow-modal");
		this.modalEl.addClass("mermaid-flow-alt-modal");
		const titles: Record<AltDiagramKind, string> = {
			sequence: "Sequence diagram editor",
			mindmap: "Mindmap editor",
			er: "Entity-relationship editor",
		};
		this.titleEl.setText(titles[this.kind]);

		const root = this.contentEl;
		root.addClass("mermaid-flow-alt-editor");

		const toolbar = root.createDiv({ cls: "mermaid-flow-alt-toolbar" });
		this.buildToolbar(toolbar);

		const body = root.createDiv({ cls: "mermaid-flow-alt-body" });
		this.listHost = body.createDiv({ cls: "mermaid-flow-alt-list" });
		this.canvasHost = body.createDiv({ cls: "mermaid-flow-alt-canvas" });

		const footer = root.createDiv({ cls: "mermaid-flow-footer" });
		const discard = footer.createEl("button", { text: "Discard" });
		discard.addEventListener("click", () => this.close());
		const save = footer.createEl("button", { text: "Save", cls: "mod-cta" });
		save.addEventListener("click", () => {
			save.disabled = true;
			this.onSave(serializeAltDiagram(this.model))
				.then(() => {
					new Notice("Diagram saved to note.");
					this.close();
				})
				.catch((e) => {
					const msg = e instanceof Error ? e.message : String(e);
					new Notice(`Failed to save diagram: ${msg}`);
				})
				.finally(() => {
					save.disabled = false;
				});
		});

		this.refresh();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private buildToolbar(bar: HTMLElement): void {
		if (this.kind === "sequence") {
			this.toolBtn(bar, "plus", "Add participant", () => {
				const id = activeWindow.prompt("Participant id", `P${(this.model as SequenceModel).participants.length + 1}`);
				if (!id) return;
				addSequenceParticipant(this.model as SequenceModel, id.trim());
				this.refresh();
			});
			this.toolBtn(bar, "arrow-right", "Add message", () => {
				const m = this.model as SequenceModel;
				if (m.participants.length < 2) {
					new Notice("Add at least two participants first.");
					return;
				}
				const from = m.participants[0]!.id;
				const to = m.participants[1]!.id;
				const text = activeWindow.prompt("Message text", "message") ?? "message";
				addSequenceMessage(m, { from, to, text, arrow: "->>" });
				this.refresh();
			});
		} else if (this.kind === "mindmap") {
			this.toolBtn(bar, "plus", "Add child to root", () => {
				const label = activeWindow.prompt("Node label", "Idea");
				if (!label) return;
				addMindmapChild((this.model as MindmapModel).root, label.trim());
				this.refresh();
			});
		} else {
			this.toolBtn(bar, "plus", "Add entity", () => {
				const id = activeWindow.prompt("Entity name", `Entity${(this.model as ErModel).entities.length + 1}`);
				if (!id) return;
				const e = addErEntity(this.model as ErModel, id.trim().replace(/\s+/g, "_"));
				e.attributes.push({ type: "string", name: "id", pk: true });
				this.refresh();
			});
		}
	}

	private toolBtn(bar: HTMLElement, icon: string, label: string, onClick: () => void): void {
		const btn = bar.createEl("button", {
			cls: "mermaid-flow-icon-btn",
			attr: { "aria-label": label, title: label },
		});
		setIcon(btn, icon);
		btn.addEventListener("click", onClick);
	}

	private refresh(): void {
		this.listHost.empty();
		this.canvasHost.empty();
		if (this.model.kind === "sequence") this.renderSequence();
		else if (this.model.kind === "mindmap") this.renderMindmap();
		else this.renderEr();
	}

	private renderSequence(): void {
		const m = this.model as SequenceModel;
		this.listHost.createEl("h4", { text: "Participants" });
		for (const p of m.participants) {
			const row = this.listHost.createDiv({ cls: "mermaid-flow-alt-row" });
			row.createSpan({ text: p.alias ? `${p.id} (${p.alias})` : p.id });
		}
		this.listHost.createEl("h4", { text: "Messages" });
		m.messages.forEach((msg, i) => {
			const row = this.listHost.createDiv({ cls: "mermaid-flow-alt-row" });
			const input = row.createEl("input", {
				type: "text",
				cls: "mermaid-flow-input",
				value: msg.text,
			});
			input.addEventListener("input", () => {
				msg.text = input.value;
				this.drawSequenceSvg();
			});
			const del = row.createEl("button", { cls: "mermaid-flow-panel-btn mod-warning", text: "×" });
			del.addEventListener("click", () => {
				m.messages.splice(i, 1);
				this.refresh();
			});
		});
		this.drawSequenceSvg();
	}

	private drawSequenceSvg(): void {
		this.canvasHost.empty();
		const m = this.model as SequenceModel;
		const svg = activeDocument.createElementNS(SVG_NS, "svg");
		svg.classList.add("mermaid-flow-alt-svg");
		const n = Math.max(m.participants.length, 1);
		const colW = 140;
		const width = Math.max(400, n * colW + 40);
		const height = Math.max(220, 80 + m.messages.length * 40 + 40);
		svg.setAttribute("width", String(width));
		svg.setAttribute("height", String(height));
		svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

		m.participants.forEach((p, i) => {
			const x = 70 + i * colW;
			const box = activeDocument.createElementNS(SVG_NS, "rect");
			box.setAttribute("x", String(x - 40));
			box.setAttribute("y", "16");
			box.setAttribute("width", "80");
			box.setAttribute("height", "28");
			box.setAttribute("rx", "6");
			box.setAttribute("fill", "#ececff");
			box.setAttribute("stroke", "#666666");
			svg.appendChild(box);
			const text = activeDocument.createElementNS(SVG_NS, "text");
			text.setAttribute("x", String(x));
			text.setAttribute("y", "34");
			text.setAttribute("text-anchor", "middle");
			text.setAttribute("fill", "#333333");
			text.setAttribute("font-size", "12");
			text.textContent = p.alias || p.id;
			svg.appendChild(text);
			const line = activeDocument.createElementNS(SVG_NS, "line");
			line.setAttribute("x1", String(x));
			line.setAttribute("y1", "44");
			line.setAttribute("x2", String(x));
			line.setAttribute("y2", String(height - 20));
			line.setAttribute("stroke", "#aaaaaa");
			line.setAttribute("stroke-dasharray", "4 3");
			svg.appendChild(line);
		});

		const indexOf = (id: string) =>
			Math.max(0, m.participants.findIndex((p) => p.id === id));

		m.messages.forEach((msg, i) => {
			const y = 70 + i * 40;
			const x1 = 70 + indexOf(msg.from) * colW;
			const x2 = 70 + indexOf(msg.to) * colW;
			const line = activeDocument.createElementNS(SVG_NS, "line");
			line.setAttribute("x1", String(x1));
			line.setAttribute("y1", String(y));
			line.setAttribute("x2", String(x2));
			line.setAttribute("y2", String(y));
			line.setAttribute("stroke", "#7c3aed");
			line.setAttribute("stroke-width", "2");
			if (msg.arrow.startsWith("--")) {
				line.setAttribute("stroke-dasharray", "6 4");
			}
			svg.appendChild(line);
			const label = activeDocument.createElementNS(SVG_NS, "text");
			label.setAttribute("x", String((x1 + x2) / 2));
			label.setAttribute("y", String(y - 6));
			label.setAttribute("text-anchor", "middle");
			label.setAttribute("fill", "#666666");
			label.setAttribute("font-size", "11");
			label.textContent = msg.text;
			svg.appendChild(label);
		});

		this.canvasHost.appendChild(svg);
	}

	private renderMindmap(): void {
		const m = this.model as MindmapModel;
		this.listHost.createEl("h4", { text: "Tree" });
		const walk = (node: MindmapNode, depth: number) => {
			const row = this.listHost.createDiv({ cls: "mermaid-flow-alt-row" });
			row.createSpan({
				text: `${"··".repeat(depth)}${node.label}`,
			});
			const add = row.createEl("button", {
				cls: "mermaid-flow-panel-btn",
				text: "+",
				attr: { title: "Add child" },
			});
			add.addEventListener("click", () => {
				const label = activeWindow.prompt("Child label", "Idea");
				if (!label) return;
				addMindmapChild(node, label.trim());
				this.refresh();
			});
			for (const c of node.children) walk(c, depth + 1);
		};
		walk(m.root, 0);
		this.drawMindmapSvg();
	}

	private drawMindmapSvg(): void {
		this.canvasHost.empty();
		const m = this.model as MindmapModel;
		const svg = activeDocument.createElementNS(SVG_NS, "svg");
		svg.classList.add("mermaid-flow-alt-svg");
		const positions = new Map<string, { x: number; y: number }>();
		let y = 40;
		let maxDepth = 0;
		const layout = (node: MindmapNode, depth: number) => {
			maxDepth = Math.max(maxDepth, depth);
			const x = 60 + depth * 140;
			positions.set(node.id, { x, y });
			y += 48;
			for (const c of node.children) layout(c, depth + 1);
		};
		layout(m.root, 0);
		const width = Math.max(400, 80 + (maxDepth + 1) * 140);
		const height = Math.max(200, y + 20);
		svg.setAttribute("width", String(width));
		svg.setAttribute("height", String(height));
		svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

		const draw = (node: MindmapNode) => {
			const p = positions.get(node.id)!;
			for (const c of node.children) {
				const cp = positions.get(c.id)!;
				const line = activeDocument.createElementNS(SVG_NS, "line");
				line.setAttribute("x1", String(p.x));
				line.setAttribute("y1", String(p.y));
				line.setAttribute("x2", String(cp.x));
				line.setAttribute("y2", String(cp.y));
				line.setAttribute("stroke", "#aaaaaa");
				svg.appendChild(line);
			}
			const circle = activeDocument.createElementNS(SVG_NS, "circle");
			circle.setAttribute("cx", String(p.x));
			circle.setAttribute("cy", String(p.y));
			circle.setAttribute("r", "18");
			circle.setAttribute("fill", "#ececff");
			circle.setAttribute("stroke", "#7c3aed");
			svg.appendChild(circle);
			const text = activeDocument.createElementNS(SVG_NS, "text");
			text.setAttribute("x", String(p.x));
			text.setAttribute("y", String(p.y + 4));
			text.setAttribute("text-anchor", "middle");
			text.setAttribute("fill", "#333333");
			text.setAttribute("font-size", "10");
			text.textContent = node.label.slice(0, 12);
			svg.appendChild(text);
			for (const c of node.children) draw(c);
		};
		draw(m.root);
		this.canvasHost.appendChild(svg);
	}

	private renderEr(): void {
		const m = this.model as ErModel;
		this.listHost.createEl("h4", { text: "Entities" });
		for (const e of m.entities) {
			const row = this.listHost.createDiv({ cls: "mermaid-flow-alt-row" });
			row.createSpan({ text: `${e.id} (${e.attributes.length} attrs)` });
			const addAttr = row.createEl("button", {
				cls: "mermaid-flow-panel-btn",
				text: "+ attr",
			});
			addAttr.addEventListener("click", () => {
				const name = activeWindow.prompt("Attribute name", "field");
				if (!name) return;
				e.attributes.push({ type: "string", name: name.trim() });
				this.refresh();
			});
		}
		this.listHost.createEl("h4", { text: "Relations" });
		for (const r of m.relations) {
			this.listHost.createDiv({
				cls: "mermaid-flow-alt-row",
				text: `${r.from} ${r.card} ${r.to}${r.label ? ` : ${r.label}` : ""}`,
			});
		}
		if (m.entities.length >= 2) {
			const btn = this.listHost.createEl("button", {
				cls: "mermaid-flow-panel-btn",
				text: "Link first two entities",
			});
			btn.addEventListener("click", () => {
				const a = m.entities[0]!;
				const b = m.entities[1]!;
				m.relations.push({
					from: a.id,
					to: b.id,
					card: "||--o{",
					label: "has",
				});
				this.refresh();
			});
		}
		this.drawErSvg();
	}

	private drawErSvg(): void {
		this.canvasHost.empty();
		const m = this.model as ErModel;
		const svg = activeDocument.createElementNS(SVG_NS, "svg");
		svg.classList.add("mermaid-flow-alt-svg");
		const cols = Math.max(1, Math.ceil(Math.sqrt(m.entities.length)));
		const width = Math.max(420, cols * 180 + 40);
		const rows = Math.ceil(m.entities.length / cols) || 1;
		const height = Math.max(240, rows * 120 + 40);
		svg.setAttribute("width", String(width));
		svg.setAttribute("height", String(height));
		svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

		const pos = new Map<string, { x: number; y: number }>();
		m.entities.forEach((e, i) => {
			const x = 40 + (i % cols) * 180;
			const y = 30 + Math.floor(i / cols) * 120;
			pos.set(e.id, { x, y });
			const box = activeDocument.createElementNS(SVG_NS, "rect");
			box.setAttribute("x", String(x));
			box.setAttribute("y", String(y));
			box.setAttribute("width", "140");
			box.setAttribute("height", String(36 + e.attributes.length * 14));
			box.setAttribute("rx", "6");
			box.setAttribute("fill", "#ececff");
			box.setAttribute("stroke", "#666666");
			svg.appendChild(box);
			const title = activeDocument.createElementNS(SVG_NS, "text");
			title.setAttribute("x", String(x + 70));
			title.setAttribute("y", String(y + 18));
			title.setAttribute("text-anchor", "middle");
			title.setAttribute("fill", "#333333");
			title.setAttribute("font-size", "12");
			title.setAttribute("font-weight", "600");
			title.textContent = e.id;
			svg.appendChild(title);
			e.attributes.forEach((a, ai) => {
				const t = activeDocument.createElementNS(SVG_NS, "text");
				t.setAttribute("x", String(x + 10));
				t.setAttribute("y", String(y + 36 + ai * 14));
				t.setAttribute("fill", "#666666");
				t.setAttribute("font-size", "10");
				t.textContent = `${a.name}: ${a.type}${a.pk ? " ★" : ""}`;
				svg.appendChild(t);
			});
		});

		for (const r of m.relations) {
			const a = pos.get(r.from);
			const b = pos.get(r.to);
			if (!a || !b) continue;
			const line = activeDocument.createElementNS(SVG_NS, "line");
			line.setAttribute("x1", String(a.x + 70));
			line.setAttribute("y1", String(a.y + 20));
			line.setAttribute("x2", String(b.x + 70));
			line.setAttribute("y2", String(b.y + 20));
			line.setAttribute("stroke", "#7c3aed");
			svg.appendChild(line);
		}

		this.canvasHost.appendChild(svg);
	}
}
