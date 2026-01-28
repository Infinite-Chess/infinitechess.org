// src/client/scripts/esm/game/gui/boardeditor/guiloadposition.ts

/**
 * Manages the GUI popup window for the Load Positions UI of the board editor
 */

import type { EditorSaveState, EditorAbridgedSaveState } from '../../boardeditor/actions/esave';

import IndexedDB from '../../../util/IndexedDB';
import guifloatingwindow from './guifloatingwindow';
import eactions from '../../boardeditor/actions/eactions';
import esave from '../../boardeditor/actions/esave';
import style from '../style';
import statustext from '../statustext';

// Types -------------------------------------------------------------------------

/** Object to keep track of listener for position button */
type ButtonHandlerPair = {
	type: 'click';
	handler: (e: MouseEvent) => void;
};

/** Different modes for the modal confirmation dialog */
type ModalMode = 'load' | 'delete' | 'overwrite_save';

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

// Variables ----------------------------------------------------------------

/** The current open/close mode of the Load Position UI */
let mode: 'load' | 'save-as' | undefined = undefined;

/** The current config of the Confirmation dialog modal */
let modal_config:
	| {
			mode: ModalMode;
			positionname: string;
			saveinfo_key: string;
			save_key: string;
	  }
	| undefined = undefined;

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
	mode: ModalMode,
	positionname: string,
	saveinfo_key: string,
	save_key: string,
): void {
	modal_config = { mode, positionname, saveinfo_key, save_key };

	if (modal_config.mode === 'delete') {
		element_modalTitle.textContent = 'Delete position?';
		element_modalMessage.textContent = `Are you sure that you want to delete position "${positionname}"? This cannot be undone.`;
	} else if (modal_config.mode === 'load') {
		element_modalTitle.textContent = 'Load position?';
		element_modalMessage.textContent = `Are you sure that you want to load position "${positionname}"? Unsaved changes to the current position will be lost.`;
	} else if (modal_config.mode === 'overwrite_save') {
		element_modalTitle.textContent = 'Overwrite position?';
		element_modalMessage.textContent = `Are you sure that you want to overwrite position "${positionname}"? This cannot be undone.`;
	}
	element_modal.classList.remove('hidden');
	initModalListeners();
}

