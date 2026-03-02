// build/views.ts

/**
 * Generates static HTML views from EJS templates and translation files.
 */

import fs from 'fs';
import path from 'path';
import i18next from 'i18next';
import ejs, { Data } from 'ejs';
import { fileURLToPath } from 'node:url';

import editorutil from '../src/shared/editor/editorutil.js';

import translationLoader from '../src/server/config/translationLoader.js';
import { DEFAULT_LANGUAGE } from '../src/server/utility/translate.js';
import { UNCERTAIN_LEADERBOARD_RD } from '../src/server/game/gamemanager/ratingcalculation.js';

// Constants -----------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Templates without any external data other than translations.
 * Don't insert names with file extensions.
 */
const staticTranslatedTemplates = [
	'createaccount',
	'credits',
	'guide',
	'index',
	'login',
	'member',
	'news',
	'leaderboard',
	'play',
	'termsofservice',
	'resetpassword',
	'admin',
	'errors/400',
	'errors/401',
	'errors/404',
	'errors/409',
	'errors/500',
];

// Functions -----------------------------------------------------------------

/** Generates translated versions of templates in {@link staticTranslatedTemplates}. */
export async function buildViews(): Promise<void> {
	// Load data
	const translations = translationLoader.loadTranslations();
	// Grab supported languages from the loaded translations
	const supportedLanguages = Object.keys(translations);
	const news = translationLoader.loadNews(supportedLanguages);

	// Initialize i18next for the build process so the 't' function works during render
	await i18next.init({
		resources: translations,
		defaultNS: 'default',
		fallbackLng: DEFAULT_LANGUAGE,
		// debug: true, // Enable debug mode to see logs for missing keys and other details
	});

	const languages_list = Object.entries(translations).map(
		([languageCode, languageTranslations]) => ({
			code: languageCode,
			name: languageTranslations.default['name'] as string,
			englishName: languageTranslations.default['english_name'] as string,
		}),
	);

	const templatesPath = path.join(__dirname, '../dist/client/views');

	for (const languageCode of Object.keys(translations)) {
		// Specific ejsOptions for rendering this language
		const ejsData: Data = {
			// Function for translations
			t: function (key: string, options: Record<string, any> = {}) {
				options['lng'] = languageCode; // Make sure language is correct
				return i18next.t(key, options);
			},
			languages: languages_list,
			language: languageCode,

			distfolder: path.join(__dirname, '../dist'),
			viewsfolder: templatesPath,

			// Inject the news HTML
			newsHTML: news[languageCode],

			// Custom included variables
			ratingDeviationUncertaintyThreshold: UNCERTAIN_LEADERBOARD_RD,
			editorPositionNameMaxLength: editorutil.POSITION_NAME_MAX_LENGTH,
		};

		// The output directory for this language's rendered templates
		const renderDirectory = path.join(templatesPath, languageCode);

		// Render each of this language's static translated templates
		for (const template of staticTranslatedTemplates) {
			const templatePath = path.join(templatesPath, template + '.ejs');
			const templateFile = fs.readFileSync(templatePath).toString();

			const renderedPath = path.join(renderDirectory, template + '.html');
			const renderedFile = ejs.render(templateFile, ejsData); // Render the file

			fs.mkdirSync(path.dirname(renderedPath), { recursive: true }); // Ensure directory exists
			fs.writeFileSync(renderedPath, renderedFile); // Write the rendered file
		}
	}
}
