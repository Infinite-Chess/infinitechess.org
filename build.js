// build.js

/**
 * This script deploys all files and assets from /src/client to /dist in order to run the website.
 *
 * Development mode: Transpile all TypeScript files to JavaScript.
 * Production mode: Transpile and bundle all TypeScript files to JavaScript, and minify via @swc/core.
 * 					Further, all css files are minified by lightningcss.
 */

import { readFile } from 'node:fs/promises';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import swc from "@swc/core";
import browserslist from 'browserslist';
import { transform, browserslistToTargets } from 'lightningcss';
import { glob } from 'glob';
import esbuild from 'esbuild';
import path from 'node:path';
import stripComments from 'glsl-strip-comments';

// Local imports
import {
	getAllFilesInDirectoryWithExtension,
	writeFile_ensureDirectory,
} from './src/server/utility/fileUtils.js';
import { DEV_BUILD } from './src/server/config/config.js';

// ================================= CONSTANTS =================================

// Targetted browsers for CSS transpilation
// Format: https://github.com/browserslist/browserslist?tab=readme-ov-file#query-composition
const cssTargets = browserslistToTargets(browserslist('defaults'));

// Absolute path to the HydroChess WASM engine submodule (if present)
const HYDROCHESS_WASM_DIR = path.join(
	process.cwd(),
	'src',
	'client',
	'scripts',
	'esm',
	'game',
	'chess',
	'engines',
	'hydrochess-wasm',
);

function hasCommand(cmd) {
	try {
		const res = spawnSync(cmd, ['--version'], { stdio: 'ignore' });
		return res.status === 0;
	} catch {
		return false;
	}
}

/**
 * Ensure the hydrochess-wasm submodule (if present) has a built web WASM in pkg/.
 * - If the directory is missing or empty: log info about initializing the submodule.
 * - If pkg/hydrochess_wasm_bg.wasm is missing: try to build with wasm-pack.
 *   If cargo/wasm-pack are missing, log guidance.
 * This never throws; it only logs and returns so normal JS builds still work.
 */
function ensureHydroChessWasmBuilt() {
	const label = '[hydrochess-wasm]';

	if (!fs.existsSync(HYDROCHESS_WASM_DIR)) {
		console.warn(`${label} Engine submodule directory not found at ${HYDROCHESS_WASM_DIR}`);
		console.warn(`${label} If you want the Rust WASM engine, run:`);
		console.warn(`${label}   git submodule update --init --remote`);
		console.warn(`${label} Then restart the dev server or rebuild.`);
		console.warn(`${label} Alternatively, you can download a prebuilt 'pkg' directory from:`);
		console.warn(`${label}   https://github.com/FirePlank/infinite-chess-engine/releases`);
		console.warn(`${label} Unpack it and copy the 'pkg' folder into:`);
		console.warn(`${label}   ${HYDROCHESS_WASM_DIR}`);
		return;
	}

	const entries = fs.readdirSync(HYDROCHESS_WASM_DIR).filter((name) => !name.startsWith('.'));
	if (entries.length === 0) {
		console.warn(`${label} Engine submodule directory is empty.`);
		console.warn(`${label} If you cloned without submodules, run:`);
		console.warn(`${label}   git submodule update --init --remote`);
		console.warn(`${label} Then restart the dev server or rebuild.`);
		console.warn(`${label} Alternatively, download a prebuilt 'pkg' directory from:`);
		console.warn(`${label}   https://github.com/FirePlank/infinite-chess-engine/releases`);
		console.warn(`${label} Unpack it and copy the 'pkg' folder into:`);
		console.warn(`${label}   ${HYDROCHESS_WASM_DIR}`);
		return;
	}

	const pkgDir = path.join(HYDROCHESS_WASM_DIR, 'pkg');
	const wasmFile = path.join(pkgDir, 'hydrochess_wasm_bg.wasm');
	if (fs.existsSync(wasmFile)) {
		// Already built; nothing to do.
		return;
	}

	if (!hasCommand('cargo')) {
		console.warn(`${label} 'cargo' was not found on PATH.`);
		console.warn(`${label} Install Rust (which includes cargo) from https://rustup.rs, then rerun the build.`);
		console.warn(`${label} Alternatively, download a prebuilt 'pkg' directory from:`);
		console.warn(`${label}   https://github.com/FirePlank/infinite-chess-engine/releases`);
		console.warn(`${label} Unpack it and copy the 'pkg' folder into:`);
		console.warn(`${label}   ${HYDROCHESS_WASM_DIR}`);
		return;
	}

	if (!hasCommand('wasm-pack')) {
		console.warn(`${label} 'wasm-pack' was not found on PATH.`);
		console.warn(`${label} Install it with: cargo install wasm-pack`);
		console.warn(`${label} Then rerun the build.`);
		console.warn(`${label} Alternatively, download a prebuilt 'pkg' directory from:`);
		console.warn(`${label}   https://github.com/FirePlank/infinite-chess-engine/releases`);
		console.warn(`${label} Unpack it and copy the 'pkg' folder into:`);
		console.warn(`${label}   ${HYDROCHESS_WASM_DIR}`);
		return;
	}

	console.log(`${label} Building WASM engine with wasm-pack (target=web -> pkg)...`);
	const result = spawnSync('wasm-pack', ['build', '--target', 'web', '--out-dir', 'pkg'], {
		cwd: HYDROCHESS_WASM_DIR,
		stdio: 'inherit',
	});
	if (result.status !== 0) {
		console.error(`${label} wasm-pack build failed with exit code ${result.status}. See output above.`);
	} else {
		console.log(`${label} Build complete (pkg/).`);
	}
}


