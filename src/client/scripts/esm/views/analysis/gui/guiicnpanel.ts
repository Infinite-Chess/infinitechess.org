// src/client/scripts/esm/views/analysis/gui/guiicnpanel.ts

/**
 * The analysis page's ICN panel (the analysis equivalent of lichess' PGN/FEN box):
 * a textarea that mirrors the current game's ICN — with or without the move list —
 * plus copy-to-clipboard and import-from-text actions.
 */

import type { GameFile } from '../../../../../../shared/chess/logic/gamefile.js';

import icnconverter from '../../../../../../shared/chess/logic/icn/icnconverter.js';
import variantregistry from '../../../../../../shared/chess/variants/variantregistry.js';

import toast from '../../../components/toast.js';
import gameslot from '../../../game/chess/gameslot.js';
import gamesession from '../../../game/chess/gamesession.js';
import { GameBus } from '../../../game/GameBus.js';
import analysisloader from '../analysisloader.js';
import gamecompressor from '../../../game/chess/gamecompressor.js';

// Elements ------------------------------------------------------------------------

const element_Textarea = document.getElementById('icn-textarea') as HTMLTextAreaElement;
const element_Panel = document.querySelector('.icn-panel')!;
const element_Copy = document.getElementById('btn-icn-copy') as HTMLButtonElement;
const element_Import = document.getElementById('btn-icn-import') as HTMLButtonElement;
const element_Error = document.getElementById('icn-error')!;
const element_VariantSelect = document.getElementById('variant-select') as HTMLSelectElement | null;

// Functions ------------------------------------------------------------------------

/** Initializes the ICN panel. Called once by the page entry. */
function init(): void {
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
 * Serializes the game (position + move list) to canonical compact ICN — the same
 * `compressGamefile` + `LongToShort_Format` form the engine worker uses, so the
 * exported string round-trips cleanly through the import field. Moves are truncated
 * to the currently-viewed ply, so the box mirrors the position on the board as you
 * cycle through moves.
 */
function getGameICN(gamefile: GameFile): string {
	const longformIn = gamecompressor.compressGamefile(gamefile);
	const viewedPlyCount = gamefile.state.local.moveIndex + 1;
	if (longformIn.moves && longformIn.moves.length > viewedPlyCount) {
		longformIn.moves = longformIn.moves.slice(0, viewedPlyCount);
	}
	return icnconverter.LongToShort_Format(longformIn, {
		skipPosition: false,
		compact: true,
		spaces: false,
		comments: false,
		make_new_lines: false,
		move_numbers: false,
	});
}

/** Rewrites the textarea from the current game. Called only on move / game load. */
function refresh(): void {
	// Only the logical gamefile is needed — 'game-loaded' fires before graphics finish.
	const gamefile = gameslot.getGamefile();
	if (!gamefile) return;

	element_Error.textContent = '';
	element_Textarea.value = getGameICN(gamefile);
	updateSelectionState();
}

/** Parses the textarea's ICN and loads it as the current game. */
function importFromTextarea(): void {
	if (gamesession.isLoading()) return toast.showPleaseWaitForTask();
	const text = element_Textarea.value.trim();
	if (!text) return;

	element_Error.textContent = '';
	let longformOut;
	try {
		longformOut = icnconverter.ShortToLong_Format(text);
	} catch (e) {
		console.error(e);
		element_Error.textContent = 'Invalid ICN notation.';
		return;
	}

	// Point the variant dropdown at the imported variant (or the "Custom" placeholder).
	const resolved = longformOut.metadata.Variant
		? variantregistry.resolveVariantCode(longformOut.metadata.Variant)
		: undefined;
	if (element_VariantSelect) element_VariantSelect.value = resolved ?? '';

	element_Textarea.blur();
	analysisloader.pasteGame(longformOut);
}

export default { init, getGameICN };
