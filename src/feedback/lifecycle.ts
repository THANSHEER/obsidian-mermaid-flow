import type MermaidFlowPlugin from "../main";
import { planVersionAction } from "./version";
import { WelcomeModal } from "./welcomeModal";
import { ChangelogModal } from "./changelogModal";

export { planVersionAction } from "./version";
export { WelcomeModal } from "./welcomeModal";
export { ChangelogModal } from "./changelogModal";

/**
 * Handles version lifecycle events on startup:
 * - Shows the Welcome modal on fresh installation.
 * - Shows the Changelog modal when the plugin version is updated.
 * - Persists the current version in settings.
 *
 * @param plugin - The plugin instance
 */
export async function runVersionLifecycle(plugin: MermaidFlowPlugin): Promise<void> {
	const current = plugin.manifest.version;
	const last = plugin.settings.lastSeenVersion;
	const action = planVersionAction(last, current);

	if (action === "noop") return;

	if (action === "record") {
		new WelcomeModal(plugin.app, plugin).open();
	} else if (action === "update") {
		new ChangelogModal(plugin.app, plugin, current, last ?? undefined).open();
	}

	plugin.settings.lastSeenVersion = current;
	await plugin.saveSettings();
}
