/**
 * This module is called by build.mjs to inject javascript code into play.ejs.
 * Currently, htmlscript.js is injected in full into play.ejs.
 * Also, calls to the game scripts in /src/client/scripts/game are injected into play.ejs.
 *
 * We keep the javascript separate in development, so as
 * to not break Intellisense's sense of the javascript project.
 * (We wouldn't get useful JSDoc dropdown info otherwise)
 */

import fs from "fs";
import path from "path";

import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function injectafter(string, after, injectString) {
    return string.replace(after, `${after}${injectString}`);
}

/**
 * Injects a JavaScript file's content into an HTML or EJS file
 * after a specified tag, returning the new content.
 * @param {string} htmlFilePath - The path of the html/ejs document in the project
 * @param {string} jsFilePath - The path of the javascript file containing the desired javascript code to inject.
 * @param {string} injectAfterTag - The HTML tag after which the JavaScript code will be injected (typically the `<head>`).
 * @returns {string} modifiedHTML - Modified html.
 */
function injectScript(htmlFilePath, scriptTag, injectAfterTag) {
    const htmlData = fs.readFileSync(htmlFilePath, "utf8");
    if (!htmlData.match(injectAfterTag)) {
        console.error(`No match for tag ${injectAfterTag}`);
    }
    const modifiedHTML = injectafter(htmlData, injectAfterTag, scriptTag);

    // // Read the JavaScript file
    // const jsData = fs.readFileSync(jsFilePath, "utf8");
    // // Create a script tag with the JavaScript content
    // const scriptTag = `<script>${jsData}</script>`;

    // // Read the HTML file and inject the script tag
    // const htmlData = fs.readFileSync(htmlFilePath, "utf8");
    // // Inject the script tag before the specified closing tag
    // let modifiedHTML = htmlData.replace(injectAfterTag, `${injectAfterTag}${scriptTag}`);

    // Inject the string of the optional argument "stringInjection" into the HTML file, if applicable
    // if (Object.keys(stringInjection).length) {
    //     modifiedHTML = modifiedHTML.replace(stringInjection.injectafter, `${stringInjection.injectafter}${stringInjection.string}`);
    // }
    return modifiedHTML;
}

function injectHtmlScript() {
    const htmlFilePath = path.join(__dirname, "..", "..", "..", "dist", "views", "play.ejs");
    const jsFilePath = path.join(__dirname, "..", "..", "..", "dist", "scripts", "game", "htmlscript.js");
    const HTML_scriptcall = `<script>${fs.readFileSync(jsFilePath)}</script>`;
    return injectScript(htmlFilePath, HTML_scriptcall, '<!-- js inject here -->');
}

/**
 * @param {string} file
 * @param {string} injectAfterTag  
 * @param {Object} [options] 
 */
function injectScriptIntoPlayEjs(file, injectAfterTag, isModule = false) {
    const htmlFilePath = path.join(__dirname, "..", "..", "..", "dist", "views", "play.ejs");
    const jsFilePath = file.split(/(\\|\/)+/).slice(4).join("");
    const moduleType = isModule ? 'type="module"' : '';

    const HTML_scriptcall = `<script ${moduleType} src="/${jsFilePath}" defer onerror="htmlscript.callback_LoadingError(event)" onload="(() => { htmlscript.removeOnerror.call(this); })()"></script>`;

    return injectScript(htmlFilePath, HTML_scriptcall, injectAfterTag);
}

export {
    injectScriptIntoPlayEjs,
    injectHtmlScript,
};
