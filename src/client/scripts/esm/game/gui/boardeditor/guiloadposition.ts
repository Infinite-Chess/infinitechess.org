// src/client/scripts/esm/game/gui/boardeditor/guiloadposition.ts

/**
 * Manages the GUI popup window for the Load Positions UI of the board editor
 */

import type { MetaData } from '../../../../../../shared/chess/util/metadata';
import type { LongFormatIn } from '../../../../../../shared/chess/logic/icn/icnconverter';
import type { VariantOptions } from '../../../../../../shared/chess/logic/initvariant';
import type { EditorSaveState, EditorAbridgedSaveState } from '../../boardeditor/actions/esave';
import type {
	CloudPositionRecord,
	CloudSaveListRecord,
} from '../../boardeditor/actions/editorSavesAPI';

import editorutil from '../../../../../../shared/editor/editorutil';
import icnconverter from '../../../../../../shared/chess/logic/icn/icnconverter';

import esave from '../../boardeditor/actions/esave';
import style from '../style';
import toast from '../toast';
import eactions from '../../boardeditor/actions/eactions';
import guipause from '../guipause';
import IndexedDB from '../../../util/IndexedDB';
import egamerules from '../../boardeditor/egamerules';
import boardeditor from '../../boardeditor/boardeditor';
import validatorama from '../../../util/validatorama';
import editorSavesAPI from '../../boardeditor/actions/editorSavesAPI';
import guifloatingwindow from './guifloatingwindow';
import { listener_document } from '../../chess/game';

// Types -------------------------------------------------------------------------

/** Object to keep track of listener for position button */
type ButtonHandlerPair = {
	type: 'click';
	handler: (e: MouseEvent) => void;
};

/** Different modes for the modal confirmation dialog */
type ModalMode = 'load' | 'delete' | 'overwrite_save';

/** Whether a position is stored locally (IndexedDB) or on the server */
export type StorageType = 'local' | 'cloud';

/** A unified save entry for display, regardless of whether it's stored locally or on the cloud */
type UnifiedSave = { storage_type: StorageType } & EditorAbridgedSaveState;

