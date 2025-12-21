// build/engine-wasm.js

/**
 * HydroChess WASM Engine Setup Script
 *
 * This ensures that the HydroChess WASM engine is available.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

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

// URLs for the pre-built HydroChess WASM binaries
const WASM_RELEASE_URL =
	'https://github.com/Infinite-Chess/hydrochess/releases/download/nightly/hydrochess_wasm_bg.wasm';
const JS_RELEASE_URL =
	'https://github.com/Infinite-Chess/hydrochess/releases/download/nightly/hydrochess_wasm.js';
const NIGHTLY_TAG_API_URL =
	'https://api.github.com/repos/Infinite-Chess/hydrochess/git/refs/tags/nightly';

function hasCommand(cmd) {
	try {
		const res = spawnSync(cmd, ['--version'], { stdio: 'ignore' });
		return res.status === 0;
	} catch {
		return false;
	}
}

/**
 * Ensures the HydroChess WASM engine is available and up-to-date.
 * - DEFAULT: Automatically downloads the pre-built WASM if the remote version is newer.
 * - DEVELOPER OPT-IN: If BUILD_WASM_LOCAL=true, it attempts to build from local source.
 */
export async function setupEngineWasm() {
	const label = '[hydrochess-wasm]';
	const pkgDir = path.join(HYDROCHESS_WASM_DIR, 'pkg');
	const wasmFile = path.join(pkgDir, 'hydrochess_wasm_bg.wasm');
	const jsFile = path.join(pkgDir, 'hydrochess_wasm.js');
	const versionFile = path.join(pkgDir, '.engine-version');

	// DEVELOPER OPT-IN: Build from local source (allows rapid iteration)
	if (process.env.BUILD_WASM_LOCAL === 'true') {
		console.log(`${label} BUILD_WASM_LOCAL is true, attempting to build from source...`);

		if (
			!fs.existsSync(HYDROCHESS_WASM_DIR) ||
			fs.readdirSync(HYDROCHESS_WASM_DIR).length === 0
		) {
			console.warn(`${label} Engine submodule directory at ${HYDROCHESS_WASM_DIR} is empty.`);
			console.warn(`${label} Run 'git submodule update --init', then rebuild.`);
			return;
		}

		if (!hasCommand('cargo') || !hasCommand('wasm-pack')) {
			console.error(`${label} 'cargo' or 'wasm-pack' not found. Cannot build locally.`);
			console.error(
				`${label} Install Rust from https://rustup.rs and wasm-pack with 'cargo install wasm-pack'.`,
			);
			console.error(`${label} Or, unset BUILD_WASM_LOCAL to download the pre-built binary.`);
			return;
		}

		console.log(`${label} Building WASM engine with wasm-pack...`);
		const result = spawnSync('wasm-pack', ['build', '--target', 'web', '--out-dir', 'pkg'], {
			cwd: HYDROCHESS_WASM_DIR,
			stdio: 'inherit',
		});

		if (result.status !== 0) {
			console.error(`${label} Local build failed. Check wasm-pack output above.`);
		} else {
			console.log(`${label} Local build complete.`);
		}
		return;
	}

	// DEFAULT: Download pre-built binary if new version available
	let localHash = '';
	if (fs.existsSync(versionFile)) {
		localHash = fs.readFileSync(versionFile, 'utf-8').trim();
	}

	let remoteHash = '';
	try {
		const response = await fetch(NIGHTLY_TAG_API_URL, {
			headers: { 'User-Agent': 'Infinite-Chess-Build-Script' },
		});
		if (!response.ok) throw new Error(`GitHub API failed: ${response.statusText}`);
		const data = await response.json();
		remoteHash = data.object.sha;
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

	if (localHash && localHash === remoteHash && fs.existsSync(wasmFile)) {
		console.log(`${label} Engine is up-to-date.`);
		return; // Already have the latest version.
	}

	console.log(`${label} New engine version detected. Downloading release...`);
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
			downloadFile(WASM_RELEASE_URL, wasmFile),
			downloadFile(JS_RELEASE_URL, jsFile),
		]);

		// Stamp the downloaded version with the remote commit hash
		await fs.promises.writeFile(versionFile, remoteHash);

		console.log(`${label} Hydrochess engine is ready.`);
	} catch (error) {
		console.error(`${label} Automatic download failed:`, error.message);
		console.error(`${label} You can try building from source as a fallback:`);
		console.error(`${label}   1. Install Rust: https://rustup.rs`);
		console.error(`${label}   2. Install wasm-pack: cargo install wasm-pack`);
		console.error(
			`${label}   3. Run with local build enabled: BUILD_WASM_LOCAL=true npm run build`,
		);
	}
}
