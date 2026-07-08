// src/client/scripts/esm/views/analysis/analysis.ts

/**
 * Client entry for the analysis page (/analysis/:id?).
 *
 * Runs the shared game core (board, moves list, annotations...) in an 'analysis'
 * session, auto-loads the game named by the URL if any, and wires the
 * analysis-specific UI: variant picker, flip board, engine panel, and ICN panel.
 */

import type { VariantCode } from '../../../../../shared/chess/variants/variantregistry.js';
import type { VariantOptions } from '../../../../../shared/chess/logic/gamefile.js';
import type { EditorAutosaveState } from '../../game/editorstores/estoretypes.js';

import icnconverter from '../../../../../shared/chess/logic/icn/icnconverter.js';

import toast from '../../components/toast.js';
import webgl from '../../game/rendering/webgl.js';
import camera from '../../game/rendering/camera.js';
import gamecore from '../../game/chess/gamecore.js';
import gameslot from '../../game/chess/gameslot.js';
import guiclock from '../../game/gui/guiclock.js';
import icnpanel from './gui/guiicnpanel.js';
import IndexedDB from '../../util/IndexedDB.js';
import maskedDraw from '../../webgl/maskedDraw.js';
import estoretypes from '../../game/editorstores/estoretypes.js';
import enginepanel from './gui/guienginepanel.js';
import gamesession from '../../game/chess/gamesession.js';
import { GameBus } from '../../game/GameBus.js';
import LocalStorage from '../../util/LocalStorage.js';
import frametracker from '../../game/rendering/frametracker.js';
import frameprofiler from '../../game/misc/frameprofiler.js';
import analysisloader from './analysisloader.js';
import gamecompressor from '../../game/chess/gamecompressor.js';
import gameSetupModalUi from '../../components/gameSetupModal/gameSetupModalUi.js';
import analysisworldborder from './analysisworldborder.js';

// Elements ----------------------------------------------------------------------

/** The analysis-page board canvas WebGL renders onto. */
const canvas = document.getElementById('board-canvas') as HTMLCanvasElement;
const element_VariantSelect = document.getElementById('variant-select') as HTMLSelectElement | null;
const element_ActionsButton = document.getElementById('btn-analysis-actions') as HTMLButtonElement;
const element_ActionsMenu = document.getElementById('analysis-actions-menu')!;
const element_Flip = document.getElementById('btn-flip') as HTMLButtonElement;
const element_EditCurrent = document.getElementById('btn-edit-current') as HTMLButtonElement;
const element_ContinueFromHere = document.getElementById(
	'btn-continue-from-here',
) as HTMLButtonElement;
const element_ContinueChoiceModal = document.getElementById('continue-choice-overlay')!;
const element_ContinueChoiceClose = document.getElementById(
	'continue-choice-close',
) as HTMLButtonElement;
const element_ContinuePlayComputer = document.getElementById(
	'continue-play-computer',
) as HTMLButtonElement;
const element_ContinueChallengeFriend = document.getElementById(
	'continue-challenge-friend',
) as HTMLButtonElement;

// Types -------------------------------------------------------------------------

type ContinueMode = 'computer' | 'friend';

// Variables ----------------------------------------------------------------------

let currentContinueMode: ContinueMode = 'computer';

// Functions ----------------------------------------------------------------------

/** Starts the analysis page. Runs once the page is loaded. */
function start(): void {
	const gl = webgl.init(canvas); // Initiate the WebGL context. This is our web-based render engine.
	camera.init(gl, canvas); // Initiates the camera/projection/model matrix uniforms.
	gamecore.init(canvas);

	initListeners();
	analysisworldborder.init();
	enginepanel.init();
	icnpanel.init();

	// The hidden "Custom position" placeholder is the select's first option;
	// a fresh board should start on Classical instead.
	if (element_VariantSelect && !element_VariantSelect.value)
		element_VariantSelect.value = 'Classical';

	void loadInitialGame();

	// Update & draw the scene repeatedly
	requestAnimationFrame(gameLoop);
}

