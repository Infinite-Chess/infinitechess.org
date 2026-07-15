// build/engine-wasm.ts

/**
 * Apeiron WASM Engine Setup Script
 *
 * This ensures that the Apeiron WASM engine is available.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as z from 'zod';

import { logZodError } from '../src/server/utility/zodlogger';

// Constants -------------------------------------------------------------------

/** Absolute path to the Apeiron WASM engine pkg directory */
const APEIRON_WASM_DIR = path.join(process.cwd(), 'src', 'client', 'pkg', 'apeiron');

/** API URL to check the latest released version */
const LATEST_RELEASE_API_URL =
	'https://api.github.com/repos/Infinite-Chess/hydrochess/releases/latest';

/** Zod schema for validating GitHub release API response */
const releaseDataSchema = z.object({
	tag_name: z.string(),
	assets: z.array(
		z.object({
			name: z.string(),
			browser_download_url: z.string(),
		}),
	),
});

/** Parent of the versioned engine dirs (dist/client is the web root, so these serve under /engine/). */
const ENGINE_DIST_DIR = path.join(process.cwd(), 'dist', 'client', 'engine');

/**
 * Web path (no trailing slash) of the content-versioned engine
 * dir, e.g. "/engine/1a2b3c4d". Set by {@link copyEngineToDist}.
 */
let engineWebBase: string | undefined;

/** Prefix for this script's console logs. */
const label = '[apeiron]';

// Functions -------------------------------------------------------------------

/**
 * Ensures the Apeiron WASM engine is available and up-to-date.
 * Automatically downloads the pre-built WASM if there is a new release.
 */
export async function downloadEngineWasm(): Promise<void> {
	const pkgDir = path.join(APEIRON_WASM_DIR, 'pkg');
	const wasmFile = path.join(pkgDir, 'apeiron_bg.wasm');
	const jsFile = path.join(pkgDir, 'apeiron.js');

	// Dev-opt-in: A manually created `pkg/.local-build` file means there's a
	// local build of the engine, do not replace it with a downloaded release.
	if (fs.existsSync(path.join(pkgDir, '.local-build'))) {
		console.log(`${label} Local engine build detected — skipping release download.`);
		return;
	}

	// Note: If you are manually rebuilding the engine binaries on a separate
	// vscode window with the apeiron repo open, and have setup a symlink
	// for this submodule to point to that project, then this file will be innacurate.
	// But it works because the local build process thinks we're already on the latest version.
	const versionFile = path.join(pkgDir, '.engine-version');

	// Download pre-built binary if new version available
	let localVersion = '';
	if (fs.existsSync(versionFile)) {
		localVersion = fs.readFileSync(versionFile, 'utf-8').trim();
	}

	let releaseData: z.infer<typeof releaseDataSchema>;

	try {
		const response = await fetch(LATEST_RELEASE_API_URL, {
			headers: { 'User-Agent': 'Infinite-Chess-Build-Script' },
		});
		if (!response.ok) throw new Error(`GitHub API failed: ${response.statusText}`);

		const rawReleaseData = await response.json();
		const parseResult = releaseDataSchema.safeParse(rawReleaseData);
		if (!parseResult.success) {
			logZodError(
				rawReleaseData,
				parseResult.error,
				`${label} GitHub API returned invalid data.`,
			);
			throw new Error(`GitHub API returned invalid data: ${parseResult.error.message}`);
		}

		releaseData = parseResult.data;
	} catch (error: unknown) {
		console.warn(
			`${label} Could not check for new version:`,
			error instanceof Error ? error.message : String(error),
		);
		if (fs.existsSync(wasmFile)) {
			console.log(`${label} Using existing local version.`);
			return;
		}
		// If we can't check and have no local copy, fail and inform the user.
		console.error(`${label} Automatic download failed and no local copy exists.`);
		return;
	}

	const remoteVersion = releaseData.tag_name;

	if (
		localVersion &&
		localVersion === remoteVersion &&
		fs.existsSync(wasmFile) &&
		fs.existsSync(jsFile)
	) {
		console.log(`${label} Engine is up-to-date (${localVersion}).`);
		return;
	}

	console.log(`${label} New version detected (${remoteVersion}). Downloading release...`);

	// Extract dynamic download URLs from the API response
	const wasmAsset = releaseData.assets.find((a) => a.name === 'apeiron_bg.wasm');
	const jsAsset = releaseData.assets.find((a) => a.name === 'apeiron.js');

	if (!wasmAsset || !jsAsset) {
		console.error(`${label} Release ${remoteVersion} is missing required asset files.`);
		return;
	}

	try {
		await fs.promises.mkdir(pkgDir, { recursive: true });

		const downloadFile = async (url: string, dest: string): Promise<void> => {
			const response = await fetch(url);
			if (!response.ok) throw new Error(`Failed to download ${url}: ${response.statusText}`);
			const buffer = Buffer.from(await response.arrayBuffer());
			await fs.promises.writeFile(dest, buffer);
			console.log(`${label} Downloaded ${path.basename(dest)}`);
		};

		await Promise.all([
			downloadFile(wasmAsset.browser_download_url, wasmFile),
			downloadFile(jsAsset.browser_download_url, jsFile),
		]);

		// Stamp the downloaded version
		await fs.promises.writeFile(versionFile, remoteVersion);

		console.log(`${label} Apeiron engine is ready (${remoteVersion}).`);
	} catch (error) {
		console.error(
			`${label} Automatic download failed:`,
			error instanceof Error ? error.message : String(error),
		);
	}
}

