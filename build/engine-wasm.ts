// build/engine-wasm.ts

/**
 * Provides the Apeiron WASM engine to the build: fetches its latest release into the pkg dir,
 * falling back to the local copy, then copies it into dist under a content hash.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as z from 'zod';
import { unzipSync } from 'fflate';

import jsutil from '../src/shared/util/jsutil.js';
import zodLogger from '../src/server/utility/zodLogger.js';

// Constants -------------------------------------------------------------------

/** Absolute path to the Apeiron WASM engine pkg directory */
const PKG_DIR = path.join(process.cwd(), 'src', 'client', 'pkg', 'apeiron', 'pkg');
/** The wasm-bindgen glue inside the pkg. */
const GLUE_FILE = path.join(PKG_DIR, 'apeiron.js');
/** The engine binary inside the pkg. */
const WASM_FILE = path.join(PKG_DIR, 'apeiron_bg.wasm');
/**
 * The release tag the local copy was downloaded from. If you are manually rebuilding the engine
 * binaries on a separate vscode window with the apeiron repo open, and have setup a symlink for
 * this submodule to point to that project, then this file will be inaccurate. But it works
 * because the local build process thinks we're already on the latest version.
 */
const VERSION_FILE = path.join(PKG_DIR, '.engine-version');

/** API URL to check the latest released version */
const LATEST_RELEASE_API_URL =
	'https://api.github.com/repos/Infinite-Chess/apeiron/releases/latest';

/** Parent of the versioned engine dirs (dist/client is the web root, so these serve under /engine/). */
const ENGINE_DIST_DIR = path.join(process.cwd(), 'dist', 'client', 'engine');

/** Prefix for this script's console logs. */
const LABEL = '[apeiron]';

// Schemas ---------------------------------------------------------------------

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

// State -----------------------------------------------------------------------

/**
 * Served URL of the content-versioned engine glue
 * (e.g. "/engine/1a2b3c4d/apeiron.js"). Set by {@link copyEngineToDist}.
 */
let engineGlueUrl: string;

/**
 * The engine's semver (e.g. "2.0.0"), or `'dev'` for a local build.
 * Set by {@link downloadEngineWasm}.
 */
let engineVersion: string;

// Functions -------------------------------------------------------------------

/**
 * Ensures the Apeiron WASM engine is available and up-to-date.
 * Automatically downloads the pre-built WASM if there is a new release.
 * @throws If it can't get the release and has no local copy.
 */
export async function downloadEngineWasm(): Promise<void> {
	// Dev-opt-in: A manually created `pkg/.local-build` file means there's a
	// local build of the engine, do not replace it with a downloaded release.
	if (fs.existsSync(path.join(PKG_DIR, '.local-build'))) {
		console.log(`${LABEL} Local engine build detected — skipping release download.`);
		engineVersion = 'dev'; // A local build carries no release tag to parse a version from.
		return;
	}

	const localVersion = fs.existsSync(VERSION_FILE) ? fs.readFileSync(VERSION_FILE, 'utf-8').trim() : ''; // prettier-ignore
	const hasLocalCopy = fs.existsSync(WASM_FILE) && fs.existsSync(GLUE_FILE);

	try {
		await syncLatestRelease(localVersion, hasLocalCopy);
	} catch (error: unknown) {
		const reason = jsutil.getErrorMessage(error);
		// Without an engine the server can't start, so fail the build here with the real reason.
		if (!hasLocalCopy) throw new Error(`${LABEL} No engine: ${reason}, and no local copy exists.`); // prettier-ignore
		console.warn(`${LABEL} ${reason}. Using the existing local copy.`);
		engineVersion = parseEngineVersion(localVersion);
	}
}

