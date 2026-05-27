import { App, PluginSettingTab, Setting } from "obsidian";
import {
	DIRECTIONS,
	DIRECTION_LABELS,
	Direction,
	NODE_SHAPES,
	NodeShape,
	SHAPE_LABELS,
} from "./model";
import type MermaidFlowPlugin from "./main";

export type OpenMode = "modal" | "pane";

export interface MermaidFlowSettings {
	openMode: OpenMode;
	defaultDirection: Direction;
	defaultShape: NodeShape;
	savePositions: boolean;
	autoSave: boolean;
}

export const DEFAULT_SETTINGS: MermaidFlowSettings = {
	openMode: "modal",
	defaultDirection: "TB",
	defaultShape: "rect",
	savePositions: true,
	autoSave: true,
};

export class MermaidFlowSettingTab extends PluginSettingTab {
	plugin: MermaidFlowPlugin;

	constructor(app: App, plugin: MermaidFlowPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Open editor as")
			.setDesc(
				"Popup opens the editor in a centered dialog. Embedded pane opens it in a workspace tab beside your note.",
			)
			.addDropdown((dd) => {
				dd.addOption("modal", "Popup (dialog)");
				dd.addOption("pane", "Embedded pane");
				dd.setValue(this.plugin.settings.openMode);
				dd.onChange(async (value) => {
					this.plugin.settings.openMode = value as "modal" | "pane";
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Default direction")
			.setDesc("Direction used for new diagrams.")
			.addDropdown((dd) => {
				for (const dir of DIRECTIONS) {
					dd.addOption(dir, DIRECTION_LABELS[dir]);
				}
				dd.setValue(this.plugin.settings.defaultDirection);
				dd.onChange(async (value) => {
					this.plugin.settings.defaultDirection = value as Direction;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Default node shape")
			.setDesc("Shape applied to newly added nodes.")
			.addDropdown((dd) => {
				for (const shape of NODE_SHAPES) {
					dd.addOption(shape, SHAPE_LABELS[shape]);
				}
				dd.setValue(this.plugin.settings.defaultShape);
				dd.onChange(async (value) => {
					this.plugin.settings.defaultShape = value as NodeShape;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Auto-save (embedded pane)")
			.setDesc(
				"When editing an existing diagram in an embedded pane, write changes back to the note automatically. Does not apply to the popup or to inserting new diagrams.",
			)
			.addToggle((tg) => {
				tg.setValue(this.plugin.settings.autoSave);
				tg.onChange(async (value) => {
					this.plugin.settings.autoSave = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Remember node positions")
			.setDesc(
				"Store manual node positions in a Mermaid comment so your layout survives edits. The comment is ignored by Mermaid when rendering.",
			)
			.addToggle((tg) => {
				tg.setValue(this.plugin.settings.savePositions);
				tg.onChange(async (value) => {
					this.plugin.settings.savePositions = value;
					await this.plugin.saveSettings();
				});
			});
	}
}
