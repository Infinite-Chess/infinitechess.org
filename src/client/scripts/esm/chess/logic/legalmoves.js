
/**
 * This script calculates legal moves
 */

// Import Start
import movepiece from './movepiece.js';
import gamefileutility from '../util/gamefileutility.js';
import specialdetect from './specialdetect.js';
import organizedlines from './organizedlines.js';
import checkdetection from './checkdetection.js';
import colorutil from '../util/colorutil.js';
import typeutil from '../util/typeutil.js';
import jsutil from '../../util/jsutil.js';
import coordutil from '../util/coordutil.js';
import winconutil from '../util/winconutil.js';
import movesets from './movesets.js';
// Import End

/** 
 * Type Definitions 
 * @typedef {import('./gamefile.js').gamefile} gamefile
 * @typedef {import('./movepiece.js').MoveDraft} MoveDraft
 * @typedef {import('./boardchanges.js').Piece} Piece
 * @typedef {import('./movesets.js').PieceMoveset} PieceMoveset
 * @typedef {import('./movesets.js').BlockingFunction} BlockingFunction
 * @typedef {import('./movesets.js').IgnoreFunction} IgnoreFunction
*/


"use strict";

// Custom type definitions...

/**
 * An object containing all the legal moves of a piece.
 * @typedef {Object} LegalMoves
 * @property {Object} individual - A list of the legal jumping move coordinates: `[[1,2], [2,1]]`
 * @property {Object} sliding - A dict containing length-2 arrays with the legal left and right slide limits: `{[1,0]:[-5, Infinity]}`
 * @property {IgnoreFunction} ignoreFunc - The ignore function of the piece, to skip over moves.
 */




/**
 * Calculates the area around you in which jumping pieces can land on you from that distance.
 * This is used for efficient calculating if a king move would put you in check.
 * Must be called after the piece movesets are initialized. 
 * In the format: `{ '1,2': ['knights', 'chancellors'], '1,0': ['guards', 'king']... }`
 * DOES NOT include pawn moves.
 * @returns {gamefile} gamefile - The gamefile
 * @returns {Object} The vicinity object
 */
function genVicinity(gamefile) {
	const vicinity = {};
	if (!gamefile.pieceMovesets) return console.error("Cannot generate vicinity before pieceMovesets is initialized.");

	// For every piece moveset...
	for (let i = 0; i < typeutil.colorsTypes.white.length; i++) {
		const thisPieceType = typeutil.colorsTypes.white[i];
		let thisPieceIndividualMoveset;
		if (getPieceMoveset(gamefile, thisPieceType).individual) thisPieceIndividualMoveset = getPieceMoveset(gamefile, thisPieceType).individual;
		else thisPieceIndividualMoveset = [];

		// For each individual move...
		for (let a = 0; a < thisPieceIndividualMoveset.length; a++) {
			const thisIndividualMove = thisPieceIndividualMoveset[a];
            
			// Convert the move into a key
			const key = coordutil.getKeyFromCoords(thisIndividualMove);

			// Make sure the key's already initialized
			if (!vicinity[key]) vicinity[key] = [];

			const pieceTypeConcat = colorutil.trimColorExtensionFromType(thisPieceType); // Remove the 'W'/'B' from end of type

			// Make sure the key contains the piece type that can capture from that distance
			if (!vicinity[key].includes(pieceTypeConcat)) vicinity[key].push(pieceTypeConcat);
		}
	}
	return vicinity;
}

/**
 * Gets the moveset of the type of piece specified.
 * @param {gamefile} gamefile - The gamefile 
 * @param {string} pieceType - The type of piece
 * @returns {PieceMoveset} A moveset object.
 */
function getPieceMoveset(gamefile, pieceType) {
	pieceType = colorutil.trimColorExtensionFromType(pieceType); // Remove the 'W'/'B' from end of type
	const movesetFunc = gamefile.pieceMovesets[pieceType];
	if (!movesetFunc) return {}; // Piece doesn't have a specified moveset (could be neutral). Return empty.
	return movesetFunc(); // Calling these parameters as a function returns their moveset.
}

/**
 * Return the piece move that's blocking function if it is specified, or the default otherwise.
 * @param {PieceMoveset} pieceMoveset 
 * @returns {BlockingFunction}
 */
function getBlockingFuncFromPieceMoveset(pieceMoveset) {
	return pieceMoveset.blocking || movesets.defaultBlockingFunction;
}


/**
 * Return the piece move ignore function if it is specified, or the default otherwise.
 * @param {PieceMoveset} pieceMoveset 
 * @returns {IgnoreFunction}
 */
