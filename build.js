// This script deploys all files from /src/client to /dist in order to run the website.
// Depending on the value of DEV_BUILD in /src/server/config/config.js, this happens either in development mode or in production mode.
// Development mode: All files are simply copied over unmodified.
// Production mode: All non-script assets are copied over unmodified,
//                  but all game scripts in /src/client/scripts/game are concatenated into app.js.
//                  Further, all scripts are minified with the use of terser.

import { readdir, cp as copy, rm as remove, readFile, writeFile, mkdir } from 'node:fs/promises';
import swc from "@swc/core";
import browserslist from 'browserslist';
import { transform, browserslistToTargets } from 'lightningcss';
import { insertScriptLinkIntoHTML, insertScriptIntoHTML } from './src/server/utility/HTMLScriptInjector.js';
import { BUNDLE_FILES } from './src/server/config/config.js';
import esbuild from 'esbuild';
import path from "node:path";
import { writeFile_ensureDirectory } from './src/server/utility/fileUtils.js';

// Targetted browsers for CSS transpilation
// Format: https://github.com/browserslist/browserslist?tab=readme-ov-file#query-composition
const targets = browserslistToTargets(browserslist('defaults'));

/**
 * Recursively retrieves all files with a specific extension from a directory and its subdirectories.
 * @param {string} path - The directory path where the search will start.
 * @param {string} ext - The file extension to filter by (e.g., '.js', '.txt').
 * @returns {Promise<string[]>} - A promise that resolves to an array of file paths with the specified extension.
 */
async function getExtFiles(path, ext) {
	const filesNFolder = await readdir(path);
	const folders = filesNFolder.filter(v => !v.endsWith(ext));
	const files = filesNFolder.filter(v => v.endsWith(ext));

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
 * Get all Game scripts inside the 'src/client/scripts/game' directory, EXCLUDING 'htmlscript.js'.
 * Returns an array of only the base names without the '.js' extension or paths.
 * @returns {Promise<string[]>} - A list of filtered game script file names without the '.js' extension: `['legalmoves','checkdetection'...]`
 */
async function getAllGameScripts() {
	const gameDir = 'src/client/scripts/game';
	const jsFiles = await getExtFiles(gameDir, '.js');
    
	const gameScripts = jsFiles
		.map(file => path.basename(file, '.js')) // Get the base name without the extension
		.filter(baseName => baseName !== 'htmlscript'); // Exclude 'htmlscript'

	return gameScripts;
}

// remove dist
await remove("./dist", {
	recursive: true,
	force: true,
});

/** The relative path to play.ejs */
const playEJSPath = './dist/views/play.ejs';

if (!BUNDLE_FILES) {
	// in dev mode, copy all clientside files over to dist and exit
	await copy("./src/client", "./dist", {
		recursive: true,
		force: true
	});

	// Overwrite play.ejs, inserting the game script links into it
	const playEJS2 = await readFile(playEJSPath, 'utf8');
	const newPlayEJS2 = insertScriptLinkIntoHTML(playEJS2, '/scripts/game/main.js', true, { type: 'module', onerror: 'htmlscript.callback_LoadingError(event)', onload: 'htmlscript.removeOnerror.call(this);' });
	await writeFile(playEJSPath, newPlayEJS2, 'utf8');

} else {
	// in prod mode, copy all clientside files over to dist, except for those contained in scripts
	await copy("./src/client", "./dist", {
		recursive: true,
		force: true,
		filter: filename => { 
			return (!/(\\|\/)scripts(\\|\/)/.test(filename) || /(\\|\/)game$/.test(filename)) && !/(\\|\/)css(\\|\/)/.test(filename);
		}
	});

	// make a list of all client scripts:
	const clientFiles = [];
	const clientScripts = await getExtFiles("src/client/scripts", ".js");
	// If the client script is htmlscript.js or not in scripts/game, then minify it and copy it over
	clientFiles.push(...clientScripts.map(v => `scripts/${v}`)
		.filter(file => !/scripts(\\|\/)+game(\\|\/)/.test(file) || /\/htmlscript\.js$/.test(file)));

	// string containing all code in /game except for htmlscript.js: 

	for (const file of clientFiles) {
		const code = await readFile(`./src/client/${file}`, 'utf8');
		const minified = await swc.minify(code, {
			mangle: true, // Enable variable name mangling
			compress: true, // Enable compression
			sourceMap: false
		});
		writeFile_ensureDirectory(`./dist/${file}`, minified.code);
	}

	await compressGameScriptsIntoAppJS();

	// Overwrite play.ejs, inserting the game script link 'app.js' into it
	const playEJS = await readFile(playEJSPath, 'utf8');
	const newPlayEJS = insertScriptLinkIntoHTML(playEJS, '/scripts/game/app.js', true, { onerror: 'htmlscript.callback_LoadingError(event)', onload: '(() => { htmlscript.removeOnerror.call(this); })()' });
	await writeFile(playEJSPath, newPlayEJS, 'utf8');
  
	// Make a list of all css files
	const cssFiles = await getExtFiles("./src/client/css", ".css");
	for (const file of cssFiles) {
		// Minify css files
		const { code } = transform({
			targets: targets,
			code: Buffer.from(await readFile(`./src/client/css/${file}`, 'utf8')),
			minify: true,
		});
		// Write into /dist
		await writeFile(`./dist/css/${file}`, code, 'utf8');
	}
}

// Overwrite play.ejs, inserting the link for htmlscript.js into it
const playEJS = await readFile(playEJSPath, 'utf8');
const htmlscriptJS = await readFile('./dist/scripts/game/htmlscript.js');
const newPlayEJS = insertScriptIntoHTML(playEJS, htmlscriptJS, {}, '<!-- htmlscript inject here -->');
await writeFile(playEJSPath, newPlayEJS, 'utf8');

/**
 * This takes all game scripts (excluding htmlscript), and merges them
 * all into one script, name 'app.js'.
 */
async function compressGameScriptsIntoAppJS() {
	// esbuild takes all the ESM scripts that make up our game (excluding htmlscript),
	// and auto-turns them into normal CJS scripts, and merges them all into one app.js
	await esbuild.build({
		bundle: true,
		entryPoints: ['src/client/scripts/game/main.js'],
		outfile: './dist/scripts/game/app.js',
		legalComments: 'none' // Even skips copyright noticies, such as in gl-matrix
	});

	// swc takes the existing app.js and compresses/minifies it!
	const gamecode = await readFile(`./dist/scripts/game/app.js`, 'utf-8');
	const minifiedgame = await swc.minify(gamecode, {
		mangle: true,
		compress: true,
		sourceMap: false
	});
	await writeFile(`./dist/scripts/game/app.js`, minifiedgame.code, 'utf8');
}

export {
	getAllGameScripts
};