/** Downloads the latest release into the pkg dir, unless the local copy is already it. */
async function syncLatestRelease(localVersion: string, hasLocalCopy: boolean): Promise<void> {
	const releaseData = await fetchLatestRelease();
	const remoteVersion = releaseData.tag_name;

	if (hasLocalCopy && localVersion === remoteVersion) {
		console.log(`${LABEL} Engine is up-to-date (${localVersion}).`);
		engineVersion = parseEngineVersion(remoteVersion);
		return;
	}

	console.log(`${LABEL} New version detected (${remoteVersion}). Downloading release...`);

	// The engine ships as a single zip of its whole wasm-pack `pkg/` dir — a flat list of loose
	// release assets can't carry the nested rayon `snippets/` tree that apeiron.js imports.
	const zipAsset = releaseData.assets.find((a) => a.name === 'apeiron-wasm.zip');
	if (!zipAsset) throw new Error(`Release ${remoteVersion} is missing apeiron-wasm.zip`);

	// Fetch fully into memory first, so a failed download leaves any existing local copy intact.
	const response = await fetch(zipAsset.browser_download_url);
	if (!response.ok) throw new Error(`Engine zip download failed: ${response.status} ${response.statusText}`); // prettier-ignore
	const entries = unzipSync(new Uint8Array(await response.arrayBuffer()));

	// Replace pkg wholesale so no file from a prior version lingers. The version is re-stamped below.
	await fs.promises.rm(PKG_DIR, { recursive: true, force: true });
	await Promise.all(
		Object.entries(entries).map(async ([entryPath, bytes]) => {
			if (entryPath.endsWith('/')) return; // Skip dir entries; parents are made from file paths.
			const dest = path.join(PKG_DIR, entryPath);
			await fs.promises.mkdir(path.dirname(dest), { recursive: true });
			await fs.promises.writeFile(dest, bytes);
		}),
	);

	await fs.promises.writeFile(VERSION_FILE, remoteVersion);
	engineVersion = parseEngineVersion(remoteVersion);

	console.log(`${LABEL} Apeiron engine is ready (${remoteVersion}).`);
}

/** Fetches and validates the latest release's metadata from the GitHub API. */
async function fetchLatestRelease(): Promise<z.infer<typeof releaseDataSchema>> {
	const headers = new Headers({ 'User-Agent': 'Infinite-Chess-Build-Script' });
	// CI's token lifts the 60/hour per-IP limit, which other jobs sharing the runner's IP use up.
	const token = process.env['GITHUB_TOKEN'];
	if (token) headers.set('Authorization', `Bearer ${token}`);
	const response = await fetch(LATEST_RELEASE_API_URL, { headers });
	if (!response.ok) throw new Error(`Could not check for a new version: GitHub API returned ${response.status} ${await response.text()}`); // prettier-ignore

	const rawReleaseData = await response.json();
	const parseResult = releaseDataSchema.safeParse(rawReleaseData);
	if (!parseResult.success) {
		zodLogger.log(
			rawReleaseData,
			parseResult.error,
			`${LABEL} GitHub API returned invalid data.`,
		);
		throw new Error(`GitHub API returned invalid data: ${parseResult.error.message}`);
	}
	return parseResult.data;
}

/**
 * Parses the engine's semver from a release tag: drops the `v` prefix
 * and any SemVer `+build.N` metadata, e.g. "v2.0.0+build.47" → "2.0.0".
 */
function parseEngineVersion(tag: string): string {
	return tag.replace(/^v/, '').split('+')[0] || '';
}

/**
 * Copies the engine pkg (wasm-bindgen glue, .wasm, rayon `snippets/`) into a content-hashed
 * `dist/client/engine/<hash>/`. Served UNBUNDLED because rayon self-spawns its threads via the
 * glue's own `import.meta.url`, which needs the files as real served siblings (bundling breaks it).
 * The `<hash>` busts stale browser/CDN caches on an engine update. Must run before the client
 * build so the hashed URL lands in the manifest.
 * @throws If the pkg lacks the glue or the binary.
 */
export function copyEngineToDist(): void {
	// A local build or a release zip can still lack the glue or binary.
	if (!fs.existsSync(GLUE_FILE) || !fs.existsSync(WASM_FILE)) throw new Error(`${LABEL} Engine pkg is missing apeiron.js or apeiron_bg.wasm.`); // prettier-ignore
	// Hash glue + wasm together; either changing (a new release or local rebuild) busts the cache.
	const hash = crypto
		.createHash('sha256')
		.update(fs.readFileSync(GLUE_FILE))
		.update(fs.readFileSync(WASM_FILE))
		.digest('hex')
		.slice(0, 8);
	const versionedDir = path.join(ENGINE_DIST_DIR, hash);

	fs.mkdirSync(versionedDir, { recursive: true });
	for (const file of [GLUE_FILE, WASM_FILE]) {
		fs.copyFileSync(file, path.join(versionedDir, path.basename(file)));
	}
	const snippets = path.join(PKG_DIR, 'snippets');
	if (fs.existsSync(snippets)) {
		fs.cpSync(snippets, path.join(versionedDir, 'snippets'), { recursive: true });
	}
	engineGlueUrl = `/engine/${hash}/apeiron.js`;
	console.log(`${LABEL} Copied engine pkg to dist/client/engine/${hash}/`);
}

/**
 * Manifest URL of the engine glue for the analysis page. Folded into dist/manifest.json by the
 * client build's manifest writer, then handed to the worker via the page's `analysisPageData` —
 * the same channel as the hashed worker URL.
 */
export function getEngineGlueUrl(): string {
	return engineGlueUrl;
}

/** The engine's version string, folded into the manifest so the page can display it. */
export function getEngineVersion(): string {
	return engineVersion;
}
