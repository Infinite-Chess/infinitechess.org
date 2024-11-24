// This script deploys all files from /src/client to /dist in order to run the website.
// Depending on the value of DEV_BUILD in /src/server/config/config.js, this happens either in development mode or in production mode.
// Development mode: All files are simply copied over unmodified.
// Production mode: All non-script and non-css assets are copied over unmodified,
//                  but all ESM scripts are bundled by esbuild,
//					all scripts are then minified with the use of @swc/core,
//                  Further, all css files are minified by lightningcss.

import { cp as copy, rm as remove, readFile, writeFile } from 'node:fs/promises';
import swc from "@swc/core";
import browserslist from 'browserslist';
import { transform, browserslistToTargets } from 'lightningcss';
import { insertScriptIntoHTML } from './src/server/utility/HTMLScriptInjector.js';
import { BUNDLE_FILES } from './src/server/config/config.js';
import esbuild from 'esbuild';
import path from "node:path";
import { getAllFilesInDirectoryWithExtension, writeFile_ensureDirectory } from './src/server/utility/fileUtils.js';


/**
 * Any ES Module that any HTML document IMPORTS directly!
 * ADD TO THIS when we create new modules that nothing else depends on!
 * 
 * ESBuild has to build each of them and their dependancies
 * into their own bundle!
 */
const entryPoints = [
	'src/client/scripts/esm/game/main.js',
	'src/client/scripts/esm/components/header/header.js',
	'src/client/scripts/esm/views/member.js',
];

// Targetted browsers for CSS transpilation
// Format: https://github.com/browserslist/browserslist?tab=readme-ov-file#query-composition
const targets = browserslistToTargets(browserslist('defaults'));



/**
 * ESBuild takes each entry point and all of their dependencies and merges them bundling them into one file.
 * If multiple entry points share dependencies, then those dependencies will be split into separate modules,
 * which means they aren't duplicated, and there's only one instance of it per page.
 * This also means more requests to the server, but not many.
 */
async function bundleESMScripts() {
	await esbuild.build({
		bundle: true,
		entryPoints,
		// outfile: './dist/scripts/game/main.js', // Old, for a single entry point
		outdir: './dist/scripts/esm',
		/**
		 * Enable code splitting, which means if multiple entry points require the same module,
		 * that dependancy will be separated out of both of them which means it isn't duplicated,
		 * and there's only one instance of it per page.
		 * This also means more requests to the server, but not many.
		 * If this is false, multiple copies of the same code may be loaded onto a page,
		 * each belonging to a separate entry point module.
		 */
		splitting: true, 
		legalComments: 'none', // Even skips copyright noticies, such as in gl-matrix
		format: 'esm', // or 'cjs' for Common JS
	});

	// Further minify them. This cuts off their size a further 60%!!!
	await minifyDirectory('./dist/scripts/esm/', './dist/scripts/esm/', true); // true for ES Modules
}

/**
 * Minifies all JavaScript files in a directory and writes them to an output directory.
 * @param {string} inputDir - The directory to scan for scripts.
 * @param {string} outputDir - The directory where the minified files will be written.
 * @param {boolean} isModule - True if the scripts are ES Modules instead of CommonJS.
 * @returns {Promise<void>} Resolves when all files are minified.
 */
async function minifyDirectory(inputDir, outputDir, isModule) {
	const files = await getAllFilesInDirectoryWithExtension(inputDir, '.js');
	
	for (const file of files) {
		const inputFilePath = path.join(inputDir, file);
		const outputFilePath = path.join(outputDir, file);

		const content = await readFile(inputFilePath, 'utf-8');
		const minified = await swc.minify(content, {
			mangle: true, // Enable variable name mangling
			compress: true, // Enable compression
			sourceMap: false,
			module: isModule, // Include if we're minifying ES Modules instead of Common JS
		});
		
		// Write the minified file to the output directory
		writeFile_ensureDirectory(outputFilePath, minified.code);
		// console.log(`Minified: ${outputFilePath}`);
	}
}

/**
 * Minifies all CSS files from src/client/css/ directory
 * to the distribution directory, preserving the original structure.
 * @returns {Promise<void>} Resolves when all CSS files are processed.
 */
async function minifyCSSFiles() {
	// Bundle and compress all css files
	const cssFiles = await getAllFilesInDirectoryWithExtension("./src/client/css", ".css");
	for (const file of cssFiles) {
		// Minify css files
		const { code } = transform({
			targets: targets,
			code: Buffer.from(await readFile(`./src/client/css/${file}`, 'utf8')),
			minify: true,
		});
		// Write into /dist
		await writeFile_ensureDirectory(`./dist/css/${file}`, code);
	}
}



// Delete the built "dist" folder from the last run
await remove("./dist", {
	recursive: true,
	force: true,
});


if (!BUNDLE_FILES) {
	/**
	 * In development, copy all clientside files directly over to /dist AS THEY ARE.
	 * No files are bundled. This means a LOT of requests! But, all our comments are there!
	 */

	await copy("./src/client", "./dist", {
		recursive: true,
		force: true
	});

} else { // BUNDLE files in production! Far fewer requests, and each file is significantly smaller!

	// Copy EVERYTHING over from src/client/ into dist/ EXCEPT SCRIPTS and CSS files,
	// because those are compressed and minified manually.
	await copy("./src/client", "./dist", {
		recursive: true,
		force: true,
		filter: filename => { // Only pass if it is not a script or css file.
			return !/(\\|\/)scripts/.test(filename) && !/(\\|\/)css/.test(filename);
		}
	});

	// Minify all CJS scripts and copy them over to dist/
	await minifyDirectory('src/client/scripts/cjs/', './dist/scripts/cjs/', false); // false for CommonJS Modules

	// Bundle and Minify all ESM scripts and copy them over to dist/
	await bundleESMScripts();

	// Bundle and compress all css files
	await minifyCSSFiles();
}

// Overwrite play.ejs, directly inserting htmlscript.js into it.
/** The relative path to play.ejs */
const playEJSPath = './dist/views/play.ejs';
const playEJS = await readFile(playEJSPath, 'utf8');
const htmlscriptJS = await readFile('./dist/scripts/cjs/game/htmlscript.js');
const newPlayEJS = insertScriptIntoHTML(playEJS, htmlscriptJS, {}, '<!-- htmlscript inject here -->');
await writeFile(playEJSPath, newPlayEJS, 'utf8');
