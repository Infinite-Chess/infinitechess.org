// build/engine-wasm.js

/**
 * HydroChess WASM Engine Setup Script
 *
 * This ensures that the HydroChess WASM engine is available.
 */

import fs from 'node:fs';
import path from 'node:path';

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

// API URL to check the latest released version
const LATEST_RELEASE_API_URL =
	'https://api.github.com/repos/Infinite-Chess/hydrochess/releases/latest';

/**
 * Ensures the HydroChess WASM engine is available and up-to-date.
 * Automatically downloads the pre-built WASM if there is a new release.
 */
export async function setupEngineWasm() {
	const label = '[hydrochess-wasm]';
	const pkgDir = path.join(HYDROCHESS_WASM_DIR, 'pkg');
	const wasmFile = path.join(pkgDir, 'hydrochess_wasm_bg.wasm');
	const jsFile = path.join(pkgDir, 'hydrochess_wasm.js');
	// Note: If you are manually rebuilding the engine binaries on a separate
	// vscode window with the hydrochess repo open, and have setup a symlink
	// for this submodule to point to that project, then this file will be innacurate.
	// But it works because the local build process thinks we're already on the latest version.
	const versionFile = path.join(pkgDir, '.engine-version');

	// Download pre-built binary if new version available
	let localVersion = '';
	if (fs.existsSync(versionFile)) {
		localVersion = fs.readFileSync(versionFile, 'utf-8').trim();
	}

	let releaseData = null;

	try {
		const response = await fetch(LATEST_RELEASE_API_URL, {
			headers: { 'User-Agent': 'Infinite-Chess-Build-Script' },
		});
		if (!response.ok) throw new Error(`GitHub API failed: ${response.statusText}`);
		releaseData = await response.json();
	} catch (error) {
		console.warn(`${label} Could not check for new version:`, error.message);
		if (fs.existsSync(wasmFile)) {
			console.log(`${label} Using existing local version.`);
			return;
		}
		// If we can't check and have no local copy, fail and inform the user.
		console.error(`${label} Automatic download failed and no local copy exists.`);
		return;
	}

	const remoteVersion = releaseData.tag_name;

	if (localVersion && localVersion === remoteVersion && fs.existsSync(wasmFile)) {
		console.log(`${label} Engine is up-to-date (${localVersion}).`);
		return;
	}

	console.log(`${label} New version detected (${remoteVersion}). Downloading release...`);

	// Extract dynamic download URLs from the API response
	const wasmAsset = releaseData.assets.find((a) => a.name === 'hydrochess_wasm_bg.wasm');
	const jsAsset = releaseData.assets.find((a) => a.name === 'hydrochess_wasm.js');

	if (!wasmAsset || !jsAsset) {
		console.error(`${label} Release ${remoteVersion} is missing required asset files.`);
		return;
	}

	try {
		await fs.promises.mkdir(pkgDir, { recursive: true });

		const downloadFile = async (url, dest) => {
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

		console.log(`${label} Hydrochess engine is ready (${remoteVersion}).`);
	} catch (error) {
		console.error(`${label} Automatic download failed:`, error.message);
	}
}
