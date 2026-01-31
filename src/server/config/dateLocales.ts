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

/** Maps i18n language codes to date-fns locales. */
export const localeMap: Record<string, Locale> = {
	'en-US': enUS,
	'es-ES': es,
	'fr-FR': fr,
	'pl-PL': pl,
	'pt-BR': ptBR,
	'zh-CN': zhCN,
	'zh-TW': zhTW,
	'de-DE': de,
	'el-GR': el,
	'ru-RU': ru,
	'it-IT': it,
	'fi-FI': fi,
	'ja-JP': ja,
	'ar-SA': arSA,
	'hi-IN': hi,
	'ko-KR': ko,
	'tr-TR': tr,
};
