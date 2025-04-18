
/** 
 * Type Definitions 
 * @typedef {import('../../chess/logic/gamefile.js').gamefile} gamefile
 */

// Import Start
import onlinegame from '../misc/onlinegame/onlinegame.js';
import localstorage from '../../util/localstorage.js';
import enginegame from '../misc/enginegame.js';
import formatconverter from '../../chess/logic/formatconverter.js';
import backcompatible from '../../chess/logic/backcompatible.js';
import statustext from '../gui/statustext.js';
import docutil from '../../util/docutil.js';
import winconutil from '../../chess/util/winconutil.js';
import gameslot from './gameslot.js';
import gameloader from './gameloader.js';
import coordutil from '../../chess/util/coordutil.js';
import typeutil from '../../chess/util/typeutil.js';
import { players, rawTypes } from '../../chess/util/typeutil.js';
import guipause from '../gui/guipause.js';
import gamecompressor from './gamecompressor.js';
import organizedpieces from '../../chess/logic/organizedpieces.js';
import gameformulator from './gameformulator.js';
import websocket from '../websocket.js';
import boardutil from '../../chess/util/boardutil.js';
// Import End

"use strict";

/**
 * This script handles copying and pasting games
 */

/**
 * A list of metadata properties that are retained from the current game when pasting an external game.
 * These will overwrite the pasted game's metadata with the current game's metadata.
 */
const retainMetadataWhenPasting = ['White','Black','WhiteID','BlackID','TimeControl','Event','Site','Round'];

/**
 * Copies the current game to the clipboard in ICN notation.
 * This callback is called when the "Copy Game" button is pressed.
 * @param {boolean} copySinglePosition - If true, only copy the current position, not the entire game. It won't have the moves list.
 */
function copyGame(copySinglePosition) {
	const gamefile = gameslot.getGamefile();
	const Variant = gamefile.metadata.Variant;

	const primedGamefile = gamecompressor.compressGamefile(gamefile, copySinglePosition);
	const largeGame = Variant === 'Omega_Squared' || Variant === 'Omega_Cubed' || Variant === 'Omega_Fourth';
	const specifyPosition = !largeGame;
	const shortformat = formatconverter.LongToShort_Format(primedGamefile, { compact_moves: 1, make_new_lines: false, specifyPosition });
        
	docutil.copyToClipboard(shortformat);
	statustext.showStatus(translations.copypaste.copied_game);
}

/**
 * Pastes the clipboard ICN to the current game.
 * This callback is called when the "Paste Game" button is pressed.
 * @param {event} event - The event fired from the event listener
 */
async function callbackPaste(event) {
	if (document.activeElement !== document.body && !guipause.areWePaused()) return; // Don't paste if the user is typing in an input field
	// Can't paste a game when the current gamefile isn't finished loading all the way.
	if (gameloader.areWeLoadingGame()) return statustext.pleaseWaitForTask();
	
	// Make sure we're not in a public match
	if (onlinegame.areInOnlineGame() && !onlinegame.getIsPrivate()) return statustext.showStatus(translations.copypaste.cannot_paste_in_public);
	// Make sure we're not in an engine match
	if (enginegame.areInEngineGame()) return statustext.showStatus(translations.copypaste.cannot_paste_in_engine);
	// Make sure it's legal in a private match
	if (onlinegame.areInOnlineGame() && onlinegame.getIsPrivate() && gameslot.getGamefile().moves.length > 0) return statustext.showStatus(translations.copypaste.cannot_paste_after_moves);

	// Do we have clipboard permission?
	let clipboard;
	try {
		clipboard = await navigator.clipboard.readText();
	} catch (error) {
		const message = translations.copypaste.clipboard_denied;
		return statustext.showStatus((message + "\n" + error), true);
	}

	// Convert clipboard text to object
	let longformat;
	try {
		longformat = JSON.parse(clipboard); // Gamefile is already primed for the constructor
	} catch (error) {
		try {
			longformat = formatconverter.ShortToLong_Format(clipboard, true, true);
		} catch (e) {
			console.error(e);
			statustext.showStatus(translations.copypaste.clipboard_invalid, true);
			return;
		}
	}

	longformat = backcompatible.getLongformatInNewNotation(longformat);

	if (!verifyLongformat(longformat)) return;

	// console.log(longformat);
    
	const success = pasteGame(longformat);

	// Let the server know if we pasted a custom position in a private match
	if (success & onlinegame.areInOnlineGame() && onlinegame.getIsPrivate()) websocket.sendmessage('game', 'paste');
}

