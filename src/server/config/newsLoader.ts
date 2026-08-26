// src/server/config/newsLoader.ts

/**
 * Compiles the markdown news posts into per-language HTML.
 *
 * DORMANT — nothing imports this. It is the EJS-era news renderer, kept for the loading logic
 * worth repurposing: the date-sorted file walk, the per-language fallback to English, and the
 * locale-aware date format. Revisit when the redesigned news page lands, at which point:
 *  - the HTML string building below must go — markup belongs in a `.njk` template, not a script,
 *  - and what stays returns post DATA for the template to render, not a joined HTML blob.
 */

import fs from 'fs';
import path from 'path';
import { marked } from 'marked';
import { format, parseISO } from 'date-fns';

import tconfig from './translationconfig.js';

/** The folder path containing English markdown news posts. */
const englishNewsFolder = path.join(tconfig.NEWS_FOLDER, tconfig.DEFAULT_LANGUAGE);

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
				const fullPath = path.join(tconfig.NEWS_FOLDER, languageCode, fileName);

				// Read news post (fallback to default language)
				const content = fs.existsSync(fullPath)
					? fs.readFileSync(fullPath)
					: fs.readFileSync(path.join(englishNewsFolder, fileName));
				// Compile markdown to HTML
				const parsedHTML = marked.parse(content.toString());

				// Date Formatting
				const dateISO = fileName.replace('.md', ''); // YYYY-MM-DD
				const locale = tconfig.getDateLocale(languageCode);
				const date = format(parseISO(dateISO), 'PP', { locale });

				return `<div class='news-post' data-date='${dateISO}'>
							<span class='news-post-date'>${date}</span>
							<div class='news-post-markdown'>${parsedHTML}</div>
						</div>`;
			})
			.join('\n<hr>\n');
	});

	return newsPosts;
}

// Exports ---------------------------------------------------------------------

export default { loadNews };
