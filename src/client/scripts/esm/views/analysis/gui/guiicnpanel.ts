// src/client/scripts/esm/views/analysis/gui/guiicnpanel.ts

/**
 * The analysis page's ICN panel: a textarea mirroring the viewed position and
 * moves, with copy and import actions. It remains a separate panel below the
 * Game Review graph.
 */

import type { GameFile } from '../../../../../../shared/chess/logic/gamefile.js';

import icnconverter from '../../../../../../shared/chess/logic/icn/icnconverter.js';

import toast from '../../../components/toast.js';
import gameslot from '../../../game/chess/gameslot.js';
import gamesession from '../../../game/chess/gamesession.js';
import { GameBus } from '../../../game/GameBus.js';
import analysisloader from '../analysisloader.js';
import gamecompressor from '../../../game/chess/gamecompressor.js';

const element_Textarea = document.getElementById('icn-textarea') as HTMLTextAreaElement;
const element_Panel = document.querySelector('.icn-panel')!;
const element_Copy = document.getElementById('btn-icn-copy') as HTMLButtonElement;
const element_Import = document.getElementById('btn-icn-import') as HTMLButtonElement;

/** Session key used when an import leaves a saved game's metadata page. */
const PENDING_IMPORT_KEY = 'analysis.pendingImport';

function init(): void {
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
	element_Textarea.addEventListener('keydown', (event) => {
		if (event.key !== 'Enter') return;
		event.preventDefault();
		importFromTextarea();
	});

	element_Copy.addEventListener('click', () => void copyToClipboard());
	element_Import.addEventListener('mousedown', (event) => event.preventDefault());
	element_Import.addEventListener('click', importFromTextarea);
}

function updateSelectionState(): void {
	element_Panel.classList.toggle('text-selected', document.activeElement === element_Textarea);
}

function getGameICN(gamefile: GameFile): string {
	const longform = gamecompressor.compressGamefile(gamefile);
	const viewedPlyCount = gamefile.state.local.moveIndex + 1;
	if (longform.moves && longform.moves.length > viewedPlyCount)
		longform.moves = longform.moves.slice(0, viewedPlyCount);
	return icnconverter.LongToShort_Format(longform, {
		skipPosition: false,
		compact: true,
		spaces: false,
		comments: false,
		make_new_lines: false,
		move_numbers: false,
	});
}

function refresh(): void {
	const gamefile = gameslot.getGamefile();
	if (!gamefile) return;
	element_Textarea.value = getGameICN(gamefile);
	updateSelectionState();
}

async function copyToClipboard(): Promise<void> {
	try {
		await navigator.clipboard.writeText(element_Textarea.value);
		toast.show('Copied game to clipboard!');
	} catch (error) {
		toast.show(`Clipboard permission denied. This might be your browser.\n${error}`, {
			error: true,
		});
	}
}

function importFromTextarea(): void {
	if (gamesession.isLoading()) return toast.showPleaseWaitForTask();
	const text = element_Textarea.value.trim();
	if (!text || !isValidIcn(text)) return;

	if (window.analysisPageData.gameId !== null) {
		sessionStorage.setItem(PENDING_IMPORT_KEY, text);
		window.location.assign('/analysis');
		return;
	}

	element_Textarea.blur();
	importIcnText(text);
}

function isValidIcn(text: string): boolean {
	try {
		icnconverter.ShortToLong_Format(text);
		return true;
	} catch (error) {
		console.error(error);
		toast.show('Invalid ICN notation.', { error: true });
		return false;
	}
}

function importIcnText(text: string): boolean {
	if (!isValidIcn(text)) return false;
	void analysisloader.pasteGame(text);
	return true;
}

function takePendingImport(): string | null {
	const text = sessionStorage.getItem(PENDING_IMPORT_KEY);
	if (text !== null) sessionStorage.removeItem(PENDING_IMPORT_KEY);
	return text;
}

export default { init, getGameICN, importIcnText, takePendingImport };
