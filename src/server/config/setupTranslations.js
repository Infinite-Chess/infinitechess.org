const i18next = require("i18next");
const { parse } = require("smol-toml");
const fs = require("fs");
const path = require("path");
const ejs = require("ejs");
const middleware = require("i18next-http-middleware");
const xss = require("xss");

const translationsFolder = "./translation";

/**
 * Templates without any external data other than translations.
 * Don't insert names with file extensions.
 */
const staticTranslatedTemplates = [
  "createaccount",
  "credits",
  "index",
  "login",
  "member",
  "news",
  "play",
  "termsofservice",
  "errors/400",
  "errors/401",
  "errors/404",
  "errors/409",
  "errors/500",
];

// Removed because <a> tags are no longer in whitelist
/*
const link_white_list = [
  "/",
  "/login",
  "/news",
  "/play",
  "/credits",
  "/termsofservice",
  "/createaccount",
  "https://github.com/pychess/pychess/blob/master/LICENSE",
  "mailto:infinitechess.org@gmail.com",
  "https://www.patreon.com/Naviary",
  "https://math.colgate.edu/~integers/og2/og2.pdf",
  "https://chess.stackexchange.com/questions/42480/checkmate-in-%cf%89%c2%b2-moves-with-finitely-many-pieces",
  "https://math.colgate.edu/~integers/og2/og2.pdf",
  "https://math.colgate.edu/~integers/rg4/rg4.pdf",
  "https://commons.wikimedia.org/wiki/Category:SVG_chess_pieces",
  "https://creativecommons.org/licenses/by-sa/3.0/deed.en",
  "https://www.gnu.org/licenses/gpl-3.0.en.html",
  "https://greenchess.net/info.php?item=downloads",
  "https://github.com/lichess-org/lila/blob/master/COPYING.md",
  "https://www.gnu.org/licenses/agpl-3.0.en.html",
  "https://www.lcg.ufrj.br/WebGL/hws.edu-examples/doc-bump/gl-matrix.js.html",
  "https://github.com/tsevasa/infinite-chess-notation",
  "https://github.com/Infinite-Chess/infinitechess.org/blob/main/docs/COPYING.md",
  "https://discord.gg/NFWFGZeNh5",
  "https://www.chess.com/forum/view/chess-variants/infinite-chess-app-devlogs-and-more",
  "https://github.com/Infinite-Chess/infinitechess.org",
  "https://discord.com/channels/1114425729569017918/1114427288776364132/1240014519061712997"
];
*/

const xss_options = {
  whiteList: {
 // a: ["href", "target"],
    b: [],
    strong: [],
    i: [],
    em: [],
    mark: [],
    small: [],
    del: [],
    ins: [],
    sub: [],
    sup: [],
  },
  onTagAttr: function (tag, name, value, isWhiteAttr) {
    /*if (!isWhiteAttr && !(value === 'href' && name === 'a')) {
      console.warn(
        `Atribute "${name}" of "${tag}" tag with value "${value.trim()}" failed to pass XSS filter. `,
      );
    }*/
  },
  safeAttrValue: function (tag, name, value) {
    /*if (
      tag === "a" &&
        name === "href" &&
        link_white_list.includes(value.trim())
    ) {
      return value;
    } else if (name === "href") {
      console.warn(
        `Atribute "${name}" of "${tag}" tag with value "${value.trim()}" failed to pass XSS filter. `,
      );
    }*/
  },
};
const custom_xss = new xss.FilterXSS(xss_options);

function html_escape_array(array) {
  let escaped = [];
  for (const member of array) {
    escaped.push(html_escape(member));
  }
  return escaped;
}

function html_escape_object(object) {
  let escaped = {};
  for (const key of Object.keys(object)) {
    escaped[key] = html_escape(object[key]);
  }
  return escaped;
}

/**
 Function to iterate over arrays and objects and html escape strings
 */
function html_escape(value) {
  switch (typeof value) {
    case "object":
      if (value.constructor.name == `Object`) {
        return html_escape_object(value);
      } else if (value.constructor.name == `Array`) {
        return html_escape_array(value);
      } else {
        throw "Unhandled object type while escaping";
      }
      break;
    case "string":
      return custom_xss.process(value); // Html escape strings
      break;
    case "number":
      return value;
      break;
    default:
      throw "Unhandled type while escaping";
      break;
  }
}

/**
 * Removes keys from `object` based on string of format 'foo.bar'.
 * @param {key_string} String representing key that has to be deleted in format 'foo.bar'.s
 * @param {object} Object that is target of the removal.
 * @returns Copy of `object` with deleted values
 */
