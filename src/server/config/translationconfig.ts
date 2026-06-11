// src/server/config/translationconfig.ts

import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Constants -----------------------------------------------------

/** The default/fallback language code. */
const DEFAULT_LANGUAGE = 'en-US' as const;

/** The folder path containing translation TOML files. */
const TRANSLATION_FOLDER = path.join(__dirname, '../../../translation');

/** The folder path containing news markdown files. */
const NEWS_FOLDER = path.join(TRANSLATION_FOLDER, 'news');

/** Non-component subdirectories of TRANSLATION_FOLDER to ignore (e.g. "news"). */
const EXCLUDED_DIRS = ['news'];

/**
 * Static display metadata for many known languages, keyed by language code.
 * `name` is the autonym (the language's name written in itself); `englishName` is its English exonym.
 *
 * Used to render the language-selector dropdown, which lists every language regardless of the
 * page's current language. The *supported* subset (codes with at least one component TOML) comes
 * from getSupportedLanguages() — every supported code must have an entry here.
 */
const LANGUAGE_METADATA: Record<string, { name: string; englishName: string }> = {
	'de-DE': { name: 'Deutsch', englishName: 'German' },
	'el-GR': { name: 'Ελληνικά', englishName: 'Greek' },
	'en-US': { name: 'English', englishName: 'English' },
	'es-ES': { name: 'Español', englishName: 'Spanish' },
	'fi-FI': { name: 'Suomi', englishName: 'Finnish' },
	'fr-FR': { name: 'Français', englishName: 'French' },
	'pl-PL': { name: 'Polski', englishName: 'Polish' },
	'pt-BR': { name: 'Português', englishName: 'Portuguese' },
	'ru-RU': { name: 'Русский', englishName: 'Russian' },
	'zh-CN': { name: '简体中文', englishName: 'Simplified Chinese' },
	'zh-TW': { name: '繁體中文', englishName: 'Traditional Chinese' },
};

// Exports --------------------------------------------------------

export default {
	DEFAULT_LANGUAGE,
	TRANSLATION_FOLDER,
	NEWS_FOLDER,
	EXCLUDED_DIRS,
	LANGUAGE_METADATA,
};
