/**
 * Currently this script contains all the non-gui logic for the board editor.
 * It will probably need to be split into multiple files as it is already large
 * and isn't finished yet.
 */

import boardchanges from '../../chess/logic/boardchanges.js';
import { meshChanges } from '../chess/graphicalchanges.js';
// @ts-ignore
import input from '../input.js';
// @ts-ignore
import board from '../rendering/board.js';
import gameslot from '../chess/gameslot.js';
import coordutil from '../../chess/util/coordutil.js';
import colorutil from '../../chess/util/colorutil.js';
// @ts-ignore
import typeutil from '../../chess/util/typeutil.js';
import gamefileutility from '../../chess/util/gamefileutility.js';
import guinavigation from '../gui/guinavigation.js';
// @ts-ignore
import formatconverter from '../../chess/logic/formatconverter.js';
import docutil from '../../util/docutil.js';
import selection from '../chess/selection.js';
import state from '../../chess/logic/state.js';

// Type Definitions -------------------------------------------------------------

import type { Coords } from '../../chess/util/coordutil.js';
// @ts-ignore
import type { gamefile } from '../../chess/logic/gamefile.js'
import type { Change, Piece } from '../../chess/logic/boardchanges.js'
import type { StateChange } from '../../chess/logic/state.js';

type Edit = {
	changes: Array<Change>,
	stateChanges: Array<StateChange>
}

// Variables --------------------------------------------------------------------

/** Whether we are currently using the editor. */
let inBoardEditor = false;

const validTools = [...typeutil.types, ...typeutil.neutralTypes, 'eraser', 'special']

let currentColor = "white";
let currentTool: string = "queens";

/**
 * Changes are stored in `thisEdit` until the user releases the button.
 * Grouping changes together allow the user to undo an entire 
 * brush stroke at once instead of one piece at a time.
 */
let thisEdit: Edit | undefined;
/** The list of all edits the user has made. */
let edits: Array<Edit> | undefined;
let indexOfThisEdit: number | undefined = 0;

let drawing = false;
let previousSquare: Coords | undefined;

// Functions ------------------------------------------------------------------------

function areInBoardEditor () {
	return inBoardEditor;
}
function initBoardEditor () {
	inBoardEditor = true;
	edits = [];
	indexOfThisEdit = 0;
}
function closeBoardEditor () {
	inBoardEditor = false;
	drawing = false;
	thisEdit = undefined;
	edits = undefined;
	indexOfThisEdit = undefined;
	previousSquare = undefined;
}
function canUndo () {
	// comparing undefined always returns false
	return indexOfThisEdit! > 0;
}
function canRedo () {
	// comparing undefined always returns false
	return indexOfThisEdit! < edits?.length!;
}

function beginEdit() {
	drawing = true;
	thisEdit = { changes:[], stateChanges:[] };
	// Pieces must be unselected before they are modified
	selection.unselectPiece();
}

function endEdit() {
	drawing = false;
	previousSquare = undefined;
	addEditToHistory(thisEdit!);
	thisEdit = undefined;
	guinavigation.update_MoveButtons();
}

/** Runs both logical and graphical changes. */
function runEdit(gamefile: gamefile, edit: Edit, forward: boolean = true) {
	// Pieces must be unselected before they are modified
	selection.unselectPiece();
	// Run graphical and logical changes
	boardchanges.runChanges(gamefile, edit.changes, boardchanges.changeFuncs, forward);
	boardchanges.runChanges(gamefile, edit.changes, meshChanges, forward);
	// Update special rights
	for (const stateChange of edit.stateChanges) {
		state.applyState(gamefile, stateChange, forward);
	}
}

function addEditToHistory(edit: Edit) {
	edits!.length = indexOfThisEdit!;
	edits!.push(edit);
	indexOfThisEdit!++;
}

