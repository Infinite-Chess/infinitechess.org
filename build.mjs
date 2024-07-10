import * as esbuild from "esbuild";
import { readdir, cp as copy } from "node:fs/promises";


/**
 * 
 * @param {string} path 
 * @returns {Promise<string[]>}
 */
async function getJSFiles(path) {
  const filesNFolder = await readdir(path);
  const folders = filesNFolder.filter(v => !v.endsWith(".js"));
  let files = filesNFolder.filter(v => v.endsWith(".js"));

  for (const folder of folders) {
    try {
      const newFiles = await getJSFiles(`${path}/${folder}`);
      files.push(...newFiles.map(v => `${folder}/${v}`));
    } catch (e) {
      if (e.code) continue;
      console.log(e);
    }
  }

  return files;
}

await copy("./src/client", "./dist", {
  recursive: true,
  force: true
});

const clientFiles = await getJSFiles("./src/client/scripts");

const result = await esbuild.build({
  entryPoints: clientFiles.map(v => `./src/client/scripts/${v}`),
  bundle: true,
  minify: true,
  outdir: "dist",
  outbase: "src/client"
});

console.log(result);
