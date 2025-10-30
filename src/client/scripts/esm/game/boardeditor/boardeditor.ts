
// src/client/scripts/esm/game/boardeditor/boardeditor.ts

/*
 * This script handles the Board Editor logic
 */


import boardchanges from '../../../../../shared/chess/logic/boardchanges.js';
import gameslot from '../chess/gameslot.js';
import coordutil from '../../../../../shared/chess/util/coordutil.js';
import icnconverter from '../../../../../shared/chess/logic/icn/icnconverter.js';
import docutil from '../../util/docutil.js';
import selection from '../chess/selection.js';
import state from '../../../../../shared/chess/logic/state.js';
import boardutil from '../../../../../shared/chess/util/boardutil.js';
import specialrighthighlights from '../rendering/highlights/specialrighthighlights.js';
import { Mouse } from '../input.js';
import guiboardeditor from '../gui/guiboardeditor.js';
import { players, rawTypes } from '../../../../../shared/chess/util/typeutil.js';
import mouse from '../../util/mouse.js';
import movesequence from '../chess/movesequence.js';
import annotations from '../rendering/highlights/annotations/annotations.js';
import movepiece from '../../../../../shared/chess/logic/movepiece.js';
import guinavigation from '../gui/guinavigation.js';
import organizedpieces from '../../../../../shared/chess/logic/organizedpieces.js';
import arrows from '../rendering/arrows/arrows.js';
import gameformulator from '../chess/gameformulator.js';
import gamecompressor from '../chess/gamecompressor.js';
import gamefile from '../../../../../shared/chess/logic/gamefile.js';
import pastegame from '../chess/pastegame.js';
import jsutil from '../../../../../shared/util/jsutil.js';
import timeutil from '../../../../../shared/util/timeutil.js';
import winconutil from '../../../../../shared/chess/util/winconutil.js';
import selectiontool from './tools/selection/selectiontool.js';
import gameloader from '../chess/gameloader.js';
// @ts-ignore
import statustext from '../gui/statustext.js';

// Type Definitions -------------------------------------------------------------

import type { Coords } from '../../../../../shared/chess/util/coordutil.js';
import type { Edit } from '../../../../../shared/chess/logic/movepiece.js';
import type { Piece } from '../../../../../shared/chess/util/boardutil.js';
import type { Mesh } from '../rendering/piecemodels.js';
import type { Player, PlayerGroup, RawType } from '../../../../../shared/chess/util/typeutil.js';
import type { Additional, Board, FullGame } from '../../../../../shared/chess/logic/gamefile.js';
import type { _Move_Compact, _Move_Out, LongFormatIn, LongFormatOut } from '../../../../../shared/chess/logic/icn/icnconverter.js';
import type { SimplifiedGameState } from '../chess/gamecompressor.js';
import type { ServerGameMoveMessage } from '../../../../../server/game/gamemanager/gameutility.js';
import type { VariantOptions } from '../../../../../shared/chess/logic/initvariant.js';
import type { GameRules } from '../../../../../shared/chess/variants/gamerules.js';
import type { EnPassant, GlobalGameState } from '../../../../../shared/chess/logic/state.js';
import type { MetaData } from '../../../../../shared/chess/util/metadata.js';


type Tool = (typeof validTools)[number];


// Variables --------------------------------------------------------------------

/** All tools that can be used in the board editor. */
const validTools = ["normal", "placer", "eraser", "gamerules", "specialrights", "selection-tool"] as const;
/** All tools that support drawing. */
const drawingTools: Tool[] = ["placer", "eraser", "specialrights"];

/** Whether we are currently using the editor. */
let inBoardEditor = false;

let currentColor: Player = players.WHITE;
let currentPieceType: number = rawTypes.VOID;
let currentTool: Tool = "normal";


/**
 * Changes are stored in `thisEdit` until the user releases the button.
 * Grouping changes together allow the user to undo an entire
 * brush stroke at once instead of one piece at a time.
 */
let thisEdit: Edit | undefined;
/** The list of all edits the user has made. */
let edits: Array<Edit> | undefined;
let indexOfThisEdit: number | undefined = 0;
/** The ID of the pointer currently being used for drawing an edit with a DRAWING tool (excludes Selection tool) */
let drawingToolPointerId: string | undefined;

