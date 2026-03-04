// src/client/scripts/esm/game/gui/boardeditor/guiloadposition.ts

/**
 * Manages the GUI popup window for the Load Positions UI of the board editor
 */

import type { MetaData } from '../../../../../../shared/chess/util/metadata';
import type { LongFormatIn } from '../../../../../../shared/chess/logic/icn/icnconverter';
import type { VariantOptions } from '../../../../../../shared/chess/logic/initvariant';
import type { CloudSaveListRecord } from '../../boardeditor/actions/editorSavesAPI';
import type { EditorSaveState, EditorAbridgedSaveState } from '../../boardeditor/actions/esave';

import editorutil from '../../../../../../shared/editor/editorutil';
import icnconverter from '../../../../../../shared/chess/logic/icn/icnconverter';

import esave from '../../boardeditor/actions/esave';
import style from '../style';
import toast from '../toast';
import eactions from '../../boardeditor/actions/eactions';
import IndexedDB from '../../../util/IndexedDB';
import boardeditor from '../../boardeditor/boardeditor';
import validatorama from '../../../util/validatorama';
import editorSavesAPI from '../../boardeditor/actions/editorSavesAPI';
import guifloatingwindow from './guifloatingwindow';

// Types -------------------------------------------------------------------------

/** Object to keep track of listener for position button */
type ButtonHandlerPair = {
	type: 'click';
	handler: (e: MouseEvent) => void;
};

/** Different modes for the modal confirmation dialog */
type ModalMode = 'load' | 'delete' | 'overwrite_save';

/** Whether a position is stored locally (IndexedDB) or on the server */
type StorageType = 'local' | 'cloud';

