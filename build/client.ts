// build/client.ts

/**
 * The client build: bundles the entry points with esbuild, writes the asset manifest, and in
 * production further minifies the scripts with SWC and the CSS with lightningcss.
 */

import fs from 'fs';
import swc from '@swc/core';
import path from 'node:path';
import { glob } from 'glob';
import { readFile } from 'node:fs/promises';
import browserslist from 'browserslist';
// @ts-ignore this package doesn't have a declaration file
import stripComments from 'glsl-strip-comments';
import { transform, browserslistToTargets } from 'lightningcss';
import esbuild, { BuildOptions, Metafile, Plugin, PluginBuild } from 'esbuild';

import jsutil from '../src/shared/util/jsutil.js';

import { getESBuildLogStatusLogger } from './plugins.js';
import { getEngineGlueUrl, getEngineVersion } from './engine-wasm.js';

// Constants -------------------------------------------------------------------

// Targetted browsers for CSS transpilation
// Format: https://github.com/browserslist/browserslist?tab=readme-ov-file#query-composition
const CSS_TARGETS = browserslistToTargets(browserslist('defaults'));

/**
 * Any ES Module that any HTML document IMPORTS directly!
 * ADD TO THIS when we create new modules that nothing else depends on!
 * ESBuild has to build each of them and their dependancies
 * into their own bundle!
 */
export const ENTRY_POINTS = [
	// Stylesheets — bundled as content-hashed CSS entry points.
	'src/client/css/global.css',
	'src/client/css/header.css',
	'src/client/css/footer.css',
	'src/client/css/toast.css',
	'src/client/css/index.css',
	'src/client/css/login.css',
	'src/client/css/register-awaiting.css',
	'src/client/css/game.css',
	'src/client/css/challenge.css',
	'src/client/css/analysis.css',
	'src/client/css/variantselector.css',
	'src/client/css/icnvalidator.css',

	// Scripts
	'src/client/scripts/components/header/header.ts',
	'src/client/scripts/views/index/index.ts',
	'src/client/scripts/views/register.ts',
	'src/client/scripts/views/register-awaiting.ts',
	'src/client/scripts/views/verify.ts',
	'src/client/scripts/views/login.ts',
	'src/client/scripts/views/forgotpassword.ts',
	'src/client/scripts/views/resetpassword.ts',
	'src/client/scripts/views/game/game.ts',
	'src/client/scripts/views/challenge/challenge.ts',
	'src/client/scripts/views/analysis/analysis.ts',
	'src/client/scripts/views/icnvalidator/icnvalidator.ts',

	// Workers
	'src/client/scripts/views/analysis/apeironanalysis.worker.ts',
	'src/client/scripts/views/icnvalidator/icnvalidator.worker.ts',
	'src/client/scripts/game/chess/engines/apeiron.worker.ts',
	'src/client/scripts/game/chess/engines/enginecheckmatepractice.worker.ts',

	// Other
	'src/client/scripts/audio/processors/downsampler/DownsamplerProcessor.ts',

	// Dormant — pages whose code is not yet repurposed for the redesign.
	// 'src/client/scripts/views/leaderboard.ts',
	// 'src/client/scripts/views/news/news.ts',
	// 'src/client/scripts/views/guide.ts',
	// 'src/client/scripts/views/admin.ts',
	// 'src/client/scripts/views/checkmatepractice/checkmatepractice.ts',
];

// Plugins ---------------------------------------------------------------------

const BuildLogPlugin = getESBuildLogStatusLogger(
	'✅ Client Build successful.',
	'❌ Client Build failed.',
);

/**
 * Returns an esbuild plugin that resolves a promise once the initial esbuild build is complete.
 * BuildContext.watch() resolves only once the watch mode is SET UP, not when the first build is DONE,
 * so this provides a promise that ONLY resolves once the first build is done.
 * @returns An object containing the esbuild plugin and the promise to await.
 */
function getInitialBuildPlugin(): { plugin: Plugin; initialBuild: Promise<void> } {
	let isFirstBuild = true;

	let resolve: () => void;
	const promise = new Promise<void>((r) => {
		resolve = r;
	});

	const plugin: Plugin = {
		name: 'initial-build-waiter',
		setup(build: PluginBuild) {
			// This hook runs when a build has finished
			build.onEnd(() => {
				if (!isFirstBuild) return;
				isFirstBuild = false;
				// Signal that the first build is done, even if
				// there was an error, so that watch mode can continue.
				resolve();
			});
		},
	};

	return { plugin, initialBuild: promise };
}

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
							text: `Failed to minify GLSL file: ${jsutil.getErrorMessage(error)}`,
							location: { file: args.path },
						},
					],
				};
			}
		});
	},
};

