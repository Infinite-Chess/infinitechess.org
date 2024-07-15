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

if (DEV_BUILD){
  // in dev mode, copy all clientside files over to dist and exit
  await copy("./src/client", "./dist", {
    recursive: true,
    force: true
  });
} else{
  // in prod mode, copy all clientside files over to dist, except for those contained in scripts
  await copy("./src/client", "./dist", {
    recursive: true,
    force: true,
    filter: filename => { 
      return !/(\\|\/)scripts(\\|\/)/.test(filename) || /(\\|\/)game$/.test(filename) // make sure to create the scripts/game/folder
    }
  });

  // make a list of all client scripts:
  const clientFiles = [];
  const clientScripts = await getExtFiles("./src/client/scripts", ".js");
  clientFiles.push(...clientScripts.map(v => `scripts/${v}`));

  const filesToWrite = []; // array of output files that will need to be written
  let gamecode = ""; // string containing all code in /game except for htmlscript.js

  for (const file of clientFiles) {
    // If the client script is htmlscript.js or not in scripts/game, then minify it and copy it over
    if (/\/htmlscript\.js$/.test(file) || !/scripts(\\|\/)+game(\\|\/)/.test(file) ){
      const code = await readFile(`./src/client/${file}`, 'utf8');
      const minified = await minify(code, {
        mangle: true, // Enable variable name mangling
        compress: true, // Enable compression
        sourceMap: false
      });
      filesToWrite.push(writeFile(`./dist/${file}`, minified.code, 'utf8'));
    }
    // Collect the code of all js files in /game except for htmlscript.js:
    else{
      gamecode += await readFile(`./src/client/${file}`, 'utf8');
    }
  }

  // Combine all gamecode files into app.js
  const minifiedgame = await minify(gamecode, {
    mangle: true,
    compress: true,
    sourceMap: false
  });
  filesToWrite.push(writeFile(`./dist/scripts/game/app.js`, minifiedgame.code, 'utf8'));

  // finally, write to the needed files
  await Promise.all(filesToWrite);
}