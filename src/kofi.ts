/** Ko-fi tip jar — used in settings and as the manifest fundingUrl. */
export const KOFI_ID = "P0R02009G7";
export const KOFI_URL = `https://ko-fi.com/${KOFI_ID}`;

/**
 * Opens the Ko-fi page in the active window.
 */
export function openKofi(): void {
	activeWindow.open(KOFI_URL, "_blank");
}

/**
 * Mounts a button that opens the Ko-fi support page.
 *
 * @param host - The element in which to place the support button
 */
export function mountKofiWidget(host: HTMLElement): void {
	host.empty();
	const btn = host.createEl("button", {
		text: "Support on Ko-fi",
		cls: "mod-cta mermaid-flow-kofi-fallback",
	});
	btn.addEventListener("click", () => openKofi());
}

