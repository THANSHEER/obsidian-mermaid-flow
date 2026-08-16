/** Ko-fi tip jar — used in settings and as the manifest fundingUrl. */
export const KOFI_ID = "P0R02009G7";
export const KOFI_URL = `https://ko-fi.com/${KOFI_ID}`;
export const KOFI_WIDGET_SCRIPT =
	"https://storage.ko-fi.com/cdn/widget/Widget_2.js";

interface KofiWidget2 {
	init: (text: string, color: string, id: string) => void;
	draw: () => void;
}

/** Avoid calling draw() on every settings re-render (AI toggles, etc.). */
let widgetDrawn = false;

function getKofiApi(): KofiWidget2 | undefined {
	return (activeWindow as Window & { kofiwidget2?: KofiWidget2 }).kofiwidget2;
}

function openKofi(): void {
	activeWindow.open(KOFI_URL);
}

function mountFallbackLink(host: HTMLElement): void {
	host.empty();
	const btn = host.createEl("button", {
		text: "Support me on Ko-fi",
		cls: "mod-cta mermaid-flow-kofi-fallback",
	});
	btn.addEventListener("click", () => openKofi());
}

function drawInto(host: HTMLElement): void {
	const api = getKofiApi();
	if (!api || widgetDrawn) {
		mountFallbackLink(host);
		return;
	}

	api.init("Support me on Ko-fi", "#000000", KOFI_ID);

	const body = activeDocument.body;
	const before = new Set(Array.from(body.children));
	api.draw();
	widgetDrawn = true;

	let moved = false;
	for (const child of Array.from(body.children)) {
		if (before.has(child)) continue;
		host.appendChild(child);
		moved = true;
	}

	if (!moved) mountFallbackLink(host);
}

/**
 * Load Ko-fi Widget_2 into `parent` (settings). Falls back to a button that
 * opens the Ko-fi page if the remote script fails (CSP / offline / mobile).
 */
export function mountKofiWidget(parent: HTMLElement): void {
	const host = parent.createDiv({ cls: "mermaid-flow-kofi-widget" });

	if (getKofiApi()) {
		drawInto(host);
		return;
	}

	const existing = activeDocument.querySelector<HTMLScriptElement>(
		`script[src="${KOFI_WIDGET_SCRIPT}"]`,
	);
	if (existing) {
		existing.addEventListener("load", () => drawInto(host));
		if (getKofiApi()) drawInto(host);
		return;
	}

	const script = activeDocument.createElement("script");
	script.src = KOFI_WIDGET_SCRIPT;
	script.async = true;
	script.addEventListener("load", () => drawInto(host));
	script.addEventListener("error", () => mountFallbackLink(host));
	activeDocument.head.appendChild(script);
}
