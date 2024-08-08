/**
 * This script runs the chess engine for enginegames.
 * It is modular and may be replaced by any other engine script to test a different engine.
 * To that end, engine.runEngine(gamefile) is the only function that is called from the outside.
 */

"use strict";

const engineManualEval = (function(){

	const checkmateScore = -100000
	let beginningTimestamp = Date.now();

	/**
	 * 
	 * @param {gamefile} gamefile 
	 * @param {Move} move 
	 */
	function makeMove(gamefile, move) {
		// we plan on undoing this move in the search
		// so we will properly attach the `rewindInfo` property if its not defined
		if(move.rewindInfo == null) {
			const rewindInfo = {};
			rewindInfo.inCheck = structuredClone(gamefile.inCheck);
            if (gamefile.attackers) rewindInfo.attackers = structuredClone(gamefile.attackers);
			move.rewindInfo = rewindInfo;
		}
		const capturedPiece = gamefileutility.getPieceAtCoords(gamefile, move.endCoords);
		if (capturedPiece) {
			move.captured = capturedPiece.type;
			gamefileutility.deleteIndexFromPieceList(gamefile.ourPieces[capturedPiece.type], piece.index)

        	// Remove captured piece from organized piece lists
        	organizedlines.removeOrganizedPiece(gamefile, capturedPiece.coords)
		}

		// store the move in the gamefile's movelist
		gamefile.moveIndex++;
		gamefile.moves.push(move);
		// flip the turn
        gamefile.whosTurn = math.getOppositeColor(gamefile.whosTurn);

	}

	/**
	 * returns all intersections of diagonal, horizontal and vertical lines emitting from all pieces.
	 * meant to represent squares the engine would care about.
	 * @param {gamefile} gamefile - gamefile
	 */
	function getIntersections(gamefile) {

		const intersections = new Set();

		const diagonalLineArr = [] // an array holding arrays of the slope and the y-intercept of each diagonal line respectfully. this will help us determine the intersections between them
		const xSet = new Set();
		const ySet = new Set();
		// generate the line array
		for (let i in gamefile.piecesOrganizedByKey) {
			const [x, y] = math.getCoordsFromKey(i);
			xSet.add(x);
			ySet.add(y);
			const firstLine = [1, y - x];
			const secondLine = [-1, y + x];
			diagonalLineArr.push(firstLine, secondLine);
		}

		// calculate intersections between vertical lines and horizontal lines emitted from all pieces.
		const xArr = Array.from(xSet);
		const yArr = Array.from(ySet);
		for (let i = 0; i < xArr.length; i++) {
			for (let j = i+1; j < xArr.length; j++) {
				intersections.add(`${xArr[i]},${yArr[j]}`);
				intersections.add(`${xArr[j]},${yArr[i]}`);
			}
		}

		// calculate intersections of diagonal lines
		for (let i = 0; i < diagonalLineArr.length; i++) {
			const [m1, b1] = diagonalLineArr[i];

			// calculate its intersections with all horizontal lines
			for (let y of ySet) {
				// should be
				// intersections.add([(y - b1) / m1, y]);
				// but because m1 is either 1 or -1 multiplying is the same as dividing
				// and dividing is known to be slower.
				intersections.add(`${(y - b1) * m1},${y}`);
			}

			// calculate its intersections with all vertical lines
			for (let x of xSet) {
				intersections.add(`${x},${m1 * x + b1}`);
			}

			// Skip calculating the intersection with the first line 
			// after the line we are currently checking with if the latter has an even index
			// since its guaranteed to be its mirror in regard to the y axis
			// because we push diagonal lines and their mirrored versions to diagonalLineArr directly after each other
			const loopOffset = i % 2 == 0 ? 2 : 1;
			for (let j = i + loopOffset; j < diagonalLineArr.length; j++) {
				const [m2, b2] = diagonalLineArr[j];

				const intersectionX = (b2 - b1) / (m1 - m2);
				if (!isFinite(intersectionX) || !Number.isInteger(intersectionX)) continue;
				const intersectionY = m1 * intersectionX + b1
				intersections.add(`${intersectionX},${intersectionY}`)
			}
		}

		return intersections;
	}

	/**
	 * returns all legal moves that move into an intersection of pieces (see `engine.getIntersections`)
	 * mainly used to get the moves the engine would consider aka look into in its search.
	 * @param {gamefile} gamefile - gamefile
	 * @returns {Move[]} - array of considered moves
	 */
	function getConsideredMoves(gamefile) {
		const moves = [];
		const intersections = getIntersections(gamefile);
		for (let type in gamefile.ourPieces) {
			if (gamefile.whosTurn !== math.getPieceColorFromType(type)) continue;
			const thesePieces = gamefile.ourPieces[type];
			for (let i = 0; i < thesePieces.length; i++) {
				const coords = thesePieces[i]
				if (!coords) continue;
				const legalMoves = legalmoves.calculate(gamefile, { type, coords, index: i })
				for (let intersection of intersections) {
					const intersectionCoords = math.getCoordsFromKey(intersection);
					if (legalmoves.checkIfMoveLegal(legalMoves, coords, intersectionCoords)) {
						const move = { type, startCoords: coords, endCoords: intersectionCoords };
						// legalmoves.checkIfMoveLegal transfers special flags from startCoords to endCoords
						// we want our move to have the special flags so we will transfer them to it.
						specialdetect.transferSpecialFlags_FromCoordsToMove(intersectionCoords, move);
						moves.push(move);
					}
				}
			}
		}
		return moves;
	}

	/**
	 * evaluation function for a lone black king. (designed for Practice Mode)
	 * @param {gamefile} gamefile - the gamefile
	 * @returns {number} - the evaluation of the position (gamefile)
	 */
	function loneBlackKingEval(gamefile) {
		let evaluation = 0;
		const kingCoords = gamefile.ourPieces.kingsB[0];
		const kingLegalMoves = legalmoves.calculate(gamefile, { type: 'kingsB', coords: kingCoords, index: 0 });
		evaluation += kingLegalMoves.individual.length;

		// add a point to the evaluation for each piece the king is attacking.
		for (let x = -1; x <= 1; x++) {
			for (let y = -1; y <= 1; y++) {
				if (x == 0 && y == 0) continue;
				if (gamefileutility.getPieceAtCoords(gamefile, [kingCoords[0] + x, kingCoords[1] + y])) evaluation += 1;
			}
		}
		const opponentPieceCount = gamefileutility.getPieceCountOfColorFromPiecesByType(gamefile.ourPieces, 'white');
		evaluation -= opponentPieceCount * 100;

		// Pieces that can put a king in some sort of a box or a cage (for example two rooks can put a king in a cage)
		const boxerWhitePieces = ['queensW', 'chancellorsW', 'rooksW', 'royalQueensW'];
		const whitePiecesWeightTable = {
			kingsW: {weight: 4, distanceFunction: math.chebyshevDistance},
			guardsW: {weight: 4, distanceFunction: math.chebyshevDistance},
			knightsW: {weight: 3, distanceFunction: math.chebyshevDistance},
			hawksW: {weight: 2, distanceFunction: math.chebyshevDistance},
		}
		let boxerWhitePieceCount = 0;
		for (let boxerWhitePiece of boxerWhitePieces) {
			boxerWhitePieceCount += gamefileutility.getPieceCountOfType(gamefile, boxerWhitePiece);
			if (boxerWhitePieceCount > 1) {
				for (let bWP of boxerWhitePieces) {
					whitePiecesWeightTable[bWP] = {weight: 1, distanceFunction: math.manhattanDistance};
				}
				break;
			}
		}
		for (let type of pieces.white) {
			if (!(type in whitePiecesWeightTable) || !gamefileutility.getPieceCountOfType(gamefile, type)) continue;
			const pieceWeightTable = whitePiecesWeightTable[type];

			for (let pieceCoords of gamefile.ourPieces[type]) {
				if(!pieceCoords) continue;
				// calculate the distance between king and the piece
				// multiply it by the piece weight and add it to the evaluation
				evaluation += pieceWeightTable.distanceFunction(pieceCoords, kingCoords) * pieceWeightTable.weight;
			}
		}
		return evaluation;
	}

	/**
	 * Gets the legal moves of the black king (first one if there's multiple)
	 * @param {gamefile} gamefile - gamefile
	 * @returns {Move[]} - legal moves for the black king (first one if there's multiple)
	 */
	function getBlackKingLegalMoves(gamefile) {
		const kingCoords = gamefile.ourPieces.kingsB[0];
		const kingPiece = gamefileutility.getPieceAtCoords(gamefile, gamefile.ourPieces.kingsB[0]);
		const { individual } = legalmoves.calculate(gamefile, kingPiece);
		return individual.map(x => ({type: 'kingsB', startCoords: kingCoords, endCoords: x}));
	}

	/**
	 * searches the tree of possible lines with the negamax algorithm with alpha-beta pruning
	 * @param {gamefile} gamefile - the gamefile
	 * @param {number} depth - how much moves deep the algorithm will search
	 * @param {number} alpha - the alpha value (lower bound)
	 * @param {number} beta - the beta value (upper bound)
	 * @param {number} colorNum - a number representing the number (1 if black, -1 if white)
	 * @returns {Promise<number>} - promise to the score of the given position (gamefile) after searching with depth of `depth`
	 */
	async function negamax(gamefile, depth, alpha, beta, colorNum) {
		// return -Infinity if white manages to checkmate in this line to discourage the engine from choosing this move if it could
		// return Infinity if black manages to draw in this line to make engine pick this or other moves that draw
		// multiply those two by color to make them fit which color's turn it is
		// put this here instead of evaluation function to end search immediately
		const gameConclusion = wincondition.getGameConclusion(gamefile);
		// favour checkmates that are further in the future than ones that are closer.
		// add 1 to depth to not multiply by zero in case the search is about to end.
		if (gameConclusion == 'white checkmate') return colorNum * checkmateScore * (depth + 1);
		if (gameConclusion && gameConclusion.startsWith('draw')) return colorNum * Infinity;

		// return evaluation if depth is zero
		if (depth == 0) return colorNum * loneBlackKingEval(gamefile);

		// if its black's turn get all king legal moves
		// if its white's turn get the considered moves. aka moves that move into an intersection
		let moves = colorNum == 1 ? getBlackKingLegalMoves(gamefile) : getConsideredMoves(gamefile);
		console.log(moves)
		for (let move of moves) {
			movepiece.makeMove(gamefile, move, {
				pushClock: false,
				animate: false,
				updateData: false,
				simulated: true,
			});
			const score = -await negamax(gamefile, depth - 1, -beta, -alpha, -colorNum);
			movepiece.rewindMove(gamefile, {
				updateData: false,
				animate: false
			});
			const now = Date.now();
			if (now - beginningTimestamp >= loadbalancer.getMonitorRefreshRate()) {
				beginningTimestamp = now
				await main.sleep(0);
			}
			if (score >= beta) {
				// beta cut-off
				return beta;
			}
			if (score > alpha) {
				// found better move
				alpha = score;
			}
		}
		return alpha;
	}
	/**
	 * runs negamax search on every move and returns the move with the highest score. returns a random move if checkmate is forced
	 * @param {gamefile} gamefile - the gamefile
	 * @param {number} depth - how much moves deep the search will go
	 * @returns {Promise<Move>} - promise to the move with the highest score or a random move if checkmate is forced
	 */
	async function calculate(gamefile, depth) {
		// let the the board render while we are calculating
		let moves = getBlackKingLegalMoves(gamefile);
		let bestScore = -Infinity;
		let bestMove = null;
		for (let move of moves) {
			movepiece.makeMove(gamefile, move, {
				pushClock: false,
				animate: false,
				updateData: false,
				simulated: true,
			});
			const score = -await negamax(gamefile, depth - 1, -Infinity, Infinity, -1);
			movepiece.rewindMove(gamefile, {
				updateData: false,
				animate: false
			});
			if (score > bestScore) {
				bestScore = score;
				bestMove = move;
			}
		}
		console.log(`eval: ${bestScore}`);
		return bestMove;
	}


    /**
     * Main function of this script. It gets called as soon as the human player submits a move.
     * It takes a gamefile as an input and computes a move.
     * @param {gamefile} gamefile - gamefile of the current game
     * @returns {Promise<Move>} - promise which resolves to some engine move
     */
    async function runEngine(gamefile) {
        try {
            // This code only works if Black has exactly one king or royal centaur
            // For now, it just submits a random move for Black
            const move = await calculate(gamefile, 5);
            return Promise.resolve(move);
        } catch (e) {
			console.error(e);
            console.error("You used the engine for an unsupported type of game.")
        }
    }

    /**
     * Calculates a random legal move for a player
     * Only works if that player has a lone king or royal centaur
     * @param {gamefile} gamefile - The gamefile
     * @param {string} color - "white" or "black": The color of the player to move
     * @returns {Move} random legalmove
     */
    // function getRandomRoyalMove(gamefile, color) {
    //     const royalCoords = gamefileutility.getRoyalCoords(gamefile, color)[0]
    //     const blackRoyalPiece = gamefileutility.getPieceAtCoords(gamefile, royalCoords);
    //     const blackmoves = legalmoves.calculate(gamefile, blackRoyalPiece).individual;
    //     const randomEndCoords = blackmoves[Math.floor(Math.random() * blackmoves.length)]; // random endcoords from the list of individual moves
    //     const move = {startCoords: royalCoords, endCoords: randomEndCoords};
    //     specialdetect.transferSpecialFlags_FromCoordsToMove(randomEndCoords, move);
    //     return move;
    // }

    return Object.freeze({
        runEngine
    })

})();