/** Loads the game named by the URL, falling back to a fresh board of the selected variant. */
async function loadInitialGame(): Promise<void> {
	// An ICN import on a loaded game's page redirects here (this page renders no
	// clocks/players/result banner to conflict with) with the text stashed for us.
	const pendingImport = icnpanel.takePendingImport();
	if (pendingImport !== null) {
		gamesession.setSessionGame({ type: 'analysis' }); // pasteGame requires an analysis session.
		icnpanel.importIcnText(pendingImport);
		return;
	}

	const gameId = window.analysisPageData.gameId;
	if (gameId === null) return loadVariant(getSelectedVariant());

	gamesession.setSessionGame({ type: 'analysis' }); // pasteGame requires an analysis session.
	try {
		const response = await fetch(`/api/game/${gameId}`);
		if (!response.ok) throw Error(`Game fetch failed (${response.status})`);
		const state: { icn: string } = await response.json();
		const longformOut = icnconverter.ShortToLong_Format(state.icn);
		syncVariantSelect(longformOut.metadata.Variant);
		await analysisloader.pasteGame(longformOut, true);
		syncClockDisplayToViewedMove(true);
	} catch (e) {
		console.error('Failed to load game for analysis:', e);
		toast.show('Failed to load the game. Starting a fresh board.', { error: true });
		loadVariant(getSelectedVariant());
	}
}

function getSelectedVariant(): VariantCode {
	return (element_VariantSelect?.value || 'Classical') as VariantCode;
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
	if (!element_VariantSelect) return;
	if (!variantMetadata) return void (element_VariantSelect.value = '');
	// Option values are variant codes; the metadata name may be a display name.
	// Try the code directly first, then match by option label.
	const byCode = [...element_VariantSelect.options].find((o) => o.value === variantMetadata);
	const byName = [...element_VariantSelect.options].find((o) => o.text === variantMetadata);
	element_VariantSelect.value = (byCode ?? byName)?.value ?? '';
}

/** Flips the board orientation in place — a pure view change; the game and engine analysis are untouched. */
function flipBoard(): void {
	if (gamesession.isLoading()) return;
	gameslot.flipView();
	document.getElementById('eval-gauge')!.classList.toggle('flipped', !gameslot.areViewingWhite());
	swapPlayerBarNames();
	syncClockDisplayToViewedMove(true);
}

function exportCurrentPosition():
	| { icn: string; pieceCount: number; variantOptions: VariantOptions }
	| undefined {
	const gamefile = gameslot.getGamefile();
	if (!gamefile) return undefined;

	const position = gamecompressor.compressGamefile(gamefile, true);
	if (!position.position) return undefined;

	const variantOptions: VariantOptions = {
		fullMove: position.fullMove,
		gameRules: position.gameRules,
		position: position.position,
		state_global: {
			specialRights: position.state_global.specialRights ?? new Set(),
			...(position.state_global.enpassant !== undefined && {
				enpassant: position.state_global.enpassant,
			}),
			...(position.state_global.moveRuleState !== undefined && {
				moveRuleState: position.state_global.moveRuleState,
			}),
		},
	};

	const icn = icnconverter.LongToShort_Format(position, {
		skipPosition: false,
		compact: true,
		spaces: false,
		comments: false,
		make_new_lines: false,
		move_numbers: false,
	});

	return { icn, pieceCount: position.position.size, variantOptions };
}

async function openCurrentPositionInEditor(): Promise<void> {
	if (gamesession.isLoading()) return toast.showPleaseWaitForTask();
	const position = exportCurrentPosition();
	if (!position) return toast.show('Could not export this position.', { error: true });

	await IndexedDB.saveItem(estoretypes.EDITOR_AUTOSAVE_NAME, {
		dirty: true,
		timestamp: Date.now(),
		piece_count: position.pieceCount,
		variantOptions: position.variantOptions,
	} satisfies EditorAutosaveState);
	window.location.assign('/editor');
}

function openContinueFromHereChoice(): void {
	if (gamesession.isLoading()) return toast.showPleaseWaitForTask();
	const position = exportCurrentPosition();
	if (!position) return toast.show('Could not export this position.', { error: true });

	element_ContinueChoiceModal.classList.remove('hidden');
	element_ContinueChoiceClose.focus();
}

function openContinueFromHereModal(mode: ContinueMode): void {
	if (gamesession.isLoading()) return toast.showPleaseWaitForTask();
	const position = exportCurrentPosition();
	if (!position) return toast.show('Could not export this position.', { error: true });

	currentContinueMode = mode;
	gameSetupModalUi.setCustomIcn(position.icn);
	closeContinueFromHereChoice();
	gameSetupModalUi.open(mode);
}

function closeContinueFromHereChoice(): void {
	element_ContinueChoiceModal.classList.add('hidden');
}

function closeActionsMenu(): void {
	element_ActionsMenu.classList.add('hidden');
	element_ActionsButton.classList.remove('active');
	element_ActionsButton.setAttribute('aria-expanded', 'false');
}

