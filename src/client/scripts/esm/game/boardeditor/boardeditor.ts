
// src/client/scripts/esm/game/boardeditor/boardeditor.ts

/**
 * This script is the manager for the Board Editor logic.
 * 
 * It handles initialization, edit history, executing edits, current tool, etc.
 */

import type { Coords } from '../../../../../shared/chess/util/coordutil.js';
import type { Edit } from '../../../../../shared/chess/logic/movepiece.js';
import type { Piece } from '../../../../../shared/chess/util/boardutil.js';
import type { Mesh } from '../rendering/piecemodels.js';
import type { FullGame } from '../../../../../shared/chess/logic/gamefile.js';

import typeutil, { players } from '../../../../../shared/chess/util/typeutil.js';
import { listener_document } from '../chess/game.js';
import boardchanges from '../../../../../shared/chess/logic/boardchanges.js';
import gameslot from '../chess/gameslot.js';
import coordutil from '../../../../../shared/chess/util/coordutil.js';
import icnconverter from '../../../../../shared/chess/logic/icn/icnconverter.js';
import selection from '../chess/selection.js';
import state from '../../../../../shared/chess/logic/state.js';
import specialrighthighlights from '../rendering/highlights/specialrighthighlights.js';
import guiboardeditor from '../gui/boardeditor/guiboardeditor.js';
import movesequence from '../chess/movesequence.js';
import movepiece from '../../../../../shared/chess/logic/movepiece.js';
import guinavigation from '../gui/guinavigation.js';
import jsutil from '../../../../../shared/util/jsutil.js';
import selectiontool from './tools/selection/selectiontool.js';
import egamerules from './egamerules.js';
import drawingtool from './tools/drawingtool.js';
import stransformations from './tools/selection/stransformations.js';
import eactions from './eactions.js';
import boardutil from '../../../../../shared/chess/util/boardutil.js';
import miniimage from '../rendering/miniimage.js';
import arrows from '../rendering/arrows/arrows.js';
import perspective from '../rendering/perspective.js';


// Type Definitions -------------------------------------------------------------


type Tool = (typeof validTools)[number];

/** 
 * An edit that also keeps track of the state of certain position dependent game rules after the edit is made.
 * Used exclusively for game history purposes
 */
interface EditWithRules extends Edit {
	pawnDoublePush?: boolean,
	castlingWithRooks?: boolean
}

// Constants --------------------------------------------------------------------


/** All tools that can be used in the board editor. */
const validTools = ["normal", "placer", "eraser", "specialrights", "selection-tool"] as const;

/**
 * The maximum allowed summed changes in the edit history before oldest edits are pruned.
 * This is to prevent excessive memory usage crashing the browser.
 * 
 * Naviary's machine got to 26 million changes before slowing, then crashing.
 * The tab was using roughly 5 GB of memory at that point.
 * I guess maybe a max of 8 million could be safe on most machines?
 */
const EDIT_HISTORY_MAX_CHANGES = 8_000_000;


// State -------------------------------------------------------------------------


/** Whether we are currently using the editor. */
let inBoardEditor = false;

/** The tool currently selected. */
let currentTool: Tool = "normal";

/** The list of all edits the user has made. */
let edits: Array<EditWithRules> | undefined;
let indexOfThisEdit: number | undefined;


// Initialization ------------------------------------------------------------------------


/** 
 * Initializes the board editor.
 * Should be called AFTER loading the game logically.
 */
function initBoardEditor(): void {
	inBoardEditor = true;
	edits = [];
	indexOfThisEdit = 0;

	setTool("normal");

	guiboardeditor.markTool(currentTool);
	drawingtool.init();

	// Set gamerulesGUIinfo object according to pasted game
	const gamefile = jsutil.deepCopyObject(gameslot.getGamefile()!);
	gamefile.basegame.gameRules.winConditions[players.WHITE] = [icnconverter.default_win_condition];
	gamefile.basegame.gameRules.winConditions[players.BLACK] = [icnconverter.default_win_condition];
	egamerules.setGamerulesGUIinfo(gamefile.basegame.gameRules, gamefile.boardsim.state.global, {pawnDoublePush: true, castlingWithRooks: true});

	addEventListeners();
}

