
/**
 * This script retrieves the translation for the code and language specified.
 * This has no other dependancies.
 */

const i18next = require("i18next");

const defaultLanguage = 'en-US';
/** Our supported languages (those with a TOML file) will be auto-appended here by {@link loadTranslationsFolder}. */
const supportedLanguages = [];

function getDefaultLanguage() { return defaultLanguage; }
function setSupportedLanguages(list) { supportedLanguages === list; }

/**
 * Determines the language to be used for serving an HTML file to a request.
 * The language is determined in the following order of precedence:
 * 1. The 'lng' query parameter.
 * 2. The 'i18next' cookie.
 * 3. A default language if neither the query parameter nor the cookie is present.
 * The selected language is validated against supported languages.
 * @param {Object} req - The Express request object.
 * @returns {string} The language to be used.
 */
function getLanguageToServe(req) {
    let language = req.query.lng || req.cookies.i18next || req.i18n.resolvedLanguage;
    if (!supportedLanguages.includes(language)) { // Query param language not supported
        language = req.cookies.i18next;
    }
    if (!supportedLanguages.includes(language)) { // Cookie language not supported
        language = req.i18n.resolvedLanguage;
    }
    return language;
}

/**
 * Retrieves the translation for a given key and language.
 * @param {string} key - The translation key to look up. For example, `"play.javascript.termination.checkmate"`
 * @param {string} language - The language code for the translation. Default: `"en-US"`
 * @param {Object} [options={}] - Additional options for the translation.
 * @param {string} [options.lng] - Language override (will be set to the `language` parameter).
 * @param {Object} [options.defaultValue] - Default value to return if the key is not found.
 * @returns {string} The translated string.
 */
function getTranslation(key, language = defaultLanguage, options = {}) {
    options.lng = language;
    return i18next.t(key, options);
}

/**
 * Retrieves the translation for a given key and req. It reads the req's cookies for its preferred language.
 * @param {string} key - The translation key to look up. For example, `"play.javascript.termination.checkmate"`
 * @param {Object} req - The request object
 * @param {Object} [options={}] - Additional options for the translation.
 * @param {string} [options.lng] - Language override (will be set to the `language` parameter).
 * @param {Object} [options.defaultValue] - Default value to return if the key is not found.
 * @returns {string} The translated string.
 */
function getTranslationForReq(key, req, options = {}) {
    return getTranslation(key, req.cookies?.i18next, options);
}

export {
    setSupportedLanguages,
    getLanguageToServe,
    getDefaultLanguage,
    getTranslation,
    getTranslationForReq,
};
