
/**
 * This script retrieves the translation for the code and language specified.
 * This has no other dependancies.
 */

const i18next = require("i18next");

const defaultLanguage = 'en-US';

function getDefaultLanguage() { return defaultLanguage; }

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

module.exports = {
    getDefaultLanguage,
    getTranslation,
    getTranslationForReq,
};