function closeBoardEditor(): void {
	// Reset state
	inBoardEditor = false;
	currentTool = "normal";
	guiboardeditor.markTool(currentTool); // Effectively resets classes state
	edits = undefined;
	indexOfThisEdit = undefined;
	drawingtool.onCloseEditor();
	selectiontool.resetState();
	stransformations.resetState(); // Drops reference to clipboard

	removeEventListeners();
}

function addEventListeners(): void {
	document.addEventListener('copy', Copy);
	document.addEventListener('cut', Cut);
	document.addEventListener('paste', Paste);
}

function removeEventListeners(): void {
	document.removeEventListener('copy', Copy);
	document.removeEventListener('cut', Cut);
	document.removeEventListener('paste', Paste);
}

function update(): void {
	if (!inBoardEditor) return;

	testShortcuts();

	// Handle starting and ending the drawing state
	if (drawingtool.isToolADrawingTool(currentTool)) drawingtool.update(currentTool);
	// Update selection tool, if that is active
	else if (currentTool === "selection-tool") selectiontool.update();
}

/** Tests for keyboard shortcuts in the board editor. */
function testShortcuts(): void {
	if (perspective.getEnabled()) return; // Disable shortcuts while in perspective mode, WASD is reserved for camera movement

	// Select all
	if (listener_document.isKeyDown('KeyA', true)) selectiontool.selectAll();

	// Undo/Redo
	if (listener_document.isKeyDown('KeyY', true)) redo();
	if (listener_document.isKeyDown('KeyZ', true, true)) redo(); // Also requires shift key
	else if (listener_document.isKeyDown('KeyZ', true)) undo();

	// Tools
	if (listener_document.isKeyDown('KeyF')) setTool("normal");
	else if (listener_document.isKeyDown('KeyG')) setTool("eraser");
	else if (listener_document.isKeyDown('KeyH')) setTool("selection-tool");
	else if (listener_document.isKeyDown('KeyJ')) setTool("specialrights");
	else if (listener_document.isKeyDown('KeyK')) setTool("placer");
}


// Tool Management ------------------------------------------------------------


function getTool(): typeof currentTool {
	return currentTool;
}

/** Change the tool being used. */
function setTool(tool: string): void {
	if (!validTools.includes(tool as Tool)) return console.error("Invalid tool: " + tool);
	currentTool = tool as Tool;
	drawingtool.onToolChange(currentTool);

	// Prevents you from being able to draw while a piece is selected.
	// if (drawingTools.includes(currentTool)) selection.unselectPiece();
	// Should this not always unselect when moving off the "normal" tool?
	// Buttons that perform one-time actions like "clear" or "reset" should not be treated as tools.
	selection.unselectPiece();

	guiboardeditor.markTool(currentTool);

	// Reset selection tool state when switching to another tool
	selectiontool.resetState();
}


// Running Edits ---------------------------------------------------------------------------


