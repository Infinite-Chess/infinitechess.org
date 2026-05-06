// src/server/config/translationLoader.ts

/**
 * LEGACY — loads the monolithic per-language TOML files from translation/*.toml
 * into i18next for use by old server routes and socket message translations.
 *
 * This file will be deleted once all pages have been migrated to the new
 * component-based system in componentTranslationLoader.ts.
 */

import fs from 'fs';
import path from 'path';
import { parse } from 'smol-toml';
import { marked } from 'marked';
import { fileURLToPath } from 'node:url';
import { format, parseISO } from 'date-fns';

import { localeMap } from './dateLocales.js';
import { DEFAULT_LANGUAGE } from '../utility/translate.js';
import { deepMerge, html_escape } from './componentTranslationLoader.js';

// Types ---------------------------------------------------------------------

/** All translations for every single language. */
type Translations = Record<string, LanguageTranslations>;
/** All translations for a single language. */
type LanguageTranslations = { default: Record<string, any> };

// Constants -----------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** The folder path containing translation TOML files. */
const translationsFolder = path.join(__dirname, '../../../translation');

/** The folder path containing news markdown files for various languages. */
const newsFolder = path.join(translationsFolder, 'news');
/** The folder path containing English markdown news posts. */
const englishNewsFolder = path.join(newsFolder, DEFAULT_LANGUAGE);

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
	const englishTranslations = translations[DEFAULT_LANGUAGE]!.default;
	for (const [languageCode, languageTranslations] of Object.entries(translations)) {
		if (languageCode === DEFAULT_LANGUAGE) continue;
		translations[languageCode] = {
			default: deepMerge(englishTranslations, languageTranslations.default),
		};
	}

	return translations;
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

// Exports -------------------------------------------------------------------

export default {
	loadTranslations,
	loadNews,
};
