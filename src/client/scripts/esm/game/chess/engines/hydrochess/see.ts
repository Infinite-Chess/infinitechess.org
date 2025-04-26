// @ts-ignore
import type { gamefile } from "../../../../chess/logic/gamefile.js";
import type { Coords } from "../../../../chess/util/coordutil.js";
import type { Player } from "../../../../chess/util/typeutil.js";
import boardutil from "../../../../chess/util/boardutil.js";
import typeutil, { players } from "../../../../chess/util/typeutil.js";
// @ts-ignore
import checkdetection, { Attacker } from "../../../../chess/logic/checkdetection.js";
import { PIECE_VALUES } from "./evaluation.js";

/**
 * Static Exchange Evaluation (SEE)
 * Estimates the net material gain/loss resulting from a sequence of captures on a specific square.
 * @param lf Game state
 * @param targetSquare The square where the capture sequence is initiated.
 * @param moveMakerColor The color of the player making the initial move.
 * @returns The estimated material gain (positive) or loss (negative) for the side initiating the capture.
 */
export function staticExchangeEvaluation(lf: gamefile, targetSquare: Coords, moveMakerColor: Player): number {
	const initialVictim = boardutil.getPieceFromCoords(lf.pieces, targetSquare);
	if (!initialVictim) {
		return 0; // Cannot perform SEE on an empty square
	}

	const gain: number[] = [];	
	const initialVictimValue = PIECE_VALUES[typeutil.getRawType(initialVictim.type)] ?? 0;
	
	// Get attackers for each color separately
	const whiteAttackersRaw: Attacker[] = [];
	checkdetection.isSquareBeingAttacked(lf, targetSquare, players.WHITE, whiteAttackersRaw);
	const blackAttackersRaw: Attacker[] = [];
	checkdetection.isSquareBeingAttacked(lf, targetSquare, players.BLACK, blackAttackersRaw);

	// Map attackers to { coords, value } and sort them by value (ascending)
	const mapAndSortAttackers = (attackers: Attacker[]): { coords: Coords, value: number }[] => {
		return attackers
			.map(attacker => {
				const piece = boardutil.getPieceFromCoords(lf.pieces, attacker.coords);
				// Assume piece is always found if isSquareBeingAttacked returned these coords
				const value = piece ? (PIECE_VALUES[typeutil.getRawType(piece.type)] ?? 0) : 0; 
				return { coords: attacker.coords, value };
			})
			.sort((a, b) => a.value - b.value);
	};

	const whiteAttackersSorted = mapAndSortAttackers(whiteAttackersRaw);
	const blackAttackersSorted = mapAndSortAttackers(blackAttackersRaw);
	let whiteIdx = 0;
	let blackIdx = 0;

	// Start with the side OPPOSITE to the piece being captured
	let attackerColor = typeutil.invertPlayer(typeutil.getColorFromType(initialVictim.type));
	let currentVictimValue = initialVictimValue;

	while (true) {
		let currentAttackerList;
		let currentIdx;

		if (attackerColor === players.WHITE) {
			currentAttackerList = whiteAttackersSorted;
			currentIdx = whiteIdx;
		} else {
			currentAttackerList = blackAttackersSorted;
			currentIdx = blackIdx;
		}

		if (currentIdx >= currentAttackerList.length) {
			break; // No more attackers of this color
		}

		// Least valuable attacker is at the current index in the sorted list
		const leastValuableAttackerInfo = currentAttackerList[currentIdx];

		// Increment the index for the next iteration for this color
		if (attackerColor === players.WHITE) {
			whiteIdx++;
		} else {
			blackIdx++;
		}

		// The current piece on the square is captured. Record its value.
		gain.push(currentVictimValue);

		// The piece that just captured is now the potential victim for the next capture
		currentVictimValue = leastValuableAttackerInfo!.value;

		// Switch sides for the next potential capture
		attackerColor = typeutil.invertPlayer(attackerColor);
	}

	// Calculate the final score from the gain list
	// The calculation works backward through the captures.
	// Start with score = 0. For each step i from end to start:
	// score = max(0, gain[i] - score)
	// This reflects whether keeping the current material state (score)
	// is better than making the capture (gain[i] - score).
	let score = 0;
	for (let i = gain.length - 1; i >= 0; i--) {
		score = Math.max(0, gain[i]! - score);
	}

	// The score calculated is from the perspective of the *first* attacker.
	// We need to adjust it based on who made the initial move (moveMakerColor).
	const firstAttackerColor = typeutil.invertPlayer(typeutil.getColorFromType(initialVictim.type));
	if (moveMakerColor !== firstAttackerColor) {
		score = -score; // Invert score if the move maker wasn't the first to capture
	}

	return score;
}