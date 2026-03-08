// src/client/scripts/esm/game/boardeditor/boardeditor.ts

/**
 * Core manager for the Board Editor.
 *
 * Handles the lifecycle (open/close), dirty/clean state,
 * active position tracking, and the main update/render loop.
 */

import type { VariantOptions } from '../../../../../shared/chess/logic/initvariant.js';

import jsutil from '../../../../../shared/util/jsutil.js';
import icnconverter from '../../../../../shared/chess/logic/icn/icnconverter.js';
import { players as p } from '../../../../../shared/chess/util/typeutil.js';

import gameslot from '../chess/gameslot.js';
import eautosave from './actions/eautosave.js';
import egamerules from './egamerules.js';
import eclipboard from './eclipboard.js';
import drawingtool from './tools/drawingtool.js';
import editortypes from './editortypes.js';
import edithistory from './edithistory.js';
import etoolmanager from './tools/etoolmanager.js';
import selectiontool from './tools/selection/selectiontool.js';
import stransformations from './tools/selection/stransformations.js';
import guipositionheader from '../gui/boardeditor/guipositionheader.js';

// Types ------------------------------------------------------------------------

/** The active position loaded in the board editor, if any. */
export type ActivePosition = { name: string; storage_type: StorageType };

/** Whether a position is stored locally (IndexedDB) or on the server (cloud) */
export type StorageType = (typeof editortypes)['STORAGE_TYPES'][number];

// State -------------------------------------------------------------------------

/** Whether we are currently using the editor. */
let inBoardEditor = false;

/** The active position, if any, as displayed on editor bar and used for "Save" button by default */
let active_position: ActivePosition | undefined = undefined;

/** Whether the current board position has unsaved changes. */
let positionDirty = false;

// Initialization ------------------------------------------------------------------------

/**
 * Initializes the board editor.
 * Should be called AFTER loading the game logically.
 * May optionally be supplied with custom game rules.
 */
async function initBoardEditor(
	/** Whether the position has unsaved changes. */
	dirty: boolean,
	variantOptions?: VariantOptions,
	pawnDoublePush?: boolean,
	castling?: boolean,
): Promise<void> {
	inBoardEditor = true;
	if (dirty) markPositionDirty();
	else markPositionClean();

	etoolmanager.setTool('normal');
	drawingtool.init();

	let initial_pawnDoublePush: boolean | undefined;
	let initial_castling: boolean | undefined;

	if (variantOptions === undefined) {
		const gamefile = gameslot.getGamefile()!;
		// Set gamerulesGUIinfo object according to loaded Classical variant
		const gameRules = jsutil.deepCopyObject(gamefile.basegame.gameRules);
		gameRules.winConditions[p.WHITE] = [icnconverter.default_win_condition];
		gameRules.winConditions[p.BLACK] = [icnconverter.default_win_condition];
		const globalState = jsutil.deepCopyObject(gamefile.boardsim.state.global);
		initial_pawnDoublePush = true;
		initial_castling = true;
		egamerules.setGamerulesGUIinfo(
			gameRules,
			globalState,
			initial_pawnDoublePush,
			initial_castling,
		);
	} else {
		// Set game rules according to provided variantOptions object
		initial_pawnDoublePush = pawnDoublePush;
		initial_castling = castling;
		egamerules.setGamerulesGUIinfo(
			variantOptions.gameRules,
			variantOptions.state_global,
			pawnDoublePush,
			castling,
		);
	}

	edithistory.init(initial_pawnDoublePush, initial_castling);

	// Erase the `inCheck` and `attackers` state of the gamefile, which were auto-calculated in the constructor.
	// Prevents check highlights from rendering when opening the board editor.
	const gamefile = gameslot.getGamefile()!;
	gamefile.boardsim.state.local.inCheck = false;
	gamefile.boardsim.state.local.attackers = [];
	// Also set gameConclusion to undefined. Otherwise, starting from a position that
	// would have otherwise been checkmate/stalemate will prevent us from selecting pieces.
	gamefile.basegame.gameConclusion = undefined;

	eclipboard.addEventListeners();
	eautosave.startPositionAutosave();
}

