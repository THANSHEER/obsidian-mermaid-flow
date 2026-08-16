/** Pure helper for tests — decide lifecycle action without touching Obsidian. */
export function planVersionAction(
	lastSeenVersion: string | null | undefined,
	currentVersion: string,
): "record" | "update" | "noop" {
	if (!lastSeenVersion) return "record";
	if (lastSeenVersion !== currentVersion) return "update";
	return "noop";
}