/** Whether a drawing stroke is currently ongoing. */
let drawing = false;
/** The last coordinate the stroke is over. */
let previousSquare: Coords | undefined;
/** Whether special rights are currently being added or removed with the current drawing stroke. Undefined if neither. */
let addingSpecialRights: boolean | undefined;


/** Virtual game rules object for the position */
let gamerulesGUIinfo: GameRulesGUIinfo = {
	playerToMove: 'white',
	winConditions: [icnconverter.default_win_condition]
};

/** Type encoding information for the game rules object of the editor position */
interface GameRulesGUIinfo {
    playerToMove: 'white' | 'black';
	enPassant?: {
		x: bigint;
		y: bigint;
	};
	moveRule?: {
		current: number;
		max: number;
	};
	promotionRanks?: {
		white?: bigint[];
		black?: bigint[];
	};
	promotionsAllowed?: RawType[];
	winConditions: string[];
}

// Functions ------------------------------------------------------------------------

/** 
 * Initializes the board editor.
 * Should be called AFTER loading the game logically.
 */
function initBoardEditor(): void {
	inBoardEditor = true;
	edits = [];
	indexOfThisEdit = 0;

	setTool("normal");
	setColor(players.WHITE);
	setPiece(rawTypes.VOID);

	guiboardeditor.markTool(currentTool);
	guiboardeditor.updatePieceColors(currentColor);
	guiboardeditor.markPiece(currentPieceType);

	// Set gamerulesGUIinfo object according to pasted game
	const gamefile = jsutil.deepCopyObject(gameslot.getGamefile()!);
	gamefile.basegame.gameRules.winConditions[players.WHITE] = [icnconverter.default_win_condition];
	gamefile.basegame.gameRules.winConditions[players.BLACK] = [icnconverter.default_win_condition];
	setGamerulesGUIinfo(gamefile.basegame.gameRules, gamefile.boardsim.state.global);
}

function closeBoardEditor(): void {
	inBoardEditor = false;
	specialrighthighlights.disable();
	drawing = false;
	addingSpecialRights = undefined;
	thisEdit = undefined;
	edits = undefined;
	indexOfThisEdit = undefined;
	previousSquare = undefined;
	drawingToolPointerId = undefined;
	selectiontool.resetState();
}

