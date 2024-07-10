
/**
 * This module, at runtime, creates a list of a few
 * of our htmls in which we want to manually injected
 * some javascript into before sharing to the client.
 * 
 * We keep the javascript separate in development, so as
 * to not break Intellisense's sense of the javascript project.
 * (We wouldn't get useful JSDoc dropdown info otherwise)
 */

const fs = require('fs');
const path = require('path');

/**
 * A cache object that has file paths for the keys, and for the values-
 * html documents with our desired injected javascript.
 */
let htmlCache = {};

/**
 * Injects a JavaScript file's content into an HTML file after
 * a specified tag, then cache's that content into {@link htmlCache}
 * @param {string} htmlFilePath - The path of the html document in the project
 * @param {string} jsFilePath - The path of the javascript file containing the desired javascript code to inject.
 * @param {string} injectAfterTag - The HTML tag after which the JavaScript code will be injected (typically the `<head>`).
 */
function prepareAndCacheHTML(htmlFilePath, jsFilePath, injectAfterTag) {
    injectScript(htmlFilePath, jsFilePath, injectAfterTag)
        .then(modifiedHTML => {
            htmlCache[htmlFilePath] = modifiedHTML;
        })
        .catch(error => console.error("Failed to inject script: ", error));
}

/**
 * Injects a JavaScript file's content into an HTML file
 * after a specified tag, returning the new content.
 * @param {string} htmlFilePath - The path of the html document in the project
 * @param {string} jsFilePath - The path of the javascript file containing the desired javascript code to inject.
 * @param {string} injectAfterTag - The HTML tag after which the JavaScript code will be injected (typically the `<head>`).
 * @returns {Promise<string>} - A promise that resolves with the modified HTML content, or rejects with an error message.
 */
function injectScript(htmlFilePath, jsFilePath, injectAfterTag) {
    return new Promise((resolve, reject) => {
        // Read the JavaScript file
        fs.readFile(jsFilePath, 'utf8', (jsErr, jsData) => {
            if (jsErr) {
                reject("Error reading the JavaScript file: " + jsErr);
                return;
            }
            // Create a script tag with the JavaScript content
            const scriptTag = `<script>${jsData}</script>`;

            // Read the HTML file and inject the script tag
            fs.readFile(htmlFilePath, 'utf8', (htmlErr, htmlData) => {
                if (htmlErr) {
                    reject("Error reading the HTML file: " + htmlErr);
                    return;
                }
                // Inject the script tag before the specified closing tag
                const modifiedHTML = htmlData.replace(injectAfterTag, `${injectAfterTag}${scriptTag}`);
                resolve(modifiedHTML);
            });
        });
    });
}

/**
 * Sends our cached HTML file with injected code at the specified path, to the client.
 * If the HTML content is not ready or doesn't exist, an error message will be sent instead.
 * @param {Object} req - The HTTP request object.
 * @param {Object} res - The HTTP response object.
 * @param {string} htmlFilePath - The path to the HTML file, relative to this module.
 */
function sendCachedHTML(req, res, htmlFilePath) {
    const cachedHTML = getCachedHTML(htmlFilePath);
    if (cachedHTML === false) res.status(503).send('Content is still being prepared, please refresh!');
    else res.send(cachedHTML);
}

/**
 * Returns our cached html file with injected code at the specified path.
 * If it's not ready, or we don't have it, we'll return false.
 * @param {string} htmlFilePath - The path to the html file, relative to this module.
 * @returns {string | false} - The injected html, or *false* if it's not ready or doesn't exist.
 */
function getCachedHTML(htmlFilePath) {
    return htmlCache[htmlFilePath] || false;
}

// Inject the scripts we want...

{ // Inject into play.html, our OBFUSCATED htmlscript.js script.
    const htmlFilePath = path.join(__dirname, '..', '..', '..', 'dist', 'views', 'play.html');
    const jsFilePath = path.join(__dirname, '..', '..', '..', 'dist', 'scripts', 'game', 'htmlscript.js');
    prepareAndCacheHTML(htmlFilePath, jsFilePath, '<head>');
}

{ // Inject into dev.html, our htmlscript.js script.
    const htmlFilePath = path.join(__dirname, '..', '..', '..', 'dist', 'views', 'dev.html');
    const jsFilePath = path.join(__dirname, '..', '..', '..', 'dist', 'scripts', 'game', 'htmlscript.js');
    prepareAndCacheHTML(htmlFilePath, jsFilePath, '<head>');
}

module.exports = {
    getCachedHTML,
    sendCachedHTML
};
