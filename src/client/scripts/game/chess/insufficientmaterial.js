// Draw detection by insufficient material

"use strict";

const insufficientmaterial = (function(){

	const scenrariosForInsuffMat = [
		{'kingsB': Infinity, 'kingsW': Infinity},

		// with the white king
		{'kingsB': 1, 'kingsW': 1, 'queensW': 1},
		{'kingsB': 1, 'kingsW': 1, 'bishopsW': 3},
		{'kingsB': 1, 'kingsW': 1, 'knightsW': 3},
		{'kingsB': 1, 'kingsW': 1, 'hawksW': 2},
		{'kingsB': 1, 'kingsW': 1, 'rooksW': 1, 'knightsW': 1},
		{'kingsB': 1, 'kingsW': 1, 'rooksW': 1, 'bishopsW': 1},
		{'kingsB': 1, 'kingsW': 1, 'archbishopsW': 1, 'bishopsW': 1},
		{'kingsB': 1, 'kingsW': 1, 'archbishopsW': 1, 'knightsW': 1},
		{'kingsB': 1, 'kingsW': 1, 'bishopsW': 2, 'knightsW': 1},
		{'kingsB': 1, 'kingsW': 1, 'bishopsW': 1, 'knightsW': 2},
		{'kingsB': 1, 'kingsW': 1, 'guardsW': 1},
		{'kingsB': 1, 'kingsW': 1, 'pawnsW': 3},

		// without the white king
		{'kingsB': 1, 'queensW': 1, 'rooksW': 1},
		{'kingsB': 1, 'bishopsW': 5},
		{'kingsB': 1, 'knightsW': 4},
		{'kingsB': 1, 'bishopsW': 2, 'knightsW': 2},
		{'kingsB': 1, 'bishopsW': 3, 'knightsW': 1},
		{'kingsB': 1, 'hawksW': 3},
		{'kingsB': 1, 'rooksW': 1, 'bishopsW': 1, 'knightsW': 1},
		{'kingsB': 1, 'rooksW': 1, 'knightsW': 2},
		{'kingsB': 1, 'rooksW': 1, 'guardsW': 1},
		{'kingsB': 1, 'rooksW': 2, 'bishopsW': 1},
		{'kingsB': 1, 'rooksW': 2, 'knightsW': 1},
		{'kingsB': 1, 'archbishopsW': 1, 'bishopsW': 2},
		{'kingsB': 1, 'archbishopsW': 1, 'knightsW': 2},
		{'kingsB': 1, 'archbishopsW': 2},
		{'kingsB': 1, 'chancellorsW': 1, 'guardsW': 1},
		{'kingsB': 1, 'chancellorsW': 1, 'knightsW': 1},
		{'kingsB': 1, 'chancellorsW': 1, 'rooksW': 1},
		{'kingsB': 1, 'guardsW': 2},
		{'kingsB': 1, 'amazonsW': 1},
		{'kingsB': 1, 'pawnsW': 6},
	];

	/**
	 * Detects if the provided piecelist scenario is a draw by insufficient material
	 * @param {Object} scenario - scenario of piececounts in the game, e.g. {'kingsB': 1, 'kingsW': 1, 'queensW': 3}
	 * @returns {boolean} *true*, if the scenario is a draw by insufficient material, otherwise *false*
	 */
	function isScenarioInsuffMat(scenario) {
		// lopp over all draw scenarios to see if they apply here
		drawscenarioloop:
		for (let drawScenario of scenrariosForInsuffMat){
			for (let piece in scenario) {
				// discard draw scenario if it does not fit the scenario
				if (!(piece in drawScenario) || (scenario[piece] > drawScenario[piece])) continue drawscenarioloop;
			}
			return true;
		}
		return false;
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

		// Only make the draw check if there are less than 8 non-obstacle pieces
        if (gamefileutility.getPieceCountOfGame(gamefile, {ignoreVoids: false, ignoreObstacles: true}) >= 8) return false;

		// Create scenario object listing amount of all non-obstacle pieces in the game
		let scenario = {};
		for(let key in gamefile.piecesOrganizedByKey) {
			const piece = gamefile.piecesOrganizedByKey[key];
			if (piece === "obstaclesN") continue;
			else if (piece in scenario) scenario[piece] += 1;
			else scenario[piece] = 1
		}

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