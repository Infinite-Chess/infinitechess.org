// src/client/scripts/esm/views/analysis/gui/guianalysisactions.ts

/**
 * The analysis page's position-sharing UI, in two clearly separated sections:
 *   1. The "More actions" menu — flip board, open the position in the editor, and the
 *      "Continue from here" choices that hand the position off to the lobby.
 *   2. The ICN panel — a textarea mirroring the current game's ICN, with copy & import.
 * Both revolve around exporting the current position, so they share {@link ICN_FORMAT_OPTIONS}.
 */

import type { ModalMode } from '../../../components/gameSetupModalHandoff.js';
import type { EditorAutosaveState } from '../../../game/editorstores/estoretypes.js';
import type { GameFile, VariantOptions } from '../../../../../../shared/chess/logic/gamefile.js';

import icnconverter from '../../../../../../shared/chess/logic/icn/icnconverter.js';
import variantregistry from '../../../../../../shared/chess/variants/variantregistry.js';

import view from './guianalysisview.js';
import toast from '../../../components/toast.js';
import gameslot from '../../../game/chess/gameslot.js';
import IndexedDB from '../../../util/IndexedDB.js';
import estoretypes from '../../../game/editorstores/estoretypes.js';
import gamesession from '../../../game/chess/gamesession.js';
import { GameBus } from '../../../game/GameBus.js';
import analysisloader from '../analysisloader.js';
import gamecompressor from '../../../game/chess/gamecompressor.js';
import { listener_document } from '../../../game/chess/gamecore.js';
import gameSetupModalHandoff from '../../../components/gameSetupModalHandoff.js';

/**
 * Compact single-line ICN formatting — the same form the engine worker consumes, so any
 * position or game exported through here round-trips cleanly back through the import field.
 */
const ICN_FORMAT_OPTIONS = {
	skipPosition: false,
	compact: true,
	spaces: false,
	comments: false,
	make_new_lines: false,
	move_numbers: false,
};

/** Initializes both the "More actions" menu and the ICN panel. Called once by the page entry. */
function init(): void {
	initActions();
	initIcnPanel();
}

/** Polls this file's keyboard shortcuts. Called once per frame by the page loop. */
function updateShortcuts(): void {
	// Escape closes any open menu (the input listener already ignores keys while typing).
	if (listener_document.isKeyDown('Escape')) {
		closeActionsMenu();
		closeContinueFromHereChoice();
	}
}

// The "More actions" menu ==========================================================

const element_ActionsButton = document.getElementById('btn-analysis-actions') as HTMLButtonElement;
const element_ActionsMenu = document.getElementById('analysis-actions-menu')!;
const element_Flip = document.getElementById('btn-flip') as HTMLButtonElement;
const element_EditCurrent = document.getElementById('btn-edit-current') as HTMLButtonElement;
const element_ContinueFromHere = document.getElementById(
	'btn-continue-from-here',
) as HTMLButtonElement;
const element_ContinueChoiceMenu = document.getElementById('continue-choice-menu')!;
const element_ContinuePublicSeek = document.getElementById(
	'continue-public-seek',
) as HTMLButtonElement;
const element_ContinuePlayComputer = document.getElementById(
	'continue-play-computer',
) as HTMLButtonElement;
const element_ContinueChallengeFriend = document.getElementById(
	'continue-challenge-friend',
) as HTMLButtonElement;

