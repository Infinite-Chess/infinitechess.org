// src/server/config/translationconfig.ts

/**
 * Where the translation and news files live, which language is the source of truth,
 * and each supported language's date-fns locale.
 *
 * Pure configuration — the loaders that read it are `translationLoader.ts` (legacy)
 * and `componentTranslationLoader.ts` (current). See docs/systems/TRANSLATIONS.md.
 */

import type { Locale } from 'date-fns';

import de from 'date-fns/locale/de/index.js';
import el from 'date-fns/locale/el/index.js';
import es from 'date-fns/locale/es/index.js';
import fi from 'date-fns/locale/fi/index.js';
import fr from 'date-fns/locale/fr/index.js';
import pl from 'date-fns/locale/pl/index.js';
import ru from 'date-fns/locale/ru/index.js';
import path from 'path';
import enUS from 'date-fns/locale/en-US/index.js';
import ptBR from 'date-fns/locale/pt-BR/index.js';
import zhCN from 'date-fns/locale/zh-CN/index.js';
import zhTW from 'date-fns/locale/zh-TW/index.js';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Constants -------------------------------------------------------------------

/** The default/fallback language code. */
const DEFAULT_LANGUAGE = 'en-US' as const;

/** The folder path containing translation TOML files. */
const TRANSLATION_FOLDER = path.join(__dirname, '../../../translation');

/** The folder path containing news markdown files. */
const NEWS_FOLDER = path.join(TRANSLATION_FOLDER, 'news');

/** Non-component subdirectories of TRANSLATION_FOLDER to ignore (e.g. "news"). */
const EXCLUDED_DIRS = ['news'];

/**
 * Static metadata for many known languages, keyed by language code.
 * `name` is the autonym (the language's name written in itself); `englishName` is its English exonym;
 * `dateLocale` is the date-fns locale used to format dates/relative times for that language.
 *
 * Used to render the language-selector dropdown, which lists every language regardless of the
 * page's current language. The *supported* subset (codes with at least one component TOML) comes
 * from getSupportedLanguages() — every supported code must have an entry here.
 */
const LANGUAGE_METADATA: Record<string, { name: string; englishName: string; dateLocale: Locale }> =
	{
		'de-DE': { name: 'Deutsch', englishName: 'German', dateLocale: de },
		'el-GR': { name: 'Ελληνικά', englishName: 'Greek', dateLocale: el },
		'en-US': { name: 'English', englishName: 'English', dateLocale: enUS },
		'es-ES': { name: 'Español', englishName: 'Spanish', dateLocale: es },
		'fi-FI': { name: 'Suomi', englishName: 'Finnish', dateLocale: fi },
		'fr-FR': { name: 'Français', englishName: 'French', dateLocale: fr },
		'pl-PL': { name: 'Polski', englishName: 'Polish', dateLocale: pl },
		'pt-BR': { name: 'Português', englishName: 'Portuguese', dateLocale: ptBR },
		'ru-RU': { name: 'Русский', englishName: 'Russian', dateLocale: ru },
		'zh-CN': { name: '简体中文', englishName: 'Simplified Chinese', dateLocale: zhCN },
		'zh-TW': { name: '繁體中文', englishName: 'Traditional Chinese', dateLocale: zhTW },
	};

/** Resolves a language code to its date-fns locale. */
function getDateLocale(lang: string): Locale {
	// Fallback to English in case for some reason their resolved language isn't supported (bug)
	return LANGUAGE_METADATA[lang]?.dateLocale ?? enUS;
}

// Exports ---------------------------------------------------------------------

export default {
	DEFAULT_LANGUAGE,
	TRANSLATION_FOLDER,
	NEWS_FOLDER,
	EXCLUDED_DIRS,
	LANGUAGE_METADATA,
	getDateLocale,
};
