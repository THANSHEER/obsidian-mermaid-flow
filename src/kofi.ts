/** Ko-fi tip jar — used in settings and as the manifest fundingUrl. */
export const KOFI_ID = "P0R02009G7";
export const KOFI_URL = `https://ko-fi.com/${KOFI_ID}`;

/**
 * Opens the Ko-fi page in the active window.
 */
export function openKofi(): void {
	activeWindow.open(KOFI_URL, "_blank");
}

