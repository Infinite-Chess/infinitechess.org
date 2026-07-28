// src/client/scripts/esm/game/boardeditor/actions/eactions.ts

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

import type { Edit } from '../../../../../../shared/chess/logic/movepiece';
import type { Board } from '../../../../../../shared/chess/logic/boardinit';
import type { EditorSaveState } from '../../editorstores/estoretypes';
import type { MetaData, MovePacket } from '../../../../../../shared/types.js';
import type { EnPassant, GlobalGameState } from '../../../../../../shared/chess/logic/state';
import type { ActivePosition, StorageType } from '../boardeditor';

import typeutil from '../../../../../../shared/chess/util/typeutil';
import movepiece from '../../../../../../shared/chess/logic/movepiece';
import icnimport from '../../../../../../shared/chess/logic/icn/icnimport.js';
import metadatautil from '../../../../../../shared/chess/util/metadatautil.js';
import variantcache from '../../../../../../shared/chess/variants/variantcache';
import variantpreviewer from '../../../../../../shared/chess/variants/variantpreviewer';
import { validatePosition } from '../../../../../../shared/chess/variants/positionvalidation';
import boardutil, { Piece } from '../../../../../../shared/chess/util/boardutil';
import coordutil, { Coords, CoordsKey } from '../../../../../../shared/chess/util/coordutil';
import organizedpieces, {
	OrganizedPieces,
} from '../../../../../../shared/chess/logic/organizedpieces';
import gamefile, {
	Additional,
	GameFile,
	VariantOptions,
} from '../../../../../../shared/chess/logic/gamefile';
import icnconverter, {
	MoveParsed,
	LongFormatIn,
	LongFormatOut,
} from '../../../../../../shared/chess/logic/icn/icnconverter';

import toast from '../../../components/toast.js';
import docutil from '../../../util/docutil';
import gameslot from '../../chess/gameslot';
import gameloader from '../../chess/gameloader';
import egamerules from '../egamerules';
import gamesession from '../../chess/gamesession';
import annotations from '../../rendering/highlights/annotations/annotations';
import boardeditor from '../boardeditor';
import edithistory from '../edithistory';
import validatorama from '../../../util/validatorama';
import selectiontool from '../tools/selection/selectiontool';
import gamecompressor from '../../chess/gamecompressor';
import guiboardcontrols from '../../gui/guiboardcontrols';
import clientmetadatautil from '../../chess/clientmetadatautil';
import gameSetupModalHandoff from '../../../components/gameSetupModalHandoff.js';

// Constants ----------------------------------------------------------------------

/**
 * If a position with less pieces than this is pasted, the position dependent
 * game rules (pawnDoublePush, castling) are accurately updated,
 * else they are set to undetermined.
 */
const PIECE_LIMIT_KEEP_TRACK_OF_GLOBAL_SPECIAL_RIGHTS = 2_000_000;

// Actions ----------------------------------------------------------------------

/** Resets the board editor position to the Classical position. */
async function reset(): Promise<void> {
	// Unload logical and rendering parts of current position
	gamesession.unloadLogicalAndRendering();

	// Load default board editor position
	boardeditor.clearActivePosition();
	await gameloader.startBoardEditor();
}

/** Clears the entire board editor position. */
async function clearAll(): Promise<void> {
	// Unload logical and rendering parts of current position
	gamesession.unloadLogicalAndRendering();

	// Initialize board editor with empty position and bare minimum game rules
	const gameRules = variantpreviewer.getBareMinimumGameRules();
	const position: Map<CoordsKey, number> = new Map();
	const specialRights: Set<CoordsKey> = new Set();
	const state_global: GlobalGameState = { specialRights };
	const variantOptions: VariantOptions = {
		fullMove: 1,
		gameRules,
		position,
		state_global,
	};

	boardeditor.clearActivePosition();
	await gameloader.startBoardEditorFromCustomPosition(
		{
			additional: {
				variantOptions,
			},
		},
		true, // Dirty position (unsaved changes)
		false,
	);
}

