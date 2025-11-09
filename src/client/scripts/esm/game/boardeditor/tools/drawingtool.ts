
// src/client/scripts/esm/game/boardeditor/tools/drawing/drawingtool.ts

/**
 * Editor Drawing Tool
 * 
 * Manages all drawing tools
 */

import type { FullGame } from "../../../../../../shared/chess/logic/gamefile";

import state from "../../../../../../shared/chess/logic/state";
import boardutil, { Piece } from "../../../../../../shared/chess/util/boardutil";
import coordutil, { Coords } from "../../../../../../shared/chess/util/coordutil";
import typeutil, { Player, players, rawTypes } from "../../../../../../shared/chess/util/typeutil";
import mouse from "../../../util/mouse";
import gameslot from "../../chess/gameslot";
import selection from "../../chess/selection";
import guiboardeditor from "../../gui/boardeditor/guiboardeditor";
import { Mouse } from "../../input";
import arrows from "../../rendering/arrows/arrows";
import specialrighthighlights from "../../rendering/highlights/specialrighthighlights";
import boardeditor, { Edit, Tool } from "../boardeditor";
import egamerules from "../egamerules";


// Constants -------------------------------------------------------


/** All tools that support drawing. */
const drawingTools: Tool[] = ["placer", "eraser", "specialrights"];


// State -----------------------------------------------------------


let currentColor: Player = players.WHITE;
let currentPieceType: number = typeutil.buildType(rawTypes.PAWN, currentColor);

/**
 * Changes are stored in `thisEdit` until the user releases the button.
 * Grouping changes together allow the user to undo an entire
 * brush stroke at once instead of one piece at a time.
 */
let thisEdit: Edit | undefined;
/** The ID of the pointer currently being used for drawing an edit with a DRAWING tool (excludes Selection tool) */
let drawingToolPointerId: string | undefined;

/** Whether a drawing stroke is currently ongoing. */
let drawing = false;
/** The last coordinate the stroke was over. */
let previousSquare: Coords | undefined;
/** Whether special rights are currently being added or removed with the current drawing stroke. Undefined if neither. */
let addingSpecialRights: boolean | undefined;


// Initialization ---------------------------------------------------------


function init(): void {
	guiboardeditor.updatePieceColors(currentColor);
	guiboardeditor.markPiece(currentPieceType);
}

function onCloseEditor(): void {
	resetState();
	specialrighthighlights.disable();
}

function resetState(): void {
	thisEdit = undefined;
	drawingToolPointerId = undefined;
	drawing = false;
	previousSquare = undefined;
	addingSpecialRights = undefined;
}


// Managing the Edit --------------------------------------------


function beginEdit(): void {
	drawing = true;
	thisEdit = { changes:[], state: {local: [], global: []} };
	// Pieces must be unselected before they are modified
	selection.unselectPiece();
}

function endEdit(): void {
	if (!drawing || !thisEdit) return;
	boardeditor.addEditToHistory(thisEdit);
	resetState();
}

/** Cancels the current edit, undoing any changes made during the stroke. */
function cancelEdit(): void {
	if (!drawing || thisEdit === undefined) return;

	const gamefile = gameslot.getGamefile()!;
	const mesh = gameslot.getMesh()!;
	// Undo the changes made during this edit
	boardeditor.runEdit(gamefile, mesh, thisEdit, false);
	resetState();
}

