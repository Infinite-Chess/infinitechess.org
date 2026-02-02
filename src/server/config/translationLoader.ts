// src/server/config/translationLoader.ts

/**
 * Handles loading and sanitizing translation TOML files.
 */

import fs from 'fs';
import path from 'path';
import * as z from 'zod';
import { parse, TomlTable } from 'smol-toml';
import { FilterXSS, IFilterXSSOptions } from 'xss';
import { marked } from 'marked';
import { fileURLToPath } from 'node:url';
import { format, parseISO } from 'date-fns';

import { localeMap } from './dateLocales.js';
import { DEFAULT_LANGUAGE } from '../utility/translate.js';

// Types ---------------------------------------------------------------------

/** All translations for every single language. */
type Translations = Record<string, LanguageTranslations>;
/** All translations for a single language. */
type LanguageTranslations = { default: Record<string, any> };

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

/** The folder path containing news markdown files for various languages. */
const newsFolder = path.join(translationsFolder, 'news');
/** The folder path containing English markdown news posts. */
const englishNewsFolder = path.join(newsFolder, DEFAULT_LANGUAGE);

const xss_options: IFilterXSSOptions = { whiteList: {} };
const custom_xss = new FilterXSS(xss_options);

// Functions -----------------------------------------------------------------

/** Loads and processes all translation TOML files into one object. */
function loadTranslations(): Translations {
	const translations: Translations = {};

	const tomlFiles = fs.readdirSync(translationsFolder).filter((f) => f.endsWith('.toml'));
	const changelog = loadChangelog();

	tomlFiles.forEach((file) => {
		const languageCode = file.replace('.toml', '');
		const tomlPath = path.join(translationsFolder, file);
		const toml = fs.readFileSync(tomlPath).toString(); // Load
		const toml_parsed = parse(toml); // Parse
		const toml_updated = removeOutdated(toml_parsed, changelog); // Version
		const toml_sanitized = html_escape(toml_updated); // Sanitize

		translations[languageCode] = { default: toml_sanitized };
	});

	return translations;
}

/** Loads the English TOML changelog file into an object. */
function loadChangelog(): Changelog {
	const changelogRaw = fs.readFileSync(changesFile).toString();
	const changelogParsed = JSON.parse(changelogRaw);
	return changelogSchema.parse(changelogParsed);
}

/**
 * Loads news posts from markdown files into an object.
 * @param supportedLanguages - A list of all languages with a TOML file.
 * @returns An object mapping language codes to their compiled news HTML.
 */
function loadNews(supportedLanguages: string[]): Record<string, string> {
	const newsPosts: Record<string, string> = {};

	/** Sorted English news posts filenames */
	const englishNewsPosts = fs
		.readdirSync(englishNewsFolder)
		.filter((n) => n !== '.DS_Store') // Hidden macOS file
		.sort((a, b) => {
			const dateA = new Date(a.replace('.md', ''));
			const dateB = new Date(b.replace('.md', ''));
			return dateB.getTime() - dateA.getTime();
		});

	supportedLanguages.forEach((languageCode) => {
		// Generate News posts HTML for this language
		newsPosts[languageCode] = englishNewsPosts
			.map((fileName) => {
				const fullPath = path.join(newsFolder, languageCode, fileName);

				// Read news post (fallback to default language)
				const content = fs.existsSync(fullPath)
					? fs.readFileSync(fullPath)
					: fs.readFileSync(path.join(englishNewsFolder, fileName));
				// Compile markdown to HTML
				const parsedHTML = marked.parse(content.toString());

				// Date Formatting
				const dateISO = fileName.replace('.md', ''); // YYYY-MM-DD
				const date = format(parseISO(dateISO), 'PP', { locale: localeMap[languageCode] });

				return `<div class='news-post' data-date='${dateISO}'>
							<span class='news-post-date'>${date}</span>
							<div class='news-post-markdown'>${parsedHTML}</div>
						</div>`;
			})
			.join('\n<hr>\n');
	});

	return newsPosts;
}

/** Removes outdated translations from one language's toml object, according to the changelog. */
function removeOutdated(object: TomlTable, changelog: Changelog): TomlTable {
	const version = object['version'] as string;
	// Filter out versions that are older than version of current language
	const filtered_entries = Object.entries(changelog).filter(
		([change]) => Number(version) < Number(change),
	);

	// Collect all keys to be removed
	let key_strings: string[] = [];
	for (const [, value] of filtered_entries) {
		if (value.changes === undefined) continue;
		key_strings = key_strings.concat(value.changes);
	}
	key_strings = [...new Set(key_strings)]; // Remove duplicates

	let object_copy = object;
	for (const key_string of key_strings) {
		object_copy = remove_key(key_string, object_copy);
	}

	return object_copy;
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
	loadNews,
};