/** Wires the "More actions" menu and its buttons. */
function initActions(): void {
	element_ActionsButton.addEventListener('click', (e) => {
		e.stopPropagation();
		toggleActionsMenu();
	});
	document.addEventListener('pointerdown', (e) => {
		if (!(e.target instanceof Node)) return;
		if (
			element_ActionsButton.contains(e.target) ||
			element_ActionsMenu.contains(e.target) ||
			element_ContinueChoiceMenu.contains(e.target)
		)
			return;
		closeActionsMenu();
		closeContinueFromHereChoice();
	});
	element_Flip.addEventListener('click', () => {
		view.flipBoard();
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
	element_ContinuePublicSeek.addEventListener(
		'click',
		() => void continueFromHereInLobby('online'),
	);
	element_ContinuePlayComputer.addEventListener(
		'click',
		() => void continueFromHereInLobby('computer'),
	);
	element_ContinueChallengeFriend.addEventListener(
		'click',
		() => void continueFromHereInLobby('friend'),
	);
}

/** Exports the current position as ICN plus the variant options needed to reload it, or undefined if nothing's loaded. */
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

	const icn = icnconverter.LongToShort_Format(position, ICN_FORMAT_OPTIONS);
	return { icn, pieceCount: position.position.size, variantOptions };
}

/** Hands the current position to the board editor via autosave, then navigates there. */
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

/** Opens the "Continue from here" sub-menu, provided the position can be exported. */
function openContinueFromHereChoice(): void {
	if (gamesession.isLoading()) return toast.showPleaseWaitForTask();
	const position = exportCurrentPosition();
	if (!position) return toast.show('Could not export this position.', { error: true });

	element_ContinueChoiceMenu.classList.remove('hidden');
	syncActionsToggle();
}

/**
 * Hands the current position off to the lobby's game setup modal and navigates there.
 * The lobby auto-opens the modal in the given mode with the position pre-filled;
 * any position errors surface there via the modal's own validation.
 */
async function continueFromHereInLobby(mode: ModalMode): Promise<void> {
	if (gamesession.isLoading()) return toast.showPleaseWaitForTask();
	const position = exportCurrentPosition();
	if (!position) return toast.show('Could not export this position.', { error: true });

	await gameSetupModalHandoff.save({ icn: position.icn, mode });
	window.location.assign('/');
}

/** Closes the "Continue from here" sub-menu. */
function closeContinueFromHereChoice(): void {
	element_ContinueChoiceMenu.classList.add('hidden');
	syncActionsToggle();
}

/** Closes the actions menu. */
function closeActionsMenu(): void {
	element_ActionsMenu.classList.add('hidden');
	syncActionsToggle();
}

/** Toggles the actions menu, closing the "Continue from here" sub-menu alongside it. */
function toggleActionsMenu(): void {
	const shouldOpen = element_ActionsMenu.classList.contains('hidden');
	element_ContinueChoiceMenu.classList.add('hidden');
	element_ActionsMenu.classList.toggle('hidden', !shouldOpen);
	syncActionsToggle();
}

/** Keeps the toggle button's active state in sync with whether either menu is open. */
function syncActionsToggle(): void {
	const anyOpen =
		!element_ActionsMenu.classList.contains('hidden') ||
		!element_ContinueChoiceMenu.classList.contains('hidden');
	element_ActionsButton.classList.toggle('active', anyOpen);
	element_ActionsButton.setAttribute('aria-expanded', String(anyOpen));
}

// The ICN panel ====================================================================
// The analysis equivalent of lichess' PGN/FEN box: a textarea mirroring the current
// game's ICN (with or without the move list), plus copy-to-clipboard and import.

const element_Textarea = document.getElementById('icn-textarea') as HTMLTextAreaElement;
const element_Panel = document.querySelector('.icn-panel')!;
const element_Copy = document.getElementById('btn-icn-copy') as HTMLButtonElement;
const element_Import = document.getElementById('btn-icn-import') as HTMLButtonElement;
const element_VariantSelect = document.getElementById('variant-select') as HTMLSelectElement | null;

/** sessionStorage key an ICN import redirect (see {@link importFromTextarea}) stashes its text under. */
const PENDING_IMPORT_KEY = 'analysis.pendingImport';

/** Wires the ICN panel. */
function initIcnPanel(): void {
	// The textarea is freely editable — we never overwrite what the user types on
	// their own. It's only rewritten from the game on a deliberate board action: a
	// move made, a move cycled through (nav), or a game loaded. Validation happens
	// only on Import.
	GameBus.addEventListener('game-loaded', refresh);
	GameBus.addEventListener('moves-changed', refresh);
	GameBus.addEventListener('view-move', refresh);
	GameBus.addEventListener('game-unloaded', () => {
		element_Textarea.value = '';
		updateSelectionState();
	});

	for (const event of [
		'select',
		'selectionchange',
		'keyup',
		'mouseup',
		'pointermove',
		'input',
		'focus',
	])
		element_Textarea.addEventListener(event, updateSelectionState);
	document.addEventListener('selectionchange', updateSelectionState);
	element_Textarea.addEventListener('blur', () => setTimeout(updateSelectionState, 0));
	element_Textarea.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			importFromTextarea();
		}
	});

	element_Copy.addEventListener('click', async () => {
		try {
			await navigator.clipboard.writeText(element_Textarea.value);
			toast.show('Copied game to clipboard!');
		} catch (e) {
			toast.show('Clipboard permission denied. This might be your browser.' + '\n' + e, { error: true }); // prettier-ignore
		}
	});

	element_Import.addEventListener('mousedown', (e) => e.preventDefault());
	element_Import.addEventListener('click', importFromTextarea);
}

