// Draw detection by insufficient material

"use strict";

const insufficientmaterial = (function(){

	// Scenarios that lead to a draw by insufficient material
	// Entries for bishops are given by tuples ordered in descending order, because of parity

	// Checkmate black with at least one white king
	const scenrariosForInsuffMatWhiteKing = [
		{'kingsB': Infinity, 'kingsW': Infinity},
		{'kingsB': 1, 'kingsW': 1, 'queensW': 1},
		{'kingsB': 1, 'kingsW': 1, 'bishopsW': [Infinity, 1]},
		{'kingsB': 1, 'kingsW': 1, 'knightsW': 3},
		{'kingsB': 1, 'kingsW': 1, 'hawksW': 2},
		{'kingsB': 1, 'kingsW': 1, 'rooksW': 1, 'knightsW': 1},
		{'kingsB': 1, 'kingsW': 1, 'rooksW': 1, 'bishopsW': [1, 0]},
		{'kingsB': 1, 'kingsW': 1, 'archbishopsW': 1, 'bishopsW': [1, 0]},
		{'kingsB': 1, 'kingsW': 1, 'archbishopsW': 1, 'knightsW': 1},
		{'kingsB': 1, 'kingsW': 1, 'knightsW': 1, 'bishopsW': [Infinity, 0]},
		{'kingsB': 1, 'kingsW': 1, 'knightsW': 1, 'bishopsW': [1, 1]},
		{'kingsB': 1, 'kingsW': 1, 'knightsW': 2, 'bishopsW': [1, 0]},
		{'kingsB': 1, 'kingsW': 1, 'guardsW': 1},
		{'kingsB': 1, 'kingsW': 1, 'chancellorsW': 1},
		{'kingsB': 1, 'kingsW': 1, 'knightridersW': 2},
		{'kingsB': 1, 'kingsW': 1, 'pawnsW': 3},
	]

	// Checkmate black without any white kings
	const scenrariosForInsuffMatNoWhiteWhiteKing = [
		{'kingsB': 1, 'queensW': 1, 'rooksW': 1},
		{'kingsB': 1, 'queensW': 1, 'knightsW': 1},
		{'kingsB': 1, 'queensW': 1, 'bishopsW': [1, 0]},
		{'kingsB': 1, 'queensW': 1, 'pawnsW': 1},
		{'kingsB': 1, 'bishopsW': [2, 2]},
		{'kingsB': 1, 'bishopsW': [Infinity, 1]},
		{'kingsB': 1, 'knightsW': 4},
		{'kingsB': 1, 'knightsW': 2, 'bishopsW': [Infinity, 0]},
		{'kingsB': 1, 'knightsW': 2, 'bishopsW': [1, 1]},
		{'kingsB': 1, 'knightsW': 1, 'bishopsW': [2, 1]},
		{'kingsB': 1, 'hawksW': 3},
		{'kingsB': 1, 'rooksW': 1, 'knightsW': 1, 'bishopsW': [1, 0]},
		{'kingsB': 1, 'rooksW': 1, 'knightsW': 1, 'pawnsW': 1},
		{'kingsB': 1, 'rooksW': 1, 'knightsW': 2},
		{'kingsB': 1, 'rooksW': 1, 'guardsW': 1},
		{'kingsB': 1, 'rooksW': 2, 'bishopsW': [1, 0]},
		{'kingsB': 1, 'rooksW': 2, 'knightsW': 1},
		{'kingsB': 1, 'rooksW': 2, 'pawnsW': 1},
		{'kingsB': 1, 'archbishopsW': 1, 'bishopsW': [2, 0]},
		{'kingsB': 1, 'archbishopsW': 1, 'bishopsW': [1, 1]},
		{'kingsB': 1, 'archbishopsW': 1, 'knightsW': 2},
		{'kingsB': 1, 'archbishopsW': 2},
		{'kingsB': 1, 'chancellorsW': 1, 'guardsW': 1},
		{'kingsB': 1, 'chancellorsW': 1, 'knightsW': 1},
		{'kingsB': 1, 'chancellorsW': 1, 'rooksW': 1},
		{'kingsB': 1, 'guardsW': 2},
		{'kingsB': 1, 'amazonsW': 1},
		{'kingsB': 1, 'knightridersW': 3},
		{'kingsB': 1, 'pawnsW': 6},

		// Checkmate black royal centaurs
		{'royalCentaursB': Infinity, 'royalCentaursW': Infinity},
		{'royalCentaursB': 1, 'amazonsW': 1},
	];

	/**
	 * Detects if the provided piecelist scenario is a draw by insufficient material
	 * @param {Object} scenario - scenario of piececounts in the game, e.g. {'kingsB': 1, 'kingsW': 1, 'queensW': 3}
	 * @returns {boolean} *true*, if the scenario is a draw by insufficient material, otherwise *false*
	 */
	function isScenarioInsuffMat(scenario) {
		const scenrariosForInsuffMat = "kingsW" in scenario ? scenrariosForInsuffMatWhiteKing : scenrariosForInsuffMatNoWhiteWhiteKing;

		// loop over all draw scenarios to see if they apply here
		drawscenarioloop:
		for (let drawScenario of scenrariosForInsuffMat){
			for (let piece in scenario) {
				// discard draw scenario if it does not fit the scenario
				if (!(piece in drawScenario) || has_more_pieces(scenario[piece], drawScenario[piece])) continue drawscenarioloop;
			}
			return true;
		}
		return false;
	}

	/**
	 * Checks if a is larger than b, either as a number, or if it has some larger entry as a tuple
	 * @param {number | number[]} a - number or tuple of two numbers
	 * @param {number | number[]} b - number or tuple of two numbers
	 * @returns {boolean}
	 */
	function has_more_pieces (a, b) {
		if (typeof a === "number") return a > b;
		else return a[0] > b[0] || a[1] > b[1];
	}

	/**
	 * @param {number[]} tuple - tuple of two numbers
	 * @returns {number} sum of tuple entries
	 */
	function sum_tuple_coords (tuple){
		return tuple[0] + tuple [1];
	}

	/**
	 * @param {number[]} tuple - tuple of two numbers
	 * @returns {number[]} tuple ordered in descending order
	 */
	function ordered_tuple_descending (tuple) {
		if (tuple[0] < tuple [1]) return [tuple[1], tuple[0]];
		else return tuple;
	}

	/**
     * Detects if the game is drawn for insufficient material
     * @param {gamefile} gamefile - The gamefile
     * @returns {'draw insuffmat' | false} 'draw insuffmat', if the game is over by the insufficient material, otherwise *false*.
     */
    function detectInsufficientMaterial(gamefile) {
		// Only make the draw check if the win condition is checkmate for both players
		if (!wincondition.doesColorHaveWinCondition(gamefile, 'white', 'checkmate') || !wincondition.doesColorHaveWinCondition(gamefile, 'black', 'checkmate')) return false;
		if (wincondition.getWinConditionCountOfColor(gamefile, 'white') != 1 || wincondition.getWinConditionCountOfColor(gamefile, 'black') != 1) return false;

		// Only make the draw check if the last move was a capture or if there is no last move
		const lastMove = movesscript.getLastMove(gamefile.moves);
		if (lastMove && !lastMove.captured) return false;

		// Only make the draw check if there are less than 11 non-obstacle pieces
        if (gamefileutility.getPieceCountOfGame(gamefile, {ignoreVoids: false, ignoreObstacles: true}) >= 11) return false;

		// Create scenario object listing amount of all non-obstacle pieces in the game
		let scenario = {};
		// bishops are treated specially and separated by parity
		let bishopsW_count = [0, 0];
		let bishopsB_count = [0, 0];
		for(let key in gamefile.piecesOrganizedByKey) {
			const piece = gamefile.piecesOrganizedByKey[key];
			if (piece === "obstaclesN") continue;
			else if (math.trimWorBFromType(piece) === "bishops") {
				const parity = sum_tuple_coords(math.getCoordsFromKey(key)) % 2;
				if (math.getWorBFromType(piece) === "W") bishopsW_count[parity] += 1;
				else bishopsB_count[parity] += 1;
			}
			else if (piece in scenario) scenario[piece] += 1;
			else scenario[piece] = 1
		}

		// add bishop tuples to scenario, and make sure the first entry of the bishop lists is the largest one
		if (sum_tuple_coords(bishopsW_count) != 0) scenario["bishopsW"] = ordered_tuple_descending(bishopsW_count);
		if (sum_tuple_coords(bishopsB_count) != 0) scenario["bishopsB"] = ordered_tuple_descending(bishopsB_count);

		// Temporary: Short-circuit insuffmat check if a player has a pawn that he can promote
		// This is fully enough for the checkmate practice mode, for now
		// Future TODO: Create new scenarios for each possible promotion combination and check them all as well
		if (gamefile.gameRules.promotionRanks) {
			const promotionListWhite = gamefile.gameRules.promotionsAllowed.white;
			const promotionListBlack = gamefile.gameRules.promotionsAllowed.black;
			if ("pawnsW" in scenario && promotionListWhite.length != 0) return false;
			if ("pawnsB" in scenario && promotionListBlack.length != 0) return false;
		}

		// Create scenario object with inverted colors
		let invertedScenario = {};
		for (let piece in scenario) {
			const pieceInverted = piece.endsWith("W") ? piece.replace(/W$/, "B") : piece.replace(/B$/, "W");
			invertedScenario[pieceInverted] = scenario[piece];
		}

		// Make the draw checks by comparing scenario and invertedScenario to scenrariosForInsuffMat
		if (isScenarioInsuffMat(scenario)) return 'draw insuffmat';
		else if (isScenarioInsuffMat(invertedScenario)) return 'draw insuffmat';
		else return false;
    }

    return Object.freeze({
		detectInsufficientMaterial
	})

})();