
// build.js

/**
 * This script deploys all files and assets from /src/client to /dist in order to run the website.
 * 
 * Development mode: Transpile all TypeScript files to JavaScript.
 * Production mode: Transpile and bundle all TypeScript files to JavaScript, and minify via @swc/core.
 * 					Further, all css files are minified by lightningcss.
 */

import { readFile } from 'node:fs/promises';
import swc from "@swc/core";
import browserslist from 'browserslist';
import { transform, browserslistToTargets } from 'lightningcss';
import { glob } from 'glob';
import esbuild from 'esbuild';
import path from "node:path";

// Local imports
import { getAllFilesInDirectoryWithExtension, writeFile_ensureDirectory } from './src/server/utility/fileUtils.js';
import { DEV_BUILD } from './src/server/config/config.js';


// ================================= CONSTANTS =================================


// Targetted browsers for CSS transpilation
// Format: https://github.com/browserslist/browserslist?tab=readme-ov-file#query-composition
const cssTargets = browserslistToTargets(browserslist('defaults'));


/**
 * Any ES Module that any HTML document IMPORTS directly!
 * ADD TO THIS when we create new modules that nothing else depends on!
 * 
 * ESBuild has to build each of them and their dependancies
 * into their own bundle!
 */
const clientEntryPoints = [
	'src/client/scripts/esm/modifiers/atomic.ts',
	'src/client/scripts/esm/game/main.js',
	'src/client/scripts/esm/components/header/header.js',
	'src/client/scripts/esm/views/index.ts',
	'src/client/scripts/esm/views/member.ts',
	'src/client/scripts/esm/views/leaderboard.ts',
	'src/client/scripts/esm/views/login.ts',
	'src/client/scripts/esm/views/createaccount.js',
	'src/client/scripts/esm/views/resetpassword.ts',
	'src/client/scripts/esm/game/chess/engines/engineCheckmatePractice.ts',
];
const serverEntryPoints = await glob(['src/server/**/*.{ts,js}', 'src/shared/**/*.{ts,js}']);

const esbuildClientRebuildPlugin = getESBuildLogRebuildPlugin('✅ Client Build successful.', '❌ Client Build failed.');
const esbuildServerRebuildPlugin = getESBuildLogRebuildPlugin('✅ Server Build successful.', '❌ Server Build failed.');

/** An esbuild plugin that logs everyone a build is finished. */
function getESBuildLogRebuildPlugin(successMessage, failureMessage) {
	return {
		name: 'log-rebuild',
		setup(build) {
			// This hook runs when a build has finished
			build.onEnd(result => {
				if (result.errors.length > 0) console.error(failureMessage);
				else console.log(successMessage);
			});
		},
	};
}

const esbuildClientOptions = {
	bundle: true,
	entryPoints: clientEntryPoints,
	outdir: './dist/client/scripts/esm',
	// Use the 'text' loader for shader files
	loader: { '.glsl': 'text' }, // Any file import ending in .glsl is loaded as a raw text string
	/**
	 * Enable code splitting, which means if multiple entry points require the same module,
	 * that dependancy will be separated out of both of them which means it isn't duplicated,
	 * and there's only one instance of it per page.
	 * This also means more requests to the server, but not many.
	 * If this is false, multiple copies of the same code may be loaded onto a page,
	 * each belonging to a separate entry point module.
	 */
	splitting: true, 
	format: 'esm', // or 'cjs' for Common JS
	sourcemap: true, // Enables sourcemaps for debugging in the browser.
	// allowOverwrite: true, // Not needed?
	// minify: true, // Enable minification. SWC is more compact so we don't use esbuild's
	plugins: [esbuildClientRebuildPlugin],
};

const esbuildServerOptions = {
	// Transpile all TS files from BOTH directories
	entryPoints: serverEntryPoints, 
	platform: 'node',
	bundle: false, // No bundling for the server. Just transpile each file individually
	outdir: 'dist',
	format: 'esm',
	sourcemap: true, // Patches file paths from server console errors to the correct src/ file
	plugins: [esbuildServerRebuildPlugin],
};


// ================================ BUILDING =================================


/** Builds the client's scripts and assets. */
async function buildClient(isDev) {
	// console.log(`Building client in ${isDev ? 'DEVELOPMENT' : 'PRODUCTION'} mode...`);

	const context = await esbuild.context({
		...esbuildClientOptions,
		legalComments: isDev ? undefined : 'none', // Only strip copyright notices in production.
	});

	if (isDev) {
		await context.watch();
		// console.log('esbuild is watching for CLIENT changes...');
	}
	/**
	 * ESBuild takes each entry point and all of their dependencies and merges them bundling them into one file.
	 * If multiple entry points share dependencies, then those dependencies will be split into separate modules,
	 * which means they aren't duplicated, and there's only one instance of it per page.
	 * This also means more requests to the server, but not many.
	 */
	else { // Production
		// Build once and exit if not in watch mode
		await context.rebuild();
		context.dispose();
		// console.log('Client esbuild bundling complete.');

		// Minify JS and CSS
		// console.log('Minifying production assets...');
		// Further minify them. This cuts off their size a further 60%!!!
		await minifyScriptDirectory('./dist/client/scripts/cjs/', './dist/client/scripts/cjs/', false);
		await minifyScriptDirectory('./dist/client/scripts/esm/', './dist/client/scripts/esm/', true);
		await minifyCSSFiles();
	}
}

/** Builds the server's scripts, transpiling them all into javascript (no bundling). */
async function buildServer(isDev) {
	// console.log(`Building server in ${isDev ? 'DEVELOPMENT' : 'PRODUCTION'} mode...`);

	const context = await esbuild.context(esbuildServerOptions);

	if (isDev) {
		await context.watch();
		// console.log('esbuild is watching for SERVER changes...');
	} else {
		await context.rebuild();
		context.dispose();
		// console.log('Server build complete.');
	}
}


/**
 * Minifies all JavaScript files in a directory and writes them to an output directory.
 * @param {string} inputDir - The directory to scan for scripts.
 * @param {string} outputDir - The directory where the minified files will be written.
 * @param {boolean} isModule - True if the scripts are ES Modules instead of CommonJS.
 * @returns {Promise<void>} Resolves when all files are minified.
 */
async function minifyScriptDirectory(inputDir, outputDir, isModule) {
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
	const cssFiles = await getAllFilesInDirectoryWithExtension("./dist/client/css", ".css");
	for (const file of cssFiles) {
		// Minify css files
		const { code } = transform({
			targets: cssTargets,
			code: Buffer.from(await readFile(`./dist/client/css/${file}`, 'utf8')),
			minify: true,
		});
		// Write into /dist
		writeFile_ensureDirectory(`./dist/client/css/${file}`, code);
	}
}


// ================================ START BUILD ================================


/** Whether additional minifying of bundled scripts and css files should be skipped. */
const USE_DEVELOPMENT_BUILD = process.argv.includes('--dev');
if (USE_DEVELOPMENT_BUILD && !DEV_BUILD) throw Error("Cannot run `npm run dev` when NODE_ENV environment variable is 'production'!");

// Await all so the script doesn't finish and node terminate before esbuild is done.
await Promise.all([
    buildClient(USE_DEVELOPMENT_BUILD),
    buildServer(USE_DEVELOPMENT_BUILD)
]);

// console.log('Build process finished.');
