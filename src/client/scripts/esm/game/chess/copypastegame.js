
/** 
 * Type Definitions 
 * @typedef {import('../../chess/logic/gamefile.js').gamefile} gamefile
 * @typedef {import('../../chess/logic/icn/icnconverter.js').LongFormatOut} LongFormatOut
 */

// Import Start
import onlinegame from '../misc/onlinegame/onlinegame.js';
import localstorage from '../../util/localstorage.js';
import enginegame from '../misc/enginegame.js';
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
import icnconverter from '../../chess/logic/icn/icnconverter.js';
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

const variantsTooBigToCopyPositionToICN = ['Omega_Squared', 'Omega_Cubed', 'Omega_Fourth'];

/**
 * Copies the current game to the clipboard in ICN notation.
 * This callback is called when the "Copy Game" button is pressed.
 * @param {boolean} copySinglePosition - If true, only copy the current position, not the entire game. It won't have the moves list.
 */
function copyGame(copySinglePosition) {
	const gamefile = gameslot.getGamefile();
	const Variant = gamefile.metadata.Variant;

	const longformatIn = gamecompressor.compressGamefile(gamefile, copySinglePosition);
	// Convert the variant metadata code to spoken language if translation is available
	if (longformatIn.metadata.Variant) longformatIn.metadata.Variant = translations[longformatIn.metadata.Variant];
	
	const largeGame = variantsTooBigToCopyPositionToICN.includes(Variant);
	// Also specify the position if we're copying a single position, so the starting position will be different.
	const skipPosition = largeGame && !copySinglePosition;
	const shortformat = icnconverter.LongToShort_Format(longformatIn, { skipPosition, compact: false, spaces: false, comments: false, make_new_lines: false, move_numbers: false });
    
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
	let longformOut;
	try {
		longformOut = icnconverter.ShortToLong_Format(clipboard, true, true);
	} catch (e) {
		console.error(e);
		statustext.showStatus(translations.copypaste.clipboard_invalid, true);
		return;
	}

	if (!verifyWinConditions(longformOut.gameRules.winConditions)) return;

	// console.log(longformat);
    
	const success = pasteGame(longformOut);

	// Let the server know if we pasted a custom position in a private match
	if (success & onlinegame.areInOnlineGame() && onlinegame.getIsPrivate()) websocket.sendmessage('game', 'paste');
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
 * @param {LongFormatOut} longformOut - The game in longformat, or primed for copying. This is NOT the gamefile, we'll need to use the gamefile constructor.
 * @returns {boolean} Whether the paste was successful
 */
function pasteGame(longformOut) {
	console.log(translations.copypaste.pasting_game);

	// If this is false, it will have already displayed the error
	if (!verifyGamerules(longformOut.gameRules)) return false; // Failed to paste

	// Create a new gamefile from the longformat...

	// Retain most of the existing metadata on the currently loaded gamefile
	const currentGamefile = gameslot.getGamefile();
	const currentGameMetadata = currentGamefile.metadata;
	retainMetadataWhenPasting.forEach((metadataName) => {
		delete longformOut.metadata[metadataName];
		if (currentGameMetadata[metadataName] !== undefined) longformOut.metadata[metadataName] = currentGameMetadata[metadataName];
	});
	// Only keep the Date of the current game if the starting position of the pasted game isn't specified,
	// because loading the variant version relies on that.
	if (longformOut.position) {
		longformOut.metadata.UTCDate = currentGameMetadata.UTCDate;
		longformOut.metadata.UTCTime = currentGameMetadata.UTCTime;
	}

	// If the variant has been translated, the variant metadata needs to be converted from language-specific to internal game code else keep it the same
	longformOut.metadata.Variant = gameformulator.convertVariantFromSpokenLanguageToCode(longformOut.metadata.Variant) || longformOut.metadata.Variant;

	// Don't transfer the pasted game's Result and Termination metadata. For all we know,
	// the game could have ended by time, in which case we want to further analyse what could have happened.
	delete longformOut.metadata.Result;
	delete longformOut.metadata.Termination;

	// The variant options passed into the variant loader needs to contain the following properties:
	// `fullMove`, `enpassant`, `moveRuleState`, `startingPosition`, `specialRights`, `gameRules`.
	const variantOptions = {
		fullMove: longformOut.fullMove,
		gameRules: longformOut.gameRules,
		startingPosition: longformOut.startingPosition,
		state_global: longformOut.state_global,
	};


	if (onlinegame.areInOnlineGame() && onlinegame.getIsPrivate()) {
		// Playing a custom private game! Save the pasted position in browser
		// storage so that we can remember it upon refreshing.
		const gameID = onlinegame.getGameID();
		localstorage.saveItem(gameID, variantOptions);
	}

	// What is the warning message if pasting in a private match?
	const privateMatchWarning = onlinegame.areInOnlineGame() && onlinegame.getIsPrivate() ? ` ${translations.copypaste.pasting_in_private}` : '';

	gameloader.pasteGame({
		metadata: longformOut.metadata,
		additional: {
			moves: longformOut.moves,
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