// src/server/config/componentTranslationLoader.ts

/**
 * Loads and serves per-component translation TOML files for the new SSR system.
 *
 * Files live under translation/<component>/<lang>.toml.
 * All components are loaded once at startup by loadComponentTranslations().
 * Retrieve them per request.
 *
 * The [script] sub-table (if present) is excluded from the server-side template object —
 * it is injected into the page separately via getScriptTranslations(). Components
 * whose keys are entirely script-facing can opt in to the `script_only = true` shorthand
 * to skip the `script.` prefix on every subtable header.
 */

import type { Request } from 'express';
import type { CustomWebSocket } from '../socket/socketUtility.js';
import type { ScriptTranslations } from '../../shared/types/script-translations.js';

import fs from 'fs';
import path from 'path';
import { parse } from 'smol-toml';
import { WebSocket } from 'ws';
import { FilterXSS, IFilterXSSOptions } from 'xss';

import tconfig from './translationconfig.js';
import { getLanguageToServe } from '../middleware/resolveLanguage.js';

// Types ---------------------------------------------------------------------

/**
 * Stores all component translations at runtime.
 * Map key: component name (e.g. "header").
 * Value: map from language code to a ComponentEntry.
 */
type ComponentStore = Map<string, Map<string, ComponentEntry>>;

/** A single component's translations for one language. */
type ComponentEntry = {
	/** The TOML object with [script] removed — used by SSR templates. */
	template: Record<string, any>;
	/** The [script] sub-table of the TOML, or {} if not present — read by browser/server JS. */
	script: Record<string, any>;
};

// Constants -----------------------------------------------------------------

const englishTOMLName = `${tconfig.DEFAULT_LANGUAGE}.toml`;

const xss_options: IFilterXSSOptions = {
	// Allows using these html tags in translation key strings for formatting.
	whiteList: {
		em: [],
		strong: [],
		b: [],
		i: [],
		br: [],
		// accepts a `class` attribute so styling hooks like `.lc` (lowercase-glyph
		// opt-out from uppercase text-transform) survive sanitization.
		span: ['class'],
	},
};
const custom_xss = new FilterXSS(xss_options);

/**
 * Pseudo-localization debug flag. When `true`, every translated string
 * is wrapped in ⟦…⟧ brackets at load time. Anything still showing plain
 * English in the page is hardcoded and was missed by the translation pass.
 */
const PSEUDO_LOC = false;

// State ---------------------------------------------------------------------

/** Module-level store. */
let componentStore: ComponentStore | null = null;

// Loading Translations ------------------------------------------------------------

/**
 * Loads all component translation TOML files from translation/<component>/<lang>.toml
 * and stores them in the module-level componentStore.
 * @returns The supported-language list: the union of every language present in any component.
 */
export function loadComponentTranslations(): string[] {
	componentStore = new Map();

	const componentDirs = getComponentNames();

	for (const componentName of componentDirs) {
		const componentDir = path.join(tconfig.TRANSLATION_FOLDER, componentName);
		const tomlFiles = fs.readdirSync(componentDir).filter((f) => f.endsWith('.toml'));

		// Throw error if English TOML missing
		if (!tomlFiles.includes(englishTOMLName))
			throw new Error(`Component "${componentName}" is missing the English source.`);

		const englishRaw = parseToml(path.join(componentDir, englishTOMLName));

		const { template: englishTemplateObj, script: englishScriptObj } = splitParsed(englishRaw);

		const langMap = new Map<string, ComponentEntry>();
		langMap.set(tconfig.DEFAULT_LANGUAGE, {
			template: englishTemplateObj,
			script: englishScriptObj,
		});

		for (const file of tomlFiles) {
			const langCode = file.replace('.toml', '');
			if (langCode === tconfig.DEFAULT_LANGUAGE) continue; // Already loaded English
			const raw = parseToml(path.join(componentDir, file));
			const { template: templateObj, script: scriptObj } = splitParsed(raw);
			// Deep-merge English fallback so missing keys are always present
			langMap.set(langCode, {
				template: deepMerge(englishTemplateObj, templateObj),
				script: deepMerge(englishScriptObj, scriptObj),
			});
		}

		componentStore.set(componentName, langMap);
	}

	// Compute the supported-language list once:
	// the union of every language present in any component.
	const langs = new Set<string>();
	for (const langMap of componentStore.values()) {
		for (const lang of langMap.keys()) langs.add(lang);
	}
	return [...langs];
}

