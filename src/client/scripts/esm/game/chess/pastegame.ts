
// src/client/scripts/esm/game/chess/pastegame.js

/**
 * This script handles pasting games
 */


// @ts-ignore
import statustext from '../gui/statustext.js';
// @ts-ignore
import websocket from '../websocket.js';
// @ts-ignore
import guipause from '../gui/guipause.js';
import onlinegame from '../misc/onlinegame/onlinegame.js';
import localstorage from '../../util/localstorage.js';
import enginegame from '../misc/enginegame.js';
import winconutil from '../../../../../shared/chess/util/winconutil.js';
import gameslot, { PresetAnnotes } from './gameslot.js';
import gameloader from './gameloader.js';
import { PlayerGroup } from '../../../../../shared/chess/util/typeutil.js';
import gameformulator from './gameformulator.js';
import boardutil from '../../../../../shared/chess/util/boardutil.js';
import icnconverter, { _Move_Out, LongFormatOut } from '../../../../../shared/chess/logic/icn/icnconverter.js';
import variant from '../../../../../shared/chess/variants/variant.js';
import metadata from '../../../../../shared/chess/util/metadata.js';
import { pieceCountToDisableCheckmate } from '../../../../../shared/chess/logic/checkmate.js';
import boardeditor from '../boardeditor/boardeditor.js';

import type { CoordsKey } from '../../../../../shared/chess/util/coordutil.js';
import type { VariantOptions } from '../../../../../shared/chess/logic/initvariant.js';
import type { MetaData, MetadataKey } from '../../../../../shared/chess/util/metadata.js';
import type { ServerGameMoveMessage } from '../../../../../server/game/gamemanager/gameutility.js';


/**
 * A list of metadata properties that are retained from the current game when pasting an external game.
 * These will overwrite the pasted game's metadata with the current game's metadata.
 */
const retainMetadataWhenPasting: MetadataKey[] = ['White','Black','WhiteID','BlackID','WhiteElo','BlackElo','WhiteRatingDiff','BlackRatingDiff','TimeControl','Event','Site','Round'];
/** The pasted game will refuse to override these unless specified explicitly. This prevents them from just being deleted.
 * It means if the pasted game doesn't have these properties, we fall back to the current game's properties. */
const retainIfNotOverridden: MetadataKey[] = ['UTCDate','UTCTime'];


/**
 * Pastes the clipboard ICN to the current game.
 * This callback is called when the "Paste Game" button is pressed.
 * @param event - The event fired from the event listener
 */
// eslint-disable-next-line no-unused-vars
async function callbackPaste(event: Event): Promise<void> {
	// If we are in the board editor, let the board editor script handle this instead
	if (boardeditor.areInBoardEditor()) return; // Editor has its own listener

	if (document.activeElement !== document.body && !guipause.areWePaused()) return; // Don't paste if the user is typing in an input field

	// Can't paste a game when the current gamefile isn't finished loading all the way.
	if (gameloader.areWeLoadingGame()) return statustext.pleaseWaitForTask();

	// Make sure we're not in a public match
	if (onlinegame.areInOnlineGame()) {
		if (!onlinegame.getIsPrivate()) return statustext.showStatus(translations['copypaste'].cannot_paste_in_public);
		if (onlinegame.isRated()) return statustext.showStatus(translations['copypaste'].cannot_paste_in_rated);
	}
	// Make sure we're not in an engine match
	if (enginegame.areInEngineGame()) return statustext.showStatus(translations['copypaste'].cannot_paste_in_engine);
	// Make sure it's legal in a private match
	if (onlinegame.areInOnlineGame() && onlinegame.getIsPrivate() && gameslot.getGamefile()!.boardsim.moves.length > 0) return statustext.showStatus(translations['copypaste'].cannot_paste_after_moves);

	// Do we have clipboard permission?
	let clipboard: string;
	try {
		clipboard = await navigator.clipboard.readText();
	} catch (error) {
		const message: string = translations['copypaste'].clipboard_denied;
		return statustext.showStatus((message + "\n" + error), true);
	}

	// Convert clipboard text to object
	let longformOut: LongFormatOut;
	try {
		longformOut = icnconverter.ShortToLong_Format(clipboard);
	} catch (e) {
		console.error(e);
		statustext.showStatus(translations['copypaste'].clipboard_invalid, true);
		return;
	}

	if (!verifyWinConditions(longformOut.gameRules.winConditions)) return;

	// console.log(jsutil.deepCopyObject(longformOut));
    
	pasteGame(longformOut);

	// Let the server know if we pasted a custom position in a private match
	if (onlinegame.areInOnlineGame() && onlinegame.getIsPrivate()) websocket.sendmessage('game', 'paste');
}

/** For now doesn't verify if the required royalty is present. */
function verifyWinConditions(winConditions: PlayerGroup<string[]>): boolean {
	let oneInvalid = false;
	Object.values(winConditions).flat().forEach(winCondition => {
		if (!winconutil.isWinConditionValid(winCondition)) {
			// Not valid ❌
			statustext.showStatus(`${translations['copypaste'][`invalid_wincon`]} "${winCondition}".`, true);
			oneInvalid = true;
		} // else valid ✅
	});

	return !oneInvalid;
}

