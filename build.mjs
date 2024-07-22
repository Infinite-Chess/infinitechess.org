// This script deploys all files from /src/client to /dist in order to run the website.
// Depending on the value of DEV_BUILD in /src/server/config/config.js, this happens either in development mode or in production mode.
// Development mode: All files are simply copied over unmodified.
//                   Only avif images are generated with 1 effort in order to reduce compilation time.
// Production mode: All non-script assets are copied over unmodified,
//                  but all game scripts in /src/client/scripts/game are concatenated into app.js.
//                  Further, all scripts are minified with the use of swc.
//                  Webp, png and avif images are generated with the biggest effort value.

import { readdir, cp as copy, rm as remove, readFile, writeFile } from "node:fs/promises";
import path from "path";
import swc from "@swc/core";
import sharp from "sharp";
import { injectScriptsIntoPlayEjs } from "./src/server/utility/HTMLScriptInjector.js"
import { DEV_BUILD } from "./src/server/config/config.js";

// Development effort values
const avif_dev_effort = 0; // 0-9
// Production effort values
// Reduce to improve start times
const webp_effort = 6; // 0-6
const png_effort = 10; // 1-10
const avif_effort = 9; // 0-9

/**
* Images to optimise.
* Key is image name, value is options for each format.
*/ 
const optimised_images = {
  "king_w.png": {},
  "queen_w.png": {},
  "blank_board.png": {},
  "member_default.png": {},
  "/game/guide/promotionlines.png": {},
  "/game/guide/kingrookfork.png": {},
  "/game/guide/arrowindicators.png": {},
  "/game/guide/fairy/chancellor.png": {},
  "/game/guide/fairy/archbishop.png": {},
  "/game/guide/fairy/amazon.png": {},
  "/game/guide/fairy/guard.png": {},
  "/game/guide/fairy/hawk.png": {},
  "/game/guide/fairy/centaur.png": {},
  "/game/guide/fairy/obstacle.png": {},
  "/game/guide/fairy/void.png": {},
}

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

function endsWithArray(str, array) {
  for (let el of array) {
    if (str.endsWith(el)) {
      return true
    }
  }
  return false
}

/**
 * @param {string} img Name of image 
 * @param {string} format Format, either png, avif or webp
 * @returns {Number} effort Value of effort to override if is nto set
 */
function loadImageConfig(img, format, effort) {
  let config;
  // Make sure format exists
  if (format in optimised_images[img]) {
    config = optimised_images[img]['avif']
  } else {
    config = {};
  }
  
  // If effor is not set overriede with effort variable
  if (!("effort" in config)) {
    config["effort"] = effort;
  }
  
  return config;
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
  
  // add avif images, webp and png are enable only in production
  for (let img in optimised_images) {
    const img_path = path.join(`./src/client/img/`, img);
    sharp(img_path)
    .avif(loadImageConfig(img, 'avif', avif_dev_effort))
      .toFile(path.join('./dist/img/', `${ img.replace(/\.[^/.]+$/, '')}.avif`))
  }
} else {
  // in prod mode, copy all clientside files over to dist, except for those contained in scripts and images contained in optimised_images
  await copy("./src/client", "./dist", {
    recursive: true,
    force: true,
    filter: filename => {
      return (!/(\\|\/)scripts(\\|\/)/.test(filename) || /(\\|\/)game$/.test(filename)) && !(/(\\|\/)img(\\|\/)/.test(filename) && endsWithArray(filename, Object.keys(optimised_images)))
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
  
  // Generate optimised images and copy them to /dist/img
  console.log("Optimising images...");
  for (let img in optimised_images) {
    const img_path = path.join(`./src/client/img/`, img);
    sharp(img_path)
    .webp(loadImageConfig(img, 'webp', webp_effort))
      .toFile(path.join('./dist/img/', `${ img.replace(/\.[^/.]+$/, '')}.webp`))
    
    sharp(img_path)
    .png(loadImageConfig(img, 'png', png_effort))
      .toFile(path.join('./dist/img/', `${ img.replace(/\.[^/.]+$/, '')}.png`))
    
    sharp(img_path)
    .avif(loadImageConfig(img, 'avif', avif_effort))
      .toFile(path.join('./dist/img/', `${ img.replace(/\.[^/.]+$/, '')}.avif`))
  }
}