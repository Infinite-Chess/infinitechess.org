/**
 * This script contains our checkmate algorithm.
 */

import type { FullGame } from './gamefile.js';
import type { Coords } from '../util/coordutil.js';
import type { Player } from '../util/typeutil.js';
import type { Piece } from '../util/boardutil.js';
import type { OrganizedPieces } from './organizedpieces.js';
import type { Vec2Key } from '../../util/math/vectors.js';

import typeutil from '../util/typeutil.js';
import gamefileutility from '../util/gamefileutility.js';
import boardutil from '../util/boardutil.js';
import moveutil from '../util/moveutil.js';
import legalmoves from './legalmoves.js';
import vectors from '../../util/math/vectors.js';
import organizedpieces from './organizedpieces.js';
import { players, rawTypes } from '../util/typeutil.js';
import { primalityTest } from '../../util/isprime.js';

/** The maximum number of pieces in-game to still use the checkmate algorithm. Above this uses "royalcapture". */
const pieceCountToDisableCheckmate = 50_000;

/** The maximum number of royal pieces in-game to still use the checkmate algorithm. Above this uses "royalcapture". */
const royalCountToDisableCheckmate = 6;

/**
 * Calculates if the provided gamefile is over by checkmate or stalemate
 * @param gamefile - The gamefile to detect if it's in checkmate
 * @returns The color of the player who won by checkmate. '1 checkmate', '2 checkmate', or '0 stalemate'. Or *undefined* if the game isn't over or we can't determine.
 */
function detectCheckmateOrStalemate(gamefile: FullGame): string | undefined {
	const { basegame, boardsim } = gamefile;

	// The game will be over when the player has zero legal moves remaining, lose or draw.
	// Iterate through every piece, calculating its legal moves. The first legal move we find, we
	// know the game is not over yet...

	const color = basegame.whosTurn;

	// Check for Huygens that might complicate checkmate detection
	const huygenType = typeutil.buildType(rawTypes.HUYGEN, color);
	const huygenPieces = boardsim.pieces.typeRanges.get(huygenType);
	const hasHuygens = huygenPieces && huygenPieces.end > huygenPieces.start;

	for (const rType of Object.values(rawTypes)) {
		const thisType = typeutil.buildType(rType, color);
		const thesePieces = boardsim.pieces.typeRanges.get(thisType);
		if (!thesePieces) continue; // The game doesn't have this type of piece
		for (let idx = thesePieces.start; idx < thesePieces.end; idx++) {
			const thisPiece = boardutil.getPieceFromIdx(boardsim.pieces, idx);
			if (!thisPiece) continue; // Piece undefined. We leave in deleted pieces so others retain their index!

			// Skip Huygens for now - we'll check them separately
			if (rType === rawTypes.HUYGEN) continue;

			const moves = legalmoves.calculateAll(gamefile, thisPiece);
			if (legalmoves.hasAtleast1Move(moves)) return undefined; // Found a legal move, not checkmate
		}
	}

	// If we have Huygens, check if they can save the king
	if (hasHuygens) {
		const huygenResult = canHuygensSaveKing(gamefile, color);
		if (huygenResult === true) return undefined; // Huygen can save the king
		if (huygenResult === undefined) return undefined; // Can't determine, assume not checkmate
	}

	// We made it through every single piece without finding a single move.
	// So is this draw or checkmate? Depends on whether the current state is check!
	// Also make sure that checkmate can't happen if the winCondition is NOT checkmate!
	const usingCheckmate = gamefileutility.isOpponentUsingWinCondition(
		basegame,
		basegame.whosTurn,
		'checkmate',
	);
	if (gamefileutility.isCurrentViewedPositionInCheck(boardsim) && usingCheckmate) {
		const colorThatWon = moveutil.getColorThatPlayedMoveIndex(
			basegame,
			boardsim.moves.length - 1,
		);
		return `${colorThatWon} checkmate`;
	} else return `${players.NEUTRAL} stalemate`; // Victor of player NEUTRAL means it was a draw.
}

/**
 * Checks if any Huygen of the given color can save the king from check.
 * @returns true if a Huygen can save the king, false if not, undefined if we can't determine (Huygen on same ray as checker-king)
 */
