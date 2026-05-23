// src/shared/chess/logic/boardinit.ts

/**
 * Creates the Board (board state) for a game.
 * Separated from gamefile.ts so consumers that only need board initialization
 * (e.g., preview renderers, server game setup) do not transitively import the
 * full game-play engine (movepiece, checkdetection, wincondition).
 */

import type { Player } from '../util/typeutil.js';
import type { MoveFull } from './movepiece.js';
import type { GameRules } from '../util/gamerules.js';
import type { CoordsKey } from '../util/coordutil.js';
import type { PieceMoveset } from './movesets.js';
import type { BoardPreview } from './boardpreviewer.js';
import type { VariantModule } from '../variants/variant_scripts/variantutil.js';
import type { OrganizedPieces } from './organizedpieces.js';
import type { SpecialMoveFunction } from './specialmove.js';
import type { RawType, RawTypeGroup } from '../util/typeutil.js';
import type { VariantOptions, LoadedVariant } from './gamefile.js';

import typeutil from '../util/typeutil.js';
import coordutil from '../util/coordutil.js';
import variantreader from '../variants/variantreader.js';
import boardpreviewer from './boardpreviewer.js';
import organizedpieces from './organizedpieces.js';

// Types ------------------------------------------------------------------

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
	/** Determines turn order, win conditions, promotion, etc. */
	gameRules: GameRules;
	/** The color whose turn it currently is at the front of the game. */
	whosTurn: Player;
}

type Vicinity = Record<CoordsKey, RawType[]>;

// Functions ---------------------------------------------------------------

/** Creates a new {@link Board} object from provided arguments */
function initBoard(
	gameRules: GameRules,
	variant: LoadedVariant | undefined,
	variantOptions?: VariantOptions,
	editor: boolean = false,
	/** Only has an effect if the `worldBorder` gamerule is not present. */
	worldBorderDist?: bigint,
): Board {
	const boardPreview = boardpreviewer.initBoardPreview(gameRules, variant, variantOptions, editor, worldBorderDist); // prettier-ignore

	// Calculate movesets
	const pieceMovesets = variantreader.getMovesetsOfVariant(variant?.mod, gameRules.slideLimit);
	const specialMoves = variantreader.getSpecialMovesOfVariant(variant?.mod);

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
		gameRules,
		whosTurn: gameRules.turnOrder[0]!,
	};
}

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
	const specialVicinityByPiece = variantreader.getSpecialVicinityOfVariant(mod);
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

// Exports -----------------------------------------------------------------

export default {
	initBoard,
};