/**
 * Returns the template translation object for a component in the requested language.
 * Falls back to English if the language is not available.
 * @param component - The component name, e.g. "header"
 * @param lang - The language code, e.g. "de-DE"
 */
export function getTemplateTranslations(component: string, lang: string): Record<string, any> {
	if (!componentStore) throw new Error('loadComponentTranslations() has not been called yet.');
	const langMap = componentStore.get(component);
	if (!langMap) throw new Error(`No translation component "${component}" found.`);
	return (langMap.get(lang) ?? langMap.get(tconfig.DEFAULT_LANGUAGE))?.template ?? {};
}

/**
 * Returns the [script] sub-table of a component for the requested language, promoted one
 * level up (i.e. the keys of [script] become the top-level keys of the returned object).
 * Returns an empty object if the component has no [script] section.
 * @param component - The component name, e.g. "leaderboard"
 * @param lang - The language code, e.g. "de-DE"
 */
export function getScriptTranslations<C extends keyof ScriptTranslations>(
	component: C,
	lang: string,
): ScriptTranslations[C] {
	if (!componentStore) throw new Error('loadComponentTranslations() has not been called yet.');
	const langMap = componentStore.get(component);
	if (!langMap) throw new Error(`No translation component "${component}" found.`);
	return ((langMap.get(lang) ?? langMap.get(tconfig.DEFAULT_LANGUAGE))?.script ??
		{}) as ScriptTranslations[C];
}

/**
 * Same as {@link getScriptTranslations}, but resolves the language from an Express request
 * or a WebSocket connection. Convenience for runtime-emitted server strings where
 * the caller has a req/ws rather than a pre-resolved language code.
 */
export function getScriptTranslationsForReq<C extends keyof ScriptTranslations>(
	component: C,
	reqOrWs: Request | CustomWebSocket,
): ScriptTranslations[C] {
	const lang =
		(reqOrWs instanceof WebSocket
			? reqOrWs.metadata.cookies.i18next
			: getLanguageToServe(reqOrWs)) ?? tconfig.DEFAULT_LANGUAGE;
	return getScriptTranslations(component, lang);
}

// Utility ---------------------------------------------------------------------

/** Returns the filtered list of component names from the translation folder. */
export function getComponentNames(): string[] {
	return fs
		.readdirSync(tconfig.TRANSLATION_FOLDER, { withFileTypes: true })
		.filter((e) => e.isDirectory() && !tconfig.EXCLUDED_DIRS.includes(e.name))
		.map((e) => e.name)
		.sort();
}

/** Helper to load and parse a TOML file with XSS sanitization. */
function parseToml(filePath: string): Record<string, any> {
	return html_escape(parse(fs.readFileSync(filePath, 'utf-8')));
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
		const sanitized = custom_xss.process(value);
		return PSEUDO_LOC ? `⟦${sanitized}⟧` : sanitized;
	}
	return value; // numbers, booleans, etc.
}

/**
 * Splits a parsed TOML object into `{ template, script }` halves.
 *
 * Two modes:
 * - `script_only = true` shorthand: the entire object (minus the flag itself) is treated
 *   as the script half. The template half is empty. Lets authors of fully script-facing
 *   components skip prefixing every subtable header with `script.`.
 * - Otherwise: the `[script]` subtable becomes the script half, everything else is template.
 */
function splitParsed(parsed: Record<string, any>): {
	template: Record<string, any>;
	script: Record<string, any>;
} {
	if (parsed['script_only'] === true) {
		const { script_only: _flag, ...rest } = parsed;
		return { template: {}, script: rest };
	}
	const { script: scriptTable, ...rest } = parsed;
	return { template: rest, script: scriptTable ?? {} };
}

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
