// src/shared/chess/logic/movevalidation.ts

import type { FullGame, GameConclusion } from './gamefile.js';

import jsutil from '../../util/jsutil.js';
import winconutil from '../util/winconutil.js';
import legalmoves from './legalmoves.js';
import checkresolver from './checkresolver.js';
import specialdetect from './specialdetect.js';
import boardutil, { Piece } from '../util/boardutil.js';
import icnconverter, { MoveCoords } from './icn/icnconverter.js';
import movepiece, { CoordsTagged, MoveTagged } from './movepiece.js';
import typeutil, { Player, RawType, rawTypes as r } from '../util/typeutil.js';

// Types -----------------------------------------------------------------------

export type MoveValidationResult =
	| {
			valid: true;
			/** The move draft with any special flags attached, derived from its end coords. */
			tagged: MoveTagged;
	  }
	| {
			valid: false;
			/** The reason the move is illegal. */
			reason: string;
	  };
type ConclusionValidityResult = { valid: true } | { valid: false; reason: string };

// Functions -------------------------------------------------------------------

/**
 * UTILITY: Runs a specific validation action while the game is temporarily
 * fast-forwarded to the latest move. Afterwards restoring the game to its original state.
 * @param gamefile - The gamefile
 * @param action - The action to run while at the front of the game
 * @returns The result of the action
 */
function runActionAtGameFront<T>(gamefile: FullGame, action: () => T): T {
	const { boardsim } = gamefile;
	const originalMoveIndex = boardsim.state.local.moveIndex;

	// Fast Forward to the latest move (graphical updates skipped since we will return afterwards)
	movepiece.goToMove(boardsim, boardsim.moves.length - 1, (move) =>
		movepiece.applyMove(gamefile, move, true),
	);

	// Run the specific logic (move validation, conclusion check, etc)
	const result = action();

	// Rewind to original state
	movepiece.goToMove(boardsim, originalMoveIndex, (move) =>
		movepiece.applyMove(gamefile, move, false),
	);

	return result;
}

/**
 * Tests if the provided move is legal to play in this game,
 * including whether the claimed game conclusion is correct.
 * @param gamefile - The gamefile
 * @param moveCoords - The move in compact JSON format
 * @param claimedGameConclusion - The opponent's claimed game conclusion
 * @returns An object containing either:
 * - `valid: true` and the `draft` of the move with any special flags attached.
 * - `valid: false` and a `reason` string explaining why it is illegal.
 */
function isOpponentsMoveLegal(
	gamefile: FullGame,
	moveCoords: MoveCoords,
	claimedGameConclusion: GameConclusion | undefined,
): MoveValidationResult {
	// We run both move and conclusion checks when at the front of the game
	return runActionAtGameFront(gamefile, () => {
		// 1. Check Move Legality
		const moveResult = validateMove(gamefile, moveCoords);
		if (!moveResult.valid) return moveResult;

		// 2. Check Conclusion Validity (using the draft with special flags attached)
		const conclusionResult = validateConclusion(
			gamefile,
			moveResult.tagged,
			claimedGameConclusion,
		);

		if (!conclusionResult.valid) return conclusionResult;

		// At this stage, both move and conclusion are valid!
		return moveResult;
	});
}

/**
 * Tests if the provided compact move string is legal to play.
 * @param gamefile - The gamefile
 * @param tokenMove - The move that SHOULD be in compact string format (e.g. "x,y>x,y=Q"), but we can't trust all enginess response contents.
 * @returns An object containing either:
 * - `valid: true` and the `draft` of the move with any special flags attached.
 * - `valid: false` and a `reason` string explaining why it is illegal.
 */
function isTokenMoveLegal(gamefile: FullGame, tokenMove: unknown): MoveValidationResult {
	if (typeof tokenMove !== 'string') return { valid: false, reason: 'Not a string.' };

	// Convert the move from compact short format "x,y>x,y=N" to JSON format
	let moveCoords: MoveCoords;
	try {
		moveCoords = icnconverter.parseTokenMove(tokenMove);
	} catch (error: unknown) {
		const msg = error instanceof Error ? error.message : String(error);
		console.error(`Invalid format error when parsing compact move "${tokenMove}": ${msg}`);
		// Return generic invalid reason
		return { valid: false, reason: 'Incorrect format.' };
	}

	return runActionAtGameFront(gamefile, () => {
		return validateMove(gamefile, moveCoords);
	});
}

/**
 * CORE LOGIC: Checks validity of a move.
 * REQUIRES you to be viewing the head of the game.
 * @param gamefile - The gamefile
 * @param moveCoords - The move to validate in compact JSON format, without special flags attached.
 * @returns An object containing either:
 * - `valid: true` and the `draft` of the move with any special flags attached.
 * - `valid: false` and a `reason` string explaining why it is illegal.
 */
