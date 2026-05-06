// src/server/config/componentTranslationLoader.ts

/**
 * Loads and serves per-component translation TOML files for the new SSR system.
 *
 * Files live under translation/<component>/<lang>.toml.
 * All components are loaded once at startup by loadComponentTranslations().
 * Use getComponentTranslation() and getClientTranslation() to retrieve them per request.
 *
 * The [client] sub-table (if present) is excluded from the server-side object —
 * it is injected into the page separately via getClientTranslation().
 */

import fs from 'fs';
import path from 'path';
import { parse } from 'smol-toml';
import { fileURLToPath } from 'node:url';
import { FilterXSS, IFilterXSSOptions } from 'xss';

import { DEFAULT_LANGUAGE } from '../utility/translate.js';

// Types ---------------------------------------------------------------------

/**
 * Stores all component translations at runtime.
 * Map key: component name (e.g. "header").
 * Value: map from language code to a ComponentEntry.
 */
type ComponentStore = Map<string, Map<string, ComponentEntry>>;

/** A single component's translations for one language. */
type ComponentEntry = {
	/** The TOML object with [client] removed — used by SSR templates. */
	server: Record<string, any>;
	/** The [client] sub-table of the TOML, or {} if not present — served to browser JS. */
	client: Record<string, any>;
};

// Constants -----------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** The folder path containing translation TOML files. */
export const TRANSLATION_FOLDER = path.join(__dirname, '../../../translation');

/** Module-level store populated once by loadComponentTranslations(). */
let componentStore: ComponentStore | null = null;

const xss_options: IFilterXSSOptions = {
	// Allows using these html tags in translation key strings for formatting.
	whiteList: {
		em: [],
		strong: [],
		b: [],
		i: [],
		br: [],
	},
};
const custom_xss = new FilterXSS(xss_options);

// Loading Translations ------------------------------------------------------------

/**
 * Loads all component translation TOML files from translation/<component>/<lang>.toml
 * and stores them in the module-level componentStore.
 * Call once at server startup (from i18n.ts).
 */
export function loadComponentTranslations(): void {
	const store: ComponentStore = new Map();
	/** Helper to load and parse a TOML file with XSS sanitization. */
	const parseToml = (filePath: string): Record<string, any> =>
		html_escape(parse(fs.readFileSync(filePath, 'utf-8')));

	const componentDirs = fs
		.readdirSync(TRANSLATION_FOLDER, { withFileTypes: true })
		.filter((e) => e.isDirectory() && e.name !== 'news')
		.map((e) => e.name);

	for (const componentName of componentDirs) {
		const componentDir = path.join(TRANSLATION_FOLDER, componentName);
		const tomlFiles = fs.readdirSync(componentDir).filter((f) => f.endsWith('.toml'));

		// Throw error if English TOML missing
		if (!tomlFiles.includes(`${DEFAULT_LANGUAGE}.toml`))
			throw new Error(`Component "${componentName}" is missing the English source.`);

		const englishRaw = parseToml(path.join(componentDir, `${DEFAULT_LANGUAGE}.toml`));
		const englishServerObj = withoutClientTable(englishRaw);
		const englishClientObj = englishRaw['client'] ?? {};

		const langMap = new Map<string, ComponentEntry>();
		langMap.set(DEFAULT_LANGUAGE, { server: englishServerObj, client: englishClientObj });

		for (const file of tomlFiles) {
			const langCode = file.replace('.toml', '');
			if (langCode === DEFAULT_LANGUAGE) continue;
			const raw = parseToml(path.join(componentDir, file));
			const serverObj = withoutClientTable(raw);
			const clientObj = (raw['client'] ?? {}) as Record<string, any>;
			// Deep-merge English fallback so missing keys are always present
			langMap.set(langCode, {
				server: deepMerge(englishServerObj, serverObj),
				client: deepMerge(englishClientObj, clientObj),
			});
		}

		store.set(componentName, langMap);
	}

	componentStore = store;
}

/**
 * Returns the server-side translation object for a component in the requested language.
 * Falls back to English if the language is not available.
 * @param component - The component name, e.g. "header"
 * @param lang - The language code, e.g. "de-DE"
 */
export function getComponentTranslation(component: string, lang: string): Record<string, any> {
	if (!componentStore) throw new Error('loadComponentTranslations() has not been called yet.');
	const langMap = componentStore.get(component);
	if (!langMap) throw new Error(`No translation component "${component}" found.`);
	return (langMap.get(lang) ?? langMap.get(DEFAULT_LANGUAGE))?.server ?? {};
}

/**
 * Returns the [client] sub-table of a component for the requested language, promoted one
 * level up (i.e. the keys of [client] become the top-level keys of the returned object).
 * Returns an empty object if the component has no [client] section.
 * @param component - The component name, e.g. "leaderboard"
 * @param lang - The language code, e.g. "de-DE"
 */
function getClientTranslation(component: string, lang: string): Record<string, any> {
	if (!componentStore) throw new Error('loadComponentTranslations() has not been called yet.');
	const langMap = componentStore.get(component);
	if (!langMap) throw new Error(`No translation component "${component}" found.`);
	return (langMap.get(lang) ?? langMap.get(DEFAULT_LANGUAGE))?.client ?? {};
}

// Utility ---------------------------------------------------------------------

/**
 * Deep-merges `source` into `target`, returning a new object.
 * Keys present in `source` but absent in `target` are copied from `source` (English fallback).
 * Keys present in both are recursively merged when both values are plain objects;
 * otherwise the `target` value takes precedence.
 */
function deepMerge(source: Record<string, any>, target: Record<string, any>): Record<string, any> {
	const result: Record<string, any> = { ...source };
	for (const [key, targetValue] of Object.entries(target)) {
		const sourceValue = result[key];
		if (
			targetValue !== null &&
			typeof targetValue === 'object' &&
			!Array.isArray(targetValue) &&
			sourceValue !== null &&
			typeof sourceValue === 'object' &&
			!Array.isArray(sourceValue)
		) {
			result[key] = deepMerge(sourceValue, targetValue);
		} else {
			result[key] = targetValue;
		}
	}
	return result;
}

/**
 * Recursively traverses a data structure (array or object) and sanitizes all contained
 * strings using an XSS filter. This prevents malicious content from translation files
 * from being rendered in a user's browser.
 * @param value - The input value (e.g., the parsed content of a TOML file).
 * @returns A deep copy of the input with all string values sanitized.
 */
function html_escape(value: any): any {
	if (Array.isArray(value)) {
		const escaped = [];
		for (const member of value) {
			escaped.push(html_escape(member));
		}
		return escaped;
	}
	if (value !== null && typeof value === 'object') {
		const escaped: Record<any, any> = {};
		for (const [valueKey, valueValue] of Object.entries(value)) {
			escaped[valueKey] = html_escape(valueValue);
		}
		return escaped;
	}
	if (typeof value === 'string') {
		return custom_xss.process(value);
	}
	return value; // numbers, booleans, etc.
}

/** Returns a shallow copy of a parsed TOML object with the top-level [client] key removed. */
function withoutClientTable(parsed: Record<string, any>): Record<string, any> {
	const { client: _omit, ...rest } = parsed;
	return rest;
}
