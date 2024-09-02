
// Import Start
import gamefileutility from './gamefileutility.js';
import movepiece from './movepiece.js';
import animation from '../rendering/animation.js';
import colorutil from '../misc/colorutil.js';
import coordutil from '../misc/coordutil.js';
// Import End

"use strict";

/** This script returns the functions for UNDOING special moves */
const specialundo = {

    // This returns the functions for undo'ing special moves.
    // In the future, parameters can be added if variants have
    // different special moves for pieces.
    getFunctions() {
        return {
            "kings": specialundo.kings,
            "royalCentaurs": specialundo.kings,
            "pawns": specialundo.pawns
        };
    },

    // A custom special move needs to be able to:
    // * Delete a custom piece
    // * Move a custom piece
    // * Add a custom piece


    // ALL FUNCTIONS NEED TO:
    // * Make the move
    // * Animate the piece


    // Called when the moved piece to undo is a king
    // Tests if the move contains "castle" special move, if so it undos it!
    // RETURNS FALSE if no special move was detected!
    kings(gamefile, move, { updateData = true, animate = true } = {}) {

        const specialTag = move.castle; // { dir, coord }
        if (!specialTag) return false; // No special move to undo, return false to signify we didn't undo the move.

        // Move the king back
        
        let movedPiece = gamefileutility.getPieceAtCoords(gamefile, move.endCoords); // Returns { type, index, coords }
        movepiece.movePiece(gamefile, movedPiece, move.startCoords, { updateData }); // Changes the pieces coords and data in the organized lists without making any captures.

        // Move the rook back

        const kingCoords = movedPiece.coords;
        const castledPieceCoords = [kingCoords[0] - specialTag.dir, kingCoords[1]];
        movedPiece = gamefileutility.getPieceAtCoords(gamefile, castledPieceCoords); // Returns { type, index, coords }
        movepiece.movePiece(gamefile, movedPiece, specialTag.coord, { updateData }); // Changes the pieces coords and data in the organized lists without making any captures.
        // Restore the rook's special move rights if this is a simulated move
        // (the kings special move rights are restored within checkdetection.doesMovePutInCheck())
        if (!updateData) {
            const key = coordutil.getKeyFromCoords(specialTag.coord);
            gamefile.specialRights[key] = true;
        }


        if (animate) {
            animation.animatePiece(move.type, move.endCoords, move.startCoords);
            const resetAnimations = false;
            animation.animatePiece(movedPiece.type, castledPieceCoords, specialTag.coord, undefined, resetAnimations); // Castled piece
        }

        return true; // Special move has been undo'd!
    },

    // pawnIndex should be specified if it's a promotion move we're undoing
    pawns(gamefile, move, { updateData = true, animate = true } = {}) {

        const enpassantTag = move.enpassant; // -1/1
        const promotionTag = move.promotion; // promote type
        const isDoublePush = Math.abs(move.endCoords[1] - move.startCoords[1]) === 2;
        if (!enpassantTag && !promotionTag && !isDoublePush) return false; // No special move to execute, return false to signify we didn't move the piece.

        
        // First move piece back

        const movedPiece = gamefileutility.getPieceAtCoords(gamefile, move.endCoords); // Returns { type, index, coords }1
        
        // Detect promotion
        if (move.promotion) { // Was a promotion move
            // Delete promoted piece
            const WorB = colorutil.getColorExtensionFromType(movedPiece.type);
            movepiece.deletePiece(gamefile, movedPiece, { updateData });
            // Replace pawn back where it originally was
            const type = "pawns" + WorB;
            movepiece.addPiece(gamefile, type, move.startCoords, move.rewindInfo.pawnIndex, { updateData });
        } else { // Move it back normally
            movepiece.movePiece(gamefile, movedPiece, move.startCoords, { updateData }); // Changes the pieces coords and data in the organized lists without making any captures.
            // Remove the gamefile's enpassant flag ONLY if this is a simulated move!
            if (!updateData && isDoublePush) {
                delete gamefile.enpassant;
            }
        }

        // Next replace piece captured

        // Detect en passant
        if (move.enpassant) { // Was an an passant capture
            const type = move.captured;
            const captureCoords = [ move.endCoords[0], move.endCoords[1] + move.enpassant ];
            movepiece.addPiece(gamefile, type, captureCoords, move.rewindInfo.capturedIndex, { updateData });

        } else if (move.captured) { // Was NOT an passant, BUT there was a capture
            const type = move.captured;
            movepiece.addPiece(gamefile, type, move.endCoords, move.rewindInfo.capturedIndex, { updateData });
        }


        if (animate) animation.animatePiece(move.type, move.endCoords, move.startCoords);

        return true; // Special move has been undo'd!
    }
};

export default specialundo;