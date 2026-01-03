/**
 * This script contains our checkmate algorithm.
 */

import type { FullGame } from './gamefile.js';
import type { Coords } from '../util/coordutil.js';
import type { Player } from '../util/typeutil.js';

import typeutil from '../util/typeutil.js';
import gamefileutility from '../util/gamefileutility.js';
import boardutil from '../util/boardutil.js';
import moveutil from '../util/moveutil.js';
import legalmoves from './legalmoves.js';
import vectors from '../../util/math/vectors.js';
import { players, rawTypes } from '../util/typeutil.js';

/** The maximum number of pieces in-game to still use the checkmate algorithm. Above this uses "royalcapture". */
const pieceCountToDisableCheckmate = 50_000;

/** The maximum number of royal pieces in-game to still use the checkmate algorithm. Above this uses "royalcapture". */
const royalCountToDisableCheckmate = 6;

/**
 * Calculates if the provided gamefile is over by checkmate or stalemate.
 * @param gamefile - The gamefile to detect if it's in checkmate
 * @returns The game conclusion string, or *undefined* if the game isn't over or we can't determine.
 */
function detectCheckmateOrStalemate(gamefile: FullGame): string | undefined {
	const { basegame, boardsim } = gamefile;
	const color = basegame.whosTurn;

	// If colinears are present and in check, we may not be able to determine checkmate reliably.
	// Return undefined if:
	// 1. The attacker is a Huygen (complex prime-distance blocking rules)
	// 2. A friendly Huygen is on the same ray as attacker-king (could potentially block)
	if (boardsim.colinearsPresent && gamefileutility.isCurrentViewedPositionInCheck(boardsim)) {
		if (isAttackerHuygen(boardsim) || isHuygenOnAttackerKingRay(gamefile, color)) {
			return undefined;
		}
	}

	// Iterate through every piece, calculating its legal moves.
	// The first legal move we find, we know the game is not over yet.
	for (const rType of Object.values(rawTypes)) {
		const thisType = typeutil.buildType(rType, color);
		const thesePieces = boardsim.pieces.typeRanges.get(thisType);
		if (!thesePieces) continue;
		for (let idx = thesePieces.start; idx < thesePieces.end; idx++) {
			const thisPiece = boardutil.getPieceFromIdx(boardsim.pieces, idx);
			if (!thisPiece) continue;

			const moves = legalmoves.calculateAll(gamefile, thisPiece);
			if (legalmoves.hasAtleast1Move(moves)) return undefined;
		}
	}

	// No legal moves found. Checkmate or stalemate?
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
	}
	return `${players.NEUTRAL} stalemate`;
}

/**
 * Checks if any of the attackers giving check is a Huygen.
 * If so, we can't reliably determine checkmate due to complex prime-distance blocking rules.
 */
function isAttackerHuygen(boardsim: FullGame['boardsim']): boolean {
	const attackers = boardsim.state.local.attackers;
	if (!attackers || attackers.length === 0) return false;

	for (const attacker of attackers) {
		const pieceOnSquare = boardutil.getTypeFromCoords(boardsim.pieces, attacker.coords);
		if (pieceOnSquare !== undefined && typeutil.getRawType(pieceOnSquare) === rawTypes.HUYGEN) {
			return true;
		}
	}
	return false;
}

/**
 * Checks if any Huygen of the given color is on the same ray as any attacker-king line.
 * If so, we can't reliably determine checkmate without complex simulation.
 */
function isHuygenOnAttackerKingRay(gamefile: FullGame, color: Player): boolean {
	const { boardsim } = gamefile;

	const attackers = boardsim.state.local.attackers;
	if (!attackers || attackers.length === 0) return false;

	// Get the actual royals that are in check (not all royals)
	const royalsInCheck = gamefileutility.getCheckCoordsOfCurrentViewedPosition(boardsim);
	if (royalsInCheck.length === 0) return false;

	const huygenType = typeutil.buildType(rawTypes.HUYGEN, color);
	const huygenRange = boardsim.pieces.typeRanges.get(huygenType);
	if (!huygenRange) return false;

	// Check each Huygen against each royal in check
	for (let idx = huygenRange.start; idx < huygenRange.end; idx++) {
		const huygen = boardutil.getPieceFromIdx(boardsim.pieces, idx);
		if (!huygen) continue;

		for (const kingCoords of royalsInCheck) {
			for (const attacker of attackers) {
				if (isPointOnLine(huygen.coords, kingCoords, attacker.coords)) {
					return true; // Huygen is on the attacker-king ray
				}
			}
		}
	}

	return false;
}

/** Checks if a point lies on the line defined by two other points. */
function isPointOnLine(point: Coords, lineStart: Coords, lineEnd: Coords): boolean {
	const line1 = vectors.getLineGeneralFormFrom2Coords(lineStart, lineEnd);
	const line2 = vectors.getLineGeneralFormFrom2Coords(lineStart, point);
	return vectors.areLinesInGeneralFormEqual(line1, line2);
}

export { pieceCountToDisableCheckmate, royalCountToDisableCheckmate, detectCheckmateOrStalemate };
