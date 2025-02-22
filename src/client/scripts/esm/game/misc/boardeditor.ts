
import boardchanges, { Change, Piece } from '../../chess/logic/boardchanges.js';
import { meshChanges } from '../chess/graphicalchanges.js';
import { Coords } from '../../chess/util/coordutil.js';
import { Move } from '../../chess/logic/movepiece.js';
// @ts-ignore
import input from '../input.js';
// @ts-ignore
import board from '../rendering/board.js';
import gameslot from '../chess/gameslot.js';
import coordutil from '../../chess/util/coordutil.js';
import colorutil from '../../chess/util/colorutil.js';
import gamefileutility from '../../chess/util/gamefileutility.js';
import guinavigation from '../gui/guinavigation.js';
// @ts-ignore
import formatconverter from '../../chess/logic/formatconverter.js';
import docutil from '../../util/docutil.js';
import selection from '../chess/selection.js';

/**
 * Problems:
 * - Pieces sometimes don't display when drawn especially kings.
 * - Pieces that were not in the starting position cannot be used.
 * - ctrl-c doesn't work because copypastgame doesn't recognise the custom "moves".
 */


let currentColor = "white";
let currentTool: string = "queens";

let changesThisStoke: Array<Change> = [];
let drawing = false;
let previousSquare: Coords | undefined;

function beginStroke() {
	drawing = true;
	previousSquare = undefined;
	// Pieces must be unselected before they are modified
	selection.unselectPiece();
}

function endStroke() {
	const gamefile = gameslot.getGamefile()!;
	// I know this isn't how moves are intended to be used
	// but this allows us to undo edits.
	gamefile.moves.length = gamefile.moveIndex + 1;
	const strokeAsMove: Move = {
		startCoords: [0, 0],
		endCoords: [0, 0],
		type: "",
		changes: changesThisStoke,
		state: {
			local: [],
			global: []
		},
		generateIndex: gamefile.moveIndex + 1,
		compact:"",
		flags: {
			check: false,
			mate: false,
			capture: false
		}
	}
	gamefile.moves.push(strokeAsMove);
	gamefile.moveIndex++;
	drawing = false;
	changesThisStoke = [];
	guinavigation.update_MoveButtons();
}

function update() {
	let gamefile = gameslot.getGamefile();
	if (!gamefile) return;
	
	if (drawing) {
		if (!input.isMouseHeld_Right()) return endStroke();
	} else {
		if (input.isMouseDown_Right()) beginStroke();
		else return;
	}
	
	const coords = board.getTileMouseOver().tile_Int as Coords;
	if (coordutil.areCoordsEqual(coords, previousSquare)) return;
	previousSquare = coords;
	
	let changes: Array<Change> = [];
	
	const pieceToRemove = gamefileutility.getPieceAtCoords(gamefile, coords);
	if (pieceToRemove) boardchanges.queueDeletePiece(changes, pieceToRemove, false);
	
	if (currentTool !== "eraser") {
		const type = currentTool + colorutil.getColorExtensionFromColor(currentColor);
		const piece: Piece = { type, coords, index: (undefined as any) as number};
		boardchanges.queueAddPiece(changes, piece);
	}
	
	boardchanges.applyChanges(gamefile, changes, boardchanges.changeFuncs.forward, true);
	boardchanges.applyChanges(gamefile, changes, meshChanges.forward, true);
	changesThisStoke.push(...changes);
}

function setTool(tool: string) {
	if (tool === "save") return save();
	if (tool === "color") return toggleColor();
	currentTool = tool;
}

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

function toggleColor() {
	currentColor = colorutil.getOppositeColor(currentColor);
}

export default {
	update,
	setTool,
}