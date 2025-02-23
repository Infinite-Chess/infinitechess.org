
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
import gamefileutility from '../../chess/util/gamefileutility.js';
import statustext from '../gui/statustext.js';
import jsutil from '../../util/jsutil.js';
import docutil from '../../util/docutil.js';
import winconutil from '../../chess/util/winconutil.js';
import guinavigation from '../gui/guinavigation.js';
import gameslot from './gameslot.js';
import gameloader from './gameloader.js';
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
	if (guinavigation.isCoordinateActive()) return;

	const gamefile = gameslot.getGamefile();
	const Variant = gamefile.metadata.Variant;

	const primedGamefile = primeGamefileForCopying(gamefile, copySinglePosition);
	const largeGame = Variant === 'Omega_Squared' || Variant === 'Omega_Cubed' || Variant === 'Omega_Fourth';
	const specifyPosition = !largeGame;
	const shortformat = formatconverter.LongToShort_Format(primedGamefile, { compact_moves: 1, make_new_lines: false, specifyPosition });
        
	docutil.copyToClipboard(shortformat);
	statustext.showStatus(translations.copypaste.copied_game);
}

/**
 * Primes the provided gamefile to for the formatconverter to turn it into an ICN
 * @param {gamefile} gamefile - The gamefile
 * @param {boolean} copySinglePosition - If true, only copy the current position, not the entire game. It won't have the moves list.
 * @returns {Object} The primed gamefile for converting into ICN format
 */
function primeGamefileForCopying(gamefile, copySinglePosition) { // Compress the entire gamefile for copying
	let primedGamefile = {};
	/** What values do we need?
     * 
     * metadata
     * turn
     * enpassant: Coords
     * moveRule
     * fullMove
     * startingPosition (can pass in shortformat string instead)
     * specialRights
     * moves
     * gameRules
     */

	const gameRulesCopy = jsutil.deepCopyObject(gamefile.gameRules);

	primedGamefile.metadata = gamefile.metadata;
	primedGamefile.metadata.Variant = translations[primedGamefile.metadata.Variant] || primedGamefile.metadata.Variant; // Convert the variant metadata code to spoken language if translation is available
	if (gamefile.startSnapshot.enpassant !== undefined) {
		// gamefile.startSnapshot.enpassant is in the form: { square: Coords, pawn: Coords }
		// need to convert it to just the Coords, SO LONG AS THE distance to the pawn is 1 square!!
		const yDistance = Math.abs(gamefile.startSnapshot.enpassant.square[1] - gamefile.startSnapshot.enpassant.pawn[1]);
		if (yDistance === 1) primedGamefile.enpassant = gamefile.startSnapshot.enpassant.square; // Don't assign it if the distance is more than 1 square (not compatible with ICN)
	}
	if (gameRulesCopy.moveRule) primedGamefile.moveRule = `${gamefile.startSnapshot.moveRuleState}/${gameRulesCopy.moveRule}`; delete gameRulesCopy.moveRule;
	primedGamefile.fullMove = gamefile.startSnapshot.fullMove;
	primedGamefile.startingPosition = gamefile.startSnapshot.positionString;
	primedGamefile.moves = gamefile.moves.slice(0, gamefile.moveIndex + 1); // Only copy the moves up to the current move
	primedGamefile.gameRules = gameRulesCopy;

	if (copySinglePosition) {
		primedGamefile.startingPosition = gamefile.startSnapshot.position;
		primedGamefile.specialRights = gamefile.startSnapshot.specialRights;
		primedGamefile = formatconverter.GameToPosition(primedGamefile, Infinity);
	}

	return primedGamefile;
}

/**
 * Pastes the clipboard ICN to the current game.
 * This callback is called when the "Paste Game" button is pressed.
 * @param {event} event - The event fired from the event listener
 */