function getIgnoreFuncFromPieceMoveset(pieceMoveset) {
	return pieceMoveset.ignore ? pieceMoveset.ignore : () => false;
}

/**
 * Calculates the legal moves of the provided piece in the provided gamefile.
 * @param {gamefile} gamefile - The gamefile
 * @param {Piece} piece - The piece: `{ type, coords, index }`
 * @param {Object} options - An object that may contain the `onlyCalcSpecials` option, that when *true*, will only calculate the legal special moves of the piece. Default: *false*
 * @returns {LegalMoves} The legalmoves object.
 */
function calculate(gamefile, piece, { onlyCalcSpecials = false } = {}) { // piece: { type, coords }
	if (piece.index === undefined) throw new Error("To calculate a piece's legal moves, we must have the index property.");
	const coords = piece.coords;
	const type = piece.type;
	const trimmedType = colorutil.trimColorExtensionFromType(type);
	const color = colorutil.getPieceColorFromType(type); // Color of piece calculating legal moves of

	// if (color !== gamefile.whosTurn && !options.getEM()) return { individual: [] } // No legal moves if its not their turn!!

	const thisPieceMoveset = getPieceMoveset(gamefile, type); // Default piece moveset
	
	let legalIndividualMoves = [];
	const legalSliding = {};

	const ignoreFunc = getIgnoreFuncFromPieceMoveset(thisPieceMoveset);
	if (!onlyCalcSpecials) {

		// Legal jumping/individual moves

		shiftIndividualMovesetByCoords(thisPieceMoveset.individual, coords);
		legalIndividualMoves = moves_RemoveOccupiedByFriendlyPieceOrVoid(gamefile, thisPieceMoveset.individual, color);
        
		// Legal sliding moves
		if (thisPieceMoveset.sliding) {
			const blockingFunc = getBlockingFuncFromPieceMoveset(thisPieceMoveset);
			const lines = gamefile.startSnapshot.slidingPossible;
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i]; // [x,y]
				const lineKey = coordutil.getKeyFromCoords(line); // 'x,y'
				if (!thisPieceMoveset.sliding[lineKey]) continue;
				const key = organizedlines.getKeyFromLine(line, coords);
				legalSliding[line] = slide_CalcLegalLimit(blockingFunc, ignoreFunc, gamefile.piecesOrganizedByLines[line][key], line, thisPieceMoveset.sliding[lineKey], coords, color);
			};
		};

	}
    
	// Add any special moves!
	if (gamefile.specialDetects[trimmedType]) gamefile.specialDetects[trimmedType](gamefile, coords, color, legalIndividualMoves);

	const moves = {
		individual: legalIndividualMoves,
		sliding: legalSliding,
		ignoreFunc: ignoreFunc,
	};
    
	checkdetection.removeMovesThatPutYouInCheck(gamefile, moves, piece, color);

	return moves;
}

/**
 * Shifts/translates the individual/jumping portion
 * of a moveset by the coordinates of a piece.
 * @param {number[][]} indivMoveset - The list of individual/jumping moves this moveset has: `[[1,2],[2,1]]`
 */
function shiftIndividualMovesetByCoords(indivMoveset, coords) {
	if (!indivMoveset) return;
	indivMoveset.forEach((indivMove) => {
		indivMove[0] += coords[0];
		indivMove[1] += coords[1];
	});
}

// Accepts array of moves, returns new array with illegal moves removed due to pieces occupying.
function moves_RemoveOccupiedByFriendlyPieceOrVoid(gamefile, individualMoves, color) {
	if (!individualMoves) return; // No jumping moves possible

	for (let i = individualMoves.length - 1; i >= 0; i--) {
		const thisMove = individualMoves[i];

		// Is there a piece on this square?
		const pieceAtSquare = gamefileutility.getPieceTypeAtCoords(gamefile, thisMove);
		if (!pieceAtSquare) continue; // Next move if there is no square here

		// Do the colors match?
		const pieceAtSquareColor = colorutil.getPieceColorFromType(pieceAtSquare);

		// If they match colors, move is illegal because we cannot capture friendly pieces. Remove the move.
		// ALSO remove if it's a void!
		if (color === pieceAtSquareColor
            || pieceAtSquare === 'voidsN') individualMoves.splice(i, 1);
	}

	return individualMoves;
}

