// Currently, this draw detection by insufficient material only works for games with the checkmate win condition and with exactly one king per side

// TODO: add support for more different piece combinations, void squares, obstacles, promotion lines, royals and win conditions

// TODO: refactor detectInsufficientMaterialForSideAgainstLoneKing() method, it is quite ugly.
// Ideally, create a nice clean dictionary encoding all the drawn piece and rule combinations instead of having a bunch of ugly if-else checks

"use strict";

const insufficientmaterial = (function(){

	
	/**
     * Checks if there is no pieces of color `color` with piece types other than pieces type in `pieceTypes` and the king with given `color`.
     * @param {string[]} pieceTypes - The piece types
     * @param {string} c - `W` | `B` The piece's color
	 * @param {Object} pieceCountTable - An object representing a table that maps piece types of color `color` to their count
     * @returns {boolean} **true** if there is no pieces of color `color` with pieces types other than pieces type in `pieceTypes` and the king with given `color`, otherwise returns **false**
     */
	function noPieceTypesOtherThan(pieceTypes, c, pieceCountTable) {
		return Object.keys(pieceCountTable).every(x => pieceTypes.includes(x) || x === `kings${c}` || pieceCountTable[x] === 0);
	}

	const pieceCombinationsForDrawCheckmate = [
		[['queens', 1]],
		[['bishops', 3]],
		[['knights', 3]],
		[['hawks', 2]],
		[['archbishops', 1],['bishops',1]],
		[['archbishops', 1],['knights',1]],
		[['bishops', 2], ['knights', 1]],
		[['bishops', 1], ['knights', 2]]
	]

	/**
	 * 
	 * @param {string[][][]} pieceCombinationsList
	 * @param {string} c - `W` | `B` the pieces' color
	 * @param {Object} pieceCountTable - An object representing a table that maps piece types of color `color` to their count
	 * @returns {boolean} **true** if the combination is found otherwise returns **false**
	 */
	function checkForPieceCombinations(pieceCombinationsList, c, pieceCountTable) {
		for (let pieceCombination of pieceCombinationsList) {
			const pieceTypes = pieceCombination.map(x => `${x[0]}${c}`);
			if(!noPieceTypesOtherThan(pieceTypes, c, pieceCountTable)) continue;

			let allPiecesSatisfyPieceCount = true;

			for (let [pieceType, pieceCount] of pieceCombination) {
				if( pieceCountTable[`${pieceType}${c}`] > pieceCount) {
					allPiecesSatisfyPieceCount = false;
					break;
				};
			}
			if(!allPiecesSatisfyPieceCount) continue
			return true
		}
		return false;
	}

	/**
	 * Checks if a given piece list is insufficient to achieve mate for a player of a given color against a lone king
	 * @param {gamefile} gamefile - the gamefile
	 * @param {String[]} piecesOfColor - The piece types, aka an array containing all the possible piece names for the player of a given color
	 * @param {String} color - a string specifying the player who will be checked for sufficient material, either 'white' or 'black'
	 * @returns **true** if the player given by color cannot possibly checkmate an opposing lone king using his pieces of the type piecesOfColor
	 */
	function detectInsufficientMaterialForSideAgainstLoneKing(gamefile, piecesOfColor, color) {
		const pieceCountTable = {};
		for (let pieceType of piecesOfColor) {
			pieceCountTable[pieceType] = gamefileutility.getPieceAmount(gamefile, pieceType);
		}

		let c = math.getWorBFromColor(color);

		// refer to the theory spreadsheet
		// https://docs.google.com/spreadsheets/d/13KWe6atX2fauBhthJbzCun_AmKXvso6NY2_zjKtikfc/edit

		return checkForPieceCombinations(pieceCombinationsForDrawCheckmate, c, pieceCountTable);
	}

	/**
     * Detects if the game is drawn for insufficient material
     * @param {gamefile} gamefile - The gamefile
     * @returns {string | false} 'draw insuffmat', if the game is over by the insufficient material, otherwise *false*.
     */
    const detectInsufficientMaterial = function(gamefile) {
		// Only make the draw check if the win condition is checkmate for both players
		if (!gamefile.gameRules.winConditions.white.includes("checkmate") || !gamefile.gameRules.winConditions.black.includes("checkmate")) return false;
		if (gamefile.gameRules.winConditions.white.length != 1 || gamefile.gameRules.winConditions.black.length != 1) return false;

		// Only make the draw check if the last move was a capture
		const lastMove = movesscript.getLastMove(gamefile.moves);
		if (lastMove && !lastMove.captured) return false;

		// Temporary: only make the draw check if there are less than 5 pieces
        if (gamefileutility.getPieceCountOfGame(gamefile) >= 5) return false;

		// Temporary: only make the draw check if there are no voids
        if (gamefile.ourPieces.voidsN.length > 0) return false;
		
		// Get the total piece count for each player
		let blackPieceCount = pieces.black.reduce((currentCount, pieceType) => {
			return currentCount + gamefileutility.getPieceAmount(gamefile, pieceType);
		}, 0);
		let whitePieceCount = pieces.white.reduce((currentCount, pieceType) => {
			return currentCount + gamefileutility.getPieceAmount(gamefile, pieceType);
		}, 0);

		// Temporary: only check for draws if a player has a lone king and no other royals
		if (blackPieceCount > 1 && whitePieceCount > 1) return false;
		if (gamefileutility.getPieceAmount(gamefile, 'kingsB') !== 1 || gamefileutility.getPieceAmount(gamefile, 'kingsW') !== 1) return false;
		if (gamefileutility.getRoyalCountOfColor(gamefile.piecesOrganizedByKey, 'white') > 1 || gamefileutility.getRoyalCountOfColor(gamefile.piecesOrganizedByKey, 'black') > 1) return false;
		if (blackPieceCount == 1 && whitePieceCount == 1) return 'draw insuffmat'; // trivial case.

		// Check for black's pieces when the white king is alone and vice versa
		if (whitePieceCount == 1) {
			if(detectInsufficientMaterialForSideAgainstLoneKing(gamefile, pieces.black, 'black')) return 'draw insuffmat';
		} else {
			if(detectInsufficientMaterialForSideAgainstLoneKing(gamefile, pieces.white, 'white')) return 'draw insuffmat';
		}
        return false;
    }

    return Object.freeze({
		detectInsufficientMaterial
	})

})();