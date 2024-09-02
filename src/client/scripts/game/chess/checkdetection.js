
// Import Start
import legalmoves from './legalmoves.js';
import movepiece from './movepiece.js';
import gamefileutility from './gamefileutility.js';
import specialdetect from './specialdetect.js';
import organizedlines from './organizedlines.js';
import wincondition from './wincondition.js';
import math from '../misc/math.js';
import colorutil from '../misc/colorutil.js';
import jsutil from '../misc/jsutil.js';
// Import End

/** 
 * Type Definitions 
 * @typedef {import('./gamefile.js').gamefile} gamefile
 * @typedef {import('./movesscript.js').Move} Move
 * @typedef {import('./legalmoves.js').LegalMoves} LegalMoves
 * @typedef {import('./movepiece.js').Piece} Piece
 * @typedef {import('../misc/math.js').BoundingBox} BoundingBox
 */

"use strict";

/**
 * This script is used to test if given gamefiles are in check,
 * also for simulating which moves would lead to check and removed from the list of legal moves.
 * We also detect checkmate, stalemate, and repetition here.
 */
const checkdetection = (function() {

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
        if (!gamefile) throw new Error("Cannot detect check of an undefined game!");
        if (color !== 'white' && color !== 'black') throw new Error(`Cannot detect check of the team of color ${color}!`);
        if (attackers != null && attackers.length !== 0) throw new Error(`Attackers parameter must be an empty array []! Received: ${JSON.stringify(attackers)}`);

        // Coordinates of ALL royals of this color!
        const royalCoords = gamefileutility.getRoyalCoords(gamefile, color); // [ coords1, coords2 ]
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
        if (!gamefile) throw new Error("Cannot detect if a square of an undefined game is being attacked!");
        if (!coord) return false;
        if (colorOfFriendly !== 'white' && colorOfFriendly !== 'black') throw new Error(`Cannot detect if an opponent is attacking the square of the team of color ${colorOfFriendly}!`);

        let atleast1Attacker = false;

        // How do we find out if this square is attacked?

        // 1. We check every square within a 3 block radius to see if there's any attacking pieces.

        if (doesVicinityAttackSquare(gamefile, coord, colorOfFriendly, attackers)) atleast1Attacker = true;
        // What about pawns? Could they capture us?
        if (doesPawnAttackSquare(gamefile, coord, colorOfFriendly, attackers)) atleast1Attacker = true;

        // 2. We check every orthogonal and diagonal to see if there's any attacking pieces.
        if (doesSlideAttackSquare(gamefile, coord, colorOfFriendly, attackers)) atleast1Attacker = true;

        return atleast1Attacker; // Being attacked if true
    }

    // Checks to see if any piece within a 3-block radius can capture. Ignores sliding movesets.
    // If there is, appends to "attackers".
    // DOES NOT account for pawns. For that use  doesPawnAttackSquare()
    function doesVicinityAttackSquare(gamefile, coords, color, attackers) {

        const vicinity = gamefile.vicinity;
        for (const key in vicinity) {
            const thisVicinity = vicinity[key];
            const thisSquare = math.getCoordsFromKey(key); // Part of the moveset ( [1,2], [2,1] ... )
            const actualSquare = [coords[0] + thisSquare[0], coords[1] + thisSquare[1]];

            // Fetch the square from our pieces organized by key
            const key2 = math.getKeyFromCoords(actualSquare);
            const typeOnSquare = gamefile.piecesOrganizedByKey[key2];
            if (!typeOnSquare) continue; // Nothing there to capture us
            // Is it the same color?
            const typeOnSquareColor = colorutil.getPieceColorFromType(typeOnSquare);
            if (color === typeOnSquareColor) continue; // A friendly can't capture us

            const typeOnSquareConcat = colorutil.trimColorExtensionFromType(typeOnSquare);

            // Is that a match with any piece type on this vicinity square?
            if (thisVicinity.includes(typeOnSquareConcat)) { // This square can be captured
                if (attackers) appendAttackerToList(attackers, { coords: actualSquare, slidingCheck: false });
                return true; // There'll never be more than 1 short-range/jumping checks!
            }; 
        }

        return false;
    }

    function doesPawnAttackSquare(gamefile, coords, color, attackers) {

        const oneOrNegOne = color === 'white' ? 1 : -1;
        for (let a = -1; a <= 1; a += 2) {
            const thisSquare = [coords[0] - a, coords[1] + oneOrNegOne];

            const key = math.getKeyFromCoords(thisSquare);
            const pieceOnSquare = gamefile.piecesOrganizedByKey[key];
            if (!pieceOnSquare) continue;

            const pieceIsFriendly = color === colorutil.getPieceColorFromType(pieceOnSquare);
            if (pieceIsFriendly) continue; // Can't capture us

            const pieceIsPawn = pieceOnSquare.startsWith('pawns');
            if (pieceIsPawn) {
                if (attackers) appendAttackerToList(attackers, { coords: thisSquare, slidingCheck: false });
                return true; // A pawn can capture on this square. There'll never be more than 1 short-range checks.
            }
        }

        return false;
    }

    /**
     * Calculates if any sliding piece can attack the specified square.
     * Appends attackers to the provided `attackers` array.
     * @param {gamefile} gamefile 
     * @param {number[]} coords - The square to test if it can be attacked
     * @param {string} color - The color of friendly pieces
     * @param {Object[]} attackers - A running list of attackers on this square. Any new found attackers will be appended to this this.
     * @returns {boolean} true if this square is under attack
     */
    function doesSlideAttackSquare(gamefile, coords, color, attackers) {

        let atleast1Attacker = false;

        for (const direction of gamefile.startSnapshot.slidingPossible) { // [dx,dy]
            const directionKey = math.getKeyFromCoords(direction);
            const key = organizedlines.getKeyFromLine(direction, coords);
            if (doesLineAttackSquare(gamefile, gamefile.piecesOrganizedByLines[directionKey][key], direction, coords, color, attackers)) atleast1Attacker = true;
        }

        return atleast1Attacker;
    }

    /**
     * Returns true if a piece on the specified line can capture on that square.
     * THIS REQUIRES `coords` be already on the line!!!
     * Appends any attackeres to the provided `attackers` array.
     * @param {gamefile} gamefile 
     * @param {Piece[]} line - The line of pieces
     * @param {number[]} direction - Step of the line: [dx,dy]
     * @param {number} coords - The coordinates of the square to test if any piece on the line can move to.
     * @param {string} color - The color of friendlies. We will exclude pieces of the same color, because they cannot capture friendlies.
     * @param {Object[]} [attackers] - The running list of attackers threatening these coordinates. Any attackers found will be appended to this list. LEAVE BLANK to save compute not adding them to this list!
     * @returns {boolean} true if the square is under threat
     */
    function doesLineAttackSquare(gamefile, line, direction, coords, color, attackers) {
        if (!line) return false; // This line doesn't exist, then obviously no pieces can attack our square

        const directionKey = math.getKeyFromCoords(direction); // 'dx,dy'
        let foundCheckersCount = 0;

        // Iterate through every piece on the line, and test if they can attack our square
        for (const thisPiece of line) { // { coords, type }

            const thisPieceColor = colorutil.getPieceColorFromType(thisPiece.type);
            if (color === thisPieceColor) continue; // Same team, can't capture us, CONTINUE to next piece!
            if (thisPieceColor === 'neutral') continue; // Neutrals can't move, that means they can't make captures, right?

            const thisPieceMoveset = legalmoves.getPieceMoveset(gamefile, thisPiece.type);

            if (!thisPieceMoveset.sliding) continue; // Piece has no sliding movesets.
            const moveset = thisPieceMoveset.sliding[directionKey];
            if (!moveset) continue; // Piece can't slide in the direction our line is going
            const thisPieceLegalSlide = legalmoves.slide_CalcLegalLimit(line, direction, moveset, thisPiece.coords, thisPieceColor);
            if (!thisPieceLegalSlide) continue; // This piece can't move in the direction of this line, NEXT piece!

            if (!legalmoves.doesSlidingMovesetContainSquare(thisPieceLegalSlide, direction, thisPiece.coords, coords)) continue; // This piece can't slide so far as to reach us, NEXT piece!

            // This piece is attacking this square!

            if (!attackers) return true; // Attackers array isn't being tracked, just insta-return to save compute not finding other attackers!
            foundCheckersCount++;
            appendAttackerToList(attackers, { coords: thisPiece.coords, slidingCheck: true });
        }

        return foundCheckersCount > 0;
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
    function removeMovesThatPutYouInCheck(gamefile, moves, pieceSelected, color) { // moves: { individual: [], horizontal: [], ... }
        if (color === 'neutral') return; // Neutral pieces can't be in check
        if (!wincondition.isOpponentUsingWinCondition(gamefile, 'checkmate')) return;

        // There's a couple type of moves that put you in check:

        // 1. Sliding moves. Possible they can open a discovered check, or fail to address an existing check.
        // Check these FIRST because in situations where we are in existing check, additional individual moves may be added.
        removeSlidingMovesThatPutYouInCheck(gamefile, moves, pieceSelected, color);

        // 2. Individual moves. We can iterate through these and use detectCheck() to test them.
        removeIndividualMovesThatPutYouInCheck(gamefile, moves.individual, pieceSelected, color);
    }

    // Time complexity O(1)
    function removeIndividualMovesThatPutYouInCheck(gamefile, individualMoves, pieceSelected, color) { // [ [x,y], [x,y] ]
        if (!individualMoves) return;

        // Simulate the move, then check the game state for check
        for (let i = individualMoves.length - 1; i >= 0; i--) { // Iterate backwards so we don't run into issues as we delete indices while iterating
            const thisMove = individualMoves[i]; // [x,y]
            if (doesMovePutInCheck(gamefile, pieceSelected, thisMove, color)) individualMoves.splice(i, 1); // Remove the move
        }
    }

    // Simulates the move, tests for check, undos the move. Color is the color of the piece we're moving
    function doesMovePutInCheck(gamefile, pieceSelected, destCoords, color) { // pieceSelected: { type, index, coords }
        /** @type {Move} */
        const move = { type: pieceSelected.type, startCoords: jsutil.deepCopyObject(pieceSelected.coords), endCoords: movepiece.stripSpecialMoveTagsFromCoords(destCoords) };
        specialdetect.transferSpecialFlags_FromCoordsToMove(destCoords, move);
        return movepiece.simulateMove(gamefile, move, color).isCheck;
    }


    /**
     * Removes sliding moves from the provided legal moves object that are illegal (i.e. they result in check).
     * This can happen if they don't address an existing check, OR they open a discovered attack on your king.
     * 
     * Time complexity: O(slides) basically O(1) unless you add a ton of slides to a single piece
     * @param {gamefile} gamefile 
     * @param {LegalMoves} moves - The legal moves object to delete illegal slides from.
     * @param {Piece} pieceSelected - The piece of which the running legal moves are for.
     * @param {string} color - The color of friendlies
     */
    function removeSlidingMovesThatPutYouInCheck(gamefile, moves, pieceSelected, color) {
        if (!moves.sliding) return; // No sliding moves to remove

        /** List of coordinates of all our royal jumping pieces @type {number[][]} */
        const royalCoords = gamefileutility.getJumpingRoyalCoords(gamefile, color);
        if (royalCoords.length === 0) return; // No king, no open discoveries, don't remove any sliding moves

        // There are 2 ways a sliding move can put you in check:

        // 1. By not blocking, or capturing an already-existing check.
        if (addressExistingChecks(gamefile, moves, gamefile.inCheck, pieceSelected.coords, color)) return;

        // 2. By opening a discovered on your king.
        royalCoords.forEach(thisRoyalCoords => { // Don't let the piece open a discovered on ANY of our royals! Not just one.
            removeSlidingMovesThatOpenDiscovered(gamefile, moves, thisRoyalCoords, pieceSelected, color);
        });
    }

    /**
     * If there's an existing check: Returns true and removes all sliding moves that don't address the check.
     * @param {gamefile} gamefile - The gamefile
     * @param {LegalMoves} legalMoves - The legal moves object of which to delete moves that don't address check.
     * @param {number[][]} royalCoords - A list of our friendly jumping royal pieces
     * @param {number[]} selectedPieceCoords - The coordinates of the piece we're calculating the legal moves for.
     * @param {string} color - The color of friendlies
     * @returns {boolean} true if we are in check. If so, all sliding moves are deleted, and finite individual blocking/capturing individual moves are appended.
     */
    function addressExistingChecks(gamefile, legalMoves, royalCoords, selectedPieceCoords, color) {
        if (!gamefile.inCheck) return false; // Exit if not in check
        if (!isColorInCheck(gamefile, color)) return; // Our OPPONENT is in check, not us! Them being in check doesn't restrict our movement!

        const attackerCount = gamefile.attackers.length;
        if (attackerCount === 0) throw new Error("We are in check, but there is no specified attacker!");

        // To know how to address the check, we have to know where the check is coming from.
        // For now, add legal blocks for the first attacker, not the others. Since legal blocks
        // are added as extra individual moves, they will be simulated afterward. And if
        // the inCheck property comes back as false, then it will block ALL attackers!
        const attacker = gamefile.attackers[0]; // { coords, slidingCheck }

        // Does this piece have a sliding moveset that will either...

        // 1. Capture the checking piece

        const capturingNotPossible = attackerCount > 1; // Capturing not possible with a double-check (atleast not with a sliding move), forced to dodge, or block if possible.

        // Check if the piece has the ability to capture
        if (!capturingNotPossible && legalmoves.checkIfMoveLegal(legalMoves, selectedPieceCoords, attacker.coords, { ignoreIndividualMoves: true })) {
            legalMoves.individual.push(attacker.coords); // Can capture!
        }

        // 2. Block the check

        // If it's a jumping move (not sliding), or if the piece is 1 square away,
        // then there's no way to block.
        const dist = math.chebyshevDistance(royalCoords[0], attacker.coords);
        if (!attacker.slidingCheck || dist === 1) {
            delete legalMoves.sliding; // Erase all sliding moves
            return true;
        }
        
        appendBlockingMoves(royalCoords[0], attacker.coords, legalMoves, selectedPieceCoords);
        delete legalMoves.sliding; // Erase all sliding moves

        return true;
    }

    /**
     * Detects if a color has one of the registered checks in gamefile this turn.
     * @param {gamefile} gamefile 
     * @param {string} color 
     * @returns {boolean} true if atleast one of our royals is included in the gamefile's list of royals in check this turn
     */
    function isColorInCheck(gamefile, color) {
        const royals = gamefileutility.getRoyalCoords(gamefile, color).map(math.getKeyFromCoords); // ['x,y','x,y']
        const checkedRoyals = gamefile.inCheck.map(math.getKeyFromCoords); // ['x,y','x,y']
        return new Set([...royals, ...checkedRoyals]).size !== (royals.length + checkedRoyals.length);
    }

    /**
     * Deletes any sliding moves from the provided running legal moves that
     * open up a discovered attack on the specified coordinates
     * @param {gamefile} gamefile 
     * @param {LegalMoves} moves - The running legal moves of the selected piece
     * @param {number[]} kingCoords - The coordinates to see what sliding moves open up a discovered on
     * @param {Piece} pieceSelected - The piece with the provided running legal moves
     * @param {string} color - The color of friendlies
     */
    function removeSlidingMovesThatOpenDiscovered(gamefile, moves, kingCoords, pieceSelected, color) {
        const selectedPieceCoords = pieceSelected.coords;
        /** A list of line directions that we're sharing with the king! */
        const sameLines = []; // [ [dx,dy], [dx,dy] ]
        // Only check current possible slides
        for (const line of gamefile.startSnapshot.slidingPossible) { // [dx,dy]
            const lineKey1 = organizedlines.getKeyFromLine(line, kingCoords);
            const lineKey2 = organizedlines.getKeyFromLine(line, selectedPieceCoords);
            if (lineKey1 !== lineKey2) continue; // Not same line
            sameLines.push(line); // The piece is sharing this line with the king
        };
        // If not sharing any common line, there's no way we can open a discovered
        if (sameLines.length === 0) return;

        // Delete the piece, and add it back when we're done!
        const deletedPiece = jsutil.deepCopyObject(pieceSelected);
        movepiece.deletePiece(gamefile, pieceSelected, { updateData: false });
        
        // let checklines = []; // For Idon's code below
        // For every line direction we share with the king...
        for (const direction1 of sameLines) { // [dx,dy]
            const strline = math.getKeyFromCoords(direction1); // 'dx,dy'
            const key = organizedlines.getKeyFromLine(direction1,kingCoords); // 'C|X'
            const line = gamefile.piecesOrganizedByLines[strline][key];
            const opensDiscovered = doesLineAttackSquare(gamefile, line, direction1, kingCoords, color);
            if (!opensDiscovered) continue;
            // The piece opens a discovered if it were to be gone!
            // checklines.push(line); // For Idon's code below
            // Delete all lines except this one (because if we move off of it we would be in check!)
            for (const direction2 of Object.keys(moves.sliding)) { // 'dx,dy'
                const direction2NumbArray = math.getCoordsFromKey(direction2); // [dx,dy]
                if (math.areCoordsEqual(direction1, direction2NumbArray)) continue; // Same line, it's okay to keep because it wouldn't open a discovered
                delete moves.sliding[direction2]; // Not same line, delete it because it would open a discovered.
            }

        }

        // Idon us's code that handles the situation where moving off a line could expose multiple checks
        // ON THE same line!! It's so tricky to know what squares would keep the discovered closed.
        // See the discussion on discord: https://discord.com/channels/1114425729569017918/1260357580845224138/1263583566563119165
        // const tempslides = {}
        // r : {
        //     if (checklines.length > 1) {
        //         if (math.areLinesCollinear(checklines)) {
        //             // FIXME: this is a problem as (2,0) (1,0) if (1,0) is added it can slide into (2,0) gaps opening check
        //             // Another case (3,0) (2,0) correct blocks are along (6,0) but thats not an organized line

        //             // Please can someone optimize this

        //             let fline = checklines[0];
        //             let fGcd = math.GCD(fline[0],fline[1]);

        //             const baseLine = [fline[0]/fGcd, fline[1]/fGcd];

        //             let mult = [];
        //             checklines.forEach((line) => {mult.push(math.GCD(line[0],line[1]))});
        //             const lcm = math.LCM(Object.values(mult));

        //             const steps = [0,0]
        //             for (const strline in moves.sliding) {
        //                 const line = math.getCoordsFromKey(strline);
        //                 if (!math.areLinesCollinear([line, baseLine])) continue;
        //                 const gcd = math.GCD(line[0], line[1]);
        //                 let rslides = [Math.floor(moves.sliding[strline][0]/lcm*gcd),Math.floor(moves.sliding[strline][1]/lcm*gcd)];
        //                 if (rslides[0]<steps[0]) steps[0] = rslides[0];
        //                 if (rslides[1]>steps[1]) steps[1] = rslides[1];
        //             }

        //             const line = [baseLine[0]*lcm,baseLine[1]*lcm]

        //             if (!gamefile.startSnapshot.slidingPossible.includes(line)) {
        //                 const strline = math.getKeyFromCoords(line) 
        //                 tempslides[strline] = steps
        //             } else {
        //                 for (i=steps[0]; i<=steps[1]; i++) {
        //                     if (i==0) continue;
        //                     moves.individual.push([line[0]*i,line[1]*i])
        //                 }
        //             }

        //             } else {
        //             // Cannot slide to block all attack lines so blank the sliding
        //             // Could probably blank regular attacks too
        //         }
        //     } else if (checklines.length === 1) {
        //         const strline = math.getKeyFromCoords(checklines[0])
        //         if (!moves.sliding[strline]) break r;
        //         tempslides[strline] = moves.sliding[strline] 
        //     }
        // }

        // Add the piece back with the EXACT SAME index it had before!!
        movepiece.addPiece(gamefile, deletedPiece.type, deletedPiece.coords, deletedPiece.index, { updateData: false });
    }

    // Appends moves to  moves.individual  if the selected pieces is able to get between squares 1 & 2

    /**
     * Appends legal blocking moves to the provided moves object if the piece
     * is able to get between squares 1 & 2.
     * @param {number[]} square1 - `[x,y]`
     * @param {number[]} square2 - `[x,y]`
     * @param {LegalMoves} moves - The moves object of the piece
     * @param {number[]} coords - The coordinates of the piece with the provided legal moves: `[x,y]`
     */
    function appendBlockingMoves(square1, square2, moves, coords) { // coords is of the selected piece
        // What is the line between our king and the attacking piece?
        const direction = [square1[0] - square2[0], square1[1] - square2[1]]; // [dx,dy]

        /** The minimum bounding box that contains our 2 squares, at opposite corners. @type {BoundingBox} */
        const box = {
            left: Math.min(square1[0],square2[0]),
            right: Math.max(square1[0],square2[0]),
            top: Math.max(square1[1],square2[1]),
            bottom: Math.min(square1[1],square2[1])
        };


        for (const lineKey in moves.sliding) { // 'dx,dy'
            const line = math.getCoordsFromKey(lineKey); // [dx,dy]
            const c1 = organizedlines.getCFromLine(line, coords); // Line of our selected piece
            const c2 = organizedlines.getCFromLine(direction,square2); // Line between our 2 squares
            const blockPoint = math.getLineIntersection(line[0], line[1], c1, direction[0], direction[1], c2); // The intersection point of the 2 lines.

            // Idon us's old code
            // if (!math.isAproxEqual(blockPoint[0],Math.round(blockPoint[0])) || 
            //     !math.isAproxEqual(blockPoint[1],Math.round(blockPoint[1]))) {console.log("A"); continue}; // Block is off grid so probably not valid
            // blockPoint=[Math.round(blockPoint[0]), Math.round(blockPoint[1])]
            // if (organizedlines.getKeyFromLine(line,blockPoint)!==organizedlines.getKeyFromLine(line, coords)) {console.log("C"); continue}; // stop line multiples being annoying

            // Naviary's new code
            if (blockPoint === null) continue; // None (or infinite) intersection points!
            if (!math.boxContainsSquare(box, blockPoint)) continue; // Intersection point not between our 2 points, but outside of them.
            if (!math.areCoordsIntegers(blockPoint)) continue; // It doesn't intersect at a whole number, impossible for our piece to move here!
            if (math.areCoordsEqual(blockPoint, square1)) continue; // Can't move onto our piece that's in check..
            if (math.areCoordsEqual(blockPoint, square2)) continue; // nor to the piece that is checking us (those are added prior to this if it's legal)!

            // Can our piece legally move there?
            if (legalmoves.checkIfMoveLegal(moves, coords, blockPoint, { ignoreIndividualMoves: true })) moves.individual.push(blockPoint); // Can block!
        }
    }

    return Object.freeze({
        detectCheck,
        removeMovesThatPutYouInCheck,
        doesMovePutInCheck
    });

})();

export default checkdetection;