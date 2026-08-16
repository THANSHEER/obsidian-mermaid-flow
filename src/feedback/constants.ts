/** Geekstash Forms API — product slug for Mermaid Flow. */
export const PRODUCT_SLUG = "mermaid-flow";

export const API_BASE = "https://api.geekstash.dev";

export const GITHUB_REPO = "THANSHEER/obsidian-mermaid-flow";

export const UNINSTALL_REASONS = [
	{
		value: "distracted",
		title: "Got in the way",
		description: "UI or workflow felt distracting",
	},
	{
		value: "feature",
		title: "Missing feature",
		description: "It's missing what I need",
	},
	{
		value: "performance",
		title: "Performance",
		description: "Felt slow or unstable",
	},
	{
		value: "alternative",
		title: "Found alternative",
		description: "Switched to another tool",
	},
] as const;

export type UninstallReasonCode = (typeof UNINSTALL_REASONS)[number]["value"];

export const FEEDBACK_TOPICS = [
	{ value: "settings", label: "General" },
	{ value: "update", label: "After update" },
	{ value: "ui", label: "Editor / UI" },
	{ value: "other", label: "Other" },
] as const;

export type FeedbackTopic = (typeof FEEDBACK_TOPICS)[number]["value"];

export function productUrl(
	action: "feedback" | "feature-requests" | "uninstall" | "install" | "bug-reports",
): string {
	return `${API_BASE}/products/${PRODUCT_SLUG}/${action}`;
}
