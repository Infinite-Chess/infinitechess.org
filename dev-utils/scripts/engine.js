const engine = (function () {
	/**
	 * 
	 * @param {gamefile} gamefile 
	 */
	function getIntersections(gamefile) {

		// TODO: fix a bug where some intersections dont get detected
		// TODO: make intersections an array instead of a set, and don't add duplicates

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

		for (let i = 0; i < diagonalLineArr.length; i++) {
			const [m1, b1] = diagonalLineArr[i];

			// calculate its intersections with all horizontal lines
			for (let y of ySet) {
				// should be
				// intersections.add([(y - b1) / m1, y]);
				// but because m1 is either 1 or -1 multiplying is the same as dividing
				// and dividing is known to be slower.
				intersections.add([(y - b1) * m1, y]);
			}

			// calculate its intersections with all vertical lines
			for (let x of xSet) {
				intersections.add([x, m1 * x + b1]);
			}

			for (let j = i + 1; j < diagonalLineArr.length; j++) {
				const [m2, b2] = diagonalLineArr[j];

				const intersectionX = (b2 - b1) / (m1 - m2);
				if (!isFinite(intersectionX) || !Number.isInteger(intersectionX)) continue;
				const intersectionY = m1 * intersectionX + b1
				intersections.add([intersectionX, intersectionY])
			}
		}

		return intersections;
	}

	/**
	 * 
	 * @param {gamefile} gamefile 
	 * @returns {Move[]}
	 */
	function getConsideredMoves(gamefile) {
		const moves = [];
		const intersections = getIntersections(gamefile);
		for (let type in gamefile.ourPieces) {
			if (gamefile.whosTurn !== math.getPieceColorFromType(type)) continue;
			for (let coords of gamefile.ourPieces[type]) {
				if (!coords) continue;
				const legalMoves = legalmoves.calculate(gamefile, { type, coords, index: gamefileutility.getPieceIndexByTypeAndCoords(gamefile, type, coords) })
				for (let intersection of intersections) {
					if (legalmoves.checkIfMoveLegal(legalMoves, coords, intersection)) {
						const move = { type, startCoords: coords, endCoords: intersection };
						// legalmoves.checkIfMoveLegal transfers special flags from startCoords to endCoords
						// we want our move to have the special flags so we will transfer them to it.
						specialdetect.transferSpecialFlags_FromCoordsToMove(intersection, move);
						moves.push(move);
					}
				}
			}
		}
		return moves;
	}

	/**
	 * 
	 * @param {gamefile} gamefile 
	 */
	function loneBlackKingEval(gamefile) {

		// TODO: weight closest rook lines (and other long range pieces)

		let evaluation = 0;
		const kingCoords = gamefile.ourPieces.kingsB[0];
		const kingLegalMoves = legalmoves.calculate(gamefile, { type: 'kingsB', coords: kingCoords, index: gamefileutility.getPieceIndexByTypeAndCoords(gamefile, 'kingsB', kingCoords) });
		console.log('king legal moves count ', kingLegalMoves.individual.length);
		evaluation += kingLegalMoves.individual.length;

		// add a point to the evaluation for each piece the king is attacking.
		for (let x = -1; x <= 1; x++) {
			for (let y = -1; y <= 1; y++) {
				if (x == 0 && y == 0) continue;
				if (gamefileutility.getPieceAtCoords(gamefile, [kingX + x, kingY + y])) evaluation += 1;
			}
		}
		const opponentPieceCount = gamefileutility.getPieceCountOfColorFromPiecesByType(gamefile.ourPieces, 'white');
		evaluation -= opponentPieceCount * 100;

		const longRangeWhitePieces = ['queensW', 'chancellorsW', 'rooksW', 'bishopsW', 'archbishopsW', 'knightridersW', 'royalQueensW']
		const whitePiecesWeightTable = {
			kingsW: 4,
			knightsW: 3,
			hawksW: 2
		}
		for (let type of pieces.white) {
			if (!longRangeWhitePieces.includes(type) || !gamefile.ourPieces[type]?.length) continue;
			for (let pieceCoords of gamefile.ourPieces[type]) {
				// calculate the chebyshev distance between king and the piece
				// multiply it by the piece weight and add it to the evaluation


				// chebyshevDistance = max(distanceX, distanceY)
				evaluation += math.chebyshevDistance(pieceCoords, kingCoords) * whitePiecesWeightTable[type];
			}
		}
		return evaluation;
	}

	/**
	 * 
	 * @param {gamefile} gamefile 
	 */
	function getBlackKingLegalMoves(gamefile) {
		const kingCoords = gamefile.ourPieces.kingsB[0];
		const kingPiece = gamefileutility.getPieceAtCoords(gamefile, gamefile.ourPieces.kingsB[0]);
		const { individual } = legalmoves.calculate(gamefile, kingPiece);
		return moves = individual.map(x => ({type: 'kingsB', startCoords: kingCoords, endCoords: x}));
	}

	/**
	 * 
	 * @param {gamefile} gamefile - the gamefile
	 * @param {number} depth - the depth
	 * @param {number} alpha - the alpha value
	 * @param {number} beta - the beta value
	 * @param {number} colorNum - a number representing the number (1 if black, -1 if white)
	 * @returns {number}
	 */
	function negamax(gamefile, depth, alpha, beta, colorNum) {
		// return -Infinity if white manages to checkmate in this line to discourage the engine from choosing this move if it could
		// return Infinity if black manages to draw in this line to make engine pick this or other moves that draw
		// multiply those two by color to make them fit which color's turn it is
		// put this here instead of evaluation function to end search immediately
		const gameConclusion = wincondition.getGameConclusion(gamefile);
		if (gameConclusion == 'white checkmate') return color * -Infinity;
		if (gameConclusion == 'draw insuffmat') return color * Infinity;

		// return evaluation if depth is zero
		if (depth == 0) return colorNum * loneBlackKingEval(gamefile);

		// if its black's turn get all king legal moves
		// if its white's turn get the considered moves. aka moves that move into an intersection
		let moves = colorNum == 1 ? getBlackKingLegalMoves(gamefile) : getConsideredMoves(gamefile);
		for (let move of moves) {
			movepiece.makeMove(gamefile, move, {
				pushClock: false,
				animate: false,
				updateData: false,
				simulated: true,
			});
			console.log(gamefile.moves);
			const score = -negamax(gamefile, depth - 1, -beta, -alpha, -colorNum);
			movepiece.rewindMove(gamefile, {
				updateData: false,
				animate: false
			});
			if (score >= beta) {
				// beta cut-off
				return beta;
			}
			if (score > alpha) {
				alpha = score;
			}
		}
		return alpha;
	}
	/**
	 * 
	 * @param {gamefile} gamefile 
	 * @param {number} depth 
	 * @returns 
	 */
	function calculate(gamefile, depth) {
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
			const score = -negamax(gamefile, depth - 1, -Infinity, Infinity, 1);
			movepiece.rewindMove(gamefile, {
				updateData: false,
				animate: false
			});
			if (score > bestScore) {
				bestScore = score;
				bestMove = move;
			}
		}
		console.log(`eval: ${bestScore}`)
		return bestMove;
	}

	return Object.freeze({
		getIntersections,
		getConsideredMoves,
		negamax,
		calculate
	})
})();