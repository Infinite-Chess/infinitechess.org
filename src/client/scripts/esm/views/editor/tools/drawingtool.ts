// src/client/scripts/esm/views/editor/tools/drawingtool.ts

/**
 * Editor Drawing Tool
 *
 * Manages all drawing tools
 */

import type { Edit } from '../../../../../../shared/chess/logic/movepiece.js';
import type { Tool } from './etoolmanager.js';
import type { GameFile } from '../../../../../../shared/chess/logic/gamefile.js';

import state from '../../../../../../shared/chess/logic/state.js';
import bounds from '../../../../../../shared/util/math/bounds.js';
import boardutil, { Piece } from '../../../../../../shared/chess/logic/boardutil.js';
import coordutil, { Coords } from '../../../../../../shared/util/coordutil.js';
import typeutil, {
	Player,
	players as p,
	rawTypes as r,
} from '../../../../../../shared/chess/util/typeutil.js';

import mouse from '../../../game/mouse.js';
import gameslot from '../../../game/chess/gameslot.js';
import selection from '../../../game/chess/selection.js';
import { MOUSE } from '../../../game/input.js';
import egamerules from '../egamerules.js';
import guipalette from '../gui/guipalette.js';
import edithistory from '../edithistory.js';
import { GameBus } from '../../../board/GameBus.js';
import arrowinteraction from '../../../game/rendering/arrows/arrowinteraction.js';
import specialrighthighlights from '../../../game/rendering/highlights/specialrighthighlights.js';

// Constants -------------------------------------------------------------------

/** All tools that support drawing. */
const DRAWING_TOOLS: Tool[] = ['placer', 'eraser', 'specialrights'];

// State -----------------------------------------------------------------------

let currentColor: Player = p.WHITE;
let currentPieceType: number = typeutil.buildType(r.PAWN, currentColor);

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

// Events ----------------------------------------------------------------------

// Cancel the in-progress edit if the board steals its pointer to pinch.
GameBus.addEventListener('steal-pointer', (e) => {
	if (drawingToolPointerId !== e.detail.pointerId) return; // Not the pointer drawing the edit, don't stop using it.
	cancelEdit();
});

// Initialization --------------------------------------------------------------

/** Syncs the palette to the current drawing color and piece. */
function init(): void {
	guipalette.updatePieceColors(currentColor);
	guipalette.markPiece(currentPieceType);
}

/** Drops any stroke in progress, without adding it to the history. */
function resetState(): void {
	thisEdit = undefined;
	drawingToolPointerId = undefined;
	drawing = false;
	previousSquare = undefined;
	addingSpecialRights = undefined;
}

// Managing the Edit -----------------------------------------------------------

/** Starts a new stroke, collecting its changes into one edit. */
function beginEdit(): void {
	drawing = true;
	thisEdit = { changes: [], state: [] };
	// Pieces must be unselected before they are modified
	selection.unselectPiece();
}

/** Ends the stroke, adding its edit to the history. */
function endEdit(): void {
	if (!drawing || !thisEdit) return;
	edithistory.addEditToHistory(thisEdit);
	resetState();
}

/** Cancels the current edit, undoing any changes made during the stroke. */
function cancelEdit(): void {
	if (!drawing || thisEdit === undefined) return;

	const gamefile = gameslot.getGamefile()!;
	const mesh = gameslot.getMesh()!;
	// Undo the changes made during this edit
	edithistory.runEdit(gamefile, mesh, thisEdit, false);
	resetState();
}