/** Runs both logical and graphical changes. */
function runEdit(gamefile: FullGame, mesh: Mesh, edit: Edit, forward: boolean = true): void {
	// Pieces must be unselected before they are modified
	selection.unselectPiece();

	// Run logical changes
	movepiece.applyEdit(gamefile, edit, forward, true); // Apply the logical changes to the board state

	// Run graphical changes
	movesequence.runMeshChanges(gamefile.boardsim, mesh, edit, forward);

	specialrighthighlights.onMove();

	// If the piece count is now high enough, disable icons and arrows.
	const pieceCount = boardutil.getPieceCountOfGame(gamefile.boardsim.pieces);
	if (pieceCount > miniimage.pieceCountToDisableMiniImages || pieceCount > arrows.pieceCountToDisableArrows) {
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

function addEditToHistory(edit: Edit): void {
	console.log(edit)
	if (edit.changes.length === 0 && edit.state.local.length === 0 && edit.state.global.length === 0) return;
	edits!.length = indexOfThisEdit!; // Truncate any "redo" edits, that timeline is being erased.
	const { pawnDoublePush, castlingWithRooks } = egamerules.getPositionDependentGameRules();
	const editWithRules = {
		...edit,
		pawnDoublePush,
		castlingWithRooks
	};
	edits!.push(editWithRules);
	indexOfThisEdit!++;
	guinavigation.update_EditButtons();
}

function undo(): void {
	if (!inBoardEditor) throw Error("Cannot undo edit when we're not using the board editor.");
	if (drawingtool.isEditInProgress()) return; // Do not allow undoing or redoing while currently making an edit
	if (indexOfThisEdit! <= 0) return;
	const gamefile = gameslot.getGamefile()!;
	const mesh = gameslot.getMesh()!;
	indexOfThisEdit!--;
	runEdit(gamefile, mesh, edits![indexOfThisEdit!]!, false);
	if (indexOfThisEdit! !== 0) {
		const previousEdit = edits![indexOfThisEdit! - 1]!;
		egamerules.setPositionDependentGameRules({pawnDoublePush: previousEdit.pawnDoublePush, castlingWithRooks: previousEdit.castlingWithRooks});
	} else egamerules.setPositionDependentGameRules({pawnDoublePush: true, castlingWithRooks: true});
	guinavigation.update_EditButtons();
}

function redo(): void {
	if (!inBoardEditor) throw Error("Cannot redo edit when we're not using the board editor.");
	if (drawingtool.isEditInProgress()) return; // Do not allow undoing or redoing while currently making an edit
	if (indexOfThisEdit! >= edits!.length) return;
	const gamefile = gameslot.getGamefile()!;
	const mesh = gameslot.getMesh()!;
	runEdit(gamefile, mesh, edits![indexOfThisEdit!]!, true);
	egamerules.setPositionDependentGameRules({pawnDoublePush: edits![indexOfThisEdit!]!.pawnDoublePush, castlingWithRooks: edits![indexOfThisEdit!]!.castlingWithRooks});
	indexOfThisEdit!++;
	guinavigation.update_EditButtons();
}


// Queuing Edits ---------------------------------------------------------------


/** Queues the deletion of a piece, including its special rights, if present, to the edit changes. */
function queueRemovePiece(gamefile: FullGame, edit: Edit, piece: Piece): void {
	boardchanges.queueDeletePiece(edit.changes, false, piece);
	queueSpecialRights(gamefile, edit, piece.coords, false);
}

/** 
 * Queues the addition of a piece, including its special rights, if specified, to the edit changes.
 * If specialrights is left undefined, it is set according to the game rules
 */
function queueAddPiece(gamefile: FullGame, edit: Edit, coords: Coords, type: number, specialright: boolean | undefined): void {
	const piece: Piece = { type, coords, index: -1 };
	boardchanges.queueAddPiece(edit.changes, piece);
	if (specialright) queueSpecialRights(gamefile, edit, coords, true);
	else if (specialright === undefined) {
		const { pawnDoublePush, castlingWithRooks } = egamerules.getPositionDependentGameRules();
		if (pawnDoublePush && egamerules.pawnDoublePushTypes.includes(typeutil.getRawType(type))) queueSpecialRights(gamefile, edit, coords, true);
		else if (castlingWithRooks && egamerules.castlingWithRooksTypes.includes(typeutil.getRawType(type))) queueSpecialRights(gamefile, edit, coords, true);
	}
}

/** Queues the addition/removal of a specialright at the specified coordinates. */
function queueSpecialRights(gamefile: FullGame, edit: Edit, coords: Coords, add: boolean): void {
	const coordsKey = coordutil.getKeyFromCoords(coords);
	const current = gamefile.boardsim.state.global.specialRights.has(coordsKey);
	state.createSpecialRightsState(edit, coordsKey, current, add);
}


// Copy/Paste Handlers ----------------------------------------------------------


/** Custom Board Editor handler for Copy event. */
function Copy(): void {
	if (document.activeElement !== document.body) return; // Don't copy if the user is typing in an input field
	
	if (currentTool !== "selection-tool") {
		// Copy game notation
		eactions.save();
	} else if (selectiontool.isExistingSelection()) {
		// Copy current selection
		const gamefile = gameslot.getGamefile()!;
		const selectionBox = selectiontool.getSelectionIntBox()!;
		stransformations.Copy(gamefile, selectionBox);
	}
}

/** Board Editor handler for Cut event. */
function Cut(): void {
	if (document.activeElement !== document.body) return; // Don't cut if the user is typing in an input field

	if (currentTool !== "selection-tool" || !selectiontool.isExistingSelection()) return;

	// Cut current selection
	const gamefile = gameslot.getGamefile()!;
	const mesh = gameslot.getMesh()!;
	const selectionBox = selectiontool.getSelectionIntBox()!;
	stransformations.Copy(gamefile, selectionBox);
	stransformations.Delete(gamefile, mesh, selectionBox);
}

/** Custom Board Editor handler for Paste event. */
function Paste(): void {
	if (document.activeElement !== document.body) return; // Don't paste if the user is typing in an input field

	if (currentTool !== "selection-tool") {
		// Paste game notation
		eactions.load();
	} else if (selectiontool.isExistingSelection()) {
		// Paste clipboard at current selection
		const gamefile = gameslot.getGamefile()!;
		const mesh = gameslot.getMesh()!;
		const selectionBox = selectiontool.getSelectionIntBox()!;
		stransformations.Paste(gamefile, mesh, selectionBox);
	}
}


// Utility --------------------------------------------------------------------


function areInBoardEditor(): boolean {
	return inBoardEditor;
}

function canUndo(): boolean {
	// comparing undefined always returns false
	return indexOfThisEdit !== undefined && indexOfThisEdit > 0;
}

function canRedo(): boolean {
	// comparing undefined always returns false
	return indexOfThisEdit !== undefined && edits !== undefined && indexOfThisEdit < edits.length;
}

/** Whether any of the editor tools are actively using the left mouse button. */
function isLeftMouseReserved(): boolean {
	if (!inBoardEditor) return false;
	return drawingtool.isToolADrawingTool(currentTool) || currentTool === "selection-tool";
}

/** If the given pointer is currently being used by a drawing tool for an edit, this stops using it. */
function stealPointer(pointerIdToSteal: string): void {
	if (!inBoardEditor) return;
	if (currentTool === 'selection-tool') return; // Don't steal (selection tool isn't capable of reverting to previous selection before starting a new one)
	else if (drawingtool.isToolADrawingTool(currentTool)) drawingtool.stealPointer(pointerIdToSteal);
}


// Rendering ------------------------------------------------------------------


/** Renders any graphics of the active tool, if we are in the board editor. */
function render(): void {
	if (!inBoardEditor) return;

	// Render selection-tool graphics, if that is active
	if (currentTool === "selection-tool") selectiontool.render();
}


// Exports --------------------------------------------------------------------


export type {
	Edit,
	Tool,
};

export default {
	// State
	areInBoardEditor,
	// Initialization
	initBoardEditor,
	closeBoardEditor,
	update,
	// Tool Management
	getTool,
	setTool,
	// Running Edits
	runEdit,
	addEditToHistory,
	undo,
	redo,
	// Queuing Edits
	queueAddPiece,
	queueRemovePiece,
	queueSpecialRights,
	// Utility
	canUndo,
	canRedo,
	isLeftMouseReserved,
	stealPointer,
	// Rendering
	render,
};