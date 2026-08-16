import { App, Platform, PluginSettingTab, Setting } from "obsidian";
import {
	DIRECTIONS,
	DIRECTION_LABELS,
	Direction,
	NODE_SHAPES,
	NodeShape,
	SHAPE_LABELS,
} from "./model";
import type { LibraryComponent } from "./componentLibrary";
import type MermaidFlowPlugin from "./main";
import { AiProviderId, AiSettings, CliPresetId, DEFAULT_AI_SETTINGS } from "./ai/types";
import { CLI_PRESETS } from "./ai/cliProvider";
import { mountKofiWidget } from "./kofi";

export type OpenMode = "modal" | "pane";
export type ToolbarStyle = "native" | "floating";

export interface MermaidFlowSettings {
	openMode: OpenMode;
	toolbarStyle: ToolbarStyle;
	defaultDirection: Direction;
	defaultShape: NodeShape;
	savePositions: boolean;
	autoSave: boolean;
	exportFolder: string;
	snapToGrid: boolean;
	snapSize: number;
	ai: AiSettings;
	/** User-saved reusable diagram snippets. */
	componentLibrary: LibraryComponent[];
	/** Last plugin version the user has seen (for update notices). */
	lastSeenVersion: string | null;
}

export const DEFAULT_SETTINGS: MermaidFlowSettings = {
	openMode: "modal",
	toolbarStyle: "native",
	defaultDirection: "TB",
	defaultShape: "rect",
	savePositions: true,
	autoSave: true,
	exportFolder: "mermaid flow",
	snapToGrid: false,
	snapSize: 10,
	ai: DEFAULT_AI_SETTINGS,
	componentLibrary: [],
	lastSeenVersion: null,
};

export class MermaidFlowSettingTab extends PluginSettingTab {
	plugin: MermaidFlowPlugin;

