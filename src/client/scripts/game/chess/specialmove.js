
// This script returns the functions for EXECUTING special moves

"use strict";

const specialmove = {

    // This returns the functions for executing special moves,
    // it does NOT calculate if they're legal.
    // In the future, parameters can be added if variants have
    // different special moves for pieces.
    getFunctions() {
        return {
            "kings": specialmove.kings,
            "royalCentaurs": specialmove.kings,
            "pawns": specialmove.pawns
        }
    },

    // A custom special move needs to be able to:
    // * Delete a custom piece
    // * Move a custom piece
    // * Add a custom piece


    // ALL FUNCTIONS NEED TO:
    // * Make the move
    // * Append the move
    // * Animate the piece


    // Called when the piece moved is a king.
    // Tests if the move contains "castle" special move, if so it executes it!
    // RETURNS FALSE if special move was not executed!
    kings(gamefile, piece, move, { updateData = true, animate = true, updateProperties = true, simulated = false } = {}) {

        const specialTag = move.castle; // { dir: -1/1, coord }
        if (!specialTag) return false; // No special move to execute, return false to signify we didn't move the piece.

        // Move the king to new square

        movepiece.movePiece(gamefile, piece, move.endCoords, { updateData }) // Make normal move

        // Move the rook to new square

        const pieceToCastleWith = gamefileutility.getPieceAtCoords(gamefile, specialTag.coord);
        const landSquare = [move.endCoords[0] - specialTag.dir, move.endCoords[1]]
        // Delete the rook's special move rights
        const key = math.getKeyFromCoords(pieceToCastleWith.coords)
        delete gamefile.specialRights[key];
        movepiece.movePiece(gamefile, pieceToCastleWith, landSquare, { updateData }) // Make normal move

        if (animate) {
            animation.animatePiece(piece.type, piece.coords, move.endCoords) // King
            const resetAnimations = false;
            animation.animatePiece(pieceToCastleWith.type, pieceToCastleWith.coords, landSquare, undefined, resetAnimations) // Castled piece
        }

        // Special move was executed!
        // There is no captured piece with castling
        return true;
    },

    pawns(gamefile, piece, move, { updateData = true, animate = true, updateProperties = true, simulated = false } = {}) {

        // If it was a double push, then add the enpassant flag to the gamefile, and remove its special right!
        if (updateProperties && specialmove.isPawnMoveADoublePush(piece.coords, move.endCoords)) {
            const [captureSquareX, captureSquareY] = specialmove.getEnPassantSquare(piece.coords, move.endCoords, piece.type.endsWith('U') || piece.type.endsWith('G'))
            gamefile.enpassant.push(captureSquareX, captureSquareY, move.endCoords[0], move.endCoords[1], {'white':0,'yellow':0,'black':2,'green':1,'red':2,'blue':3}[gamefile.whosTurn]);
        }

        const enPassantData = move.enpassant; // format: [captureSquare.x,captureSquare.y]
        const promotionTag = move.promotion; // promote type
        if (!enPassantData && !promotionTag) return false; // No special move to execute, return false to signify we didn't move the piece.

        const captureCoords = enPassantData == null ? move.endCoords : enPassantData;
        
        let capturedPiece = gamefileutility.getPieceAtCoords(gamefile, captureCoords)

        if (capturedPiece) move.captured = capturedPiece.type;
        if (capturedPiece && simulated) move.rewindInfo.capturedIndex = capturedPiece.index;

        // Delete the piece captured
        if (capturedPiece) movepiece.deletePiece(gamefile, capturedPiece, { updateData })

        if (promotionTag) {
            // Delete original pawn
            movepiece.deletePiece(gamefile, piece, { updateData })

            movepiece.addPiece(gamefile, promotionTag, move.endCoords, null, { updateData })

        } else /* enpassantTag */ {
            // Move the pawn
            movepiece.movePiece(gamefile, piece, move.endCoords, { updateData })
        }

        if (animate) animation.animatePiece(piece.type, piece.coords, move.endCoords, capturedPiece)

        // Special move was executed!
        return true;
    },

    isPawnMoveADoublePush(pawnCoords, endCoords) { return Math.abs(pawnCoords[1] - endCoords[1]) === 2 || Math.abs(pawnCoords[0] - endCoords[0]) === 2 },

    /**
     * Returns the en passant square of a pawn double push move
     * @param {number[]} moveStartCoords - The start coordinates of the move
     * @param {number[]} moveEndCoords - The end coordinates of the move
     * @returns {number[]} The coordinates en passant is allowed
     */
    getEnPassantSquare(moveStartCoords, moveEndCoords, isHorizontalColor=false) {
        if(isHorizontalColor === true){
            const x = (moveStartCoords[0] + moveEndCoords[0]) / 2;
            return [x, moveStartCoords[1]];
        }
        const y = (moveStartCoords[1] + moveEndCoords[1]) / 2;
        return [moveStartCoords[0], y]
    },

    // Obselete - coordinates are stored in the enPassant directly.
    // // MUST require there be an enpassant tag!
    // getEnpassantCaptureCoords(endCoords, enpassantTag, isHorizontalColor=false) {
    //     if(isHorizontalColor === true){
    //         // enPassantTag = 1 means we moved down, need to move back up
    //         return [endCoords[0], endCoords[1] - enpassantTag]
    //     } else {
    //         return [endCoords[0], endCoords[1] + enpassantTag];
    //     }
        
    // },
};