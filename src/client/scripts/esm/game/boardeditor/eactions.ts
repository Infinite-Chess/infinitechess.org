
// src/client/scripts/esm/game/boardeditor/eactions.ts

/**
 * Editor Actions
 * 
 * Contains handlers for the one-time action buttons on the Board Editor UI, such as:
 * 
 * * Reset position
 * * Clear position
 * * Saved positions
 * * Copy notation
 * * Paste notation
 * * Game rules
 * * Start local game from position
 */

import type { ServerGameMoveMessage } from "../../../../../server/game/gamemanager/gameutility";
import type { MetaData } from "../../../../../shared/chess/util/metadata";
import type { EnPassant, GlobalGameState } from "../../../../../shared/chess/logic/state";
import type { VariantOptions } from "../../../../../shared/chess/logic/initvariant";

// @ts-ignore
import statustext from "../gui/statustext";
import gamefile, { Additional, FullGame } from "../../../../../shared/chess/logic/gamefile";
import icnconverter, { _Move_Out, LongFormatIn, LongFormatOut } from "../../../../../shared/chess/logic/icn/icnconverter";
import boardeditor, { Edit } from "./boardeditor";
import organizedpieces, { OrganizedPieces } from "../../../../../shared/chess/logic/organizedpieces";
import boardutil, { Piece } from "../../../../../shared/chess/util/boardutil";
import coordutil, { Coords } from "../../../../../shared/chess/util/coordutil";
import timeutil from "../../../../../shared/util/timeutil";
import docutil from "../../util/docutil";
import gamecompressor, { SimplifiedGameState } from "../chess/gamecompressor";
import gameformulator from "../chess/gameformulator";
import gameloader from "../chess/gameloader";
import gameslot from "../chess/gameslot";
import pastegame from "../chess/pastegame";
import guinavigation from "../gui/guinavigation";
import annotations from "../rendering/highlights/annotations/annotations";
import egamerules from "./egamerules";
import selectiontool from "./tools/selection/selectiontool";


// Actions ----------------------------------------------------------------------


/** Resets the board editor position to the Classical position. */
function reset(): void {
	if (!boardeditor.areInBoardEditor()) return;

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
	const longformat = gamecompressor.compressGamefile(classicalGamefile);
	loadFromLongformat(longformat);
	selectiontool.resetState(); // Clear current selection

	egamerules.setPositionDependentGameRules({ pawnDoublePush: true, castlingWithRooks: true }); // Set original game rules of Classical upon resetting
	
	statustext.showStatus(translations['copypaste'].reset_position);
}

/** Clears the entire board editor position. */
function clearAll(): void {
	if (!boardeditor.areInBoardEditor()) return;

	const gamefile = gameslot.getGamefile()!;
	const mesh = gameslot.getMesh()!;
	const pieces = gamefile.boardsim.pieces;
	const edit: Edit = { changes: [], state: { local: [], global: [] } };
	queueRemovalOfAllPieces(gamefile, edit, pieces);
	egamerules.setGamerulesGUIinfoUponPositionClearing();
	boardeditor.runEdit(gamefile, mesh, edit, true);
	boardeditor.addEditToHistory(edit);
	annotations.onGameUnload(); // Clear all annotations, as when a game is unloaded
	selectiontool.resetState(); // Clear current selection

	statustext.showStatus(translations['copypaste'].clear_position);
}

/**
 * copygame uses the move list instead of the position
 * which doesn't work for the board editor.
 * This function uses the position of pieces on the board.
 */
function save(): void {
	if (!boardeditor.areInBoardEditor()) return;
	
	const gamefile = gameslot.getGamefile()!;
	if (!boardutil.hasAtleastOnePiece(gamefile.boardsim.pieces)) return; // Don't copy empty positions

	const variantOptions = getCurrentPositionInformation();
	const LongFormatIn : LongFormatIn = {
		metadata: {} as MetaData, /** Empty metadata, in order to make copied codes easier to share */
		...variantOptions
	};
	const shortFormatOut = icnconverter.LongToShort_Format(LongFormatIn, { skipPosition: false, compact: true, spaces: false, comments: false, make_new_lines: false, move_numbers: false });
	docutil.copyToClipboard(shortFormatOut);
	statustext.showStatus(translations['copypaste']['copied_position']);
}