/**
 * Loads a game from the provided game in longformat.
 * 
 * TODO: REMOVE A LOT OF THE REDUNDANT LOGIC BETWEEN
 * THIS FUNCTION AND gameforulator.formulateGame()!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
 * 
 * @param longformOut - The game in longformat, or primed for copying. This is NOT the gamefile, we'll need to use the gamefile constructor.
 * @returns Whether the paste was successful
 */
function pasteGame(longformOut: LongFormatOut): void {
	console.log(translations['copypaste'].pasting_game);

	// Create a new gamefile from the longformat...

	// Retain most of the existing metadata on the currently loaded gamefile
	const currentGamefile = gameslot.getGamefile()!;
	const currentGameMetadata = currentGamefile.basegame.metadata;
	retainMetadataWhenPasting.forEach((metadataName) => {
		delete longformOut.metadata[metadataName];
		if (currentGameMetadata[metadataName] !== undefined) metadata.copyMetadataField(longformOut.metadata, currentGameMetadata, metadataName);
	});
	
	for (const metadataName of retainIfNotOverridden) {
		if (currentGameMetadata[metadataName] && !longformOut.metadata[metadataName]) metadata.copyMetadataField(longformOut.metadata, currentGameMetadata, metadataName);
	}

	// If the variant has been translated, the variant metadata needs to be converted from language-specific to internal game code else keep it the same
	if (longformOut.metadata.Variant) longformOut.metadata.Variant = gameformulator.convertVariantFromSpokenLanguageToCode(longformOut.metadata.Variant) || longformOut.metadata.Variant;

	// Don't transfer the pasted game's Result and Termination metadata. For all we know,
	// the game could have ended by time, in which case we want to further analyse what could have happened.
	delete longformOut.metadata.Result;
	delete longformOut.metadata.Termination;

	const { position, specialRights } = getPositionAndSpecialRightsFromLongFormat(longformOut);

	// The variant options passed into the variant loader needs to contain the following properties:
	// `fullMove`, `enpassant`, `moveRuleState`, `position`, `specialRights`, `gameRules`.
	const variantOptions: VariantOptions = {
		fullMove: longformOut.fullMove,
		gameRules: longformOut.gameRules,
		position,
		state_global: {
			...longformOut.state_global,
			specialRights,
		},
	};

	if (onlinegame.areInOnlineGame() && onlinegame.getIsPrivate()) {
		// Playing a custom private game! Save the pasted position in browser
		// storage so that we can remember it upon refreshing.
		const gameID = onlinegame.getGameID();
		const storageKey = onlinegame.getKeyForOnlineGameVariantOptions(gameID);
		localstorage.saveItem(storageKey, variantOptions);
	}

	// What is the warning message if pasting in a private match?
	const privateMatchWarning: string = onlinegame.areInOnlineGame() && onlinegame.getIsPrivate() ? ` ${translations['copypaste'].pasting_in_private}` : '';

	const additional: {
		variantOptions: VariantOptions,
		moves?: ServerGameMoveMessage[],
	} = { variantOptions };
	if (longformOut.moves) {
		// Trim the excess properties from the _Move_Out type, including the comment.
		additional.moves = longformOut.moves.map((m: _Move_Out) => {
			const move: ServerGameMoveMessage = { compact: m.compact };
			if (m.clockStamp !== undefined) move.clockStamp = m.clockStamp;
			// Potentially also transfer the pasted comments into the gamefile here in the future!
			// ...
			return move;
		});
	}

	const options: {
		metadata: MetaData,
		additional: {
			variantOptions: VariantOptions,
			moves?: ServerGameMoveMessage[],
		},
		presetAnnotes?: PresetAnnotes
	} = {
		metadata: longformOut.metadata,
		additional
	};
	if (longformOut.presetAnnotes) options.presetAnnotes = longformOut.presetAnnotes;

	gameloader.pasteGame(options).then(() => {
		// This isn't accessible until gameloader.pasteGame() resolves its promise.
		const gamefile = gameslot.getGamefile()!;
		
		// If there's too many pieces, notify them that the win condition has changed from checkmate to royalcapture.
		const pieceCount = boardutil.getPieceCountOfGame(gamefile.boardsim.pieces);
		if (pieceCount >= pieceCountToDisableCheckmate) { // TOO MANY pieces!
			statustext.showStatus(`${translations['copypaste'].piece_count} ${pieceCount} ${translations['copypaste'].exceeded} ${pieceCountToDisableCheckmate}! ${translations['copypaste'].changed_wincon}${privateMatchWarning}`, false, 1.5);
		} else { // Only print "Loaded game from clipboard." if we haven't already shown a different status message cause of too many pieces
			statustext.showStatus(`${translations['copypaste'].loaded_from_clipboard}${privateMatchWarning}`);
		}
	});

	console.log(translations['copypaste'].loaded_from_clipboard);
}


/**
 * Utility for extracting position and specialRights from a LongFormatOut.
 */
function getPositionAndSpecialRightsFromLongFormat(longFormat: LongFormatOut): { position: Map<CoordsKey, number>; specialRights: Set<CoordsKey>; } {
	// Get relevant position and specialRights information from longformat
	if (longFormat.position && longFormat.state_global.specialRights) {
		return {
			position: longFormat.position,
			specialRights: longFormat.state_global.specialRights,
		};
	} else {
		// No position specified in the ICN, extract from the Variant metadata (guaranteed)
		return variant.getStartingPositionOfVariant(longFormat.metadata);
	}
}



export default {
	callbackPaste,
	getPositionAndSpecialRightsFromLongFormat,
};