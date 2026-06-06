/**
 * Vitest global setup — polyfills Obsidian globals that jsdom does not provide.
 *
 * Run before every test file via vitest.config.ts `setupFiles`.
 * Guards with `typeof document` so it is safe in the default node environment too.
 */

if (typeof document !== "undefined") {
	// activeDocument / activeWindow — Obsidian globals for popout-window support.
	// In tests there is only one window, so both equal the jsdom document/window.
	(globalThis as unknown as Record<string, unknown>).activeDocument = document;
	(globalThis as unknown as Record<string, unknown>).activeWindow = window;

	// Obsidian's HTMLElement helpers used by src/ at runtime.
	const proto = HTMLElement.prototype as HTMLElement & Record<string, unknown>;

	proto.createDiv = function (o?: { cls?: string; text?: string }) {
		const d = document.createElement("div");
		if (o?.cls) d.className = o.cls;
		if (o?.text) d.textContent = o.text;
		this.appendChild(d);
		return d;
	};

	proto.createEl = function <K extends keyof HTMLElementTagNameMap>(
		tag: K,
		o?: { cls?: string; text?: string; attr?: Record<string, string> },
	) {
		const el = document.createElement(tag);
		if (o?.cls) el.className = o.cls;
		if (o?.text) el.textContent = o.text;
		if (o?.attr) Object.entries(o.attr).forEach(([k, v]) => el.setAttribute(k, v));
		this.appendChild(el);
		return el;
	};

	proto.addClass = function (cls: string) {
		this.classList.add(cls);
	};

	proto.removeClass = function (cls: string) {
		this.classList.remove(cls);
	};

	proto.empty = function () {
		this.innerHTML = "";
	};
}
