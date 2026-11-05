import { setLocale, t } from "./i18n";
import type { LanguagePreference } from "./i18n";
import { App, PluginSettingTab, Setting } from "obsidian";
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
import { AiProviderId, AiSettings, DEFAULT_AI_SETTINGS } from "./ai/types";
import { openKofi } from "./kofi";
import { ChangelogModal, WelcomeModal } from "./feedback";

export type OpenMode = "modal" | "pane";
export type ToolbarStyle = "native" | "floating";
export type PaneOpenMode = "split" | "tab";
export type PanelStyle = "sidebar" | "floating";

export interface MermaidFlowSettings {
	/** UI language. "auto" follows the Obsidian language. */
	language: LanguagePreference;
	openMode: OpenMode;
	toolbarStyle: ToolbarStyle;
	panelStyle: PanelStyle;
	paneOpenMode: PaneOpenMode;
	defaultDirection: Direction;
	defaultShape: NodeShape;
	savePositions: boolean;
	autoSave: boolean;
	exportFolder: string;
	snapToGrid: boolean;
	snapSize: number;
	collapsePropertySections: boolean;
	autoResizeCanvas: boolean;
	ai: AiSettings;
	/** User-saved reusable diagram snippets. */
	componentLibrary: LibraryComponent[];
	/** Last plugin version the user has seen (for update notices). */
	lastSeenVersion: string | null;
}

