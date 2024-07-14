/**
 * This module, at runtime, creates a list of a few
 * of our htmls in which we want to manually injected
 * some javascript into before sharing to the client.
 *
 * We keep the javascript separate in development, so as
 * to not break Intellisense's sense of the javascript project.
 * (We wouldn't get useful JSDoc dropdown info otherwise)
 */

const fs = require("fs");
const path = require("path");
const ejs = require("ejs");

/**
 * Injects a JavaScript file's content into an HTML file
 * after a specified tag, returning the new content.
 * @param {string} htmlFilePath - The path of the html document in the project
 * @param {string} jsFilePath - The path of the javascript file containing the desired javascript code to inject.
 * @param {string} injectAfterTag - The HTML tag after which the JavaScript code will be injected (typically the `<head>`).
 * @returns {Promise<string>} - A promise that resolves with the modified HTML content, or rejects with an error message.
 */
function injectScript(htmlFilePath, jsFilePath, injectAfterTag) {
  // Read the JavaScript file
  const jsData = fs.readFileSync(jsFilePath, "utf8");
  // Create a script tag with the JavaScript content
  const scriptTag = `<script>${jsData}</script>`;

  // Read the HTML file and inject the script tag
  htmlData = fs.readFileSync(htmlFilePath, "utf8");
  // Inject the script tag before the specified closing tag
  const modifiedHTML = htmlData.replace(
    injectAfterTag,
    `${injectAfterTag}${scriptTag}`,
  );
  return modifiedHTML;
}

/**
 * Injects htmlscript.js into play.ejs.
 * **Should be ran only once.**
 */
function injectHtmlscript() {
  // Inject into play.ejs, our OBFUSCATED htmlscript.js script.
  const htmlFilePath = path.join(
    __dirname,
    "..",
    "..",
    "..",
    "dist",
    "views",
    "play.ejs",
  );
  const jsFilePath = path.join(
    __dirname,
    "..",
    "..",
    "..",
    "dist",
    "scripts",
    "game",
    "htmlscript.js",
  );

  fs.writeFileSync(
    htmlFilePath,
    injectScript(htmlFilePath, jsFilePath, "<head>"),
  );
}

module.exports = {
  injectHtmlscript,
};
