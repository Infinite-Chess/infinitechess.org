// src/shared/chess/logic/boardinit.ts

/**
 * Creates the Board (board state) for a game: the move-execution tier of the
 * BoardPreview -> Board -> GameFile ladder. Reads the variant's movesets and
 * special moves, the only place those are needed.
 */

import type { Player } from '../util/typeutil.js';
import type { MoveFull } from './movepiece.js';
import type { GameRules } from '../util/gamerules.js';
import type { CoordsKey } from '../../util/coordutil.js';
import type { VariantModule } from './variantmodule.js';
import type { LoadedVariant } from './gamefile.js';
import type { OrganizedPieces } from './organizedpieces.js';
import type { RawType, RawTypeGroup } from '../util/typeutil.js';
import type { Movesets, PieceMoveset } from './movesets.js';
import type { BoardInitOptions, BoardPreview } from './boardpreviewer.js';
import type { SpecialMoveFunction, SpecialVicinity } from './specialmove.js';

import jsutil from '../../util/jsutil.js';
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
	pieceMovesets: RawTypeGroup<() => PieceMoveset>;
	specialMoves: RawTypeGroup<SpecialMoveFunction>;
	specialVicinity: Record<CoordsKey, RawType[]>;
	vicinity: Record<CoordsKey, RawType[]>;
	/** The color whose turn it currently is at the front of the game. */
	whosTurn: Player;
}

type Vicinity = Record<CoordsKey, RawType[]>;

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
 * Gets the piece movesets for the given variant module.
 * @param mod - The loaded variant module, or `undefined` for pasted games with no variant.
 * @param slideLimit - If provided, overrides the slideLimit gamerule of the variant. Only meaningful for variants without a movesetGenerator (i.e. those that use default movesets), because custom movesets define their own slide ranges explicitly and don't inherit a global slide limit.
 */
function getMovesetsOfVariant(
	mod: VariantModule | undefined,
	slideLimit?: bigint,
): RawTypeGroup<() => PieceMoveset> {
	// Pasted games with no variant specified use the default movesets
	if (mod === undefined) return getMovesets(undefined, slideLimit);

	if (mod.genMovesetModifications) {
		const movesetModifications = mod.genMovesetModifications();
		return getMovesets(movesetModifications, slideLimit);
	} else {
		// No custom moveset generator, so just get the default movesets
		return getMovesets(undefined, slideLimit);
	}
}

/**
 * Returns default movesets with provided modifications such that each piece contains a function returning a copy of its moveset (to avoid modifying originals).
 * Any piece type present in the modifications will replace the default move that for that piece.
 * The slidelimit gamerule will only be applied to default movesets, not modified ones.
 * @param movesetModifications - The modifications to the default movesets.
 * @param defaultSlideLimitForOldVariants - Optional. The slidelimit to use for default movesets, if applicable.
 */
function getMovesets(
	movesetModifications: Movesets = {},
	defaultSlideLimitForOldVariants?: bigint,
): RawTypeGroup<() => PieceMoveset> {
	const origMoveset = movesets.getPieceDefaultMovesets(defaultSlideLimitForOldVariants);
	// The running piece movesets property of the gamefile.
	const pieceMovesets: RawTypeGroup<() => PieceMoveset> = {};

	for (const [piece, moves] of Object.entries(origMoveset)) {
		const intPiece = Number(piece) as RawType;
		pieceMovesets[intPiece] = movesetModifications[intPiece]
			? (): PieceMoveset => jsutil.deepCopyObject(movesetModifications[intPiece]!)
			: (): PieceMoveset => jsutil.deepCopyObject(moves);
	}

	return pieceMovesets;
}

/**
 * Returns the special moves for the given variant module.
 * @param mod - The loaded variant module, or `undefined` for pasted games with no variant.
 */
function getSpecialMovesOfVariant(
	mod: VariantModule | undefined,
): RawTypeGroup<SpecialMoveFunction> {
	const defaultSpecialMoves = specialmove.getDefaultSpecialMoves();
	// Pasted games with no variant specified use the default
	if (mod === undefined) return defaultSpecialMoves;

	const overrides = mod.getSpecialMoves?.();
	if (overrides === undefined) return defaultSpecialMoves;
	jsutil.copyPropertiesToObject(overrides, defaultSpecialMoves);
	return defaultSpecialMoves;
}

/**
 * Returns the special vicinity for the given variant module.
 * @param mod - The loaded variant module, or `undefined` for pasted games with no variant.
 */
function getSpecialVicinityOfVariant(mod: VariantModule | undefined): SpecialVicinity {
	const defaultSpecialVicinityByPiece = specialmove.getDefaultSpecialVicinitiesByPiece();
	// Pasted games with no variant specified use the default
	if (mod === undefined) return defaultSpecialVicinityByPiece;

	const overrides = mod.getSpecialVicinity?.();
	if (overrides === undefined) return defaultSpecialVicinityByPiece;
	jsutil.copyPropertiesToObject(overrides, defaultSpecialVicinityByPiece);
	return defaultSpecialVicinityByPiece;
}

// Vicinity Generation ---------------------------------------------------------

/**
 * Calculates the area around you in which jumping pieces can land on you from that distance.
 * This is used for efficient calculating if a king move would put you in check.
 * Must be called after the piece movesets are initialized.
 * In the format: `{ '1,2': ['knights', 'chancellors'], '1,0': ['guards', 'king']... }`
 * DOES NOT include pawn moves.
 * @param pieceMovesets - MUST BE TRIMMED beforehand to not include movesets of types not present in the game!!!!!
 * @returns The vicinity object
 */
function genVicinity(pieceMovesets: RawTypeGroup<() => PieceMoveset>): Vicinity {
	const vicinity: Record<CoordsKey, RawType[]> = {};

	// For every type in the game...
	for (const [rawTypeString, movesetFunc] of Object.entries(pieceMovesets)) {
		const rawType = Number(rawTypeString) as RawType;
		const individualMoves = movesetFunc().individual ?? [];
		individualMoves.forEach((coords) => {
			const coordsKey = coordutil.getKeyFromCoords(coords);
			if (!(coordsKey in vicinity)) vicinity[coordsKey] = []; // Make sure it's initialized
			vicinity[coordsKey]!.push(rawType); // Make sure the key contains the piece type that can capture from that distance
		});
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
 * @returns The specialVicinity object, in the format: `{ '1,1': ['pawns'], '1,2': ['roses'], ... }`
 */
function genSpecialVicinity(mod: VariantModule | undefined, existingRawTypes: RawType[]): Vicinity {
	const specialVicinityByPiece = getSpecialVicinityOfVariant(mod);
	const vicinity: Vicinity = {};
	// Object keys are strings, so we need to cast the type to a number
	for (const [rawTypeString, pieceVicinity] of Object.entries(specialVicinityByPiece)) {
		const rawType = Number(rawTypeString) as RawType;
		if (!existingRawTypes.includes(rawType)) continue; // This piece isn't present in our game
		pieceVicinity.forEach((coords) => {
			const coordsKey = coordutil.getKeyFromCoords(coords);
			// typescript doesn't realize vicinity[coordsKey] is guaranteed to be defined
			// after this statement if we use (coordsKey in vicinity) for some reason
			if (!vicinity[coordsKey]) vicinity[coordsKey] = []; // Make sure it's initialized
			vicinity[coordsKey].push(rawType);
		});
	}
	return vicinity;
}

// Exports ---------------------------------------------------------------------

export default { init };