function canHuygensSaveKing(gamefile: FullGame, color: Player): boolean | undefined {
	const { boardsim } = gamefile;

	// Get the attackers (checkers)
	const attackers = boardsim.state.local.attackers;
	if (!attackers || attackers.length === 0) return false; // Not in check, Huygens can't "save" anything

	// Get the royal coords (king position)
	const royalCoords = boardutil.getRoyalCoordsOfColor(boardsim.pieces, color);
	if (royalCoords.length === 0) return false; // No king to save

	const kingCoords = royalCoords[0]!;

	// Get all Huygens of this color
	const huygenType = typeutil.buildType(rawTypes.HUYGEN, color);
	const huygenRange = boardsim.pieces.typeRanges.get(huygenType);
	if (!huygenRange) return false;

	const huygens: Piece[] = [];
	for (let idx = huygenRange.start; idx < huygenRange.end; idx++) {
		const huygen = boardutil.getPieceFromIdx(boardsim.pieces, idx);
		if (huygen) huygens.push(huygen);
	}

	if (huygens.length === 0) return false;

	const pieces = boardsim.pieces;

	// For each attacker, check if any Huygen can capture it or block it
	for (const attacker of attackers) {
		const attackerCoords = attacker.coords;

		// Check if any Huygen can capture the attacker
		for (const huygen of huygens) {
			if (canHuygenReachSquare(pieces, huygen.coords, attackerCoords)) {
				// Huygen can capture the attacker - but is it pinned?
				// For simplicity, if Huygen is on the same ray as king-attacker, return undefined
				if (isOnSameRay(huygen.coords, kingCoords, attackerCoords)) {
					return undefined; // Can't determine
				}
				return true; // Huygen can capture and is not on the same ray
			}
		}

		// If it's a sliding check, check if any Huygen can block
		if (attacker.slidingCheck) {
			for (const huygen of huygens) {
				// If Huygen is on the same ray as king-attacker, return undefined
				if (isOnSameRay(huygen.coords, kingCoords, attackerCoords)) {
					return undefined; // Can't determine
				}

				// Check if Huygen can block by moving to a square between king and attacker
				const blockResult = canHuygenBlockCheck(pieces, huygen.coords, kingCoords, attackerCoords);
				if (blockResult === true) return true;
				if (blockResult === undefined) return undefined;
			}
		}
	}

	return false; // No Huygen can save the king
}

/**
 * Checks if a Huygen can reach a target square (prime distance on orthogonal line, no blockers)
 * @param pieces - The organized pieces to check for blockers
 * @param huygenCoords - The Huygen's position
 * @param targetCoords - The target square
 * @returns true if Huygen can reach the target
 */
function canHuygenReachSquare(pieces: OrganizedPieces, huygenCoords: Coords, targetCoords: Coords): boolean {
	// Huygen moves like a rook but only to prime distances
	// Check if target is on same rank or file
	if (huygenCoords[0] !== targetCoords[0] && huygenCoords[1] !== targetCoords[1]) {
		return false; // Not on same rank or file
	}

	const distance = vectors.chebyshevDistance(huygenCoords, targetCoords);
	if (!primalityTest(distance)) return false; // Not a prime distance

	// Check for blockers between Huygen and target
	// For Huygens, a piece only blocks if it's at a prime distance from the Huygen
	return !isHuygenPathBlocked(pieces, huygenCoords, targetCoords);
}

/**
 * Checks if a point is on the same ray (line) as two other points
 */
function isOnSameRay(point: Coords, lineStart: Coords, lineEnd: Coords): boolean {
	// Check if point is on the line defined by lineStart and lineEnd
	const line1 = vectors.getLineGeneralFormFrom2Coords(lineStart, lineEnd);
	const line2 = vectors.getLineGeneralFormFrom2Coords(lineStart, point);
	return vectors.areLinesInGeneralFormEqual(line1, line2);
}

/**
 * Checks if a Huygen can block a sliding check by moving to a square between king and attacker.
 * @param pieces - The organized pieces to check for blockers
 * @returns true if can block, false if cannot, undefined if can't determine
 */