	constructor(app: App, plugin: MermaidFlowPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/**
	 * 1.13+ declarative definitions for settings search. We keep `display()` as
	 * the runtime fallback for older Obsidian versions and for the richer AI UI.
	 */
	getSettingDefinitions(): Array<Record<string, unknown>> {
		const directionOptions: Record<string, string> = {};
		for (const dir of DIRECTIONS) directionOptions[dir] = DIRECTION_LABELS[dir];
		const shapeOptions: Record<string, string> = {};
		for (const shape of NODE_SHAPES) shapeOptions[shape] = SHAPE_LABELS[shape];
		return [
			{
				name: "Open editor as",
				desc: "Popup opens the editor in a centered dialog. Embedded pane opens it in a workspace tab beside your note.",
				control: {
					type: "dropdown",
					key: "openMode",
					defaultValue: DEFAULT_SETTINGS.openMode,
					options: {
						modal: "Popup (dialog)",
						pane: "Embedded pane",
					},
				},
			},
			{
				name: "Toolbar style",
				desc: "Native docks the toolbar at the top. Floating shows it as a compact bar over the canvas.",
				control: {
					type: "dropdown",
					key: "toolbarStyle",
					defaultValue: DEFAULT_SETTINGS.toolbarStyle,
					options: {
						native: "Native (docked)",
						floating: "Floating",
					},
				},
			},
			{
				name: "Default direction",
				desc: "Direction used for new diagrams.",
				control: {
					type: "dropdown",
					key: "defaultDirection",
					defaultValue: DEFAULT_SETTINGS.defaultDirection,
					options: directionOptions,
				},
			},
			{
				name: "Default node shape",
				desc: "Shape applied to newly added nodes.",
				control: {
					type: "dropdown",
					key: "defaultShape",
					defaultValue: DEFAULT_SETTINGS.defaultShape,
					options: shapeOptions,
				},
			},
			{
				name: "Export folder",
				desc: "Vault folder where PNG/SVG exports are saved. Created automatically if it doesn't exist.",
				control: {
					type: "text",
					key: "exportFolder",
					defaultValue: DEFAULT_SETTINGS.exportFolder,
					placeholder: "mermaid flow",
				},
			},
			{
				name: "Snap nodes to grid",
				desc: "Snap nodes to a fixed grid while dragging for cleaner alignment.",
				control: {
					type: "toggle",
					key: "snapToGrid",
				},
			},
			{
				name: "Grid size (px)",
				desc: "Snap grid cell size in pixels (applies when Snap to grid is on).",
				control: {
					type: "slider",
					key: "snapSize",
					min: 5,
					max: 40,
					step: 5,
					defaultValue: DEFAULT_SETTINGS.snapSize,
				},
			},
			{
				name: "Auto-save (embedded pane)",
				desc: "When editing an existing diagram in an embedded pane, write changes back to the note automatically. Does not apply to the popup or to inserting new diagrams.",
				control: {
					type: "toggle",
					key: "autoSave",
				},
			},
			{
				name: "Remember node positions",
				desc: "Store manual node positions in a Mermaid comment so your layout survives edits. The comment is ignored by Mermaid when rendering.",
				control: {
					type: "toggle",
					key: "savePositions",
				},
			},
		];
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName("Editor").setHeading();

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
			.setName("Toolbar style")
			.setDesc(
				"Native docks the toolbar at the top. Floating shows it as a compact bar over the canvas.",
			)
			.addDropdown((dd) => {
				dd.addOption("native", "Native (docked)");
				dd.addOption("floating", "Floating");
				dd.setValue(this.plugin.settings.toolbarStyle);
				dd.onChange(async (value) => {
					this.plugin.settings.toolbarStyle = value as ToolbarStyle;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl).setName("Diagram defaults").setHeading();

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

		new Setting(containerEl).setName("Behavior").setHeading();

		new Setting(containerEl)
			.setName("Export folder")
			.setDesc(
				"Vault folder where PNG/SVG exports are saved. Created automatically if it doesn't exist.",
			)
			.addText((text) => {
				text.setPlaceholder("mermaid flow");
				text.setValue(this.plugin.settings.exportFolder);
				text.onChange(async (value) => {
					this.plugin.settings.exportFolder = value.trim() || "mermaid flow";
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Snap nodes to grid")
			.setDesc("Snap nodes to a fixed grid while dragging for cleaner alignment.")
			.addToggle((tg) => {
				tg.setValue(this.plugin.settings.snapToGrid);
				tg.onChange(async (value) => {
					this.plugin.settings.snapToGrid = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Grid size (px)")
			.setDesc("Snap grid cell size in pixels (applies when Snap to grid is on).")
			.addSlider((sl) => {
				sl.setLimits(5, 40, 5);
				sl.setValue(this.plugin.settings.snapSize);
				sl.setDynamicTooltip();
				sl.onChange(async (value) => {
					this.plugin.settings.snapSize = value;
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

		this.displayAiSection(containerEl);

		new Setting(containerEl).setName("Support").setHeading();
		new Setting(containerEl)
			.setName("Tip on Ko-fi")
			.setDesc("If Mermaid Flow helps you, you can support development with a tip.");
		mountKofiWidget(containerEl);

		new Setting(containerEl).setName("Component library").setHeading();
		const count = this.plugin.settings.componentLibrary?.length ?? 0;
		new Setting(containerEl)
			.setName("Saved components")
			.setDesc(
				count === 0
					? "No components yet. In the visual editor, select nodes and use the library button (or context menu) to save a reusable snippet."
					: `${count} component(s) saved. Insert or delete them from the library button in the visual editor.`,
			)
			.addButton((btn) => {
				btn.setButtonText("Clear all");
				btn.setDisabled(count === 0);
				btn.onClick(async () => {
					this.plugin.settings.componentLibrary = [];
					await this.plugin.saveSettings();
					this.display();
				});
			});
	}

	private displayAiSection(containerEl: HTMLElement): void {
		const ai = this.plugin.settings.ai;
		const save = () => this.plugin.saveSettings();

		new Setting(containerEl).setName("AI assistance").setHeading();

		new Setting(containerEl)
			.setName("Enable AI features")
			.setDesc(
				"Generate diagrams from images or text descriptions, and improve existing diagrams, using an AI provider.",
			)
			.addToggle((tg) => {
				tg.setValue(ai.enabled);
				tg.onChange(async (value) => {
					ai.enabled = value;
					await save();
					this.display();
				});
			});

		if (!ai.enabled) return;

		new Setting(containerEl)
			.setName("Provider")
			.setDesc("Which AI service generates the diagrams.")
			.addDropdown((dd) => {
				dd.addOption("anthropic", "Anthropic (Claude)");
				dd.addOption("openai-compat", "OpenAI-compatible API");
				dd.addOption("gemini", "Google Gemini");
				dd.addOption("cli", "Local CLI tool (desktop only)");
				dd.setValue(ai.provider);
				dd.onChange(async (value) => {
					ai.provider = value as AiProviderId;
					await save();
					this.display();
				});
			});

		switch (ai.provider) {
			case "anthropic":
				this.apiKeySetting(containerEl, "Anthropic API key",
					() => ai.anthropicApiKey, (v) => { ai.anthropicApiKey = v; });
				this.modelSetting(containerEl, DEFAULT_AI_SETTINGS.anthropicModel,
					() => ai.anthropicModel, (v) => { ai.anthropicModel = v; });
				break;
			case "openai-compat":
				new Setting(containerEl)
					.setName("Base URL")
					.setDesc(
						"OpenAI: https://api.openai.com/v1 · Ollama: http://localhost:11434/v1 · also OpenRouter, LM Studio, or any OpenAI-compatible server.",
					)
					.addText((text) => {
						text.setPlaceholder(DEFAULT_AI_SETTINGS.openaiBaseUrl);
						text.setValue(ai.openaiBaseUrl);
						text.onChange(async (value) => {
							ai.openaiBaseUrl = value.trim() || DEFAULT_AI_SETTINGS.openaiBaseUrl;
							await save();
						});
					});
				this.apiKeySetting(containerEl, "API key",
					() => ai.openaiApiKey, (v) => { ai.openaiApiKey = v; },
					"Leave empty for local servers like Ollama or LM Studio.");
				this.modelSetting(containerEl, DEFAULT_AI_SETTINGS.openaiModel,
					() => ai.openaiModel, (v) => { ai.openaiModel = v; });
				break;
			case "gemini":
				this.apiKeySetting(containerEl, "Gemini API key",
					() => ai.geminiApiKey, (v) => { ai.geminiApiKey = v; });
				this.modelSetting(containerEl, DEFAULT_AI_SETTINGS.geminiModel,
					() => ai.geminiModel, (v) => { ai.geminiModel = v; });
				break;
			case "cli":
				this.displayCliSettings(containerEl, ai);
				break;
		}

		if (ai.provider !== "cli") {
			// configDir is usually ".obsidian" but the user can rename it, so read
			// the live value rather than hardcoding it.
			const dataPath = `${this.app.vault.configDir}/plugins/${this.plugin.manifest.id}/data.json`;
			new Setting(containerEl).setDesc(
				`API keys are stored unencrypted in this vault's ${dataPath}. Don't sync that file to untrusted locations.`,
			);
		}

		new Setting(containerEl).setName("AI entry points").setHeading();

		new Setting(containerEl)
			.setName("Show AI commands in the command palette")
			.addToggle((tg) => {
				tg.setValue(ai.showCommands);
				tg.onChange(async (value) => {
					ai.showCommands = value;
					await save();
				});
			});

		new Setting(containerEl)
			.setName("Show AI button in the editor toolbar")
			.setDesc("Applies the next time the editor opens.")
			.addToggle((tg) => {
				tg.setValue(ai.showToolbarButton);
				tg.onChange(async (value) => {
					ai.showToolbarButton = value;
					await save();
				});
			});

		new Setting(containerEl)
			.setName("Generate from images dropped or pasted onto the canvas")
			.setDesc("Applies the next time the editor opens.")
			.addToggle((tg) => {
				tg.setValue(ai.enableImageDrop);
				tg.onChange(async (value) => {
					ai.enableImageDrop = value;
					await save();
				});
			});
	}

	private displayCliSettings(containerEl: HTMLElement, ai: AiSettings): void {
		if (!Platform.isDesktopApp) {
			new Setting(containerEl).setDesc(
				"CLI providers only work on Obsidian desktop. Pick an API provider instead.",
			);
			return;
		}

		new Setting(containerEl)
			.setName("CLI tool")
			.setDesc("The CLI must be installed and authenticated on this machine.")
			.addDropdown((dd) => {
				dd.addOption("claude", "Claude Code (claude)");
				dd.addOption("codex", "Codex (codex)");
				dd.addOption("gemini-cli", "Gemini CLI (gemini)");
				dd.addOption("custom", "Custom command");
				dd.setValue(ai.cliPreset);
				dd.onChange(async (value) => {
					ai.cliPreset = value as CliPresetId;
					await this.plugin.saveSettings();
					this.display();
				});
			});

		if (ai.cliPreset === "custom") {
			new Setting(containerEl)
				.setName("Command template")
				.setDesc(
					"{{prompt}} is replaced with the full prompt, {{image}} with a temp image path. Wrap a {{image?...}} segment to include it only when an image is attached.",
				)
				.addText((text) => {
					text.setPlaceholder("mycli --prompt {{prompt}}");
					text.setValue(ai.cliCustomTemplate);
					text.onChange(async (value) => {
						ai.cliCustomTemplate = value;
						await this.plugin.saveSettings();
					});
				});
		} else {
			new Setting(containerEl)
				.setName("Effective command")
				.setDesc(CLI_PRESETS[ai.cliPreset]);
		}

		new Setting(containerEl)
			.setName("Timeout (seconds)")
			.setDesc("How long to wait for the CLI before giving up.")
			.addSlider((sl) => {
				sl.setLimits(30, 300, 10);
				sl.setValue(ai.cliTimeoutSec);
				sl.setDynamicTooltip();
				sl.onChange(async (value) => {
					ai.cliTimeoutSec = value;
					await this.plugin.saveSettings();
				});
			});
	}

	private apiKeySetting(
		containerEl: HTMLElement,
		name: string,
		get: () => string,
		set: (v: string) => void,
		desc?: string,
	): void {
		const setting = new Setting(containerEl).setName(name);
		if (desc) setting.setDesc(desc);
		setting.addText((text) => {
			text.inputEl.type = "password";
			text.setPlaceholder("sk-…");
			text.setValue(get());
			text.onChange(async (value) => {
				set(value.trim());
				await this.plugin.saveSettings();
			});
		});
	}

	private modelSetting(
		containerEl: HTMLElement,
		placeholder: string,
		get: () => string,
		set: (v: string) => void,
	): void {
		new Setting(containerEl)
			.setName("Model")
			.addText((text) => {
				text.setPlaceholder(placeholder);
				text.setValue(get());
				text.onChange(async (value) => {
					set(value.trim() || placeholder);
					await this.plugin.saveSettings();
				});
			});
	}
}
