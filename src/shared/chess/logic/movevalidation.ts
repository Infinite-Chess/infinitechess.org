import premoves from '../../../client/scripts/esm/game/chess/premoves';
import jsutil from '../../util/jsutil';
import boardutil, { Piece } from '../util/boardutil';
import moveutil from '../util/moveutil';
import typeutil, { Player, RawType, rawTypes as r } from '../util/typeutil';
import winconutil from '../util/winconutil';
import { FullGame } from './gamefile';
import icnconverter, { _Move_Compact } from './icn/icnconverter';
import legalmoves from './legalmoves';
import movepiece, { CoordsSpecial, MoveDraft } from './movepiece';
import specialdetect from './specialdetect';

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
	if (premoves.arePremovesApplied()) {
		throw new Error('Cannot run validation while premoves are applied.');
	}

	try {
		// Fast Forward to the latest move (graphical updates skipped since we will return afterwards)
		movepiece.goToMove(boardsim, boardsim.moves.length - 1, (move) =>
			movepiece.applyMove(gamefile, move, true),
		);

		// 2. Run the specific logic (move validation, conclusion check, etc)
		return action();
	} finally {
		// Rewind to original spot (Always runs, even if action throws error)
		movepiece.goToMove(boardsim, originalMoveIndex, (move) =>
			movepiece.applyMove(gamefile, move, false),
		);
	}
}

/**
 * Tests if the provided move is legal to play in this game,
 * including whether the claimed game conclusion is correct.
 *
 * MODIFIES THE MOVE DRAFT to attach any special move flags it needs!
 * @param gamefile - The gamefile
 * @param move_compact - The move, with the bare minimum properties: `{ startCoords, endCoords, promotion }`. This will be mutated to attach any special move flags!
 * @returns *true* If the move is legal, otherwise a string containing why it is illegal.
 */
function isOpponentsMoveLegal(
	gamefile: FullGame,
	move_compact: _Move_Compact,
	claimedGameConclusion: string | undefined,
): MoveValidationResult {
	const moveValidationResult: MoveValidationResult = checkMoveDraftValidity(
		gamefile,
		move_compact,
	);
	if (!moveValidationResult.valid) return moveValidationResult;
	// Move is legal so far, with any special flags attached to moveDraft

	// Now, simulate the move to see if the resulting game conclusion matches their claim.
	// Used to prevent cheating by claiming a win when they didn't actually achieve it.

	const conclusionValidationResult = checkConclusionValidity(
		gamefile,
		moveValidationResult.draft,
		claimedGameConclusion,
	);
	if (!conclusionValidationResult.valid) return conclusionValidationResult;

	// By this point, the move is legal and the claimed conclusion is valid!

	return { valid: true, draft: moveValidationResult.draft };
}

type MoveValidationResult = { valid: true; draft: MoveDraft } | { valid: false; reason: string };

/**
 * Tests if the provided move is legal to play.
 * If so, returns the special flags that go with it, if it is a special move.
 * This accounts for the piece color AND legal promotions, AND their claimed game conclusion.
 * @param gamefile - The gamefile
 * @param compact - The move in the most compact string notation (e.g. 'x,y>x,y=Q')
 * @returns An object containing either:
 * - `valid: true` and the `draft` of the move with any special flags attached.
 * - `valid: false` and a `reason` string explaining why it is illegal.
 */
function checkCompactMoveValidity(gamefile: FullGame, compact: string): MoveValidationResult {
	// Safety check: Make sure premoves are not applied.
	if (premoves.arePremovesApplied())
		throw new Error(
			'Cannot check move validity while premoves are applied. Rewind them first.',
		);

	// Convert the move from compact short format "x,y>x,y=N"
	let moveDraft: MoveDraft; // { startCoords, endCoords, promotion }
	try {
		moveDraft = icnconverter.parseMoveFromShortFormMove(compact); // { startCoords, endCoords, promotion }
	} catch (error: unknown) {
		const msg = error instanceof Error ? error.message : String(error);
		console.error(`Invalid format error when parsing compact move "${compact}": ${msg}`);
		// Return generic invalid reason
		return { valid: false, reason: 'Incorrect format.' };
	}

	return checkMoveDraftValidity(gamefile, moveDraft);
}