function areInBoardEditor(): boolean {
	return inBoardEditor;
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

/** Change the tool being used. */
function setTool(tool: string): void {
	if (!validTools.includes(tool as Tool)) return;
	currentTool = tool as Tool;
	endEdit();

	// Prevents you from being able to draw while a piece is selected.
	if (drawingTools.includes(currentTool)) selection.unselectPiece();

	if (tool === "specialrights") specialrighthighlights.enable();
	else specialrighthighlights.disable();

	guiboardeditor.markTool(tool);
	if (tool !== "placer") guiboardeditor.markPiece(null);
	else guiboardeditor.markPiece(currentPieceType);

	// Reset selection tool state when switching to another tool
	selectiontool.resetState();
}

function getTool(): typeof currentTool {
	return currentTool;
}

/** Whether any of the editor tools are actively using the left mouse button. */
function isLeftMouseReserved(): boolean {
	return inBoardEditor && drawingTools.includes(currentTool) || currentTool === "selection-tool";
}

function canUndo(): boolean {
	// comparing undefined always returns false
	return indexOfThisEdit! > 0;
}

function canRedo(): boolean {
	// comparing undefined always returns false
	return indexOfThisEdit! < edits?.length!;
}

function beginEdit(): void {
	drawing = true;
	thisEdit = { changes:[], state: {local: [], global: []} };
	// Pieces must be unselected before they are modified
	selection.unselectPiece();
}

function endEdit(): void {
	drawing = false;
	addingSpecialRights = undefined;
	previousSquare = undefined;
	drawingToolPointerId = undefined;
	if (thisEdit !== undefined) addEditToHistory(thisEdit);
	thisEdit = undefined;
}

/** Cancels the current edit, undoing any changes made during the stroke. */
function cancelEdit(): void {
	if (!inBoardEditor || !drawing || thisEdit === undefined) return;

	const gamefile = gameslot.getGamefile()!;
	const mesh = gameslot.getMesh()!;
	// Undo the changes made during this edit
	runEdit(gamefile, mesh, thisEdit, false);

	// Update state
	drawing = false;
	addingSpecialRights = undefined;
	previousSquare = undefined;
	drawingToolPointerId = undefined;
	thisEdit = undefined;
}

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

function update(): void {
	if (!inBoardEditor) return;

	// Handle starting and ending the drawing state
	if (drawingTools.includes(currentTool)) {
		if (mouse.isMouseDown(Mouse.LEFT) && !drawing && !arrows.areHoveringAtleastOneArrow()) {
			mouse.claimMouseDown(Mouse.LEFT); // Remove the pointer down so other scripts don't use it
			mouse.cancelMouseClick(Mouse.LEFT); // Cancel any potential future click so other scripts don't use it
			drawingToolPointerId = mouse.getMouseId(Mouse.LEFT)!;
			beginEdit();
		}
		else if (!mouse.isMouseHeld(Mouse.LEFT) && drawing) return endEdit();
	}

	// Update selection tool, if that is active
	if (currentTool === "selection-tool") {
		selectiontool.update();
		return;
	}

	// If not drawing, or if the current tool doesn't support drawing, there's nothing more to do
	if (!drawing || !drawingTools.includes(currentTool)) return;

	const gamefile = gameslot.getGamefile()!;
	const mesh = gameslot.getMesh()!;
	const coords = mouse.getTileMouseOver_Integer();
	if (coords === undefined) return;
	if (previousSquare !== undefined && coordutil.areCoordsEqual(coords, previousSquare)) return;
	previousSquare = coords;

	const pieceHovered = boardutil.getPieceFromCoords(gamefile.boardsim.pieces, coords);
	const edit: Edit = { changes: [], state: { local: [], global: [] } };

	switch (currentTool) {
		case "placer":
			queueAddPiece(gamefile, edit, pieceHovered, coords, currentPieceType);
			break;
		case "eraser":
			queueRemovePiece(gamefile, edit, pieceHovered);
			break;
		case "specialrights":
			queueToggleSpecialRight(gamefile, edit, pieceHovered);
			break;
		default:
			throw Error("Tried to draw with a non-drawing tool.");
	}

	if (edit.changes.length === 0 && edit.state.local.length === 0 && edit.state.global.length === 0) return;
	runEdit(gamefile, mesh, edit, true);
	thisEdit!.changes.push(...edit.changes);
	thisEdit!.state.local.push(...edit.state.local);
	thisEdit!.state.global.push(...edit.state.global);
}

function queueToggleSpecialRight(gamefile: FullGame, edit: Edit, pieceHovered: Piece | undefined): void {
	if (pieceHovered === undefined) return;
	const coordsKey = coordutil.getKeyFromCoords(pieceHovered.coords);
	const current = gamefile.boardsim.state.global.specialRights.has(coordsKey);
	const future = !current;

	if (addingSpecialRights === undefined) addingSpecialRights = future;
	else if (addingSpecialRights !== future) return;

	state.createSpecialRightsState(edit, coordsKey, current, future);
}

function queueAddPiece(gamefile: FullGame, edit: Edit, pieceHovered: Piece | undefined, coords: Coords, type: number): void {
	if (pieceHovered?.type === type) return; // do not do anything if new piece would be equal to old piece
	if (pieceHovered !== undefined) queueRemovePiece(gamefile, edit, pieceHovered);
	const piece: Piece = { type, coords, index:-1 };
	boardchanges.queueAddPiece(edit.changes, piece);
}

function queueAddPieceWithSpecialRights(gamefile: FullGame, edit: Edit, pieceHovered: Piece | undefined, coords: Coords, type: number): void {
	const coordsKey = coordutil.getKeyFromCoords(coords);
	const current = gamefile.boardsim.state.global.specialRights.has(coordsKey);
	if (pieceHovered?.type === type && current) return; // do not do anything if new piece would be equal to old piece, and old piece already has special rights
	if (pieceHovered !== undefined) queueRemovePiece(gamefile, edit, pieceHovered);
	const piece: Piece = { type, coords, index:-1 };
	boardchanges.queueAddPiece(edit.changes, piece);
	state.createSpecialRightsState(edit, coordsKey, current, true);
}

function queueRemovePiece(gamefile: FullGame, edit: Edit, pieceHovered: Piece | undefined): void {
	if (!pieceHovered) return;
	const coordsKey = coordutil.getKeyFromCoords(pieceHovered.coords);
	// Remove the piece
	boardchanges.queueDeletePiece(edit.changes, false, pieceHovered);
	// Remove its special right
	const current = gamefile.boardsim.state.global.specialRights.has(coordsKey);
	state.createSpecialRightsState(edit, coordutil.getKeyFromCoords(pieceHovered.coords), current, false);
}

/** Updates the en passant square in the current gamefile, needed for display purposes */
function setEnpassantState(coord: Coords | undefined) : void {
	const enpassant: EnPassant | undefined = (coord !== undefined) ? { square: coord, pawn: [coord[0], coord[1] - 1n] } : undefined; // dummy enpassant object
	const edit: Edit = { changes: [], state: { local: [], global: [] } }; // dummy edit object

	const gamefile = gameslot.getGamefile()!;
	const mesh = gameslot.getMesh()!;
	state.createEnPassantState(edit, gamefile.boardsim.state.global.enpassant, enpassant);
	runEdit(gamefile, mesh, edit, true);
}

/** Updates the promotion lines in the current gamefile, needed for display purposes */
function updatePromotionLines(promotionRanks : { white?: bigint[]; black?: bigint[] } | undefined ) : void {
	const gamefile = gameslot.getGamefile()!;
	if (promotionRanks === undefined) gamefile.basegame.gameRules.promotionRanks = undefined;
	else {
		gamefile.basegame.gameRules.promotionRanks = {};
		gamefile.basegame.gameRules.promotionRanks[players.WHITE] = (promotionRanks.white !== undefined ? promotionRanks.white : []);
		gamefile.basegame.gameRules.promotionRanks[players.BLACK] = (promotionRanks.black !== undefined ? promotionRanks.black : []);
	}
}

function clearAll(): void {
	if (!inBoardEditor) throw Error("Cannot clear board when we're not using the board editor.");
	const gamefile = gameslot.getGamefile()!;
	const mesh = gameslot.getMesh()!;
	const pieces = gamefile.boardsim.pieces;
	const edit: Edit = { changes: [], state: { local: [], global: [] } };
	for (const idx of pieces.coords.values()) {
		const pieceToDelete = boardutil.getPieceFromIdx(pieces, idx);
		queueRemovePiece(gamefile, edit, pieceToDelete);
	};
	runEdit(gamefile, mesh, edit, true);
	addEditToHistory(edit);
	annotations.onGameUnload(); // Clear all annotations, as when a game is unloaded

	statustext.showStatus(translations['copypaste'].clear_position);
}

function reset(): void {
	if (!inBoardEditor) throw Error("Cannot reset board when we're not using the board editor.");

	const { UTCDate, UTCTime } = timeutil.convertTimestampToUTCDateUTCTime(Date.now());
	const metadata : MetaData = {
		Variant: "Classical",
		Event: "Position created using ingame board editor",
		Site: 'https://www.infinitechess.org/',
		TimeControl: '-',
		Round: '-',
		UTCDate,
		UTCTime
	};
	const classicalGamefile = gamefile.initFullGame(metadata);
	const longformat = gamecompressor.compressGamefile(classicalGamefile) as LongFormatOut;
	loadFromLongformat(longformat);
	statustext.showStatus(translations['copypaste'].reset_position);
}

function undo(): void {
	if (!inBoardEditor) throw Error("Cannot undo edit when we're not using the board editor.");
	if (thisEdit !== undefined) return; // do not allow undoing or redoing while currently making an edit
	if (indexOfThisEdit! <= 0) return;
	const gamefile = gameslot.getGamefile()!;
	const mesh = gameslot.getMesh()!;
	indexOfThisEdit!--;
	runEdit(gamefile, mesh, edits![indexOfThisEdit!]!, false);
	guinavigation.update_EditButtons();
}

function redo(): void {
	if (!inBoardEditor) throw Error("Cannot redo edit when we're not using the board editor.");
	if (thisEdit !== undefined) return; // do not allow undoing or redoing while currently making an edit
	if (indexOfThisEdit! >= edits!.length) return;
	const gamefile = gameslot.getGamefile()!;
	const mesh = gameslot.getMesh()!;
	runEdit(gamefile, mesh, edits![indexOfThisEdit!]!, true);
	indexOfThisEdit!++;
	guinavigation.update_EditButtons();
}

/** Starts a local game from the current board editor position, to test play. */
function startLocalGame() : void {
	if (!inBoardEditor) throw Error("Cannot start local game from board editor when we're not using the board editor.");

	const variantOptions = getCurrentPositionInformation();
	if (variantOptions.position.size === 0) {
		statustext.showStatus("Cannot start local game from empty position!", true);
		return;
	}

	const { UTCDate, UTCTime } = timeutil.convertTimestampToUTCDateUTCTime(Date.now());
	const metadata : MetaData = {
		Event: "Position created using ingame board editor",
		Site: 'https://www.infinitechess.org/',
		TimeControl: '-',
		Round: '-',
		UTCDate,
		UTCTime
	};

	gameloader.unloadGame();

	gameloader.startCustomLocalGame({
		metadata,
		additional: {
			variantOptions
		}
	});
}

/**
 * copygame uses the move list instead of the position
 * which doesn't work for the board editor.
 * This function uses the position of pieces on the board.
 */
function save(): void {
	if (!inBoardEditor) throw Error("Cannot save position when we're not using the board editor.");

	const variantOptions = getCurrentPositionInformation();
	const LongFormatIn : LongFormatIn = {
		metadata: {} as MetaData, /** Empty metadata, in order to make copied codes easier to share */
		...variantOptions
	};
	const shortFormatOut = icnconverter.LongToShort_Format(LongFormatIn, { skipPosition: false, compact: true, spaces: false, comments: false, make_new_lines: false, move_numbers: false });
	docutil.copyToClipboard(shortFormatOut);
	statustext.showStatus(translations['copypaste']['copied_position']);
}

/**
 * Reconstructs the current VariantOptions object (including position, gameRules and state_global) from the current board editor position
 */
function getCurrentPositionInformation(): VariantOptions {
	// Construct gameRules
	const turnOrder = gamerulesGUIinfo.playerToMove === "white" ? [players.WHITE, players.BLACK] : gamerulesGUIinfo.playerToMove === "black" ? [players.BLACK, players.WHITE] : (() => { throw Error("Invalid player to move"); })(); // Future protection
	const moveRule = gamerulesGUIinfo.moveRule !== undefined ? gamerulesGUIinfo.moveRule.max : undefined;
	const winConditions = { [players.WHITE]: gamerulesGUIinfo.winConditions, [players.BLACK]: gamerulesGUIinfo.winConditions };
	let promotionRanks : PlayerGroup<bigint[]> | undefined = undefined;
	let promotionsAllowed : PlayerGroup<RawType[]> | undefined = undefined;
	if (gamerulesGUIinfo.promotionsAllowed !== undefined && gamerulesGUIinfo.promotionRanks !== undefined) {
		promotionsAllowed = {};
		promotionRanks = {};
		if (gamerulesGUIinfo.promotionRanks.white !== undefined && gamerulesGUIinfo.promotionRanks.white.length !== 0) {
			promotionRanks[players.WHITE] = gamerulesGUIinfo.promotionRanks.white;
			promotionsAllowed[players.WHITE] = gamerulesGUIinfo.promotionsAllowed;
		}
		if (gamerulesGUIinfo.promotionRanks.black !== undefined && gamerulesGUIinfo.promotionRanks.black.length !== 0) {
			promotionRanks[players.BLACK] = gamerulesGUIinfo.promotionRanks.black;
			promotionsAllowed[players.BLACK] = gamerulesGUIinfo.promotionsAllowed;
		}
	}
	const gameRules: GameRules = {
		turnOrder,
		moveRule,
		promotionRanks,
		promotionsAllowed,
		winConditions
	};

	// Construct position
	const gamefile = gameslot.getGamefile()!;
	const position = organizedpieces.generatePositionFromPieces(gamefile.boardsim.pieces);

	// Construct state_global
	const specialRights = gamefile.boardsim.state.global.specialRights;
	const moveRuleState = gamerulesGUIinfo.moveRule !== undefined ? gamerulesGUIinfo.moveRule.current : undefined;
	const enpassantcoords: Coords | undefined = gamerulesGUIinfo.enPassant !== undefined ? [gamerulesGUIinfo.enPassant.x, gamerulesGUIinfo.enPassant.y] : undefined;
	const enpassant: EnPassant | undefined = enpassantcoords !== undefined ? { square: enpassantcoords, pawn: [enpassantcoords[0], enpassantcoords[1] - 1n] } : undefined; // dummy enpassant object
	const state_global: GlobalGameState = {
		specialRights,
		moveRuleState,
		enpassant
	};

	// Construct VariantOptions
	const variantOptions: VariantOptions = {
		fullMove : 1,
		gameRules,
		state_global,
		position
	};

	return variantOptions;
}

/** Loads the position from the clipboard. */
async function load(): Promise<undefined> {
	if (!inBoardEditor) throw Error("Cannot load position when we're not using the board editor.");

	let longformOut: LongFormatOut;

	// Do we have clipboard permission?
	let clipboard: string;
	try {
		clipboard = await navigator.clipboard.readText();
	} catch (error) {
		const message: string = translations['copypaste'].clipboard_denied;
		statustext.showStatus((message + "\n" + error), true);
		return;
	}

	// Convert clipboard text to longformat
	try {
		longformOut = icnconverter.ShortToLong_Format(clipboard);
	} catch (e) {
		console.error(e);
		statustext.showStatus(translations['copypaste'].clipboard_invalid, true);
		return;
	}

	loadFromLongformat(longformOut);
	statustext.showStatus(translations['copypaste'].loaded_position_from_clipboard);
}

/**
 * pastegame loads in a new position by creating a new gamefile and loading it
 * which doesn't work for the board editor.
 * This function simply applies an edit to the position of the pieces on the board.
 * @param longformat - If this optional parameter is defined, it is used as the position to load instead of getting the position from the clipboard
 */
async function loadFromLongformat(longformOut: LongFormatOut): Promise<void> {
	// If the variant has been translated, the variant metadata needs to be converted from language-specific to internal game code else keep it the same
	if (longformOut.metadata.Variant) longformOut.metadata.Variant = gameformulator.convertVariantFromSpokenLanguageToCode(longformOut.metadata.Variant) || longformOut.metadata.Variant;
	
	let { position, specialRights } = pastegame.getPositionAndSpecialRightsFromLongFormat(longformOut);
	let stateGlobal = longformOut.state_global;

	// If longformat contains moves, then we construct a FullGame object and use it to fast forward to the final position
	// If it contains no moves, then we skip all that, thus saving time
	if (longformOut.moves && longformOut.moves.length !== 0) {
		const state_global = {...longformOut.state_global, specialRights};
		const variantOptions: VariantOptions = {
			position,
			state_global,
			fullMove: longformOut.fullMove,
			gameRules: longformOut.gameRules
		};
		const additional: Additional = { 
			variantOptions,
			moves: longformOut.moves.map( (m: _Move_Out) => {
				const move: ServerGameMoveMessage = { compact: m.compact };
				return move;
			} ) 
		};
		const loadedGamefile = gamefile.initFullGame(longformOut.metadata, additional);
		const gamestate: SimplifiedGameState = {
			position,
			state_global,
			fullMove: longformOut.fullMove,
			turnOrder: longformOut.gameRules.turnOrder
		};
		const new_gamestate = gamecompressor.GameToPosition(gamestate, loadedGamefile.boardsim.moves, loadedGamefile.boardsim.moves.length);
		position = new_gamestate.position;
		specialRights = new_gamestate.state_global.specialRights!;
		stateGlobal = new_gamestate.state_global;
	}
	
	const thisGamefile = gameslot.getGamefile()!;
	const mesh = gameslot.getMesh()!;
	const pieces = thisGamefile.boardsim.pieces;
	const edit: Edit = { changes: [], state: { local: [], global: [] } };

	// Remove all current pieces from position
	for (const idx of pieces.coords.values()) {
		const pieceToDelete = boardutil.getPieceFromIdx(pieces, idx);
		queueRemovePiece(thisGamefile, edit, pieceToDelete);
	};

	// Keep track of all squares where special rights got removed
	const specialRightsRemoved = edit.state.global.reduce<{ [key: string]: number }>((acc, item, index) => {
		if (item.type === 'specialrights' && !item.future) acc[item.coordsKey] = index;
		return acc;
	}, {});
	// This set will keep track of the problematic indices in edit.state.global where special rights got unnecessarily removed
	const unnecessaryGlobalStateChangeIndices = new Set<number>();

	// Add all new pieces as dictated by the pasted position
	for (const [coordKey, pieceType] of position.entries()) {
		const coords = coordutil.getCoordsFromKey(coordKey);
		if (specialRights.has(coordKey)) {
			if (coordKey in specialRightsRemoved) unnecessaryGlobalStateChangeIndices.add(specialRightsRemoved[coordKey]!);
			queueAddPieceWithSpecialRights(thisGamefile, edit, undefined, coords, pieceType);
		}
		else queueAddPiece(thisGamefile, edit, undefined, coords, pieceType);
	};

	// Filter out all unnecessary special rights removals from the edit from the first step
	for (let i = Math.max(...unnecessaryGlobalStateChangeIndices); i >= 0; i--) {
		if (unnecessaryGlobalStateChangeIndices.has(i)) {
			edit.state.global.splice(i, 1);
		}
	}

	runEdit(thisGamefile, mesh, edit, true);
	addEditToHistory(edit);
	annotations.onGameUnload(); // Clear all annotations, as when a game is unloaded

	setGamerulesGUIinfo(longformOut.gameRules, stateGlobal); // Set gamerules object according to pasted game

	guinavigation.callback_Expand(); // Virtually press the "Expand to fit all" button after position is loaded
}

/** Update the game rules object keeping track of all current game rules by using new gameRules and state_global */
function setGamerulesGUIinfo(gameRules: GameRules, state_global: Partial<GlobalGameState>) : void {
	if (gameRules.turnOrder[0] === players.WHITE) gamerulesGUIinfo.playerToMove = "white";
	else gamerulesGUIinfo.playerToMove = "black";

	if (state_global.enpassant !== undefined) {
		gamerulesGUIinfo.enPassant = {
			x : state_global.enpassant.square[0],
			y : state_global.enpassant.square[1],
		};
	} else {
		gamerulesGUIinfo.enPassant = undefined;
	}

	if (gameRules.moveRule !== undefined) {
		gamerulesGUIinfo.moveRule = {
			current: state_global.moveRuleState || 0,
			max: gameRules.moveRule
		};
	} else {
		gamerulesGUIinfo.moveRule = undefined;
	}

	if (gameRules.promotionRanks !== undefined) {
		gamerulesGUIinfo.promotionRanks = {
			white: gameRules.promotionRanks[players.WHITE],
			black: gameRules.promotionRanks[players.BLACK]
		};
	} else {
		gamerulesGUIinfo.promotionRanks = undefined;
	}

	if (gameRules.promotionsAllowed !== undefined) {
		gamerulesGUIinfo.promotionsAllowed = [...new Set([
			...gameRules.promotionsAllowed[players.WHITE] || [],
			...gameRules.promotionsAllowed[players.BLACK] || []
		])];
		if (gamerulesGUIinfo.promotionsAllowed.length === 0) gamerulesGUIinfo.promotionsAllowed = undefined;
	} else {
		gamerulesGUIinfo.promotionsAllowed = undefined;
	}

	gamerulesGUIinfo.winConditions = [...new Set([
		...gameRules.winConditions[players.WHITE] || [icnconverter.default_win_condition],
		...gameRules.winConditions[players.BLACK] || [icnconverter.default_win_condition]
	])].filter(wincon => winconutil.isWinConditionValid(wincon));

	// Set en passant state for rendering purposes
	if (gamerulesGUIinfo.enPassant !== undefined) setEnpassantState([gamerulesGUIinfo.enPassant.x, gamerulesGUIinfo.enPassant.y]);
	else setEnpassantState(undefined);

	// Update the promotionlines in the gamefile for rendering purposes
	updatePromotionLines(gamerulesGUIinfo.promotionRanks);

	guiboardeditor.setGameRules(gamerulesGUIinfo); // Update the game rules GUI
}

/** Update the game rules object keeping track of all current game rules by using changes from guiboardeditor */
function updateGamerulesGUIinfo(new_gamerulesGUIinfo : GameRulesGUIinfo) : void {
	gamerulesGUIinfo = new_gamerulesGUIinfo;
}

/**
 * Similar to {@link movesequence.makeMove}, but doesn't push the move to the game's
 * moves list, nor update gui, clocks, or do game over checks, nor the moveIndex property updated.
 */
function makeMoveEdit(gamefile: FullGame, mesh: Mesh | undefined, moveDraft: _Move_Compact): Edit {
	const edit = generateMoveEdit(gamefile.boardsim, moveDraft);

	movepiece.applyEdit(gamefile, edit, true, true); // forward & global are always true
	if (mesh) movesequence.runMeshChanges(gamefile.boardsim, mesh, edit, true);

	addEditToHistory(edit);

	return edit;
}

/**
 * Similar to {@link movepiece.generateMove}, but specifically for editor moves,
 * which don't execute special moves, nor are appeneded to the game's moves list,
 * nor the gamefile's moveIndex property updated.
 */
function generateMoveEdit(boardsim: Board, moveDraft: _Move_Compact): Edit {
	const piece = boardutil.getPieceFromCoords(boardsim.pieces, moveDraft.startCoords);
	if (!piece) throw Error(`Cannot generate move edit because no piece exists at coords ${JSON.stringify(moveDraft.startCoords)}.`);

	// Initialize the state, and change list, as empty for now.
	const edit: Edit = {
		changes: [],
		state: { local: [], global: [] },
	};
	
	movepiece.calcMovesChanges(boardsim, piece, moveDraft, edit); // Move piece regularly (no specials)
	
	// Queue the state change transfer of this edit's special right to its new destination.
	const startCoordsKey = coordutil.getKeyFromCoords(moveDraft.startCoords);
	const endCoordsKey = coordutil.getKeyFromCoords(moveDraft.endCoords);
	const hasSpecialRight = boardsim.state.global.specialRights.has(startCoordsKey);
	const destinationHasSpecialRight = boardsim.state.global.specialRights.has(endCoordsKey);
	state.createSpecialRightsState(edit, startCoordsKey, hasSpecialRight, false); // Delete the special right from the startCoords, if it exists
	state.createSpecialRightsState(edit, endCoordsKey, destinationHasSpecialRight, hasSpecialRight); // Transfer the special right to the endCoords, if it exists
	
	return edit;
}

/** If the given pointer is currently being used by a drawing tool for an edit, this stops using it. */
function stealPointer(pointerIdToSteal: string): void {
	if (currentTool === 'selection-tool') {
		selectiontool.stealPointer(pointerIdToSteal); // Let selection tool also try to steal the pointer
	} else {
		if (drawingToolPointerId !== pointerIdToSteal) return; // Not the pointer drawing the edit, don't stop using it.
		cancelEdit();
	}
}

/** Renders any graphics of the active tool, if we are in the board editor. */
function render(): void {
	if (!inBoardEditor) return;

	// Render selection-tool graphics, if that is active
	if (currentTool === "selection-tool") selectiontool.render();
}

export type {
	Edit
};

export default {
	areInBoardEditor,
	initBoardEditor,
	closeBoardEditor,
	setPiece,
	getPiece,
	setColor,
	getColor,
	setTool,
	getTool,
	isLeftMouseReserved,
	update,
	canUndo,
	canRedo,
	undo,
	redo,
	startLocalGame,
	save,
	load,
	clearAll,
	reset,
	makeMoveEdit,
	setEnpassantState,
	updatePromotionLines,
	updateGamerulesGUIinfo,
	stealPointer,
	render,
};

export type {
	GameRulesGUIinfo,
};