/**
 * Takes in specified organized list, direction of the slide, the current moveset...
 * Shortens the moveset by pieces that block it's path.
 * @param {BlockingFunction} blockingFunc - The function that will check if each piece on the same line needs to block the piece
 * @param {IgnoreFunction} ignoreFunc - The function that will check if each piece on the same line needs to block the piece
 * @param {Piece[]} line - The list of pieces on this line 
 * @param {number[]} direction - The direction of the line: `[dx,dy]` 
 * @param {number[]} slideMoveset - How far this piece can slide in this direction: `[left,right]`. If the line is vertical, this is `[bottom,top]`
 * @param {number[]} coords - The coordinates of the piece with the specified slideMoveset.
 * @param {string} color - The color of friendlies
 */
function slide_CalcLegalLimit(blockingFunc, ignoreFunc, line, direction, slideMoveset, coords, color) {

	if (!slideMoveset) return; // Return undefined if there is no slide moveset

	// The default slide is [-Infinity, Infinity], change that if there are any pieces blocking our path!

	// For most we'll be comparing the x values, only exception is the vertical lines.
	const axis = direction[0] === 0 ? 1 : 0; 
	const limit = coordutil.copyCoords(slideMoveset);
	// Iterate through all pieces on same line
	for (let i = 0; i < line.length; i++) {

		const thisPiece = line[i]; // { type, coords }

		if (ignoreFunc(coords, thisPiece.coords)) {
			continue;
		}

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
	return limit;
}

/**
 * Checks if the provided move start and end coords is one of the
 * legal moves in the provided legalMoves object.
 * 
 * **This will modify** the provided endCoords to attach any special move flags.
 * @param {number[]} startCoords
 * @param {LegalMoves} legalMoves - The legalmoves object with the properties `individual`, `horizontal`, `vertical`, `diagonalUp`, `diagonalDown`.
 * @param {number[]} endCoords 
 * @param {Object} options - An object that may contain the options:
 * - `ignoreIndividualMoves`: Whether to ignore individual (jumping) moves. Default: *false*.
 * @returns {boolean} *true* if the provided legalMoves object contains the provided endCoords.
 */
function checkIfMoveLegal(legalMoves, startCoords, endCoords, { ignoreIndividualMoves } = {}) {
	// Return if it's the same exact square
	if (coordutil.areCoordsEqual(startCoords, endCoords)) return false;

	// Do one of the individual moves match?
	if (!ignoreIndividualMoves) {
		const individual = legalMoves.individual;
		const length = !individual ? 0 : individual.length;
		for (let i = 0; i < length; i++) {
			const thisIndividual = individual[i];
			if (!coordutil.areCoordsEqual(endCoords, thisIndividual)) continue;
			// Subtle way of passing on the TAG of all special moves!
			specialdetect.transferSpecialFlags_FromCoordsToCoords(thisIndividual, endCoords);
			return true;
		}
	}

	for (const strline in legalMoves.sliding) {
		const line = coordutil.getCoordsFromKey(strline); // 'dx,dy'
		const limits = legalMoves.sliding[strline]; // [leftLimit,rightLimit]

		const selectedPieceLine = organizedlines.getKeyFromLine(line,startCoords);
		const clickedCoordsLine = organizedlines.getKeyFromLine(line,endCoords);
		if (!limits || selectedPieceLine !== clickedCoordsLine) continue;

		if (!doesSlidingMovesetContainSquare(limits, line, startCoords, endCoords, legalMoves.ignoreFunc)) continue;
		return true;
	}
	return false;
}

/**
 * Tests if the provided move is legal to play in this game.
 * This accounts for the piece color AND legal promotions, AND their claimed game conclusion.
 * @param {gamefile} gamefile - The gamefile
 * @param {MoveDraft} moveDraft - The move, with the bare minimum properties: `{ startCoords, endCoords, promotion }`
 * @returns {boolean | string} *true* If the move is legal, otherwise a string containing why it is illegal.
 */
function isOpponentsMoveLegal(gamefile, moveDraft, claimedGameConclusion) {
	if (!moveDraft) {
		console.log("Opponents move is illegal because it is not defined. There was likely an error in converting it to long format.");
		return 'Move is not defined. Probably an error in converting it to long format.';
	}
	// Don't modify the original move. This is because while it's simulated,
	// more properties are added such as `rewindInfo`.
	const moveDraftCopy = jsutil.deepCopyObject(moveDraft);

	const inCheckB4Forwarding = jsutil.deepCopyObject(gamefile.inCheck);
	const attackersB4Forwarding = jsutil.deepCopyObject(gamefile.attackers);

	const originalMoveIndex = gamefile.moveIndex; // Used to return to this move after we're done simulating
	// Go to the front of the game, making zero graphical changes (we'll return to this spot after simulating)
	movepiece.goToMove(gamefile, gamefile.moves.length - 1, (move) => movepiece.applyMove(gamefile, move, true));

	// Make sure a piece exists on the start coords
	const piecemoved = gamefileutility.getPieceAtCoords(gamefile, moveDraftCopy.startCoords); // { type, index, coords }
	if (!piecemoved) {
		console.log(`Opponent's move is illegal because no piece exists at the startCoords. Move: ${JSON.stringify(moveDraftCopy)}`);
		return rewindGameAndReturnReason('No piece exists at start coords.');
	}

	// Make sure it's the same color as your opponent.
	const colorOfPieceMoved = colorutil.getPieceColorFromType(piecemoved.type);
	if (colorOfPieceMoved !== gamefile.whosTurn) {
		console.log(`Opponent's move is illegal because you can't move a non-friendly piece. Move: ${JSON.stringify(moveDraftCopy)}`);
		return rewindGameAndReturnReason("Can't move a non-friendly piece.");
	}

	// If there is a promotion, make sure that's legal
	if (moveDraftCopy.promotion) {
		if (!piecemoved.type.startsWith('pawns')) {
			console.log(`Opponent's move is illegal because you can't promote a non-pawn. Move: ${JSON.stringify(moveDraftCopy)}`);
			return rewindGameAndReturnReason("Can't promote a non-pawn.");
		}
		const colorPromotedTo = colorutil.getPieceColorFromType(moveDraftCopy.promotion);
		if (gamefile.whosTurn !== colorPromotedTo) {
			console.log(`Opponent's move is illegal because they promoted to the opposite color. Move: ${JSON.stringify(moveDraftCopy)}`);
			return rewindGameAndReturnReason("Can't promote to opposite color.");
		}
		const strippedPromotion = colorutil.trimColorExtensionFromType(moveDraftCopy.promotion);
		if (!gamefile.gameRules.promotionsAllowed[gamefile.whosTurn].includes(strippedPromotion)) {
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
	if (!checkIfMoveLegal(legalMoves, moveDraftCopy.startCoords, moveDraftCopy.endCoords)) { // Illegal move
		console.log(`Opponent's move is illegal because the destination coords are illegal. Move: ${JSON.stringify(moveDraftCopy)}`);
		return rewindGameAndReturnReason(`Destination coordinates are illegal. inCheck: ${JSON.stringify(gamefile.inCheck)}. attackers: ${JSON.stringify(gamefile.attackers)}. originalMoveIndex: ${originalMoveIndex}. inCheckB4Forwarding: ${inCheckB4Forwarding}. attackersB4Forwarding: ${JSON.stringify(attackersB4Forwarding)}`);
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

	function rewindGameAndReturnReason(reasonIllegal) {
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
function doesSlidingMovesetContainSquare(slideMoveset, direction, pieceCoords, coords, ignoreFunc) {
	// const step = math.getLineSteps(direction, pieceCoords, coords)
	// return step >= slideMoveset[0] && step <= slideMoveset[1];


	const axis = direction[0] === 0 ? 1 : 0;
	const coordMag = coords[axis];
	const relCoords = (coordMag - pieceCoords[axis]) / Math.abs(direction[axis]);
	const min = slideMoveset[0] * direction[axis] + pieceCoords[axis];
	const max = slideMoveset[1] * direction[axis] + pieceCoords[axis];
	return coordMag >= min && coordMag <= max && !ignoreFunc(pieceCoords, coords);
}

/**
 * Accepts the calculated legal moves, tests to see if there are any
 * @param {LegalMoves} moves 
 * @returns {boolean} 
 */
function hasAtleast1Move(moves) { // { individual, horizontal, vertical, ... }
    
	if (moves.individual.length > 0) return true;
	for (const line in moves.sliding)
		if (doesSlideHaveWidth(moves.sliding[line])) return true;

	function doesSlideHaveWidth(slide) { // [-Infinity, Infinity]
		if (!slide) return false;
		return slide[1] - slide[0] > 0;
	}

	return false;
}

export default {
	genVicinity,
	getPieceMoveset,
	calculate,
	checkIfMoveLegal,
	doesSlidingMovesetContainSquare,
	hasAtleast1Move,
	slide_CalcLegalLimit,
	isOpponentsMoveLegal,
	getBlockingFuncFromPieceMoveset,
	getIgnoreFuncFromPieceMoveset,
};