import { readdir, cp as copy, rm as remove, readFile, writeFile } from "node:fs/promises";
import { minify } from "terser";
import { DEV_BUILD } from "./src/server/config/config.js";

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

// remove dist
await remove("./dist", {
  recursive: true,
  force: true,
});

// copy all clientside files over to dist
await copy("./src/client", "./dist", {
  recursive: true,
  force: true,
  filter: filename => { return !/game\//.test(filename)}
});

// get all client scripts:
const clientScript = await getExtFiles("./src/client/scripts", ".js");
// Not yet implemented: get all client css:
const clientStyle = []; // await getExtFiles("./src/client/css", ".css");

const clientFiles = [];
clientFiles.push(
  ...clientScript.map(v => `scripts/${v}`),
  ...clientStyle.map(v => `css/${v}`)
);

const filesToWrite = []; // array of output files
let gamecode = ""; // string containing all code in /game except for htmlscript.js

for (const file of clientFiles) {
  // If the file is either a css file or htmlscript.js or not in /game, then copy it over in dev mode, or minify it in production mode:
  if (/\.css$/.test(file) || /\/htmlscript\.js$/.test(file) || !/\/game\//.test(file) ){
    if (DEV_BUILD){
      await copy(`./src/client/${file}`, `./dist/${file}` , {force: true} );
    } else {
      const code = await readFile(`./src/client/${file}`, 'utf8');
      const minified = await minify(code, {
        mangle: true, // Disable variable name mangling
        compress: true, // Enable compression
        sourceMap: false
      });
      filesToWrite.push(writeFile(`./dist/${file}`, minified.code, 'utf8'));
    }
  }
  // Collect the code of all js files in /game except for htmlscript.js:
  else{
    gamecode += await readFile(`./src/client/${file}`, 'utf8');
  }
}

// Combine all gamecode files into app.js, and minify them in dev mode
if (DEV_BUILD){
  filesToWrite.push(writeFile(`./dist/scripts/game/app.js`, gamecode, 'utf8'));
} else{
  const minifiedgame = await minify(gamecode, {
    mangle: true,
    compress: true,
    sourceMap: false
  });
  filesToWrite.push(writeFile(`./dist/scripts/game/app.js`, minifiedgame.code, 'utf8'));
}

await Promise.all(filesToWrite);