import type MermaidFlowPlugin from "../main";
import { planVersionAction } from "./version";

export { planVersionAction } from "./version";

/**
 * Compare persisted lastSeenVersion to the running manifest version.
 * First run: record version only. Version bump: save silently.
 */
export async function runVersionLifecycle(plugin: MermaidFlowPlugin): Promise<void> {
	const current = plugin.manifest.version;
	const last = plugin.settings.lastSeenVersion;
	const action = planVersionAction(last, current);

	if (action === "noop") return;

	plugin.settings.lastSeenVersion = current;
	await plugin.saveSettings();
}
