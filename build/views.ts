// build/views.ts

/**
 * Generates static HTML views from EJS templates and translation files.
 */

import i18next from 'i18next';
import fs from 'fs';
import path from 'path';
import ejs from 'ejs';
import { fileURLToPath } from 'node:url';

import editorutil from '../src/shared/editor/editorutil.js';
import translationLoader from '../src/server/config/translationLoader.js';
import { UNCERTAIN_LEADERBOARD_RD } from '../src/server/game/gamemanager/ratingcalculation.js';
import { getDefaultLanguage } from '../src/server/utility/translate.js';

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

/**
 * Generates translated versions of templates in staticTranslatedTemplates
 */
export async function buildViews(): Promise<void> {
	// 1. Load Data using the shared service
	const translations = translationLoader.loadTranslations();
	const news = translationLoader.loadNews();

	// 2. Initialize i18next locally so the 't' function works during render
	await i18next.init({
		resources: translations,
		defaultNS: 'default',
		fallbackLng: getDefaultLanguage(),
	});

	const language_codes = Object.keys(translations);

	const languages_list = language_codes.map((language_code) => {
		const name = translations[language_code].name;
		const englishName = translations[language_code].english_name;
		return { code: language_code, name, englishName };
	});

	// Adjusted path: relative to build/ folder
	const templatesPath = path.join(__dirname, '../dist/client/views');

	for (const language_code of language_codes) {
		for (const template of staticTranslatedTemplates) {
			const filePath = path.join(templatesPath, language_code, template + '.html');
			fs.mkdirSync(path.dirname(filePath), { recursive: true }); // Ensure directory exists

			fs.writeFileSync(
				filePath,
				ejs.render(
					// Read EJS template
					fs.readFileSync(path.join(templatesPath, template + '.ejs')).toString(),
					{
						// Function for translations
						t: function (key: string, options: any = {}) {
							options.lng = language_code; // Make sure language is correct
							return i18next.t(key, options);
						},
						languages: languages_list,
						language: language_code,

						// Inject the news HTML from the separate loader
						newsHTML: news[language_code],

						distfolder: path.join(__dirname, '../dist'),
						viewsfolder: templatesPath,

						// Custom included variables
						ratingDeviationUncertaintyThreshold: UNCERTAIN_LEADERBOARD_RD,
						editorPositionNameMaxLength: editorutil.POSITION_NAME_MAX_LENGTH,
					},
				),
			);
		}
	}
}
