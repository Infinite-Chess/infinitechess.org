// src/server/config/translationconfig.ts

import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Constants -----------------------------------------------------

/** The default/fallback language code. */
const DEFAULT_LANGUAGE = 'en-US' as const;

/** The folder path containing translation TOML files. */
const TRANSLATION_FOLDER = path.join(__dirname, '../../../translation');

/** The name of the translation component whose keys are server response strings. */
const RESPONSES_COMPONENT = 'responses' as const;

/** The folder path containing news markdown files. */
const NEWS_FOLDER = path.join(TRANSLATION_FOLDER, 'news');

/** Non-component subdirectories of TRANSLATION_FOLDER to ignore (e.g. "news"). */
const EXCLUDED_DIRS = ['news'];

// Exports --------------------------------------------------------

export default {
	DEFAULT_LANGUAGE,
	RESPONSES_COMPONENT,
	TRANSLATION_FOLDER,
	NEWS_FOLDER,
	EXCLUDED_DIRS,
};
