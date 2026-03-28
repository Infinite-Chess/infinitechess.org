// src/shared/chess/util/gamerules.ts

/**
 * This script contains the GameRules interface definition,
 * and contains utility methods for working with them.
 */

import type { Coords } from './coordutil.js';
import type { UnboundedRectangle } from '../../util/math/bounds.js';
import type { GameruleWinCondition } from './winconutil.js';
import type { PlayerFacingDirection } from '../logic/movesets.js';
import type { Player, RawType, PlayerGroup } from './typeutil.js';

interface GameRules {
	/** An object containing lists of what win conditions each color can win by. */
	winConditions: PlayerGroup<GameruleWinCondition[]>;
	/** A list of players that make up one full turn cycle. */
	turnOrder: Player[];
	/**
	 * Contains a list of all promotion ranks each color promotes at, if they can promote.
	 * If neither side can promote, this should be left as undefined.
	 */
	promotionRanks?: PlayerGroup<bigint[]>;
	/**
	 * An object containing arrays of raw types white and
	 * black can promote to, if it's legal for them to promote.
	 * If one color can't promote, their list should be left undefined.
	 */
	promotionsAllowed?: PlayerGroup<RawType[]>;
	/**
	 * How many plies (half-moves) can pass with no
	 * captures or pawn pushes until a draw is declared.
	 * Also known as the "50-move rule".
	 */
	moveRule?: number;
	/** The maximum number of steps any sliding piece can take. */
	slideLimit?: bigint;
	/**
	 * IF a world border is present, this is a bounding box
	 * containing all integer coordinates that are inside the
	 * playing area, not on or outside the world border.
	 * All pieces must be within this box.
	 * The inclusive playable region of the board.
	 */
	worldBorder?: UnboundedRectangle;
}

/** Checks if a specified color has a given win condition. */
function doesColorHaveWinCondition(
	gameRules: GameRules,
	color: Player,
	winCondition: GameruleWinCondition,
): boolean {
	return !!gameRules.winConditions[color]?.includes(winCondition);
	// The `!!` converts the result (true/false/undefined) strictly to boolean (true/false).
}

/** Gets the count of win conditions for a specified color in the game rules. */
function getWinConditionCountOfColor(gameRules: GameRules, player: Player): number {
	return gameRules.winConditions[player]?.length ?? 0;
}

/**
 * Swaps the "checkmate" win condition for "royalcapture" in the gameRules if applicable.
 * Modifies the gameRules object in place.
 */
function swapCheckmateForRoyalCapture(gameRules: GameRules): void {
	let changeMade = false;
	for (const winConditions of Object.values(gameRules.winConditions)) {
		// Remove "checkmate" if it exists
		const indexOf = winConditions.indexOf('checkmate');
		if (indexOf !== -1) {
			winConditions.splice(indexOf, 1); // Remove "checkmate'"
			winConditions.push('royalcapture'); // Add "royalcapture"
			changeMade = true;
		}
	}

	if (changeMade) console.log('Swapped checkmate win conditions for royalcapture.');
}

/**
 * Determines the first square the pawn at given coords may
 * promote at, depending on the nearest promotion rank ahead of it.
 *
 * The only scenario a pawn may skip this rank is if it's one below it, and is able to double push.
 */
function determinePromotionSquare(
	coords: Coords,
	facingDirection: PlayerFacingDirection,
	promotionRanks: bigint[],
): Coords | undefined {
	// The running closest rank ahead of the pawn
	let nearestRank: bigint | undefined = undefined;
	for (const rank of promotionRanks) {
		if (
			rank * facingDirection.parity > coords[facingDirection.axis] * facingDirection.parity &&
			(nearestRank === undefined ||
				rank * facingDirection.parity < nearestRank * facingDirection.parity)
		) {
			nearestRank = rank;
		}
	}
	if (nearestRank === undefined) return undefined; // No promotion ranks ahead of the pawn
	// Tweak the coords axis of movement to equal the promotion rank, to get the promotion square.
	const promotionSquare: Coords = [...coords];
	promotionSquare[facingDirection.axis] = nearestRank;
	return promotionSquare;
}

export default {
	doesColorHaveWinCondition,
	getWinConditionCountOfColor,
	swapCheckmateForRoyalCapture,
	determinePromotionSquare,
};

export type { GameRules };
