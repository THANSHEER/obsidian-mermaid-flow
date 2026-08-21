// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { planVersionAction } from "../src/feedback/version";
import { runVersionLifecycle } from "../src/feedback/lifecycle";
import { WelcomeModal } from "../src/feedback/welcomeModal";
import { ChangelogModal } from "../src/feedback/changelogModal";
import { renderAppLogo } from "../src/logo";

describe("planVersionAction", () => {
	it("records version on first run", () => {
		expect(planVersionAction(null, "1.8.0")).toBe("record");
		expect(planVersionAction(undefined, "1.8.0")).toBe("record");
		expect(planVersionAction("", "1.8.0")).toBe("record");
	});

	it("opens update when the version changed", () => {
		expect(planVersionAction("1.7.1", "1.8.0")).toBe("update");
	});

	it("is a no-op when versions match", () => {
		expect(planVersionAction("1.8.0", "1.8.0")).toBe("noop");
	});
});

describe("renderAppLogo", () => {
	it("renders an SVG with the specified size", () => {
		const parent = document.createElement("div");
		const wrap = renderAppLogo(parent, 64);
		expect(wrap).not.toBeNull();
		expect(wrap.className).toBe("mermaid-flow-app-logo");
		const svg = wrap.querySelector("svg");
		expect(svg).not.toBeNull();
		expect(svg?.getAttribute("width")).toBe("64");
		expect(svg?.getAttribute("height")).toBe("64");
	});
});

describe("WelcomeModal", () => {
	it("renders app logo, title, features, and action buttons onOpen", () => {
		const pluginMock: any = {
			app: {},
			editOrInsert: vi.fn(),
		};
		const modal = new WelcomeModal({} as any, pluginMock);
		modal.open();

		expect(modal.modalEl.classList.contains("mermaid-flow-welcome-modal")).toBe(true);
		expect(modal.contentEl.querySelector(".mermaid-flow-app-logo")).not.toBeNull();
		expect(modal.contentEl.querySelector(".mermaid-flow-modal-title")?.textContent).toBe("Welcome to Mermaid Flow");
		expect(modal.contentEl.querySelectorAll(".mermaid-flow-welcome-feature").length).toBe(4);
	});
});

describe("ChangelogModal", () => {
	it("renders app logo, version heading, and changelog highlights onOpen", () => {
		const pluginMock: any = {
			app: {},
			manifest: { version: "1.8.0" },
		};
		const modal = new ChangelogModal({} as any, pluginMock, "1.8.0", "1.7.1");
		modal.open();

		expect(modal.modalEl.classList.contains("mermaid-flow-changelog-modal")).toBe(true);
		expect(modal.contentEl.querySelector(".mermaid-flow-app-logo")).not.toBeNull();
		expect(modal.contentEl.querySelector(".mermaid-flow-modal-title")?.textContent).toContain("1.8.0");
		expect(modal.contentEl.querySelector(".mermaid-flow-changelog-content")).not.toBeNull();
	});
});

describe("runVersionLifecycle", () => {
	it("opens WelcomeModal and updates lastSeenVersion on first run", async () => {
		const saveSettings = vi.fn().mockResolvedValue(undefined);
		const pluginMock: any = {
			app: {},
			manifest: { version: "1.8.0" },
			settings: { lastSeenVersion: null },
			saveSettings,
		};

		await runVersionLifecycle(pluginMock);
		expect(pluginMock.settings.lastSeenVersion).toBe("1.8.0");
		expect(saveSettings).toHaveBeenCalledTimes(1);
	});

	it("opens ChangelogModal and updates lastSeenVersion on version change", async () => {
		const saveSettings = vi.fn().mockResolvedValue(undefined);
		const pluginMock: any = {
			app: {},
			manifest: { version: "1.8.0" },
			settings: { lastSeenVersion: "1.7.1" },
			saveSettings,
		};

		await runVersionLifecycle(pluginMock);
		expect(pluginMock.settings.lastSeenVersion).toBe("1.8.0");
		expect(saveSettings).toHaveBeenCalledTimes(1);
	});

	it("does nothing when versions match", async () => {
		const saveSettings = vi.fn().mockResolvedValue(undefined);
		const pluginMock: any = {
			app: {},
			manifest: { version: "1.8.0" },
			settings: { lastSeenVersion: "1.8.0" },
			saveSettings,
		};

		await runVersionLifecycle(pluginMock);
		expect(saveSettings).not.toHaveBeenCalled();
	});
});
