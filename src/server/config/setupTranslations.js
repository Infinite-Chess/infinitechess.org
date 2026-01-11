// src/server/config/setupTranslations.js

import i18next from 'i18next';
import { parse } from 'smol-toml';
import fs from 'fs';
import path from 'path';
import ejs from 'ejs';
import middleware from 'i18next-http-middleware';
import { FilterXSS } from 'xss';
import { getDefaultLanguage, setSupportedLanguages } from '../utility/translate.js';
import { marked } from 'marked';
import { format, parseISO } from 'date-fns';

import { fileURLToPath } from 'node:url';
import { UNCERTAIN_LEADERBOARD_RD } from '../game/gamemanager/ratingcalculation.js';
import { localeMap } from './dateLocales.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const translationsFolder = './translation';

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
	'errors/400',
	'errors/401',
	'errors/404',
	'errors/409',
	'errors/500',
];

const xss_options = {
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
	onTagAttr: function (_tag, _name, _value, _isWhiteAttr) {
		/*if (!isWhiteAttr && !(value === 'href' && name === 'a')) {
	  console.warn(
		`Atribute "${name}" of "${tag}" tag with value "${value.trim()}" failed to pass XSS filter. `,
	  );
	}*/
	},
	safeAttrValue: function (_tag, _name, _value) {
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
	},
};
const custom_xss = new FilterXSS(xss_options);

// Variables ----------------------------------------------------------------------

/** Translations object containing all loaded translations. */
let translations;

// Functions ----------------------------------------------------------------------

function html_escape_array(array) {
	const escaped = [];
	for (const member of array) {
		escaped.push(html_escape(member));
	}
	return escaped;
}

function html_escape_object(object) {
	const escaped = {};
	for (const key of Object.keys(object)) {
		escaped[key] = html_escape(object[key]);
	}
	return escaped;
}

/**
 Function to iterate over arrays and objects and html escape strings
 */
function html_escape(value) {
	switch (typeof value) {
		case 'object':
			if (value.constructor.name === 'Object') {
				return html_escape_object(value);
			} else if (value.constructor.name === 'Array') {
				return html_escape_array(value);
			} else {
				throw 'Unhandled object type while escaping';
			}
		case 'string':
			return custom_xss.process(value); // Html escape strings
		case 'number':
			return value;
		default:
			throw 'Unhandled type while escaping';
	}
}

/**
 * Removes keys from `object` based on string of format 'foo.bar'.
 * @param {string} key_string - String representing key that has to be deleted in format 'foo.bar'.
 * @param {Object} object - Object that is target of the removal.
 * @returns {Object} Copy of `object` with deleted values
 */
function remove_key(key_string, object) {
	const keys = key_string.split('.');

	let currentObj = object;
	for (let i = 0; i < keys.length - 1; i++) {
		if (currentObj[keys[i]]) {
			currentObj = currentObj[keys[i]];
		}
	}

	if (currentObj[keys.at(-1)]) {
		delete currentObj[keys.at(-1)];
	}
	return object;
}

/**
 * Removes outdated translations.
 * @param {object} Object of translations.
 * @param {changelog} `changes.json` file.
 * @returns
 */
