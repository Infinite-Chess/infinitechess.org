const i18next = require("i18next");
const { parse } = require("smol-toml");
const fs = require("fs");
const path = require("path");
const { readFileSync } = require("fs");
const middleware = require("i18next-http-middleware");

const translationsFolder = "./translation";

function loadTranslationsFolder(folder) {
  const resources = {};
  const files = fs.readdirSync(folder);
  files.forEach((file) => {
    resources[file.replace(".toml", "")] = {
      default: parse(fs.readFileSync(path.join(folder, file)).toString()),
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
    fallbackLng: "en",
  });
}

module.exports = {
  initTranslations,
};
