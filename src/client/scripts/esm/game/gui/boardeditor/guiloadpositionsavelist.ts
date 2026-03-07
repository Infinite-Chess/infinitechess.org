// src/client/scripts/esm/game/gui/boardeditor/guiloadpositionsavelist.ts

/**
 * Manages the saved-positions list for the Load Position UI of the board editor:
 * rendering position rows, performing load/delete/cloud-transfer operations,
 * and refreshing the list from local and cloud storage.
 */

import type { StorageType } from '../../boardeditor/boardeditor';
import type { CloudSaveListRecord } from '../../boardeditor/actions/editorSavesAPI';
import type { EditorAbridgedSaveState } from '../../boardeditor/editortypes';

import esave from '../../boardeditor/actions/esave';
import style from '../style';
import ecloud from '../../boardeditor/actions/ecloud';
import eactions from '../../boardeditor/actions/eactions';
import boardeditor from '../../boardeditor/boardeditor';
import { GameBus } from '../../GameBus';
import validatorama from '../../../util/validatorama';
import guiloadpositionmodal from './guiloadpositionmodal';

// Types -------------------------------------------------------------------------

/** Object to keep track of listener for position button */
type ButtonHandlerPair = {
	type: 'click';
	handler: (e: MouseEvent) => void;
};

/** A unified save entry for display, regardless of whether it's stored locally or on the cloud */
type UnifiedSave = { storage_type: StorageType } & EditorAbridgedSaveState;

/** Cloud saves list returned by a mutation, used to skip a follow-up GET */
type PreloadedCloudSaves = CloudSaveListRecord[] | undefined;

// Elements ----------------------------------------------------------

/** The outer container for the saved positions section. */
const element_savedPositions = document.querySelector('.saved-positions')!;

/** List of saved positions */
const element_savedPositionsToLoad = document.getElementById('saved-position-list')!;

/** Spinny pawn loading animation shown during in-flight API requests */
const element_loadingPawn = document.getElementById('load-position-loading-pawn')!;

// Variables ----------------------------------------------------------------

/** Object to keep track of all position button listeners */
const registeredButtonListeners = new Map<HTMLButtonElement, ButtonHandlerPair>();

/**
 * A counter for tracking new position loads. Cloud load position
 * requests are discarded if this is different when they return.
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

// Utilities----------------------------------------------------------------

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

/** Removes all rendered rows from the saved-position list. */
function clearSavedPositionList(): void {
	element_savedPositionsToLoad.replaceChildren();
}

// Operations ---------------------------------------------------------------

/** Performs the actual load operation for a saved position, bypassing the modal. */
async function performLoad(position_name: string, storage_type: StorageType): Promise<void> {
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
		// Pass false to skip resetting the window's position on screen
		floatingWindowClose(false);
		await eactions.load(editorSaveState, storage_type);
	}
}

/** Performs the actual delete operation for a saved position, bypassing the modal. */
async function performDelete(position_name: string, storage_type: StorageType): Promise<void> {
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
}

// Row generation ---------------------------------------------------------------

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
	name_cell.title = position_name; // Let browser's automatic tooltips show the full title on hover, if it's truncated via ellipsis
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
	registerButtonClick(loadBtn, () => {
		// Skip confirmation modal if the position has no unsaved changes
		if (!boardeditor.isPositionDirty()) {
			performLoad(position_name, save.storage_type);
		} else {
			guiloadpositionmodal.openModal('load', position_name, () =>
				performLoad(position_name, save.storage_type),
			);
		}
	});
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
	registerButtonClick(deleteBtn, () =>
		guiloadpositionmodal.openModal('delete', position_name, () =>
			performDelete(position_name, save.storage_type),
		),
	);
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
		const cloudSaves: CloudSaveListRecord[] =
			preloadedCloudSaves ?? (await withRequest(() => ecloud.getAllCloudSaveInfos()));

		cloudSaves.forEach((save) => {
			allSaves.push({
				storage_type: 'cloud',
				position_name: save.name,
				timestamp: save.timestamp,
				piece_count: save.piece_count,
			});
		});
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

// Injected close callback -------------------------------------------------------

/**
 * Stored reference to the floating window's close function.
 * Set by {@link setFloatingWindowClose} during initialization.
 */
let floatingWindowClose: (resetPositioning: boolean) => void = () => {};

/**
 * Provides the floating window's close function to this module.
 * Must be called once during initialization, before any load operations are triggered.
 */
function setFloatingWindowClose(closeFn: (resetPositioning: boolean) => void): void {
	floatingWindowClose = closeFn;
}

// Exports -----------------------------------------------------------------

export default {
	registerButtonClick,
	unregisterAllPositionButtonListeners,
	clearSavedPositionList,
	updateSavedPositionListUI,
	setFloatingWindowClose,
};
