
/**
 * This module, at runtime, creates a list of a few
 * of our htmls into which we want to manually inject
 * some javascript before sharing to the client.
 * (Currently, htmlscript.js is injected in full into play.html.
 * Also, calls to the game scripts in /src/client/scripts/game are injected into play.html)
 * 
 * We keep the javascript separate in development, so as
 * to not break Intellisense's sense of the javascript project.
 * (We wouldn't get useful JSDoc dropdown info otherwise)
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');
const { getReservedUsernames } = require('../controllers/createaccountController');

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
 * @param {Object} [stringInjection] - Optional argument: An object of the form {string: "htmlstring", injectafter: "tags"}.
 *                                     The string will be insterted after the specified tags into the html doc
 */
function prepareAndCacheHTML(htmlFilePath, jsFilePath, stringInjection = {}) {
    injectScriptIntoHeadFromPaths(htmlFilePath, jsFilePath, stringInjection)
        .then(modifiedHTML => {
            addHTMLToCache(htmlFilePath, modifiedHTML)
        })
        .catch(error => console.error("Failed to inject script: ", error));
}

/**
 * Injects a JavaScript file's content into an HTML file
 * after a specified tag, returning the new content.
 * RECEIVES file paths, not raw data.
 * @param {string} htmlFilePath - The path of the html document in the project
 * @param {string} jsFilePath - The path of the javascript file containing the desired javascript code to inject.
 * @param {Object} [stringInjection] - Optional argument: An object of the form {string: "htmlstring", injectafter: "tags"}.
 *                                     The string will be insterted after the specified tags into the html doc
 * @returns {Promise<string>} - A promise that resolves with the modified HTML content, or rejects with an error message.
 */
function injectScriptIntoHeadFromPaths(htmlFilePath, jsFilePath, stringInjection = {}) {
    return new Promise((resolve, reject) => {
        // Read the JavaScript file
        fs.readFile(jsFilePath, 'utf8', (jsErr, jsData) => {
            if (jsErr) {
                reject("Error reading the JavaScript file: " + jsErr);
                return;
            }
            // Read the HTML file and inject the script tag
            fs.readFile(htmlFilePath, 'utf8', (htmlErr, htmlData) => {
                if (htmlErr) {
                    reject("Error reading the HTML file: " + htmlErr);
                    return;
                }

                let modifiedHTML = insertScriptInHead(htmlData, jsData)

                // Inject the string of the optional argument "stringInjection" into the HTML file, if applicable
                if (Object.keys(stringInjection).length != 0){
                    modifiedHTML = modifiedHTML.replace(stringInjection.injectafter, `${stringInjection.injectafter}${stringInjection.string}`);
                }
                resolve(modifiedHTML);
            });
        });
    });
}

/**
 * Inserts the given javascript code into a script tag in the html header.
 * Receives RAW, pre-read data.
 * @param {string} html - The preloaded html file
 * @param {string} js - The javascript code
 */
function insertScriptInHead(html, js) {
    // Create a script tag with the JavaScript content
    const scriptTag = `<script>${js}</script>`;
    // Inject the script tag before the specified closing tag
    return html.replace('<head>', `<head>${scriptTag}`);
}

/**
 * Adds the modified html to the cache.
 * @param {string} path - The path of the html (typically inside /dist)
 * @param {string} contents - The modified contents of the html.
 */
function addHTMLToCache(path, contents) {
    htmlCache[path] = contents;
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
	console.log(Object.keys(htmlCache))
    return htmlCache[htmlFilePath] || false;
}

// Inject the scripts we want...
{ 
    // Prepare the injection of our (potentially minified) htmlscript.js script into play.html
    const htmlFilePath = path.join(__dirname, '..', '..', '..', 'dist', 'views', 'play.html');
    const jsFilePath = path.join(__dirname, '..', '..', '..', 'dist', 'scripts', 'game', 'htmlscript.js');

    //  Prepare the injection of references to all other game scripts into play.html
    const HMTL_scriptcall_p1 = `<script defer src="/scripts/`;
    const HMTL_scriptcall_p2 = `" onerror="htmlscript.callback_LoadingError(event)" onload="(() => { htmlscript.removeOnerror.call(this); })()"></script>`
    const injectafter_string = `${HMTL_scriptcall_p1}validation.js${HMTL_scriptcall_p2}` // we will insert the other game scripts after this exact place in the HTML code

    // Automatically build the list of scripts to be injected into play.html by including everything in scripts/game except for htmlscripts.js
    let HTML_callGame_JS_string = "";
    const game_JSscripts = glob.sync(`./dist/scripts/game/**/*.js`).filter(file => {return !/htmlscript\.js/.test(file)});
    // Convert the list of scripts into an explicit HTML string that imports them all
    for (file of game_JSscripts){
        const js_filename = file.split(/(\\|\/)+/).slice(4).join(""); // discard "dist/scripts/"
        HTML_callGame_JS_string += `\n\t\t${HMTL_scriptcall_p1}${js_filename}${HMTL_scriptcall_p2}`;
    }

    // Finally, perform the injection into play.html
    prepareAndCacheHTML(htmlFilePath, jsFilePath, {string: HTML_callGame_JS_string, injectafter: injectafter_string});
}

// Inject the reserved usernames into createaccount.html, then SAVE it in /dist!
// Does using synchronious read and write methods slow down startup?
{
    // Retrieve the reserved usernames
    const reservedUsernames = getReservedUsernames();
    const reservedUsernamesJS = `const reservedUsernames = ${JSON.stringify(reservedUsernames)};`

    // Read the HTML file and inject the script tag
    const createAccountScriptFilePath = path.join(__dirname, '..', '..', '..', 'dist', 'scripts', 'createaccount.js');
    let createAccountScript;
    try {
        createAccountScript = fs.readFileSync(createAccountScriptFilePath, 'utf8')
    } catch (e) {
        console.log("Error reading createaccount.js script in HTMLScriptInjector: " + e.stack);
        return;
    }

    const modifiedScript = `// Injected by HTMLScriptInjector\n${reservedUsernamesJS}\n\n${createAccountScript}`;

    // Write new script to /dist
    fs.writeFileSync(createAccountScriptFilePath, modifiedScript);
}

module.exports = {
    getCachedHTML,
    sendCachedHTML
};
