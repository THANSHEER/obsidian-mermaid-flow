// @vitest-environment jsdom
/*
 * Localization tests.
 *
 * Two layers:
 * 1. Unit tests for the helper and locale mapping.
 * 2. A rendering audit that mounts every panel and modal in Chinese and fails
 *    if anything still renders in English. New UI strings without a dictionary
 *    entry are caught here, not by users.
 */
import { afterEach, describe, expect, it } from "vitest";
import { getLocale, setLocale, t, toLocale } from "../src/i18n";
import { buildToolbar } from "../src/toolbar";
import type { ToolbarOps } from "../src/toolbar";
import { PropertiesPanel } from "../src/propertiesPanel";
import type { PanelOps } from "../src/propertiesPanel";
import { CodeView } from "../src/codeView";
import { AiGenerateModal } from "../src/ai/aiModal";
import { AltDiagramModal } from "../src/altDiagrams/editor";
import { ChangelogModal } from "../src/feedback/changelogModal";
import { WelcomeModal } from "../src/feedback/welcomeModal";
import { emptyModel } from "../src/model";
import type { DiagramModel } from "../src/model";

afterEach(() => setLocale("auto"));

describe("t()", () => {
	it("keeps English when the locale is English", () => {
		setLocale("en");
		expect(t("Undo (Ctrl+Z)")).toBe("Undo (Ctrl+Z)");
	});

	it("translates known keys in Chinese", () => {
		setLocale("zh-cn");
		expect(t("Undo (Ctrl+Z)")).toBe("撤销 (Ctrl+Z)");
		expect(t("Lock layout")).toBe("锁定布局");
	});

	it("fills placeholders in both locales", () => {
		setLocale("zh-cn");
		expect(t("{count} nodes selected", { count: 3 })).toBe("已选中 3 个节点");
		expect(t("Export as {format}", { format: "PNG" })).toBe("导出为 PNG");
		setLocale("en");
		expect(t("Export as {format}", { format: "PNG" })).toBe("Export as PNG");
	});

	it("falls back to the source string for unknown keys", () => {
		setLocale("zh-cn");
		expect(t("Brand new untranslated string")).toBe("Brand new untranslated string");
	});

	it("defaults to the app language when the preference is auto", () => {
		setLocale("auto");
		expect(["en", "zh-cn"]).toContain(getLocale());
	});
});

describe("toLocale()", () => {
	it("maps every Chinese variant to zh-cn", () => {
		for (const code of ["zh", "zh-CN", "zh-TW", "zh-Hans"]) expect(toLocale(code)).toBe("zh-cn");
	});

	it("maps everything else to en", () => {
		for (const code of ["en", "en-GB", "de", "", null, undefined]) expect(toLocale(code)).toBe("en");
	});
});

// jsdom lacks Obsidian's element helpers; the components rely on them.
const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
if (typeof proto.setText !== "function") {
	proto.setText = function (this: HTMLElement, value: string) {
		this.textContent = value;
		return this;
	};
	proto.addClass = function (this: HTMLElement, ...cls: string[]) {
		this.classList.add(...cls);
		return this;
	};
	proto.empty = function (this: HTMLElement) {
		this.replaceChildren();
		return this;
	};
	proto.setAttr = function (this: HTMLElement, key: string, value: string) {
		this.setAttribute(key, value);
		return this;
	};
	proto.hide = function (this: HTMLElement) {
		this.style.display = "none";
	};
	proto.show = function (this: HTMLElement) {
		this.style.display = "";
	};
	proto.toggleClass = function (this: HTMLElement, cls: string, on: boolean) {
		this.classList.toggle(cls, on);
	};
	proto.setCssStyles = function (this: HTMLElement, styles: Record<string, string>) {
		Object.assign(this.style, styles);
	};
}