/** An esbuild plugin that writes the asset manifest after every (re)build. */
const ManifestPlugin: Plugin = {
	name: 'write-manifest',
	setup(build: PluginBuild) {
		build.onEnd((result) => {
			if (result.metafile) writeManifest(result.metafile);
		});
	},
};

/**
 * Reads esbuild's metafile and writes dist/manifest.json — a flat map of
 * logical entry-point names (e.g. "scripts/views/index.ts") to their
 * web-relative output paths (e.g. "/scripts/views/index-ABCD1234.js").
 */
function writeManifest(metafile: Metafile): void {
	const manifest: Record<string, string> = {};

	for (const [rawOutputPath, output] of Object.entries(metafile.outputs)) {
		if (!output.entryPoint) continue; // Skip shared chunks — only track entry points.
		const key = output.entryPoint.replace(/^src\/client\//, ''); // "src/client/scripts/views/index.ts" → "scripts/views/index.ts"
		manifest[key] = '/' + rawOutputPath.replace(/^dist\/client\//, '');
	}

	// The engine glue can't be an esbuild entry point (it's served unbundled); copyEngineToDist
	// hashes it separately, so fold its URL in here so templates resolve it like any other asset.
	manifest['engine'] = getEngineGlueUrl();
	manifest['engineVersion'] = getEngineVersion();

	fs.writeFileSync('./dist/manifest.json', JSON.stringify(manifest, null, 2));
}

// Options ---------------------------------------------------------------------

/** How the build finds and loads modules — what any bundle needs to match the real build's. */
export const RESOLVE_OPTIONS = {
	bundle: true,
	format: 'esm',
	loader: { '.wasm': 'file' },
	// Font URLs in CSS (e.g. @font-face url('/fonts/...')) are absolute web paths — mark them
	// external so esbuild doesn't try to resolve them as files on disk.
	external: ['/fonts/*'],
	plugins: [GLSLMinifyPlugin],
} satisfies BuildOptions;

// Building --------------------------------------------------------------------

/** Builds the client's scripts and minifies css. */
export async function buildClient(isDev: boolean): Promise<void> {
	const { plugin: initialBuildPlugin, initialBuild } = getInitialBuildPlugin();

	const context = await esbuild.context({
		...RESOLVE_OPTIONS,
		entryPoints: ENTRY_POINTS,
		outdir: './dist/client',
		entryNames: '[dir]/[name]-[hash]', // Content-hash output file names
		chunkNames: 'scripts/[name]-[hash]',
		// Shared dependencies become their own chunks, so a page loads each once instead of
		// once per entry point that bundles it.
		splitting: true,
		sourcemap: true, // Enables sourcemaps for debugging in the browser.
		// No esbuild minification: production minifies with SWC, which is more compact.
		metafile: true, // Generate metadata about the build, which we use to create our own manifest.json
		legalComments: isDev ? undefined : 'none', // Only strip copyright notices in production.
		plugins: [BuildLogPlugin, ...RESOLVE_OPTIONS.plugins, initialBuildPlugin, ManifestPlugin],
	});

	if (isDev) {
		context.watch();
		await initialBuild;
	} else {
		await context.rebuild();
		context.dispose();
		await minifyScripts();
		await minifyCSSFiles();
	}
}

/** Minifies the built scripts in place. */
async function minifyScripts(): Promise<void> {
	const dir = './dist/client/scripts/';
	const files = await glob('**/*.js', { cwd: dir, nodir: true });

	for (const file of files) {
		const filePath = path.join(dir, file);
		const content = await readFile(filePath, 'utf-8');
		const minified = await swc.minify(content, {
			mangle: true, // Enable variable name mangling
			compress: true, // Enable compression
			sourceMap: false,
			module: true,
		});
		fs.writeFileSync(filePath, minified.code);
	}
}

/** Minifies the built CSS files in place. */
async function minifyCSSFiles(): Promise<void> {
	// Bundle and compress all css files
	const cssFiles = await glob('**/*.css', { cwd: './dist/client', nodir: true });
	for (const file of cssFiles) {
		// Minify css files
		const outputFilePath = `./dist/client/${file}`;
		const { code } = transform({
			targets: CSS_TARGETS,
			code: Buffer.from(await readFile(outputFilePath, 'utf8')),
			minify: true,
			filename: path.basename(outputFilePath),
		});
		// Write into /dist
		fs.mkdirSync(path.dirname(outputFilePath), { recursive: true });
		fs.writeFileSync(outputFilePath, code);
	}
}