async function callbackPaste(event) {
	if (guinavigation.isCoordinateActive()) return;
	// Can't paste a game when the current gamefile isn't finished loading all the way.
	if (gameslot.areWeLoadingGraphics()) return statustext.pleaseWaitForTask();
	
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

	console.log(longformat);
    
	pasteGame(longformat);
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
     * moves
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
	for (let i = 0; i < winConditions.white.length; i++) {
		const winCondition = winConditions.white[i];
		if (winconutil.isWinConditionValid(winCondition)) continue;
		// Not valid
		statustext.showStatus(`${translations.copypaste.invalid_wincon_white} "${winCondition}".`, true);
		return false;
	}

	for (let i = 0; i < winConditions.black.length; i++) {
		const winCondition = winConditions.black[i];
		if (winconutil.isWinConditionValid(winCondition)) continue;
		// Not valid
		statustext.showStatus(`${translations.copypaste.invalid_wincon_black} "${winCondition}".`, true);
		return false;
	}

	return true;
}

/**
 * Loads a game from the provided game in longformat.
 * @param {Object} longformat - The game in longformat, or primed for copying. This is NOT the gamefile, we'll need to use the gamefile constructor.
 */
async function pasteGame(longformat) { // game: { startingPosition (key-list), patterns, promotionRanks, moves, gameRules }
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

	if (!verifyGamerules(longformat.gameRules)) return; // If this is false, it will have already displayed the error

	// Create a new gamefile from the longformat...

	// Retain most of the existing metadata on the currently loaded gamefile
	const currentGameMetadata = gameslot.getGamefile().metadata;
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
	longformat.metadata.Variant = convertVariantFromSpokenLanguageToCode(longformat.metadata.Variant) || longformat.metadata.Variant;

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
		const oneOrNegOne = firstTurn === 'white' ? 1 : firstTurn === 'black' ? -1 : (() => { throw new Error("Invalid turn order when pasting a game! Can't parse enpassant option."); })();
		const newEnPassant = { square: longformat.enpassant, pawn: [longformat.enpassant[0], longformat.enpassant[1] - oneOrNegOne] };
		variantOptions.enpassant = newEnPassant;
	}

	if (onlinegame.areInOnlineGame() && onlinegame.getIsPrivate()) {
		// Playing a custom private game! Save the pasted position in browser
		// storage so that we can remember it upon refreshing.
		const gameID = onlinegame.getGameID();
		localstorage.saveItem(gameID, variantOptions);
	}

	// What is the warning message if pasting in a private match?
	const privateMatchWarning = onlinegame.areInOnlineGame() && onlinegame.getIsPrivate() ? ` ${translations.copypaste.pasting_in_private}` : '';
	const viewWhitePerspective = gameslot.isLoadedGameViewingWhitePerspective();

	gameslot.unloadGame();
	await gameslot.loadGamefile({
		metadata: longformat.metadata,
		viewWhitePerspective,
		allowEditCoords: guinavigation.areCoordsAllowedToBeEdited(),
		additional: {
			moves: longformat.moves,
			variantOptions,
		}
	});
	const gamefile = gameslot.getGamefile();
	gameloader.openGameinfoBarAndConcludeGameIfOver(gamefile.metadata);

	// If there's too many pieces, notify them that the win condition has changed from checkmate to royalcapture.
	const tooManyPieces = gamefile.startSnapshot.pieceCount >= gamefileutility.pieceCountToDisableCheckmate;
	if (tooManyPieces) { // TOO MANY pieces!
		statustext.showStatus(`${translations.copypaste.piece_count} ${gamefile.startSnapshot.pieceCount} ${translations.copypaste.exceeded} ${gamefileutility.pieceCountToDisableCheckmate}! ${translations.copypaste.changed_wincon}${privateMatchWarning}`, false, 1.5);
	} else { // Only print "Loaded game from clipboard." if we haven't already shown a different status message cause of too many pieces
		statustext.showStatus(`${translations.copypaste.loaded_from_clipboard}${privateMatchWarning}`);
	}

	console.log(translations.copypaste.loaded_from_clipboard);
}

function convertVariantFromSpokenLanguageToCode(Variant) {
	// Iterate through all translations until we find one that matches this name
	for (const translationCode in translations) {
		if (translations[translationCode] === Variant) {
			return translationCode;
		}
	}
	// Else unknown variant, return undefined
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