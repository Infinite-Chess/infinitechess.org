"use strict";

const insufficientmaterial = (function(){

	
	/**
     * Checks if there is no pieces of color `color` with piece types other than pieces type in `pieceTypes` and the king with given `color`.
     * @param {string[]} pieceTypes - The piece types
     * @param {string} color - The piece's color
	 * @param {Object} pieceCountTable - A object representing a table that maps piece types of color `color` to their count
     * @returns {boolean} **true** if there is no pieces of color `color` with pieces types other than pieces type in `pieceTypes` and the king with given `color`, otherwise returns **false**
     */
	function noPieceTypesOtherThan(pieceTypes, color, pieceCountTable) {
		return Object.keys(pieceCountTable).some(x => pieceTypes.includes(x) || x === `kings${color}` || pieceCountTable[x] === 0);
	}

	// Returns true if it is draw by insufficient material for that side otherwise returns false
	function checkdetectInsufficientMaterialForSide(gamefile, piecesOfColor, color) {
		const pieceCountTable = {};
		for (let pieceType of piecesOfColor) {
			pieceCountTable[pieceType] = gamefileutility.getPieceAmount(gamefile, pieceType);

		}
		// refer to the theory spreadsheet
		// https://docs.google.com/spreadsheets/d/13KWe6atX2fauBhthJbzCun_AmKXvso6NY2_zjKtikfc/edit
		debugger;
		if (pieceCountTable[`queens${color}`] <= 1 && noPieceTypesOtherThan([`queens${color}`], color, pieceCountTable)) return true;
		if (pieceCountTable[`bishops${color}`] <= 3 && noPieceTypesOtherThan([`bishops${color}`], color, pieceCountTable)) return true;
		if (pieceCountTable[`knights${color}`] <= 3 && noPieceTypesOtherThan([`knights${color}`], color, pieceCountTable)) return true;
		if (pieceCountTable[`hawks${color}`] <= 2 && noPieceTypesOtherThan([`hawks${color}`], color, pieceCountTable)) return true;
		if (pieceCountTable[`archbishops${color}`] <= 1 && pieceCountTable[`bishops${color}`] <= 1 && noPieceTypesOtherThan([`archbishops${color}`, `bishops${color}`], color, pieceCountTable)) return true;
		if (pieceCountTable[`archbishops${color}`] <= 1 && pieceCountTable[`knights${color}`] <= 1 && noPieceTypesOtherThan([`archbishops${color}`, `knights${color}`], color, pieceCountTable)) return true;
		if (pieceCountTable[`bishops${color}`] <= 2 && pieceCountTable[`knights${color}`] <= 1 && noPieceTypesOtherThan([`bishops${color}`, `knights${color}`], color, pieceCountTable)) return true;
		if (pieceCountTable[`bishops${color}`] <= 1 && pieceCountTable[`knights${color}`] <= 2 && noPieceTypesOtherThan([`bishops${color}`, `knights${color}`], color, pieceCountTable)) return true;
		return false;
	}

	/**
     * Detects if the game is drawn for insufficient material
     * @param {gamefile} gamefile - The gamefile
     * @returns {string | false} 'draw insuffmat', if the game is over by the insufficient material, otherwise *false*.
     */
    const detectInsufficientMaterial = function(gamefile) {
		debugger
		if (gamefile.gameRules.winCondition && gamefile.gameRules.winCondition[gamefile.whosTurn] !== "checkmate") return false;
        if (gamefile.ourPieces.voidsN.length > 0) return false; // temporary until the theory spreadsheet gets updated.
		const lastMove = movesscript.getLastMove(gamefile.moves);
		if (lastMove && !lastMove.captured) return false;
        if (gamefileutility.getPieceCountOfGame(gamefile) >= 5) return false; // TODO: check for complicated draws (ex unpromotable pawns)

		
		let blackPieceCount = pieces.black.reduce((currentCount, pieceType) => {
			return currentCount + gamefileutility.getPieceAmount(gamefile, pieceType);
		}, 0)
		let whitePieceCount = pieces.white.reduce((currentCount, pieceType) => {
			return currentCount + gamefileutility.getPieceAmount(gamefile, pieceType);
		}, 0)

		if (blackPieceCount > 1 && whitePieceCount > 1) return false; // theory spreadsheet assumes a king is alone.
		if (blackPieceCount === 1 && whitePieceCount === 1) return 'draw insuffmat'; // trivial case.

		if (whitePieceCount === 1) {
			// check for black's pieces when white king is alone.
			if(checkdetectInsufficientMaterialForSide(gamefile, pieces.black, 'B')) return 'draw insuffmat';
		} else { 
			// if whitePieceCount isn't 1 then blackPieceCount gotta be 1
			// check for white's pieces when black king is alone.
			if(checkdetectInsufficientMaterialForSide(gamefile, pieces.white, 'W')) return 'draw insuffmat';
		}
        return false;
    }

    return Object.freeze({
		detectInsufficientMaterial
	})

})();