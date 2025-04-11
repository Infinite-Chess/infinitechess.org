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
import typeutil, {players, rawTypes} from '../../chess/util/typeutil.js';
import gamefileutility from '../../chess/util/gamefileutility.js';
import guinavigation from '../gui/guinavigation.js';
// @ts-ignore
import formatconverter from '../../chess/logic/formatconverter.js';
import docutil from '../../util/docutil.js';
import selection from '../chess/selection.js';
import state from '../../chess/logic/state.js';
import boardutil from '../../chess/util/boardutil.js';
import specialrighthighlights from '../rendering/highlights/specialrighthighlights.js';

// Type Definitions -------------------------------------------------------------

import type { Coords } from '../../chess/util/coordutil.js';
// @ts-ignore
import type { gamefile } from '../../chess/logic/gamefile.js'
import type { Change } from '../../chess/logic/boardchanges.js'
import type { Piece } from '../../chess/util/boardutil.js';
import type { MoveState } from '../../chess/logic/state.js';
import type { RawType, Player } from '../../chess/util/typeutil.js';

type Edit = {
	changes: Array<Change>,
	state: MoveState
}

// Variables --------------------------------------------------------------------

/** Whether we are currently using the editor. */
let inBoardEditor = false;

let currentPiece: number = 0;
let currentTool: "piece" | "eraser" | "special";

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
	thisEdit = { changes:[], state: {local: [], global: []} };
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
	state.applyMove(gamefile, edit, forward, { globalChange: true });
	specialrighthighlights.onMove();
}

function addEditToHistory(edit: Edit) {
	edits!.length = indexOfThisEdit!;
	edits!.push(edit);
	indexOfThisEdit!++;
}

function update() {
	if (!inBoardEditor || !currentTool) return;
	
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
	
	const pieceHovered = boardutil.getPieceFromCoords(gamefile.pieces, coords);
	
	let edit: Edit = { changes: [], state: { local: [], global: [] } };
	
	switch (currentTool) {
	case "special":
		queueToggleSpecialRight(gamefile, edit, pieceHovered); break;
	case "eraser":
		queueRemovePiece(gamefile, edit, pieceHovered); break;
	case "piece":
		queueAddPiece(gamefile, edit, pieceHovered, coords, currentPiece); break;
	default:
		throw new Error("Invalid tool.");
	}
	
	runEdit(gamefile, edit, true);
	thisEdit!.changes.push(...edit.changes);
	thisEdit!.state.local.push(...edit.state.local);
	thisEdit!.state.global.push(...edit.state.global);
}

function queueToggleSpecialRight(gamefile: gamefile, edit: Edit, pieceHovered: Piece | undefined) {
	if (!pieceHovered) return;
	const coordsKey = coordutil.getKeyFromCoords(pieceHovered.coords);
	if (!pieceHovered) return;
	const current = gamefile.specialRights[coordsKey];
	const future = current ? undefined : true;
	state.createSpecialRightsState(edit, coordsKey, current, future)
}

function queueAddPiece(gamefile: gamefile, edit: Edit, pieceHovered: Piece | undefined, coords: Coords, type: number) {
	if (pieceHovered) queueRemovePiece(gamefile, edit, pieceHovered);
	const piece: Piece = { type, coords, index:-1 };
	boardchanges.queueAddPiece(edit.changes, piece);
}

function queueRemovePiece(gamefile: gamefile, edit: Edit, pieceHovered: Piece | undefined) {
	if (!pieceHovered) return;
	const coordsKey = coordutil.getKeyFromCoords(pieceHovered.coords);
	boardchanges.queueDeletePiece(edit.changes, false, pieceHovered);
	const current = gamefile!.specialRights[coordsKey];
	state.createSpecialRightsState(edit, coordutil.getKeyFromCoords(pieceHovered.coords), current);
	if (coordutil.areCoordsEqual(pieceHovered.coords, gamefile.enpassant?.pawn)) {
		// If the pawn has been removed, the en passant sqare must be too.
		state.createEnPassantState(edit, gamefile.enpassant);
	}
}

/**
 * Change the tool being used.
 */
function setTool(tool: typeof currentTool) {
	currentTool = tool;
}

// Set the piece type to be added to the board
function setPiece (pieceType: number) {
	currentPiece = pieceType;
}

function clearAll() {
	if (!inBoardEditor) throw Error("Cannot clear board when we're not using the board editor.");
	const gamefile = gameslot.getGamefile()!;
	const pieces = gamefile.pieces;
	const edit: Edit = { changes: [], state: { local: [], global: [] } }
	for (const idx of pieces.coords.values()) {
		const pieceToDelete = boardutil.getPieceFromIdx(pieces, idx);
		queueRemovePiece(gamefile, edit, pieceToDelete);
	};
	runEdit(gamefile, edit, true);
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
	const pieces = gamefile.pieces;
	let output = "";
	pieces.coords.forEach((idx: number, coordsKey: string) => {
		const type = pieces.types[idx];
		output += formatconverter.IntToShort_Piece(type) + coordsKey + '|';
	});
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
			state: {global: move.state.global, local: move.state.local}
		}
		edits!.push(edit);
	}
	indexOfThisEdit = edits!.length;
	gamefile.moves.length = 0;
	gamefile.moveIndex = -1;
	guinavigation.update_MoveButtons();
}

export type {
	Edit
}

export default {
	areInBoardEditor,
	initBoardEditor,
	closeBoardEditor,
	submitMove,
	update,
	setTool,
	setPiece,
	canUndo,
	canRedo,
	undo,
	redo,
	save,
	clearAll,
}