/** Loads the position from the clipboard. */
async function load(): Promise<undefined> {
	if (!boardeditor.areInBoardEditor()) return;

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
	selectiontool.resetState(); // Clear current selection
	statustext.showStatus(translations['copypaste'].loaded_position_from_clipboard);
}

/** Starts a local game from the current board editor position, to test play. */
function startLocalGame() : void {
	if (!boardeditor.areInBoardEditor()) return;

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


// Helpers ----------------------------------------------------------------


/** Queues the removal of all pieces from the position. */
function queueRemovalOfAllPieces(gamefile: FullGame, edit: Edit, pieces: OrganizedPieces): void {
	for (const idx of pieces.coords.values()) {
		const pieceToDelete: Piece = boardutil.getDefinedPieceFromIdx(pieces, idx)!;
		boardeditor.queueRemovePiece(gamefile, edit, pieceToDelete);
	};
}

/**
 * Reconstructs the current VariantOptions object (including position, gameRules and state_global) from the current board editor position
 */
function getCurrentPositionInformation(): VariantOptions {

	// Get current game rules and state
	const { gameRules, moveRuleState, enpassantcoords } = egamerules.getCurrentGamerulesAndState();

	// Construct position
	const gamefile = gameslot.getGamefile()!;
	const position = organizedpieces.generatePositionFromPieces(gamefile.boardsim.pieces);

	// Construct state_global
	const specialRights = gamefile.boardsim.state.global.specialRights;
	let enpassant: EnPassant | undefined;
	if (enpassantcoords !== undefined) {
		const playerToMove = egamerules.getPlayerToMove();
		const pawn: Coords = playerToMove === 'white' ? [enpassantcoords[0], enpassantcoords[1] - 1n] : playerToMove === 'black' ? [enpassantcoords[0], enpassantcoords[1] + 1n] : (() => { throw new Error("Invalid player to move"); })(); // Future protection
		enpassant = { square: enpassantcoords, pawn };
	}
	const state_global: GlobalGameState = {
		specialRights,
		moveRuleState,
		enpassant
	};

	// Construct VariantOptions
	const variantOptions: VariantOptions = {
		fullMove: 1,
		gameRules,
		position,
		state_global,
	};

	return variantOptions;
}

/**
 * pastegame loads in a new position by creating a new gamefile and loading it
 * which doesn't work for the board editor.
 * This function simply applies an edit to the position of the pieces on the board.
 * @param longformat - If this optional parameter is defined, it is used as the position to load instead of getting the position from the clipboard
 */
async function loadFromLongformat(longformOut: LongFormatIn): Promise<void> {
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
	queueRemovalOfAllPieces(thisGamefile, edit, pieces);

	// Add all new pieces as dictated by the pasted position
	for (const [coordKey, pieceType] of position.entries()) {
		const coords = coordutil.getCoordsFromKey(coordKey);
		const hasSpecialRights = specialRights.has(coordKey);
		boardeditor.queueAddPiece(thisGamefile, edit, coords, pieceType, hasSpecialRights);
	};

	// Set gamerules object according to pasted game
	// Currently, we do not compute and pass { pawnDoublePush, castlingWithRooks } here as it might be unnecessarily expensive to compute this when pasting a game
	egamerules.setGamerulesGUIinfo(longformOut.gameRules, stateGlobal, { edit });

	boardeditor.runEdit(thisGamefile, mesh, edit, true);
	boardeditor.addEditToHistory(edit);
	annotations.onGameUnload(); // Clear all annotations, as when a game is unloaded

	guinavigation.callback_Expand(); // Virtually press the "Expand to fit all" button after position is loaded
}


// Exports --------------------------------------------------------------------


export default {
	reset,
	clearAll,
	save,
	load,
	startLocalGame,
};
