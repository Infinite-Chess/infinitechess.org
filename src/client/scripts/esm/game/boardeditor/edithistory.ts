// src/client/scripts/esm/game/boardeditor/edithistory.ts

/**
 * Edit History for the Board Editor.
 *
 * Manages the undo/redo stack, running edits logically and graphically,
 * and queuing individual piece/special-rights changes into an Edit object.
 */

import type { Edit } from '../../../../../shared/chess/logic/movepiece.js';
import type { Mesh } from '../rendering/piecemodels.js';
import type { Piece } from '../../../../../shared/chess/util/boardutil.js';
import type { Coords } from '../../../../../shared/chess/util/coordutil.js';
import type { FullGame } from '../../../../../shared/chess/logic/gamefile.js';

import state from '../../../../../shared/chess/logic/state.js';
import coordutil from '../../../../../shared/chess/util/coordutil.js';
import movepiece from '../../../../../shared/chess/logic/movepiece.js';
import boardutil from '../../../../../shared/chess/util/boardutil.js';
import boardchanges from '../../../../../shared/chess/logic/boardchanges.js';

import arrows from '../rendering/arrows/arrows.js';
import gameslot from '../chess/gameslot.js';
import miniimage from '../rendering/miniimage.js';
import selection from '../chess/selection.js';
import egamerules from './egamerules.js';
import drawingtool from './tools/drawingtool.js';
import { GameBus } from '../GameBus.js';
import boardeditor from './boardeditor.js';
import movesequence from '../chess/movesequence.js';
import guinavigation from '../gui/guinavigation.js';

// Types ----------------------------------------------------------------------

/**
 * An edit that also keeps track of the state of certain position-dependent game rules AFTER the edit is made.
 * Used exclusively for game history purposes.
 */
interface EditWithRules extends Edit {
	/** The state of the pawn double push gamerules checkbox AFTER this edit was made. */
	pawnDoublePush?: boolean;
	/** The state of the castling gamerules checkbox AFTER this edit was made. */
	castling?: boolean;
}

// Constants ------------------------------------------------------------------

/**
 * The maximum allowed summed changes in the edit history before oldest edits are pruned.
 * This is to prevent excessive memory usage crashing the browser.
 *
 * Naviary's machine got to 26 million changes before slowing, then crashing.
 * The tab was using roughly 5 GB of memory at that point.
 * I guess maybe a max of 8 million could be safe on most machines?
 */
const EDIT_HISTORY_MAX_CHANGES = 8_000_000;

// State ----------------------------------------------------------------------

/** The list of all edits the user has made. */
let edits: Array<EditWithRules> | undefined;
let indexOfThisEdit: number | undefined;

/** The value of the pawnDoublePush game rule in the initial zeroth edit */
let initial_pawnDoublePush: boolean | undefined = true;
/** The value of the castling game rule in the initial zeroth edit */
let initial_castling: boolean | undefined = true;

// Initialization -------------------------------------------------------------

/** Initializes the edit history state when the board editor is opened. */
function init(pawnDoublePush: boolean | undefined, castling: boolean | undefined): void {
	edits = [];
	indexOfThisEdit = 0;
	initial_pawnDoublePush = pawnDoublePush;
	initial_castling = castling;
	guinavigation.update_EditButtons();
}

/** Resets the edit history state when the board editor is closed. */
function reset(): void {
	edits = undefined;
	indexOfThisEdit = undefined;
}

// Running Edits --------------------------------------------------------------

/** Runs both logical and graphical changes. */
function runEdit(gamefile: FullGame, mesh: Mesh, edit: Edit, forward: boolean = true): void {
	// Pieces must be unselected before they are modified
	selection.unselectPiece();

	// Run logical changes
	movepiece.applyEdit(gamefile, edit, forward, true);
	GameBus.dispatch('physical-move');

	// Run graphical changes
	movesequence.runMeshChanges(gamefile.boardsim, mesh, edit, forward);

	// If the piece count is now high enough, disable icons and arrows.
	const pieceCount = boardutil.getPieceCountOfGame(gamefile.boardsim.pieces);
	if (
		pieceCount > miniimage.pieceCountToDisableMiniImages ||
		pieceCount > arrows.pieceCountToDisableArrows
	) {
		miniimage.disable();
		arrows.setMode(0);
	}

	// Prune the oldest edits in the history if we exceed the cap, to help prevent memory crashes.
	const totalChanges: number = edits!.reduce((sum, edit) => sum + edit.changes.length, 0);
	// console.log("Total changes in edit history: " + totalChanges);
	if (totalChanges > EDIT_HISTORY_MAX_CHANGES) {
		let changesToRemove = totalChanges - EDIT_HISTORY_MAX_CHANGES;
		while (changesToRemove > 0 && edits!.length > 0) {
			const oldestEdit = edits!.shift()!;
			changesToRemove -= oldestEdit.changes.length;
			indexOfThisEdit!--;
		}
		// console.log("Pruned oldest edits.");
	}
}