/** Loads a position from a savestate. */
async function load(editorSaveState: EditorSaveState, storage_type: StorageType): Promise<void> {
	// Unload logical and rendering parts of current position
	gamesession.unloadLogicalAndRendering();

	// prettier-ignore
	const new_active_position: ActivePosition =
		storage_type === 'cloud'
			? { name: editorSaveState.position_name, storage_type: 'cloud', owner: validatorama.getOurUsername()! }
			: { name: editorSaveState.position_name, storage_type: 'local' };
	boardeditor.setActivePosition(new_active_position);

	await gameloader.startBoardEditorFromCustomPosition(
		{
			additional: {
				variantOptions: editorSaveState.variantOptions,
			},
		},
		false, // Clean position (no unsaved changes) since we're loading one that was already saved
		editorSaveState.pawnDoublePush,
		editorSaveState.castling,
	);
	toast.show(translations.editor.position_loaded);
}

/**
 * copygame uses the move list instead of the position
 * which doesn't work for the board editor.
 * This function uses the position of pieces on the board.
 */
function copy(): void {
	const variantOptions = getCurrentPositionInformation(false);
	const LongFormatIn: LongFormatIn = {
		metadata:
			{} as MetaData /** Empty metadata, in order to make copied codes easier to share */,
		...variantOptions,
	};
	const shortFormatOut = icnconverter.LongToShort_Format(LongFormatIn, {
		skipPosition: false,
		compact: true,
		spaces: false,
		comments: false,
		make_new_lines: false,
		move_numbers: false,
	});
	docutil.copyToClipboard(shortFormatOut);
	toast.show(translations.copypaste.copied_position);
}

/** Loads the position from the clipboard. */
async function paste(): Promise<undefined> {
	let longformOut: LongFormatOut;

	// Do we have clipboard permission?
	let clipboard: string;
	try {
		clipboard = await navigator.clipboard.readText();
	} catch (error) {
		const message: string = 'Clipboard permission denied. This might be your browser.';
		toast.show(message + '\n' + error, { error: true });
		return;
	}

	// Convert clipboard text to longformat
	try {
		longformOut = icnconverter.ShortToLong_Format(clipboard);
	} catch (e) {
		console.error(e);
		toast.show('Clipboard is not in valid ICN notation.', { error: true });
		return;
	}

	loadFromLongformat(longformOut);
	selectiontool.resetState(); // Clear current selection
	toast.show(translations.copypaste.loaded_position_from_clipboard);
}

/** Starts a local game from the current board editor position, to test play. */
function startLocalGame(): void {
	const variantOptions = getValidatedPosition();
	if (variantOptions === null) return;

	gamesession.unloadGame();
	gameloader.startCustomLocalGame({
		additional: {
			variantOptions,
		},
	});
}

async function startEngineGame(): Promise<void> {
	const variantOptions = getValidatedPosition();
	if (variantOptions === null) return;
	const icn = icnconverter.LongToShort_Format(
		{ metadata: {} as MetaData, ...variantOptions },
		{
			skipPosition: false,
			compact: true,
			spaces: false,
			comments: false,
			make_new_lines: false,
			move_numbers: false,
		},
	);
	await gameSetupModalHandoff.save({
		icn,
		mode: 'computer',
	});
	window.location.assign('/');
}

// Helpers ----------------------------------------------------------------

/**
 * Gets and validates the current board editor position.
 * Shows a toast and returns null if the position is illegal.
 */
function getValidatedPosition(): VariantOptions | null {
	const variantOptions = getCurrentPositionInformation(true);
	const icnString = icnconverter.LongToShort_Format(
		{ metadata: {} as MetaData, ...variantOptions },
		{ skipPosition: false, compact: true, spaces: false, comments: false, make_new_lines: false, move_numbers: false },
	); // prettier-ignore
	const illegalReason = validatePosition(variantOptions, icnString, true);
	if (illegalReason !== null) {
		// The position is illegal
		toast.show(t.shared.position_errors[illegalReason], { error: true });
		return null;
	}
	return variantOptions;
}