/** Closes the board editor and resets all state. */
function closeBoardEditor(): void {
	// Perform last autosave
	eautosave.markPositionDirty();
	void eautosave.autosaveCurrentPositionOnce();
	eautosave.stopPositionAutosave();

	// Reset state
	inBoardEditor = false;
	edithistory.reset();
	etoolmanager.reset();
	drawingtool.onCloseEditor();
	selectiontool.resetState();
	stransformations.resetState(); // Drops reference to clipboard

	eclipboard.removeEventListeners();
}

// Update & Render -------------------------------------------------------------

/** Called every frame while the board editor is open. */
function update(): void {
	if (!inBoardEditor) return;

	etoolmanager.testShortcuts();

	// Handle starting and ending the drawing state
	const currentTool = etoolmanager.getTool();
	if (drawingtool.isToolADrawingTool(currentTool)) drawingtool.update(currentTool);
	// Update selection tool, if that is active
	else if (currentTool === 'selection-tool') selectiontool.update();
}

/** Renders any graphics of the active tool, if we are in the board editor. */
function render(): void {
	if (!inBoardEditor) return;

	// Render selection-tool graphics, if that is active
	if (etoolmanager.getTool() === 'selection-tool') selectiontool.render();
}

// Utility --------------------------------------------------------------------

/** Returns true if the board editor is currently open. */
function areInBoardEditor(): boolean {
	return inBoardEditor;
}

/** Returns true if the current board position has unsaved changes. */
function isPositionDirty(): boolean {
	return positionDirty;
}

/**
 * Marks the current board position as having unsaved changes,
 * and notifies eautosave to schedule a background autosave.
 */
function markPositionDirty(): void {
	// console.error('Position marked dirty');
	positionDirty = true;
	guipositionheader.updateDirtyIndicator(true);
	eautosave.markPositionDirty();
}

/** Marks the current board position as clean (saved). */
function markPositionClean(): void {
	// console.error('Position marked clean');
	positionDirty = false;
	guipositionheader.updateDirtyIndicator(false);
}

/** Returns the active position, if any. */
function getActivePosition(): ActivePosition | undefined {
	return active_position;
}

/** Returns true if the provided position name and storage type match the current active position. */
function isActivePosition(name: string, storage_type: StorageType): boolean {
	return (
		active_position !== undefined &&
		active_position.name === name &&
		active_position.storage_type === storage_type
	);
}

/** Sets the currently active position and flushes the autosave. */
function setActivePosition(name: string, storage_type: StorageType): void {
	active_position = { name, storage_type };
	guipositionheader.updateActivePositionElement(name);
	flushActivePositionToAutosave();
}

/** Clears the active position and marks the position as dirty. */
function clearActivePosition(): void {
	active_position = undefined;
	markPositionDirty();
	guipositionheader.updateActivePositionElement(undefined);
	flushActivePositionToAutosave();
}

/**
 * Immediately flushes the autosave so a page refresh immediately
 * after a save/delete operation reflects the current active position.
 */
function flushActivePositionToAutosave(): void {
	if (gameslot.getGamefile() === undefined) return; // Some callers run before the gamefile exists
	eautosave.markPositionDirty();
	void eautosave.autosaveCurrentPositionOnce();
}

// Exports --------------------------------------------------------------------

export default {
	// State
	areInBoardEditor,
	// Initialization
	initBoardEditor,
	closeBoardEditor,
	// Update & Render
	update,
	render,
	// Dirty State
	isPositionDirty,
	markPositionDirty,
	markPositionClean,
	// Active Position
	getActivePosition,
	isActivePosition,
	setActivePosition,
	clearActivePosition,
};
