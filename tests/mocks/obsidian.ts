/**
 * Mock Obsidian module for Vitest test execution.
 */

export class App {}

export class PluginSettingTab {
	app: App;
	plugin: unknown;
	constructor(app: App, plugin: unknown) {
		this.app = app;
		this.plugin = plugin;
	}
}

export class Setting {
	settingEl = typeof document !== "undefined" ? document.createElement("div") : null;
	infoEl = typeof document !== "undefined" ? document.createElement("div") : null;
	nameEl = typeof document !== "undefined" ? document.createElement("div") : null;
	descEl = typeof document !== "undefined" ? document.createElement("div") : null;
	controlEl = typeof document !== "undefined" ? document.createElement("div") : null;

	setName() { return this; }
	setDesc() { return this; }
	setHeading() { return this; }
	addToggle(cb: any) {
		cb({
			setValue: () => this,
			onChange: () => this,
		});
		return this;
	}
	addText(cb: any) {
		cb({
			setValue: () => this,
			setPlaceholder: () => this,
			onChange: () => this,
		});
		return this;
	}
	addDropdown(cb: any) {
		cb({
			addOption: () => this,
			setValue: () => this,
			onChange: () => this,
		});
		return this;
	}
	addButton(cb: any) {
		cb({
			setButtonText: () => this,
			setCta: () => this,
			setDisabled: () => this,
			onClick: () => this,
		});
		return this;
	}
}

export class Modal {
	app: App;
	scope: unknown;
	containerEl = typeof document !== "undefined" ? document.createElement("div") : null;
	modalEl = typeof document !== "undefined" ? document.createElement("div") : null;
	contentEl = typeof document !== "undefined" ? document.createElement("div") : null;
	titleEl = typeof document !== "undefined" ? document.createElement("div") : null;

	constructor(app: App) {
		this.app = app;
		if (typeof document !== "undefined") {
			this.containerEl = document.createElement("div");
			this.modalEl = document.createElement("div");
			this.contentEl = document.createElement("div");
			this.titleEl = document.createElement("div");
			this.modalEl.appendChild(this.titleEl);
			this.modalEl.appendChild(this.contentEl);
			this.containerEl.appendChild(this.modalEl);
		}
	}

	open(): void {
		(this as any).onOpen?.();
	}

	close(): void {
		(this as any).onClose?.();
	}
}

export class Notice {
	constructor(public message: string) {}
}

export const Platform = {
	isDesktopApp: true,
	isDesktop: true,
	isMobile: false,
	isMacOS: true,
};

export const requestUrl = async () => ({ status: 200, json: async () => ({}) });
export const setIcon = () => {};