/** Appends the given edit to the history stack, discarding any future (redo) edits. */
function addEditToHistory(edit: Edit): void {
	if (
		edit.changes.length === 0 &&
		edit.state.local.length === 0 &&
		edit.state.global.length === 0
	)
		return;
	edits!.length = indexOfThisEdit!; // Truncate any "redo" edits, that timeline is being erased.
	const { pawnDoublePush, castling } = egamerules.getPositionDependentGameRules();
	const editWithRules: EditWithRules = {
		...edit,
		pawnDoublePush,
		castling,
	};
	edits!.push(editWithRules);
	indexOfThisEdit!++;
	guinavigation.update_EditButtons();

	boardeditor.markPositionDirty();
}

/** Undoes the most recent edit. */
function undo(): void {
	if (!boardeditor.areInBoardEditor())
		throw Error("Cannot undo edit when we're not using the board editor.");
	if (drawingtool.isEditInProgress()) return; // Do not allow undoing or redoing while currently making an edit
	if (indexOfThisEdit! <= 0) return;
	const gamefile = gameslot.getGamefile()!;
	const mesh = gameslot.getMesh()!;
	indexOfThisEdit!--;
	const thisEdit = edits![indexOfThisEdit!]!;
	runEdit(gamefile, mesh, thisEdit, false);

	// Restore position dependent game rules to what they were before this edit
	if (indexOfThisEdit! !== 0) {
		const previousEdit = edits![indexOfThisEdit! - 1]!;
		egamerules.setPositionDependentGameRules({
			pawnDoublePush: previousEdit.pawnDoublePush,
			castling: previousEdit.castling,
		});
	} else {
		// Reset to initial state
		egamerules.setPositionDependentGameRules({
			pawnDoublePush: initial_pawnDoublePush,
			castling: initial_castling,
		});
	}

	guinavigation.update_EditButtons();

	boardeditor.markPositionDirty();
}

/** Redoes the next edit in the history. */
function redo(): void {
	if (!boardeditor.areInBoardEditor())
		throw Error("Cannot redo edit when we're not using the board editor.");
	if (drawingtool.isEditInProgress()) return; // Do not allow undoing or redoing while currently making an edit
	if (indexOfThisEdit! >= edits!.length) return;
	const gamefile = gameslot.getGamefile()!;
	const mesh = gameslot.getMesh()!;
	const thisEdit = edits![indexOfThisEdit!]!;
	runEdit(gamefile, mesh, thisEdit, true);

	// Update position dependent game rules to what they are after this edit
	egamerules.setPositionDependentGameRules({
		pawnDoublePush: thisEdit.pawnDoublePush,
		castling: thisEdit.castling,
	});

	indexOfThisEdit!++;
	guinavigation.update_EditButtons();

	boardeditor.markPositionDirty();
}

/** Returns true if there is an edit to undo. */
function canUndo(): boolean {
	// comparing undefined always returns false
	return indexOfThisEdit !== undefined && indexOfThisEdit > 0;
}

/** Returns true if there is an edit to redo. */
function canRedo(): boolean {
	// comparing undefined always returns false
	return indexOfThisEdit !== undefined && edits !== undefined && indexOfThisEdit < edits.length;
}

// Queuing Edits --------------------------------------------------------------

/** Queues the deletion of a piece, including its special rights, if present, to the edit changes. */
function queueRemovePiece(gamefile: FullGame, edit: Edit, piece: Piece): void {
	boardchanges.queueDeletePiece(edit.changes, false, piece);
	queueSpecialRights(gamefile, edit, piece.coords, false);
}

/**
 * Queues the addition of a piece, including its special rights, if specified, to the edit changes.
 * If specialrights is left undefined, it is set according to the game rules
 */
function queueAddPiece(
	gamefile: FullGame,
	edit: Edit,
	coords: Coords,
	type: number,
	specialright: boolean,
): void {
	const piece: Piece = { type, coords, index: -1 };
	boardchanges.queueAddPiece(edit.changes, piece);
	if (specialright) queueSpecialRights(gamefile, edit, coords, specialright);
}

/** Queues the addition/removal of a specialright at the specified coordinates. */
function queueSpecialRights(gamefile: FullGame, edit: Edit, coords: Coords, add: boolean): void {
	const coordsKey = coordutil.getKeyFromCoords(coords);
	const current = gamefile.boardsim.state.global.specialRights.has(coordsKey);
	state.createSpecialRightsState(edit, coordsKey, current, add);
}

// Exports --------------------------------------------------------------------

export default {
	// Initialization
	init,
	reset,
	// Running Edits
	runEdit,
	addEditToHistory,
	undo,
	redo,
	// Querying
	canUndo,
	canRedo,
	// Queuing Edits
	queueAddPiece,
	queueRemovePiece,
	queueSpecialRights,
};
