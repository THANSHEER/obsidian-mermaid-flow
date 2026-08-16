/**
 * Determines the lifecycle action for the current version.
 *
 * @param lastSeenVersion - The previously stored version, if available
 * @param currentVersion - The current version
 * @returns `"record"` when no previous version exists, `"update"` when versions differ, or `"noop"` when they match
 */
export function planVersionAction(
	lastSeenVersion: string | null | undefined,
	currentVersion: string,
): "record" | "update" | "noop" {
	if (!lastSeenVersion) return "record";
	if (lastSeenVersion !== currentVersion) return "update";
	return "noop";
}
