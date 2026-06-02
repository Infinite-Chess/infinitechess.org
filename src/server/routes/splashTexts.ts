// src/server/routes/splashTexts.ts

/**
 * For the index / home page. Picks out a random splash text for the hero tagline,
 * in the user's language, from the splashes translation component.
 */

import type { Request } from 'express';

import { getLanguageToServe } from '../utility/translate.js';
import { getTemplateTranslations } from '../config/componentTranslationLoader.js';

/** Returns a randomly chosen splash text in the request's resolved language. */
export function getRandomSplashText(req: Request): string {
	const lang = getLanguageToServe(req);
	const splashes = getTemplateTranslations('splashes', lang) as Record<string, string>;
	const values = Object.values(splashes);
	return values[Math.floor(Math.random() * values.length)]!;
}
