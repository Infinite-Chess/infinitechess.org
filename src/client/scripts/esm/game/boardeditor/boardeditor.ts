
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

import { players } from '../../../../../shared/chess/util/typeutil.js';
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


// Type Definitions -------------------------------------------------------------


type Tool = (typeof validTools)[number];


// Constants --------------------------------------------------------------------


/** All tools that can be used in the board editor. */
const validTools = ["normal", "placer", "eraser", "specialrights", "selection-tool"] as const;


// State -------------------------------------------------------------------------


/** Whether we are currently using the editor. */
let inBoardEditor = false;

/** The tool currently selected. */
let currentTool: Tool = "normal";

/** The list of all edits the user has made. */
let edits: Array<Edit> | undefined;
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
	egamerules.setGamerulesGUIinfo(gamefile.basegame.gameRules, gamefile.boardsim.state.global);
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
}

function update(): void {
	if (!inBoardEditor) return;

	// Handle starting and ending the drawing state
	if (drawingtool.isToolADrawingTool(currentTool)) drawingtool.update(currentTool);
	// Update selection tool, if that is active
	else if (currentTool === "selection-tool") selectiontool.update();
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
}

function addEditToHistory(edit: Edit): void {
	if (edit.changes.length === 0 && edit.state.local.length === 0 && edit.state.global.length === 0) return;
	edits!.length = indexOfThisEdit!; // Truncate any "redo" edits, that timeline is being erased.
	edits!.push(edit);
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
	guinavigation.update_EditButtons();
}

function redo(): void {
	if (!inBoardEditor) throw Error("Cannot redo edit when we're not using the board editor.");
	if (drawingtool.isEditInProgress()) return; // Do not allow undoing or redoing while currently making an edit
	if (indexOfThisEdit! >= edits!.length) return;
	const gamefile = gameslot.getGamefile()!;
	const mesh = gameslot.getMesh()!;
	runEdit(gamefile, mesh, edits![indexOfThisEdit!]!, true);
	indexOfThisEdit!++;
	guinavigation.update_EditButtons();
}


// Queuing Edits ---------------------------------------------------------------


/** Queues the deletion of a piece, including its special rights, if present, to the edit changes. */
function queueRemovePiece(gamefile: FullGame, edit: Edit, pieceHovered: Piece): void {
	const coordsKey = coordutil.getKeyFromCoords(pieceHovered.coords);
	// Remove the piece
	boardchanges.queueDeletePiece(edit.changes, false, pieceHovered);
	// Remove its special right
	const current = gamefile.boardsim.state.global.specialRights.has(coordsKey);
	state.createSpecialRightsState(edit, coordutil.getKeyFromCoords(pieceHovered.coords), current, false);
}

/** Queues the addition of a piece, including its special rights, if specified, to the edit changes. */
function queueAddPiece(gamefile: FullGame, edit: Edit, coords: Coords, type: number, specialright: boolean): void {
	const piece: Piece = { type, coords, index: -1 };
	boardchanges.queueAddPiece(edit.changes, piece);
	// Special right
	if (specialright) {
		const coordsKey = coordutil.getKeyFromCoords(coords);
		const current = gamefile.boardsim.state.global.specialRights.has(coordsKey);
		state.createSpecialRightsState(edit, coordsKey, current, true);
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
	// Utility
	canUndo,
	canRedo,
	isLeftMouseReserved,
	stealPointer,
	// Rendering
	render,
};