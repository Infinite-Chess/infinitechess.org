// src/client/scripts/esm/game/gui/boardeditor/guiloadposition.ts

/**
 * Manages the GUI popup window for the Load Positions UI of the board editor
 */

import type { EditorAbridgedSaveState } from '../../boardeditor/eactions';

import indexeddb from '../../../util/indexeddb';
import guifloatingwindow from './guifloatingwindow';
import timeutil from '../../../../../../shared/util/timeutil';

// Types -------------------------------------------------------------------------

/** Object to keep track of listener for position button */
type ButtonHandlerPair = {
	type: 'click';
	handler: (e: MouseEvent) => void;
};

// Elements ----------------------------------------------------------

/** Object to keep track of all position button listeners */
const registeredButtonListeners = new Map<HTMLButtonElement, ButtonHandlerPair>();

/** The button the toggles visibility of the Start local game popup window. */
const element_loadbutton = document.getElementById('load-position')!;

/** The actual window of the Game Rules popup. */
const element_window = document.getElementById('load-position-UI')!;
const element_header = document.getElementById('load-position-UI-header')!;
const element_closeButton = document.getElementById('close-load-position-UI')!;

/** List of saved positions */
const element_savedPositionsToLoad = document.getElementById('load-position-UI-saved-positions')!;

// Create floating window (generic behavior) -------------------------------------

const floatingWindow = guifloatingwindow.createFloatingWindow({
	windowEl: element_window,
	headerEl: element_header,
	toggleButtonEl: element_loadbutton,
	closeButtonEl: element_closeButton,
	onOpen,
	onClose,
});

// Utilities----------------------------------------------------------------

function onOpen(): void {
	updateSavedPositionListUI(element_savedPositionsToLoad);
}

function onClose(): void {
	unregisterAllPositionButtonListeners();
	element_savedPositionsToLoad.replaceChildren();
}

function registerButtonClick(button: HTMLButtonElement, handler: (e: MouseEvent) => void): void {
	button.addEventListener('click', handler);
	registeredButtonListeners.set(button, { type: 'click', handler });
}

function unregisterAllPositionButtonListeners(): void {
	for (const [button, { type, handler }] of registeredButtonListeners) {
		button.removeEventListener(type, handler);
	}
	registeredButtonListeners.clear();
}

/**
 * Update the saved positions list
 */
async function updateSavedPositionListUI(element: HTMLElement): Promise<void> {
	unregisterAllPositionButtonListeners(); // unregister position button listeners
	element.replaceChildren(); // empty existing position list

	const keys = await indexeddb.getAllKeys();

	for (const key of keys) {
		if (!key.startsWith('editor-saveinfo-')) continue;

		const editorSaveinfo = await indexeddb.loadItem<EditorAbridgedSaveState>(key);
		console.log(editorSaveinfo);

		// Name
		const name_cell = document.createElement('div');
		const positionname = editorSaveinfo?.positionname;
		console.log(positionname);
		if (positionname !== undefined) name_cell.textContent = positionname;
		else {
			void indexeddb.deleteItem(key);
			continue;
		}
		const row = document.createElement('div');
		row.className = 'saved-position unselectable';
		row.appendChild(name_cell);

		// Piececount
		const piececount_cell = document.createElement('div');
		piececount_cell.textContent = String(editorSaveinfo?.pieceCount ?? '');
		row.appendChild(piececount_cell);

		// Date
		const date_cell = document.createElement('div');
		const timestamp = editorSaveinfo?.timestamp;
		if (timestamp !== undefined) {
			const { UTCDate } = timeutil.convertTimestampToUTCDateUTCTime(timestamp);
			date_cell.textContent = UTCDate;
		} else date_cell.textContent = '';
		row.appendChild(date_cell);

		// Buttons
		const buttons_cell = document.createElement('div');

		// Play button
		const playBtn = document.createElement('button');
		playBtn.textContent = 'P';
		playBtn.className = 'btn';
		registerButtonClick(playBtn, () => {
			console.log('Play', key);
			// TODO: actually load + start game from this saved position
		});
		buttons_cell.appendChild(playBtn);

		// Delete button
		const deleteBtn = document.createElement('button');
		deleteBtn.textContent = 'D';
		deleteBtn.className = 'btn';
		registerButtonClick(deleteBtn, async () => {
			await indexeddb.deleteItem(key);
			await updateSavedPositionListUI(element);
		});
		buttons_cell.appendChild(deleteBtn);

		row.appendChild(buttons_cell);

		element.appendChild(row);
	}
}

// Exports -----------------------------------------------------------------

export default {
	close: floatingWindow.close,
	toggle: floatingWindow.toggle,
	resetPositioning: floatingWindow.resetPositioning,
	updateSavedPositionListUI,
	unregisterAllPositionButtonListeners,
};
