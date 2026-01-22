// src/client/scripts/esm/game/gui/boardeditor/guiloadposition.ts

/**
 * Manages the GUI popup window for the Load Positions UI of the board editor
 */

import type { EditorAbridgedSaveState } from '../../boardeditor/eactions';

import indexeddb from '../../../util/indexeddb';
import guifloatingwindow from './guifloatingwindow';
import timeutil from '../../../../../../shared/util/timeutil';
import eactions from '../../boardeditor/eactions';

// Types -------------------------------------------------------------------------

/** Object to keep track of listener for position button */
type ButtonHandlerPair = {
	type: 'click';
	handler: (e: MouseEvent) => void;
};

// Elements ----------------------------------------------------------

/** Object to keep track of all position button listeners */
const registeredButtonListeners = new Map<HTMLButtonElement, ButtonHandlerPair>();

/** The button the toggles visibility of the Load Position game popup window. */
const element_loadbutton = document.getElementById('load-position')!;

/** The actual window of the Load Positions popup. */
const element_window = document.getElementById('load-position-UI')!;
const element_header = document.getElementById('load-position-UI-header')!;
const element_headerText = document.getElementById('load-position-UI-header-text')!;
const element_closeButton = document.getElementById('close-load-position-UI')!;
/** The button the toggles visibility of the Save Position As popup window. */
const element_saveasbutton = document.getElementById('save-position-as')!;

/** The container for entering a new position name. */
const element_enterPositionName = document.getElementById('enter-position-name')!;
/** Textbox for entering position name */
const element_saveAsPositionName = document.getElementById(
	'save-as-position-name',
)! as HTMLInputElement;
/** "Save" button in UI */
const element_saveCurrentPositionButton = document.getElementById('save-position-button')!;

/** List of saved positions */
const element_savedPositionsToLoad = document.getElementById('load-position-UI-saved-positions')!;

/** The current open/close mode of the Load Position UI */
let mode: 'load' | 'save-as' | undefined = undefined;

// Create floating window -------------------------------------

const floatingWindow = guifloatingwindow.create({
	windowEl: element_window,
	headerEl: element_header,
	closeButtonEl: element_closeButton,
	onOpen,
	onClose,
});

// Utilities----------------------------------------------------------------

function onOpen(): void {
	updateSavedPositionListUI(element_savedPositionsToLoad);
}

function registerButtonClick(button: HTMLButtonElement, handler: (e: MouseEvent) => void): void {
	button.addEventListener('click', handler);
	registeredButtonListeners.set(button, { type: 'click', handler });
}

// Toggling ------------------------------------------------

function openLoadPosition(): void {
	element_headerText.textContent = 'Load Position';
	element_enterPositionName.classList.add('hidden');
	element_loadbutton.classList.add('active');
	element_saveasbutton.classList.remove('active');
	floatingWindow.open();
	mode = 'load';
}

function openSavePositionAs(): void {
	element_headerText.textContent = 'Save Position As';
	element_enterPositionName.classList.remove('hidden');
	element_saveasbutton.classList.add('active');
	element_loadbutton.classList.remove('active');
	floatingWindow.open();
	mode = 'save-as';
	initSavePositionUIListeners();
}

function onClose(resetPositioning = false): void {
	if (resetPositioning) floatingWindow.resetPositioning();
	element_loadbutton.classList.remove('active');
	element_saveasbutton.classList.remove('active');
	mode = undefined;
	unregisterAllPositionButtonListeners();
	element_savedPositionsToLoad.replaceChildren();
	closeSavePositionUIListeners();
}

/** Gets the current open/close mode of the Load Position UI */
function getMode(): typeof mode {
	return mode;
}

// Gamerules-specific listeners -------------------------------------------

function initSavePositionUIListeners(): void {
	element_saveCurrentPositionButton.addEventListener('click', onSaveButtonPress);
}

function closeSavePositionUIListeners(): void {
	element_saveCurrentPositionButton.removeEventListener('click', onSaveButtonPress);
}

async function onSaveButtonPress(): Promise<void> {
	await eactions.save(element_saveAsPositionName.value);
	updateSavedPositionListUI(element_savedPositionsToLoad);
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

		// Name
		const name_cell = document.createElement('div');
		const positionname = editorSaveinfo?.positionname;
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

		// Load button
		const loadBtn = document.createElement('button');
		loadBtn.textContent = 'L';
		loadBtn.className = 'btn';
		registerButtonClick(loadBtn, () => {
			// TODO: actually load position
		});
		buttons_cell.appendChild(loadBtn);

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
	openLoadPosition,
	openSavePositionAs,
	close: floatingWindow.close,
	getMode,
};
