// src/client/scripts/esm/game/gui/boardeditor/actions/loadposition/guiloadposition.ts

/**
 * Manages the GUI popup window for the Load Positions UI of the board editor.
 * Coordinates the floating window, save-as form, confirmation modal, and position list.
 */

import editorutil from '../../../../../../../../shared/util/editorutil';

import esave from '../../../../boardeditor/actions/esave';
import boardeditor from '../../../../boardeditor/boardeditor';
import guifloatingwindow from '../../guifloatingwindow';
import guiloadpositionmodal from './guiloadpositionmodal';
import guiloadpositionsavelist from './guiloadpositionsavelist';

// Elements ----------------------------------------------------------

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

// Variables ----------------------------------------------------------------

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

// Toggling ------------------------------------------------

function onOpen(): void {
	guiloadpositionsavelist.updateSavedPositionListUI();
}

function openLoadPosition(): void {
	element_headerText.textContent = translations.editor.load_position_header;
	element_enterPositionName.classList.add('hidden');
	element_loadbutton.classList.add('active');
	element_saveasbutton.classList.remove('active');
	floatingWindow.open();
	mode = 'load';
}

function openSavePositionAs(): void {
	element_headerText.textContent = translations.editor.save_position_as_header;
	element_enterPositionName.classList.remove('hidden');
	element_saveasbutton.classList.add('active');
	element_loadbutton.classList.remove('active');
	floatingWindow.open();
	mode = 'save-as';
	initSavePositionUIListeners();
	element_saveAsPositionName.focus();
}

function onClose(resetPositioning = false): void {
	if (resetPositioning) floatingWindow.resetPositioning();
	guiloadpositionmodal.closeModal();
	element_loadbutton.classList.remove('active');
	element_saveasbutton.classList.remove('active');
	mode = undefined;
	guiloadpositionsavelist.unregisterAllPositionButtonListeners();
	guiloadpositionsavelist.clearSavedPositionList();
	closeSavePositionUIListeners();
	element_saveAsPositionName.value = '';
}

/** Gets the current open/close mode of the Load Position UI */
function getMode(): typeof mode {
	return mode;
}

// Save-as form listeners -------------------------------------------

function initSavePositionUIListeners(): void {
	element_saveCurrentPositionButton.addEventListener('click', onSaveButtonPress);
	document.addEventListener('keydown', onSaveKeyDown);
}

function closeSavePositionUIListeners(): void {
	element_saveCurrentPositionButton.removeEventListener('click', onSaveButtonPress);
	document.removeEventListener('keydown', onSaveKeyDown);
}

function onSaveKeyDown(e: KeyboardEvent): void {
	// Only trigger save on Enter when the confirmation modal is not open
	if (e.key === 'Enter' && !guiloadpositionmodal.isOpen()) onSaveButtonPress();
}

// Save-as form functions -------------------------------------------

/** Gets executed when the "save" button is pressed. */
async function onSaveButtonPress(): Promise<void> {
	const positionname = element_saveAsPositionName.value.trim(); // Disallow pure whitespace names
	if (positionname === '') return;
	if (positionname.length > editorutil.MAX_POSITION_NAME_LENGTH) {
		console.error(
			`This should not happen, position name input box is restricted to ${editorutil.MAX_POSITION_NAME_LENGTH} chars, you submitted ${positionname.length} chars.`,
		);
		return;
	}

	// If a local save already exists, ask to overwrite it locally
	if (await esave.localSaveExists(positionname)) {
		guiloadpositionmodal.openModal('overwrite_save', positionname, async () => {
			await esave.saveLocal(positionname);
			boardeditor.setActivePosition({ name: positionname, storage_type: 'local' });
			guiloadpositionsavelist.updateSavedPositionListUI();
		});
		return;
	}

	// No existing save found — save locally
	await esave.saveLocal(positionname);
	boardeditor.setActivePosition({ name: positionname, storage_type: 'local' });
	element_saveAsPositionName.value = '';
	guiloadpositionsavelist.updateSavedPositionListUI();
}

// Exports -----------------------------------------------------------------

export default {
	openLoadPosition,
	openSavePositionAs,
	close: floatingWindow.close,
	getMode,
};
