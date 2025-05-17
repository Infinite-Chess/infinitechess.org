
/**
 * This script calculates legal moves
 */

import movepiece from './movepiece.js';
import boardutil from '../util/boardutil.js';
// @ts-ignore
import specialdetect from './specialdetect.js';
import organizedpieces from './organizedpieces.js';
import typeutil, { players } from '../util/typeutil.js';
import jsutil from '../../util/jsutil.js';
import coordutil from '../util/coordutil.js';
// @ts-ignore
import winconutil from '../util/winconutil.js';
import movesets from './movesets.js';
import variant from '../variants/variant.js';
import checkresolver from './checkresolver.js';
import { rawTypes as r } from '../util/typeutil.js';

import type { TypeGroup, RawType, Player } from '../util/typeutil.js';
import type { PieceMoveset } from './movesets.js';
import type { CoordsKey, Coords } from '../util/coordutil.js';
import type { Vec2Key, Vec2 } from '../../util/math.js';
import type { IgnoreFunction, BlockingFunction } from './movesets.js';
import type { MetaData } from '../util/metadata.js';
import type { Piece } from '../util/boardutil.js';
import type { MoveDraft } from './movepiece.js';
import type { OrganizedPieces } from './organizedpieces.js';
// @ts-ignore
import type gamefile from './gamefile.js';

"use strict";

// Custom type definitions...

type SlideLimits = [number, number]

/** An object containing all the legal moves of a piece. */
interface LegalMoves {
	/** A list of the legal jumping move coordinates: `[[1,2], [2,1]]` */
	individual: Coords[],
	/** A dict containing length-2 arrays with the legal left and right slide limits: `{[1,0]:[-5, Infinity]}` */
	sliding: Record<Vec2Key, SlideLimits>,
	/** If provided, all sliding moves will brute-force test for check to see if their actually legal to move to. Use when our piece moves colinearly to a piece pinning it, or if our piece is a royal queen. */
	brute?: boolean,
	/** The ignore function of the piece, to skip over moves. */
	ignoreFunc: IgnoreFunction
}

type Vicinity = Record<CoordsKey, RawType[]>

/**
 * Calculates the area around you in which jumping pieces can land on you from that distance.
 * This is used for efficient calculating if a king move would put you in check.
 * Must be called after the piece movesets are initialized. 
 * In the format: `{ '1,2': ['knights', 'chancellors'], '1,0': ['guards', 'king']... }`
 * DOES NOT include pawn moves.
 * @param {} pieceMovesets - MUST BE TRIMMED beforehand to not include movesets of types not present in the game!!!!!
 * @returns {Object} The vicinity object
 */
