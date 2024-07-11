import { readdir, cp as copy, rm as remove, readFile, writeFile } from "node:fs/promises";
import { minify } from "terser";
import { DEV_BUILD } from "./src/server/config/config.js";
import { exit } from "node:process";

/** Whether to generate source maps in production */
const generateSourceMapsInProduction = false;

/**
 * 
 * @param {string} path 
 * @param {string} ext 
 * @returns {Promise<string[]>}
 */
async function getExtFiles(path, ext) {
  const filesNFolder = await readdir(path);
  const folders = filesNFolder.filter(v => !v.endsWith(ext));
  let files = filesNFolder.filter(v => v.endsWith(ext));

  for (const folder of folders) {
    try {
      const newFiles = await getExtFiles(`${path}/${folder}`, ext);
      files.push(...newFiles.map(v => `${folder}/${v}`));
    } catch (e) {
      if (e.code) continue;
      console.log(e);
    }
  }

  return files;
}

/**
 * @param {string} path 
 * @returns {string}
 */
function getFilenamePath(path) {
  const places = path.split("/");
  return places[places.length-1];
}

await remove("./dist", {
  recursive: true,
  force: true,
});

await copy("./src/client", "./dist", {
  recursive: true,
  force: true,
});

if (DEV_BUILD) exit();

const clientScript = await getExtFiles("./src/client/scripts", ".js");
const clientStyle = []; // await getExtFiles("./src/client/css", ".css");

const clientFiles = [];
clientFiles.push(
  ...clientScript.map(v => `scripts/${v}`),
  ...clientStyle.map(v => `css/${v}`)
);

const filesToWrite = [];

for (const file of clientFiles) {
  const code = await readFile(`./src/client/${file}`, 'utf8');

  const minifyInput = {};
  minifyInput[`/src/client/${file}`] = code;

  const minified = await minify(minifyInput, {
    mangle: true, // Disable variable name mangling
    compress: true, // Enable compression
    sourceMap: generateSourceMapsInProduction ? {
      includeSources: true,
      url: `${getFilenamePath(file)}.map`,
    } : false
  });

  filesToWrite.push(writeFile(`./dist/${file}`, minified.code, 'utf8'));
  if (generateSourceMapsInProduction) {
    filesToWrite.push(writeFile(`./dist/${file}.map`, minified.map, 'utf8') )
  }
}

await Promise.all(filesToWrite);