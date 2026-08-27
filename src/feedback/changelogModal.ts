/*
 * Changelog modal displayed after a plugin update or opened via command/settings.
 */

import { App, Modal } from "obsidian";
import type MermaidFlowPlugin from "../main";
import { renderAppLogo } from "../logo";
import { openKofi } from "../kofi";

export interface ChangelogItem {
	version: string;
	title: string;
	features?: string[];
	improvements?: string[];
	fixes?: string[];
	security?: string[];
}

export const CHANGELOG_DATA: ChangelogItem[] = [
	{
		version: "1.8.1",
		title: "Semicolon & quote round-trip fixes, subgraph styling/direction & security hardening",
		fixes: [
			"Preserve quoted labels with semicolons: statements are no longer split on ';' inside quoted node labels, edge labels, or HTML entities like &nbsp; and &quot; (#26).",
			"Subgraph survival: subgraphs containing nodes with semicolons or HTML entities are no longer deleted on save (#26).",
			"Double-quote round-trip stability: labels containing double quotes no longer generate ghost nodes (e.g. hi['hi'], quot['quot']) on repeated saves (#26).",
			"Ghost-free subgraph styling: 'style <subgraphId>' now correctly styles the subgraph without creating a ghost node rectangle or stray position coordinates (#27).",
			"Subgraph layout direction retention: 'direction' statements inside subgraphs now remain inside the subgraph block instead of moving to the root diagram (#27).",
			"Subgraph class assignment: 'class <subgraphId> name' now assigns the class to the group without creating a ghost node.",
			"Subgraph comment & extras scoping: comments and unsupported lines inside a subgraph retain their enclosing scope on save.",
			"Arrow operator safety: labels containing '-->' or '---' are no longer misinterpreted as link operators.",
			"Inline label hyphens: labels with hyphens (e.g. 'A -- step-by-step --> B') parse correctly.",
		],
		security: [
			"External link navigation hardening: restricted node link external navigation to safe protocols (http, https, mailto) with 'noopener,noreferrer' attributes.",
		],
	},
	{
		version: "1.8.0",
		title: "Full-bleed canvas, full-width floating toolbar & auto-hide panel",
		features: [
			"Full-bleed canvas layout: continuous edge-to-edge grid background across all editor and modal views.",
			"Hidden visual scrollbars on the canvas with full mouse, trackpad, spacebar pan, and scroll-wheel navigation preserved.",
			"Full-width floating toolbar: natural multi-row flex-wrapping on narrower viewports.",
			"Overlap protection: dedicated reserved zone ensuring Save and Discard buttons never collide with toolbar items.",
			"Auto-hiding floating properties panel: automatically hides while dragging a node, group, edge, or resize handle for unobstructed positioning.",
		],
		improvements: [
			"Smooth fade animations for the floating properties panel.",
			"Enhanced pointer cancellation safety and state cleanup.",
		],
	},
	{
		version: "1.7.1",
		title: "Security and stability fixes",
		fixes: [
			"Native Ko-fi support button in settings complying with community plugin guidelines.",
			"Optimized error display in code view.",
		],
	},
	{
		version: "1.7.0",
		title: "Rich text rendering, floating properties panel & custom views",
		features: [
			"Setting to open the editor in a new workspace tab instead of vertical split.",
			"Rich text rendering for bold, italic, and colored text inside node labels.",
			"Floating properties panel mode for an expanded canvas workspace.",
			"Setting to collapse properties panel sections by default.",
			"Option to disable auto-resize for infinite canvas behavior.",
		],
	},
];

export class ChangelogModal extends Modal {
	private plugin: MermaidFlowPlugin;
	private version: string;
	private previousVersion?: string;

	constructor(
		app: App,
		plugin: MermaidFlowPlugin,
		version: string,
		previousVersion?: string,
	) {
		super(app);
		this.plugin = plugin;
		this.version = version;
		this.previousVersion = previousVersion;
	}

	onOpen(): void {
		this.modalEl.addClass("mermaid-flow-changelog-modal");
		const content = this.contentEl;
		content.empty();

		const header = content.createDiv({ cls: "mermaid-flow-modal-header" });
		renderAppLogo(header, 64);

		header.createEl("h2", {
			cls: "mermaid-flow-modal-title",
			text: `What's new in Mermaid Flow v${this.version}`,
		});

		header.createEl("p", {
			cls: "mermaid-flow-modal-desc",
			text: this.previousVersion
				? `Mermaid Flow updated from v${this.previousVersion} to v${this.version}. Here’s what changed:`
				: `Here are the latest features, improvements, and fixes in Mermaid Flow:`,
		});

		const changelogBox = content.createDiv({ cls: "mermaid-flow-changelog-content" });

		// Show entries, prioritizing current version
		for (const item of CHANGELOG_DATA) {
			const verBlock = changelogBox.createDiv({ cls: "mermaid-flow-changelog-item" });
			const verHeader = verBlock.createDiv({ cls: "mermaid-flow-changelog-version" });
			verHeader.createSpan({ cls: "mermaid-flow-changelog-tag", text: `v${item.version} — ${item.title}` });
			if (item.version === this.version) {
				verHeader.createSpan({ cls: "mermaid-flow-changelog-badge", text: "Current" });
			}

			if (item.features && item.features.length > 0) {
				verBlock.createEl("h4", { cls: "mermaid-flow-changelog-section-title", text: "Features" });
				const ul = verBlock.createEl("ul", { cls: "mermaid-flow-changelog-list" });
				for (const f of item.features) {
					ul.createEl("li", { text: f });
				}
			}

			if (item.improvements && item.improvements.length > 0) {
				verBlock.createEl("h4", { cls: "mermaid-flow-changelog-section-title", text: "Improvements" });
				const ul = verBlock.createEl("ul", { cls: "mermaid-flow-changelog-list" });
				for (const imp of item.improvements) {
					ul.createEl("li", { text: imp });
				}
			}

			if (item.fixes && item.fixes.length > 0) {
				verBlock.createEl("h4", { cls: "mermaid-flow-changelog-section-title", text: "Fixes" });
				const ul = verBlock.createEl("ul", { cls: "mermaid-flow-changelog-list" });
				for (const fix of item.fixes) {
					ul.createEl("li", { text: fix });
				}
			}

			if (item.security && item.security.length > 0) {
				verBlock.createEl("h4", { cls: "mermaid-flow-changelog-section-title", text: "Security" });
				const ul = verBlock.createEl("ul", { cls: "mermaid-flow-changelog-list" });
				for (const s of item.security) {
					ul.createEl("li", { text: s });
				}
			}
		}

		const footer = content.createDiv({ cls: "mermaid-flow-modal-footer" });

		const kofiBtn = footer.createEl("button", {
			text: "Support on Ko-fi",
		});
		kofiBtn.addEventListener("click", () => {
			openKofi();
		});

		const githubBtn = footer.createEl("button", {
			text: "View on GitHub",
		});
		githubBtn.addEventListener("click", () => {
			activeWindow.open("https://github.com/THANSHEER/obsidian-mermaid-flow/releases", "_blank");
		});

		const closeBtn = footer.createEl("button", {
			cls: "mod-cta",
			text: "Got it",
		});
		closeBtn.addEventListener("click", () => {
			this.close();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
