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
      return xss(value); // Html escape strings
      break;
    case "number":
      return value;
      break;
    default:
      throw "Unhandled type while escaping";
      break;
  }
}

function loadTranslationsFolder(folder) {
  const resources = {};
  const files = fs.readdirSync(folder);
  files
    .filter(function y(x) {
      return x.endsWith(".toml");
    })
    .forEach((file) => {
      resources[file.replace(".toml", "")] = {
        default: html_escape(
          parse(fs.readFileSync(path.join(folder, file)).toString()),
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
function translateStaticTemplates(languages) {
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
  });
  translateStaticTemplates(Object.keys(translations)); // Compiles static files
}

module.exports = {
  initTranslations,
};
