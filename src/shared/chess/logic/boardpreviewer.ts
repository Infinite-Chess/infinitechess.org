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
import type { OrganizedPiecesBase } from './organizedpieces.js';
import type { GameState, GlobalGameState } from './state.js';
import type { Snapshot, VariantOptions, LoadedVariant } from './gamefile.js';

import jsutil from '../../util/jsutil.js';
import bimath from '../../util/math/bimath.js';
import organizedpieces from './organizedpieces.js';
import variantpreviewer from '../variants/variantpreviewer.js';

// Types ------------------------------------------------------------------

/** Shared setup options for board and board-preview initialization. */
export interface BoardInitOptions {
	/** Optional variant-specific state for custom or loaded positions. */
	variantOptions?: VariantOptions;
	/** Whether the board is being built for the editor. */
	editor?: boolean;
	/** Only has an effect if the `worldBorder` gamerule is not present. */
	worldBorderDist?: bigint;
	/** Clamps each generated world-border edge to this absolute coordinate. */
	worldBorderCap?: bigint;
}

/**
 * The lightweight subset of {@link Board} used by preview renderers.
 * Contains everything needed to render a static position snapshot, but
 * none of the move-execution fields (pieceMovesets, specialMoves, vicinity,
 * specialVicinity, moves).
 */
export type BoardPreview = {
	/**
	 * An array of all types of pieces that are in this game, without their color extension: `['pawns','queens']`,
	 * including pieces that may join via promotion or the board editor.
	 */
	existingTypes: number[];
	/**
	 * An array of all RAW piece types that are in this game,
	 * including pieces that may join via promotion or the board editor.
	 */
	existingRawTypes: RawType[];

	pieces: OrganizedPiecesBase;
	state: GameState;

	/** Determines turn order, win conditions, promotion, etc. */
	gameRules: GameRules;

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
	/** The rules to base the board on. */
	gameRulesIn: GameRules,
	variant: LoadedVariant | undefined,
	options: BoardInitOptions = {},
): BoardPreview {
	const { variantOptions, editor = false, worldBorderDist, worldBorderCap } = options;

	// The board owns its rules: the generated world border is written onto this copy, never the
	// caller's object — callers commonly retain their options, and a cached or stored position
	// must not acquire a board's rules.
	const gameRules: GameRules = jsutil.deepCopyObject(gameRulesIn);

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
		({ position, specialRights } = variantpreviewer.getStartingPositionOfVariant(variant));
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

	const { pieces, existingTypes, existingRawTypes, boundingBox } = organizedpieces.processInitialPosition(position, gameRules.turnOrder, editor, gameRules.promotion); // prettier-ignore

	let startingPositionBox = boundingBox;
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
		const generatedBorder = {
			left: startingPositionBox.left - worldBorderProperty,
			right: startingPositionBox.right + worldBorderProperty,
			bottom: startingPositionBox.bottom - worldBorderProperty,
			top: startingPositionBox.top + worldBorderProperty,
		};
		if (worldBorderCap !== undefined) {
			generatedBorder.left = bimath.max(generatedBorder.left, -worldBorderCap);
			generatedBorder.right = bimath.min(generatedBorder.right, worldBorderCap);
			generatedBorder.bottom = bimath.max(generatedBorder.bottom, -worldBorderCap);
			generatedBorder.top = bimath.min(generatedBorder.top, worldBorderCap);
		}
		gameRules.worldBorder = generatedBorder;
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
		gameRules,
		editor,
		variant,
		startSnapshot,
	};
}

// Exports -----------------------------------------------------------------

export default {
	initBoardPreview,
};
