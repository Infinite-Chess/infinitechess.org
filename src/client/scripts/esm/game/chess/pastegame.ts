// src/client/scripts/esm/game/chess/pastegame.ts

/**
 * This script handles pasting games
 */

import type { CoordsKey } from '../../../../../shared/chess/util/coordutil.js';
import type { Additional } from '../../../../../shared/chess/logic/gamefile.js';
import type { VariantCode } from '../../../../../shared/chess/variants/variant.js';
import type { VariantOptions } from '../../../../../shared/chess/logic/initvariant.js';
import type { MetaData, MetadataKey } from '../../../../../shared/chess/util/metadata.js';
import type { ServerGameMoveMessage } from '../../../../../server/game/gamemanager/gameutility.js';

import variant from '../../../../../shared/chess/variants/variant.js';
import metadata from '../../../../../shared/chess/util/metadata.js';
import timeutil from '../../../../../shared/util/timeutil.js';
import boardutil from '../../../../../shared/chess/util/boardutil.js';
import { pieceCountToDisableCheckmate } from '../../../../../shared/chess/logic/checkmate.js';
import icnconverter, {
	_Move_Out,
	LongFormatOut,
} from '../../../../../shared/chess/logic/icn/icnconverter.js';

import toast from '../gui/toast.js';
import IndexedDB from '../../util/IndexedDB.js';
import onlinegame from '../misc/onlinegame/onlinegame.js';
import enginegame from '../misc/enginegame.js';
import gameloader from './gameloader.js';
import boardeditor from '../boardeditor/boardeditor.js';
import socketmessages from '../websocket/socketmessages.js';
import gameslot, { PresetAnnotes } from './gameslot.js';

/**
 * A list of metadata properties that are retained from the current game when pasting an external game.
 * These will overwrite the pasted game's metadata with the current game's metadata.
 */
const retainMetadataWhenPasting: MetadataKey[] = [
	'White',
	'Black',
	'WhiteID',
	'BlackID',
	'WhiteElo',
	'BlackElo',
	'WhiteRatingDiff',
	'BlackRatingDiff',
	'TimeControl',
	'Event',
	'Site',
	'Round',
];
/** The pasted game will refuse to override these unless specified explicitly. This prevents them from just being deleted.
 * It means if the pasted game doesn't have these properties, we fall back to the current game's properties. */
const retainIfNotOverridden: MetadataKey[] = ['UTCDate', 'UTCTime'];

/**
 * Pastes the clipboard ICN to the current game.
 * This callback is called when the "Paste Game" button is pressed.
 * @param event - The event fired from the event listener
 */
