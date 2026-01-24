// src/client/scripts/esm/game/gui/boardeditor/guiloadposition.ts

/**
 * Manages the GUI popup window for the Load Positions UI of the board editor
 */

import type { EditorAbridgedSaveState, EditorSaveState } from '../../boardeditor/eactions';

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

/** Confirmation dialog modal elements */
const element_modal = document.getElementById('load-position-modal-overlay')!;
const element_modalCloseButton = document.getElementById('close-load-position-modal')!;
const element_modalTitle = document.getElementById('load-position-modal-title')!;
const element_modalMessage = document.getElementById('load-position-modal-message')!;
const element_modalNoButton = document.getElementById('load-position-modal-no')!;
const element_modalYesButton = document.getElementById('load-position-modal-yes')!;

/** The current open/close mode of the Load Position UI */
let mode: 'load' | 'save-as' | undefined = undefined;

/** The current mode of the Confirmation dialog modal */
let modal_mode: 'load' | 'delete' | 'overwrite_save' | undefined = undefined;
let current_modal_positionname: string | undefined = undefined;
let current_modal_key: string | undefined = undefined;
let current_modal_unabridged_key: string | undefined = undefined;

const delete_button_svg = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 2400 2400" width="26" height="26"><g fill="#333"><path d="M300 639c0-49 35-88 77-88h267c53-2 100-40 117-97l3-10 12-39c7-24 13-45 21-63 34-74 97-126 170-139 17-3 37-3 60-3h347c22 0 42 0 60 3 72 13 135 65 169 140 8 17 14 40 21 62l12 40 3 10c18 56 74 94 127 96h257c42 0 77 40 77 88s-35 87-77 87H377c-42 0-77-39-77-87Z"/><path d="M1160 2200h80c279 0 418 0 508-89 90-88 100-233 119-524l26-419c10-158 15-236-30-286-45-50-122-50-275-50H812c-153 0-230 0-275 50-45 50-40 128-30 286l26 419c19 290 28 436 119 524 90 90 230 90 508 90Zm-135-981a76 76 0 00-82-70 78 78 0 00-68 86l50 526c4 43 41 75 82 70a78 78 0 00 68-86l-50-526Zm432-70c42 4 72 42 68 86l-50 526a76 76 0 01-82 70 78 78 0 01-68-86l50-526a75 75 0 01 82-70Z" fill-rule="evenodd" clip-rule="evenodd"/></g></svg>`;
const load_button_svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-.5 0 7 7" width="20" height="20"><path fill="#333" fill-rule="evenodd" d="M5.495 2.573 1.5.143C.832-.266 0 .25 0 1.068V5.93c0 .82.832 1.333 1.5.927l3.995-2.43c.673-.41.673-1.445 0-1.855"/></svg>`;

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
	closeModal();
	updateSavedPositionListUI();
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
	closeModal();
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

function openModal(
	mode: typeof modal_mode,
	positionname: string,
	key: string,
	unabridged_key: string,
): void {
	modal_mode = mode;
	current_modal_positionname = positionname;
	current_modal_key = key;
	current_modal_unabridged_key = unabridged_key;

	if (modal_mode === 'delete') {
		element_modalTitle.textContent = 'Delete position?';
		element_modalMessage.textContent = `Are you sure that you want to delete position ${positionname}? This cannot be undone.`;
	} else if (modal_mode === 'load') {
		element_modalTitle.textContent = 'Load position?';
		element_modalMessage.textContent = `Are you sure that you want to load position ${positionname}? Unsaved changes to the current position will be lost.`;
	} else if (modal_mode === 'overwrite_save') {
		element_modalTitle.textContent = 'Overwrite position?';
		element_modalMessage.textContent = `Are you sure that you want to overwrite position ${positionname}? This cannot be undone.`;
	}
	element_modal.classList.remove('hidden');
	initModalListeners();
}

function closeModal(): void {
	modal_mode = undefined;
	current_modal_positionname = undefined;
	current_modal_key = undefined;
	current_modal_unabridged_key = undefined;
	element_modal.classList.add('hidden');
	closeModalListeners();
}

// Load position UI specific listeners -------------------------------------------

function initSavePositionUIListeners(): void {
	element_saveCurrentPositionButton.addEventListener('click', onSaveButtonPress);
}

function closeSavePositionUIListeners(): void {
	element_saveCurrentPositionButton.removeEventListener('click', onSaveButtonPress);
}

function unregisterAllPositionButtonListeners(): void {
	for (const [button, { type, handler }] of registeredButtonListeners) {
		button.removeEventListener(type, handler);
	}
	registeredButtonListeners.clear();
}

function initModalListeners(): void {
	element_modalCloseButton.addEventListener('click', closeModal);
	element_modalNoButton.addEventListener('click', closeModal);
	element_modalYesButton.addEventListener('click', onModalYesButtonPress);
}

function closeModalListeners(): void {
	element_modalCloseButton.removeEventListener('click', closeModal);
	element_modalNoButton.removeEventListener('click', closeModal);
	element_modalYesButton.removeEventListener('click', onModalYesButtonPress);
}

// Functions -----------------------------------------------------------------

