// src/client/scripts/esm/game/chess/pastegame.ts

/**
 * This script handles pasting games
 */

import type { MetaData } from '../../../../../shared/types.js';
import type { MovePacket } from '../../../../../shared/types.js';
import type { Additional } from '../../../../../shared/chess/logic/gamefile.js';
import type { VariantCode } from '../../../../../shared/chess/variants/variantregistry.js';

import boardutil from '../../../../../shared/chess/util/boardutil.js';
import icnimport from '../../../../../shared/chess/logic/icn/icnimport.js';
import metadatautil from '../../../../../shared/chess/util/metadatautil.js';
import variantregistry from '../../../../../shared/chess/variants/variantregistry.js';
import { pieceCountToDisableCheckmate } from '../../../../../shared/chess/util/winconutil.js';
import icnconverter, {
	MoveParsed,
	LongFormatOut,
} from '../../../../../shared/chess/logic/icn/icnconverter.js';

import toast from '../../components/toast.js';
import gameloader from './gameloader.js';
import gamesession from './gamesession.js';
import gameslot, { PresetAnnotes } from './gameslot.js';

/**
 * Pastes the clipboard ICN to the current game.
 * This callback is called when the "Paste Game" button is pressed.
 * @param event - The event fired from the event listener
 */
async function callbackPaste(_event: Event): Promise<void> {
	// Can't paste a game when the current gamefile isn't finished loading all the way.
	if (gamesession.isLoading()) return toast.showPleaseWaitForTask();

	console.error('Pasting games is no longer supported');

	// Do we have clipboard permission?
	let clipboard: string;
	try {
		clipboard = await navigator.clipboard.readText();
	} catch (error) {
		return toast.show(
			'Clipboard permission denied. This might be your browser.' + '\n' + error,
			{ error: true },
		);
	}

	// Convert clipboard text to object
	let longformOut: LongFormatOut;
	try {
		longformOut = icnconverter.ShortToLong_Format(clipboard);
	} catch (e) {
		console.error(e);
		toast.show('Clipboard is not in valid ICN notation.', { error: true });
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
 * @param viewWhitePerspective - Board orientation override (defaults to the current game's perspective).
 * @returns Whether the paste was successful
 */
async function pasteGame(
	longformOut: LongFormatOut,
	viewWhitePerspective?: boolean,
): Promise<void> {
	console.log('Pasting game...');

	// Create a new gamefile from the longformat...

	// Resolve variant code from the ICN metadata, normalizing it to the English display name.
	const resolvedVariantCode = resolveAndNormalizeVariantFromMetadata(longformOut.metadata);

	const timestamp = metadatautil.resolveTimestampFromMetadata(
		longformOut.metadata.UTCDate,
		longformOut.metadata.UTCTime,
	);
	const { position, specialRights } = await icnimport.getPositionAndSpecialRightsFromLongFormat(longformOut, resolvedVariantCode); // prettier-ignore

	// The variant options passed into the variant loader needs to contain the following properties:
	// `fullMove`, `enpassant`, `moveRuleState`, `position`, `specialRights`, `gameRules`.
	const variantOptions = icnimport.variantOptionsFromLongFormat(longformOut, {
		position,
		specialRights,
	});

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
		viewWhitePerspective?: boolean;
	} = {
		metadata: longformOut.metadata,
		variant: resolvedVariantCode,
		dateTimestamp: timestamp,
		additional,
	};
	if (longformOut.presetAnnotes) options.presetAnnotes = longformOut.presetAnnotes;
	if (viewWhitePerspective !== undefined) options.viewWhitePerspective = viewWhitePerspective;

	gameloader.pasteGame(options).then(() => {
		// Only accessible once gameloader.pasteGame() resolves its load; still guard in
		// case the load errored (the gamefile would be absent).
		const gamefile = gameslot.getGamefile();
		if (!gamefile) return;

		// If there's too many pieces, notify them that the win condition has changed from checkmate to royalcapture.
		const pieceCount = boardutil.getPieceCountOfGame(gamefile.pieces);

		console.log('Pasted game from clipboard!');

		if (pieceCount >= pieceCountToDisableCheckmate)
			toast.show('Checkmate win condition was swapped for royal captured.');
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
		metadata.Variant = variantregistry.getVariantName(resolved, t.shared);
	} else {
		// Unrecognized Variant: Treat as if no variant was specified
		delete metadata.Variant;
	}
	return resolved;
}

export default {
	callbackPaste,
	pasteGame,
	resolveAndNormalizeVariantFromMetadata,
};
