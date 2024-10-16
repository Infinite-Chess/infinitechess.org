
/**
 * @typedef {Object} atomicMix
 * @property {?Piece[]} nukedPieces
 */

/**
 * I hate vscode 
 * @typedef {Move  & atomicMix} atomicMove
 */

const atomic = (function() {
    function initListeners() {
        addEventListener('move', (e) => onMove(e.detail.gamefile,e.detail.move));
        addEventListener('rewindMove', (e) => onRewind(e.detail.gamefile, e.detail.move))
    }

    /**
     * 
     * @param {gamefile} gamefile 
     * @param {atomicMove} move 
     */
    function onRewind(gamefile, move) {
        if (!move.nukedPieces) return;

        for (const piece of move.nukedPieces) {
            movepiece.addPiece(gamefile, piece.type, piece.coords, piece.index)
        }
    }

    /**
     * 
     * @param {gamefile} gamefile 
     * @param {atomicMove} move 
     */
    function onMove(gamefile, move) {
        if (move.captured==null) return;

        const width = 1
        const height = 1

        move.nukedPieces = [];

        for (let dx = -width; dx <= width; dx++) { for (let dy = -height; dy <= height; dy++) {
            const ecoord = [move.endCoords[0] + dx, move.endCoords[1] + dy]
            const nukePiece = gamefileutility.getPieceAtCoords(gamefile, ecoord)

            if (!nukePiece) continue;

            movepiece.deletePiece(gamefile, nukePiece);
            move.nukedPieces.push(nukePiece);
        }};
    }
    return Object.freeze({
        initListeners,
    })
})();