function genVicinity(pieceMovesets: TypeGroup<() => PieceMoveset>): Vicinity {
	const vicinity: Record<CoordsKey, RawType[]> = {};
	
	// For every type in the game...
	for (const [rawTypeString, movesetFunc] of Object.entries(pieceMovesets)) {
		const rawType = Number(rawTypeString) as RawType;
		const individualMoves = movesetFunc().individual ?? [];
		individualMoves.forEach(coords => {
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
 * @param {MetaData} metadata - The metadata of the gamefile
 * @param {RawType[]} existingRawTypes
 * @returns {Object} The specialVicinity object, in the format: `{ '1,1': ['pawns'], '1,2': ['roses'], ... }`
 */
function genSpecialVicinity(metadata: MetaData, existingRawTypes: RawType[]): Vicinity {
	// @ts-ignore
	const specialVicinityByPiece = variant.getSpecialVicinityOfVariant(metadata);
	const vicinity = {} as Vicinity;
	// Object keys are strings, so we need to cast the type to a number
	for (const [rawTypeString, pieceVicinity] of Object.entries(specialVicinityByPiece)) {
		const rawType = Number(rawTypeString) as RawType;
		if (!existingRawTypes.includes(rawType)) continue; // This piece isn't present in our game
		pieceVicinity.forEach(coords => {
			const coordsKey = coordutil.getKeyFromCoords(coords as Coords);
			if (!(coordsKey in vicinity)) vicinity[coordsKey] = []; // Make sure it's initialized
			vicinity[coordsKey]!.push(rawType);
		});
	}
	return vicinity;
}

/**
 * Gets the moveset of the type of piece specified.
 * @param {gamefile} gamefile - The gamefile 
 * @param {number} pieceType - The type of piece
 * @returns {PieceMoveset} A moveset object.
 */
function getPieceMoveset(gamefile: gamefile, pieceType: number): PieceMoveset {
	const [rawType, player] = typeutil.splitType(pieceType); // Split the type into raw and color
	if (player === players.NEUTRAL) return {}; // Neutral pieces CANNOT MOVE!
	const movesetFunc = gamefile.pieceMovesets[rawType];
	if (!movesetFunc) return {}; // Safety net. Piece doesn't have a specified moveset. Return empty.
	return movesetFunc(); // Calling these parameters as a function returns their moveset.
}

/**
 * Return the piece move that's blocking function if it is specified, or the default otherwise.
 * @param {PieceMoveset} pieceMoveset 
 * @returns {BlockingFunction}
 */
function getBlockingFuncFromPieceMoveset(pieceMoveset: PieceMoveset): BlockingFunction {
	return pieceMoveset.blocking || movesets.defaultBlockingFunction;
}


/**
 * Return the piece move ignore function if it is specified, or the default otherwise.
 * @param {PieceMoveset} pieceMoveset 
 * @returns {IgnoreFunction}
 */
function getIgnoreFuncFromPieceMoveset(pieceMoveset: PieceMoveset): IgnoreFunction {
	return pieceMoveset.ignore || movesets.defaultIgnoreFunction;
}

/**
 * Calculates the legal moves of the provided piece in the provided gamefile.
 * @param {gamefile} gamefile - The gamefile
 * @param {Piece} piece - The piece: `{ type, coords, index }`
 * @param {Object} options - An object that may contain the `onlyCalcSpecials` option, that when *true*, will only calculate the legal special moves of the piece. Default: *false*
 * @returns {LegalMoves} The legalmoves object.
 */
function calculate(gamefile: gamefile, piece: Piece, { onlyCalcSpecials = false, ignoreCheck = false } = {}) { // piece: { type, coords }
	const coords = piece.coords;
	const type = piece.type;
	const color = typeutil.getColorFromType(type); // Color of piece calculating legal moves of

	const thisPieceMoveset = getPieceMoveset(gamefile, type); // Default piece moveset
	thisPieceMoveset.individual = thisPieceMoveset.individual ?? []; // Ensure individual moves are present (more may be added during legal move calculation)
	
	let legalIndividualMoves: Coords[] = [];
	const legalSliding: Record<Vec2Key, Coords> = {};

	if (!onlyCalcSpecials) {

		// Legal jumping/individual moves

		shiftIndividualMovesetByCoords(thisPieceMoveset.individual, coords);
		legalIndividualMoves = moves_RemoveOccupiedByFriendlyPieceOrVoid(gamefile, thisPieceMoveset.individual, color);
        
		// Legal sliding moves
		if (thisPieceMoveset.sliding) {
			const blockingFunc = getBlockingFuncFromPieceMoveset(thisPieceMoveset);
			for (const [linekey, limits] of Object.entries(thisPieceMoveset.sliding)) {
				const lines = gamefile.pieces.lines.get(linekey as Vec2Key);
				if (lines === undefined) continue;
				const line = coordutil.getCoordsFromKey(linekey as Vec2Key);
				const key = organizedpieces.getKeyFromLine(line, coords);
				legalSliding[linekey as Vec2Key] = slide_CalcLegalLimit(blockingFunc, gamefile.pieces, lines.get(key)!, line, limits, coords, color);
			};
		};

	}
    
	// Add any special moves!
	if (thisPieceMoveset.special) legalIndividualMoves.push(...thisPieceMoveset.special(gamefile, coords, color));

	const moves: LegalMoves = {
		individual: legalIndividualMoves,
		sliding: legalSliding,
		ignoreFunc: getIgnoreFuncFromPieceMoveset(thisPieceMoveset),
	};
    
	if (!ignoreCheck) checkresolver.removeCheckInvalidMoves(gamefile, moves, piece, color);

	// console.log(`Calculated legal moves:`, moves);
	return moves;
}

/**
 * Calculates how far a given piece can legally slide (ignoring ignore functions, and ignoring check respection)
 * on the given line of a specific slope.
 * @param {gamefile} gamefile
 * @param {Piece} piece
 * @param {Vec2} slide
 * @param {Vec2Key} lineKey - The key `C|X` of the specific organized line we need to find out how far this piece can slide on
 * @param {Piece[]} organizedLine - The organized line of the above key that our piece is on
 * @returns {undefined | Coords}
 */
function calcPiecesLegalSlideLimitOnSpecificLine(gamefile: gamefile, piece: Piece, slide: Vec2, slideKey: Vec2Key, organizedLine: number[]) {
	const thisPieceMoveset = getPieceMoveset(gamefile, piece.type); // Default piece moveset
	if (!(thisPieceMoveset.sliding)) return; // This piece can't slide at all
	if (!(slideKey in thisPieceMoveset.sliding)) return; // This piece can't slide ALONG the provided line
	// This piece CAN slide along the provided line.
	// Calculate how far it can slide...
	const blockingFunc = getBlockingFuncFromPieceMoveset(thisPieceMoveset);
	const friendlyColor = typeutil.getColorFromType(piece.type);
	return slide_CalcLegalLimit(blockingFunc, gamefile.pieces, organizedLine, slide, thisPieceMoveset.sliding[slideKey], piece.coords, friendlyColor);
}

/**
 * Shifts/translates the individual/jumping portion
 * of a moveset by the coordinates of a piece.
 * @param {CoordsSpecial[]} indivMoveset - The list of individual/jumping moves this moveset has: `[[1,2],[2,1]]`
 */
function shiftIndividualMovesetByCoords(indivMoveset: Coords[], coords: Coords) {
	if (!indivMoveset) return;
	indivMoveset.forEach((indivMove) => {
		indivMove[0] += coords[0];
		indivMove[1] += coords[1];
	});
}

// Accepts array of moves, returns new array with illegal moves removed due to pieces occupying.
function moves_RemoveOccupiedByFriendlyPieceOrVoid<T extends Coords[] | undefined>(gamefile: gamefile, individualMoves: T, color: Player): T {
	// TS is jank
	if (individualMoves === undefined) return individualMoves; // No jumping moves possible

	for (let i = individualMoves.length - 1; i >= 0; i--) {
		const thisMove = individualMoves[i]!;

		// Is there a piece on this square?
		const pieceAtSquare = boardutil.getTypeFromCoords(gamefile.pieces, thisMove);
		if (pieceAtSquare === undefined) continue; // Next move if there is no square here

		// Do the players match?
		const pieceAtSquareColor = typeutil.getColorFromType(pieceAtSquare);

		// If they match players, move is illegal because we cannot capture friendly pieces. Remove the move.
		// ALSO remove if it's a void!
		if (color === pieceAtSquareColor || typeutil.getRawType(pieceAtSquare) === r.VOID) individualMoves.splice(i, 1);
	}

	return individualMoves;
}

/**
 * Takes in specified organized list, direction of the slide, the current moveset...
 * Shortens the moveset by pieces that block it's path.
 * @param {BlockingFunction} blockingFunc - The function that will check if each piece on the same line needs to block the piece
 * @param {OrganizedPieces} o
 * @param {Piece[]} line - The list of pieces on this line 
 * @param {number[]} direction - The direction of the line: `[dx,dy]` 
 * @param {number[] | undefined} slideMoveset - How far this piece can slide in this direction: `[left,right]`. If the line is vertical, this is `[bottom,top]`
 * @param {number[]} coords - The coordinates of the piece with the specified slideMoveset.
 * @param {Player} color - The color of friendlies
 */
function slide_CalcLegalLimit<T extends SlideLimits | undefined>(
	blockingFunc: BlockingFunction, o: OrganizedPieces, line: number[], direction: Vec2,
	slideMoveset: T, coords: Coords, color: Player
): T {

	if (slideMoveset === undefined) return slideMoveset; // Return undefined if there is no slide moveset

	// The default slide is [-Infinity, Infinity], change that if there are any pieces blocking our path!

	// For most we'll be comparing the x values, only exception is the vertical lines.
	const axis = direction[0] === 0 ? 1 : 0; 
	const limit = coordutil.copyCoords(slideMoveset);
	// Iterate through all pieces on same line
	for (const idx of line) {

		const thisPiece = boardutil.getPieceFromIdx(o, idx)!; // { type, coords }

		/**
		 * 0 => Piece doesn't block
		 * 1 => Blocked (friendly piece)
		 * 2 => Blocked 1 square after (enemy piece)
		 */
		const blockResult = blockingFunc(color, thisPiece, coords); // 0 | 1 | 2
		if (blockResult !== 0 && blockResult !== 1 && blockResult !== 2) throw new Error(`slide_CalcLegalLimit() not built to handle block result of "${blockResult}"!`);
		if (blockResult === 0) continue; // Not blocked

		// Is the piece to the left of us or right of us?
		const thisPieceSteps = Math.floor((thisPiece.coords[axis] - coords[axis]) / direction[axis]);
		if (thisPieceSteps < 0) { // To our left

			// What would our new left slide limit be? If it's an opponent, it's legal to capture it.
			const newLeftSlideLimit = blockResult === 1 ? thisPieceSteps + 1 : thisPieceSteps;
			// If the piece x is closer to us than our current left slide limit, update it
			if (newLeftSlideLimit > limit[0]) limit[0] = newLeftSlideLimit;

		} else if (thisPieceSteps > 0) { // To our right

			// What would our new right slide limit be? If it's an opponent, it's legal to capture it.
			const newRightSlideLimit = blockResult === 1 ? thisPieceSteps - 1 : thisPieceSteps;
			// If the piece x is closer to us than our current left slide limit, update it
			if (newRightSlideLimit < limit[1]) limit[1] = newRightSlideLimit;

		} // else this is us, don't do anything.
	}
	return limit as T;
}

/**
 * Checks if the provided move start and end coords is one of the
 * legal moves in the provided legalMoves object.
 * 
 * **This will modify** the provided endCoords to attach any special move flags.
 * @param {gamefile} gamefile
 * @param {LegalMoves} legalMoves - The legalmoves object with the properties `individual`, `horizontal`, `vertical`, `diagonalUp`, `diagonalDown`.
 * @param {Coords} startCoords - The coordinates of the piece owning the legal moves
 * @param {Coords} endCoords - The square to test if the piece can legally move to
 * @param {Player} colorOfFriendly - The player color owning the piece with the legal moves
 * @param {Object} options - An object that may contain the options:
 * - `ignoreIndividualMoves`: Whether to ignore individual (jumping) moves. Default: *false*.
 * @returns {boolean} *true* if the provided legalMoves object contains the provided endCoords.
 */
function checkIfMoveLegal(gamefile: gamefile, legalMoves: LegalMoves, startCoords: Coords, endCoords: Coords, colorOfFriendly: Player, { ignoreIndividualMoves = false } = {}) {
	// Return if it's the same exact square
	if (coordutil.areCoordsEqual(startCoords, endCoords)) return false;

	// Do one of the individual moves match?
	if (!ignoreIndividualMoves) {
		const individual = legalMoves.individual;
		const length = !individual ? 0 : individual.length;
		for (let i = 0; i < length; i++) {
			const thisIndividual = individual[i]!;
			if (!coordutil.areCoordsEqual(endCoords, thisIndividual)) continue;
			// Subtle way of passing on the TAG of all special moves!
			specialdetect.transferSpecialFlags_FromCoordsToCoords(thisIndividual, endCoords);
			return true;
		}
	}

	for (const [strline, limits] of Object.entries(legalMoves.sliding)) {
		const line = coordutil.getCoordsFromKey(strline as Vec2Key); // 'dx,dy'

		const selectedPieceLine = organizedpieces.getKeyFromLine(line, startCoords);
		const clickedCoordsLine = organizedpieces.getKeyFromLine(line, endCoords);
		if (selectedPieceLine !== clickedCoordsLine) continue; // Continue if they don't like on the same line.

		if (!doesSlidingMovesetContainSquare(limits, line, startCoords, endCoords, legalMoves.ignoreFunc)) continue; // Sliding this direction 
		if (legalMoves.brute) { // Don't allow the slide if it results in check
			const moveDraft = { startCoords: startCoords, endCoords };
			if (checkresolver.getSimulatedCheck(gamefile, moveDraft, colorOfFriendly).check) return false; // The move results in check => not legal
		}
		return true; // Move is legal
	}
	return false;
}

/**
 * Tests if the provided move is legal to play in this game.
 * This accounts for the piece color AND legal promotions, AND their claimed game conclusion.
 * @param {gamefile} gamefile - The gamefile
 * @param {MoveDraft} moveDraft - The move, with the bare minimum properties: `{ startCoords, endCoords, promotion }`
 * @returns {true | string} *true* If the move is legal, otherwise a string containing why it is illegal.
 */
function isOpponentsMoveLegal(gamefile: gamefile, moveDraft: MoveDraft, claimedGameConclusion: string | false) {
	if (!moveDraft) {
		console.log("Opponents move is illegal because it is not defined. There was likely an error in converting it to long format.");
		return 'Move is not defined. Probably an error in converting it to long format.';
	}
	// Don't modify the original move. This is because while it's simulated,
	// more properties are added such as `rewindInfo`.
	const moveDraftCopy = jsutil.deepCopyObject(moveDraft);

	const inCheckB4Forwarding = jsutil.deepCopyObject(gamefile.state.local.inCheck);
	const attackersB4Forwarding = jsutil.deepCopyObject(gamefile.state.local.attackers);

	const originalMoveIndex = gamefile.state.local.moveIndex; // Used to return to this move after we're done simulating
	// Go to the front of the game, making zero graphical changes (we'll return to this spot after simulating)
	movepiece.goToMove(gamefile, gamefile.moves.length - 1, (move) => movepiece.applyMove(gamefile, move, true));

	// Make sure a piece exists on the start coords
	const piecemoved = boardutil.getPieceFromCoords(gamefile.pieces, moveDraftCopy.startCoords); // { type, index, coords }
	if (!piecemoved) {
		console.log(`Opponent's move is illegal because no piece exists at the startCoords. Move: ${JSON.stringify(moveDraftCopy)}`);
		return rewindGameAndReturnReason('No piece exists at start coords.');
	}

	// Make sure it's the same color as your opponent.
	const colorOfPieceMoved = typeutil.getColorFromType(piecemoved.type);
	if (colorOfPieceMoved !== gamefile.whosTurn) {
		console.log(`Opponent's move is illegal because you can't move a non-friendly piece. Move: ${JSON.stringify(moveDraftCopy)}`);
		return rewindGameAndReturnReason("Can't move a non-friendly piece.");
	}

	// If there is a promotion, make sure that's legal
	if (moveDraftCopy.promotion) {
		if (!(typeutil.getRawType(piecemoved.type) === r.PAWN)) {
			console.log(`Opponent's move is illegal because you can't promote a non-pawn. Move: ${JSON.stringify(moveDraftCopy)}`);
			return rewindGameAndReturnReason("Can't promote a non-pawn.");
		}
		const colorPromotedTo = typeutil.getColorFromType(moveDraftCopy.promotion);
		if (gamefile.whosTurn !== colorPromotedTo) {
			console.log(`Opponent's move is illegal because they promoted to the opposite color. Move: ${JSON.stringify(moveDraftCopy)}`);
			return rewindGameAndReturnReason("Can't promote to opposite color.");
		}
		const rawPromotion = typeutil.getRawType(moveDraftCopy.promotion);
		if (!gamefile.gameRules.promotionsAllowed[gamefile.whosTurn].includes(rawPromotion)) {
			console.log(`Opponent's move is illegal because the specified promotion is illegal. Move: ${JSON.stringify(moveDraftCopy)}`);
			return rewindGameAndReturnReason('Specified promotion is illegal.');
		}
	} else { // No promotion, make sure they AREN'T moving to a promotion rank! That's also illegal.
		if (specialdetect.isPawnPromotion(gamefile, piecemoved.type, moveDraftCopy.endCoords)) {
			console.log(`Opponent's move is illegal because they didn't promote at the promotion line. Move: ${JSON.stringify(moveDraftCopy)}`);
			return rewindGameAndReturnReason("Didn't promote when moved to promotion line.");
		}
	}

	// Test if that piece's legal moves contain the destinationCoords.
	const legalMoves = calculate(gamefile, piecemoved);
	// This should pass on any special moves tags at the same time.
	if (!checkIfMoveLegal(gamefile, legalMoves, piecemoved.coords, moveDraftCopy.endCoords, colorOfPieceMoved)) { // Illegal move
		console.log(`Opponent's move is illegal because the destination coords are illegal. Move: ${JSON.stringify(moveDraftCopy)}`);
		return rewindGameAndReturnReason(`Destination coordinates are illegal. inCheck: ${JSON.stringify(gamefile.state.local.inCheck)}. attackers: ${JSON.stringify(gamefile.state.local.attackers)}. originalMoveIndex: ${originalMoveIndex}. inCheckB4Forwarding: ${inCheckB4Forwarding}. attackersB4Forwarding: ${JSON.stringify(attackersB4Forwarding)}`);
	}

	// Check the resulting game conclusion from the move and if that lines up with the opponents claim.
	// Only do so if the win condition is decisive (exclude win conditions declared by the server,
	// such as time, aborted, resignation, disconnect)
	if (claimedGameConclusion === false || winconutil.isGameConclusionDecisive(claimedGameConclusion)) {
		const simulatedConclusion = movepiece.getSimulatedConclusion(gamefile, moveDraftCopy);
		if (simulatedConclusion !== claimedGameConclusion) {
			console.log(`Opponent's move is illegal because gameConclusion doesn't match. Should be "${simulatedConclusion}", received "${claimedGameConclusion}". Their move: ${JSON.stringify(moveDraftCopy)}`);
			return rewindGameAndReturnReason(`Game conclusion isn't correct. Received: ${claimedGameConclusion}. Should be ${simulatedConclusion}`);
		}
	}

	// Did they have enough time to zoom out as far as they moved?
	// IMPLEMENT AFTER BIG DECIMALS.
	// The gamefile's metadata contains the start time of the game.
	// Use that to determine if they've had enough time to zoom as
	// far as they did since the game began
	// ...

	// Rewind the game back to the index we were originally on before simulating
	movepiece.goToMove(gamefile, originalMoveIndex, (move) => movepiece.applyMove(gamefile, move, false));

	return true; // By this point, nothing illegal!

	function rewindGameAndReturnReason(reasonIllegal: string) {
		// Rewind the game back to the index we were originally on
		movepiece.goToMove(gamefile, originalMoveIndex, (move) => movepiece.applyMove(gamefile, move, false));
		return reasonIllegal;
	}
}

/**
 * Tests if the piece's precalculated slideMoveset is able to reach the provided coords.
 * ASSUMES the coords are on the direction of travel!!!
 * @param {number[]} slideMoveset - The distance the piece can move along this line: `[left,right]`. If the line is vertical, this will be `[bottom,top]`.
 * @param {number[]} direction - The direction of the line: `[dx,dy]`
 * @param {number[]} pieceCoords - The coordinates of the piece with the provided sliding net
 * @param {number[]} coords - The coordinates we want to know if they can reach.
 * @param {IgnoreFunction} ignoreFunc - The ignore function.
 * @returns {boolean} true if the piece is able to slide to the coordinates
 */
function doesSlidingMovesetContainSquare(slideMoveset: SlideLimits, direction: Vec2, pieceCoords: Coords, coords: Coords, ignoreFunc: IgnoreFunction): boolean {
	const axis = direction[0] === 0 ? 1 : 0;
	const coordMag = coords[axis];
	const min = slideMoveset[0] * direction[axis] + pieceCoords[axis];
	const max = slideMoveset[1] * direction[axis] + pieceCoords[axis];
	return coordMag >= min && coordMag <= max && ignoreFunc(pieceCoords, coords);
}

/**
 * Accepts the calculated legal moves, tests to see if there are any
 * @param {LegalMoves} moves 
 * @returns {boolean} 
 */
function hasAtleast1Move(moves: LegalMoves): boolean { // { individual, horizontal, vertical, ... }
    
	if (moves.individual.length > 0) return true;
	for (const limits of Object.values(moves.sliding)) {
		if (doesSlideHaveWidth(limits)) return true;
	}

	function doesSlideHaveWidth(slide: SlideLimits) { // [-Infinity, Infinity]
		if (!slide) return false;
		return slide[1] - slide[0] > 0;
	}

	return false;
}

export type {
	LegalMoves,
	Vicinity,
	SlideLimits,
};

export default {
	genVicinity,
	genSpecialVicinity,
	getPieceMoveset,
	calculate,
	checkIfMoveLegal,
	doesSlidingMovesetContainSquare,
	hasAtleast1Move,
	slide_CalcLegalLimit,
	isOpponentsMoveLegal,
	getBlockingFuncFromPieceMoveset,
	getIgnoreFuncFromPieceMoveset,
	calcPiecesLegalSlideLimitOnSpecificLine,
};