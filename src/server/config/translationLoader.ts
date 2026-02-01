// src/server/config/translationLoader.ts

/**
 * Handles loading and sanitizing translation TOML files.
 */

import fs from 'fs';
import path from 'path';
import * as z from 'zod';
import { parse } from 'smol-toml';
import { FilterXSS, IFilterXSSOptions } from 'xss';
import { marked } from 'marked';
import { fileURLToPath } from 'node:url';
import { format, parseISO } from 'date-fns';

import { localeMap } from './dateLocales.js';
import { getDefaultLanguage, setSupportedLanguages } from '../utility/translate.js';

// Types ---------------------------------------------------------------------

const changelogSchema = z.record(
	z.string().refine((val) => Number.isInteger(Number(val)), {
		message: 'Key must be an integer string',
	}),
	z.object({
		// note: ,
		note: z.union([
			z.string().min(1, 'Note cannot be empty'),
			z.array(z.string().min(1, 'Note cannot be empty')).min(1, 'Note cannot be empty'),
		]),
		changes: z.array(z.string()).optional(),
	}),
);
type Changelog = z.infer<typeof changelogSchema>;

// Constants -----------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** The folder path containing translation TOML files. */
const translationsFolder = path.join(__dirname, '../../../translation');
/** The changelog file path for tracking the English TOML version changes. */
const changesFile = path.join(translationsFolder, 'changes.json');

const xss_options: IFilterXSSOptions = { whiteList: {} };
const custom_xss = new FilterXSS(xss_options);

// Functions -----------------------------------------------------------------

/**
 * Recursively traverses a data structure (array or object) and sanitizes all contained
 * strings using an XSS filter. This prevents malicious content from translation files
 * from being rendered in a user's browser.
 * @param value - The input value (e.g., the parsed content of a TOML file).
 * @returns A deep copy of the input with all string values sanitized.
 */
function html_escape(value: unknown): unknown {
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

/**
 * Removes keys from `object` based on string of format 'foo.bar'.
 * @param key_string - String representing key that has to be deleted in format 'foo.bar'.
 * @param object - Object that is target of the removal.
 * @returns Copy of `object` with deleted values
 * @example
 * const obj = { foo: { bar: 42, baz: 100 }, qux: 7 };
 * const result = remove_key('foo.bar', obj); // { foo: { baz: 100 }, qux: 7 }
 */
function remove_key(key_string: string, object: Record<string, any>): Record<string, any> {
	const keys = key_string.split('.');

	let currentObj = object;
	for (let i = 0; i < keys.length - 1; i++) {
		if (currentObj[keys[i]!] !== undefined) currentObj = currentObj[keys[i]!];
	}

	if (currentObj[keys.at(-1)!] !== undefined) delete currentObj[keys.at(-1)!];
	return object;
}

/**
 * Removes outdated translations.
 * @param object - Object of translations.
 * @param changelog - `changes.json` file.
 * @returns Object with outdated translations removed.
 */
function removeOutdated(
	object: Record<string, any>,
	changelog: Record<string, any>,
): Record<string, any> {
	const version = object['version'];
	// Filter out versions that are older than version of current language
	const filtered_keys = Object.keys(changelog).filter((c) => version < Number(c));

	let key_strings: string[] = [];
	for (const key of filtered_keys) {
		key_strings = key_strings.concat(changelog[key].changes);
	}
	// Remove duplicate
	key_strings = Array.from(new Set(key_strings));

	let object_copy = object;
	for (const key_string of key_strings) {
		object_copy = remove_key(key_string, object_copy);
	}

	return object_copy;
}

/** Loads and processes all translation TOML files into one object. */
function loadTranslations(): Record<string, any> {
	const translations: Record<string, any> = {};
	const tomlFiles = fs.readdirSync(translationsFolder).filter((f) => f.endsWith('.toml'));
	const changelog = loadChangelog();
	const supportedLanguages: string[] = [];

	tomlFiles.forEach((file) => {
		const languageCode = file.replace('.toml', '');
		const tomlPath = path.join(translationsFolder, file);
		const toml = fs.readFileSync(tomlPath).toString(); // Load
		const toml_parsed = parse(toml); // Parse
		const toml_updated = removeOutdated(toml_parsed, changelog); // Version
		const toml_sanitized = html_escape(toml_updated); // Sanitize

		translations[languageCode] = toml_sanitized;
		supportedLanguages.push(languageCode);
	});

	setSupportedLanguages(supportedLanguages);

	return translations;
}

/** Loads the English TOML changelog file into an object. */
function loadChangelog(): Changelog {
	const changelogRaw = fs.readFileSync(changesFile).toString();
	const changelogParsed = JSON.parse(changelogRaw);
	return changelogSchema.parse(changelogParsed);
}

/** Loads news posts from markdown files into an object. */
function loadNews(): Record<string, string> {
	const newsResources: Record<string, string> = {};
	const files = fs.readdirSync(translationsFolder); // We use the file list to determine valid language codes

	// Get the sorted list of news posts (using default language as source of truth)
	const newsFiles = fs
		.readdirSync(path.join(translationsFolder, 'news', getDefaultLanguage()))
		.filter((n) => n !== '.DS_Store')
		.sort((a, b) => {
			const dateA = new Date(a.replace('.md', ''));
			const dateB = new Date(b.replace('.md', ''));
			// @ts-ignore - Date arithmetic works in JS/TS
			return dateB - dateA;
		});

	files
		.filter((x) => x.endsWith('.toml'))
		.forEach((file) => {
			const languageCode = file.replace('.toml', '');

			// Generate HTML for this language
			const newsHTML = newsFiles
				.map((filePath) => {
					const fullPath = path.join(translationsFolder, 'news', languageCode, filePath);

					// Read file (with fallback to default language)
					const content = fs.existsSync(fullPath)
						? fs.readFileSync(fullPath)
						: fs.readFileSync(
								path.join(
									translationsFolder,
									'news',
									getDefaultLanguage(),
									filePath,
								),
							);

					// Compile markdown to HTML
					const parsedHTML = marked.parse(content.toString());
					const dateISO = filePath.replace('.md', ''); // YYYY-MM-DD

					// Date Formatting
					const date = format(parseISO(dateISO), 'PP', {
						locale: localeMap[languageCode],
					});

					return `<div class='news-post' data-date='${dateISO}'>
							<span class='news-post-date'>${date}</span>
							<div class='news-post-markdown'>${parsedHTML}</div>
						</div>`;
				})
				.join('\n<hr>\n');

			newsResources[languageCode] = newsHTML;
		});

	return newsResources;
}

// Exports -------------------------------------------------------------------

export default {
	loadTranslations,
	loadNews,
};