function removeOutdated(object, changelog) {
	const version = object.version;
	// Filter out versions that are older than version of current language
	const filtered_keys = Object.keys(changelog).filter(function x(y) {
		return version < parseInt(y);
	});

	let key_strings = [];
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

function loadTranslationsFolder(folder) {
	const resources = {};
	const files = fs.readdirSync(folder);
	const changelog = JSON.parse(fs.readFileSync(path.join(folder, 'changes.json')).toString());
	const supportedLanguages = [];
	// Filtering out '.DS_Store' is required because sometimes on the machine running the website, that mac inserts a .DS_Store file in the news directory.
	const newsFiles = fs
		.readdirSync(path.join(folder, 'news', getDefaultLanguage()))
		.filter((n) => n !== '.DS_Store')
		.sort((a, b) => {
			const dateA = new Date(a.replace('.md', ''));
			const dateB = new Date(b.replace('.md', ''));
			return dateB - dateA;
		}); // ['2024-09-11.md', '2024-08-01.md'...]
	files
		.filter(function y(x) {
			return x.endsWith('.toml');
		})
		.forEach((file) => {
			const languageCode = file.replace('.toml', '');
			resources[languageCode] = {
				default: html_escape(
					removeOutdated(
						parse(fs.readFileSync(path.join(folder, file)).toString()),
						changelog,
					),
				),
				news: newsFiles
					.map((filePath) => {
						const fullPath = path.join(folder, 'news', languageCode, filePath);
						const parsedHTML = marked.parse(
							(fs.existsSync(fullPath)
								? fs.readFileSync(fullPath)
								: fs.readFileSync(
										path.join(folder, 'news', getDefaultLanguage(), filePath),
									)
							).toString(),
						); // parsedHTML should be safe to be rendered
						const dateISO = filePath.replace('.md', ''); // Store the ISO date (YYYY-MM-DD)
						const date = format(parseISO(dateISO), 'PP', {
							// Change the number of P's to change how the date is phrased
							timeZone: 'UTC-6',
							locale: localeMap[languageCode].locale,
						});

						return `<div class='news-post' data-date='${dateISO}'>
                                <span class='news-post-date'>${date}</span>
                                <div class='news-post-markdown'>${parsedHTML}</div>
                            </div>`;
					})
					.join('\n<hr>\n'),
			};
			supportedLanguages.push(languageCode); // Add language to list of supportedLanguages
		});

	setSupportedLanguages(supportedLanguages);

	return resources;
}

/**
 * Creates file or directory if it doesn't exist
 * @param {filePath} Path to create.
 */
function createFileOrDir(filePath) {
	if (!fs.existsSync(filePath)) {
		if (path.extname(filePath) === '') {
			fs.mkdirSync(filePath, { recursive: true });
		} else {
			const dirPath = path.dirname(filePath);
			if (!fs.existsSync(dirPath)) {
				fs.mkdirSync(dirPath, { recursive: true });
			}
			fs.writeFileSync(filePath, '');
		}
	}
}

/**
 * Initializes i18next, loads languages from .toml files, saves translated versions of templates.
 * **Should be ran only once**.
 *
 * DOES NOT translate static templates automatically, since that should not be done during integration tests.
 */
function initTranslations() {
	translations = loadTranslationsFolder(translationsFolder);

	i18next.use(middleware.LanguageDetector).init({
		// debug: true,
		preload: Object.keys(translations), // List of languages to preload to make sure they are loaded before rendering views
		resources: translations,
		defaultNS: 'default',
		fallbackLng: getDefaultLanguage(),
		// debug: true // Enable debug mode to see logs for missing keys and other details
	});
}

/**
 * Generates translated versions of templates in staticTranslatedTemplates
 */
function translateStaticTemplates() {
	if (!translations) throw new Error('Translations have not been initialized yet.');

	const languages = Object.keys(translations);

	const languages_list = languages.map((language) => {
		const name = translations[language].default.name;
		const englishName = localeMap[language].name;
		if (!englishName)
			throw new Error(
				`English name not found for language code: ${language} Name: ${translations[language].default.name}`,
			);
		return { code: language, name, englishName };
	});

	const templatesPath = path.join(__dirname, '../../client/views');
	for (const language of languages) {
		for (const template of staticTranslatedTemplates) {
			createFileOrDir(path.join(templatesPath, language, template + '.html')); // Make sure it exists
			fs.writeFileSync(
				path.join(templatesPath, language, template + '.html'),
				ejs.render(
					// Read EJS template
					fs.readFileSync(path.join(templatesPath, template + '.ejs')).toString(),
					{
						// Function for translations
						t: function (key, options = {}) {
							options.lng = language; // Make sure language is correct
							return i18next.t(key, options);
						},
						languages: languages_list,
						language: language,
						newsHTML: translations[language].news,
						distfolder: path.join(__dirname, '../..'), // '/workspaces/infinitechess.org/dist'
						viewsfolder: path.join(__dirname, '../../client/views'), // '/workspaces/infinitechess.org/dist/client/views'

						// Custom included variables
						ratingDeviationUncertaintyThreshold: UNCERTAIN_LEADERBOARD_RD,
					},
				),
			);
		}
	}
}

export { initTranslations, translateStaticTemplates };