/** Type for current config of the confirmation dialog modal */
type ModalConfig = {
	mode: ModalMode;
	position_name: string;
	storage_type: StorageType;
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

/** The outer container for the saved positions section. */
const element_savedPositions = document.querySelector('.saved-positions')!;

/** List of saved positions */
const element_savedPositionsToLoad = document.getElementById('saved-position-list')!;

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
let modal_config: ModalConfig | undefined = undefined;

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

function openModal(mode: ModalMode, position_name: string, storage_type: StorageType): void {
	modal_config = { mode, position_name, storage_type };

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
	document.addEventListener('keydown', onSaveKeyDown);
}

function closeSavePositionUIListeners(): void {
	element_saveCurrentPositionButton.removeEventListener('click', onSaveButtonPress);
	document.removeEventListener('keydown', onSaveKeyDown);
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
	document.addEventListener('keydown', onModalKeyDown);
}

function closeModalListeners(): void {
	element_modalCloseButton.removeEventListener('click', closeModal);
	element_modalNoButton.removeEventListener('click', closeModal);
	element_modalYesButton.removeEventListener('click', onModalYesButtonPress);
	document.removeEventListener('keydown', onModalKeyDown);
}

// Functions -----------------------------------------------------------------

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

/** Deletes a position locally from IndexedDB. */
async function deleteLocalPosition(position_name: string): Promise<void> {
	await Promise.all([
		IndexedDB.deleteItem(`${esave.EDITOR_SAVEINFO_PREFIX}${position_name}`),
		IndexedDB.deleteItem(`${esave.EDITOR_SAVE_PREFIX}${position_name}`),
	]);
}

/**
 * Deletes a position from the server.
 * @returns Whether the server request succeeded.
 */
async function deleteCloudPosition(position_name: string): Promise<void> {
	try {
		await editorSavesAPI.deletePosition(position_name);
	} catch (err) {
		console.error('Failed to delete cloud position:', err);
		const errMsg = err instanceof Error ? err.message : String(err);
		toast.show('Failed to delete position from the cloud: ' + errMsg, { error: true });
	}
}

/**
 * Parses a CloudPositionRecord into an EditorSaveState.
 * @returns An EditorSaveState on success, undefined if ICN parsing fails.
 */
function parseCloudPosition(
	position_name: string,
	cloudPosition: CloudPositionRecord,
): EditorSaveState | undefined {
	let longFormOut;
	try {
		longFormOut = icnconverter.ShortToLong_Format(cloudPosition.icn);
	} catch (err) {
		console.error('Failed to parse cloud position ICN:', err);
		toast.show('The position was corrupted.', { error: true });
		return;
	}
	const variantOptions: VariantOptions = {
		position: longFormOut.position ?? new Map(),
		gameRules: longFormOut.gameRules,
		state_global: {
			...longFormOut.state_global,
			specialRights: longFormOut.state_global.specialRights ?? new Set(),
		},
		fullMove: longFormOut.fullMove,
	};
	return {
		position_name,
		timestamp: cloudPosition.timestamp,
		piece_count: variantOptions.position.size,
		variantOptions,
		pawnDoublePush: cloudPosition.pawn_double_push,
		castling: cloudPosition.castling,
	};
}

/**
 * Downloads a position from the server.
 * @returns An EditorSaveState on success, undefined on failure.
 */
async function downloadCloudPosition(position_name: string): Promise<EditorSaveState | undefined> {
	let cloudPosition: CloudPositionRecord;
	try {
		cloudPosition = await editorSavesAPI.getPosition(position_name);
	} catch (err) {
		console.error('Failed to load cloud position:', err);
		const errMsg = err instanceof Error ? err.message : String(err);
		toast.show('Failed to load position from the cloud: ' + errMsg, { error: true });
		return;
	}
	return parseCloudPosition(position_name, cloudPosition);
}

/**
 * Reads a position from IndexedDB.
 * @returns An EditorSaveState on success, undefined on failure.
 */
async function readLocalPosition(position_name: string): Promise<EditorSaveState | undefined> {
	const save_key = `${esave.EDITOR_SAVE_PREFIX}${position_name}`;
	const editorSaveStateRaw = await IndexedDB.loadItem(save_key);
	const editorSaveStateParsed = esave.EditorSaveStateSchema.safeParse(editorSaveStateRaw);
	if (!editorSaveStateParsed.success) {
		console.error(
			`Invalid EditorSaveState ${save_key} in IndexedDB ${editorSaveStateParsed.error}`,
		);
		toast.show(`The position was corrupted.`, { error: true });
		return;
	}
	return editorSaveStateParsed.data;
}

async function onModalYesButtonPress(): Promise<void> {
	if (modal_config === undefined) {
		closeModal();
		return;
	}

	const { mode, position_name, storage_type } = modal_config; // Pull properties before clearing its state
	closeModal(); // Close modal immediately to clear UI

	if (mode === 'delete') {
		// Delete position
		if (storage_type === 'cloud') {
			await deleteCloudPosition(position_name);
		} else {
			await deleteLocalPosition(position_name);
		}
		// Clear active position name if the deleted position was active
		if (boardeditor.getActivePositionName() === position_name)
			boardeditor.setActivePositionName(undefined);
		updateSavedPositionListUI();
	} else if (mode === 'load') {
		// Load position
		const editorSaveState =
			storage_type === 'cloud'
				? await downloadCloudPosition(position_name)
				: await readLocalPosition(position_name);
		if (editorSaveState !== undefined) {
			floatingWindow.close(false);
			await eactions.load(editorSaveState);
			if (storage_type === 'cloud')
				boardeditor.setActivePositionName(editorSaveState.position_name, 'cloud');
		}
	} else if (mode === 'overwrite_save') {
		await esave.saveLocal(position_name);
		updateSavedPositionListUI();
	}
}

function onSaveKeyDown(e: KeyboardEvent): void {
	if (e.key === 'Enter' && modal_config === undefined) onSaveButtonPress();
}

/**
 * Gets executed when the "save" button is pressed
 */
async function onSaveButtonPress(): Promise<void> {
	const positionname = element_saveAsPositionName.value;
	if (positionname === '') return;
	if (positionname.length > editorutil.POSITION_NAME_MAX_LENGTH) {
		console.error(
			`This should not happen, position name input box is restricted to ${editorutil.POSITION_NAME_MAX_LENGTH} chars, you submitted ${positionname.length} chars.`,
		);
		return;
	}

	// If a local save already exists, ask to overwrite it locally
	const saveinfo_key = `${esave.EDITOR_SAVEINFO_PREFIX}${positionname}`;
	const previous_saveinfoRaw = await IndexedDB.loadItem(saveinfo_key);
	const previous_saveinfoParsed =
		esave.EditorAbridgedSaveStateSchema.safeParse(previous_saveinfoRaw);
	if (previous_saveinfoParsed.success) {
		openModal('overwrite_save', positionname, 'local');
		return;
	}

	// No existing save found — save locally
	await esave.saveLocal(positionname);
	updateSavedPositionListUI();
}

/** Create a button element for one position row, with given SVG href. */
function createButtonElement(svgHref: string): HTMLButtonElement {
	const button = document.createElement('button');
	const svg = document.createElementNS(style.SVG_NS, 'svg');
	const use = document.createElementNS(style.SVG_NS, 'use');
	use.setAttribute('href', svgHref);
	svg.appendChild(use);
	button.appendChild(svg);
	button.classList.add('btn');
	button.classList.add('saved-position-btn');
	return button;
}

/**
 * Given a UnifiedSave entry,
 * generate a row for the list of saved positions.
 * A "row" has the following DOM structure:
 *
 * <div class="saved-position">
 *   <div>POSITION_NAME</div>
 *   <div class="piece-count">PIECE_COUNT</div>
 *   <div class="date">DATE</div>
 *   <!-- Load -->
 *   <button class="btn saved-position-btn">
 *     <svg><use href="#svg-load"/></svg>
 *   </button>
 *   <!-- Cloud Save (only when logged in) -->
 *   <button class="btn saved-position-btn cloud-save [local]">
 *     <svg><use href="#svg-cloud-save"/></svg>
 *   </button>
 *   <!-- Delete -->
 *   <button class="btn saved-position-btn">
 *     <svg><use href="#svg-delete"/></svg>
 *   </button>
 * </div>
 */
function generateRowForSavedPositionsElement(
	save: UnifiedSave,
	showCloudButton: boolean,
): HTMLDivElement {
	const row = document.createElement('div');
	row.classList.add('saved-position');

	// Name
	const name_cell = document.createElement('div');
	const position_name = save.position_name ?? '';
	name_cell.textContent = position_name;
	name_cell.title = position_name; // Let's browser's automatic tooltips show the full title on hover, if it's truncated via ellipsis
	row.appendChild(name_cell);

	// Piececount
	const piececount_cell = document.createElement('div');
	piececount_cell.classList.add('piece-count');
	const piece_count = String(save.piece_count);
	piececount_cell.textContent = piece_count;
	piececount_cell.title = piece_count;
	row.appendChild(piececount_cell);

	// Date
	const date_cell = document.createElement('div');
	date_cell.classList.add('date');
	const timestamp = save.timestamp;
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
	const loadBtn = createButtonElement('#svg-load');
	registerButtonClick(loadBtn, () => openModal('load', position_name, save.storage_type));
	row.appendChild(loadBtn);

	// "Cloud Save" button (only when logged in)
	if (showCloudButton) {
		const cloudBtn = createButtonElement('#svg-cloud-save');
		cloudBtn.classList.add('cloud-save');
		if (save.storage_type === 'local') {
			// Local save: greyed-out cloud button (not yet on cloud)
			cloudBtn.classList.add('local');
		}
		registerButtonClick(cloudBtn, () =>
			onCloudButtonPress(position_name, save.storage_type, cloudBtn),
		);
		row.appendChild(cloudBtn);
	}

	// "Delete" button
	const deleteBtn = createButtonElement('#svg-delete');
	registerButtonClick(deleteBtn, () => openModal('delete', position_name, save.storage_type));
	row.appendChild(deleteBtn);

	// Highlight row if position is active
	if (
		boardeditor.getActivePositionName() === position_name &&
		boardeditor.getActivePositionStorageType() === save.storage_type
	)
		row.classList.add('active-position');

	return row;
}

/**
 * Converts an EditorSaveState to ICN and uploads it to the cloud.
 * Does NOT modify local storage or the active position state.
 * @returns Whether the upload succeeded (errors are toasted internally).
 */
async function performCloudUpload(
	position_name: string,
	editorSaveState: EditorSaveState,
): Promise<boolean> {
	// Convert variantOptions to ICN
	const longFormatIn: LongFormatIn = {
		metadata: {} as MetaData, // Empty metadata object required by ICN converter
		position: editorSaveState.variantOptions.position,
		gameRules: editorSaveState.variantOptions.gameRules,
		state_global: editorSaveState.variantOptions.state_global,
		fullMove: editorSaveState.variantOptions.fullMove ?? 1,
	};
	let icn: string;
	try {
		icn = icnconverter.LongToShort_Format(longFormatIn, {
			skipPosition: false,
			compact: true,
			spaces: false,
			comments: false,
			make_new_lines: false,
			move_numbers: false,
		});
	} catch (err) {
		console.error('Failed to convert position to ICN:', err);
		toast.show('Failed to convert position to ICN for cloud upload.', { error: true });
		return false;
	}

	try {
		await editorSavesAPI.savePosition(
			position_name,
			editorSaveState.piece_count,
			editorSaveState.timestamp,
			icn,
			editorSaveState.pawnDoublePush ?? false,
			editorSaveState.castling ?? false,
		);
	} catch (err) {
		console.error('Failed to upload position to cloud:', err);
		const errMsg = err instanceof Error ? err.message : String(err);
		toast.show('Failed to upload position to cloud: ' + errMsg, { error: true });
		return false;
	}

	toast.show('Position saved to cloud.');
	return true;
}

/** Transfers a local position to the server and removes the local copy. */
async function transferPositionToCloud(position_name: string): Promise<void> {
	const editorSaveState = await readLocalPosition(position_name);
	if (editorSaveState === undefined) return;

	const success = await performCloudUpload(position_name, editorSaveState);
	if (!success) return;

	// Success! Delete local copy now.
	await deleteLocalPosition(position_name);

	if (boardeditor.getActivePositionName() === position_name)
		boardeditor.setActivePositionName(position_name, 'cloud');
}

/**
 * Uploads the currently loaded editor position to
 * the cloud, saving over whatever is already there.
 */
async function uploadCurrentPositionToCloud(position_name: string): Promise<void> {
	const variantOptions = eactions.getCurrentPositionInformation(false);
	const { pawnDoublePush, castling } = egamerules.getPositionDependentGameRules();
	const timestamp = Date.now();
	const piece_count = variantOptions.position.size;

	const editorSaveState: EditorSaveState = {
		position_name,
		timestamp,
		piece_count,
		variantOptions,
		pawnDoublePush,
		castling,
	};

	await performCloudUpload(position_name, editorSaveState);
}

/**
 * Downloads a cloud position to local storage and removes it from the server.
 * @returns Whether the operation succeeded.
 */
async function removePositionFromCloud(position_name: string): Promise<void> {
	let cloudPosition;
	try {
		cloudPosition = await editorSavesAPI.getPosition(position_name);
	} catch (err) {
		console.error('Failed to download cloud position:', err);
		const errMsg = err instanceof Error ? err.message : String(err);
		toast.show('Failed to download cloud position: ' + errMsg, { error: true });
		return;
	}

	const editorSaveState = parseCloudPosition(position_name, cloudPosition);
	if (editorSaveState === undefined) return;

	// Delete from server
	try {
		await editorSavesAPI.deletePosition(position_name);
	} catch (err) {
		console.error('Failed to delete cloud position after download:', err);
		const errMsg = err instanceof Error ? err.message : String(err);
		toast.show('Failed to remove position from cloud: ' + errMsg, { error: true });
		return;
	}

	// Success! Save locally now.
	await esave.saveState(editorSaveState);

	if (boardeditor.getActivePositionName() === position_name)
		boardeditor.setActivePositionName(position_name, 'local');

	toast.show('Position saved locally.');
}

/**
 * Handles pressing the cloud-save button for a position row.
 * - If local: uploads to server and deletes local copy.
 * - If cloud: downloads from server, deletes from server, and saves locally.
 */
async function onCloudButtonPress(
	position_name: string,
	storage_type: StorageType,
	cloudBtn: HTMLButtonElement,
): Promise<void> {
	// Disable cloud button to prevent multiple clicks while operation is in-flight
	cloudBtn.disabled = true;

	if (storage_type === 'local') {
		await transferPositionToCloud(position_name);
	} else {
		await removePositionFromCloud(position_name);
	}

	// Re-enable cloud button and refresh UI
	cloudBtn.disabled = false;
	updateSavedPositionListUI();
}

/**
 * Given a saveinfo_key, read the entry from IndexedDB and return an EditorAbridgedSaveState if successful.
 */
async function loadSinglePositionInfo(
	saveinfo_key: string,
): Promise<EditorAbridgedSaveState | undefined> {
	const editorAbridgedSaveStateRaw = await IndexedDB.loadItem(saveinfo_key);
	const editorAbridgedSaveStateParsed = esave.EditorAbridgedSaveStateSchema.safeParse(
		editorAbridgedSaveStateRaw,
	);
	if (!editorAbridgedSaveStateParsed.success) {
		console.error(
			`Invalid EditorAbridgedSaveState "${saveinfo_key}" in IndexedDB: ${editorAbridgedSaveStateParsed.error}`,
		);
		return;
	}
	return editorAbridgedSaveStateParsed.data;
}

/**
 * Update the saved positions list
 */
async function updateSavedPositionListUI(): Promise<void> {
	unregisterAllPositionButtonListeners(); // unregister position button listeners
	element_savedPositionsToLoad.replaceChildren(); // empty existing position list

	const areLoggedIn = validatorama.areWeLoggedIn();

	// Toggle CSS class to adjust header column widths for cloud button
	element_savedPositions.classList.toggle('with-cloud', areLoggedIn);

	// Build unified list (local + cloud)
	const allSaves: UnifiedSave[] = [];

	// Fetch cloud saves if logged in
	if (areLoggedIn) {
		let cloudSaves: CloudSaveListRecord[] = [];
		try {
			cloudSaves = await editorSavesAPI.getSavedPositions();
		} catch (err) {
			console.error('Failed to fetch cloud saves:', err);
			const errMsg = err instanceof Error ? err.message : String(err);
			toast.show('Failed to fetch cloud saves: ' + errMsg, { error: true });
		}

		for (const save of cloudSaves) {
			allSaves.push({
				storage_type: 'cloud',
				position_name: save.name,
				timestamp: save.timestamp,
				piece_count: save.piece_count,
			});
		}
	}

	// Get a list of all saveinfo_keys
	const saveinfo_keys = (await IndexedDB.getAllKeys()).filter((key) =>
		key.startsWith(esave.EDITOR_SAVEINFO_PREFIX),
	);

	// Load all local saves
	const localSaveList = (
		await Promise.all(saveinfo_keys.map((saveinfo_key) => loadSinglePositionInfo(saveinfo_key)))
	).filter((x) => x !== undefined);

	// Add local saves
	for (const abridged of localSaveList) {
		allSaves.push({ storage_type: 'local', ...abridged });
	}

	// Sort by timestamp (newest first)
	allSaves.sort((a, b) => b.timestamp - a.timestamp);

	// Generate and append row by row to saved positions UI
	for (const save of allSaves) {
		const row = generateRowForSavedPositionsElement(save, areLoggedIn);
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
	uploadCurrentPositionToCloud,
};
