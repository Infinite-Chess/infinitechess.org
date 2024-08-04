// This script deploys all files from /src/client to /dist in order to run the website.
// Depending on the value of DEV_BUILD in /src/server/config/config.js, this happens either in development mode or in production mode.
// Development mode: All files are simply copied over unmodified.
// Production mode: All non-script assets are copied over unmodified,
//                  but all game scripts in /src/client/scripts/game are concatenated into app.js.
//                  Further, all scripts are minified with the use of terser.

import { readdir, cp as copy, rm as remove, readFile, writeFile } from "node:fs/promises";
import swc from "@swc/core";
import browserslist from 'browserslist';
import { transform, browserslistToTargets } from 'lightningcss';
import { injectScriptsIntoPlayEjs } from "./src/server/utility/HTMLScriptInjector.js"
import { DEV_BUILD } from "./src/server/config/config.js";

// Targetted browsers for CSS transpilation
// Format: https://github.com/browserslist/browserslist?tab=readme-ov-file#query-composition
const targets = browserslistToTargets(browserslist('defaults'));

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
  // overwrite play.ejs by injecting all needed scripts into it:
  await writeFile(`./dist/views/play.ejs`, injectScriptsIntoPlayEjs(), 'utf8');
} else {
  // in prod mode, copy all clientside files over to dist, except for those contained in scripts
  await copy("./src/client", "./dist", {
    recursive: true,
    force: true,
    filter: filename => { 
      // return (!/(\\|\/)scripts(\\|\/)/.test(filename) || /(\\|\/)game$/.test(filename)) && !/(\\|\/)css(\\|\/)/.test(filename)
      // TEMPORARILY REVERTED THE LIGHTNING-CSS ADDITIONS, BECAUSE when in a game it breaks the bars blur effect!
      return !/(\\|\/)scripts(\\|\/)/.test(filename) || /(\\|\/)game$/.test(filename) // make sure to create the scripts/game/folder
    }
  });

  // make a list of all client scripts:
  const clientFiles = [];
  const clientScripts = await getExtFiles("./src/client/scripts", ".js");
  clientFiles.push(...clientScripts.map(v => `scripts/${v}`));

  // string containing all code in /game except for htmlscript.js:
  let gamecode = ""; 

  for (const file of clientFiles) {
    // If the client script is htmlscript.js or not in scripts/game, then minify it and copy it over
    if (/\/htmlscript\.js$/.test(file) || !/scripts(\\|\/)+game(\\|\/)/.test(file) ){
      const code = await readFile(`./src/client/${file}`, 'utf8');
      const minified = await swc.minify(code, {
        mangle: true, // Enable variable name mangling
        compress: true, // Enable compression
        sourceMap: false
      });
      await writeFile(`./dist/${file}`, minified.code, 'utf8');
    }
    // Collect the code of all js files in /game except for htmlscript.js:
    else{
      gamecode += await readFile(`./src/client/${file}`, 'utf8');
    }
  }

  // Combine all gamecode files into app.js
  const minifiedgame = await swc.minify(gamecode, {
    mangle: true,
    compress: true,
    sourceMap: false
  });
  await writeFile(`./dist/scripts/game/app.js`, minifiedgame.code, 'utf8');
  
  // overwrite play.ejs by injecting all needed scripts into it:
  await writeFile(`./dist/views/play.ejs`, injectScriptsIntoPlayEjs(), 'utf8');
  
  const cssFiles = await getExtFiles("./src/client/css", ".css");
  for (const file of cssFiles) {
    // Minify css files
    let { code } = transform({
      targets: targets,
      code: Buffer.from(await readFile(`./src/client/css/${file}`, 'utf8')),
      minify: true,
    });
    // Write into /dist
    await writeFile(`./dist/css/${file}`, code, 'utf8');
  }
}