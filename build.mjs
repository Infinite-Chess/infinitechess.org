import { readdir, cp as copy, rm as remove, readFile, writeFile } from "node:fs/promises";
import { minify } from "terser";

/** Whether to generate source maps */
const generateMaps = true;

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

await remove("./dist", {
  recursive: true,
  force: true,
});

await copy("./src/client", "./dist", {
  recursive: true,
  force: true,
});

const clientScript = await getExtFiles("./src/client/scripts", ".js");
const clientStyle = []; // await getExtFiles("./src/client/css", ".css");

const clientFiles = [];
clientFiles.push(...clientScript.map(v => `./src/client/scripts/${v}`), ...clientStyle.map(v => `./src/client/css/${v}`));

const filesToWrite = [];

for (const file of clientFiles) {
  const filePath = `./dist/${file.replace('./src/client/', '')}`;
  const code = await readFile(filePath, 'utf8');
  const minified = await minify(code, {
    mangle: true, // Disable variable name mangling
    compress: true, // Enable compression
	  sourceMap: generateMaps
  });

  filesToWrite.push(
    writeFile(filePath, minified.code, 'utf8')
  );
  if (generateMaps) {
    filesToWrite.push(
      writeFile(filePath + ".map", minified.map, "utf8")
    );
  }
}

await Promise.all(filesToWrite);