function closeModal(): void {
	modal_config = undefined;
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
	if (modal_config === undefined) {
		closeModal();
		return;
	} else if (modal_config.mode === 'delete') {
		// Delete position
		await IndexedDB.deleteItem(modal_config.saveinfo_key);
		await IndexedDB.deleteItem(modal_config.save_key);
		await updateSavedPositionListUI();
	} else if (modal_config.mode === 'load') {
		// Load position
		const editorSaveStateRaw = await IndexedDB.loadItem(modal_config.save_key);
		const editorSaveStateParsed = esave.EditorSaveStateSchema.safeParse(editorSaveStateRaw);
		if (!editorSaveStateParsed.success) {
			console.error(
				`Invalid EditorSaveState ${modal_config.save_key} in IndexedDB ${editorSaveStateParsed.error}`,
			);
			statustext.showStatus(`The position was corrupted.`, true);
			await Promise.all([
				IndexedDB.deleteItem(modal_config.saveinfo_key),
				IndexedDB.deleteItem(modal_config.save_key),
			]);
			updateSavedPositionListUI();
			return;
		}
		const editorSaveState: EditorSaveState = editorSaveStateParsed.data;
		floatingWindow.close(false);
		eactions.load(editorSaveState);
	} else if (modal_config.mode === 'overwrite_save') {
		await esave.save(modal_config.positionname);
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
	if (positionname.length > esave.POSITION_NAME_MAX_LENGTH) {
		console.error(
			`This should not happen, position name input box is restricted to ${esave.POSITION_NAME_MAX_LENGTH} chars, you submitted ${positionname.length} chars.`,
		);
		return;
	}
	const saveinfo_key = `${esave.EDITOR_SAVEINFO_PREFIX}${positionname}`;
	const save_key = `${esave.EDITOR_SAVE_PREFIX}${positionname}`;

	const previous_saveinfoRaw = await IndexedDB.loadItem(saveinfo_key);
	const previous_saveinfoParsed =
		esave.EditorAbridgedSaveStateSchema.safeParse(previous_saveinfoRaw);
	if (!previous_saveinfoParsed.success) {
		// If there is no previous valid EditorAbridgedSaveState, save under positionname
		await esave.save(positionname);
		updateSavedPositionListUI();
	} else openModal('overwrite_save', positionname, saveinfo_key, save_key);
}

/** Create an HTML button element corresponding to a load button */
function createLoadButtonElement(): HTMLButtonElement {
	const loadBtn = document.createElement('button');
	const svg = document.createElementNS(style.SVG_NS, 'svg');
	const use = document.createElementNS(style.SVG_NS, 'use');
	use.setAttribute('href', '#svg-load');
	svg.appendChild(use);
	loadBtn.appendChild(svg);
	loadBtn.classList.add('btn');
	loadBtn.classList.add('saved-position-btn');
	return loadBtn;
}

/** Create an HTML button element corresponding to a delete button */
function createDeleteButtonElement(): HTMLButtonElement {
	const deleteBtn = document.createElement('button');
	const svg = document.createElementNS(style.SVG_NS, 'svg');
	const use = document.createElementNS(style.SVG_NS, 'use');
	use.setAttribute('href', '#svg-delete');
	svg.appendChild(use);
	deleteBtn.appendChild(svg);
	deleteBtn.classList.add('btn');
	deleteBtn.classList.add('saved-position-btn');
	return deleteBtn;
}

/**
 * Given a saveinfo_key, read the element from local storage and generate a row for the list of saved positions
 *
 * A "row" has the following DOM structure:
 *
 * <div class="saved-position">
 *   <div>POSITION_NAME</div>
 *   <div>PIECE_COUNT</div>
 *   <div>DATE</div>
 *   <!-- Load -->
 *   <button class="btn saved-position-btn">
 *     <svg><use href="#svg-load" /></svg>
 *   </button>
 *   <!-- Delete -->
 *   <button class="btn saved-position-btn">
 *     <svg><use href="#svg-delete" /></svg>
 *   </button>
 * </div>
 */
async function generateRowForSavedPositionsElement(
	saveinfo_key: string,
): Promise<HTMLDivElement | undefined> {
	const save_key = saveinfo_key.replace(esave.EDITOR_SAVEINFO_PREFIX, esave.EDITOR_SAVE_PREFIX);

	const editorAbridgedSaveStateRaw = await IndexedDB.loadItem(saveinfo_key);
	const editorAbridgedSaveStateParsed = esave.EditorAbridgedSaveStateSchema.safeParse(
		editorAbridgedSaveStateRaw,
	);
	if (!editorAbridgedSaveStateParsed.success) {
		console.error(
			`Invalid EditorAbridgedSaveState ${saveinfo_key} in IndexedDB ${editorAbridgedSaveStateParsed.error}`,
		);
		return;
	}
	const editorAbridgedSaveState: EditorAbridgedSaveState = editorAbridgedSaveStateParsed.data;

	const row = document.createElement('div');
	row.classList.add('saved-position');

	// Name
	const name_cell = document.createElement('div');
	const positionname = editorAbridgedSaveState.positionname ?? '';
	name_cell.textContent = positionname;
	name_cell.title = positionname; // Let's browser's automatic tooltips show the full title on hover, if it's truncated via ellipsis
	row.appendChild(name_cell);

	// Piececount
	const piececount_cell = document.createElement('div');
	const piececount = String(editorAbridgedSaveState.pieceCount);
	piececount_cell.textContent = piececount;
	piececount_cell.title = piececount;
	row.appendChild(piececount_cell);

	// Date
	const date_cell = document.createElement('div');
	const timestamp = editorAbridgedSaveState?.timestamp;
	// const { UTCDate } = timeutil.convertTimestampToUTCDateUTCTime(timestamp);

	// Localize the date display to the user's locale
	const dateObj = new Date(timestamp);
	const localeDate = dateObj.toLocaleDateString(undefined, {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	});
	date_cell.textContent = localeDate;
	row.appendChild(date_cell);

	// Buttons

	// "Load" button
	const loadBtn = createLoadButtonElement();
	registerButtonClick(loadBtn, () => openModal('load', positionname, saveinfo_key, save_key));
	row.appendChild(loadBtn);

	// "Delete" button
	const deleteBtn = createDeleteButtonElement();
	registerButtonClick(deleteBtn, () => openModal('delete', positionname, saveinfo_key, save_key));
	row.appendChild(deleteBtn);

	return row;
}

/**
 * Update the saved positions list
 */
async function updateSavedPositionListUI(): Promise<void> {
	unregisterAllPositionButtonListeners(); // unregister position button listeners
	element_savedPositionsToLoad.replaceChildren(); // empty existing position list

	const saveinfo_keys = (await IndexedDB.getAllKeys()).filter((key) =>
		key.startsWith(esave.EDITOR_SAVEINFO_PREFIX),
	);
	for (const saveinfo_key of saveinfo_keys) {
		const row = await generateRowForSavedPositionsElement(saveinfo_key);
		if (row !== undefined) element_savedPositionsToLoad.appendChild(row);
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
