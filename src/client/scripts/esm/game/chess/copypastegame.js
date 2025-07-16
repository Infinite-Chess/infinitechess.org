
// src/client/scripts/esm/game/chess/copypastegame.js

/**
 * This script handles copying and pasting games
 */


import onlinegame from '../misc/onlinegame/onlinegame.js';
import localstorage from '../../util/localstorage.js';
import enginegame from '../misc/enginegame.js';
import statustext from '../gui/statustext.js';
import docutil from '../../util/docutil.js';
import winconutil from '../../chess/util/winconutil.js';
import gameslot from './gameslot.js';
import gameloader from './gameloader.js';
import { players } from '../../chess/util/typeutil.js';
import guipause from '../gui/guipause.js';
import gamecompressor from './gamecompressor.js';
import gameformulator from './gameformulator.js';
import websocket from '../websocket.js';
import boardutil from '../../chess/util/boardutil.js';
import icnconverter from '../../chess/logic/icn/icnconverter.js';
import variant from '../../chess/variants/variant.js';
import drawrays from '../rendering/highlights/annotations/drawrays.js';
import { pieceCountToDisableCheckmate } from '../../chess/logic/checkmate.js';
import drawsquares from '../rendering/highlights/annotations/drawsquares.js';


/**
 * A list of metadata properties that are retained from the current game when pasting an external game.
 * These will overwrite the pasted game's metadata with the current game's metadata.
 */
const retainMetadataWhenPasting: string[] = ['White','Black','WhiteID','BlackID','WhiteElo','BlackElo','WhiteRatingDiff','BlackRatingDiff','TimeControl','Event','Site','Round'] as const;
/** The pasted game will refuse to override these unless specified explicitly. This prevents them from just being deleted. */
const retainIfNotOverridden: string[] = ['UTCDate','UTCTime'] as const;

const variantsTooBigToCopyPositionToICN: string[] = ['Omega_Squared', 'Omega_Cubed', 'Omega_Fourth', '5D_Chess'] as const;

/**
 * Copies the current game to the clipboard in ICN notation.
 * This callback is called when the "Copy Game" button is pressed.
 * @param {boolean} copySinglePosition - If true, only copy the current position, not the entire game. It won't have the moves list.
 */
function copyGame(copySinglePosition: boolean): void {
	const gamefile = gameslot.getGamefile();
	const Variant = gamefile.basegame.metadata.Variant;

	// Add the preset annotation overrides from the previously pasted game, if present.
	const preset_squares = drawsquares.getPresetOverrides();
	const preset_rays = drawrays.getPresetOverrides();
	let presetAnnotes: PresetAnnotes | undefined;
	if (preset_squares || preset_rays) {
		presetAnnotes = {};
		if (preset_squares) presetAnnotes.squares = preset_squares;
		if (preset_rays) presetAnnotes.rays = preset_rays;
	}

	const longformatIn = gamecompressor.compressGamefile(gamefile, copySinglePosition, presetAnnotes);
	// Convert the variant metadata code to spoken language if translation is available
	if (longformatIn.metadata.Variant) longformatIn.metadata.Variant = translations[longformatIn.metadata.Variant];
	
	const largeGame: boolean = variantsTooBigToCopyPositionToICN.includes(Variant);
	// Also specify the position if we're copying a single position, so the starting position will be different.
	const skipPosition: boolean = largeGame && !copySinglePosition;
	const shortformat: string = icnconverter.LongToShort_Format(longformatIn, { skipPosition, compact: false, spaces: false, comments: false, make_new_lines: false, move_numbers: false });
    
	docutil.copyToClipboard(shortformat);
	statustext.showStatus(translations.copypaste.copied_game);
}

/**
 * Pastes the clipboard ICN to the current game.
 * This callback is called when the "Paste Game" button is pressed.
 * @param {Event} event - The event fired from the event listener
 */