async function callbackPaste(_event: Event): Promise<void> {
	if (boardeditor.areInBoardEditor()) return; // Editor has its own handler

	if (document.activeElement instanceof HTMLInputElement) return; // Don't paste if the user is typing in an input field

	// Can't paste a game when the current gamefile isn't finished loading all the way.
	if (gameloader.areWeLoadingGame()) return toast.showPleaseWaitForTask();

	// Make sure we're not in a public match
	if (onlinegame.areInOnlineGame()) {
		if (!onlinegame.getIsPrivate())
			return toast.show(translations.copypaste.cannot_paste_in_public);
		if (onlinegame.isRated()) return toast.show(translations.copypaste.cannot_paste_in_rated);
	}
	// Make sure we're not in an engine match
	if (enginegame.areInEngineGame())
		return toast.show(translations.copypaste.cannot_paste_in_engine);
	// Make sure it's legal in a private match
	if (
		onlinegame.areInOnlineGame() &&
		onlinegame.getIsPrivate() &&
		gameslot.getGamefile()!.boardsim.moves.length > 0
	)
		return toast.show(translations.copypaste.cannot_paste_after_moves);

	// Do we have clipboard permission?
	let clipboard: string;
	try {
		clipboard = await navigator.clipboard.readText();
	} catch (error) {
		const message: string = translations.copypaste.clipboard_denied;
		return toast.show(message + '\n' + error, { error: true });
	}

	// Convert clipboard text to object
	let longformOut: LongFormatOut;
	try {
		longformOut = icnconverter.ShortToLong_Format(clipboard);
	} catch (e) {
		console.error(e);
		toast.show(translations.copypaste.clipboard_invalid, { error: true });
		return;
	}

	// console.log(jsutil.deepCopyObject(longformOut));

	pasteGame(longformOut);

	// Let the server know if we pasted a custom position in a private match
	if (onlinegame.areInOnlineGame() && onlinegame.getIsPrivate())
		socketmessages.send('game', 'paste');
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
	console.log('Pasting game...');

	// Create a new gamefile from the longformat...

	// Retain most of the existing metadata on the currently loaded gamefile
	const currentGamefile = gameslot.getGamefile()!;
	const currentGameMetadata = currentGamefile.basegame.metadata;
	retainMetadataWhenPasting.forEach((metadataName) => {
		delete longformOut.metadata[metadataName];
		if (currentGameMetadata[metadataName] !== undefined)
			metadata.copyMetadataField(longformOut.metadata, currentGameMetadata, metadataName);
	});

	for (const metadataName of retainIfNotOverridden) {
		if (currentGameMetadata[metadataName] && !longformOut.metadata[metadataName])
			metadata.copyMetadataField(longformOut.metadata, currentGameMetadata, metadataName);
	}

	// Resolve variant code from the ICN metadata, normalizing it to the English display name.
	const resolvedVariantCode = variant.resolveAndNormalizeVariantInMetadata(longformOut.metadata);

	// Don't transfer the pasted game's Result and Termination metadata. For all we know,
	// the game could have ended by time, in which case we want to further analyse what could have happened.
	delete longformOut.metadata.Result;
	delete longformOut.metadata.Termination;

	const timestamp = metadata.resolveTimestampFromMetadata(
		longformOut.metadata.UTCDate,
		longformOut.metadata.UTCTime,
	);
	const { position, specialRights } = getPositionAndSpecialRightsFromLongFormat(
		longformOut,
		resolvedVariantCode,
		timestamp,
	);

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
		const expiryMillis = timeutil.getTotalMilliseconds({ days: 3 });
		IndexedDB.saveItem(storageKey, variantOptions, expiryMillis);
	}

	// What is the warning message if pasting in a private match?
	const privateMatchWarning: string =
		onlinegame.areInOnlineGame() && onlinegame.getIsPrivate()
			? ` ${translations.copypaste.pasting_in_private}`
			: '';

	const additional: Additional = { variantOptions, variant: resolvedVariantCode };
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
		metadata: MetaData;
		additional: Additional;
		presetAnnotes?: PresetAnnotes;
	} = {
		metadata: longformOut.metadata,
		additional,
	};
	if (longformOut.presetAnnotes) options.presetAnnotes = longformOut.presetAnnotes;

	gameloader.pasteGame(options).then(() => {
		// This isn't accessible until gameloader.pasteGame() resolves its promise.
		const gamefile = gameslot.getGamefile()!;

		// If there's too many pieces, notify them that the win condition has changed from checkmate to royalcapture.
		const pieceCount = boardutil.getPieceCountOfGame(gamefile.boardsim.pieces);
		if (pieceCount >= pieceCountToDisableCheckmate) {
			// TOO MANY pieces!
			toast.show(
				`${translations.copypaste.piece_count} ${pieceCount} ${translations.copypaste.exceeded} ${pieceCountToDisableCheckmate}! ${translations.copypaste.changed_wincon}${privateMatchWarning}`,
				{ durationMultiplier: 1.5 },
			);
		} else {
			// Only print "Loaded game from clipboard." if we haven't already shown a different toast cause of too many pieces
			toast.show(`${translations.copypaste.loaded_from_clipboard}${privateMatchWarning}`);
		}
	});

	console.log('Loaded game from clipboard!');
}

/**
 * Utility for extracting position and specialRights from a LongFormatOut.
 * @param longFormat - The parsed long format from ICN.
 * @param variantCode - The pre-resolved variant code (avoids re-resolving from metadata).
 * @param timestamp - The game's start timestamp in ms since epoch.
 */
function getPositionAndSpecialRightsFromLongFormat(
	longFormat: LongFormatOut,
	variantCode: VariantCode | undefined,
	timestamp: number,
): {
	position: Map<CoordsKey, number>;
	specialRights: Set<CoordsKey>;
} {
	// Get relevant position and specialRights information from longformat
	if (longFormat.position && longFormat.state_global.specialRights) {
		return {
			position: longFormat.position,
			specialRights: longFormat.state_global.specialRights,
		};
	} else if (variantCode !== undefined) {
		// No position specified in the ICN, extract from the variant
		return variant.getStartingPositionOfVariant(variantCode, timestamp);
	} else {
		// Empty position
		return { position: new Map(), specialRights: new Set() };
	}
}

export default {
	callbackPaste,
	getPositionAndSpecialRightsFromLongFormat,
};
