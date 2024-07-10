import * as esbuild from "esbuild";
import { readdir, cp as copy, rm as remove } from "node:fs/promises";

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
      const newFiles = await getExtFiles(`${path}/${folder}`);
      files.push(...newFiles.map(v => `${folder}/${v}`));
    } catch (e) {
      if (e.code) continue;
      console.log(e);
    }
  }

  return files;
}

await remove("./dist", {
  recursive: true,
  force: true,
})

await copy("./src/client", "./dist", {
  recursive: true,
  force: true
});

const clientScript = await getExtFiles("./src/client/scripts", "js");
const clientStyle = [] // await getExtFiles("./src/client/css", ".css");

const clientFiles = [];
clientFiles.push(...clientScript.map(v => `./src/client/scripts/${v}`), ...clientStyle.map(v => `./src/client/css/${v}`));

const result = await esbuild.build({
  entryPoints: clientFiles,
  bundle: true,
  minify: true,
  outdir: "dist",
  outbase: "src/client",
  sourcemap: true,
  platform: "browser",
  format: "esm",
});

console.log(result);
