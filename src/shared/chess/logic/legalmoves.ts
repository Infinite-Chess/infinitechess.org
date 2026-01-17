/**
 * This script calculates legal moves
 */

import bd, { BigDecimal } from '@naviary/bigdecimal';

import specialdetect from './specialdetect.js';
import boardutil from '../util/boardutil.js';
import organizedpieces from './organizedpieces.js';
import coordutil from '../util/coordutil.js';
import movesets from './movesets.js';
import variant from '../variants/variant.js';
import checkresolver from './checkresolver.js';
import geometry from '../../util/math/geometry.js';
import vectors from '../../util/math/vectors.js';
import bounds, { UnboundedRectangle } from '../../util/math/bounds.js';
import typeutil, { players, rawTypes } from '../util/typeutil.js';
import bdcoords from '../util/bdcoords.js';

import type { RawType, Player, RawTypeGroup } from '../util/typeutil.js';
import type { PieceMoveset } from './movesets.js';
import type { CoordsKey, Coords, BDCoords } from '../util/coordutil.js';
import type { IgnoreFunction, BlockingFunction } from './movesets.js';
import type { MetaData } from '../util/metadata.js';
import type { Piece } from '../util/boardutil.js';
import type { CoordsSpecial } from './movepiece.js';
import type { OrganizedPieces } from './organizedpieces.js';
import type { Board, FullGame } from './gamefile.js';
import type { Vec2, Vec2Key } from '../../util/math/vectors.js';

// Type Definitions ----------------------------------------------------------------

/**
 * The negative/positive vector step-limit of a sliding direction.
 *
 * NULL === INFINITY
 * [-2,null] => Can slide 2 squares in the negative vector direction, or infinitely in the positive.
 * For knightriders, one [2,1] hop is considered 1 step.
 */
type SlideLimits = [bigint | null, bigint | null];

/** An object containing all the legal moves of a piece. */
interface LegalMoves {
	/** A list of the legal jumping move coordinates: `[[1,2], [2,1]]` */
	individual: CoordsSpecial[];
	/** A dict containing length-2 arrays with the legal left and right slide limits: `{[1,0]:[-5, Infinity]}` */
	sliding: Record<Vec2Key, SlideLimits>;
	/** If provided, all sliding moves will brute-force test for check to see if their actually legal to move to. Use when our piece moves colinearly to a piece pinning it, or if our piece is a royal queen. */
	brute?: boolean;
	/** The ignore function of the piece, to skip over moves. */
	ignoreFunc: IgnoreFunction;
	/** Whether the generated moves are for a colinear mover (huygen). */
	colinear: boolean;
}

/**
 * A dictionary of vector distances from an origin square containing
 * a list of raw piece types, typically that can capture from that distance.
 */
type Vicinity = Record<CoordsKey, RawType[]>;

/**
 * Calculates the area around you in which jumping pieces can land on you from that distance.
 * This is used for efficient calculating if a king move would put you in check.
 * Must be called after the piece movesets are initialized.
 * In the format: `{ '1,2': ['knights', 'chancellors'], '1,0': ['guards', 'king']... }`
 * DOES NOT include pawn moves.
 * @param pieceMovesets - MUST BE TRIMMED beforehand to not include movesets of types not present in the game!!!!!
 * @returns The vicinity object
 */
