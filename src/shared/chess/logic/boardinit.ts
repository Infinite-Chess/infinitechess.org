// src/shared/chess/logic/boardinit.ts

/**
 * Creates the Board (board state) for a game.
 * Separated from gamefile.ts so consumers that only need board initialization
 * (e.g., preview renderers, server game setup) do not transitively import the
 * full game-play engine (movepiece, checkdetection, wincondition).
 */

import type { MoveFull } from './movepiece.js';
import type { GameRules } from '../util/gamerules.js';
import type { PieceMoveset } from './movesets.js';
import type { VariantModule } from '../variants/variant_scripts/variantutil.js';
import type { Coords, CoordsKey } from '../util/coordutil.js';
import type { RawType, RawTypeGroup } from '../util/typeutil.js';
import type { GameState, GlobalGameState } from './state.js';
import type { Board, Snapshot, VariantOptions, LoadedVariant } from './gamefile.js';

import jsutil from '../../util/jsutil.js';
import typeutil from '../util/typeutil.js';
import boardutil from '../util/boardutil.js';
import coordutil from '../util/coordutil.js';
import variantreader from '../variants/variantreader.js';
import organizedpieces from './organizedpieces.js';

// Types ------------------------------------------------------------------

type Vicinity = Record<CoordsKey, RawType[]>;

// Functions ---------------------------------------------------------------

/** Creates a new {@link Board} object from provided arguments */
function initBoard(
	gameRules: GameRules,
	variant: LoadedVariant | undefined,
	dateTimestamp: number,
	variantOptions?: VariantOptions,
	editor: boolean = false,
	/** Only has an effect if the `worldBorder` gamerule is not present. */
	worldBorderDist?: bigint,
): Board {
	// Construct board state
	if (
		variantOptions?.gameRules.moveRule !== undefined &&
		variantOptions?.state_global.moveRuleState === undefined
	)
		throw new Error('If moveRule is specified, moveRuleState must also be specified.');

	const fullMove = variantOptions?.fullMove ?? 1;
	const enpassant = variantOptions?.state_global.enpassant;
	const moveRuleState =
		variantOptions?.state_global.moveRuleState ??
		(gameRules.moveRule !== undefined ? 0 : undefined);

	let position: Map<CoordsKey, number>;
	let specialRights: Set<CoordsKey>;

	if (variantOptions) {
		position = variantOptions.position;
		specialRights = variantOptions.state_global.specialRights;
	} else if (variant !== undefined) {
		({ position, specialRights } = variantreader.getStartingPositionOfVariant(
			variant.mod,
			dateTimestamp,
		));
	} else throw Error('Cannot get starting position without a variant module or variantOptions.');

	const state_global: GlobalGameState = { specialRights };
	if (enpassant !== undefined) state_global.enpassant = enpassant;
	if (moveRuleState !== undefined) state_global.moveRuleState = moveRuleState;

	const state: GameState = {
		local: {
			moveIndex: -1,
			inCheck: false,
			checks: [],
		},
		global: jsutil.deepCopyObject(state_global),
	};

	// Calculate movesets
	const pieceMovesets = variantreader.getMovesetsOfVariant(variant?.mod, gameRules.slideLimit);
	const specialMoves = variantreader.getSpecialMovesOfVariant(variant?.mod);

	const { pieces, existingTypes, existingRawTypes } = organizedpieces.processInitialPosition(position, pieceMovesets, gameRules.turnOrder, editor, gameRules.promotion); // prettier-ignore

	typeutil.deleteUnusedFromRawTypeGroup(existingRawTypes, specialMoves);

	let startingPositionBox = boardutil.getBoundingBoxOfAllPieces(pieces);
	// Fallback if no pieces present
	if (startingPositionBox === undefined)
		startingPositionBox = { left: 1n, right: 8n, bottom: 1n, top: 8n };

	// worldBorder: Receives the smaller of the two, if either the variant property or the override are defined.
	let worldBorderProperty: bigint | undefined = variantreader.getVariantWorldBorder(variant?.mod);
	if (worldBorderDist !== undefined) {
		if (worldBorderProperty === undefined)
			worldBorderProperty = worldBorderDist; // Use the provided world border if the variant doesn't have one.
		else if (worldBorderDist < worldBorderProperty) worldBorderProperty = worldBorderDist; // Use the smaller of the two if both exist.
	}

	if (gameRules.worldBorder === undefined && worldBorderProperty !== undefined) {
		// No override for exact world border dimensions provided, calculate it using the provided distance.
		gameRules.worldBorder = {
			left: startingPositionBox.left - worldBorderProperty,
			right: startingPositionBox.right + worldBorderProperty,
			bottom: startingPositionBox.bottom - worldBorderProperty,
			top: startingPositionBox.top + worldBorderProperty,
		};
	}

	const startSnapshot: Snapshot = {
		position,
		state_global,
		fullMove,
		box: startingPositionBox,
	};

	const vicinity = genVicinity(pieceMovesets);
	const specialVicinity = genSpecialVicinity(variant?.mod, existingRawTypes);

	const moves: MoveFull[] = [];

	return {
		pieces,
		existingTypes,
		existingRawTypes,
		state,
		moves,
		vicinity,
		specialVicinity,
		pieceMovesets,
		specialMoves,
		editor,
		variant,
		startSnapshot,
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
			const coordsKey = coordutil.getKeyFromCoords(coords as Coords);
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
