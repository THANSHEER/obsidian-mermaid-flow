/*
 * Welcome modal displayed after plugin installation.
 */

import { App, Modal } from "obsidian";
import type MermaidFlowPlugin from "../main";
import { renderAppLogo } from "../logo";

export class WelcomeModal extends Modal {
	private plugin: MermaidFlowPlugin;

	constructor(app: App, plugin: MermaidFlowPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen(): void {
		this.modalEl.addClass("mermaid-flow-welcome-modal");
		const content = this.contentEl;
		content.empty();

		const header = content.createDiv({ cls: "mermaid-flow-modal-header" });
		renderAppLogo(header, 72);

		header.createEl("h2", {
			cls: "mermaid-flow-modal-title",
			text: "Welcome to Mermaid Flow",
		});

		header.createEl("p", {
			cls: "mermaid-flow-modal-desc",
			text: "A visual, drag-and-drop editor for Mermaid flowcharts inside Obsidian. Create and rearrange diagrams without writing code.",
		});

		const features = content.createDiv({ cls: "mermaid-flow-welcome-features" });

		const featureList = [
			{
				icon: "🎯",
				title: "Visual canvas",
				desc: "Drag nodes, connect via edge anchor dots, resize, and group into subgraphs.",
			},
			{
				icon: "🔄",
				title: "Safe round-trip",
				desc: "Edit existing Mermaid blocks visually without losing custom styling or syntax.",
			},
			{
				icon: "⚡",
				title: "Quick access",
				desc: "Click the workflow ribbon icon, the Edit button above diagrams, or use the command palette.",
			},
			{
				icon: "🎨",
				title: "Themes & layouts",
				desc: "Switch themes, change flow direction, apply auto-layout, or edit live Mermaid code side-by-side.",
			},
		];

		for (const f of featureList) {
			const row = features.createDiv({ cls: "mermaid-flow-welcome-feature" });
			row.createSpan({ cls: "mermaid-flow-welcome-feature-icon", text: f.icon });
			const textCol = row.createDiv({ cls: "mermaid-flow-welcome-feature-text" });
			textCol.createEl("strong", { text: f.title });
			textCol.createSpan({ text: f.desc });
		}

		const footer = content.createDiv({ cls: "mermaid-flow-modal-footer" });

		const settingsBtn = footer.createEl("button", {
			text: "Open settings",
		});
		settingsBtn.addEventListener("click", () => {
			this.close();
			interface AppWithSettings extends App {
				setting?: {
					open(): void;
					openTabById?(id: string): void;
				};
			}
			const appWithSetting = this.app as AppWithSettings;
			if (appWithSetting.setting?.open) {
				appWithSetting.setting.open();
				appWithSetting.setting.openTabById?.("mermaid-flow");
			}
		});

		const insertBtn = footer.createEl("button", {
			text: "Insert diagram",
		});
		insertBtn.addEventListener("click", () => {
			this.close();
			this.plugin.editOrInsert();
		});

		const startBtn = footer.createEl("button", {
			cls: "mod-cta",
			text: "Get started",
		});
		startBtn.addEventListener("click", () => {
			this.close();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