function genVicinity(pieceMovesets: RawTypeGroup<() => PieceMoveset>): Vicinity {
	const vicinity: Record<CoordsKey, RawType[]> = {};

	// For every type in the game...
	for (const [rawTypeString, movesetFunc] of Object.entries(pieceMovesets)) {
		const rawType = Number(rawTypeString) as RawType;
		const individualMoves = movesetFunc().individual ?? [];
		individualMoves.forEach((coords) => {
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
 * @param metadata - The metadata of the gamefile
 * @param existingRawTypes
 * @returns The specialVicinity object, in the format: `{ '1,1': ['pawns'], '1,2': ['roses'], ... }`
 */
function genSpecialVicinity(metadata: MetaData, existingRawTypes: RawType[]): Vicinity {
	// @ts-ignore
	const specialVicinityByPiece = variant.getSpecialVicinityOfVariant(metadata);
	const vicinity = {} as Vicinity;
	// Object keys are strings, so we need to cast the type to a number
	for (const [rawTypeString, pieceVicinity] of Object.entries(specialVicinityByPiece)) {
		const rawType = Number(rawTypeString) as RawType;
		if (!existingRawTypes.includes(rawType)) continue; // This piece isn't present in our game
		pieceVicinity.forEach((coords) => {
			const coordsKey = coordutil.getKeyFromCoords(coords as Coords);
			// typescript doesn't realize vicinity[coordsKey] is gauranteed to be defined
			// after this statement if we use (coordsKey in vicinity) for some reason
			if (!vicinity[coordsKey]) vicinity[coordsKey] = []; // Make sure it's initialized
			vicinity[coordsKey].push(rawType);
		});
	}
	return vicinity;
}

/**
 * Gets the moveset of the type of piece specified.
 */
function getPieceMoveset(boardsim: Board, pieceType: number): PieceMoveset {
	const [rawType, player] = typeutil.splitType(pieceType); // Split the type into raw and color
	if (player === players.NEUTRAL) return { colinear: false }; // Neutral pieces CANNOT MOVE!
	const movesetFunc = boardsim.pieceMovesets[rawType];
	if (!movesetFunc) return { colinear: false }; // Safety net.
	return movesetFunc(); // Calling these parameters as a function returns their moveset.
}

/**
 * Return the piece move that's blocking function if it is specified, or the default otherwise.
 */
function getBlockingFuncFromPieceMoveset(pieceMoveset: PieceMoveset): BlockingFunction {
	return pieceMoveset.blocking || movesets.defaultBlockingFunction;
}

/**
 * Return the piece move ignore function if it is specified, or the default otherwise.
 */
function getIgnoreFuncFromPieceMoveset(pieceMoveset: PieceMoveset): IgnoreFunction {
	return pieceMoveset.ignore || movesets.defaultIgnoreFunction;
}

/**
 * Creates an empty LegalMoves object for a piece.
 * Should only be used outside of {@link calculateAll} when check doesn't matter or when you don't want special or calculated moves.
 * @param moveset the moveset belonging to the piece of the legalmoves
 * @returns the legal moves object
 */
function getEmptyLegalMoves(moveset: PieceMoveset): LegalMoves {
	return {
		individual: [],
		sliding: {},
		ignoreFunc: getIgnoreFuncFromPieceMoveset(moveset),
		colinear: moveset.colinear,
	};
}

/**
 * Adds all POSSIBLE individual/sliding moves from the moveset provided.
 * Best used for calculating premoves.
 */
function appendPotentialMoves(piece: Piece, moveset: PieceMoveset, legalmoves: LegalMoves): void {
	// Possible jumping/individual moves
	if (moveset.individual) {
		const movesetIndividual = shiftIndividualMovesetByCoords(moveset.individual, piece.coords);
		legalmoves.individual = legalmoves.individual.concat(movesetIndividual);
	}
	// Possible sliding moves
	if (moveset.sliding) {
		legalmoves.sliding = {
			...moveset.sliding,
		};
	}
}

/**
 * Shifts/translates the individual/jumping portion
 * of a moveset by the coordinates of a piece.
 * @param indivMoveset - The list of individual/jumping moves this moveset has: `[[1,2],[2,1]]`
 */
function shiftIndividualMovesetByCoords(indivMoveset: readonly Coords[], coords: Coords): Coords[] {
	return indivMoveset.map((indivMove) => {
		return [indivMove[0] + coords[0], indivMove[1] + coords[1]];
	});
}

/**
 * Adds any of the pieces movesets applicable special moves
 * @param gamefile
 * @param piece
 * @param moveset
 * @param legalmoves
 * @param premove - Default: false. SET TO TRUE when you need to calculate premoves, which allow all possible moves!
 */
function appendSpecialMoves(
	gamefile: FullGame,
	piece: Piece,
	moveset: PieceMoveset,
	legalmoves: LegalMoves,
	premove: boolean,
): void {
	const color = typeutil.getColorFromType(piece.type);
	if (moveset.special)
		legalmoves.individual.push(...moveset.special(gamefile, piece.coords, color, premove));
}

/**
 * Removes moves that either land on a friendly or void,
 * and adjusts slide limits based on the provided moveset's blocking function
 * and what pieces are in the way.
 *
 * Call BEFORE appending special moves.
 */
function removeObstructedMoves(
	boardsim: Board,
	worldBorder: UnboundedRectangle | undefined,
	piece: Piece,
	moveset: PieceMoveset,
	legalmoves: LegalMoves,
	premove: boolean,
): void {
	const color = typeutil.getColorFromType(piece.type);

	// Remove obstructed jumping/individual moves
	removeInvalidIndividualMoves(boardsim, worldBorder, legalmoves.individual, color, premove);

	// Block sliding moves according to obstructions
	if (moveset.sliding)
		removeObstructedSlidingMoves(
			boardsim,
			worldBorder,
			piece,
			moveset,
			legalmoves.sliding,
			color,
			premove,
		);
}

/**
 * Accepts array of moves, returns new array with illegal moves removed due to pieces occupying.
 * MUTATES original array.
 */
function removeInvalidIndividualMoves(
	boardsim: Board,
	worldBorder: UnboundedRectangle | undefined,
	individualMoves: Coords[],
	color: Player,
	premove: boolean,
): Coords[] {
	for (let i = individualMoves.length - 1; i >= 0; i--) {
		const thisMove = individualMoves[i]!;
		const moveValidity = testSquareValidity(
			boardsim,
			worldBorder,
			thisMove,
			color,
			premove,
			false,
		);
		if (moveValidity === 2) individualMoves.splice(i, 1); // Not legal to land on
	}

	return individualMoves;
}

/**
 * @param premove - If true, then only voids and world borders block movement.
 */
function removeObstructedSlidingMoves(
	boardsim: Board,
	worldBorder: UnboundedRectangle | undefined,
	piece: Piece,
	moveset: PieceMoveset,
	slidingMoves: Record<Vec2Key, SlideLimits>,
	color: Player,
	premove: boolean,
): void {
	const blockingFunc = getBlockingFuncFromPieceMoveset(moveset);
	for (const [linekey, limits] of Object.entries(slidingMoves)) {
		const lines = boardsim.pieces.lines.get(linekey as Vec2Key);
		if (lines === undefined) continue;
		const line = coordutil.getCoordsFromKey(linekey as Vec2Key);
		const key = organizedpieces.getKeyFromLine(line, piece.coords);
		slidingMoves[linekey as Vec2Key] = slide_CalcLegalLimit(
			boardsim,
			worldBorder,
			blockingFunc,
			boardsim.pieces,
			lines.get(key)!,
			line,
			limits,
			piece.coords,
			color,
			premove,
		);
	}
}

/**
 * Tests whether the provided coordinates can POSSIBLY be landed on
 * (bar legality check), and whether they should block further movement.
 *
 * 0 => Allowed, and doesn't block further movement (empty square, or premove)
 * 1 => Allowed, but BLOCKS further movement (enemy piece)
 * 2 => Blocked, and BLOCKS further movement (friendly piece or void or outside border)
 *
 * @param premove - Exempts the `capturing` requirement from being fulfilled, and allows capturing friendlies.
 * @param capturing - Whether the move is required to be a capture (pawn diagonal move). Default: false. Setting this to false DOES NOT require the move to be non-capturing.
 */
function testSquareValidity(
	boardsim: Board,
	worldBorder: UnboundedRectangle | undefined,
	coords: Coords,
	friendlyColor: Player,
	premove: boolean,
	capturing: boolean,
): 0 | 1 | 2 {
	// Test whether the given square lies out of bounds of the position.
	if (worldBorder !== undefined && !bounds.boxContainsSquare(worldBorder, coords)) return 2;

	const typeOnSquare = boardutil.getTypeFromCoords(boardsim.pieces, coords);

	if (typeOnSquare === undefined) {
		if (premove) return 0; // No piece, premove means capture could end up happening => legal move
		if (capturing) return 2; // Not a capture, yet capture is required => not legal
		return 0; // No piece, in bounds => legal move
	}

	return testCaptureValidity(friendlyColor, typeOnSquare, premove);
}

/**
 * Tests whether the provided piece type can POSSIBLY be captured
 * (bar legality check), and whether they should block further movement.
 *
 * 0 => Allowed, and doesn't block further movement (premove)
 * 1 => Allowed, but BLOCKS further movement (enemy piece)
 * 2 => Blocked, and BLOCKS further movement (friendly piece or void)
 *
 * @param premove - Allows capturing friendlies.
 */
function testCaptureValidity(
	friendlyColor: Player,
	typeOnSquare: number,
	premove: boolean,
): 0 | 1 | 2 {
	const rawType = typeutil.getRawType(typeOnSquare);
	if (rawType === rawTypes.VOID) return 2; // Void, NEVER legal

	if (premove) return 0; // There is a non-void piece, but we're premoving => legal move

	const colorOfPiece = typeutil.getColorFromType(typeOnSquare);
	if (friendlyColor === colorOfPiece) return 2; // Friendly piece, not legal

	return 1; // Enemy piece, legal move, but blocks further movement
}

/**
 * Calculates and generates all legal moves of a piece in the provided gamefile.
 * @param gamefile
 * @param piece
 * @returns The legal moves of that piece
 */
function calculateAll(gamefile: FullGame, piece: Piece): LegalMoves {
	const moveset = getPieceMoveset(gamefile.boardsim, piece.type);
	const moves = getEmptyLegalMoves(moveset);
	appendPotentialMoves(piece, moveset, moves);
	removeObstructedMoves(
		gamefile.boardsim,
		gamefile.basegame.gameRules.worldBorder,
		piece,
		moveset,
		moves,
		false,
	);
	appendSpecialMoves(gamefile, piece, moveset, moves, false);
	checkresolver.removeCheckInvalidMoves(gamefile, piece, moves);
	return moves;
}

/**
 * Calculates all possible premoves of a piece in the provided gamefile.
 * * Jumps can't be obstructed.
 * * Slides can't be blocked.
 * * No check pruning is made.
 */
function calculateAllPremoves(gamefile: FullGame, piece: Piece): LegalMoves {
	const moveset = getPieceMoveset(gamefile.boardsim, piece.type);
	const moves = getEmptyLegalMoves(moveset);
	appendPotentialMoves(piece, moveset, moves);
	removeObstructedMoves(
		gamefile.boardsim,
		gamefile.basegame.gameRules.worldBorder,
		piece,
		moveset,
		moves,
		true,
	); // true to only remove void and world border obstructions
	appendSpecialMoves(gamefile, piece, moveset, moves, true); // true to add all possible moves
	// SKIP removing check invalids!
	return moves;
}

/**
 * Takes in specified organized list, direction of the slide, the current moveset...
 * Shortens the moveset by pieces that block it's path.
 * @param blockingFunc - The function that will check if each piece on the same line needs to block the piece
 * @param o
 * @param line - The list of pieces on this line
 * @param step - The direction of the line: `[dx,dy]`
 * @param slideMoveset - How far this piece can slide in this direction: `[left,right]`. If the line is vertical, this is `[bottom,top]`
 * @param coords - The coordinates of the piece with the specified slideMoveset.
 * @param color - The color of friendlies
 */
function slide_CalcLegalLimit(
	boardsim: Board,
	worldBorder: UnboundedRectangle | undefined,
	blockingFunc: BlockingFunction,
	o: OrganizedPieces,
	line: number[],
	step: Vec2,
	slideMoveset: SlideLimits,
	coords: Coords,
	color: Player,
	premove: boolean,
): SlideLimits {
	// The default slide is [null, null] (Infinity in both directions),
	// change that if there are any pieces blocking our path!
	// The first index is always negative if it's not null (Infinity)

	// For most we'll be comparing the x values, only exception is the vertical lines.
	const axis = step[0] === 0n ? 1 : 0;
	const limit = [...slideMoveset] as SlideLimits; // Makes a copy

	// First of all, if we're using a world border, immediately shorten our slide limit to not exceed it.
	enforceWorldBorderOnSlideLimit(boardsim, worldBorder, limit, coords, step); // Mutating
	// else console.error("No world border set, skipping world border slide limit check.");

	// Iterate through all pieces on same line
	for (const idx of line) {
		const thisPiece = boardutil.getPieceFromIdx(o, idx)!; // { type, coords }

		/**
		 * 0 => Piece doesn't block
		 * 1 => Blocked ON the square (enemy piece)
		 * 2 => Blocked 1 before the square (friendly piece or void)
		 */
		const blockResult = blockingFunc(color, thisPiece, coords, premove);
		if (blockResult !== 0 && blockResult !== 1 && blockResult !== 2)
			throw new Error(
				`slide_CalcLegalLimit() not built to handle block result of "${blockResult}"!`,
			);

		if (blockResult === 0) continue; // Not blocked.

		// It blocks movement...

		// Is the piece to the left of us or right of us?
		const thisPieceSteps = (thisPiece.coords[axis] - coords[axis]) / step[axis]; // Can be negative
		if (thisPieceSteps < 0) {
			// To our left

			// What would our new left slide limit be? If it's an opponent, it's legal to capture it.
			const newLeftSlideLimit = blockResult === 2 ? thisPieceSteps + 1n : thisPieceSteps;
			// If the piece x is closer to us than our current left slide limit, update it
			if (limit[0] === null || newLeftSlideLimit > limit[0]) limit[0] = newLeftSlideLimit;
		} else if (thisPieceSteps > 0) {
			// To our right

			// What would our new right slide limit be? If it's an opponent, it's legal to capture it.
			const newRightSlideLimit = blockResult === 2 ? thisPieceSteps - 1n : thisPieceSteps;
			// If the piece x is closer to us than our current left slide limit, update it
			if (limit[1] === null || newRightSlideLimit < limit[1]) limit[1] = newRightSlideLimit;
		} // else this is us, don't do anything.
	}
	return limit;
}

/** Modifies the provided slide limit in a single step direction (positive & negative) to not exceed the world border. */
function enforceWorldBorderOnSlideLimit(
	boardsim: Board,
	worldBorder: UnboundedRectangle | undefined,
	limit: SlideLimits,
	coords: Coords,
	step: Vec2,
): void {
	if (worldBorder === undefined) return; // No world border, skip

	if (!bounds.boxContainsSquare(worldBorder, coords)) {
		limit[0] = 0n;
		limit[1] = 0n;
		return;
		// To do: Panic unless we are using the board editor
		//throw Error('Piece outside world border!');
	}

	const worldBorderCollisions = geometry.rayStepsUntilRectangle(coords, step, worldBorder);
	bounds.reduceIntervalToExclude(limit, worldBorderCollisions[0], 0);
	bounds.reduceIntervalToExclude(limit, worldBorderCollisions[1], 1);

	// console.log("New limit after blocked by world border:", limit);
}

/**
 * Calculates how far a given piece can legally slide (ignoring ignore functions, and ignoring check respection)
 * on the given line of a specific slope.
 * @param boardsim
 * @param piece
 * @param slide
 * @param slideKey - The key `C|X` of the specific organized line we need to find out how far this piece can slide on
 * @param organizedLine - The organized line of the above key that our piece is on
 */
function calcPiecesLegalSlideLimitOnSpecificLine(
	boardsim: Board,
	worldBorder: UnboundedRectangle | undefined,
	piece: Piece,
	slide: Vec2,
	slideKey: Vec2Key,
	organizedLine: number[],
): SlideLimits | undefined {
	const thisPieceMoveset = getPieceMoveset(boardsim, piece.type); // Default piece moveset
	if (!thisPieceMoveset.sliding) return; // This piece can't slide at all
	if (!thisPieceMoveset.sliding[slideKey]) return; // This piece can't slide ALONG the provided line
	// This piece CAN slide along the provided line.
	// Calculate how far it can slide...
	const blockingFunc = getBlockingFuncFromPieceMoveset(thisPieceMoveset);
	const friendlyColor = typeutil.getColorFromType(piece.type);
	return slide_CalcLegalLimit(
		boardsim,
		worldBorder,
		blockingFunc,
		boardsim.pieces,
		organizedLine,
		slide,
		thisPieceMoveset.sliding[slideKey],
		piece.coords,
		friendlyColor,
		false,
	);
}

/**
 * Checks if the provided move start and end coords is one of the
 * legal moves in the provided legalMoves object.
 *
 * **This will modify** the provided endCoords to attach any special move flags.
 * @param gamefile
 * @param legalMoves - The legalmoves object with the properties `individual`, `horizontal`, `vertical`, `diagonalUp`, `diagonalDown`.
 * @param startCoords - The coordinates of the piece owning the legal moves
 * @param endCoords - The square to test if the piece can legally move to
 * @param colorOfFriendly - The player color owning the piece with the legal moves
 * @param options - An object that may contain the options:
 * - `ignoreIndividualMoves`: Whether to ignore individual (jumping) moves. Default: *false*.
 * @returns *true* if the provided legalMoves object contains the provided endCoords.
 */
function checkIfMoveLegal(
	gamefile: FullGame,
	legalMoves: LegalMoves,
	startCoords: Coords,
	endCoords: Coords,
	colorOfFriendly: Player,
	{ ignoreIndividualMoves = false } = {},
): boolean {
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

		if (
			!doesSlidingMovesetContainSquare(
				limits,
				line,
				startCoords,
				endCoords,
				legalMoves.ignoreFunc,
			)
		)
			continue; // Sliding this direction
		if (legalMoves.brute) {
			// Don't allow the slide if it results in check
			const moveDraft = { startCoords, endCoords };
			if (checkresolver.getSimulatedCheck(gamefile, moveDraft, colorOfFriendly).check)
				return false; // The move results in check => not legal
		}
		return true; // Move is legal
	}
	return false;
}

/**
 * Tests if the piece's precalculated slideMoveset is able to reach the provided coords.
 * ASSUMES the coords are on the direction of travel!!!
 * @param slideMoveset - The distance the piece can move along this line: `[left,right]`. If the line is vertical, this will be `[bottom,top]`.
 * @param direction - The direction of the line: `[dx,dy]`
 * @param pieceCoords - The coordinates of the piece with the provided sliding net
 * @param coords - The coordinates we want to know if they can reach.
 * @param ignoreFunc - The ignore function.
 * @returns true if the piece is able to slide to the coordinates
 */
function doesSlidingMovesetContainSquare(
	slideMoveset: SlideLimits,
	direction: Vec2,
	pieceCoords: Coords,
	coords: Coords,
	ignoreFunc: IgnoreFunction,
): boolean {
	const axis = direction[0] === 0n ? 1 : 0;
	const coord = coords[axis];
	const min: bigint | null =
		slideMoveset[0] === null ? null : pieceCoords[axis] + direction[axis] * slideMoveset[0]; // No need to negate direction because slideMoveset[0] is always negative
	const max: bigint | null =
		slideMoveset[1] === null ? null : pieceCoords[axis] + direction[axis] * slideMoveset[1];
	return (
		(min === null || coord >= min) &&
		(max === null || coord <= max) &&
		ignoreFunc(pieceCoords, coords)
	);
}

/**
 * Accepts the calculated legal moves, tests to see if there are any
 * @param moves
 */
function hasAtleast1Move(moves: LegalMoves): boolean {
	if (moves.individual.length > 0) return true;
	for (const limits of Object.values(moves.sliding)) {
		if (doesSlideHaveWidth(limits)) return true;
	}

	function doesSlideHaveWidth(slide: SlideLimits): boolean {
		if (slide[0] === null || slide[1] === null) return true; // Infinite slide in at least one direction
		return slide[1] - slide[0] > 0; // Both are finite, so this produces another bigint.

		// In the future: If the `brute` flag is present, and there isn't
		// too large of a slide range (maybe 50 max),
		// then we could test if each of them would result in check.
		// ...
	}

	return false;
}

// Exports ----------------------------------------------------------------

export type { LegalMoves, Vicinity, SlideLimits };

export default {
	genVicinity,
	genSpecialVicinity,
	getPieceMoveset,

	getBlockingFuncFromPieceMoveset,
	getIgnoreFuncFromPieceMoveset,

	getEmptyLegalMoves,
	appendPotentialMoves,
	removeObstructedMoves,
	appendSpecialMoves,
	testSquareValidity,
	testCaptureValidity,

	calculateAll,
	calculateAllPremoves,

	slide_CalcLegalLimit,
	calcPiecesLegalSlideLimitOnSpecificLine,

	checkIfMoveLegal,
	doesSlidingMovesetContainSquare,
	hasAtleast1Move,
};