/**
 * Any ES Module that any HTML document IMPORTS directly!
 * ADD TO THIS when we create new modules that nothing else depends on!
 *
 * ESBuild has to build each of them and their dependancies
 * into their own bundle!
 */
const clientEntryPoints = [
	'src/client/scripts/esm/game/main.js',
	'src/client/scripts/esm/audio/processors/bitcrusher/BitcrusherProcessor.ts',
	'src/client/scripts/esm/audio/processors/downsampler/DownsamplerProcessor.ts',
	'src/client/scripts/esm/components/header/header.js',
	'src/client/scripts/esm/views/index.ts',
	'src/client/scripts/esm/views/member.ts',
	'src/client/scripts/esm/views/leaderboard.ts',
	'src/client/scripts/esm/views/login.ts',
	'src/client/scripts/esm/views/news.ts',
	'src/client/scripts/esm/views/createaccount.js',
	'src/client/scripts/esm/views/resetpassword.ts',
	'src/client/scripts/esm/views/guide.js',
	'src/client/scripts/esm/views/admin.ts',
	'src/client/scripts/esm/game/chess/engines/engineCheckmatePractice.ts',
	'src/client/scripts/esm/game/chess/engines/hydrochess.js',
];
const serverEntryPoints = await glob(['src/server/**/*.{ts,js}', 'src/shared/**/*.{ts,js}'], {
	ignore: ['**/*.test.{ts,js}'],
});

const esbuildClientRebuildPlugin = getESBuildLogRebuildPlugin(
	'✅ Client Build successful.',
	'❌ Client Build failed.',
);
const esbuildServerRebuildPlugin = getESBuildLogRebuildPlugin(
	'✅ Server Build successful.',
	'❌ Server Build failed.',
);

/** An esbuild plugin that logs whenever a build is finished. */
function getESBuildLogRebuildPlugin(successMessage, failureMessage) {
	return {
		name: 'log-rebuild',
		setup(build) {
			// This hook runs when a build has finished
			build.onEnd((result) => {
				if (result.errors.length > 0) console.error(failureMessage);
				else console.log(successMessage);
			});
		},
	};
}

/** An esbuild plugin object that minifies GLSL shader files by stripping comments. */
const GLSLMinifyPlugin = {
	name: 'glsl-minify',
	setup(build) {
		// Intercept .glsl files and minify them
		build.onLoad({ filter: /\.glsl$/ }, async (args) => {
			try {
				// Read the GLSL file
				const source = await readFile(args.path, 'utf8');
				// Strip comments from the GLSL source
				const minified = stripComments(source);
				// Return the minified content as text
				return {
					contents: minified,
					loader: 'text',
				};
			} catch (error) {
				return {
					errors: [
						{
							text: `Failed to minify GLSL file: ${error.message}`,
							location: { file: args.path },
						},
					],
				};
			}
		});
	},
};

const esbuildClientOptions = {
	bundle: true,
	entryPoints: clientEntryPoints,
	outdir: './dist/client/scripts/esm',
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
	plugins: [esbuildClientRebuildPlugin, GLSLMinifyPlugin],
	loader: { '.wasm': 'file' },
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
	} else {
		/**
		 * ESBuild takes each entry point and all of their dependencies and merges them bundling them into one file.
		 * If multiple entry points share dependencies, then those dependencies will be split into separate modules,
		 * which means they aren't duplicated, and there's only one instance of it per page.
		 * This also means more requests to the server, but not many.
		 */
		// Production
		// Build once and exit if not in watch mode
		await context.rebuild();
		context.dispose();
		// console.log('Client esbuild bundling complete.');

		// Minify JS and CSS
		// console.log('Minifying production assets...');
		// Further minify them. This cuts off their size a further 60%!!!
		await minifyScriptDirectory(
			'./dist/client/scripts/cjs/',
			'./dist/client/scripts/cjs/',
			false,
		);
		await minifyScriptDirectory(
			'./dist/client/scripts/esm/',
			'./dist/client/scripts/esm/',
			true,
		);
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
	const cssFiles = await getAllFilesInDirectoryWithExtension('./dist/client/css', '.css');
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
if (USE_DEVELOPMENT_BUILD && !DEV_BUILD)
	throw Error("Cannot run `npm run dev` when NODE_ENV environment variable is 'production'!");

// Optionally build the HydroChess Rust WASM engine submodule if available.
// This is best-effort and will only emit warnings if tools/submodule are missing.
ensureHydroChessWasmBuilt();

// Await all so the script doesn't finish and node terminate before esbuild is done.
await Promise.all([
	buildClient(USE_DEVELOPMENT_BUILD),
	buildServer(USE_DEVELOPMENT_BUILD)
]);

// console.log('Build process finished.');
