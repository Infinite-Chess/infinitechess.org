
/*
 * This script calculates legal moves
 */

"use strict";

// Custom type definitions...

/** An object containing all the legal moves of a piece.
 * @typedef {Object} LegalMoves
 * @property {Object} individual - A list of the legal jumping move coordinates: `[[1,2], [2,1]]`
 * @property {Object} sliding - A dict containing length-2 arrays with the legal left and right slide limits: `{[1,0]:[-5, Infinity]}`
 */

const legalmoves = (function(){

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
        const vicinity = {}
        if (!gamefile.pieceMovesets) return console.error("Cannot generate vicinity before pieceMovesets is initialized.")

        // For every piece moveset...
        for (let i = 0; i < pieces.white.length; i++) {
            const thisPieceType = pieces.white[i]
            var thisPieceIndividualMoveset
            if (getPieceMoveset(gamefile, thisPieceType).individual) thisPieceIndividualMoveset = getPieceMoveset(gamefile, thisPieceType).individual;
            else thisPieceIndividualMoveset = []

            // For each individual move...
            for (let a = 0; a < thisPieceIndividualMoveset.length; a++) {
                const thisIndividualMove = thisPieceIndividualMoveset[a]
                
                // Convert the move into a key
                const key = math.getKeyFromCoords(thisIndividualMove)

                // Make sure the key's already initialized
                if (!vicinity[key]) vicinity[key] = [];

                const pieceTypeConcat = math.trimWorBFromType(thisPieceType) // Remove the 'W'/'B' from end of type

                // Make sure the key contains the piece type that can capture from that distance
                if (!vicinity[key].includes(pieceTypeConcat)) vicinity[key].push(pieceTypeConcat)
            }
        }
        return vicinity;
    }

    /**
     * Gets the moveset of the type of piece specified.
     * @param {gamefile} gamefile - The gamefile 
     * @param {string} pieceType - The type of piece
     * @returns {Object} A moveset object with the properties `individual`, `horizontal`, `vertical`, `diagonalUp`, `diagonalDown`.
     */
    function getPieceMoveset(gamefile, pieceType) {
        pieceType = math.trimWorBFromType(pieceType) // Remove the 'W'/'B' from end of type
        const movesetFunc = gamefile.pieceMovesets[pieceType];
        if (!movesetFunc) return {}; // Piece doesn't have a specified moveset (could be neutral). Return empty.
        return movesetFunc(); // Calling these parameters as a function returns their moveset.
    }

    /**
     * Calculates the legal moves of the provided piece in the provided gamefile.
     * @param {gamefile} gamefile - The gamefile
     * @param {Piece} piece - The piece: `{ type, coords, index }`
     * @param {Object} options - An object that may contain the `onlyCalcSpecials` option, that when *true*, will only calculate the legal special moves of the piece. Default: *false*
     * @returns {LegalMoves} The legalmoves object with the properties `individual`, `horizontal`, `vertical`, `diagonalUp`, `diagonalDown`.
     */
    function calculate(gamefile, piece, { onlyCalcSpecials = false } = {}) { // piece: { type, coords }
        if (piece.index == null) throw new Error("To calculate a piece's legal moves, we must have the index property.")
        const coords = piece.coords
        const type = piece.type;
        const trimmedType = math.trimWorBFromType(type);
        const color = math.getPieceColorFromType(type) // Color of piece calculating legal moves of

        if (color !== gamefile.whosTurn && !options.getEM()) return { individual: [] } // No legal moves if its not their turn!!

        const thisPieceMoveset = getPieceMoveset(gamefile, type) // Default piece moveset

        let legalIndividualMoves = [];
        let legalSliding = {};

        if (!onlyCalcSpecials) {

            // Legal jumping/individual moves
    
            shiftIndividualMovesetByCoords(thisPieceMoveset.individual, coords)
            legalIndividualMoves = moves_RemoveOccupiedByFriendlyPieceOrVoid(gamefile, thisPieceMoveset.individual, color)
            
            // Legal sliding moves
            if (thisPieceMoveset.sliding) {
                let lines = gamefile.startSnapshot.slidingPossible;
                for (let i=0; i<lines.length; i++) {
                    const line = lines[i];
                    if (!thisPieceMoveset.sliding[line]) continue;
                    const key = organizedlines.getKeyFromLine(line,coords);
                    legalSliding[line] = slide_CalcLegalLimit(gamefile.piecesOrganizedByLines[line][key],line, thisPieceMoveset.sliding[line], coords, color);
                };
            };

        }
        
        // Add any special moves!
        if (gamefile.specialDetects[trimmedType]) gamefile.specialDetects[trimmedType](gamefile, coords, color, legalIndividualMoves)

        let moves = {
            individual: legalIndividualMoves,
            sliding: legalSliding
        }
        
        // Skip if we've selected the opposite side's piece (edit mode)
        if (color === gamefile.whosTurn) checkdetection.removeMovesThatPutYouInCheck(gamefile, moves, piece, color)

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
            indivMove[0] += coords[0]
            indivMove[1] += coords[1]
        })
    }

    // Accepts array of moves, returns new array with illegal moves removed due to pieces occupying.
    function moves_RemoveOccupiedByFriendlyPieceOrVoid (gamefile, individualMoves, color) {
        if (!individualMoves) return; // No jumping moves possible

        for (let i = individualMoves.length - 1; i >= 0; i--) {
            const thisMove = individualMoves[i]

            // Is there a piece on this square?
            const pieceAtSquare = gamefileutility.getPieceTypeAtCoords(gamefile, thisMove)
            if (!pieceAtSquare) continue; // Next move if there is no square here

            // Do the colors match?
            const pieceAtSquareColor = math.getPieceColorFromType(pieceAtSquare)

            // If they match colors, move is illegal because we cannot capture friendly pieces. Remove the move.
            // ALSO remove if it's a void!
            if (color === pieceAtSquareColor
             || pieceAtSquare === 'voidsN') individualMoves.splice(i, 1)
        }

        return individualMoves;
    }

    /**
     * Takes in specified organized list, direction of the slide, the current moveset...
     * Shortens the moveset by pieces that block it's path.
     * @param {Piece[]} line - The list of pieces on this line 
     * @param {number[]} direction - The direction of the line: `[dx,dy]` 
     * @param {number[]} slideMoveset - How far this piece can slide in this direction: `[left,right]`. If the line is vertical, this is `[bottom,top]`
     * @param {number[]} coords - The coordinates of the piece with the specified slideMoveset.
     * @param {string} color - The color of friendlies
     */
    function slide_CalcLegalLimit (line, direction, slideMoveset, coords, color) {

        if (!slideMoveset) return; // Return undefined if there is no slide moveset

        // The default slide is [-Infinity, Infinity], change that if there are any pieces blocking our path!

        // For most we'll be comparing the x values, only exception is the vertical lines.
        const axis = direction[0] == 0 ? 1 : 0 
        const limit = math.copyCoords(slideMoveset);
        // Iterate through all pieces on same line
        for (let i = 0; i < line.length; i++) {
            // What are the coords of this piece?
            const thisPiece = line[i] // { type, coords }
            const thisPieceSteps = Math.floor((thisPiece.coords[axis]-coords[axis])/direction[axis])
            const thisPieceColor = math.getPieceColorFromType(thisPiece.type)
            const isFriendlyPiece = color === thisPieceColor
            const isVoid = thisPiece.type === 'voidsN';
            // Is the piece to the left of us or right of us?
            if (thisPieceSteps < 0) { // To our left

                // What would our new left slide limit be? If it's an opponent, it's legal to capture it.
                const newLeftSlideLimit = isFriendlyPiece || isVoid ? thisPieceSteps + 1 : thisPieceSteps
                // If the piece x is closer to us than our current left slide limit, update it
                if (newLeftSlideLimit > limit[0]) limit[0] = newLeftSlideLimit

            } else if (thisPieceSteps > 0) { // To our right

                // What would our new right slide limit be? If it's an opponent, it's legal to capture it.
                const newRightSlideLimit = isFriendlyPiece || isVoid ? thisPieceSteps - 1 : thisPieceSteps
                // If the piece x is closer to us than our current left slide limit, update it
                if (newRightSlideLimit < limit[1]) limit[1] = newRightSlideLimit

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
        if (math.areCoordsEqual(startCoords, endCoords)) return false;

        // Do one of the individual moves match?
        if (!ignoreIndividualMoves) {
            const individual = legalMoves.individual;
            const length = !individual ? 0 : individual.length;
            for (let i = 0; i < length; i++) {
                const thisIndividual = individual[i];
                if (!math.areCoordsEqual(endCoords, thisIndividual)) continue;
                // Subtle way of passing on the TAG of all special moves!
                specialdetect.transferSpecialFlags_FromCoordsToCoords(thisIndividual, endCoords);
                return true;
            }
        }

        for (var strline in legalMoves.sliding) {
            let line = math.getCoordsFromKey(strline); // 'dx,dy'
            let limits = legalMoves.sliding[strline]; // [leftLimit,rightLimit]

            let selectedPieceLine = organizedlines.getKeyFromLine(line,startCoords);
            let clickedCoordsLine = organizedlines.getKeyFromLine(line,endCoords);
            if (!limits || selectedPieceLine !== clickedCoordsLine) continue;

            if (!doesSlidingMovesetContainSquare(limits, line, startCoords, endCoords)) continue;
            return true;
        }
        return false;
    }

    /**
     * Tests if the provided move is legal to play in this game.
     * This accounts for the piece color AND legal promotions, AND their claimed game conclusion.
     * @param {gamefile} gamefile - The gamefile
     * @param {Move} move - The move, with the bare minimum properties: `{ startCoords, endCoords, promotion }`
     * @returns {boolean | string} *true* If the move is legal, otherwise a string containing why it is illegal.
     */
    function isOpponentsMoveLegal(gamefile, move, claimedGameConclusion) {
        if (!move) {
            console.log("Opponents move is illegal because it is not defined. There was likely an error in converting it to long format.");
            return 'Move is not defined. Probably an error in converting it to long format.';
        }
        // Don't modify the original move. This is because while it's simulated,
        // more properties are added such as `rewindInfo`.
        const moveCopy = math.deepCopyObject(move);

        const inCheckB4Forwarding = math.deepCopyObject(gamefile.inCheck);
        const attackersB4Forwarding = math.deepCopyObject(gamefile.attackers);

        const originalMoveIndex = gamefile.moveIndex; // Used to return to this move after we're done simulating
        movepiece.forwardToFront(gamefile, { flipTurn: false, animateLastMove: false, updateData: false, updateProperties: false, simulated: true });

        // Make sure a piece exists on the start coords
        const piecemoved = gamefileutility.getPieceAtCoords(gamefile, moveCopy.startCoords) // { type, index, coords }
        if (!piecemoved) {
            console.log(`Opponent's move is illegal because no piece exists at the startCoords. Move: ${JSON.stringify(moveCopy)}`)
            return rewindGameAndReturnReason('No piece exists at start coords.')
        }

        // Make sure it's the same color as your opponent.
        const colorOfPieceMoved = math.getPieceColorFromType(piecemoved.type)
        if (colorOfPieceMoved !== gamefile.whosTurn) {
            console.log(`Opponent's move is illegal because you can't move a non-friendly piece. Move: ${JSON.stringify(moveCopy)}`)
            return rewindGameAndReturnReason("Can't move a non-friendly piece.");
        }

        // If there is a promotion, make sure that's legal
        if (moveCopy.promotion) {
            if (!piecemoved.type.startsWith('pawns')) {
                console.log(`Opponent's move is illegal because you can't promote a non-pawn. Move: ${JSON.stringify(moveCopy)}`)
                return rewindGameAndReturnReason("Can't promote a non-pawn.");
            }
            const colorPromotedTo = math.getPieceColorFromType(moveCopy.promotion)
            if (gamefile.whosTurn !== colorPromotedTo) {
                console.log(`Opponent's move is illegal because they promoted to the opposite color. Move: ${JSON.stringify(moveCopy)}`)
                return rewindGameAndReturnReason("Can't promote to opposite color.");
            }
            const strippedPromotion = math.trimWorBFromType(moveCopy.promotion);
            if (!gamefile.gameRules.promotionsAllowed[gamefile.whosTurn].includes(strippedPromotion)) {
                console.log(`Opponent's move is illegal because the specified promotion is illegal. Move: ${JSON.stringify(moveCopy)}`)
                return rewindGameAndReturnReason('Specified promotion is illegal.');
            }
        } else { // No promotion, make sure they AREN'T moving to a promotion rank! That's also illegal.
            if (specialdetect.isPawnPromotion(gamefile, piecemoved.type, moveCopy.endCoords)) {
                console.log(`Opponent's move is illegal because they didn't promote at the promotion line. Move: ${JSON.stringify(moveCopy)}`)
                return rewindGameAndReturnReason("Didn't promote when moved to promotion line.");
            }
        }

        // Test if that piece's legal moves contain the destinationCoords.
        const legalMoves = legalmoves.calculate(gamefile, piecemoved);
        // This should pass on any special moves tags at the same time.
        if (!legalmoves.checkIfMoveLegal(legalMoves, moveCopy.startCoords, moveCopy.endCoords)) { // Illegal move
            console.log(`Opponent's move is illegal because the destination coords are illegal. Move: ${JSON.stringify(moveCopy)}`)
            return rewindGameAndReturnReason(`Destination coordinates are illegal. inCheck: ${JSON.stringify(gamefile.inCheck)}. attackers: ${JSON.stringify(gamefile.attackers)}. originalMoveIndex: ${originalMoveIndex}. inCheckB4Forwarding: ${inCheckB4Forwarding}. attackersB4Forwarding: ${JSON.stringify(attackersB4Forwarding)}`);
        }

        // Check the resulting game conclusion from the move and if that lines up with the opponents claim.
        // Only do so if the win condition is decisive (exclude win conditions declared by the server,
        // such as time, aborted, resignation, disconnect)
        if (claimedGameConclusion === false || wincondition.isGameConclusionDecisive(claimedGameConclusion)) {
            const color = math.getPieceColorFromType(piecemoved.type);
            const infoAboutSimulatedMove = movepiece.simulateMove(gamefile, moveCopy, color, { doGameOverChecks: true }) // { isCheck, gameConclusion }
            if (infoAboutSimulatedMove.gameConclusion !== claimedGameConclusion) {
                console.log(`Opponent's move is illegal because gameConclusion doesn't match. Should be "${infoAboutSimulatedMove.gameConclusion}", received "${claimedGameConclusion}". Their move: ${JSON.stringify(moveCopy)}`)
                return rewindGameAndReturnReason(`Game conclusion isn't correct. Received: ${claimedGameConclusion}. Should be ${infoAboutSimulatedMove.gameConclusion}`);
            }
        }

        // Did they have enough time to zoom out as far as they moved?
        // IMPLEMENT AFTER BIG DECIMALS.
        // The gamefile's metadata contains the start time of the game.
        // Use that to determine if they've had enough time to zoom as
        // far as they did since the game began
        // ...

        // Rewind the game back to the index we were originally on before simulating
        movepiece.rewindGameToIndex(gamefile, originalMoveIndex, { removeMove: false, updateData: false });

        return true; // By this point, nothing illegal!

        function rewindGameAndReturnReason(reasonIllegal) {
            // Rewind the game back to the index we were originally on
            movepiece.rewindGameToIndex(gamefile, originalMoveIndex, { removeMove: false, updateData: false });
            return reasonIllegal;
        }
    }

    // TODO: moveset changes
    // This requires coords be on the same line as the sliding moveset.

    /**
     * Tests if the piece's precalculated slideMoveset is able to reach the provided coords.
     * ASSUMES the coords are on the direction of travel!!!
     * @param {number[]} slideMoveset - The distance the piece can move along this line: `[left,right]`. If the line is vertical, this will be `[bottom,top]`.
     * @param {number[]} direction - The direction of the line: `[dx,dy]`
     * @param {number[]} pieceCoords - The coordinates of the piece with the provided sliding net
     * @param {number[]} coords - The coordinates we want to know if they can reach.
     * @returns {boolean} true if the piece is able to slide to the coordinates
     */
    function doesSlidingMovesetContainSquare(slideMoveset, direction, pieceCoords, coords) {
        // const step = math.getLineSteps(direction, pieceCoords, coords)
        // return step >= slideMoveset[0] && step <= slideMoveset[1];


        const axis = direction[0] === 0 ? 1 : 0
        const coordMag = coords[axis];
        const min = slideMoveset[0] * direction[axis] + pieceCoords[axis]
        const max = slideMoveset[1] * direction[axis] + pieceCoords[axis]

        return coordMag >= min && coordMag <= max;
    }

    /**
     * Accepts the calculated legal moves, tests to see if there are any
     * @param {LegalMoves} moves 
     * @returns {boolean} 
     */
    function hasAtleast1Move (moves) { // { individual, horizontal, vertical, ... }
        
        if (moves.individual.length > 0) return true;
        for (var line in moves.sliding)
            if (doesSlideHaveWidth(moves.sliding[line])) return true;

        function doesSlideHaveWidth(slide) { // [-Infinity, Infinity]
            if (!slide) return false;
            return slide[1] - slide[0] > 0;
        }

        return false;
    }

    return Object.freeze({
        genVicinity,
        getPieceMoveset,
        calculate,
        checkIfMoveLegal,
        doesSlidingMovesetContainSquare,
        hasAtleast1Move,
        slide_CalcLegalLimit,
        isOpponentsMoveLegal
    })

})();