/** Handle starting and ending the drawing state */
function update(currentTool: Tool): void {
	if (!DRAWING_TOOLS.includes(currentTool)) return; // Not using a drawing tool

	if (
		mouse.isMouseDown(MOUSE.LEFT) &&
		!drawing &&
		!arrowinteraction.areHoveringAtleastOneArrow()
	) {
		mouse.claimMouseDown(MOUSE.LEFT); // Remove the pointer down so other scripts don't use it
		mouse.cancelMouseClick(MOUSE.LEFT); // Cancel any potential future click so other scripts don't use it
		drawingToolPointerId = mouse.getMouseId(MOUSE.LEFT)!;
		beginEdit();
	} else if (!mouse.isMouseHeld(MOUSE.LEFT) && drawing) return endEdit();

	if (!drawing || !thisEdit) return; // If not currently drawing, nothing more to do

	const gamefile = gameslot.getGamefile()!;
	const mesh = gameslot.getMesh()!;
	const mouseCoords = mouse.getTileMouseOver_Integer();
	if (mouseCoords === undefined) return;
	if (previousSquare !== undefined && coordutil.areCoordsEqual(mouseCoords, previousSquare))
		return; // We've already drawn on this square
	previousSquare = mouseCoords;

	// Make sure we don't paint outside the world border
	if (
		gamefile.gameRules.worldBorder &&
		!bounds.boxContainsSquare(gamefile.gameRules.worldBorder, mouseCoords)
	)
		return;

	const pieceHovered = boardutil.getPieceFromCoords(gamefile.pieces, mouseCoords);
	const edit: Edit = { changes: [], state: [] };

	switch (currentTool) {
		case 'placer': {
			// Replace piece logic. If we need this in more than one place, we can then make a queueReplacePiece() method.
			if (pieceHovered?.type === currentPieceType) break; // Equal to the new piece => don't replace
			if (pieceHovered) edithistory.queueRemovePiece(gamefile, edit, pieceHovered); // Delete existing piece first
			// Determine if special right should be given to the new piece, depending on gamerule checkboxes.
			const { pawnDoublePush, castling } = egamerules.getPositionDependentGameRules();
			// prettier-ignore
			const specialright: boolean = (
				(!!pawnDoublePush && egamerules.PAWN_DOUBLE_PUSH_TYPES.includes(typeutil.getRawType(currentPieceType))) ||
				(!!castling && egamerules.CASTLING_TYPES.includes(typeutil.getRawType(currentPieceType)))
			);
			edithistory.queueAddPiece(gamefile, edit, mouseCoords, currentPieceType, specialright);
			break;
		}
		case 'eraser':
			if (pieceHovered) edithistory.queueRemovePiece(gamefile, edit, pieceHovered);
			break;
		case 'specialrights':
			queueToggleSpecialRight(gamefile, edit, pieceHovered);
			break;
		default:
			throw Error('Tried to draw with a non-drawing tool.');
	}

	if (edit.changes.length === 0 && edit.state.length === 0) return;
	edithistory.runEdit(gamefile, mesh, edit, true);
	thisEdit.changes.push(...edit.changes);
	thisEdit.state.push(...edit.state);
}

/** Queues a specialrights state addition/deletion on the specified piece. */
function queueToggleSpecialRight(
	gamefile: GameFile,
	edit: Edit,
	pieceHovered: Piece | undefined,
): void {
	if (pieceHovered === undefined) return;
	const coordsKey = coordutil.getKeyFromCoords(pieceHovered.coords);
	const current = gamefile.state.global.specialRights.has(coordsKey);
	const future = !current;

	if (addingSpecialRights === undefined) addingSpecialRights = future;
	else if (addingSpecialRights !== future) return;

	state.createSpecialRightsState(edit, coordsKey, current, future);

	egamerules.updateGamerulesUponQueueToggleSpecialRight(pieceHovered.type, future);
}

// API -------------------------------------------------------------------------

/** Ends any stroke and syncs the special-rights highlights and palette to the new tool. */
function onToolChange(tool: Tool): void {
	endEdit();

	if (tool === 'specialrights') specialrighthighlights.enable();
	else specialrighthighlights.disable();

	if (tool !== 'placer') guipalette.markPiece(null);
	else guipalette.markPiece(currentPieceType);
}

/** Whether a stroke is in progress. */
function isEditInProgress(): boolean {
	return drawing;
}

/** Whether `tool` is one of the drawing tools. */
function isToolADrawingTool(tool: Tool): boolean {
	return DRAWING_TOOLS.includes(tool);
}

/** Set the piece type to be added to the board */
function setPiece(pieceType: number): void {
	currentPieceType = pieceType;
}

/** The piece type being added to the board. */
function getPiece(): number {
	return currentPieceType;
}

/** Sets the color of pieces being drawn. */
function setColor(color: Player): void {
	currentColor = color;
}

/** The color of pieces being drawn. */
function getColor(): Player {
	return currentColor;
}

// Exports ---------------------------------------------------------------------

export default {
	// Initialization
	init,
	update,
	// API
	onToolChange,
	isEditInProgress,
	isToolADrawingTool,
	setPiece,
	getPiece,
	setColor,
	getColor,
};