const ASCII_WORD = /^[A-Za-z][A-Za-z'’./+-]{2,}$/;
// English that is intentional: product names, font stacks, units, symbols.
const ALLOW = new Set([
	"Mermaid", "Flow", "Obsidian", "PNG", "SVG", "PDF", "AI", "API", "URL", "Id", "id",
	"OpenAI", "Ollama", "LM", "Studio", "OpenRouter", "Anthropic", "Claude", "Google",
	"Gemini", "Ko-fi", "GitHub", "classDef", "style", "stroke", "fill", "color", "px",
	"Ctrl", "Cmd", "Shift", "Alt", "Space", "Enter", "Esc", "Escape", "Tab", "Del",
	"Backspace", "F2", "Key", "Step", "A1", "A2", "B1", "B2", "Yes", "No", "Solarized",
	"Arial", "Georgia", "Courier", "New", "Trebuchet", "MS", "Verdana",
]);

function scan(root: HTMLElement, label: string): string[] {
	const out: string[] = [];
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	let node: Node | null;
	while ((node = walker.nextNode())) {
		const text = (node.textContent ?? "").trim();
		if (!text) continue;
		if (/[\u4e00-\u9fff]/.test(text)) continue;
		const words = text.split(/\s+/).filter((w) => ASCII_WORD.test(w.replace(/[.,;:!?()"“”]/g, "")));
		if (words.some((w) => !ALLOW.has(w.replace(/[.,;:!?()"“”]/g, "")))) out.push(`text: ${text}`);
	}
	for (const el of root.querySelectorAll("[aria-label],[title],[placeholder]")) {
		for (const attr of ["aria-label", "title", "placeholder"]) {
			const value = el.getAttribute(attr);
			if (!value || /[\u4e00-\u9fff]/.test(value)) continue;
			const words = value.split(/\s+/).filter((w) => ASCII_WORD.test(w.replace(/[.,;:!?()]/g, "")));
			if (words.some((w) => !ALLOW.has(w.replace(/[.,;:!?()]/g, "")))) out.push(`${attr}: ${value}`);
		}
	}
	if (out.length) {
		console.log(`\n=== ${label} (${out.length}) ===`);
		for (const line of [...new Set(out)]) console.log("  " + line);
	}
	return out;
}

function stubToolbarOps(): ToolbarOps {
	const values: Partial<ToolbarOps> = {
		getMode: () => "select",
		getCurrentDirection: () => "TB",
		matchesTheme: () => false,
		getMultiCount: () => 0,
		getSaveLabel: () => "Save",
		getCanvas: () => ({ registerDropTarget: () => undefined }) as unknown as ReturnType<ToolbarOps["getCanvas"]>,
	};
	return new Proxy(values as ToolbarOps, {
		get: (target, prop) => {
			const hit = (target as Record<string | symbol, unknown>)[prop];
			return hit ?? (() => undefined);
		},
	});
}

function stubPanelOps(): PanelOps {
	const values: Partial<PanelOps> = { pickLink: async () => null };
	return new Proxy(values as PanelOps, {
		get: (target, prop) => {
			const hit = (target as Record<string | symbol, unknown>)[prop];
			return hit ?? (() => undefined);
		},
	});
}

function nodeModel(): DiagramModel {
	const model = emptyModel();
	model.nodes.push({ id: "A", label: "Node A", shape: "rect", x: 0, y: 0 });
	model.nodes.push({ id: "B", label: "Node B", shape: "rect", x: 0, y: 100 });
	model.edges.push({ id: "e1", from: "A", to: "B", kind: "arrow" });
	return model;
}

function renderPanel(model: DiagramModel, sel: unknown, multi: string[] = []): HTMLElement {
	const host = document.createElement("div");
	document.body.appendChild(host);
	const panel = new PropertiesPanel(
		host,
		() => model,
		() =>
			({
				getSelection: () => sel,
				getMultiSelection: () => multi,
				effectiveSize: () => ({ w: 120, h: 60 }),
			}) as never,
		stubPanelOps(),
	);
	panel.refresh();
	return host;
}

describe("localized UI", () => {
	it("renders Chinese labels when the locale is Chinese", () => {
		setLocale("zh-cn");
		const bar = document.createElement("div");
		document.body.appendChild(bar);
		buildToolbar(bar, stubToolbarOps());

		const labels = [...bar.querySelectorAll("[aria-label]")].map((el) => el.getAttribute("aria-label"));
		expect(labels).toContain("撤销 (Ctrl+Z)");
		expect(labels).toContain("锁定布局");
		expect(labels).toContain("导出图表");

		const shapeLabels = [...bar.querySelectorAll(".mermaid-flow-shape-btn")].map((el) =>
			el.getAttribute("aria-label"),
		);
		expect(shapeLabels).toContain("矩形");
	});

	it("renders English labels when the locale is English", () => {
		setLocale("en");
		const bar = document.createElement("div");
		document.body.appendChild(bar);
		buildToolbar(bar, stubToolbarOps());

		const labels = [...bar.querySelectorAll("[aria-label]")].map((el) => el.getAttribute("aria-label"));
		expect(labels).toContain("Undo (Ctrl+Z)");
		expect(labels).toContain("Lock layout");
	});

	it("leaves no English in any panel or modal", () => {
		setLocale("zh-cn");
		const findings: string[] = [];

		const toolbar = document.createElement("div");
		document.body.appendChild(toolbar);
		buildToolbar(toolbar, stubToolbarOps());
		findings.push(...scan(toolbar, "toolbar"));

		const model = nodeModel();
		findings.push(...scan(renderPanel(model, null), "panel: empty"));
		findings.push(...scan(renderPanel(model, { type: "node", id: "A" }), "panel: node"));
		findings.push(...scan(renderPanel(model, { type: "edge", id: "e1" }), "panel: edge"));
		findings.push(...scan(renderPanel(model, { type: "node", id: "A" }, ["A", "B"]), "panel: multi"));

		const grouped = nodeModel();
		grouped.groups.push({ id: "g1", title: "Group 1", nodeIds: ["A", "B"] });
		findings.push(...scan(renderPanel(grouped, { type: "group", id: "g1" }), "panel: group"));

		const codeHost = document.createElement("div");
		document.body.appendChild(codeHost);
		const view = new CodeView({
			getModel: () => model,
			getCanvas: () => ({}) as never,
			commit: () => undefined,
			refresh: () => undefined,
			pushHistory: () => undefined,
		});
		view.build(codeHost);
		findings.push(...scan(codeHost, "code view"));

		const aiStub = {
			isConfigured: () => true,
			configurationHint: () => "hint",
			generateDiagram: async () => ({ code: "", warnings: [] }),
		} as never;
		for (const mode of ["image", "text", "improve"] as const) {
			const modal = new AiGenerateModal({} as never, aiStub, mode, { onResult: () => undefined } as never);
			modal.onOpen();
			findings.push(...scan(modal.contentEl, `ai modal: ${mode}`));
		}

		for (const kind of ["sequence", "mindmap", "er"] as const) {
			const source =
				kind === "sequence"
					? "sequenceDiagram\n  A->>B: hi"
					: kind === "mindmap"
						? "mindmap\n  root"
						: "erDiagram\n  A ||--o{ B : has";
			const editor = new AltDiagramModal({} as never, kind, source, async () => undefined);
			editor.onOpen();
			findings.push(...scan(editor.contentEl, `alt editor: ${kind}`));
		}

		const pluginStub = { settings: {}, manifest: { version: "1.10.0" } } as never;
		const welcome = new WelcomeModal({} as never, pluginStub);
		welcome.onOpen();
		findings.push(...scan(welcome.contentEl, "welcome modal"));

		const changelog = new ChangelogModal({} as never, pluginStub, "1.10.0");
		changelog.onOpen();
		findings.push(...scan(changelog.contentEl, "changelog modal"));

		// Diagram content and font names are data, not UI copy.
		const EXPECTED = new Set([
			"text: Solarized",
			"text: Save",
			"text: (none)",
			"text: Arial",
			"text: Georgia",
			"text: Courier New",
			"text: Trebuchet MS",
			"text: Verdana",
			"text: root",
			"text: A ||--o{ B : has",
		]);
		expect(findings.filter((line) => !EXPECTED.has(line))).toEqual([]);
	});
});
