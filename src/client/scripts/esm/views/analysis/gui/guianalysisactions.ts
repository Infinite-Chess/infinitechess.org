// src/client/scripts/esm/views/analysis/gui/guianalysisactions.ts

/**
 * The analysis page's "More actions" menu — flip board, open the position in the editor,
 * the "Continue from here" choices that hand the position off to the lobby, and Export ICN
 * (copies the current game's ICN to the clipboard).
 */

import type { MetaData } from '../../../../../../shared/types.js';
import type { ModalMode } from '../../../components/gameSetupModalHandoff.js';
import type { EditorAutosaveState } from '../../../game/editorstores/estoretypes.js';
import type { GameFile, VariantOptions } from '../../../../../../shared/chess/logic/gamefile.js';

import icnconverter from '../../../../../../shared/chess/logic/icn/icnconverter.js';

import view from './guianalysisview.js';
import toast from '../../../components/toast.js';
import docutil from '../../../util/docutil.js';
import gameslot from '../../../game/chess/gameslot.js';
import IndexedDB from '../../../util/IndexedDB.js';
import estoretypes from '../../../game/editorstores/estoretypes.js';
import gamesession from '../../../game/chess/gamesession.js';
import annotations from '../../../game/rendering/highlights/annotations/annotations.js';
import gamecompressor from '../../../game/chess/gamecompressor.js';
import gameSetupModalHandoff from '../../../components/gameSetupModalHandoff.js';

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
const element_ExportIcn = document.getElementById('btn-export-icn') as HTMLButtonElement;

/** Wires the "More actions" menu and its buttons. Called once by the page entry. */
function init(): void {
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
	element_ExportIcn.addEventListener('click', () => {
		closeActionsMenu();
		void exportIcnToClipboard();
	});
}

/**
 * Serializes the game (position + move list) to canonical compact ICN. Moves are
 * truncated to the currently-viewed ply, so the export mirrors the position on the
 * board as you cycle through moves.
 */
function getGameICN(gamefile: GameFile): string {
	const presetOverrides = annotations.getPresetOverrides();
	const longformIn = gamecompressor.compressGamefile(gamefile, false, presetOverrides);
	longformIn.metadata = trimMetadata(longformIn.metadata);
	const viewedPlyCount = gamefile.state.local.moveIndex + 1;
	if (longformIn.moves && longformIn.moves.length > viewedPlyCount) {
		longformIn.moves = longformIn.moves.slice(0, viewedPlyCount);
	}
	return icnconverter.LongToShort_Format(longformIn, icnconverter.COMPACT_FORMAT_OPTIONS);
}

/** Exports the current position as ICN plus the variant options needed to reload it, or undefined if nothing's loaded. */
function exportCurrentPosition():
	| { icn: string; pieceCount: number; variantOptions: VariantOptions }
	| undefined {
	const gamefile = gameslot.getGamefile();
	if (!gamefile) return undefined;

	const presetOverrides = annotations.getPresetOverrides();
	const position = gamecompressor.compressGamefile(gamefile, true, presetOverrides);
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

	position.metadata = trimMetadata(position.metadata);
	const icn = icnconverter.LongToShort_Format(position, icnconverter.COMPACT_FORMAT_OPTIONS);
	return { icn, pieceCount: position.position.size, variantOptions };
}

/** Hands the current position to the board editor via autosave, then navigates there. */
async function openCurrentPositionInEditor(): Promise<void> {
	if (gamesession.isLoading()) return toast.showPleaseWaitForTask();
	const position = exportCurrentPosition();
	if (!position) return;

	await IndexedDB.saveItem(estoretypes.EDITOR_AUTOSAVE_NAME, {
		dirty: true,
		timestamp: Date.now(),
		piece_count: position.pieceCount,
		variantOptions: position.variantOptions,
	} satisfies EditorAutosaveState);
	window.location.assign('/editor');
}

/** Copies the current game's ICN (position + moves up to the viewed ply) to the clipboard. */
async function exportIcnToClipboard(): Promise<void> {
	if (gamesession.isLoading()) return toast.showPleaseWaitForTask();
	const gamefile = gameslot.getGamefile();
	if (!gamefile) return;
	if (await docutil.copyToClipboard(getGameICN(gamefile))) {
		toast.show('Copied ICN to your clipboard!');
	} else {
		toast.show('Clipboard permission denied. This might be your browser.', { error: true });
	}
}

/** Opens the "Continue from here" sub-menu, provided the position can be exported. */
function openContinueFromHereChoice(): void {
	if (gamesession.isLoading()) return toast.showPleaseWaitForTask();
	if (!exportCurrentPosition()) return;

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
	if (!position) return;

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

/**
 * Trims the metadata down to what an exported ICN can't be reloaded 100% accurately without:
 * Variant selects movesets, UTCDate/UTCTime pin which revision of that variant applies.
 * Everything else (player names, elo, result, ...) is bloat in an exported position.
 */
function trimMetadata(metadata: MetaData): MetaData {
	return {
		Variant: metadata.Variant,
		UTCDate: metadata.UTCDate,
		UTCTime: metadata.UTCTime,
	};
}

export default { init };