/** Handle starting and ending the drawing state */
function update(currentTool: Tool): void {
	if (!drawingTools.includes(currentTool)) return; // Not using a drawing tool

	if (mouse.isMouseDown(Mouse.LEFT) && !drawing && !arrows.areHoveringAtleastOneArrow()) {
		mouse.claimMouseDown(Mouse.LEFT); // Remove the pointer down so other scripts don't use it
		mouse.cancelMouseClick(Mouse.LEFT); // Cancel any potential future click so other scripts don't use it
		drawingToolPointerId = mouse.getMouseId(Mouse.LEFT)!;
		beginEdit();
	}
	else if (!mouse.isMouseHeld(Mouse.LEFT) && drawing) return endEdit();

	if (!drawing || !thisEdit) return; // If not currently drawing, nothing more to do

	const gamefile = gameslot.getGamefile()!;
	const mesh = gameslot.getMesh()!;
	const mouseCoords = mouse.getTileMouseOver_Integer();
	if (mouseCoords === undefined) return;
	if (previousSquare !== undefined && coordutil.areCoordsEqual(mouseCoords, previousSquare)) return;
	previousSquare = mouseCoords;

	const pieceHovered = boardutil.getPieceFromCoords(gamefile.boardsim.pieces, mouseCoords);
	const edit: Edit = { changes: [], state: { local: [], global: [] } };

	switch (currentTool) {
		case "placer":
			// Replace piece logic. If we need this in more than one place, we can then make a queueReplacePiece() method.
			if (pieceHovered?.type === currentPieceType) break; // Equal to the new piece => don't replace
			if (pieceHovered) boardeditor.queueRemovePiece(gamefile, edit, pieceHovered); // Delete existing piece first
			boardeditor.queueAddPiece(gamefile, edit, mouseCoords, currentPieceType, false);
			break;
		case "eraser":
			if (pieceHovered) boardeditor.queueRemovePiece(gamefile, edit, pieceHovered);
			break;
		case "specialrights":
			queueToggleSpecialRight(gamefile, edit, pieceHovered);
			break;
		default:
			throw Error("Tried to draw with a non-drawing tool.");
	}

	if (edit.changes.length === 0 && edit.state.local.length === 0 && edit.state.global.length === 0) return;
	boardeditor.runEdit(gamefile, mesh, edit, true);
	thisEdit.changes.push(...edit.changes);
	thisEdit.state.local.push(...edit.state.local);
	thisEdit.state.global.push(...edit.state.global);
}

/** Queues a specialrights state addition/deletion on the specified */
function queueToggleSpecialRight(gamefile: FullGame, edit: Edit, pieceHovered: Piece | undefined): void {
	if (pieceHovered === undefined) return;
	const coordsKey = coordutil.getKeyFromCoords(pieceHovered.coords);
	const current = gamefile.boardsim.state.global.specialRights.has(coordsKey);
	const future = !current;

	if (addingSpecialRights === undefined) addingSpecialRights = future;
	else if (addingSpecialRights !== future) return;

	state.createSpecialRightsState(edit, coordsKey, current, future);

	egamerules.updateGamerulesUponQueueToggleSpecialRight(gamefile, pieceHovered.coords, future);
}


// API ---------------------------------------------------------


function onToolChange(tool: Tool): void {
	endEdit();

	if (tool === "specialrights") specialrighthighlights.enable();
	else specialrighthighlights.disable();

	if (tool !== "placer") guiboardeditor.markPiece(null);
	else guiboardeditor.markPiece(currentPieceType);
}

function isEditInProgress(): boolean {
	return drawing;
}

function isToolADrawingTool(tool: Tool): boolean {
	return drawingTools.includes(tool);
}

function stealPointer(pointerIdToSteal: string): void {
	if (drawingToolPointerId !== pointerIdToSteal) return; // Not the pointer drawing the edit, don't stop using it.
	cancelEdit();
}

/** Set the piece type to be added to the board */
function setPiece(pieceType: number): void {
	currentPieceType = pieceType;
}

function getPiece(): number {
	return currentPieceType;
}

function setColor(color: Player): void {
	currentColor = color;
}

function getColor(): Player {
	return currentColor;
}


// Exports --------------------------------------------------------------------


export default {
	// Initialization
	init,
	onCloseEditor,
	update,
	// API
	onToolChange,
	isEditInProgress,
	isToolADrawingTool,
	stealPointer,
	setPiece,
	getPiece,
	setColor,
	getColor,
};