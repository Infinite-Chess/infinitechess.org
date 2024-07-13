const i18next = require("i18next");
const { parse } = require("smol-toml");
const fs = require("fs");
const path = require("path");
const { readFileSync } = require("fs");
const middleware = require("i18next-http-middleware");
const xss = require("xss");

const translationsFolder = "./translation";

function html_escape_array(array) {
  let escaped = [];
  for (const member of array) {
    escaped.push(escape_switch(member));
  }
  return escaped;
}

function html_escape_object(object) {
  let escaped = {};
  for (const key of Object.keys(object)) {
    escaped[key] = escape_switch(object[key]);
  }
  return escaped;
}

// Function to iterate over arrays and objects and html escape strings 
function escape_html(value) {
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
  files.forEach((file) => {
    resources[file.replace(".toml", "")] = {
      default: escape_html(
        parse(fs.readFileSync(path.join(folder, file)).toString()),
      ),
    };
  });
  return resources;
}

function initTranslations() {
  const translations = loadTranslationsFolder(translationsFolder);

  i18next.use(middleware.LanguageDetector).init({
    // debug: true,
    preload: Object.keys(translations), // List of languages to preload to make sure they are loadedbefore rendering views
    resources: translations,
    defaultNS: "default",
    fallbackLng: "en-US",
  });
}

module.exports = {
  initTranslations,
};