/**
 * Copies the engine pkg (wasm-bindgen glue, .wasm, rayon `snippets/`) into a content-hashed
 * `dist/client/engine/<hash>/`. Served UNBUNDLED because rayon self-spawns its threads via the
 * glue's own `import.meta.url`, which needs the files as real served siblings (bundling breaks it).
 * The `<hash>` busts stale browser/CDN caches on an engine update. Must run before the client
 * build so the hashed URL lands in the manifest.
 */
export function copyEngineToDist(): void {
	const pkgDir = path.join(APEIRON_WASM_DIR, 'pkg');
	const glueSrc = path.join(pkgDir, 'apeiron.js');
	const wasmSrc = path.join(pkgDir, 'apeiron_bg.wasm');
	if (!fs.existsSync(glueSrc)) {
		console.warn(`${label} Engine pkg not found; skipping dist/engine copy.`);
		return;
	}
	// Hash glue + wasm together; either changing (a new release or local rebuild) busts the cache.
	const hash = crypto
		.createHash('sha256')
		.update(fs.readFileSync(glueSrc))
		.update(fs.readFileSync(wasmSrc))
		.digest('hex')
		.slice(0, 8);
	const versionedDir = path.join(ENGINE_DIST_DIR, hash);

	fs.mkdirSync(versionedDir, { recursive: true });
	for (const file of ['apeiron.js', 'apeiron_bg.wasm']) {
		fs.copyFileSync(path.join(pkgDir, file), path.join(versionedDir, file));
	}
	const snippets = path.join(pkgDir, 'snippets');
	if (fs.existsSync(snippets)) {
		fs.cpSync(snippets, path.join(versionedDir, 'snippets'), { recursive: true });
	}
	engineWebBase = `/engine/${hash}`;
	console.log(`${label} Copied engine pkg to dist/client/engine/${hash}.`);
}

/**
 * Manifest URL of the engine glue for the analysis page, or undefined if the engine pkg wasn't
 * copied. Folded into dist/manifest.json by the client build's manifest writer, then handed to
 * the worker via the page's `analysisPageData` — the same channel as the hashed worker URL.
 */
export function getEngineGlueUrl(): string | undefined {
	return engineWebBase !== undefined ? `${engineWebBase}/apeiron.js` : undefined;
}
