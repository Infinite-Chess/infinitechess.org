// src/server/config/dateLocales.ts

import type { Locale } from 'date-fns';

import enUS from 'date-fns/locale/en-US/index.js';
import de from 'date-fns/locale/de/index.js';
import fr from 'date-fns/locale/fr/index.js';
import ptBR from 'date-fns/locale/pt-BR/index.js';
import zhTW from 'date-fns/locale/zh-TW/index.js';
import zhCN from 'date-fns/locale/zh-CN/index.js';
import pl from 'date-fns/locale/pl/index.js';
import es from 'date-fns/locale/es/index.js';
import el from 'date-fns/locale/el/index.js';
import ja from 'date-fns/locale/ja/index.js';
import ru from 'date-fns/locale/ru/index.js';
import it from 'date-fns/locale/it/index.js';
import arSA from 'date-fns/locale/ar-SA/index.js';
import hi from 'date-fns/locale/hi/index.js';
import ko from 'date-fns/locale/ko/index.js';
import tr from 'date-fns/locale/tr/index.js';
import fi from 'date-fns/locale/fi/index.js';

type LocaleEntry = {
	/** The date-fns locale object */
	locale: Locale;
	/** The English name of the language */
	name: string;
};

/** Maps i18n language codes to date-fns locales and their english names */
export const localeMap: Record<string, LocaleEntry> = {
	'en-US': { locale: enUS, name: 'English' },
	'es-ES': { locale: es, name: 'Spanish' },
	'fr-FR': { locale: fr, name: 'French' },
	'pl-PL': { locale: pl, name: 'Polish' },
	'pt-BR': { locale: ptBR, name: 'Portuguese' },
	'zh-CN': { locale: zhCN, name: 'Simplified Chinese' },
	'zh-TW': { locale: zhTW, name: 'Traditional Chinese' },
	'de-DE': { locale: de, name: 'German' },
	'el-GR': { locale: el, name: 'Greek' },
	'ja-JP': { locale: ja, name: 'Japanese' },
	'ru-RU': { locale: ru, name: 'Russian' },
	'it-IT': { locale: it, name: 'Italian' },
	'ar-SA': { locale: arSA, name: 'Arabic' },
	'hi-IN': { locale: hi, name: 'Hindi' },
	'ko-KR': { locale: ko, name: 'Korean' },
	'tr-TR': { locale: tr, name: 'Turkish' },
	'fi-FI': { locale: fi, name: 'Finnish' },
};
