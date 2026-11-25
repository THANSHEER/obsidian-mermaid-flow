/*
 * Localization types.
 *
 * `Locale` lists the locales that ship dictionaries. `LanguagePreference` is
 * what the user picks in settings: a fixed locale, or `auto` to follow the
 * Obsidian app language.
 */

import type { LOCALE_REGISTRY } from "./locales";

/** Locales with a bundled dictionary in `LOCALE_REGISTRY`. */
export type BundledLocale = keyof typeof LOCALE_REGISTRY;

/** All supported UI locales (`"en"` is the built-in source language). */
export type Locale = "en" | BundledLocale;

/** Settings value: follow Obsidian, or force one of the bundled locales. */
export type LanguagePreference = "auto" | Locale;

/** Values substituted into `{placeholder}` slots. */
export type Vars = Record<string, string | number>;

/** A dictionary keyed by the English source string. */
export type Dictionary = Record<string, string>;