function remove_key(key_string, object) {
  const keys = key_string.split(".");

  let currentObj = object;
  for (let i = 0; i < keys.length - 1; i++) {
    if (currentObj[keys[i]]) {
      currentObj = currentObj[keys[i]];
    }
  }

  if (currentObj[keys.at(-1)]) {
    delete currentObj[keys.at(-1)];
  }
  return object;
}

/**
 * Removes outdated translations.
 * @param {object} Object of translations.
 * @param {changelog} `changes.json` file.
 * @returns
 */
function removeOutdated(object, changelog) {
  const version = object.version;
  // Filter out versions that are older than version of current language
  const filtered_keys = Object.keys(changelog).filter(function x(y) {
    return version < parseInt(y);
  });

  let key_strings = [];
  for (key of filtered_keys) {
    key_strings = key_strings.concat(changelog[key]["changes"]);
  }
  // Remove duplicate
  key_strings = Array.from(new Set(key_strings));

  let object_copy = object;
  for (let key_string of key_strings) {
    object_copy = remove_key(key_string, object_copy);
  }

  return object_copy;
}

function loadTranslationsFolder(folder) {
  const resources = {};
  const files = fs.readdirSync(folder);
  const changelog = JSON.parse(
    fs.readFileSync(path.join(folder, "changes.json")).toString(),
  );
  files
    .filter(function y(x) {
      return x.endsWith(".toml");
    })
    .forEach((file) => {
      resources[file.replace(".toml", "")] = {
        default: html_escape(
          removeOutdated(
            parse(fs.readFileSync(path.join(folder, file)).toString()),
            changelog,
          ),
        ),
      };
    });

  return resources;
}

/**
 * Creates file or directory if it doesn't exist
 * @param {filePath} Path to create.
 */
function createFileOrDir(filePath) {
  if (!fs.existsSync(filePath)) {
    if (path.extname(filePath) === "") {
      fs.mkdirSync(filePath, { recursive: true });
    } else {
      const dirPath = path.dirname(filePath);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      fs.writeFileSync(filePath, "");
    }
  }
}

/**
 * Generates translated versions of templates in staticTranslatedTemplates
 */
function translateStaticTemplates(translations) {
  const languages = Object.keys(translations);
  
  const languages_list = [];
  for (let language of languages) {
    languages_list.push({ code: language, name: translations[language]['default'].name });
  }
  
  const templatesPath = path.join(__dirname, "..", "..", "..", "dist", "views");
  for (let language of languages) {
    for (let template of staticTranslatedTemplates) {
      createFileOrDir(path.join(templatesPath, language, template + ".html")); // Make sure it exists
      fs.writeFileSync(
        path.join(templatesPath, language, template + ".html"),
        ejs.render(
          // Read EJS template
          fs
            .readFileSync(path.join(templatesPath, template + ".ejs"))
            .toString(),
          {
            // Function for translations
            t: function (key, options = {}) {
              options.lng = language; // Make sure language is correct
              return i18next.t(key, options);
            },
            languages: languages_list,
            language: language,
            viewsfolder: path.join(__dirname, '..', '..', '..', 'dist', 'views'),
          },
        ),
      );
    }
  }
}

/**
 * Initializes i18next, loads languages from .toml files, saves translated versions of templates.
 * **Should be ran only once**.
 */
function initTranslations() {
  const translations = loadTranslationsFolder(translationsFolder);

  i18next.use(middleware.LanguageDetector).init({
    // debug: true,
    preload: Object.keys(translations), // List of languages to preload to make sure they are loaded before rendering views
    resources: translations,
    defaultNS: "default",
    fallbackLng: "en-US",
    // debug: true // Enable debug mode to see logs for missing keys and other details
  });

  translateStaticTemplates(translations); // Compiles static files
}

/**
 * Retrieves the translation for a given key and language.
 * @param {string} key - The translation key to look up. For example, `"play.javascript.termination.checkmate"`
 * @param {string} language - The language code (e.g., 'en-US') for the translation. Default: 'en-US'
 * @param {Object} [options={}] - Additional options for the translation.
 * @param {string} [options.lng] - Language override (will be set to the `language` parameter).
 * @param {Object} [options.defaultValue] - Default value to return if the key is not found.
 * @returns {string} The translated string.
 */
function getTranslation(key, language = 'en-US', options = {}) {
  options.lng = language;
  return i18next.t(key, options);
}

module.exports = {
  initTranslations,
  getTranslation
};
