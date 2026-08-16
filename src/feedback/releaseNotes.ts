import { requestUrl } from "obsidian";
import { GITHUB_REPO } from "./constants";

export interface ReleaseNotes {
	version: string;
	name: string;
	body: string;
	htmlUrl: string;
}

/**
 * Ensures a version string starts with the `v` prefix.
 *
 * @param version - The version string to normalize
 * @returns The version string with a leading `v`
 */
function normalizeTag(version: string): string {
	return version.startsWith("v") ? version : `v${version}`;
}

/**
 * Fetches release data from a GitHub API endpoint.
 *
 * @param url - The GitHub API endpoint to request
 * @returns The parsed response data for a successful request, or `null` if the request fails
 */
async function fetchReleaseJson(url: string): Promise<Record<string, unknown> | null> {
	try {
		const res = await requestUrl({
			url,
			method: "GET",
			headers: {
				Accept: "application/vnd.github+json",
				"User-Agent": "obsidian-mermaid-flow",
			},
			throw: false,
		});
		if (res.status < 200 || res.status >= 300) return null;
		return res.json as Record<string, unknown>;
	} catch {
		return null;
	}
}

/**
 * Converts GitHub release data into normalized release notes.
 *
 * @param json - The release data to parse
 * @param fallbackVersion - The version to use when the release has no tag
 * @returns Release notes with fallback values for missing metadata
 */
function parseRelease(
	json: Record<string, unknown>,
	fallbackVersion: string,
): ReleaseNotes {
	const tag = typeof json.tag_name === "string" ? json.tag_name : fallbackVersion;
	const name = typeof json.name === "string" && json.name.trim() ? json.name : tag;
	const body =
		typeof json.body === "string" && json.body.trim()
			? json.body.trim()
			: "No release notes were published for this version.";
	const htmlUrl =
		typeof json.html_url === "string"
			? json.html_url
			: `https://github.com/${GITHUB_REPO}/releases`;
	return { version: tag.replace(/^v/, ""), name, body, htmlUrl };
}

/**
 * Loads GitHub release notes for a version.
 *
 * @param version - The release version to look up
 * @returns The matching release notes, the latest release notes, or fallback release information
 */
export async function fetchReleaseNotes(version: string): Promise<ReleaseNotes> {
	const base = `https://api.github.com/repos/${GITHUB_REPO}/releases`;
	const tagged =
		(await fetchReleaseJson(`${base}/tags/${normalizeTag(version)}`)) ??
		(await fetchReleaseJson(`${base}/tags/${version}`));
	if (tagged) return parseRelease(tagged, version);

	const latest = await fetchReleaseJson(`${base}/latest`);
	if (latest) return parseRelease(latest, version);

	return {
		version,
		name: `v${version}`,
		body: `Mermaid Flow was updated to ${version}. Release notes could not be loaded right now.`,
		htmlUrl: `https://github.com/${GITHUB_REPO}/releases`,
	};
}
