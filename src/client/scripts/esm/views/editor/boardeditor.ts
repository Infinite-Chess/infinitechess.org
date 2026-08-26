// src/client/scripts/esm/views/editor/boardeditor.ts

/**
 * Core manager for the Board Editor.
 *
 * Handles the lifecycle (open/close), dirty/clean state,
 * active position tracking, and the main update/render loop.
 */

import type { StorageType } from '../../savedpositions/storetypes.js';
import type { VariantOptions } from '../../../../../shared/chess/logic/gamefile.js';

import jsutil from '../../../../../shared/util/jsutil.js';
import gamerules from '../../../../../shared/chess/util/gamerules.js';
import { players as p } from '../../../../../shared/util/typeutil.js';

import gameslot from '../../game/chess/gameslot.js';
import keybinds from '../../game/misc/keybinds.js';
import eautosave from './actions/eautosave.js';
import egamerules from './egamerules.js';
import eclipboard from './eclipboard.js';
import drawingtool from './tools/drawingtool.js';
import edithistory from './edithistory.js';
import etoolmanager from './tools/etoolmanager.js';
import selectiontool from './tools/selection/selectiontool.js';
import EDITOR_PROFILE from './ekeybinds.js';
import guipositionheader from './gui/guipositionheader.js';

import './tools/normaltool.js'; // Self-registers its move logic with selection.ts on load

// Types -----------------------------------------------------------------------

/** The identity of a saved position — its name and where it is stored. */
export type ActivePosition =
	| { name: string; storage_type: 'local' }
	| { name: string; storage_type: 'cloud'; owner: string };

// State -----------------------------------------------------------------------

/** The active position, if any, as displayed on editor bar and used for "Save" button by default */
let active_position: ActivePosition | undefined = undefined;

/** Whether the current board position has unsaved changes. */
let positionDirty = false;

// Initialization --------------------------------------------------------------

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
	if (dirty) markPositionDirty();
	else markPositionClean();

	etoolmanager.setTool('normal');
	drawingtool.init();

	// Editor tools may reserve the left mouse button, shifting board dragging to the right mouse.
	keybinds.setProfile(EDITOR_PROFILE);

	let initial_pawnDoublePush: boolean | undefined;
	let initial_castling: boolean | undefined;

	if (variantOptions === undefined) {
		const gamefile = gameslot.getGamefile()!;
		// Set gamerulesGUIinfo object according to loaded Classical variant
		const gameRules = jsutil.deepCopyObject(gamefile.gameRules);
		gameRules.winConditions[p.WHITE] = [gamerules.DEFAULT_WIN_CONDITION];
		gameRules.winConditions[p.BLACK] = [gamerules.DEFAULT_WIN_CONDITION];
		const globalState = jsutil.deepCopyObject(gamefile.state.global);
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

	// Erase the `inCheck` and `checks` state of the gamefile, which were auto-calculated in the constructor.
	// Prevents check highlights from rendering when opening the board editor.
	const gamefile = gameslot.getGamefile()!;
	gamefile.state.local.inCheck = false;
	gamefile.state.local.checks = [];
	// Also set gameConclusion to undefined. Otherwise, starting from a position that
	// would have otherwise been checkmate/stalemate will prevent us from selecting pieces.
	gamefile.gameConclusion = undefined;

	eclipboard.addEventListeners();
	eautosave.startPositionAutosave();
}

// Update & Render -------------------------------------------------------------

/**
 * Called every frame while the board editor is open.
 *
 * NEEDS TO BE CALLED BEFORE selection.update() and boarddrag.checkIfBoardSingleGrabbed()
 * because the drawing tools of the boad editor might take precedence and claim the left mouse click.
 * We had it after boarddrag.checkIfBoardPinched() and before selection.update().
 * Recommended to dispatch a specific update event that we can listen to to know when to update.
 */
function _update(): void {
	etoolmanager.testShortcuts();

	// Handle starting and ending the drawing state
	const currentTool = etoolmanager.getTool();
	if (drawingtool.isToolADrawingTool(currentTool)) drawingtool.update(currentTool);
	// Update selection tool, if that is active
	else if (currentTool === 'selection-tool') selectiontool.update();
}

/**
 * Renders any graphics of the active tool, if we are in the board editor.
 * Recommended to listen for the 'render-above-pieces' even to know when to render.
 */
function _render(): void {
	// Render selection-tool graphics, if that is active
	if (etoolmanager.getTool() === 'selection-tool') selectiontool.render();
}

// Utility ---------------------------------------------------------------------

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
function setActivePosition(new_position: ActivePosition): void {
	active_position = new_position;
	guipositionheader.updateActivePositionElement(new_position.name);
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

// Exports ---------------------------------------------------------------------

export default {
	// State
	// Initialization
	initBoardEditor,
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
