// build/client.ts

import { readFile } from 'node:fs/promises';
import { glob } from 'glob';
import path from 'node:path';
import fs from 'fs';
import esbuild, { BuildOptions, PluginBuild } from 'esbuild';
import swc from '@swc/core';
import browserslist from 'browserslist';
import { transform, browserslistToTargets } from 'lightningcss';
// @ts-ignore this package doesn't have a declaration file
import stripComments from 'glsl-strip-comments';

import { getESBuildLogStatusLogger } from './plugins.js';

// ================================= CONSTANTS =================================

// Targetted browsers for CSS transpilation
// Format: https://github.com/browserslist/browserslist?tab=readme-ov-file#query-composition
const cssTargets = browserslistToTargets(browserslist('defaults'));

/**
 * Any ES Module that any HTML document IMPORTS directly!
 * ADD TO THIS when we create new modules that nothing else depends on!
 * ESBuild has to build each of them and their dependancies
 * into their own bundle!
 */
const ESMEntryPoints = [
	'src/client/scripts/esm/game/main.ts',
	'src/client/scripts/esm/audio/processors/bitcrusher/BitcrusherProcessor.ts',
	'src/client/scripts/esm/audio/processors/downsampler/DownsamplerProcessor.ts',
	'src/client/scripts/esm/components/header/header.ts',
	'src/client/scripts/esm/views/index.ts',
	'src/client/scripts/esm/views/member.ts',
	'src/client/scripts/esm/views/leaderboard.ts',
	'src/client/scripts/esm/views/login.ts',
	'src/client/scripts/esm/views/news.ts',
	'src/client/scripts/esm/views/createaccount.ts',
	'src/client/scripts/esm/views/resetpassword.ts',
	'src/client/scripts/esm/views/guide.ts',
	'src/client/scripts/esm/views/admin.ts',
	'src/client/scripts/esm/views/icnvalidator.ts',
	'src/client/scripts/esm/game/chess/engines/engineCheckmatePractice.ts',
	'src/client/scripts/esm/game/chess/engines/hydrochess.ts',
	'src/client/scripts/esm/workers/icnvalidator.worker.ts',
];

/** CommonJS modules imported by html pages. */
const CJSEntryPoints = ['src/client/scripts/cjs/game/htmlscript.ts'];

// ================================= PLUGINS ===================================

const ESMBuildPlugin = getESBuildLogStatusLogger(
	'✅ Client ESM Build successful.',
	'❌ Client ESM Build failed.',
);

const CJSBuildPlugin = getESBuildLogStatusLogger(
	'✅ Client CJS Build successful.',
	'❌ Client CJS Build failed.',
);

/** An esbuild plugin object that minifies GLSL shader files by stripping comments. */
const GLSLMinifyPlugin = {
	name: 'glsl-minify',
	setup(build: PluginBuild) {
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
			} catch (error: unknown) {
				return {
					errors: [
						{
							text: `Failed to minify GLSL file: ${error instanceof Error ? error.message : String(error)}`,
							location: { file: args.path },
						},
					],
				};
			}
		});
	},
};

const ESMBuildOptions: BuildOptions = {
	bundle: true,
	entryPoints: ESMEntryPoints,
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
	format: 'esm',
	sourcemap: true, // Enables sourcemaps for debugging in the browser.
	// minify: true, // Enable minification. SWC is more compact so we don't use esbuild's
	plugins: [ESMBuildPlugin, GLSLMinifyPlugin],
	loader: { '.wasm': 'file' },
};

const CJSBuildOptions: BuildOptions = {
	bundle: true,
	entryPoints: CJSEntryPoints,
	outdir: './dist/client/scripts/cjs',
	outbase: 'src/client/scripts/cjs', // Without this, htmlscript.js gets put in cjs/ instead of cjs/game/
	format: 'cjs',
	sourcemap: true,
	plugins: [CJSBuildPlugin, GLSLMinifyPlugin],
};

// ================================= BUILDING ===================================

/** Builds the client's scripts and minifies css. */
export async function buildClient(isDev: boolean): Promise<void> {
	// console.log(`Building client in ${isDev ? 'DEVELOPMENT' : 'PRODUCTION'} mode...`);

	const ESMContext = await esbuild.context({
		...ESMBuildOptions,
		legalComments: isDev ? undefined : 'none', // Only strip copyright notices in production.
	});
	const CJSContext = await esbuild.context({
		...CJSBuildOptions,
		legalComments: isDev ? undefined : 'none', // Only strip copyright notices in production.
	});

	if (isDev) {
		await ESMContext.watch();
		await CJSContext.watch();
	} else {
		/**
		 * ESBuild takes each entry point and all of their dependencies and merges them bundling them into one file.
		 * If multiple entry points share dependencies, then those dependencies will be split into separate modules,
		 * which means they aren't duplicated, and there's only one instance of it per page.
		 * This also means more requests to the server, but not many.
		 */
		// Production
		// Build once and exit if not in watch mode
		await ESMContext.rebuild();
		ESMContext.dispose();

		await CJSContext.rebuild();
		CJSContext.dispose();

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

/**
 * Minifies all JavaScript files in a directory and writes them to an output directory.
 * @param inputDir - The directory to scan for scripts.
 * @param outputDir - The directory where the minified files will be written.
 * @param module - True if the scripts are ES Modules instead of CommonJS.
 * @returns Resolves when all files are minified.
 */
async function minifyScriptDirectory(
	inputDir: string,
	outputDir: string,
	module: boolean,
): Promise<void> {
	const files = await glob('**/*.js', { cwd: inputDir, nodir: true });

	for (const file of files) {
		const inputFilePath = path.join(inputDir, file);
		const outputFilePath = path.join(outputDir, file);

		const content = await readFile(inputFilePath, 'utf-8');
		const minified = await swc.minify(content, {
			mangle: true, // Enable variable name mangling
			compress: true, // Enable compression
			sourceMap: false,
			module, // Include if we're minifying ES Modules instead of Common JS
		});

		// Write the minified file to the output directory
		fs.mkdirSync(path.dirname(outputFilePath), { recursive: true });
		fs.writeFileSync(outputFilePath, minified.code);
		// console.log(`Minified: ${outputFilePath}`);
	}
}

/**
 * Minifies all CSS files from src/client/css/ directory
 * to the distribution directory, preserving the original structure.
 * @returns Resolves when all CSS files are processed.
 */
async function minifyCSSFiles(): Promise<void> {
	// Bundle and compress all css files
	const cssFiles = await glob('**/*.css', { cwd: './dist/client/css', nodir: true });
	for (const file of cssFiles) {
		// Minify css files
		const outputFilePath = `./dist/client/css/${file}`;
		const { code } = transform({
			targets: cssTargets,
			code: Buffer.from(await readFile(outputFilePath, 'utf8')),
			minify: true,
			filename: path.basename(outputFilePath),
		});
		// Write into /dist
		fs.mkdirSync(path.dirname(outputFilePath), { recursive: true });
		fs.writeFileSync(outputFilePath, code);
	}
}