/** Type for current config of the confirmation dialog modal */
type ModalConfig = {
	mode: ModalMode;
	position_name: string;
	storage_type: StorageType;
	saveinfo_key: string;
	save_key: string;
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

/** The outer container for the saved positions section (used to toggle cloud class) */
const element_savedPositions = document.querySelector('.saved-positions')! as HTMLElement;

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

function openModal(
	mode: ModalMode,
	position_name: string,
	saveinfo_key: string,
	save_key: string,
	storage_type: StorageType,
): void {
	modal_config = {
		mode,
		position_name,
		saveinfo_key,
		save_key,
		storage_type,
	};

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

/**
 * Delete saved position according to provided modal_config argument,
 * and update the active position name if necessary.
 */
async function deleteSavedPosition(modal_config: ModalConfig): Promise<void> {
	// Delete saved position
	await Promise.all([
		IndexedDB.deleteItem(modal_config.saveinfo_key),
		IndexedDB.deleteItem(modal_config.save_key),
	]);

	// If deleted position was active, set active position name to undefined
	if (boardeditor.getActivePositionName() === modal_config.position_name)
		boardeditor.setActivePositionName(undefined);
}

async function onModalYesButtonPress(): Promise<void> {
	if (modal_config === undefined) {
		closeModal();
		return;
	} else if (modal_config.mode === 'delete') {
		if (modal_config.storage_type === 'cloud') {
			// Delete cloud position
			try {
				await editorSavesAPI.deletePosition(modal_config.position_name);
			} catch (err) {
				console.error('Failed to delete cloud position:', err);
				toast.show('Failed to delete cloud position.', { error: true });
				closeModal();
				return;
			}
			// If deleted position was active, set active position name to undefined
			if (boardeditor.getActivePositionName() === modal_config.position_name)
				boardeditor.setActivePositionName(undefined);
		} else {
			// Delete local position
			await deleteSavedPosition(modal_config);
		}
		updateSavedPositionListUI();
	} else if (modal_config.mode === 'load') {
		if (modal_config.storage_type === 'cloud') {
			// Load cloud position
			let cloudPosition;
			try {
				cloudPosition = await editorSavesAPI.getPosition(modal_config.position_name);
			} catch (err) {
				console.error('Failed to load cloud position:', err);
				toast.show('Failed to load cloud position.', { error: true });
				closeModal();
				return;
			}
			let longFormOut;
			try {
				longFormOut = icnconverter.ShortToLong_Format(cloudPosition.icn);
			} catch (err) {
				console.error('Failed to parse cloud position ICN:', err);
				toast.show('The cloud position was corrupted.', { error: true });
				closeModal();
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
			const editorSaveState: EditorSaveState = {
				position_name: modal_config.position_name,
				timestamp: Date.now(),
				piece_count: variantOptions.position.size,
				variantOptions,
				pawnDoublePush: cloudPosition.pawn_double_push,
				castling: cloudPosition.castling,
			};
			floatingWindow.close(false);
			eactions.load(editorSaveState);
		} else {
			// Load local position
			const editorSaveStateRaw = await IndexedDB.loadItem(modal_config.save_key);
			const editorSaveStateParsed = esave.EditorSaveStateSchema.safeParse(editorSaveStateRaw);
			if (!editorSaveStateParsed.success) {
				console.error(
					`Invalid EditorSaveState ${modal_config.save_key} in IndexedDB ${editorSaveStateParsed.error}`,
				);
				toast.show(`The position was corrupted.`, { error: true });
				await deleteSavedPosition(modal_config);
				updateSavedPositionListUI();
				return;
			}
			const editorSaveState: EditorSaveState = editorSaveStateParsed.data;
			floatingWindow.close(false);
			eactions.load(editorSaveState);
		}
	} else if (modal_config.mode === 'overwrite_save') {
		await esave.save(modal_config.position_name);
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
	if (positionname.length > editorutil.POSITION_NAME_MAX_LENGTH) {
		console.error(
			`This should not happen, position name input box is restricted to ${editorutil.POSITION_NAME_MAX_LENGTH} chars, you submitted ${positionname.length} chars.`,
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
	} else openModal('overwrite_save', positionname, saveinfo_key, save_key, 'local');
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
 * Given a saveinfo_key and a editorAbridgedSaveState,
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
 *   <button class="btn saved-position-btn cloud-save [greyed-out]">
 *     <svg><use href="#svg-cloud-save"/></svg>
 *   </button>
 *   <!-- Delete -->
 *   <button class="btn saved-position-btn">
 *     <svg><use href="#svg-delete"/></svg>
 *   </button>
 * </div>
 */
function generateRowForSavedPositionsElement(
	saveinfo_key: string,
	editorAbridgedSaveState: EditorAbridgedSaveState,
	storageType: StorageType,
	showCloudButton: boolean,
): HTMLDivElement {
	const save_key = saveinfo_key.replace(esave.EDITOR_SAVEINFO_PREFIX, esave.EDITOR_SAVE_PREFIX);
	const row = document.createElement('div');
	row.classList.add('saved-position');

	// Name
	const name_cell = document.createElement('div');
	const position_name = editorAbridgedSaveState.position_name ?? '';
	name_cell.textContent = position_name;
	name_cell.title = position_name; // Let's browser's automatic tooltips show the full title on hover, if it's truncated via ellipsis
	row.appendChild(name_cell);

	// Piececount
	const piececount_cell = document.createElement('div');
	piececount_cell.classList.add('piece-count');
	const piece_count = String(editorAbridgedSaveState.piece_count);
	piececount_cell.textContent = piece_count;
	piececount_cell.title = piece_count;
	row.appendChild(piececount_cell);

	// Date
	const date_cell = document.createElement('div');
	date_cell.classList.add('date');
	const timestamp = editorAbridgedSaveState.timestamp;
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
	registerButtonClick(loadBtn, () =>
		openModal('load', position_name, saveinfo_key, save_key, storageType),
	);
	row.appendChild(loadBtn);

	// "Cloud Save" button (only when logged in)
	if (showCloudButton) {
		const cloudBtn = createButtonElement('#svg-cloud-save');
		cloudBtn.classList.add('cloud-save');
		if (storageType === 'local') {
			// Local save: greyed-out cloud button (not yet on cloud)
			cloudBtn.classList.add('local');
		}
		registerButtonClick(cloudBtn, () =>
			onCloudButtonPress(
				position_name,
				saveinfo_key,
				save_key,
				storageType,
				timestamp,
				cloudBtn,
			),
		);
		row.appendChild(cloudBtn);
	}

	// "Delete" button
	const deleteBtn = createButtonElement('#svg-delete');
	registerButtonClick(deleteBtn, () =>
		openModal('delete', position_name, saveinfo_key, save_key, storageType),
	);
	row.appendChild(deleteBtn);

	// Highlight row if position is active
	if (boardeditor.getActivePositionName() === position_name) row.classList.add('active-position');

	return row;
}

/**
 * Handles pressing the cloud-save button for a position row.
 * - If local: uploads to server and deletes local copy.
 * - If cloud: downloads from server (saves locally) and deletes from server.
 */
async function onCloudButtonPress(
	positionname: string,
	saveinfo_key: string,
	save_key: string,
	storageType: StorageType,
	originalTimestamp: number,
	cloudBtn: HTMLButtonElement,
): Promise<void> {
	cloudBtn.disabled = true;

	if (storageType === 'local') {
		// Upload local → cloud
		const editorSaveStateRaw = await IndexedDB.loadItem(save_key);
		const editorSaveStateParsed = esave.EditorSaveStateSchema.safeParse(editorSaveStateRaw);
		if (!editorSaveStateParsed.success) {
			console.error(
				`Invalid EditorSaveState "${save_key}" in IndexedDB: ${editorSaveStateParsed.error}`,
			);
			toast.show('The position data was corrupted.', { error: true });
			cloudBtn.disabled = false;
			return;
		}
		const editorSaveState = editorSaveStateParsed.data;

		// Convert variantOptions to ICN
		const longFormatIn: LongFormatIn = {
			metadata: {} as MetaData, // Required for icnconverter
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
			toast.show('Failed to convert position for upload.', { error: true });
			cloudBtn.disabled = false;
			return;
		}

		try {
			await editorSavesAPI.savePosition(
				positionname,
				editorSaveState.piece_count,
				editorSaveState.timestamp,
				icn,
				editorSaveState.pawnDoublePush ?? false,
				editorSaveState.castling ?? false,
			);
		} catch (err) {
			console.error('Failed to upload position to cloud:', err);
			toast.show(err instanceof Error ? err.message : 'Failed to upload position to cloud.', {
				error: true,
			});
			cloudBtn.disabled = false;
			return;
		}

		// Delete local copy
		await Promise.all([IndexedDB.deleteItem(saveinfo_key), IndexedDB.deleteItem(save_key)]);
		if (boardeditor.getActivePositionName() === positionname)
			boardeditor.setActivePositionName(undefined);

		toast.show('Position saved to cloud.');
	} else {
		// Download cloud → local
		let cloudPosition;
		try {
			cloudPosition = await editorSavesAPI.getPosition(positionname);
		} catch (err) {
			console.error('Failed to download cloud position:', err);
			toast.show('Failed to download cloud position.', { error: true });
			cloudBtn.disabled = false;
			return;
		}

		let longFormOut;
		try {
			longFormOut = icnconverter.ShortToLong_Format(cloudPosition.icn);
		} catch (err) {
			console.error('Failed to parse cloud position ICN:', err);
			toast.show('The cloud position was corrupted.', { error: true });
			cloudBtn.disabled = false;
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

		// Save locally (preserve the original cloud save timestamp)
		await Promise.all([
			IndexedDB.saveItem(save_key, {
				positionname,
				timestamp: originalTimestamp,
				pieceCount: variantOptions.position.size,
				variantOptions,
				pawnDoublePush: cloudPosition.pawn_double_push,
				castling: cloudPosition.castling,
			}),
			IndexedDB.saveItem(saveinfo_key, {
				positionname,
				timestamp: originalTimestamp,
				pieceCount: variantOptions.position.size,
			}),
		]);

		// Delete from server
		try {
			await editorSavesAPI.deletePosition(positionname);
		} catch (err) {
			console.error('Failed to delete cloud position after download:', err);
			toast.show('Failed to remove position from cloud.', { error: true });
			cloudBtn.disabled = false;
			return;
		}

		toast.show('Position saved locally.');
	}

	cloudBtn.disabled = false;
	await updateSavedPositionListUI();
}

/**
 * Given a saveinfo_key, read the entry from IndexedDB and return { saveinfo_key, editorAbridgedSaveState } if successful
 */
async function loadSinglePositionInfo(saveinfo_key: string): Promise<
	| {
			saveinfo_key: string;
			editorAbridgedSaveState: EditorAbridgedSaveState;
	  }
	| undefined
> {
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
	const editorAbridgedSaveState: EditorAbridgedSaveState = editorAbridgedSaveStateParsed.data;

	return { saveinfo_key, editorAbridgedSaveState };
}

/**
 * Update the saved positions list
 */
async function updateSavedPositionListUI(): Promise<void> {
	unregisterAllPositionButtonListeners(); // unregister position button listeners
	element_savedPositionsToLoad.replaceChildren(); // empty existing position list

	const isLoggedIn = validatorama.areWeLoggedIn();

	// Toggle CSS class to adjust header column widths for cloud button
	element_savedPositions.classList.toggle('with-cloud', isLoggedIn);

	// Fetch cloud saves if logged in
	const cloudSavesMap = new Map<string, CloudSaveListRecord>();
	if (isLoggedIn) {
		try {
			const cloudSaves = await editorSavesAPI.getSavedPositions();
			for (const save of cloudSaves) cloudSavesMap.set(save.name, save);
		} catch (err) {
			console.error('Failed to fetch cloud saves:', err);
			toast.show('Failed to fetch cloud saves.', { error: true });
		}
	}

	// Get a list of all saveinfo_keys
	const saveinfo_keys = (await IndexedDB.getAllKeys()).filter((key) =>
		key.startsWith(esave.EDITOR_SAVEINFO_PREFIX),
	);

	// Load all editorAbridgedSaveStates simultaneously into a single list
	const localSaveInfoList = (
		await Promise.all(saveinfo_keys.map((saveinfo_key) => loadSinglePositionInfo(saveinfo_key)))
	).filter((x) => x !== undefined);

	// Build unified list (local + cloud)
	type UnifiedSave =
		| {
				storageType: 'local';
				saveinfo_key: string;
				editorAbridgedSaveState: EditorAbridgedSaveState;
		  }
		| { storageType: 'cloud'; record: CloudSaveListRecord };

	const allSaves: UnifiedSave[] = [];

	// Add local saves
	for (const localSave of localSaveInfoList) {
		allSaves.push({ storageType: 'local', ...localSave });
	}

	// Add cloud saves that are not already saved locally
	const localNames = new Set(
		localSaveInfoList.map((l) => l.editorAbridgedSaveState.position_name),
	);
	for (const [name, record] of cloudSavesMap) {
		if (!localNames.has(name)) {
			allSaves.push({ storageType: 'cloud', record });
		}
	}

	// Sort by timestamp (newest first)
	allSaves.sort((a, b) => {
		const ta =
			a.storageType === 'local' ? a.editorAbridgedSaveState.timestamp : a.record.timestamp;
		const tb =
			b.storageType === 'local' ? b.editorAbridgedSaveState.timestamp : b.record.timestamp;
		return tb - ta;
	});

	// Generate and append row by row to saved positions UI
	for (const save of allSaves) {
		let row: HTMLDivElement;
		if (save.storageType === 'local') {
			row = generateRowForSavedPositionsElement(
				save.saveinfo_key,
				save.editorAbridgedSaveState,
				'local',
				isLoggedIn,
			);
		} else {
			const saveinfo_key = `${esave.EDITOR_SAVEINFO_PREFIX}${save.record.name}`;
			const abridged: EditorAbridgedSaveState = {
				position_name: save.record.name,
				timestamp: save.record.timestamp,
				piece_count: save.record.piece_count,
			};
			row = generateRowForSavedPositionsElement(saveinfo_key, abridged, 'cloud', isLoggedIn);
		}
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
