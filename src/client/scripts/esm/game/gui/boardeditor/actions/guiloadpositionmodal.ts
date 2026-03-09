// src/client/scripts/esm/game/gui/boardeditor/actions/guiloadpositionmodal.ts

/**
 * Manages the confirmation dialog modal for the Load Position UI of the board editor.
 * Accepts a generic onConfirm callback so it stays decoupled from the list and save-form modules.
 */

import guipause from '../../guipause';
import { listener_document } from '../../../chess/game';

// Types -------------------------------------------------------------------------

/** Different modes for the modal confirmation dialog */
export type ModalMode = 'load' | 'delete' | 'overwrite_save';

/** Type for current config of the confirmation dialog modal */
type ModalConfig = {
	mode: ModalMode;
	position_name: string;
	onConfirm: () => Promise<void> | void;
};

// Elements ----------------------------------------------------------

/** Confirmation dialog modal elements */
const element_modal = document.getElementById('load-position-modal-overlay')!;
const element_modalCloseButton = document.getElementById('close-load-position-modal')!;
const element_modalTitle = document.getElementById('load-position-modal-title')!;
const element_modalMessage = document.getElementById('load-position-modal-message')!;
const element_modalNoButton = document.getElementById('load-position-modal-no')!;
const element_modalYesButton = document.getElementById('load-position-modal-yes')!;

// Variables ----------------------------------------------------------------

/** The current config of the Confirmation dialog modal */
let modal_config: ModalConfig | undefined = undefined;

// Functions -----------------------------------------------------------------

/**
 * Open the confirmation modal with the given mode and callback.
 * @param onConfirm Called when the user presses the "Yes" button.
 */
function openModal(
	mode: ModalMode,
	position_name: string,
	onConfirm: () => Promise<void> | void,
): void {
	modal_config = { mode, position_name, onConfirm };

	if (modal_config.mode === 'delete') {
		element_modalTitle.textContent = 'Delete position?';
		element_modalMessage.textContent = `Are you sure that you want to delete position "${position_name}"? This cannot be undone.`;
	} else if (modal_config.mode === 'load') {
		element_modalTitle.textContent = 'Load position?';
		element_modalMessage.textContent = `Are you sure that you want to load position "${position_name}"? Unsaved changes to the current position will be lost.`;
	} else if (modal_config.mode === 'overwrite_save') {
		element_modalTitle.textContent = 'Overwrite position?';
		element_modalMessage.textContent = `Are you sure that you want to overwrite position "${position_name}"? This cannot be undone.`;
	}
	element_modal.classList.remove('hidden');
	// Blur the triggering button so that when the modal closes via keyboard (Escape/Enter),
	// focus doesn't snap back to it and show an unwanted blue outline.
	(document.activeElement as HTMLElement)?.blur();
	initModalListeners();
}

function closeModal(): void {
	modal_config = undefined;
	element_modal.classList.add('hidden');
	closeModalListeners();
}

// Listeners -------------------------------------------

function initModalListeners(): void {
	element_modalCloseButton.addEventListener('click', closeModal);
	element_modalNoButton.addEventListener('click', closeModal);
	element_modalYesButton.addEventListener('click', onModalYesButtonPress);
	document.addEventListener('keydown', onModalKeyDown);
}

function closeModalListeners(): void {
	element_modalCloseButton.removeEventListener('click', closeModal);
	element_modalNoButton.removeEventListener('click', closeModal);
	element_modalYesButton.removeEventListener('click', onModalYesButtonPress);
	document.removeEventListener('keydown', onModalKeyDown);
}

function onModalKeyDown(e: KeyboardEvent): void {
	if (e.key === 'Enter') {
		e.preventDefault(); // Prevent browser from firing a synthetic click on the focused "Save" button
		onModalYesButtonPress();
	} else if (e.key === 'Escape') {
		// Ensure priority when deciding who gets the escape key event
		if (guipause.areWePaused()) return;
		listener_document.claimKey('Escape');
		closeModal();
	}
}

function onModalYesButtonPress(): void {
	if (modal_config === undefined) {
		closeModal();
		return;
	}

	const { onConfirm } = modal_config; // Pull callback before clearing state
	closeModal(); // Close modal immediately to clear UI
	onConfirm();
}

/** Returns true if the confirmation modal is currently open. */
function isOpen(): boolean {
	return modal_config !== undefined;
}

// Exports -----------------------------------------------------------------

export default {
	openModal,
	closeModal,
	isOpen,
};