function checkMoveDraftValidity(
	gamefile: FullGame,
	move_compact: _Move_Compact,
): MoveValidationResult {
	const { boardsim } = gamefile;

	// Used to return to this move after we're done simulating
	const originalMoveIndex = boardsim.state.local.moveIndex;
	// Go to the front of the game, making zero graphical changes (we'll return to this spot after simulating for validity)
	movepiece.goToMove(boardsim, boardsim.moves.length - 1, (move) =>
		movepiece.applyMove(gamefile, move, true),
	);

	const validationResult: MoveValidationResult = moveValidityWrapper(gamefile, move_compact);

	// Rewind the game back to the index we were originally on before simulating
	movepiece.goToMove(boardsim, originalMoveIndex, (move) =>
		movepiece.applyMove(gamefile, move, false),
	);

	return validationResult;
}

/**
 * Checks the validity of the move, attaching any special flags to the moveDraft if valid.
 * REQUIRES us to be at the front of the game already!
 * @param gamefile - The gamefile
 * @param move_compact - The move draft to validate, without special flags attached yet.
 * @returns An object containing either:
 * - `valid: true` and the `draft` of the move with any special flags attached.
 * - `valid: false` and a `reason` string explaining why it is illegal.
 */
function moveValidityWrapper(
	gamefile: FullGame,
	move_compact: _Move_Compact,
): MoveValidationResult {
	const { boardsim, basegame } = gamefile;

	// Safety checks: Make sure we're at the front of the game, with no premoves applied.
	if (!moveutil.areWeViewingLatestMove(gamefile.boardsim))
		throw new Error('Checking move validity requires us to be at the front of the game!');
	if (premoves.arePremovesApplied())
		throw new Error(
			'Checking move validity requires premoves to not be applied. Rewind them first.',
		);

	// Make sure a piece exists on the start coords
	const piecemoved: Piece | undefined = boardutil.getPieceFromCoords(
		boardsim.pieces,
		move_compact.startCoords,
	);
	if (!piecemoved) return { valid: false, reason: 'No piece at start coords.' };
	const rawTypeMoved = typeutil.getRawType(piecemoved.type);

	// Make sure it matches the color of whos turn it is.
	const colorOfPieceMoved: Player = typeutil.getColorFromType(piecemoved.type);
	if (colorOfPieceMoved !== basegame.whosTurn)
		return { valid: false, reason: 'Incorrect color.' }; // Can only move pieces of the color of whos turn it is.

	// If there is a promotion, make sure that's legal
	promotion: if (move_compact.promotion !== undefined) {
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
		// No promotion, make sure they AREN'T moving to a promotion rank WITHOUT promoting! That's also illegal.
		if (!basegame.gameRules.promotionRanks) break promotion; // This game doesn't have promotion.

		if (rawTypeMoved !== r.PAWN) break promotion; // Not a pawn, not forced to promote.

		const promotionRanks: bigint[] | undefined =
			basegame.gameRules.promotionRanks[colorOfPieceMoved];
		if (!promotionRanks) break promotion; // This color doesn't have promotion ranks, not forced to promote.

		if (!promotionRanks.includes(move_compact.endCoords[1])) break promotion; // Not on a promotion rank, not forced to promote.

		return { valid: false, reason: 'Did not promote.' };
	}

	// Test if that piece's legal moves contain the destinationCoords.
	const legalMoves = legalmoves.calculateAll(gamefile, piecemoved);

	// This should pass on any special moves tags at the same time.
	const endCoordsToAppendSpecialsTo: CoordsSpecial = jsutil.deepCopyObject(
		move_compact.endCoords,
	);
	if (
		!legalmoves.checkIfMoveLegal(
			gamefile,
			legalMoves,
			piecemoved.coords,
			endCoordsToAppendSpecialsTo,
			colorOfPieceMoved,
		)
	)
		return { valid: false, reason: 'Illegal destination coords.' };

	// Transfer the special move flags to the moveDraft
	specialdetect.transferSpecialFlags_FromCoordsToMove(endCoordsToAppendSpecialsTo, move_compact);

	// If we reach here, the move is valid!
	return { valid: true, draft: move_compact };
}