export const DEFAULT_SETTINGS: MermaidFlowSettings = {
	language: "auto",
	openMode: "modal",
	toolbarStyle: "native",
	panelStyle: "sidebar",
	paneOpenMode: "split",
	defaultDirection: "TB",
	defaultShape: "rect",
	savePositions: true,
	autoSave: true,
	exportFolder: "mermaid flow",
	snapToGrid: false,
	snapSize: 10,
	collapsePropertySections: false,
	autoResizeCanvas: true,
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
		for (const dir of DIRECTIONS) directionOptions[dir] = t(DIRECTION_LABELS[dir]);
		const shapeOptions: Record<string, string> = {};
		for (const shape of NODE_SHAPES) shapeOptions[shape] = t(SHAPE_LABELS[shape]);
		return [
			{
				name: t("Open editor as"),
				desc: t("Popup opens the editor in a centered dialog. Embedded pane opens it in a workspace tab beside your note."),
				control: {
					type: "dropdown",
					key: "openMode",
					defaultValue: DEFAULT_SETTINGS.openMode,
					options: {
						modal: t("Popup (dialog)"),
						pane: t("Embedded pane"),
					},
				},
			},
			{
				name: t("Toolbar style"),
				desc: t("Native docks the toolbar at the top. Floating shows it as a compact bar over the canvas."),
				control: {
					type: "dropdown",
					key: "toolbarStyle",
					defaultValue: DEFAULT_SETTINGS.toolbarStyle,
					options: {
						native: t("Native (docked)"),
						floating: t("Floating"),
					},
				},
			},
			{
				name: t("Properties panel style"),
				desc: t("Sidebar docks the panel at the right edge. Floating shows it as an overlay near your selection, and hides when nothing is selected."),
				control: {
					type: "dropdown",
					key: "panelStyle",
					defaultValue: DEFAULT_SETTINGS.panelStyle,
					options: {
						sidebar: t("Sidebar (docked)"),
						floating: t("Floating"),
					},
				},
			},
			{
				name: t("Open embedded pane as"),
				desc: t("Split opens the editor beside your note. New tab opens it in its own workspace tab."),
				control: {
					type: "dropdown",
					key: "paneOpenMode",
					defaultValue: DEFAULT_SETTINGS.paneOpenMode,
					options: {
						split: t("Split"),
						tab: t("New tab"),
					},
				},
			},
			{
				name: t("Collapse property sections by default"),
				desc: t("Start each properties panel section (Content, Shape & size, Text & style, etc.) collapsed when you select a node or edge."),
				control: {
					type: "toggle",
					key: "collapsePropertySections",
				},
			},
			{
				name: t("Auto-resize canvas to content"),
				desc: t("Keep the canvas bounds fitted to your diagram as you move nodes. Turn off for a fixed viewport you can pan freely beyond the current content."),
				control: {
					type: "toggle",
					key: "autoResizeCanvas",
				},
			},
			{
				name: t("Default direction"),
				desc: t("Direction used for new diagrams."),
				control: {
					type: "dropdown",
					key: "defaultDirection",
					defaultValue: DEFAULT_SETTINGS.defaultDirection,
					options: directionOptions,
				},
			},
			{
				name: t("Default node shape"),
				desc: t("Shape applied to newly added nodes."),
				control: {
					type: "dropdown",
					key: "defaultShape",
					defaultValue: DEFAULT_SETTINGS.defaultShape,
					options: shapeOptions,
				},
			},
			{
				name: t("Export folder"),
				desc: t("Vault folder where PNG/SVG exports are saved. Created automatically if it doesn't exist."),
				control: {
					type: "text",
					key: "exportFolder",
					defaultValue: DEFAULT_SETTINGS.exportFolder,
					placeholder: t("mermaid flow"),
				},
			},
			{
				name: t("Snap nodes to grid"),
				desc: t("Snap nodes to a fixed grid while dragging for cleaner alignment."),
				control: {
					type: "toggle",
					key: "snapToGrid",
				},
			},
			{
				name: t("Grid size (px)"),
				desc: t("Snap grid cell size in pixels (applies when Snap to grid is on)."),
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
				name: t("Auto-save (embedded pane)"),
				desc: t("When editing an existing diagram in an embedded pane, write changes back to the note automatically. Does not apply to the popup or to inserting new diagrams."),
				control: {
					type: "toggle",
					key: "autoSave",
				},
			},
			{
				name: t("Remember node positions"),
				desc: t("Store manual node positions in a Mermaid comment so your layout survives edits. The comment is ignored by Mermaid when rendering."),
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

		new Setting(containerEl).setName(t("Interface language")).setHeading();
		new Setting(containerEl)
			.setName(t("Language"))
			.setDesc(t("Follow Obsidian uses the app language. Chinese and English force the plugin UI language."))
			.addDropdown((dd) => {
				dd.addOption("auto", t("Follow Obsidian"));
				dd.addOption("zh-cn", t("中文"));
				dd.addOption("en", t("English"));
				dd.setValue(this.plugin.settings.language);
				dd.onChange(async (value) => {
					this.plugin.settings.language = value as LanguagePreference;
					setLocale(this.plugin.settings.language);
					await this.plugin.saveSettings();
					this.display();
				});
			});

		new Setting(containerEl).setName(t("Editor")).setHeading();

		new Setting(containerEl)
			.setName(t("Open editor as"))
			.setDesc(
				t("Popup opens the editor in a centered dialog. Embedded pane opens it in a workspace tab beside your note."),
			)
			.addDropdown((dd) => {
				dd.addOption("modal", t("Popup (dialog)"));
				dd.addOption("pane", t("Embedded pane"));
				dd.setValue(this.plugin.settings.openMode);
				dd.onChange(async (value) => {
					this.plugin.settings.openMode = value as "modal" | "pane";
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName(t("Toolbar style"))
			.setDesc(
				t("Native docks the toolbar at the top. Floating shows it as a compact bar over the canvas."),
			)
			.addDropdown((dd) => {
				dd.addOption("native", t("Native (docked)"));
				dd.addOption("floating", t("Floating"));
				dd.setValue(this.plugin.settings.toolbarStyle);
				dd.onChange(async (value) => {
					this.plugin.settings.toolbarStyle = value as ToolbarStyle;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName(t("Properties panel style"))
			.setDesc(
				t("Sidebar docks the panel at the right edge. Floating shows it as an overlay near your selection, and hides when nothing is selected."),
			)
			.addDropdown((dd) => {
				dd.addOption("sidebar", t("Sidebar (docked)"));
				dd.addOption("floating", t("Floating"));
				dd.setValue(this.plugin.settings.panelStyle);
				dd.onChange(async (value) => {
					this.plugin.settings.panelStyle = value as PanelStyle;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName(t("Open embedded pane as"))
			.setDesc(t("Split opens the editor beside your note. New tab opens it in its own workspace tab."))
			.addDropdown((dd) => {
				dd.addOption("split", t("Split"));
				dd.addOption("tab", t("New tab"));
				dd.setValue(this.plugin.settings.paneOpenMode);
				dd.onChange(async (value) => {
					this.plugin.settings.paneOpenMode = value as PaneOpenMode;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl).setName(t("Diagram defaults")).setHeading();

		new Setting(containerEl)
			.setName(t("Default direction"))
			.setDesc(t("Direction used for new diagrams."))
			.addDropdown((dd) => {
				for (const dir of DIRECTIONS) {
					dd.addOption(dir, t(DIRECTION_LABELS[dir]));
				}
				dd.setValue(this.plugin.settings.defaultDirection);
				dd.onChange(async (value) => {
					this.plugin.settings.defaultDirection = value as Direction;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName(t("Default node shape"))
			.setDesc(t("Shape applied to newly added nodes."))
			.addDropdown((dd) => {
				for (const shape of NODE_SHAPES) {
					dd.addOption(shape, t(SHAPE_LABELS[shape]));
				}
				dd.setValue(this.plugin.settings.defaultShape);
				dd.onChange(async (value) => {
					this.plugin.settings.defaultShape = value as NodeShape;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl).setName(t("Behavior")).setHeading();

		new Setting(containerEl)
			.setName(t("Export folder"))
			.setDesc(
				t("Vault folder where PNG/SVG exports are saved. Created automatically if it doesn't exist."),
			)
			.addText((text) => {
				text.setPlaceholder(t("mermaid flow"));
				text.setValue(this.plugin.settings.exportFolder);
				text.onChange(async (value) => {
					this.plugin.settings.exportFolder = value.trim() || "mermaid flow";
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName(t("Snap nodes to grid"))
			.setDesc(t("Snap nodes to a fixed grid while dragging for cleaner alignment."))
			.addToggle((tg) => {
				tg.setValue(this.plugin.settings.snapToGrid);
				tg.onChange(async (value) => {
					this.plugin.settings.snapToGrid = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName(t("Grid size (px)"))
			.setDesc(t("Snap grid cell size in pixels (applies when Snap to grid is on)."))
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
			.setName(t("Auto-save (embedded pane)"))
			.setDesc(
				t("When editing an existing diagram in an embedded pane, write changes back to the note automatically. Does not apply to the popup or to inserting new diagrams."),
			)
			.addToggle((tg) => {
				tg.setValue(this.plugin.settings.autoSave);
				tg.onChange(async (value) => {
					this.plugin.settings.autoSave = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName(t("Collapse property sections by default"))
			.setDesc(
				t("Start each properties panel section (Content, Shape & size, Text & style, etc.) collapsed when you select a node or edge."),
			)
			.addToggle((tg) => {
				tg.setValue(this.plugin.settings.collapsePropertySections);
				tg.onChange(async (value) => {
					this.plugin.settings.collapsePropertySections = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName(t("Auto-resize canvas to content"))
			.setDesc(
				t("Keep the canvas bounds fitted to your diagram as you move nodes. Turn off for a fixed viewport you can pan freely beyond the current content."),
			)
			.addToggle((tg) => {
				tg.setValue(this.plugin.settings.autoResizeCanvas);
				tg.onChange(async (value) => {
					this.plugin.settings.autoResizeCanvas = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName(t("Remember node positions"))
			.setDesc(
				t("Store manual node positions in a Mermaid comment so your layout survives edits. The comment is ignored by Mermaid when rendering."),
			)
			.addToggle((tg) => {
				tg.setValue(this.plugin.settings.savePositions);
				tg.onChange(async (value) => {
					this.plugin.settings.savePositions = value;
					await this.plugin.saveSettings();
				});
			});

		this.displayAiSection(containerEl);

		new Setting(containerEl).setName(t("Support")).setHeading();
		new Setting(containerEl)
			.setName(t("Tip on Ko-fi"))
			.setDesc(t("If Mermaid Flow helps you, you can support development with a tip."))
			.addButton((btn) => {
				btn.setCta();
				btn.setButtonText(t("Support on Ko-fi"));
				btn.onClick(() => {
					openKofi();
				});
			});

		new Setting(containerEl).setName(t("Changelog & help")).setHeading();
		new Setting(containerEl)
			.setName(t("What's new"))
			.setDesc(t("See what's new in this version and view recent changelogs."))
			.addButton((btn) => {
				btn.setButtonText(t("View changelog"));
				btn.onClick(() => {
					new ChangelogModal(this.app, this.plugin, this.plugin.manifest.version).open();
				});
			})
			.addButton((btn) => {
				btn.setButtonText(t("View on GitHub"));
				btn.onClick(() => {
					activeWindow.open("https://github.com/THANSHEER/obsidian-mermaid-flow/releases", "_blank");
				});
			});

		new Setting(containerEl)
			.setName(t("Welcome guide"))
			.setDesc(t("Revisit the getting started guide and feature overview."))
			.addButton((btn) => {
				btn.setButtonText(t("Show welcome guide"));
				btn.onClick(() => {
					new WelcomeModal(this.app, this.plugin).open();
				});
			});

		new Setting(containerEl).setName(t("Component library")).setHeading();
		const count = this.plugin.settings.componentLibrary?.length ?? 0;
		new Setting(containerEl)
			.setName(t("Saved components"))
			.setDesc(
				count === 0
					? t("No components yet. In the visual editor, select nodes and use the library button (or context menu) to save a reusable snippet.")
					: `${count} component(s) saved. Insert or delete them from the library button in the visual editor.`,
			)
			.addButton((btn) => {
				btn.setButtonText(t("Clear all"));
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

		new Setting(containerEl).setName(t("AI assistance")).setHeading();

		new Setting(containerEl)
			.setName(t("Enable AI features"))
			.setDesc(
				t("Generate diagrams from images or text descriptions, and improve existing diagrams, using an AI provider."),
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
			.setName(t("Provider"))
			.setDesc(t("Which AI service generates the diagrams."))
			.addDropdown((dd) => {
				dd.addOption("anthropic", t("Anthropic (Claude)"));
				dd.addOption("openai-compat", t("OpenAI-compatible API"));
				dd.addOption("gemini", t("Google Gemini"));
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
					.setName(t("Base URL"))
					.setDesc(
						t("OpenAI: https://api.openai.com/v1 · Ollama: http://localhost:11434/v1 · also OpenRouter, LM Studio, or any OpenAI-compatible server."),
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
		}

		// configDir is usually ".obsidian" but the user can rename it, so read
		// the live value rather than hardcoding it.
		const dataPath = `${this.app.vault.configDir}/plugins/${this.plugin.manifest.id}/data.json`;
		new Setting(containerEl).setDesc(
			t("API keys are stored unencrypted in this vault's {path}. Don't sync that file to untrusted locations.", { path: dataPath }),
		);

		new Setting(containerEl).setName(t("AI entry points")).setHeading();

		new Setting(containerEl)
			.setName(t("Show AI commands in the command palette"))
			.addToggle((tg) => {
				tg.setValue(ai.showCommands);
				tg.onChange(async (value) => {
					ai.showCommands = value;
					await save();
				});
			});

		new Setting(containerEl)
			.setName(t("Show AI button in the editor toolbar"))
			.setDesc(t("Applies the next time the editor opens."))
			.addToggle((tg) => {
				tg.setValue(ai.showToolbarButton);
				tg.onChange(async (value) => {
					ai.showToolbarButton = value;
					await save();
				});
			});

		new Setting(containerEl)
			.setName(t("Generate from images dropped or pasted onto the canvas"))
			.setDesc(t("Applies the next time the editor opens."))
			.addToggle((tg) => {
				tg.setValue(ai.enableImageDrop);
				tg.onChange(async (value) => {
					ai.enableImageDrop = value;
					await save();
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
		const setting = new Setting(containerEl).setName(t(name));
		if (desc) setting.setDesc(t(desc));
		setting.addText((text) => {
			text.inputEl.type = "password";
			text.setPlaceholder(t("sk-…"));
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
			.setName(t("Model"))
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