async function callbackPaste(event: Event): Promise<void> {
	if (document.activeElement !== document.body && !guipause.areWePaused()) return; // Don't paste if the user is typing in an input field
	// Can't paste a game when the current gamefile isn't finished loading all the way.
	if (gameloader.areWeLoadingGame()) return statustext.pleaseWaitForTask();
	
	// Make sure we're not in a public match
	if (onlinegame.areInOnlineGame()) {
		if (!onlinegame.getIsPrivate()) return statustext.showStatus(translations.copypaste.cannot_paste_in_public);
		if (onlinegame.isRated()) return statustext.showStatus(translations.copypaste.cannot_paste_in_rated);
	}
	// Make sure we're not in an engine match
	if (enginegame.areInEngineGame()) return statustext.showStatus(translations.copypaste.cannot_paste_in_engine);
	// Make sure it's legal in a private match
	if (onlinegame.areInOnlineGame() && onlinegame.getIsPrivate() && gameslot.getGamefile().boardsim.moves.length > 0) return statustext.showStatus(translations.copypaste.cannot_paste_after_moves);

	// Do we have clipboard permission?
	let clipboard: string;
	try {
		clipboard = await navigator.clipboard.readText();
	} catch (error) {
		const message: string = translations.copypaste.clipboard_denied;
		return statustext.showStatus((message + "\n" + error), true);
	}

	// Convert clipboard text to object
	let longformOut: LongFormatOut;
	try {
		longformOut = icnconverter.ShortToLong_Format(clipboard, true, true);
	} catch (e) {
		console.error(e);
		statustext.showStatus(translations.copypaste.clipboard_invalid, true);
		return;
	}

	if (!verifyWinConditions(longformOut.gameRules.winConditions)) return;

	// console.log(jsutil.deepCopyObject(longformOut));
    
	const success: boolean = pasteGame(longformOut);

	// Let the server know if we pasted a custom position in a private match
	if (success && onlinegame.areInOnlineGame() && onlinegame.getIsPrivate()) websocket.sendmessage('game', 'paste');
}

/** For now doesn't verify if the required royalty is present. */
function verifyWinConditions(winConditions: PlayerGroup<string[]>): boolean {
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
function pasteGame(longformOut: LongFormatOut): boolean {
	console.log(translations.copypaste.pasting_game);

	// If this is false, it will have already displayed the error
	if (!verifyGamerules(longformOut.gameRules)) return false; // Failed to paste

	// Create a new gamefile from the longformat...

	// Retain most of the existing metadata on the currently loaded gamefile
	const currentGamefile = gameslot.getGamefile();
	const currentGameMetadata = currentGamefile.basegame.metadata;
	retainMetadataWhenPasting.forEach((metadataName: string) => {
		delete longformOut.metadata[metadataName];
		if (currentGameMetadata[metadataName] !== undefined) longformOut.metadata[metadataName] = currentGameMetadata[metadataName];
	});
	
	for (const metadataName of retainIfNotOverridden) {
		if (currentGameMetadata[metadataName] && !longformOut.metadata[metadataName]) longformOut.metadata[metadataName] = currentGameMetadata[metadataName];
	}

	// If the variant has been translated, the variant metadata needs to be converted from language-specific to internal game code else keep it the same
	if (longformOut.metadata.Variant) longformOut.metadata.Variant = gameformulator.convertVariantFromSpokenLanguageToCode(longformOut.metadata.Variant) || longformOut.metadata.Variant;

	// Don't transfer the pasted game's Result and Termination metadata. For all we know,
	// the game could have ended by time, in which case we want to further analyse what could have happened.
	delete longformOut.metadata.Result;
	delete longformOut.metadata.Termination;

	let position: Map<CoordsKey, number>;
	let specialRights: Set<CoordsKey>;
	if (longformOut.position) {
		position = longformOut.position;
		specialRights = longformOut.state_global.specialRights;
	} else {
		// No position specified in the ICN, extract from the Variant metadata (guaranteed)
		({ position, specialRights } = variant.getStartingPositionOfVariant(longformOut.metadata));
	}

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
	const privateMatchWarning: string = onlinegame.areInOnlineGame() && onlinegame.getIsPrivate() ? ` ${translations.copypaste.pasting_in_private}` : '';

	const additional: Additional = { variantOptions };
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

	const options: LoadOptions = {
		metadata: longformOut.metadata,
		additional
	};
	if (longformOut.presetAnnotes) options.presetAnnotes = longformOut.presetAnnotes;

	gameloader.pasteGame(options).then(() => {
		// This isn't accessible until gameloader.pasteGame() resolves its promise.
		const gamefile = gameslot.getGamefile();
		
		// If there's too many pieces, notify them that the win condition has changed from checkmate to royalcapture.
		const pieceCount = boardutil.getPieceCountOfGame(gamefile.boardsim.pieces);
		if (pieceCount >= pieceCountToDisableCheckmate) { // TOO MANY pieces!
			statustext.showStatus(`${translations.copypaste.piece_count} ${pieceCount} ${translations.copypaste.exceeded} ${pieceCountToDisableCheckmate}! ${translations.copypaste.changed_wincon}${privateMatchWarning}`, false, 1.5);
		} else { // Only print "Loaded game from clipboard." if we haven't already shown a different status message cause of too many pieces
			statustext.showStatus(`${translations.copypaste.loaded_from_clipboard}${privateMatchWarning}`);
		}
	});

	console.log(translations.copypaste.loaded_from_clipboard);

	return true; // Successfully pasted
}

/**
 * Returns true if all gamerules are valid values.
 * @param {GameRules} gameRules - The gamerules in question
 * @returns {boolean} *true* if the gamerules are valid
 */
function verifyGamerules(gameRules: GameRules): boolean {
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