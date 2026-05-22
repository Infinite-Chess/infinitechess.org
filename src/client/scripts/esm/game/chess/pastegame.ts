// src/client/scripts/esm/game/chess/pastegame.ts

/**
 * This script handles pasting games
 */

import type { MetaData } from '../../../../../shared/types.js';
import type { MovePacket } from '../../../../../shared/types.js';
import type { MetadataKey } from '../../../../../shared/chess/util/metadatautil.js';
import type { VariantCode } from '../../../../../shared/chess/variants/variantregistry.js';
import type { Additional, VariantOptions } from '../../../../../shared/chess/logic/fullgame.js';

import boardutil from '../../../../../shared/chess/util/boardutil.js';
import variantregistry from '../../../../../shared/chess/variants/variantregistry.js';
import { pieceCountToDisableCheckmate } from '../../../../../shared/chess/util/winconutil.js';
import icnconverter, {
	MoveParsed,
	LongFormatOut,
} from '../../../../../shared/chess/logic/icn/icnconverter.js';

import toast from '../gui/toast.js';
import icnimport from './icnimport.js';
import gameloader from './gameloader.js';
import boardeditor from '../boardeditor/boardeditor.js';
import clientmetadatautil from './clientmetadatautil.js';
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

	// Can't paste a game when the current gamefile isn't finished loading all the way.
	if (gameloader.areWeLoadingGame()) return toast.showPleaseWaitForTask();

	console.error('Pasting games is no longer supported');

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
async function pasteGame(longformOut: LongFormatOut): Promise<void> {
	console.log('Pasting game...');

	// Create a new gamefile from the longformat...

	// Retain most of the existing metadata on the currently loaded gamefile
	const currentGamefile = gameslot.getGamefile()!;
	const currentGameMetadata = currentGamefile.metadata;
	retainMetadataWhenPasting.forEach((metadataName) => {
		delete longformOut.metadata[metadataName];
		if (currentGameMetadata[metadataName] !== undefined)
			clientmetadatautil.copyMetadataField(
				longformOut.metadata,
				currentGameMetadata,
				metadataName,
			);
	});

	for (const metadataName of retainIfNotOverridden) {
		if (currentGameMetadata[metadataName] && !longformOut.metadata[metadataName])
			clientmetadatautil.copyMetadataField(
				longformOut.metadata,
				currentGameMetadata,
				metadataName,
			);
	}

	// Resolve variant code from the ICN metadata, normalizing it to the English display name.
	const resolvedVariantCode = resolveAndNormalizeVariantFromMetadata(longformOut.metadata);

	const timestamp = clientmetadatautil.resolveTimestampFromMetadata(
		longformOut.metadata.UTCDate,
		longformOut.metadata.UTCTime,
	);
	const { position, specialRights } = await icnimport.getPositionAndSpecialRightsFromLongFormat(longformOut, resolvedVariantCode); // prettier-ignore

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

	const additional: Additional = { variantOptions };
	if (longformOut.moves) {
		// Trim the excess properties from the MoveParsed type, including the comment.
		additional.moves = longformOut.moves.map((m: MoveParsed) => {
			const move: MovePacket = { token: m.token };
			if (m.clockStamp !== undefined) move.clockStamp = m.clockStamp;
			// Potentially also transfer the pasted comments into the gamefile here in the future!
			// ...
			return move;
		});
	}

	const options: {
		metadata: MetaData;
		variant: VariantCode | undefined;
		dateTimestamp: number;
		additional: Additional;
		presetAnnotes?: PresetAnnotes;
	} = {
		metadata: longformOut.metadata,
		variant: resolvedVariantCode,
		dateTimestamp: timestamp,
		additional,
	};
	if (longformOut.presetAnnotes) options.presetAnnotes = longformOut.presetAnnotes;

	gameloader.pasteGame(options).then(() => {
		// This isn't accessible until gameloader.pasteGame() resolves its promise.
		const gamefile = gameslot.getGamefile()!;

		// If there's too many pieces, notify them that the win condition has changed from checkmate to royalcapture.
		const pieceCount = boardutil.getPieceCountOfGame(gamefile.pieces);
		if (pieceCount >= pieceCountToDisableCheckmate) {
			// TOO MANY pieces!
			toast.show(
				`${translations.copypaste.piece_count} ${pieceCount} ${translations.copypaste.exceeded} ${pieceCountToDisableCheckmate}! ${translations.copypaste.changed_wincon}`,
				{ durationMultiplier: 1.5 },
			);
		} else {
			// Only print "Loaded game from clipboard." if we haven't already shown a different toast cause of too many pieces
			toast.show(`${translations.copypaste.loaded_from_clipboard}`);
		}
	});

	console.log('Loaded game from clipboard!');
}

/**
 * Resolves the variant from the metadata, normalizes the metadata's
 * `Variant` property to the English display name (if recognized),
 * or deletes it (if not recognized), then returns the resolved {@link VariantCode}.
 * MUTATES the input metadata object.
 */
function resolveAndNormalizeVariantFromMetadata(metadata: {
	Variant?: string;
}): VariantCode | undefined {
	if (!metadata.Variant) return undefined;
	const resolved = variantregistry.resolveVariantCode(metadata.Variant);
	if (resolved !== undefined) {
		// Normalize to English display name
		metadata.Variant = variantregistry.getVariantName(resolved);
	} else {
		// Unrecognized Variant: Treat as if no variant was specified
		delete metadata.Variant;
	}
	return resolved;
}

export default {
	callbackPaste,
	resolveAndNormalizeVariantFromMetadata,
};
