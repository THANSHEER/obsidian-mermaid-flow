/*
 * Localization types.
 *
 * `Locale` lists the locales that ship dictionaries. `LanguagePreference` is
 * what the user picks in settings: a fixed locale, or `auto` to follow the
 * Obsidian app language.
 */

/** Locales with a bundled dictionary. */
export type Locale = "en" | "zh-cn";

/** Settings value: follow Obsidian, or force one of the bundled locales. */
export type LanguagePreference = "auto" | Locale;

/** Values substituted into `{placeholder}` slots. */
export type Vars = Record<string, string | number>;

/** A dictionary keyed by the English source string. */
export type Dictionary = Record<string, string>;