/**
 * Makes sure longformat has all the correct properties before we cast it to a gamefile.
 * If it doesn't, it displays an error to the user the reason why, and returns false.
 * @param {Object} longformat - The gamefile spat out by the formatconverter
 * @returns {boolean} *false* if the longformat is invalid.
 */
function verifyLongformat(longformat) {
	/** We need all of these properties:
     * metadata
     * turn
     * enpassant
     * moveRule
     * fullMove
     * startingPosition
     * specialRights
     * moves: string[] most compact notation
     * gameRules
     */

	if (!longformat.metadata) throw new Error("formatconvert must specify metadata when copying game.");
	if (!longformat.fullMove) throw new Error("formatconvert must specify fullMove when copying game.");
	if (!longformat.startingPosition && !longformat.metadata.Variant) { statustext.showStatus(translations.copypaste.game_needs_to_specify, true); return false; }
	if (longformat.startingPosition && !longformat.specialRights) throw new Error("formatconvert must specify specialRights when copying game, IF startingPosition is provided.");
	if (!longformat.gameRules) throw new Error("Pasted game doesn't specify gameRules! This is an error of the format converter, it should always return default gameRules if it's not specified in the pasted ICN.");
	if (!longformat.gameRules.winConditions) throw new Error("Pasted game doesn't specify winConditions! This is an error of the format converter, it should always return default win conditions if it's not specified in the pasted ICN.");
	if (!verifyWinConditions(longformat.gameRules.winConditions)) return false;
	if (longformat.gameRules.promotionRanks && !longformat.gameRules.promotionsAllowed) throw new Error("Pasted game specifies promotion lines, but no promotions allowed! This is an error of the format converter, it should always return default promotions if it's not specified in the pasted ICN.");
	if (!longformat.gameRules.turnOrder) throw new Error("Pasted game doesn't specify turn order! This is either an error of the format converter (it should always return default turn order if it's not specified in the pasted ICN), or the old gamefile converter to the new format.");

	return true;
}

/** For now doesn't verify if the required royalty is present. */
function verifyWinConditions(winConditions) {
	for (let i = 0; i < winConditions[players.WHITE].length; i++) {
		const winCondition = winConditions[players.WHITE][i];
		if (winconutil.isWinConditionValid(winCondition)) continue;
		// Not valid
		statustext.showStatus(`${translations.copypaste.invalid_wincon_white} "${winCondition}".`, true);
		return false;
	}

	for (let i = 0; i < winConditions[players.BLACK].length; i++) {
		const winCondition = winConditions[players.BLACK][i];
		if (winconutil.isWinConditionValid(winCondition)) continue;
		// Not valid
		statustext.showStatus(`${translations.copypaste.invalid_wincon_black} "${winCondition}".`, true);
		return false;
	}

	return true;
}

/**
 * Loads a game from the provided game in longformat.
 * 
 * TODO: REMOVE A LOT OF THE REDUNDANT LOGIC BETWEEN
 * THIS FUNCTION AND gameforulator.formulateGame()!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
 * 
 * @param {Object} longformat - The game in longformat, or primed for copying. This is NOT the gamefile, we'll need to use the gamefile constructor.
 * @returns {boolean} Whether the paste was successful
 */
