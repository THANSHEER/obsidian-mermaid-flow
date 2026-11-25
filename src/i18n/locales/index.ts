/*
 * Central locale registry.
 *
 * Adding a new language only requires:
 * 1. Creating a dictionary file in `src/i18n/locales/<locale>.ts`
 * 2. Adding an entry to `LOCALE_REGISTRY` below
 *
 * Types, Obsidian language detection, settings options, validation,
 * and i18n tests/checks all derive from this registry automatically.
 */

import type { Dictionary } from "../types";
import { zhCN } from "./zh-cn";

export interface LocaleDefinition {
	/** Native language name shown in the Settings dropdown (e.g. "中文", "日本語"). */
	label: string;
	/** Lowercase Obsidian language codes/prefixes that map to this locale. */
	aliases: readonly string[];
	/** Translation dictionary keyed by English source strings. */
	dictionary: Dictionary;
}

export const LOCALE_REGISTRY = {
	"zh-cn": {
		label: "中文",
		aliases: ["zh"],
		dictionary: zhCN,
	},
} as const satisfies Record<string, LocaleDefinition>;