function validateMove(gamefile: FullGame, moveCoords: MoveCoords): MoveValidationResult {
	const { boardsim, basegame } = gamefile;

	const piecemoved: Piece | undefined = boardutil.getPieceFromCoords(
		boardsim.pieces,
		moveCoords.startCoords,
	);

	// Make sure a piece exists on the start coords
	if (!piecemoved) return { valid: false, reason: 'No piece at start coords.' };

	// Make sure it matches the color of whos turn it is.
	const colorOfPieceMoved: Player = typeutil.getColorFromType(piecemoved.type);
	if (colorOfPieceMoved !== basegame.whosTurn)
		return { valid: false, reason: 'Incorrect color.' };

	const rawTypeMoved = typeutil.getRawType(piecemoved.type);

	promotion: if (moveCoords.promotion !== undefined) {
		// User IS promoting
		if (!basegame.gameRules.promotionRanks)
			return { valid: false, reason: 'Game has no promotion ranks.' };
		if (rawTypeMoved !== r.PAWN) return { valid: false, reason: "Can't promote non-pawn." };

		const promotionRanks: bigint[] | undefined =
			basegame.gameRules.promotionRanks[colorOfPieceMoved];
		if (!promotionRanks) return { valid: false, reason: 'Color has no promotion ranks.' };

		if (!promotionRanks.includes(moveCoords.endCoords[1]))
			return { valid: false, reason: 'No promotion rank at end coords.' };

		const colorPromotedTo: Player = typeutil.getColorFromType(moveCoords.promotion);
		if (basegame.whosTurn !== colorPromotedTo)
			return { valid: false, reason: 'Incorrect promotion color.' };

		if (!basegame.gameRules.promotionsAllowed)
			return { valid: false, reason: 'Game has no promotions allowed.' };

		const promotionsAllowed: RawType[] | undefined =
			basegame.gameRules.promotionsAllowed[colorOfPieceMoved];
		if (!promotionsAllowed) return { valid: false, reason: 'Color has no promotions allowed.' };

		const rawPromotion: RawType = typeutil.getRawType(moveCoords.promotion);
		if (!promotionsAllowed.includes(rawPromotion))
			return { valid: false, reason: 'Illegal promotion type.' };
	} else {
		// User is NOT promoting
		// Make sure they aren't moving to a promotion rank WITHOUT promoting! That's also illegal.
		if (!basegame.gameRules.promotionRanks) break promotion; // This game doesn't have promotion.

		if (rawTypeMoved !== r.PAWN) break promotion; // Not a pawn, not forced to promote.

		const promotionRanks: bigint[] | undefined =
			basegame.gameRules.promotionRanks[colorOfPieceMoved];
		if (!promotionRanks) break promotion; // This color doesn't have promotion ranks, not forced to promote.

		if (!promotionRanks.includes(moveCoords.endCoords[1])) break promotion; // Not on a promotion rank, not forced to promote.

		// If we are here: They moved a pawn to a promotion rank but didn't promote.
		return { valid: false, reason: 'Did not promote.' };
	}

	// Test if that piece's legal moves contain the destination coords...

	const endCoordsToAppendTagsTo: CoordsTagged = jsutil.deepCopyObject(moveCoords.endCoords);

	// This logic is pulled out of legalmoves.calculateAll(), so we can observe
	// it at each step to find the earliest illegality point of the move submission.

	const moveset = legalmoves.getPieceMoveset(gamefile.boardsim, piecemoved.type);
	const legalMoves = legalmoves.getEmptyLegalMoves(moveset);
	legalmoves.appendPotentialMoves(piecemoved, moveset, legalMoves);
	legalmoves.removeObstructedMoves(
		gamefile.boardsim,
		gamefile.basegame.gameRules.worldBorder,
		piecemoved,
		moveset,
		legalMoves,
		false,
	);
	legalmoves.appendSpecialMoves(gamefile, piecemoved, moveset, legalMoves, false);

	// Check if even the non-check-respecting move is legal first
	// This should pass on any special moves tags to endCoordsToAppendSpecialsTo at the same time.
	if (
		!legalmoves.checkIfMoveLegal(
			gamefile,
			legalMoves,
			piecemoved.coords,
			endCoordsToAppendTagsTo,
			colorOfPieceMoved,
		)
	) {
		return { valid: false, reason: 'Invalid destination coords.' };
	}

	checkresolver.removeCheckInvalidMoves(gamefile, piecemoved, legalMoves);

	// Now check if the check-respecting move is legal
	if (
		!legalmoves.checkIfMoveLegal(
			gamefile,
			legalMoves,
			piecemoved.coords,
			endCoordsToAppendTagsTo,
			colorOfPieceMoved,
		)
	) {
		return { valid: false, reason: 'Puts self in check.' };
	}

	// Now transfer the special move flags from the coords to the move draft
	specialdetect.transferSpecialTags_FromCoordsToMove(endCoordsToAppendTagsTo, moveCoords);

	// If we reach here, the move is valid!
	return { valid: true, tagged: moveCoords };
}

/**
 * Determines whether the opponent's claimed conclusion matches what we calculate from the position.
 * @param gamefile - The gamefile
 * @param moveTagged - The move draft, WITH special flags attached!
 * @param claimedGameConclusion - The opponent's claimed game conclusion
 * @returns An object containing either:
 * - `valid: true`
 * - `valid: false` and a `reason` string explaining why it is illegal.
 */
function validateConclusion(
	gamefile: FullGame,
	moveTagged: MoveTagged,
	claimedGameConclusion: GameConclusion | undefined,
): ConclusionValidityResult {
	if (
		claimedGameConclusion !== undefined &&
		!winconutil.isConclusionMoveTriggered(claimedGameConclusion.condition)
	) {
		// Non-move-triggered (e.g. resignation, time, abort) conclusions are always valid since the server handles those.
		return { valid: true };
	}

	const moveTaggedCopy = jsutil.deepCopyObject(moveTagged);
	const simulatedConclusion = movepiece.getSimulatedConclusion(gamefile, moveTaggedCopy);

	if (
		simulatedConclusion?.condition !== claimedGameConclusion?.condition ||
		simulatedConclusion?.victor !== claimedGameConclusion?.victor
	) {
		console.error(
			`Conclusion mismatch! Simulated: ${JSON.stringify(simulatedConclusion)}, Claimed: ${JSON.stringify(claimedGameConclusion)}`,
		);
		return { valid: false, reason: 'Wrong conclusion.' };
	}

	// If we reach here, the claimed conclusion is valid!
	return { valid: true };
}

export default {
	isTokenMoveLegal,
	isOpponentsMoveLegal,
	validateMove,
};