function updateSelectionState(): void {
	element_Panel.classList.toggle('text-selected', document.activeElement === element_Textarea);
}

/**
 * Serializes the game (position + move list) to canonical compact ICN. Moves are
 * truncated to the currently-viewed ply, so the box mirrors the position on the
 * board as you cycle through moves.
 */
function getGameICN(gamefile: GameFile): string {
	const longformIn = gamecompressor.compressGamefile(gamefile);
	const viewedPlyCount = gamefile.state.local.moveIndex + 1;
	if (longformIn.moves && longformIn.moves.length > viewedPlyCount) {
		longformIn.moves = longformIn.moves.slice(0, viewedPlyCount);
	}
	return icnconverter.LongToShort_Format(longformIn, ICN_FORMAT_OPTIONS);
}

/** Rewrites the textarea from the current game. Called only on move / game load. */
function refresh(): void {
	// Only the logical gamefile is needed — 'game-loaded' fires before graphics finish.
	const gamefile = gameslot.getGamefile();
	if (!gamefile) return;

	element_Textarea.value = getGameICN(gamefile);
	updateSelectionState();
}

/** Parses the textarea's ICN and loads it as the current game. */
function importFromTextarea(): void {
	if (gamesession.isLoading()) return toast.showPleaseWaitForTask();
	const text = element_Textarea.value.trim();
	if (!text) return;

	if (window.analysisPageData.gameId !== null) {
		// A saved game's clocks/players/result banner no longer describe anything once
		// you've replaced its position — those are baked in server-side per URL, not
		// something this page can toggle off itself. Validate here (so a malformed ICN
		// errors now, not after leaving the page), then hop to the plain analysis board
		// (which renders none of that) and finish the import there.
		try {
			icnconverter.ShortToLong_Format(text);
		} catch (e) {
			console.error(e);
			toast.show('Invalid ICN notation.', { error: true });
			return;
		}
		sessionStorage.setItem(PENDING_IMPORT_KEY, text);
		window.location.assign('/analysis');
		return;
	}

	element_Textarea.blur();
	importIcnText(text);
}

/** Parses an ICN and loads it as the current game, syncing the variant dropdown. Returns whether it was valid. */
function importIcnText(text: string): boolean {
	let longformOut;
	try {
		longformOut = icnconverter.ShortToLong_Format(text);
	} catch (e) {
		console.error(e);
		toast.show('Invalid ICN notation.', { error: true });
		return false;
	}

	// Point the variant dropdown at the imported variant (or the "Custom" placeholder).
	const resolved = longformOut.metadata.Variant
		? variantregistry.resolveVariantCode(longformOut.metadata.Variant)
		: undefined;
	if (element_VariantSelect) element_VariantSelect.value = resolved ?? '';

	analysisloader.pasteGame(longformOut);
	return true;
}

/**
 * Consumes (and clears) an ICN import stashed by {@link importFromTextarea}'s redirect off
 * a loaded game's page, or null if there isn't one. Called once on page load.
 */
function takePendingImport(): string | null {
	const text = sessionStorage.getItem(PENDING_IMPORT_KEY);
	if (text !== null) sessionStorage.removeItem(PENDING_IMPORT_KEY);
	return text;
}

export default { init, updateShortcuts, importIcnText, takePendingImport };
