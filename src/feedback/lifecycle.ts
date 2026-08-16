import type MermaidFlowPlugin from "../main";
import { planVersionAction } from "./version";

export { planVersionAction } from "./version";

/**
 * Records the current manifest version when it differs from the persisted last-seen version.
 *
 * @param plugin - The plugin whose version state is updated and saved
 */
export async function runVersionLifecycle(plugin: MermaidFlowPlugin): Promise<void> {
	const current = plugin.manifest.version;
	const last = plugin.settings.lastSeenVersion;
	const action = planVersionAction(last, current);

	if (action === "noop") return;

	plugin.settings.lastSeenVersion = current;
	await plugin.saveSettings();
}
