// src/server/config/translationLoader.ts

import fs from 'fs';
import path from 'path';
import { parse } from 'smol-toml';
import { FilterXSS, IFilterXSSOptions } from 'xss';
import { marked } from 'marked';
import { format, parseISO } from 'date-fns';

import { localeMap } from './dateLocales.js';
import { getDefaultLanguage, setSupportedLanguages } from '../utility/translate.js';

const xss_options: IFilterXSSOptions = {
	whiteList: {
		// a: ["href", "target"],
		b: [],
		strong: [],
		i: [],
		em: [],
		mark: [],
		small: [],
		del: [],
		ins: [],
		sub: [],
		sup: [],
	},
	onTagAttr: function (_tag: string, _name: string, _value: string, _isWhiteAttr: boolean): void {
		/*if (!isWhiteAttr && !(value === 'href' && name === 'a')) {
	  console.warn(
		`Atribute "${name}" of "${tag}" tag with value "${value.trim()}" failed to pass XSS filter. `,
	  );
	}*/
	},
	// IT OKAY THIS IS COMMENTED OUT??
	// safeAttrValue: function (_tag: string, _name: string, _value: string): string {
	/*if (
	  tag === "a" &&
		name === "href" &&
		link_white_list.includes(value.trim())
	) {
	  return value;
	} else if (name === "href") {
	  console.warn(
		`Atribute "${name}" of "${tag}" tag with value "${value.trim()}" failed to pass XSS filter. `,
	  );
	}*/
	// },
};
const custom_xss = new FilterXSS(xss_options);

/**
 * Recursively traverses a data structure (array or object) and sanitizes all contained
 * strings using an XSS filter. This prevents malicious content from translation files
 * from being rendered in a user's browser.
 *
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
 */
function remove_key(key_string: string, object: Record<string, any>): Record<string, any> {
	const keys = key_string.split('.');

	let currentObj = object;
	for (let i = 0; i < keys.length - 1; i++) {
		if (currentObj[keys[i]!]) {
			currentObj = currentObj[keys[i]!];
		}
	}

	if (currentObj[keys.at(-1)!]) {
		delete currentObj[keys.at(-1)!];
	}
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
	const filtered_keys = Object.keys(changelog).filter(function x(y) {
		return version < parseInt(y);
	});

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

export function loadTranslations(folder: string): Record<string, any> {
	const resources: Record<string, any> = {};
	const files = fs.readdirSync(folder);
	const changelog = JSON.parse(fs.readFileSync(path.join(folder, 'changes.json')).toString());
	const supportedLanguages: string[] = [];

	files
		.filter((x) => x.endsWith('.toml'))
		.forEach((file) => {
			const languageCode = file.replace('.toml', '');

			// Load, Parse, Version, and Sanitize
			resources[languageCode] = {
				default: html_escape(
					removeOutdated(
						parse(fs.readFileSync(path.join(folder, file)).toString()),
						changelog,
					),
				),
			};
			supportedLanguages.push(languageCode);
		});

	// This side effect is preserved from your original code
	setSupportedLanguages(supportedLanguages);

	return resources;
}

export function loadNews(folder: string): Record<string, string> {
	const newsResources: Record<string, string> = {};
	const files = fs.readdirSync(folder); // We use the file list to determine valid language codes

	// Get the sorted list of news posts (using default language as source of truth)
	const newsFiles = fs
		.readdirSync(path.join(folder, 'news', getDefaultLanguage()))
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
					const fullPath = path.join(folder, 'news', languageCode, filePath);

					// Read file (with fallback to default language)
					const content = fs.existsSync(fullPath)
						? fs.readFileSync(fullPath)
						: fs.readFileSync(
								path.join(folder, 'news', getDefaultLanguage(), filePath),
							);

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
