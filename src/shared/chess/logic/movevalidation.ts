import premoves from '../../../client/scripts/esm/game/chess/premoves';
import jsutil from '../../util/jsutil';
import boardutil, { Piece } from '../util/boardutil';
import typeutil, { Player, RawType, rawTypes as r } from '../util/typeutil';
import winconutil from '../util/winconutil';
import checkresolver from './checkresolver';
import { FullGame } from './gamefile';
import icnconverter, { _Move_Compact } from './icn/icnconverter';
import legalmoves from './legalmoves';
import movepiece, { CoordsSpecial, MoveDraft } from './movepiece';
import specialdetect from './specialdetect';

// Type Definitions ------------------------------------------------------------

type MoveValidationResult = { valid: true; draft: MoveDraft } | { valid: false; reason: string };
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

	// Safety check: Make sure premoves are not applied.
	// They should be unapplied before calling this function and reapplied afterwards.
	if (premoves.arePremovesApplied()) {
		throw new Error('Cannot run validation while premoves are applied. Rewind them first.');
	}

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
 * @param move_compact - The move in compact JSON format
 * @param claimedGameConclusion - The opponent's claimed game conclusion
 * @returns An object containing either:
 * - `valid: true` and the `draft` of the move with any special flags attached.
 * - `valid: false` and a `reason` string explaining why it is illegal.
 */
function isOpponentsMoveLegal(
	gamefile: FullGame,
	move_compact: _Move_Compact,
	claimedGameConclusion: string | undefined,
): MoveValidationResult {
	// We run both move and conclusion checks when at the front of the game
	return runActionAtGameFront(gamefile, () => {
		// 1. Check Move Legality
		const moveResult = validateMove(gamefile, move_compact);
		if (!moveResult.valid) return moveResult;

		// 2. Check Conclusion Validity (using the draft with special flags attached)
		const conclusionResult = validateConclusion(
			gamefile,
			moveResult.draft,
			claimedGameConclusion,
		);

		if (!conclusionResult.valid) return conclusionResult;

		// At this stage, both move and conclusion are valid!
		return { valid: true, draft: moveResult.draft };
	});
}

/**
 * Tests if the provided compact move string is legal to play.
 * @param gamefile - The gamefile
 * @param compact - The move that SHOULD be in compact string format (e.g. "x,y>x,y=Q"), but we can't trust all enginess response contents.
 * @returns An object containing either:
 * - `valid: true` and the `draft` of the move with any special flags attached.
 * - `valid: false` and a `reason` string explaining why it is illegal.
 */
function isEnginesMoveLegal(gamefile: FullGame, compact: unknown): MoveValidationResult {
	if (typeof compact !== 'string') return { valid: false, reason: 'Not a string.' };

	// Convert the move from compact short format "x,y>x,y=N" to JSON format
	let move_compact: MoveDraft;
	try {
		move_compact = icnconverter.parseMoveFromShortFormMove(compact);
	} catch (error: unknown) {
		const msg = error instanceof Error ? error.message : String(error);
		console.error(`Invalid format error when parsing compact move "${compact}": ${msg}`);
		// Return generic invalid reason
		return { valid: false, reason: 'Incorrect format.' };
	}

	return runActionAtGameFront(gamefile, () => {
		return validateMove(gamefile, move_compact);
	});
}

/**
 * CORE LOGIC: Checks validity of a move.
 * @param gamefile - The gamefile
 * @param move_compact - The move to validate in compact JSON format, without special flags attached.
 * @returns An object containing either:
 * - `valid: true` and the `draft` of the move with any special flags attached.
 * - `valid: false` and a `reason` string explaining why it is illegal.
 */
