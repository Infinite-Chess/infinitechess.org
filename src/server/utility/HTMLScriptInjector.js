/**
 * This module is called by build.mjs to inject javascript code into play.ejs.
 * Currently, htmlscript.js is injected in full into play.ejs.
 * Also, calls to the game scripts in /src/client/scripts/game are injected into play.ejs.
 *
 * We keep the javascript separate in development, so as
 * to not break Intellisense's sense of the javascript project.
 * (We wouldn't get useful JSDoc dropdown info otherwise)
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

/**
 * Injects a JavaScript file's content into an HTML or EJS file
 * after a specified tag, returning the new content.
 * @param {string} htmlFilePath - The path of the html/ejs document in the project
 * @param {string} jsFilePath - The path of the javascript file containing the desired javascript code to inject.
 * @param {string} injectAfterTag - The HTML tag after which the JavaScript code will be injected (typically the `<head>`).
 * @param {Object} [stringInjection] - Optional argument: An object of the form {string: 'htmlstring', injectafter: 'tags'}.
 *                                     The string will be insterted after the specified tags into the html doc
 * @returns {string} modifiedHTML - Modified html.
 */
function injectScript(htmlFilePath, jsFilePath, injectAfterTag, stringInjection = {}) {
  // Read the JavaScript file
  const jsData = fs.readFileSync(jsFilePath, 'utf8');
  // Create a script tag with the JavaScript content
  const scriptTag = `<script>${jsData}</script>`;

  // Read the HTML file and inject the script tag
  const htmlData = fs.readFileSync(htmlFilePath, 'utf8');
  // Inject the script tag before the specified closing tag
  let modifiedHTML = htmlData.replace(injectAfterTag, `${injectAfterTag}${scriptTag}`);

  // Inject the string of the optional argument 'stringInjection' into the HTML file, if applicable
  if (Object.keys(stringInjection).length != 0) {
    modifiedHTML = modifiedHTML.replace(stringInjection.injectafter, `${stringInjection.injectafter}${stringInjection.string}`);
  }
  return modifiedHTML;
}

// Inject the scripts we want into play.ejs
function injectScriptsIntoPlayEjs() {
  // Prepare the injection of our (potentially minified) htmlscript.js script into play.ejs
  const htmlFilePath = path.join(__dirname, '..', '..', '..', 'dist', 'views', 'layouts', 'play.ejs');
  const jsFilePath = path.join(__dirname, '..', '..', '..', 'dist', 'scripts', 'game', 'htmlscript.js');

  //  Prepare the injection of references to all other game scripts into play.ejs
  const HMTL_scriptcall_p1 = `<script defer src='/scripts/`;
  const HMTL_scriptcall_p2 = `' onerror='htmlscript.callback_LoadingError(event)' onload='(() => { htmlscript.removeOnerror.call(this); })()'></script>`;
  const injectafter_string = '<!-- All clientside game scripts are inject here -->'; // we will insert the other game scripts after this exact place in the HTML code

  // Automatically build the list of scripts to be injected into play.ejs by including everything in scripts/game except for htmlscripts.js
  let HTML_callGame_JS_string = '';
  const game_JSscripts = glob.sync(`./dist/scripts/game/**/*.js`).filter((file) => { return !/htmlscript\.js/.test(file); });
  // Convert the list of scripts into an explicit HTML string that imports them all
  for (file of game_JSscripts) {
    const js_filename = file.split(/(\\|\/)+/).slice(4).join(''); // discard 'dist/scripts/'
    HTML_callGame_JS_string += `\n\t\t${HMTL_scriptcall_p1}${js_filename}${HMTL_scriptcall_p2}`;
  }

  // Return html with injected javascript
  return injectScript(htmlFilePath, jsFilePath, '<!-- htmlscript.js inject here -->', {
    string: HTML_callGame_JS_string,
    injectafter: injectafter_string,
  });
}

module.exports = {
  injectScriptsIntoPlayEjs,
};
