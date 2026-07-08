// src/client/scripts/esm/views/analysis/analysis.ts

/**
 * Client entry for the analysis page (/analysis/:id?).
 *
 * Runs the shared game core (board, moves list, annotations...) in an 'analysis'
 * session, auto-loads the game named by the URL if any, and wires the
 * analysis-specific UI: variant picker, flip board, engine panel, and ICN panel.
 */

import type { VariantCode } from '../../../../../shared/chess/variants/variantregistry.js';

import icnconverter from '../../../../../shared/chess/logic/icn/icnconverter.js';

import toast from '../../components/toast.js';
import webgl from '../../game/rendering/webgl.js';
import camera from '../../game/rendering/camera.js';
import gamecore from '../../game/chess/gamecore.js';
import gameslot from '../../game/chess/gameslot.js';
import icnpanel from './gui/guiicnpanel.js';
import IndexedDB from '../../util/IndexedDB.js';
import maskedDraw from '../../webgl/maskedDraw.js';
import enginepanel from './gui/guienginepanel.js';
import gamesession from '../../game/chess/gamesession.js';
import { GameBus } from '../../game/GameBus.js';
import LocalStorage from '../../util/LocalStorage.js';
import frametracker from '../../game/rendering/frametracker.js';
import frameprofiler from '../../game/misc/frameprofiler.js';
import analysisloader from './analysisloader.js';

// Elements ----------------------------------------------------------------------

/** The analysis-page board canvas WebGL renders onto. */
const canvas = document.getElementById('board-canvas') as HTMLCanvasElement;
const element_VariantSelect = document.getElementById('variant-select') as HTMLSelectElement;
const element_Flip = document.getElementById('btn-flip') as HTMLButtonElement;

// Functions ----------------------------------------------------------------------

/** Starts the analysis page. Runs once the page is loaded. */
function start(): void {
	const gl = webgl.init(canvas); // Initiate the WebGL context. This is our web-based render engine.
	camera.init(gl, canvas); // Initiates the camera/projection/model matrix uniforms.
	gamecore.init(canvas);

	initListeners();
	enginepanel.init();
	icnpanel.init();

	// The hidden "Custom position" placeholder is the select's first option;
	// a fresh board should start on Classical instead.
	if (!element_VariantSelect.value) element_VariantSelect.value = 'Classical';

	void loadInitialGame();

	// Update & draw the scene repeatedly
	requestAnimationFrame(gameLoop);
}

/** Loads the game named by the URL, falling back to a fresh board of the selected variant. */
async function loadInitialGame(): Promise<void> {
	const gameId = window.analysisPageData.gameId;
	if (gameId === null) return loadVariant(element_VariantSelect.value as VariantCode);

	gamesession.setSessionGame({ type: 'analysis' }); // pasteGame requires an analysis session.
	try {
		const response = await fetch(`/api/game/${gameId}`);
		if (!response.ok) throw Error(`Game fetch failed (${response.status})`);
		const state: { icn: string } = await response.json();
		const longformOut = icnconverter.ShortToLong_Format(state.icn);
		syncVariantSelect(longformOut.metadata.Variant);
		await analysisloader.pasteGame(longformOut, true);
	} catch (e) {
		console.error('Failed to load game for analysis:', e);
		toast.show('Failed to load the game. Starting a fresh board.', { error: true });
		loadVariant(element_VariantSelect.value as VariantCode);
	}
}

/** Loads a fresh board of the given variant. */
function loadVariant(variant: VariantCode): void {
	if (gameslot.getGamefile()) gamesession.unloadGame();
	analysisloader.startGame({ variant, timeControl: '-' });
}

/**
 * Points the variant dropdown at the given variant metadata name.
 * Unrecognized/custom variants select the hidden "Custom" option.
 */
function syncVariantSelect(variantMetadata: string | undefined): void {
	if (!variantMetadata) return void (element_VariantSelect.value = '');
	// Option values are variant codes; the metadata name may be a display name.
	// Try the code directly first, then match by option label.
	const byCode = [...element_VariantSelect.options].find((o) => o.value === variantMetadata);
	const byName = [...element_VariantSelect.options].find((o) => o.text === variantMetadata);
	element_VariantSelect.value = (byCode ?? byName)?.value ?? '';
}

/** Flips the board orientation in place — a pure view change; the game and engine analysis are untouched. */
function flipBoard(): void {
	const gamefile = gameslot.getGamefile();
	if (!gamefile || gamesession.isLoading()) return;
	gameslot.flipPerspective();
	document.getElementById('eval-gauge')!.classList.toggle('flipped', !gameslot.areViewingWhite());
}

function initListeners(): void {
	window.addEventListener('beforeunload', () => {
		LocalStorage.eraseExpiredItems();
		IndexedDB.eraseExpiredItems();
	});

	// Prevent clicking buttons from focusing them, keyboard controls interacting with them.
	document.querySelectorAll<HTMLElement>('.btn-bare, .action-btn').forEach((btn) => {
		btn.setAttribute('tabindex', '-1');
		btn.addEventListener('click', () => btn.blur());
	});

	element_VariantSelect.addEventListener('change', () => {
		const code = element_VariantSelect.value;
		if (code === '') return; // The hidden "Custom" placeholder.
		if (gamesession.isLoading()) return toast.showPleaseWaitForTask();
		loadVariant(code as VariantCode);
		element_VariantSelect.blur();
	});

	element_Flip.addEventListener('click', flipBoard);

	// Keyboard shortcut: f = flip board (ignored while typing).
	document.addEventListener('keydown', (e) => {
		if (isTypingTarget(e.target)) return;
		if (e.key === 'f' && !e.ctrlKey && !e.metaKey && !e.altKey) flipBoard();
	});

	// Reflect the loaded game's orientation on the eval gauge.
	GameBus.addEventListener('game-loaded', () => {
		document
			.getElementById('eval-gauge')!
			.classList.toggle('flipped', !gameslot.areViewingWhite());
	});
}

/** Whether a keyboard event targets a text-entry element (shortcuts should be ignored). */
function isTypingTarget(target: EventTarget | null): boolean {
	return (
		target instanceof HTMLInputElement ||
		target instanceof HTMLTextAreaElement ||
		target instanceof HTMLSelectElement
	);
}

/** The main game loop. Called every frame. */
function gameLoop(runtime: number): void {
	frameprofiler.update(runtime); // Updates delta time & fps.

	gamecore.update(); // Always update the game, far cheaper than rendering.

	render();

	// Reset all event-listener states so we catch new events next frame.
	document.dispatchEvent(new Event('reset-listener-events'));

	requestAnimationFrame(gameLoop); // Loop again
}

function render(): void {
	if (!frametracker.doWeRenderNextFrame()) return; // Only render if something visual changed (saves cpu).
	// Don't render until the game is fully loaded.
	if (!gameslot.getGamefile() || gamesession.isLoading()) return;

	webgl.clearScreen(); // Clear the color + depth buffers
	maskedDraw.onFrameStart(); // Reset stencil bit-pair index for this frame

	gamecore.render();

	frametracker.onFrameRender();
}

export { isTypingTarget };

start();
