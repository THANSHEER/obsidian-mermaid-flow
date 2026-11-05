/*
 * Runtime localization layer.
 *
 * Dictionary keys are the English source strings, so a string without an entry
 * renders in English. Diagram data, Mermaid output and AI prompts never pass
 * through here.
 */

import { getLanguage } from "obsidian";
import type { Dictionary, LanguagePreference, Locale, Vars } from "./types";
import { zhCN } from "./locales/zh-cn";

const DICTIONARIES: Partial<Record<Locale, Dictionary>> = {
	"zh-cn": zhCN,
};

let preference: LanguagePreference = "auto";
let cachedLocale: Locale | null = null;

export type { Dictionary, LanguagePreference, Locale, Vars } from "./types";

/** Map any Obsidian language code (`zh`, `zh-TW`, `en-GB`, ...) to a bundle. */
export function toLocale(code: string | null | undefined): Locale {
	const value = (code ?? "").toLowerCase();
	return value === "zh" || value.startsWith("zh-") ? "zh-cn" : "en";
}

function normalizePreference(value: unknown): LanguagePreference {
	return value === "en" || value === "zh-cn" || value === "auto" ? value : "auto";
}

function readObsidianLanguage(): string | null {
	// getLanguage() shipped in Obsidian 1.8.7 while minAppVersion is lower, so
	// probe before calling instead of raising the minimum app version.
	const api = getLanguage as unknown as (() => string) | undefined;
	try {
		const language = api?.();
		if (language) return language;
	} catch {
		/* not running inside Obsidian */
	}
	return null;
}

/** Active locale, resolved from the user preference or the app language. */
export function getLocale(): Locale {
	if (!cachedLocale) {
		const fallback = typeof navigator !== "undefined" ? navigator.language : "en";
		cachedLocale = preference === "auto" ? toLocale(readObsidianLanguage() ?? fallback) : preference;
	}
	return cachedLocale;
}

/** Set the user preference. `auto` follows the Obsidian language. */
export function setLocale(value: LanguagePreference): void {
	preference = normalizePreference(value);
	cachedLocale = null;
}

export function getLocalePreference(): LanguagePreference {
	return preference;
}

/**
 * Translate a UI string. Falls back to the English source when the active
 * locale has no entry, which keeps untranslated strings usable.
 *
 * Placeholders use `{name}` and are filled from `vars`.
 */
export function t(text: string, vars?: Vars): string {
	const dictionary = DICTIONARIES[getLocale()];
	let out = dictionary?.[text] ?? text;
	if (vars) {
		for (const [key, value] of Object.entries(vars)) {
			out = out.split(`{${key}}`).join(String(value));
		}
	}
	return out;
}
