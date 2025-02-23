
import boardchanges, { Change, Piece } from '../../chess/logic/boardchanges.js';
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

// Type Definitions -------------------------------------------------------------

import { Coords } from '../../chess/util/coordutil.js';
// @ts-ignore
import { gamefile } from '../../chess/logic/gamefile.js'

type Edit = Array<Change>;

// Variables --------------------------------------------------------------------

/** Whether we are currently using the editor. */
let inBoardEditor = false;

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
	thisEdit = [];
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
function runChanges(gamefile: gamefile, changes: Array<Change>, forward?: boolean) {
	// Pieces must be unselected before they are modified
	selection.unselectPiece();
	boardchanges.runChanges(gamefile, changes, boardchanges.changeFuncs, forward);
	boardchanges.runChanges(gamefile, changes, meshChanges, forward);
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
	
	let changes: Array<Change> = [];
	
	const pieceToRemove = gamefileutility.getPieceAtCoords(gamefile, coords);
	if (pieceToRemove) boardchanges.queueDeletePiece(changes, pieceToRemove, false);
	
	if (currentTool !== "eraser") {
		const colorExtension = typeutil.neutralTypes.includes(currentTool) ? colorutil.colorExtensionOfNeutrals : colorutil.getColorExtensionFromColor(currentColor);
		const type = currentTool + colorExtension;
		const piece: Piece = { type, coords } as Piece;
		boardchanges.queueAddPiece(changes, piece);
	}
	
	runChanges(gamefile, changes, true);
	thisEdit!.push(...changes);
}

function setTool(tool: string) {
	if (!inBoardEditor) return;
	if (tool === "save") return save();
	if (tool === "color") return toggleColor();
	if (tool === "clear") return clearAll();
	if (tool === "special") return; // TODO
	currentTool = tool;
}

function toggleColor() {
	return currentColor = colorutil.getOppositeColor(currentColor);
}

function clearAll() {
	if (!inBoardEditor) throw Error("Cannot clear board when we're not using the board editor.")
	const gamefile = gameslot.getGamefile()!;
	const changes: Array<Change> = [];
	gamefileutility.forEachPieceInGame(gamefile, (type, coords, gamefile) => {
		const pieceToDelete = gamefileutility.getPieceFromTypeAndCoords(gamefile!, type, coords);
		boardchanges.queueDeletePiece(changes, pieceToDelete, false);
	});
	runChanges(gamefile!, changes, true);
	addEditToHistory(changes);
}

function undo() {
	if (!inBoardEditor) throw Error("Cannot undo edit when we're not using the board editor.");
	if (indexOfThisEdit! <= 0) return;
	const gamefile = gameslot.getGamefile()!;
	indexOfThisEdit!--;
	runChanges(gamefile, edits![indexOfThisEdit!]!, false);
	guinavigation.update_MoveButtons();
}

function redo() {
	if (!inBoardEditor) throw Error("Cannot redo edit when we're not using the board editor.");
	if (indexOfThisEdit! >= edits!.length) return;
	const gamefile = gameslot.getGamefile()!;
	runChanges(gamefile, edits![indexOfThisEdit!]!, true);
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
		edits!.push(gamefile.moves[i].changes);
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
}