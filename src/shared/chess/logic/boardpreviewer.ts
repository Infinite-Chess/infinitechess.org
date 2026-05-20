// src/shared/chess/logic/boardpreviewer.ts

/**
 * Defines BoardPreview — the lightweight subset of Board used by preview
 * renderers and other consumers that do not need move-execution machinery
 * (pieceMovesets, specialMoves, vicinity, specialVicinity, moves).
 *
 * initBoardPreview() constructs a BoardPreview without importing variantreader
 * or movesets, keeping the dependency tree light for preview contexts.
 */

import type { RawType } from '../util/typeutil.js';
import type { GameRules } from '../util/gamerules.js';
import type { CoordsKey } from '../util/coordutil.js';
import type { OrganizedPieces } from './organizedpieces.js';
import type { GameState, GlobalGameState } from './state.js';
import type { Snapshot, VariantOptions, LoadedVariant } from './fullgame.js';

import jsutil from '../../util/jsutil.js';
import boardutil from '../util/boardutil.js';
import organizedpieces from './organizedpieces.js';
import variantpreviewer from '../variants/variantpreviewer.js';

// Types ------------------------------------------------------------------

/**
 * The lightweight subset of {@link Board} used by preview renderers.
 * Contains everything needed to render a static position snapshot, but
 * none of the move-execution fields (pieceMovesets, specialMoves, vicinity,
 * specialVicinity, moves).
 */
export type BoardPreview = {
	/** An array of all types of pieces that are in this game, without their color extension: `['pawns','queens']` */
	existingTypes: number[];
	/** An array of all RAW piece types that are in this game. */
	existingRawTypes: RawType[];

	pieces: OrganizedPieces;
	state: GameState;

	/** Whether the gamefile is for the board editor. */
	editor: boolean;

	/**
	 * The variant code and its loaded module.
	 * Undefined for custom/pasted positions without a known variant.
	 */
	variant?: LoadedVariant;

	/** Information about the beginning snapshot of the game (position, positionString, specialRights, turn) */
	startSnapshot: Snapshot;
};

// Functions ---------------------------------------------------------------

/** Creates a new {@link BoardPreview} from the provided arguments. */
function initBoardPreview(
	gameRules: GameRules,
	variant: LoadedVariant | undefined,
	dateTimestamp: number,
	variantOptions?: VariantOptions,
	editor: boolean = false,
	/** Only has an effect if the `worldBorder` gamerule is not present. */
	worldBorderDist?: bigint,
): BoardPreview {
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
		({ position, specialRights } = variantpreviewer.getStartingPositionOfVariant(
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

	const { pieces, existingTypes, existingRawTypes } = organizedpieces.processInitialPosition(position, gameRules.turnOrder, editor, gameRules.promotion); // prettier-ignore

	let startingPositionBox = boardutil.getBoundingBoxOfAllPieces(pieces);
	// Fallback if no pieces present
	if (startingPositionBox === undefined)
		startingPositionBox = { left: 1n, right: 8n, bottom: 1n, top: 8n };

	// worldBorder: Receives the smaller of the two, if either the variant property or the override are defined.
	let worldBorderProperty: bigint | undefined = variantpreviewer.getVariantWorldBorder(
		variant?.mod,
	);
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

	return {
		pieces,
		existingTypes,
		existingRawTypes,
		state,
		editor,
		variant,
		startSnapshot,
	};
}

// Exports -----------------------------------------------------------------

export default {
	initBoardPreview,
};