function toggleActionsMenu(): void {
	const shouldOpen = element_ActionsMenu.classList.contains('hidden');
	element_ActionsMenu.classList.toggle('hidden', !shouldOpen);
	element_ActionsButton.classList.toggle('active', shouldOpen);
	element_ActionsButton.setAttribute('aria-expanded', String(shouldOpen));
}

function swapPlayerBarNames(): void {
	const top = document.getElementById('player-bar-top');
	const bottom = document.getElementById('player-bar-bottom');
	if (!top || !bottom || top.classList.contains('hidden') || bottom.classList.contains('hidden'))
		return;

	const topNodes = detachPlayerBarNameNodes(top);
	const bottomNodes = detachPlayerBarNameNodes(bottom);
	insertPlayerBarNameNodes(top, bottomNodes);
	insertPlayerBarNameNodes(bottom, topNodes);
}

function detachPlayerBarNameNodes(bar: HTMLElement): Node[] {
	const nodes = [...bar.childNodes].filter((node) => {
		return !(node instanceof HTMLElement && node.classList.contains('clock'));
	});
	nodes.forEach((node) => node.remove());
	return nodes;
}

function insertPlayerBarNameNodes(bar: HTMLElement, nodes: Node[]): void {
	const clock = bar.querySelector('.clock');
	nodes.forEach((node) => bar.insertBefore(node, clock));
}

function syncClockDisplayToViewedMove(remapBars = false): void {
	const gamefile = gameslot.getGamefile();
	if (!gamefile) return;
	if (remapBars) guiclock.set(gamefile);
	guiclock.showViewedMoveClockStamps(gamefile);
}

function initListeners(): void {
	window.addEventListener('beforeunload', () => {
		LocalStorage.eraseExpiredItems();
		IndexedDB.eraseExpiredItems();
	});

	gameSetupModalUi.init();

	// Prevent clicking buttons from focusing them, keyboard controls interacting with them.
	document.querySelectorAll<HTMLElement>('.btn-bare, .action-btn').forEach((btn) => {
		btn.setAttribute('tabindex', '-1');
		btn.addEventListener('click', () => btn.blur());
	});

	element_VariantSelect?.addEventListener('change', () => {
		const code = element_VariantSelect.value;
		if (code === '') return; // The hidden "Custom" placeholder.
		if (gamesession.isLoading()) return toast.showPleaseWaitForTask();
		loadVariant(code as VariantCode);
		element_VariantSelect.blur();
	});

	element_ActionsButton.addEventListener('click', (e) => {
		e.stopPropagation();
		toggleActionsMenu();
	});
	document.addEventListener('pointerdown', (e) => {
		if (!(e.target instanceof Node)) return;
		if (element_ActionsButton.contains(e.target) || element_ActionsMenu.contains(e.target))
			return;
		closeActionsMenu();
	});
	element_Flip.addEventListener('click', () => {
		flipBoard();
		closeActionsMenu();
	});
	element_EditCurrent.addEventListener('click', () => {
		closeActionsMenu();
		void openCurrentPositionInEditor();
	});
	element_ContinueFromHere.addEventListener('click', () => {
		closeActionsMenu();
		openContinueFromHereChoice();
	});
	element_ContinueChoiceClose.addEventListener('click', closeContinueFromHereChoice);
	element_ContinueChoiceModal.addEventListener('pointerdown', (e) => {
		if (e.target === e.currentTarget) closeContinueFromHereChoice();
	});
	element_ContinuePlayComputer.addEventListener('click', () =>
		openContinueFromHereModal('computer'),
	);
	element_ContinueChallengeFriend.addEventListener('click', () =>
		openContinueFromHereModal('friend'),
	);
	gameSetupModalUi.getSubmitButton().addEventListener('click', () => {
		if (!gameSetupModalUi.getPositionInput().value)
			return toast.show('Could not export this position.', { error: true });
		const label =
			currentContinueMode === 'computer' ? 'Computer game flow' : 'Friend challenge flow';
		toast.show(`${label} not implemented yet`, { error: true });
	});

	// Keyboard shortcut: f = flip board (ignored while typing).
	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') {
			closeActionsMenu();
			closeContinueFromHereChoice();
			gameSetupModalUi.close();
			return;
		}
		if (isTypingTarget(e.target)) return;
		if (e.key === 'f' && !e.ctrlKey && !e.metaKey && !e.altKey) flipBoard();
	});

	// Reflect the loaded game's orientation on the eval gauge.
	GameBus.addEventListener('game-loaded', () => {
		document
			.getElementById('eval-gauge')!
			.classList.toggle('flipped', !gameslot.areViewingWhite());
	});
	GameBus.addEventListener('view-move', () => syncClockDisplayToViewedMove());
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
