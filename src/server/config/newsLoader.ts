// src/server/config/newsLoader.ts

import fs from 'fs';
import path from 'path';
import { marked } from 'marked';
import { format, parseISO } from 'date-fns';

import { localeMap } from './dateLocales.js';
import { DEFAULT_LANGUAGE } from '../utility/translate.js';
import { TRANSLATION_FOLDER } from './componentTranslationLoader.js';

/** The folder path containing news markdown files for various languages. */
const newsFolder = path.join(TRANSLATION_FOLDER, 'news');
/** The folder path containing English markdown news posts. */
const englishNewsFolder = path.join(newsFolder, DEFAULT_LANGUAGE);

/**
 * Loads news posts from markdown files into an object.
 * @param supportedLanguages - A list of all languages with a TOML file.
 * @returns An object mapping language codes to their compiled news HTML.
 */
export function loadNews(supportedLanguages: string[]): Record<string, string> {
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