function update() {
	if (!inBoardEditor) return;
	
	const gamefile = gameslot.getGamefile()!;
	
	if (drawing) {
		if (!input.isMouseHeld_Right()) return endEdit();
	} else {
		if (input.isMouseDown_Right()) beginEdit();
		else return;
	}
	
	const coords = board.getTileMouseOver().tile_Int as Coords;
	if (coordutil.areCoordsEqual(coords, previousSquare)) return;
	previousSquare = coords;
	
	const coordsKey = coordutil.getKeyFromCoords(coords);
	const type = gamefile.piecesOrganizedByKey[coordsKey];
	const pieceHovered = type === undefined ? undefined : gamefileutility.getPieceFromTypeAndCoords(gamefile, type, coords);
	
	let edit: Edit = { changes: [], stateChanges: [] };
	
	// TODO: Move tools into their own functions.
	// This function is becoming very cluttered.
	if (currentTool === "special") {
		if (!pieceHovered) return;
		const current: undefined | true = gamefile.specialRights[coordsKey];
		const future = current ? undefined : true;
		edit.stateChanges.push({ type: 'specialrights', current, future, coordsKey });
	} else {
		if (pieceHovered) {
			boardchanges.queueDeletePiece(edit.changes, pieceHovered, false);
			const current = gamefile!.specialRights[coordsKey];
			edit.stateChanges.push({ type: 'specialrights', current, coordsKey });
		}
		
		if (currentTool !== "eraser") {
			const colorExtension = typeutil.neutralTypes.includes(currentTool) ? colorutil.colorExtensionOfNeutrals : colorutil.getColorExtensionFromColor(currentColor);
			const type = currentTool + colorExtension;
			const piece: Piece = { type, coords } as Piece;
			boardchanges.queueAddPiece(edit.changes, piece);
		}
	}
	runEdit(gamefile, edit, true);
	thisEdit!.changes.push(...edit.changes);
	thisEdit!.stateChanges.push(...edit.stateChanges);
}

/**
 * Change the tool being used.
 * `tool` is a piece type without color extension, 'special' or 'eraser'.
 */
function setTool(tool: string) {
	if (!inBoardEditor) return;
	if (!validTools.includes(tool)) throw Error(`Invalid editor tool: ${tool}`);
	currentTool = tool;
}

function toggleColor() {
	return currentColor = colorutil.getOppositeColor(currentColor);
}

function clearAll() {
	if (!inBoardEditor) throw Error("Cannot clear board when we're not using the board editor.");
	const gamefile = gameslot.getGamefile()!;
	const edit: Edit = { changes: [], stateChanges: [] }
	gamefileutility.forEachPieceInGame(gamefile, (type, coords, gamefile) => {
		const pieceToDelete = gamefileutility.getPieceFromTypeAndCoords(gamefile!, type, coords);
		boardchanges.queueDeletePiece(edit.changes, pieceToDelete, false);
		
		const coordsKey = coordutil.getKeyFromCoords(coords);
		const current = gamefile!.specialRights[coordsKey];
		edit.stateChanges.push({ type: 'specialrights', current, coordsKey });
	});
	runEdit(gamefile!, edit, true);
	addEditToHistory(edit);
}

function undo() {
	if (!inBoardEditor) throw Error("Cannot undo edit when we're not using the board editor.");
	if (indexOfThisEdit! <= 0) return;
	const gamefile = gameslot.getGamefile()!;
	indexOfThisEdit!--;
	runEdit(gamefile, edits![indexOfThisEdit!]!, false);
	guinavigation.update_MoveButtons();
}

function redo() {
	if (!inBoardEditor) throw Error("Cannot redo edit when we're not using the board editor.");
	if (indexOfThisEdit! >= edits!.length) return;
	const gamefile = gameslot.getGamefile()!;
	runEdit(gamefile, edits![indexOfThisEdit!]!, true);
	indexOfThisEdit!++;
	guinavigation.update_MoveButtons();
}

/**
 * copypastegame uses the move list instead of the position 
 * which doesn't work for the board editor.
 * This function uses the position of pieces on the board.
 */
function save() {
	const gamefile = gameslot.getGamefile();
	if (!gamefile) return;
	let output = "";
	const pieces = gamefile.piecesOrganizedByKey;
	for (const key in pieces) {
		output += formatconverter.LongToShort_Piece(pieces[key]) + key + '|';
	}
	docutil.copyToClipboard(output);
}

function submitMove () {
	if (!inBoardEditor) return;
	const gamefile = gameslot.getGamefile()!;
	edits!.length = indexOfThisEdit!;
	for (let i = 0; i < gamefile.moves.length; i++) {
		const move = gamefile.moves[i];
		const edit: Edit = {
			changes: move.changes,
			stateChanges: [...move.state.global, ...move.state.local]
		}
		edits!.push(edit);
	}
	indexOfThisEdit = edits!.length;
	gamefile.moves.length = 0;
	gamefile.moveIndex = -1;
	guinavigation.update_MoveButtons();
}

export default {
	areInBoardEditor,
	initBoardEditor,
	closeBoardEditor,
	submitMove,
	update,
	setTool,
	toggleColor,
	canUndo,
	canRedo,
	undo,
	redo,
	save,
	clearAll,
}