// This script is used to test if given gamefiles are in check,
// also for simulating which moves would lead to check and removed from the list of legal moves.
// We also detect checkmate, stalemate, and repetition here.

"use strict";

const checkdetection = (function(){

    /**
     * Tests if the provided gamefile is currently in check.
     * Appends any attackers to the `attackers` list.
     * @param {gamefile} gamefile - The gamefile
     * @param {string} color - The side to test if their king is in check. "white" or "black"
     * @param {Array} attackers - An empty array []
     * @returns {boolean} true if in check
     */
    function detectCheck(gamefile, color, attackers) {
        // Input validation
        if (!gamefile) throw new Error("Cannot detect check of an undefined game!")
        if (color !== 'white' && color !== 'black') throw new Error(`Cannot detect check of the team of color ${color}!`)
        if (attackers != null && attackers.length !== 0) throw new Error(`Attackers parameter must be an empty array []! Received: ${JSON.stringify(attackers)}`)

        // Coordinates of ALL royals of this color!
        const royalCoords = gamefileutility.getRoyalCoords(gamefile, color) // [ coords1, coords2 ]
        // Array of coordinates of royal pieces that are in check
        const royalsInCheck = [];

        for (let i = 0; i < royalCoords.length; i++) {
            const thisRoyalCoord = royalCoords[i]; // [x,y]

            if (isSquareBeingAttacked(gamefile, thisRoyalCoord, color, attackers)) royalsInCheck.push(thisRoyalCoord);
        }

        if (royalsInCheck.length > 0) return royalsInCheck; // Return if atleast 1 royal is in check!

        return false; // Not in check
    }

    // Checks if opponent is attacking specified square. If so, returns true.
    // If an attackers empty array [] is specified, it will fill it in the format: [ {coords, slidingCheck}, ... ]
    function isSquareBeingAttacked(gamefile, coord, colorOfFriendly, attackers) {
        // Input validation
        if (!gamefile) throw new Error("Cannot detect if a square of an undefined game is being attacked!")
        if (!coord) return false;
        if (colorOfFriendly !== 'white' && colorOfFriendly !== 'black') throw new Error(`Cannot detect if an opponent is attacking the square of the team of color ${colorOfFriendly}!`)

        // How do we find out if this square is attacked?

        // 1. We check every square within a 3 block radius to see if there's any attacking pieces.

        if (doesVicinityAttackSquare(gamefile, coord, colorOfFriendly, attackers)) return true;
        // What about pawns? Could they capture us?
        if (doesPawnAttackSquare(gamefile, coord, colorOfFriendly, attackers)) return true;

        // 2. We check every orthogonal and diagonal to see if there's any attacking pieces.
        if (doesSlideAttackSquare(gamefile, coord, colorOfFriendly, attackers)) return true;

        return false; // Being attacked if true
    }

    // Checks to see if any piece within a 3-block radius can capture. Ignores sliding movesets.
    // If there is, appends to "attackers".
    // DOES NOT account for pawns. For that use  doesPawnAttackSquare()
    function doesVicinityAttackSquare (gamefile, coords, color, attackers) {

        const vicinity = gamefile.vicinity;
        for (let key in vicinity) {
            const thisVicinity = vicinity[key];
            const thisSquare = math.getCoordsFromKey(key) // Part of the moveset ( [1,2], [2,1] ... )
            const actualSquare = [coords[0] + thisSquare[0], coords[1] + thisSquare[1]];

            // Fetch the square from our pieces organized by key
            const key2 = math.getKeyFromCoords(actualSquare);
            const typeOnSquare = gamefile.piecesOrganizedByKey[key2];
            if (!typeOnSquare) continue; // Nothing there to capture us
            // Is it the same color?
            const typeOnSquareColor = math.getPieceColorFromType(typeOnSquare)
            if (color === typeOnSquareColor) continue; // A friendly can't capture us

            const typeOnSquareConcat = math.trimWorBFromType(typeOnSquare)

            // Is that a match with any piece type on this vicinity square?
            if (thisVicinity.includes(typeOnSquareConcat)) { // This square can be captured
                if (attackers) appendAttackerToList(attackers, { coords: actualSquare, slidingCheck: false })
                return true; // There'll never be more than 1 short-range/jumping checks!
            }; 
        }

        return false;
    }

    function doesPawnAttackSquare (gamefile, coords, color, attackers) {

        const oneOrNegOne = color === 'white' ? 1 : -1;
        for (let a = -1; a <= 1; a += 2) {
            const thisSquare = [coords[0] - a, coords[1] + oneOrNegOne]

            let key = math.getKeyFromCoords(thisSquare)
            const pieceOnSquare = gamefile.piecesOrganizedByKey[key]
            if (!pieceOnSquare) continue;

            const pieceIsFriendly = color === math.getPieceColorFromType(pieceOnSquare)
            if (pieceIsFriendly) continue; // Can't capture us

            const pieceIsPawn = pieceOnSquare.startsWith('pawns')
            if (pieceIsPawn) {
                if (attackers) appendAttackerToList(attackers, { coords: thisSquare, slidingCheck: false })
                return true; // A pawn can capture on this square. There'll never be more than 1 short-range checks.
            }
        }

        return false;
    }

    // Returns true if there's any sliding piece that can capture on that square
    /**
     * 
     * @param {gamefile} gamefile 
     * @param {number[][]} coords 
     * @param {string} color 
     * @param {Array} attackers 
     * @returns 
     */
    function doesSlideAttackSquare (gamefile, coords, color, attackers) {
        for (const line of gamefile.startSnapshot.slideMovesPossible) {
            console.log(line)
            const strline = math.getKeyFromCoords(line)
            const key = math.getLineFromCoords(line, coords)
            if (doesLineAttackSquare(gamefile, gamefile.piecesOrganizedByLines[strline][key], line, coords, color, attackers)) return true;
        }

        return false;
    }

    // Returns true if a piece on the specified line can capture on that square
    // THIS REQUIRES  coords  be already on the line.
    function doesLineAttackSquare(gamefile, line, direction, coords, colorOfFriendlys, attackers) {

        if (!line) return false; // No line, no pieces to attack
        const lineIsVertical = direction[0]==0
        for (let a = 0; a < line.length; a++) { // { coords, type }
            const thisPiece = line[a];

            const thisPieceColor = math.getPieceColorFromType(thisPiece.type)
            if (colorOfFriendlys === thisPieceColor) continue; // Same team, can't capture us, CONTINUE next piece!
            if (thisPieceColor === 'neutral') continue;

            const thisPieceMoveset = legalmoves.getPieceMoveset(gamefile, thisPiece.type)

            if (!thisPieceMoveset.slideMoves) {console.log(thisPiece); continue};
            const moveset = thisPieceMoveset.slideMoves[math.getKeyFromCoords(direction)];
            if (!moveset) {console.log(thisPiece, thisPieceMoveset.slideMoves); continue};
            const thisPieceLegalSlide = legalmoves.slide_CalcLegalLimit(line, lineIsVertical, moveset, thisPiece.coords, thisPieceColor)
            if (!thisPieceLegalSlide) continue; // This piece has no horizontal moveset, NEXT piece on this line!

            // const rectangle = {left: thisPieceLegalSlide[0], right: thisPieceLegalSlide[1], bottom: coords[1], top: coords[1]}
            // const isWithinMoveset = math.boxContainsSquare(rectangle, coords)
            const isWithinMoveset = legalmoves.doesSlideMovesetContainSquare(thisPieceLegalSlide, lineIsVertical, coords)

            if (isWithinMoveset) {
                if (attackers) appendAttackerToList(attackers, { coords: thisPiece.coords, slidingCheck: true })
                return true; // There'll never be more than 1 checker on the same line
                // There are 2 sides? s<-k->s
            }
        }

        return false;
    }

    /**
     * Only appends the attacker giving us check if they aren't already in our list.
     * This can happen if the same piece is checking multiple royals.
     * However, we do want to upgrade them to `slidingCheck` if this one is.
     * @param {Object[]} attackers - The current attackers list, of pieces that are checking us.
     * @param {Object} attacker - The current attacker we want to append, with the properties `coords` and `slidingCheck`.
     */
    function appendAttackerToList(attackers, attacker) {
        for (let i = 0; i < attackers.length; i++) {
            const thisAttacker = attackers[i]; // { coords, slidingCheck }
            if (!math.areCoordsEqual(thisAttacker.coords, attacker.coords)) continue; // Not the same piece
            // The same piece...
            // Upgrade the slidingCheck to true, if applicable.
            if (attacker.slidingCheck) thisAttacker.slidingCheck = true;
            return;
        }
        // The piece was not found in the list, add it...
        attackers.push(attacker);
    }

    // Time Complexity: O(1).
    // Auto disable this when the win condition is NOT checkmate!
    function removeMovesThatPutYouInCheck (gamefile, moves, pieceSelected, color) { // moves: { individual: [], horizontal: [], ... }
        if (!wincondition.isOpponentUsingWinCondition(gamefile, 'checkmate')) return;

        // There's a couple type of moves that put you in check:

        // 1. Sliding moves. Possible they can open a discovered check, or fail to address an existing check.
        // Check these FIRST because in situations where we are in existing check, additional individual moves may be added.
        removeSlidingMovesThatPutYouInCheck(gamefile, moves, pieceSelected, color)

        // 2. Individual moves. We can iterate through these and use detectCheck() to test them.
        removeIndividualMovesThatPutYouInCheck(gamefile, moves.individual, pieceSelected, color)
    }

    // Time complexity O(1)
    function removeIndividualMovesThatPutYouInCheck(gamefile, individualMoves, pieceSelected, color) { // [ [x,y], [x,y] ]
        if (!individualMoves) return;

        // Simulate the move, then check the game state for check
        for (let i = individualMoves.length - 1; i >= 0; i--) {
            const thisMove = individualMoves[i]; // [x,y]
            if (doesMovePutInCheck(gamefile, pieceSelected, thisMove, color)) individualMoves.splice(i, 1); // Remove the move
        }
    }

    // Simulates the move, tests for check, undos the move. Color is the color of the piece we're moving
    function doesMovePutInCheck(gamefile, pieceSelected, destCoords, color) { // pieceSelected: { type, index, coords }
        /** @type {Move} */
        const move = { type: pieceSelected.type, startCoords: math.deepCopyObject(pieceSelected.coords), endCoords: movepiece.stripSpecialMoveTagsFromCoords(destCoords) }
        specialdetect.transferSpecialFlags_FromCoordsToMove(destCoords, move);
        return movepiece.simulateMove(gamefile, move, color).isCheck;
    }

    // Time complexity: O(slides) basically O(1) unless you add a ton of slides to a single piece
    function removeSlidingMovesThatPutYouInCheck (gamefile, moves, pieceSelected, color) {

        if (math.isEmpty(moves.slides)) return;

        const royalCoords = gamefileutility.getJumpingRoyalCoords(gamefile, color); // List of coordinates of all our royal jumping pieces

        if (royalCoords.length === 0) return; // No king, no open discoveries, don't remove any sliding moves

        // There are 2 ways a sliding move can put you in check:

        // 1. By not blocking, or capturing an already-existing check.
        if (addressExistingChecks(gamefile, moves, royalCoords, pieceSelected.coords)) return;

        // 2. By opening a discovered on your king.
        royalCoords.forEach(thisRoyalCoords => { // Don't let the piece open a discovered on ANY of our royals! Not just one.
            removeSlidingMovesThatOpenDiscovered(gamefile, moves, thisRoyalCoords, pieceSelected, color)
        })
    }

    /**
     * If there's an existing check: Returns true and removes all sliding moves that don't address the check.
     * @param {gamefile} gamefile - The gamefile
     * @param {LegalMoves} legalMoves - The legal moves object of which to delete moves that don't address check.
     * @param {number[][]} royalCoords - A list of our friendly jumping royal pieces
     * @param {number[]} selectedPieceCoords - The coordinates of the piece we're calculating the legal moves for.
     * @returns {boolean} true if we are in check. If so, all sliding moves are deleted, and finite individual blocking/capturing individual moves are appended.
     */
    function addressExistingChecks (gamefile, legalMoves, royalCoords, selectedPieceCoords) {
        if (!gamefile.inCheck) return false; // Exit if not in check

        const attackerCount = gamefile.attackers.length;
        if (attackerCount === 0) throw new Error("We are in check, but there is no specified attacker!")

        // To know how to address the check, we have to know where the check is coming from.
        // For now, add legal blocks for the first attacker, not the others. Since legal blocks
        // are added as extra individual moves, they will be simulated afterward. And if
        // the inCheck property comes back as false, then it will block ALL attackers!
        const attacker = gamefile.attackers[0]; // { coords, slidingCheck }

        // Does this piece have a sliding moveset that will either...

        // 1. Capture the checking piece

        const capturingNotPossible = attackerCount > 1; // Capturing not possible with a double-check, forced to dodge, or block if possible.

        // Check if the piece has the ability to capture
        if (!capturingNotPossible && legalmoves.checkIfMoveLegal(legalMoves, selectedPieceCoords, attacker.coords, { ignoreIndividualMoves: true })) {
            legalMoves.individual.push(attacker.coords) // Can capture!
        }

        // 2. Block the check

        // If it's a jumping move (not sliding), or if the piece is 1 square away,
        // then there's no way to block.
        const dist = math.chebyshevDistance(royalCoords[0], attacker.coords)
        if (!attacker.slidingCheck || dist === 1) {
            eraseAllSlidingMoves();
            return true;
        }
        
        appendBlockingMoves(royalCoords[0], attacker.coords, legalMoves, selectedPieceCoords)
        eraseAllSlidingMoves();

        return true;

        function eraseAllSlidingMoves() {
            legalMoves.slides = {}
        }
    }

    function removeSlidingMovesThatOpenDiscovered (gamefile, moves, kingCoords, pieceSelected, color) {

        const selectedPieceCoords = pieceSelected.coords;
        let sameLines = [];
        for (const line of gamefile.startSnapshot.slideMovesPossible) { // Only check current possible slides
            if (math.getLineFromCoords(line, kingCoords) !== math.getLineFromCoords(line, selectedPieceCoords)) continue;
            sameLines.push(line);
        };


        // If not sharing any common line, there's no way we can open a discovered
        if (sameLines.length===0) return;

        // Delete the piece, and add it back when we're done!
        const deletedPiece = math.deepCopyObject(pieceSelected);
        movepiece.deletePiece(gamefile, pieceSelected, { updateData: false });
        
        let checklines = [];
        for (const line of sameLines) {
            const strline = math.getKeyFromCoords(line);
            const key = math.getLineFromCoords(line,kingCoords);
            const opensDiscovered = doesLineAttackSquare(gamefile, gamefile.piecesOrganizedByLines[strline][key], 'horizontal', kingCoords, color, [])
            if (!opensDiscovered) continue;
            checklines.push(line);
        }
        const tempslides = {}
        if (checklines.length > 1) {
            if (math.areLinesCollinear(checklines)) {
                for (const line of checklines) {
                    const strline = math.getKeyFromCoords(line)
                    tempslides[strline] = moves.slideMoves[strline]
                }
            } else {
                // Cannot slide to block all attack lines so blank the slides
                // Could probably blank regular attacks too
            }
        } else if (checklines.length === 1) {
            const strline = math.getKeyFromCoords(checklines[0])
            tempslides[strline] = moves.slideMoves[strline] 
        }

        // Add the piece back with the EXACT SAME index it had before!!
        movepiece.addPiece(gamefile, deletedPiece.type, deletedPiece.coords, deletedPiece.index, { updateData: false })
    }

    // Appends moves to  moves.individual  if the selected pieces is able to get between squares 1 & 2
    function appendBlockingMoves (square1, square2, moves, coords) { // coords is of the selected piece
        
        // What is the line between our king and the attacking piece?
        let direction = [square1[0] - square2[0], square1[1] - square2[1]];

        const box = {
            left: Math.min(square1[0],square2[0]),
            right: Math.max(square1[0],square2[0]),
            top: Math.min(square1[1],square2[1]),
            bottom: Math.max(square1[1],square2[1])
        }

        function appendBlockPointIfLegal (blockPoint) {
            if (!math.isAproxEqual(blockPoint[0],Math.round(blockPoint[0])) || 
                !math.isAproxEqual(blockPoint[1],Math.round(blockPoint[1]))) return; // Block is off grid so probably not valid
            if (math.boxContainsSquare(box, blockPoint)) return;
                // Can our piece legally move there?
                if (legalmoves.checkIfMoveLegal(moves, coords, blockPoint, { ignoreIndividualMoves: true })) moves.individual.push(blockPoint) // Can block!
        }

        for (const linestr in moves.slides) {
            const line = math.getCoordsFromKey(linestr)
            const c1 = math.getLineFromCoords(line, coords)
            const c2 = math.getLineFromCoords(direction,square2)
            const blockPoint = math.getLineIntersection(line[0], line[1], c1, direction[0], direction[1], c2)
            appendBlockPointIfLegal(blockPoint)
        }
    }

    /**
     * Calculates if the provided gamefile is over by checkmate or a repetition draw
     * @param {gamefile} gamefile - The gamefile to detect if it's in checkmate
     * @returns {string | false} The color of the player who won by checkmate. 'white checkmate', 'black checkmate', or 'draw repetition', 'draw stalemate'. Or *false* if the game isn't over.
     */
    function detectCheckmateOrDraw(gamefile) {

        // Is there a draw by repetition?
        if (detectRepetitionDraw(gamefile)) return 'draw repetition'

        // The game also will be over when the player has zero legal moves remaining, lose or draw.
        // Iterate through every piece, calculating its legal moves. The first legal move we find, we
        // know the game is not over yet...

        const whosTurn = gamefile.whosTurn;
        const whiteOrBlack = whosTurn === 'white' ? pieces.white : pieces.black;
        for (let i = 0; i < whiteOrBlack.length; i++) {
            const thisType = whiteOrBlack[i];
            const thesePieces = gamefile.ourPieces[thisType]
            for (let a = 0; a < thesePieces.length; a++) {
                const coords = thesePieces[a];
                if (!coords) continue; // Piece undefined. We leave in deleted pieces so others retain their index!
                const index = gamefileutility.getPieceIndexByTypeAndCoords(gamefile, thisType, coords)
                const thisPiece = { type: thisType, coords, index }; // { index, coords }
                const moves = legalmoves.calculate(gamefile, thisPiece)
                if (!legalmoves.hasAtleast1Move(moves)) continue;
                return false;
            }
        }

        // We made it through every single piece without finding a single move.
        // So is this draw or checkmate? Depends on whether the current state is check!
        // Also make sure that checkmate can't happen if the winCondition is NOT checkmate!
        const usingCheckmate = wincondition.isOpponentUsingWinCondition(gamefile, 'checkmate')
        if (gamefile.inCheck && usingCheckmate) {
            if (whosTurn === 'white') return 'black checkmate' // Black wins
            else                      return 'white checkmate' // White wins
        } else return 'draw stalemate';
    }

    // /** THE OLD CHECKMATE ALGORITHM, THAT IS ASYNCHRONIOUS. NO LONGER USED. ASYNC STUFF IS TOO MUCH OF A KNIGHTMARE.
    //  * USE ROYALCAPTURE TO REMOVE FREEZES. JUST DON'T DO STALEMATE DETECTION IF THERE'S TOO MANY PIECES.
    //  *
    //  * Calculates if the provided gamefile is over by checkmate or a repetition draw
    //  * @param {gamefile} gamefile - The gamefile to detect if it's in checkmate
    //  * @returns {string} The color of the player who won by checkmate. 'white checkmate', 'black checkmate', or 'draw repetition', or 'draw stalemate'
    //  */
    // // Returns false when game is not over, 'white' if white has won, 'black', or 'draw'
    // async function detectCheckmateOrDraw(gamefile) {

    //     // Is there a draw by repetition?

    //     if (detectRepetitionDraw(gamefile)) return 'draw repetition'

    //     // No repetition

    //     // The game also will be over when the player has zero legal moves remaining, lose or draw.

    //     const whosTurn = gamefile.whosTurn;

    //     // Iterate through every piece, calculating its legal moves. The first legal move we find, we
    //     // know the game is not over yet.

    //     // How much time can we spend on this potentially long task?
    //     const ourPieceCount = gamefileutility.getPieceCountOfColorFromPiecesByType(gamefile.ourPieces, whosTurn);
    //     let pieceLimitToRecalcTime = 50;
    //     let piecesSinceLastCheck = 0;
    //     let piecesComplete = 0;
    //     let startTime = performance.now();
    //     let timeToStop = startTime + loadbalancer.getLongTaskTime();

    //     gamefile.legalMoveSearch.isRunning = true;
    //     gamefile.mesh.locked++;

    //     // console.log('Begin checking for checkmate!')
    //     // main.startTimer()

    //     const whiteOrBlack = whosTurn === 'white' ? pieces.white : pieces.black;
    //     for (let i = 0; i < whiteOrBlack.length; i++) {
    //         const thisType = whiteOrBlack[i];
    //         const thesePieces = gamefile.ourPieces[thisType]
    //         for (let a = 0; a < thesePieces.length; a++) {
    //             const coords = thesePieces[a];
    //             if (!coords) continue; // Piece undefined. We leave in deleted pieces so others retain their index!
    //             const index = gamefileutility.getPieceIndexByTypeAndCoords(gamefile, thisType, coords)
    //             const thisPiece = { type: thisType, coords, index }; // { index, coords }
    //             const moves = legalmoves.calculate(gamefile, thisPiece)
    //             if (legalmoves.hasAtleast1Move(moves)) {
    //                 // main.stopTimer((time) => console.log(`Checkmate alg finished! ${time} milliseconds! ${thisType} ${coords}`))
    //                 stats.hideMoveLooking();
    //                 gamefile.legalMoveSearch.isRunning = false;
    //                 gamefile.mesh.locked--;
    //                 return false;
    //             }

    //             // If we've spent too much time, sleep!
    //             piecesSinceLastCheck++;
    //             piecesComplete++;
    //             if (piecesSinceLastCheck >= pieceLimitToRecalcTime) {
    //                 piecesSinceLastCheck = 0;
    //                 await sleepIfUsedTooMuchTime();
    //                 if (gamefile.legalMoveSearch.terminate) {
    //                     console.log("Legal move search terminated.");
    //                     gamefile.legalMoveSearch.terminate = false;
    //                     gamefile.legalMoveSearch.isRunning = false;
    //                     gamefile.mesh.locked--;
    //                     stats.hideMoveLooking();
    //                     return;
    //                 }
    //                 if (main.gforceCalc()) {
    //                     pieceLimitToRecalcTime = Infinity;
    //                     main.sforceCalc(false);
    //                 }
    //             }
    //         }
    //     }

    //     async function sleepIfUsedTooMuchTime() {

    //         if (!usedTooMuchTime()) return; // Keep processing...

    //         // console.log(`Too much! Sleeping.. Used ${performance.now() - startTime} of our allocated ${maxTimeToSpend}`)
    //         const percentComplete = piecesComplete / ourPieceCount;
    //         stats.updateMoveLooking(percentComplete);
    //         await main.sleep(0);
    //         startTime = performance.now();
    //         timeToStop = startTime + loadbalancer.getLongTaskTime();
    //     }

    //     function usedTooMuchTime() {
    //         return performance.now() >= timeToStop;
    //     }

    //     stats.hideMoveLooking();
    //     gamefile.legalMoveSearch.isRunning = false;
    //     gamefile.mesh.locked--;

    //     // main.stopTimer((time) => console.log(`Checkmate alg finished! ${time} milliseconds!`))

    //     // We made it through every single piece without finding a single move.
    //     // So is this draw or checkmate? Depends on whether the current state is check!
    //     // Also make sure that checkmate can't happen if the winCondition is NOT checkmate!
    //     const usingCheckmate = wincondition.isOpponentUsingWinCondition(gamefile, 'checkmate')
    //     if (gamefile.inCheck && usingCheckmate) {

    //         if (whosTurn === 'white') return 'black checkmate' // Black wins
    //         else                      return 'white checkmate' // White wins

    //     } else return 'draw stalemate';
    // }

    /**
     * Tests if the provided gamefile has had a repetition draw.
     * @param {gamefile} gamefile - The gamefile
     * @returns {boolean} *true* if there has been a repetition draw
     */
    // Complexity O(m) where m is the move count since
    // the last pawn push or capture!
    function detectRepetitionDraw(gamefile) {
        const moveList = gamefile.moves;

        const deficit = { }; // `x,y,type`
        const surplus = { }; // `x,y,type`

        let equalPositionsFound = 0;

        let index = moveList.length - 1;
        while (index >= 0) {

            // Moves are in the format: { type, startCoords, endCoords, captured: 'type'}
            /** @type {Move} */
            const thisMove = moveList[index]

            // If the move was a pawn push or capture, no further equal positions, terminate the loop.
            if (thisMove.captured || thisMove.type.startsWith('pawns')) break;

            // If this move was undo'd, there would be a DEFICIT on its endCoords
            const endCoords = thisMove.endCoords;
            let key = `${endCoords[0]},${endCoords[1]},${thisMove.type}`
            // If there is a SURPLUS with this exact same key, delete that instead! It's been canceled-out.
            if (surplus[key]) delete surplus[key]
            else deficit[key] = true;

            // There would also be a SURPLUS on its startCoords
            const startCoords = thisMove.startCoords;
            key = `${startCoords[0]},${startCoords[1]},${thisMove.type}`
            // If there is a DEFICIT with this exact same key, delete that instead! It's been canceled-out.
            if (deficit[key]) delete deficit[key]
            else surplus[key] = true;

            // If both the deficit and surplus objects are EMPTY, this position is equal to our current position!
            const deficitKeys = Object.keys(deficit);
            const surplusKeys = Object.keys(surplus);
            if (deficitKeys.length === 0 && surplusKeys.length === 0) {
                equalPositionsFound++;
                if (equalPositionsFound === 2) break; // Enough to confirm a repetition draw!
            }

            // Prep for next iteration, decrement index.
            // WILL BE -1 if we've reached the beginning of the game!
            index--;
        }

        // Loop is finished. How many equal positions did we find?
        return equalPositionsFound === 2; // TRUE if there's a repetition draw!
    }


    return Object.freeze({
        detectCheck,
        removeMovesThatPutYouInCheck,
        doesMovePutInCheck,
        detectCheckmateOrDraw,
    })

})();