function pasteGame(longformat) { // game: { startingPosition (key-list), patterns, promotionRanks, moves, gameRules }
	console.log(translations.copypaste.pasting_game);

	/** longformat properties:
     * metadata
     * enpassant: Coords
     * moveRule
     * fullMove
     * shortposition
     * startingPosition
     * specialRights
     * moves
     * gameRules
     */

	// If this is false, it will have already displayed the error
	if (!verifyGamerules(longformat.gameRules)) return false; // Failed to paste

	// Create a new gamefile from the longformat...

	// Retain most of the existing metadata on the currently loaded gamefile
	const currentGamefile = gameslot.getGamefile();
	const currentGameMetadata = currentGamefile.metadata;
	retainMetadataWhenPasting.forEach((metadataName) => {
		delete longformat.metadata[metadataName];
		if (currentGameMetadata[metadataName] !== undefined) longformat.metadata[metadataName] = currentGameMetadata[metadataName];
	});
	// Only keep the Date of the current game if the starting position of the pasted game isn't specified,
	// because loading the variant version relies on that.
	if (longformat.shortposition || longformat.startingPosition) {
		longformat.metadata.UTCDate = currentGameMetadata.UTCDate;
		longformat.metadata.UTCTime = currentGameMetadata.UTCTime;
	} else if (backcompatible.isDateMetadataInOldFormat(longformat.metadata.Date)) { // Import Date metadata from pasted game, converting it if it is in an old format.
		const { UTCDate, UTCTime } = backcompatible.convertDateMetdatatoUTCDateUTCTime(longformat.metadata.Date);
		longformat.metadata.UTCDate = UTCDate;
		longformat.metadata.UTCTime = UTCTime;
	}

	// If the variant has been translated, the variant metadata needs to be converted from language-specific to internal game code else keep it the same
	longformat.metadata.Variant = gameformulator.convertVariantFromSpokenLanguageToCode(longformat.metadata.Variant) || longformat.metadata.Variant;

	delete longformat.metadata.Clock;

	// Don't transfer the pasted game's Result and Condition metadata. For all we know,
	// the game could have ended by time, in which case we want to further analyse what could have happened.
	delete longformat.metadata.Result;
	delete longformat.metadata.Condition; // Old format
	delete longformat.metadata.Termination; // New format

	// The variant options passed into the variant loader needs to contain the following properties:
	// `fullMove`, `enpassant`, `moveRule`, `positionString`, `startingPosition`, `specialRights`, `gameRules`.
	const variantOptions = {
		fullMove: longformat.fullMove,
		moveRule: longformat.moveRule,
		positionString: longformat.shortposition,
		startingPosition: longformat.startingPosition,
		specialRights: longformat.specialRights,
		gameRules: longformat.gameRules
	};

	if (longformat.enpassant !== undefined) {
		// longformat.enpassant is in the form: Coords
		// need to convert it to: { square: Coords, pawn: Coords }
		const firstTurn = longformat.gameRules.turnOrder[0];
		const yParity = firstTurn === players.WHITE ? 1 : firstTurn === players.BLACK ? -1 : (() => { throw new Error(`Invalid first turn player ${firstTurn} when pasting a game! Can't parse enpassant option.`); })();
		const pawnExpectedSquare = [longformat.enpassant[0], longformat.enpassant[1] - yParity];
		/**
		 * First make sure there IS a pawn on the square!
		 * If not, the ICN was likely tampered.
		 * Erase the enpassant property! (or just don't transfer it over)
		 */
		const pieceOnExpectedSquare = longformat.startingPosition[coordutil.getKeyFromCoords(pawnExpectedSquare)];
		if (pieceOnExpectedSquare && typeutil.getRawType(pieceOnExpectedSquare) === rawTypes.PAWN && typeutil.getColorFromType(pieceOnExpectedSquare) !== firstTurn) {
			// Valid pawn to capture via enpassant is present
			variantOptions.enpassant = { square: longformat.enpassant, pawn: pawnExpectedSquare };
		}
	}

	if (onlinegame.areInOnlineGame() && onlinegame.getIsPrivate()) {
		// Playing a custom private game! Save the pasted position in browser
		// storage so that we can remember it upon refreshing.
		const gameID = onlinegame.getGameID();
		localstorage.saveItem(gameID, variantOptions);
	}

	// What is the warning message if pasting in a private match?
	const privateMatchWarning = onlinegame.areInOnlineGame() && onlinegame.getIsPrivate() ? ` ${translations.copypaste.pasting_in_private}` : '';

	gameloader.pasteGame({
		metadata: longformat.metadata,
		additional: {
			moves: longformat.moves,
			variantOptions,
		}
	});

	const gamefile = gameslot.getGamefile();

	// If there's too many pieces, notify them that the win condition has changed from checkmate to royalcapture.
	const pieceCount = boardutil.getPieceCountOfGame(gamefile.pieces);
	const tooManyPieces = pieceCount >= organizedpieces.pieceCountToDisableCheckmate;
	if (tooManyPieces) { // TOO MANY pieces!
		statustext.showStatus(`${translations.copypaste.piece_count} ${pieceCount} ${translations.copypaste.exceeded} ${organizedpieces.pieceCountToDisableCheckmate}! ${translations.copypaste.changed_wincon}${privateMatchWarning}`, false, 1.5);
	} else { // Only print "Loaded game from clipboard." if we haven't already shown a different status message cause of too many pieces
		statustext.showStatus(`${translations.copypaste.loaded_from_clipboard}${privateMatchWarning}`);
	}

	console.log(translations.copypaste.loaded_from_clipboard);

	return true; // Successfully pasted
}

/**
 * Returns true if all gamerules are valid values.
 * @param {Object} gameRules - The gamerules in question
 * @returns {boolean} *true* if the gamerules are valid
 */
function verifyGamerules(gameRules) {
	if (gameRules.slideLimit !== undefined && typeof gameRules.slideLimit !== 'number') {
		statustext.showStatus(`${translations.copypaste.slidelimit_not_number} "${gameRules.slideLimit}"`, true);
		return false;
	}
	return true;
}



export default {
	copyGame,
	callbackPaste
};