type ConclusionValidityResult = { valid: true } | { valid: false; reason: string };

/**
 * Checks if the claimed game conclusion after the provided moveDraft is correct.
 * REQUIRES us to be at the front of the game already!
 * @param gamefile - The gamefile
 * @param moveDraft - The move draft to simulate the conclusion for, WITH the special flags attached.
 * @param claimedGameConclusion - The claimed game conclusion to test against.
 * @returns - An object containing either:
 * - `valid: true` if the claimed conclusion is correct.
 * - `valid: false` and a `reason` string explaining why it is illegal.
 */
function checkConclusionValidity(
	gamefile: FullGame,
	moveDraft: MoveDraft,
	claimedGameConclusion: string | undefined,
): ConclusionValidityResult {
	// Safety check: Make sure premoves are not applied.
	if (premoves.arePremovesApplied())
		throw new Error(
			'Cannot check conclusion validity while premoves are applied. Rewind them first.',
		);

	if (
		claimedGameConclusion !== undefined &&
		!winconutil.isGameConclusionDecisive(claimedGameConclusion)
	) {
		// "Undecisive" (e.g. resignation, time, abort) conclusions are always valid since the server handles those.
		return { valid: true };
	}

	const { boardsim } = gamefile;

	// Used to return to this move after we're done simulating
	const originalMoveIndex = boardsim.state.local.moveIndex;
	// Go to the front of the game, making zero graphical changes (we'll return to this spot after simulating for validity)
	movepiece.goToMove(boardsim, boardsim.moves.length - 1, (move) =>
		movepiece.applyMove(gamefile, move, true),
	);

	const validityResult: ConclusionValidityResult = conclusionValidityWrapper(
		gamefile,
		moveDraft,
		claimedGameConclusion,
	);

	// Rewind the game back to the index we were originally on before simulating
	movepiece.goToMove(boardsim, originalMoveIndex, (move) =>
		movepiece.applyMove(gamefile, move, false),
	);

	return validityResult;
}

/**
 * Checks the validity of the claimed game conclusion after the provided moveDraft.
 * REQUIRES us to be at the front of the game already!
 * MOVE DRAFT MUST have special flags attached already!
 * @param gamefile - The gamefile
 * @param moveDraft - The move draft to validate, WITH the special flags attached!
 * @param claimedGameConclusion - The claimed game conclusion to test against.
 * @returns - An object containing either:
 * - `valid: true` if the claimed conclusion is correct.
 * - `valid: false` and a `reason` string explaining why it is illegal.
 */
function conclusionValidityWrapper(
	gamefile: FullGame,
	moveDraft: MoveDraft,
	claimedGameConclusion: string | undefined,
): ConclusionValidityResult {
	// Safety checks: Make sure we're at the front of the game, with no premoves applied.
	if (!moveutil.areWeViewingLatestMove(gamefile.boardsim))
		throw new Error('Checking conclusion validity requires us to be at the front of the game!');
	if (premoves.arePremovesApplied())
		throw new Error(
			'Checking conclusion validity requires premoves to not be applied. Rewind them first.',
		);

	// Now, simulate the move to see if the resulting game conclusion matches their claim.
	// Used to prevent cheating by claiming a win when they didn't actually achieve it.

	const moveDraftCopy = jsutil.deepCopyObject(moveDraft);
	const simulatedConclusion = movepiece.getSimulatedConclusion(gamefile, moveDraftCopy);
	if (simulatedConclusion !== claimedGameConclusion)
		return { valid: false, reason: 'Wrong conclusion.' };

	// If we reach here, the claimed conclusion is valid!
	return { valid: true };
}

export default {
	checkCompactMoveValidity,
	isOpponentsMoveLegal,
};