async function onModalYesButtonPress(): Promise<void> {
	if (
		modal_mode === undefined ||
		current_modal_positionname === undefined ||
		current_modal_key === undefined ||
		current_modal_unabridged_key === undefined
	) {
		closeModal();
		return;
	} else if (modal_mode === 'delete') {
		// Delete position
		await indexeddb.deleteItem(current_modal_key);
		await indexeddb.deleteItem(current_modal_unabridged_key);
		await updateSavedPositionListUI();
	} else if (modal_mode === 'load') {
		// Load position
		const editorSaveState = await indexeddb.loadItem<EditorSaveState>(
			current_modal_unabridged_key,
		);
		if (editorSaveState === undefined || editorSaveState.variantOptions === undefined) {
			console.error(
				`Saved position ${current_modal_unabridged_key} appears to be corrupted, deleting...`,
			);
			await indexeddb.deleteItem(current_modal_key);
			await indexeddb.deleteItem(current_modal_unabridged_key);
			await updateSavedPositionListUI();
		} else {
			floatingWindow.close(false);
			eactions.load(editorSaveState);
		}
	} else if (modal_mode === 'overwrite_save') {
		await eactions.save(current_modal_positionname);
		updateSavedPositionListUI();
	}

	closeModal();
}

/**
 * Gets executed when the "save" button is pressed
 */
async function onSaveButtonPress(): Promise<void> {
	const positionname = element_saveAsPositionName.value;
	if (positionname === '') return;
	if (positionname.length > eactions.POSITION_NAME_MAX_LENGTH) {
		console.error(
			`This should not happen, position name input box is restricted to ${eactions.POSITION_NAME_MAX_LENGTH} chars, you submitted ${positionname.length} chars.`,
		);
		return;
	}
	const key = `editor-save-${positionname}`;
	const unabridged_key = key.replace('editor-saveinfo-', 'editor-save-');
	const previous_save = await indexeddb.loadItem<EditorSaveState>(key);

	if (previous_save === undefined) {
		await eactions.save(positionname);
		updateSavedPositionListUI();
	} else openModal('overwrite_save', positionname, key, unabridged_key);
}

/**
 * Gets executed when a "load position" button is clicked
 */
async function onLoadButtonClick(
	key: string,
	unabridged_key: string,
	positionname: string,
): Promise<void> {
	openModal('load', positionname, key, unabridged_key);
}

/**
 * Gets executed when a "delete position" button is clicked
 */
async function onDeleteButtonClick(
	key: string,
	unabridged_key: string,
	positionname: string,
): Promise<void> {
	openModal('delete', positionname, key, unabridged_key);
}

/**
 * Update the saved positions list
 */
async function updateSavedPositionListUI(): Promise<void> {
	unregisterAllPositionButtonListeners(); // unregister position button listeners
	element_savedPositionsToLoad.replaceChildren(); // empty existing position list

	const keys = await indexeddb.getAllKeys();

	for (const key of keys) {
		if (!key.startsWith('editor-saveinfo-')) continue;

		const unabridged_key = key.replace('editor-saveinfo-', 'editor-save-');
		const editorAbridgedSaveState = await indexeddb.loadItem<EditorAbridgedSaveState>(key);

		// Name
		const name_cell = document.createElement('div');
		const positionname = editorAbridgedSaveState?.positionname;
		if (positionname !== undefined) name_cell.textContent = positionname;
		else {
			console.error(
				`Saved position entry ${unabridged_key} does not have a valid positionname entry, deleting...`,
			);
			await indexeddb.deleteItem(key);
			await indexeddb.deleteItem(unabridged_key);
			continue;
		}
		const row = document.createElement('div');
		row.className = 'saved-position';
		row.appendChild(name_cell);

		// Piececount
		const piececount_cell = document.createElement('div');
		piececount_cell.textContent = String(editorAbridgedSaveState?.pieceCount ?? '');
		row.appendChild(piececount_cell);

		// Date
		const date_cell = document.createElement('div');
		const timestamp = editorAbridgedSaveState?.timestamp;
		if (timestamp !== undefined) {
			const { UTCDate } = timeutil.convertTimestampToUTCDateUTCTime(timestamp);
			date_cell.textContent = UTCDate;
		} else date_cell.textContent = '';
		row.appendChild(date_cell);

		// Buttons
		const buttons_cell = document.createElement('div');

		// "Load" button
		const loadBtn = document.createElement('button');
		loadBtn.innerHTML = load_button_svg;
		loadBtn.className = 'btn saved-position-btn';
		registerButtonClick(loadBtn, () => onLoadButtonClick(key, unabridged_key, positionname));
		buttons_cell.appendChild(loadBtn);

		// "Delete" button
		const deleteBtn = document.createElement('button');
		deleteBtn.className = 'btn saved-position-btn';
		deleteBtn.innerHTML = delete_button_svg;
		registerButtonClick(deleteBtn, () =>
			onDeleteButtonClick(key, unabridged_key, positionname),
		);
		buttons_cell.appendChild(deleteBtn);

		row.appendChild(buttons_cell);
		element_savedPositionsToLoad.appendChild(row);
	}
}

// Exports -----------------------------------------------------------------

export default {
	openLoadPosition,
	openSavePositionAs,
	close: floatingWindow.close,
	getMode,
	updateSavedPositionListUI,
};
