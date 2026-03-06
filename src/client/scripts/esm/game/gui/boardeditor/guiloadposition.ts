// src/client/scripts/esm/game/gui/boardeditor/guiloadposition.ts

/**
 * Manages the GUI popup window for the Load Positions UI of the board editor
 */

import type { StorageType } from '../../boardeditor/boardeditor';
import type { CloudSaveListRecord } from '../../boardeditor/actions/editorSavesAPI';
import type { EditorAbridgedSaveState } from '../../boardeditor/editortypes';

import editorutil from '../../../../../../shared/editor/editorutil';

import esave from '../../boardeditor/actions/esave';
import style from '../style';
import toast from '../toast';
import ecloud from '../../boardeditor/actions/ecloud';
import eactions from '../../boardeditor/actions/eactions';
import guipause from '../guipause';
import boardeditor from '../../boardeditor/boardeditor';
import { GameBus } from '../../GameBus';
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

/** A unified save entry for display, regardless of whether it's stored locally or on the cloud */
type UnifiedSave = { storage_type: StorageType } & EditorAbridgedSaveState;

/** Type for current config of the confirmation dialog modal */
type ModalConfig = {
	mode: ModalMode;
	position_name: string;
	storage_type: StorageType;
};

/** Cloud saves list returned by a mutation, used to skip a follow-up GET */
type PreloadedCloudSaves = CloudSaveListRecord[] | undefined;

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

/** Spinny pawn loading animation shown during in-flight API requests */
const element_loadingPawn = document.getElementById('load-position-loading-pawn')!;

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

/**
 * A counter for tracking new position loads. Cloud load position
 * requests are discarded if this different when they return.
 */
let load_counter = 0;

/** Count of in-flight API requests — spinner is visible whenever this is > 0 */
let activeRequestCount = 0;

// Load Counter ----------------------------------------------------------

GameBus.addEventListener('game-loaded', () => {
	load_counter++;
	console.log('Incremented positionLoadEpoch');
});

// Loading animation -----------------------------------------------

/** Runs an async API call while showing the loading spinner, hiding it when done. */
async function withRequest<T>(fn: () => Promise<T>): Promise<T> {
	activeRequestCount++;
	element_loadingPawn.classList.remove('hidden');
	try {
		return await fn();
	} finally {
		activeRequestCount = Math.max(0, activeRequestCount - 1);
		if (activeRequestCount === 0) element_loadingPawn.classList.add('hidden');
	}
}

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
	element_saveAsPositionName.focus();
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
	element_saveAsPositionName.value = '';
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

async function onModalYesButtonPress(): Promise<void> {
	if (modal_config === undefined) {
		closeModal();
		return;
	}

	const { mode, position_name, storage_type } = modal_config; // Pull properties before clearing its state
	closeModal(); // Close modal immediately to clear UI

	if (mode === 'delete') {
		// Delete position
		let preloadedCloudSaves: PreloadedCloudSaves;
		if (storage_type === 'cloud') {
			preloadedCloudSaves = await withRequest(() => ecloud.deleteCloud(position_name));
		} else {
			await esave.deleteLocal(position_name);
		}
		// Clear active position name if the deleted position was active
		if (boardeditor.isActivePosition(position_name, storage_type))
			boardeditor.clearActivePosition();
		updateSavedPositionListUI(preloadedCloudSaves);
	} else if (mode === 'load') {
		// Load position
		const initialLoadCount = load_counter;
		const editorSaveState =
			storage_type === 'cloud'
				? await withRequest(() => ecloud.readCloud(position_name))
				: await esave.readLocal(position_name);
		// If the load count changed while the request was in-flight, the user already
		// loaded a different position — discard this stale result.
		if (load_counter !== initialLoadCount) {
			console.log(`Discarding cloud load result`);
			return;
		}
		if (editorSaveState !== undefined) {
			floatingWindow.close(false);
			await eactions.load(editorSaveState, storage_type);
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
	if (positionname.length > editorutil.MAX_POSITION_NAME_LENGTH) {
		console.error(
			`This should not happen, position name input box is restricted to ${editorutil.MAX_POSITION_NAME_LENGTH} chars, you submitted ${positionname.length} chars.`,
		);
		return;
	}

	// If a local save already exists, ask to overwrite it locally
	if (await esave.localSaveExists(positionname)) {
		openModal('overwrite_save', positionname, 'local');
		return;
	}

	// No existing save found — save locally
	await esave.saveLocal(positionname);
	element_saveAsPositionName.value = '';
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
	if (boardeditor.isActivePosition(position_name, save.storage_type))
		row.classList.add('active-position');

	return row;
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

	const preloadedCloudSaves = await withRequest(() =>
		storage_type === 'local'
			? ecloud.transferPositionToCloud(position_name)
			: ecloud.removePositionFromCloud(position_name),
	);

	// Re-enable cloud button regardless of success or failure
	cloudBtn.disabled = false;
	updateSavedPositionListUI(preloadedCloudSaves);
}

/**
 * Update the saved positions list.
 * @param preloadedCloudSaves If provided, skips the cloud GET request and uses this data directly.
 */
async function updateSavedPositionListUI(preloadedCloudSaves?: PreloadedCloudSaves): Promise<void> {
	const areLoggedIn = validatorama.areWeLoggedIn();

	// Build unified list (local + cloud)
	const allSaves: UnifiedSave[] = [];

	// Fetch cloud saves if logged in
	if (areLoggedIn) {
		let cloudSaves: CloudSaveListRecord[] = [];
		if (preloadedCloudSaves !== undefined) {
			// Caller already has the updated list from a mutation response — no extra request needed
			cloudSaves = preloadedCloudSaves;
		} else {
			try {
				cloudSaves = await withRequest(() => editorSavesAPI.getSavedPositions());
			} catch (err) {
				console.error('Failed to fetch cloud saves:', err);
				const errMsg = err instanceof Error ? err.message : String(err);
				toast.show('Failed to fetch cloud saves: ' + errMsg, { error: true });
			}
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

	// Load all local saves
	const localSaveList = await esave.getAllLocalSaveInfos();

	// Add local saves
	for (const abridged of localSaveList) {
		allSaves.push({ storage_type: 'local', ...abridged });
	}

	// Sort by timestamp (newest first)
	allSaves.sort((a, b) => b.timestamp - a.timestamp);

	// All data is ready — unregister old listeners, generate new rows, then swap in atomically
	unregisterAllPositionButtonListeners();
	// Toggle CSS class to adjust header column widths for cloud button
	element_savedPositions.classList.toggle('with-cloud', areLoggedIn);
	const newRows = allSaves.map((save) => generateRowForSavedPositionsElement(save, areLoggedIn));
	element_savedPositionsToLoad.replaceChildren(...newRows);
}

// Exports -----------------------------------------------------------------

export default {
	openLoadPosition,
	openSavePositionAs,
	close: floatingWindow.close,
	getMode,
	updateSavedPositionListUI,
};