function validateMove(gamefile: FullGame, move_compact: _Move_Compact): MoveValidationResult {
	const { boardsim, basegame } = gamefile;

	const piecemoved: Piece | undefined = boardutil.getPieceFromCoords(
		boardsim.pieces,
		move_compact.startCoords,
	);

	// Make sure a piece exists on the start coords
	if (!piecemoved) return { valid: false, reason: 'No piece at start coords.' };

	// Make sure it matches the color of whos turn it is.
	const colorOfPieceMoved: Player = typeutil.getColorFromType(piecemoved.type);
	if (colorOfPieceMoved !== basegame.whosTurn)
		return { valid: false, reason: 'Incorrect color.' };

	const rawTypeMoved = typeutil.getRawType(piecemoved.type);

	promotion: if (move_compact.promotion !== undefined) {
		// User IS promoting
		if (!basegame.gameRules.promotionRanks)
			return { valid: false, reason: 'Game has no promotion ranks.' };
		if (rawTypeMoved !== r.PAWN) return { valid: false, reason: "Can't promote non-pawn." };

		const promotionRanks: bigint[] | undefined =
			basegame.gameRules.promotionRanks[colorOfPieceMoved];
		if (!promotionRanks) return { valid: false, reason: 'Color has no promotion ranks.' };

		if (!promotionRanks.includes(move_compact.endCoords[1]))
			return { valid: false, reason: 'No promotion rank at end coords.' };

		const colorPromotedTo: Player = typeutil.getColorFromType(move_compact.promotion);
		if (basegame.whosTurn !== colorPromotedTo)
			return { valid: false, reason: 'Incorrect promotion color.' };

		if (!basegame.gameRules.promotionsAllowed)
			return { valid: false, reason: 'Game has no promotions allowed.' };

		const promotionsAllowed: RawType[] | undefined =
			basegame.gameRules.promotionsAllowed[colorOfPieceMoved];
		if (!promotionsAllowed) return { valid: false, reason: 'Color has no promotions allowed.' };

		const rawPromotion: RawType = typeutil.getRawType(move_compact.promotion);
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

		if (!promotionRanks.includes(move_compact.endCoords[1])) break promotion; // Not on a promotion rank, not forced to promote.

		// If we are here: They moved a pawn to a promotion rank but didn't promote.
		return { valid: false, reason: 'Did not promote.' };
	}

	// Test if that piece's legal moves contain the destination coords...

	const endCoordsToAppendSpecialsTo: CoordsSpecial = jsutil.deepCopyObject(
		move_compact.endCoords,
	);

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
			endCoordsToAppendSpecialsTo,
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
			endCoordsToAppendSpecialsTo,
			colorOfPieceMoved,
		)
	) {
		return { valid: false, reason: 'Puts self in check.' };
	}

	// Now transfer the special move flags from the coords to the move draft
	specialdetect.transferSpecialFlags_FromCoordsToMove(endCoordsToAppendSpecialsTo, move_compact);

	// If we reach here, the move is valid!
	return { valid: true, draft: move_compact };
}

/**
 * Checks if the claimed game conclusion is the expected one after simulating the move.
 * @param gamefile - The gamefile
 * @param moveDraft - The move draft, WITH special flags attached!
 * @param claimedGameConclusion - The opponent's claimed game conclusion
 * @returns An object containing either:
 * - `valid: true`
 * - `valid: false` and a `reason` string explaining why it is illegal.
 */
function validateConclusion(
	gamefile: FullGame,
	moveDraft: MoveDraft,
	claimedGameConclusion: string | undefined,
): ConclusionValidityResult {
	if (
		claimedGameConclusion !== undefined &&
		!winconutil.isGameConclusionDecisive(claimedGameConclusion)
	) {
		// "Undecisive" (e.g. resignation, time, abort) conclusions are always valid since the server handles those.
		return { valid: true };
	}

	const moveDraftCopy = jsutil.deepCopyObject(moveDraft);
	const simulatedConclusion = movepiece.getSimulatedConclusion(gamefile, moveDraftCopy);

	if (simulatedConclusion !== claimedGameConclusion) {
		console.error(
			`Conclusion mismatch! Simulated: ${simulatedConclusion}, Claimed: ${claimedGameConclusion}`,
		);
		return { valid: false, reason: 'Wrong conclusion.' };
	}

	// If we reach here, the claimed conclusion is valid!
	return { valid: true };
}

export default {
	isEnginesMoveLegal,
	isOpponentsMoveLegal,
};