/** Queues the removal of all pieces from the position. */
function queueRemovalOfAllPieces(gamefile: GameFile, edit: Edit, pieces: OrganizedPieces): void {
	for (const idx of pieces.coords.values()) {
		const pieceToDelete: Piece = boardutil.getDefinedPieceFromIdx(pieces, idx)!;
		edithistory.queueRemovePiece(gamefile, edit, pieceToDelete);
	}
}

/**
 * Reconstructs the current VariantOptions object (including position, gameRules and state_global) from the current board editor position
 * @param revokeRedundantRights - If true, special rights of pieces that no longer have a valid castling partner are revoked.
 */
function getCurrentPositionInformation(revokeRedundantRights: boolean): VariantOptions {
	// Get current game rules and state
	const { gameRules, moveRuleState, enpassantcoords } = egamerules.getCurrentGamerulesAndState();

	// Construct position
	const gamefile = gameslot.getGamefile()!;
	const position = organizedpieces.generatePositionFromPieces(gamefile.pieces);

	// Construct state_global

	const specialRights = new Set(gamefile.state.global.specialRights); // Makes a copy so we don't modify the original belonging to the current gamefile
	if (revokeRedundantRights) revokeRedundantSpecialRights(gamefile, specialRights);

	let enpassant: EnPassant | undefined;
	if (enpassantcoords !== undefined) {
		const playerToMove = egamerules.getPlayerToMove();
		// prettier-ignore
		const pawn: Coords = playerToMove === 'white' ? [enpassantcoords[0], enpassantcoords[1] - 1n] : playerToMove === 'black' ? [enpassantcoords[0], enpassantcoords[1] + 1n] : (() => { throw new Error("Invalid player to move"); })(); // Future protection
		enpassant = { square: enpassantcoords, pawn };
	}
	const state_global: GlobalGameState = {
		specialRights,
		moveRuleState,
		enpassant,
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
 * Revokes special rights from pieces that no longer have a valid castling partner.
 * MUTATES the input specialRights set.
 * @param specialRights - MUST be a copy of the gamefile's specialRights set! This will be mutated, NOT the gamefile's internal one.
 */
function revokeRedundantSpecialRights(boardsim: Board, specialRights: Set<CoordsKey>): void {
	// Iterate through each piece with special rights, and remove them if they don't have a valid castling partner
	for (const coordsKey of specialRights) {
		const candidate = boardutil.getPieceFromCoordsKey(boardsim.pieces, coordsKey)!; // Guaranteed defined because it wouldn't be in specialRights otherwise

		const rawType = typeutil.getRawType(candidate.type);
		if (egamerules.pawnDoublePushTypes.includes(rawType)) continue; // Pawns can't castle

		const hasValidCastlingPartner = movepiece.hasCastlingPartner(boardsim, candidate);
		if (!hasValidCastlingPartner) specialRights.delete(coordsKey);
	}
}

/**
 * pastegame loads in a new position by creating a new gamefile and loading it
 * which doesn't work for the board editor.
 * This function simply applies an edit to the position of the pieces on the board.
 * @param longformat - If this optional parameter is defined, it is used as the position to load instead of getting the position from the clipboard
 */
async function loadFromLongformat(longformOut: LongFormatIn): Promise<void> {
	// Resolve variant code from the ICN metadata, normalizing it to the English display name.
	const resolvedVariantCode = clientmetadatautil.resolveAndNormalizeVariantFromMetadata(
		longformOut.metadata,
	);
	const timestamp = metadatautil.resolveTimestampFromMetadata(
		longformOut.metadata.UTCDate,
		longformOut.metadata.UTCTime,
	);

	// Preload the variant module up front: getPositionAndSpecialRights reads the position
	// off it when the ICN omits one, and initGameFile below requires it too.
	if (resolvedVariantCode !== undefined)
		await variantcache.ensureVariantLoaded(resolvedVariantCode);
	let { position, specialRights } = icnimport.getPositionAndSpecialRightsFromLongFormat(longformOut, resolvedVariantCode); // prettier-ignore
	let stateGlobal = longformOut.state_global;

	// If longformat contains moves, then we construct a GameFile object and use it to fast forward to the final position
	// If it contains no moves, then we skip all that, thus saving time
	if (longformOut.moves && longformOut.moves.length !== 0) {
		const variantOptions = icnimport.variantOptionsFromLongFormat(longformOut, {
			position,
			specialRights,
		});
		const additional: Additional = {
			variantOptions,
			moves: longformOut.moves.map((m: MoveParsed) => {
				const move: MovePacket = { token: m.token };
				return move;
			}),
		};
		const loadedGamefile = gamefile.initGameFile(
			longformOut.metadata.TimeControl ?? '-',
			timestamp,
			resolvedVariantCode,
			additional,
		);
		const new_gamestate = gamecompressor.GameToPosition(
			variantOptions,
			loadedGamefile.moves,
			loadedGamefile.moves.length,
		);
		position = new_gamestate.position;
		specialRights = new_gamestate.state_global.specialRights!;
		stateGlobal = new_gamestate.state_global;
	}

	const thisGamefile = gameslot.getGamefile()!;
	const mesh = gameslot.getMesh()!;
	const pieces = thisGamefile.pieces;
	const edit: Edit = { changes: [], state: [] };

	// Remove all current pieces from position
	queueRemovalOfAllPieces(thisGamefile, edit, pieces);

	const keepTrackOfGlobalSpecialRights =
		position.size < PIECE_LIMIT_KEEP_TRACK_OF_GLOBAL_SPECIAL_RIGHTS;
	let pawnDoublePush: boolean | undefined = undefined;
	let castling: boolean | undefined = undefined;

	// Add all new pieces as dictated by the pasted position
	let all_pawns_have_double_push = true;
	let at_least_one_pawn_has_double_push = false;
	let all_pieces_obey_normal_castling = true;
	let at_least_one_piece_obeys_normal_castling = false;
	for (const [coordKey, pieceType] of position.entries()) {
		const coords = coordutil.getCoordsFromKey(coordKey);
		const hasSpecialRights = specialRights.has(coordKey);
		edithistory.queueAddPiece(thisGamefile, edit, coords, pieceType, hasSpecialRights);

		if (!keepTrackOfGlobalSpecialRights) continue; // One if statement cost is very tiny per iteration

		const rawtype = typeutil.getRawType(pieceType);
		if (egamerules.pawnDoublePushTypes.includes(rawtype)) {
			if (hasSpecialRights) at_least_one_pawn_has_double_push = true;
			else all_pawns_have_double_push = false;
		} else if (egamerules.castlingTypes.includes(rawtype)) {
			if (hasSpecialRights) at_least_one_piece_obeys_normal_castling = true;
			else all_pieces_obey_normal_castling = false;
		} else if (hasSpecialRights) {
			at_least_one_piece_obeys_normal_castling = true;
			all_pieces_obey_normal_castling = false;
		}
	}

	if (keepTrackOfGlobalSpecialRights) {
		// prettier-ignore
		pawnDoublePush = at_least_one_pawn_has_double_push ? (all_pawns_have_double_push ? true : undefined) : false;
		// prettier-ignore
		castling = at_least_one_piece_obeys_normal_castling ? (all_pieces_obey_normal_castling ? true : undefined) : false;
	}

	egamerules.setGamerulesGUIinfo(longformOut.gameRules, stateGlobal, pawnDoublePush, castling); // Set gamerules object according to pasted game

	edithistory.runEdit(thisGamefile, mesh, edit, true);
	edithistory.addEditToHistory(edit);
	annotations.resetState(); // Clear all annotations

	guiboardcontrols.callback_Expand(); // Virtually press the "Expand to fit all" button after position is loaded
}

// Exports --------------------------------------------------------------------

export default {
	reset,
	clearAll,
	load,
	copy,
	paste,
	startLocalGame,
	startEngineGame,
	getCurrentPositionInformation,
};
