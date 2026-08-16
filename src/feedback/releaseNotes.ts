import { requestUrl } from "obsidian";
import { GITHUB_REPO } from "./constants";

export interface ReleaseNotes {
	version: string;
	name: string;
	body: string;
	htmlUrl: string;
}

function normalizeTag(version: string): string {
	return version.startsWith("v") ? version : `v${version}`;
}

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
 * Load GitHub release notes for `version` (tries tag `vX` then `X`, then latest).
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
