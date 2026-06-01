// src/server/config/translationLoader.ts

// OLD TRANSLATION LOADER - DELETE ONCE FULLY MIGRATED

/**
 * Handles loading and sanitizing translation TOML files.
 */

import fs from 'fs';
import path from 'path';
import { parse } from 'smol-toml';
import { fileURLToPath } from 'node:url';
import { FilterXSS, IFilterXSSOptions } from 'xss';

import tconfig from './translationconfig.js';

// Types ---------------------------------------------------------------------

/** All translations for every single language. */
type Translations = Record<string, LanguageTranslations>;
/** All translations for a single language. */
type LanguageTranslations = { default: Record<string, any> };

// Constants -----------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** The folder path containing translation TOML files. */
const translationsFolder = path.join(__dirname, '../../../translation');

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

// Functions -----------------------------------------------------------------

/** Loads and processes all translation TOML files into one object. */
function loadTranslations(): Translations {
	const translations: Translations = {};

	const tomlFiles = fs.readdirSync(translationsFolder).filter((f) => f.endsWith('.toml'));

	tomlFiles.forEach((file) => {
		const languageCode = file.replace('.toml', '');
		const tomlPath = path.join(translationsFolder, file);
		const toml = fs.readFileSync(tomlPath).toString(); // Load
		const toml_parsed = parse(toml); // Parse
		const toml_sanitized = html_escape(toml_parsed); // Sanitize

		translations[languageCode] = { default: toml_sanitized };
	});

	// Deep-merge the English (fallback) translations into every other language so that
	// missing nested keys are always present. i18next's fallbackLng only handles leaf-key
	// lookups; when a Nunjucks template calls t('some.section', { returnObjects: true }) it
	// receives the language's partial object with no further fallback for missing sub-trees.
	const englishTranslations = translations[tconfig.DEFAULT_LANGUAGE]!.default;
	for (const [languageCode, languageTranslations] of Object.entries(translations)) {
		if (languageCode === tconfig.DEFAULT_LANGUAGE) continue;
		translations[languageCode] = {
			default: deepMerge(englishTranslations, languageTranslations.default),
		};
	}

	return translations;
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

// Exports -------------------------------------------------------------------

export default {
	loadTranslations,
};
