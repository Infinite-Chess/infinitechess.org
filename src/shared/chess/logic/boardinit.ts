// src/shared/chess/logic/boardinit.ts

/**
 * Creates the Board (board state) for a game: the move-execution tier of the
 * BoardPreview -> Board -> GameFile ladder. Reads the variant's movesets and
 * special moves, the only place those are needed.
 */

import type { Player } from '../util/typeutil.js';
import type { Coords } from '../../util/coordutil.js';
import type { MoveFull } from './movepiece.js';
import type { Movesets } from './movesets.js';
import type { GameRules } from '../util/gamerules.js';
import type { VariantModule } from './variantmodule.js';
import type { LoadedVariant } from './gamefile.js';
import type { OrganizedPieces } from './organizedpieces.js';
import type { RawType, RawTypeGroup } from '../util/typeutil.js';
import type { BoardInitOptions, BoardPreview } from './boardpreviewer.js';
import type { SpecialMoveFunction, SpecialVicinity } from './specialmove.js';

import movesets from './movesets.js';
import typeutil from '../util/typeutil.js';
import coordutil from '../../util/coordutil.js';
import specialmove from './specialmove.js';
import boardpreviewer from './boardpreviewer.js';
import organizedpieces from './organizedpieces.js';

// Types -----------------------------------------------------------------------

/**
 * Game data used for simulating game logic and board state.
 * Extends {@link BoardPreview} with move-execution machinery.
 * Used by client always, may not be used by the server.
 */
export interface Board extends BoardPreview {
	/** Fully-populated organized pieces, with slide lines and all. */
	pieces: OrganizedPieces;
	moves: MoveFull[];
	pieceMovesets: Movesets;
	specialMoves: RawTypeGroup<SpecialMoveFunction>;
	specialVicinity: Vicinity;
	vicinity: Vicinity;
	/** The color whose turn it currently is at the front of the game. */
	whosTurn: Player;
}

/** Each offset a piece can capture from, with the raw types that can, parsed once per board. */
type Vicinity = { offset: Coords; types: RawType[] }[];

// Board Construction ----------------------------------------------------------

/** Creates a new {@link Board} object from provided arguments */
function init(
	/** The rules to base the board on. Deep-copied — the board owns its own rules. */
	gameRules: GameRules,
	variant: LoadedVariant | undefined,
	options: BoardInitOptions = {},
): Board {
	const boardPreview = boardpreviewer.init(gameRules, variant, options);

	// Calculate movesets
	const pieceMovesets = getMovesetsOfVariant(variant?.mod, boardPreview.gameRules.slideLimit);
	const specialMoves = getSpecialMovesOfVariant(variant?.mod);

	// Trim both groups to only include types actually present in the game
	typeutil.deleteUnusedFromRawTypeGroup(boardPreview.existingRawTypes, pieceMovesets);
	typeutil.deleteUnusedFromRawTypeGroup(boardPreview.existingRawTypes, specialMoves);

	// Populate slide lines — upgrades boardPreview.pieces (OrganizedPiecesBase) to a full OrganizedPieces.
	// The board preview didn't need slide lines.
	const pieces = organizedpieces.addSlideLines(boardPreview.pieces, pieceMovesets);

	const vicinity = genVicinity(pieceMovesets);
	const specialVicinity = genSpecialVicinity(variant?.mod, boardPreview.existingRawTypes);

	const moves: MoveFull[] = [];

	return {
		...boardPreview,
		pieces, // Replaces the boardPreview's pieces
		moves,
		vicinity,
		specialVicinity,
		pieceMovesets,
		specialMoves,
		whosTurn: boardPreview.gameRules.turnOrder[0]!,
	};
}

// Reading Variant Movement ----------------------------------------------------

/**
 * Returns the default movesets, with any piece type the variant modifies replaced by its own.
 * @param mod - The loaded variant module, or `undefined` for pasted games with no variant.
 * @param slideLimit - The slideLimit gamerule. Applies only to default movesets, since modified ones define their own slide ranges.
 */
function getMovesetsOfVariant(mod: VariantModule | undefined, slideLimit?: bigint): Movesets {
	return { ...movesets.getPieceDefaultMovesets(slideLimit), ...mod?.genMovesetModifications?.() };
}

/**
 * Returns the special moves for the given variant module.
 * @param mod - The loaded variant module, or `undefined` for pasted games with no variant.
 */
function getSpecialMovesOfVariant(
	mod: VariantModule | undefined,
): RawTypeGroup<SpecialMoveFunction> {
	return { ...specialmove.getDefaultSpecialMoves(), ...mod?.getSpecialMoves?.() };
}

/**
 * Returns the special vicinity for the given variant module.
 * @param mod - The loaded variant module, or `undefined` for pasted games with no variant.
 */
function getSpecialVicinityOfVariant(mod: VariantModule | undefined): SpecialVicinity {
	return { ...specialmove.getDefaultSpecialVicinitiesByPiece(), ...mod?.getSpecialVicinity?.() };
}

// Vicinity Generation ---------------------------------------------------------

/**
 * Calculates the area around you in which jumping pieces can land on you from that distance.
 * This is used for efficient calculating if a king move would put you in check.
 * Must be called after the piece movesets are initialized.
 * In the format: `[{ offset: [1,2], types: [knight, chancellor] }, { offset: [1,0], types: [guard, king] }...]`
 * DOES NOT include pawn moves.
 * @param pieceMovesets - MUST BE TRIMMED beforehand to not include movesets of types not present in the game!!!!!
 * @returns The vicinity object
 */
function genVicinity(pieceMovesets: Movesets): Vicinity {
	const vicinity: Vicinity = [];

	// For every type in the game...
	for (const [rawTypeString, moveset] of Object.entries(pieceMovesets)) {
		const rawType = Number(rawTypeString) as RawType;
		const individualMoves = moveset.individual ?? [];
		individualMoves.forEach((coords) => addVicinityType(vicinity, coords, rawType));
	}

	return vicinity;
}

/**
 * Calculates the area around you in which special pieces HAVE A CHANCE to capture you from that distance.
 * This is used for efficient calculating if a move would put you in check by a special piece.
 * If a special piece is found at any of these distances, their legal moves are calculated
 * to see if they would check you or not.
 * This saves us from having to iterate through every single
 * special piece in the game to see if they would check you.
 * @param mod - The loaded variant module, or `undefined` for custom/pasted positions.
 * @param existingRawTypes
 * @returns The specialVicinity, in the format: `[{ offset: [1,1], types: [pawn] }, { offset: [1,2], types: [rose] }...]`
 */
function genSpecialVicinity(mod: VariantModule | undefined, existingRawTypes: RawType[]): Vicinity {
	const specialVicinityByPiece = getSpecialVicinityOfVariant(mod);
	const vicinity: Vicinity = [];
	// Object keys are strings, so we need to cast the type to a number
	for (const [rawTypeString, pieceVicinity] of Object.entries(specialVicinityByPiece)) {
		const rawType = Number(rawTypeString) as RawType;
		if (!existingRawTypes.includes(rawType)) continue; // This piece isn't present in our game
		pieceVicinity.forEach((coords) => addVicinityType(vicinity, coords, rawType));
	}
	return vicinity;
}

/** Records that `rawType` can capture from `offset`. */
function addVicinityType(vicinity: Vicinity, offset: Coords, rawType: RawType): void {
	const entry = vicinity.find((e) => coordutil.areCoordsEqual(e.offset, offset));
	if (entry) entry.types.push(rawType);
	else vicinity.push({ offset, types: [rawType] });
}

// Exports ---------------------------------------------------------------------

export default { init };