function canHuygenBlockCheck(pieces: OrganizedPieces, huygenCoords: Coords, kingCoords: Coords, attackerCoords: Coords): boolean | undefined {
	// The Huygen moves orthogonally (like a rook)
	// We need to find if any of the Huygen's rays intersect with the king-attacker ray
	// at a point that is:
	// 1. Between the king and attacker
	// 2. At a prime distance from the Huygen
	// 3. Not blocked by another piece at prime distance

	// Get the direction from king to attacker
	const kingToAttacker: Coords = [
		attackerCoords[0] - kingCoords[0],
		attackerCoords[1] - kingCoords[1],
	];

	// Huygen's possible move directions (orthogonal)
	const huygenDirections: Coords[] = [[1n, 0n], [-1n, 0n], [0n, 1n], [0n, -1n]];

	for (const dir of huygenDirections) {
		// Find intersection of Huygen's ray with king-attacker line
		// Huygen ray: huygenCoords + t * dir
		// King-attacker line: kingCoords + s * kingToAttacker

		// Solve for intersection
		// huygenCoords[0] + t * dir[0] = kingCoords[0] + s * kingToAttacker[0]
		// huygenCoords[1] + t * dir[1] = kingCoords[1] + s * kingToAttacker[1]

		const dx = kingCoords[0] - huygenCoords[0];
		const dy = kingCoords[1] - huygenCoords[1];

		const det = dir[0] * (-kingToAttacker[1]) - dir[1] * (-kingToAttacker[0]);
		if (det === 0n) continue; // Parallel lines, no intersection (or same line - but we already checked that)

		// t = (dx * (-kingToAttacker[1]) - dy * (-kingToAttacker[0])) / det
		const tNumerator = dx * (-kingToAttacker[1]) - dy * (-kingToAttacker[0]);
		if (tNumerator % det !== 0n) continue; // Not an integer intersection
		const t = tNumerator / det;

		if (t === 0n) continue; // Can't stay in place

		// Calculate intersection point
		const intersectX = huygenCoords[0] + t * dir[0];
		const intersectY = huygenCoords[1] + t * dir[1];
		const intersect: Coords = [intersectX, intersectY];

		// Check if intersection is between king and attacker (exclusive of both)
		const minX = kingCoords[0] < attackerCoords[0] ? kingCoords[0] : attackerCoords[0];
		const maxX = kingCoords[0] > attackerCoords[0] ? kingCoords[0] : attackerCoords[0];
		const minY = kingCoords[1] < attackerCoords[1] ? kingCoords[1] : attackerCoords[1];
		const maxY = kingCoords[1] > attackerCoords[1] ? kingCoords[1] : attackerCoords[1];

		if (intersectX <= minX || intersectX >= maxX) {
			if (kingCoords[0] !== attackerCoords[0]) continue; // Not between on X axis
		}
		if (intersectY <= minY || intersectY >= maxY) {
			if (kingCoords[1] !== attackerCoords[1]) continue; // Not between on Y axis
		}

		// Check if the distance from Huygen to intersection is prime
		const distance = vectors.chebyshevDistance(huygenCoords, intersect);
		if (!primalityTest(distance)) continue; // Not a prime distance, can't move here

		// Check for blockers between Huygen and intersection
		if (!isHuygenPathBlocked(pieces, huygenCoords, intersect)) {
			return true; // Huygen can block!
		}
	}

	return false; // No blocking move found
}

/**
 * Checks if a Huygen's path to a target is blocked by any piece at a prime distance.
 * Uses organized lines to efficiently check only pieces on the same line.
 */
function isHuygenPathBlocked(pieces: OrganizedPieces, huygenCoords: Coords, targetCoords: Coords): boolean {
	// Huygen moves orthogonally, so step is [1,0] or [0,1]
	const step: Coords = huygenCoords[0] === targetCoords[0] ? [0n, 1n] : [1n, 0n];
	const lineKey: Vec2Key = `${step[0]},${step[1]}`;

	// Get all pieces on this line
	const lineGroup = pieces.lines.get(lineKey);
	if (!lineGroup) return false; // No pieces on this line type

	const key = organizedpieces.getKeyFromLine(step, huygenCoords);
	const piecesOnLine = lineGroup.get(key);
	if (!piecesOnLine) return false; // No pieces on this specific line

	// Determine which axis to compare (x for horizontal, y for vertical)
	const axis = step[0] === 0n ? 1 : 0;
	const huygenPos = huygenCoords[axis];
	const targetPos = targetCoords[axis];
	const minPos = huygenPos < targetPos ? huygenPos : targetPos;
	const maxPos = huygenPos > targetPos ? huygenPos : targetPos;

	// Check each piece on the line
	for (const idx of piecesOnLine) {
		const piece = boardutil.getPieceFromIdx(pieces, idx);
		if (!piece) continue;

		const piecePos = piece.coords[axis];

		// Is this piece between Huygen and target? (exclusive)
		if (piecePos <= minPos || piecePos >= maxPos) continue;

		// Calculate distance from Huygen to this piece
		const distanceFromHuygen = huygenPos < targetPos
			? piecePos - huygenPos
			: huygenPos - piecePos;

		// For Huygens, a piece only blocks if it's at a prime distance
		if (primalityTest(distanceFromHuygen)) {
			return true; // Blocked!
		}
		// Non-prime distance - Huygen hops over this piece
	}

	return false; // No blockers
}

export { pieceCountToDisableCheckmate, royalCountToDisableCheckmate, detectCheckmateOrStalemate };
