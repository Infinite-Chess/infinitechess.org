
import coordutil from '../misc/coordutil.js';
import typeutil from '../misc/typeutil.js';

/** 
 * Type Definitions 
 * @typedef {import('../misc/math.js').BoundingBox} BoundingBox
*/

'use strict';

/**
 * Generates the Omega^4 position example
 * @returns {Object} The position in keys format
 */
function genPositionOfOmegaFourth() {
    const dist = 500; // Generate Omega^4 up to a distance of 50 tiles away

    // King chamber
    const startingPos = {
        '-14,17':typeutil.intTypes.pawnsW,
        '-14,18':typeutil.intTypes.pawnsB,
        '-13,14':typeutil.intTypes.pawnsW,
        '-13,15':typeutil.intTypes.pawnsB,
        '-13,16':typeutil.intTypes.pawnsW,
        '-13,17':typeutil.intTypes.pawnsB,
        '-13,20':typeutil.intTypes.pawnsW,
        '-13,21':typeutil.intTypes.pawnsB,
        '-13,22':typeutil.intTypes.pawnsW,
        '-13,23':typeutil.intTypes.pawnsB,
        '-13,24':typeutil.intTypes.pawnsW,
        '-13,25':typeutil.intTypes.pawnsB,
        '-13,26':typeutil.intTypes.pawnsW,
        '-13,27':typeutil.intTypes.pawnsB,
        '-12,16':typeutil.intTypes.bishopsB,
        '-12,25':typeutil.intTypes.bishopsW,
        '-11,14':typeutil.intTypes.pawnsW,
        '-11,15':typeutil.intTypes.pawnsB,
        '-11,16':typeutil.intTypes.kingsB,
        '-11,17':typeutil.intTypes.pawnsB,
        '-11,24':typeutil.intTypes.pawnsW,
        '-11,25':typeutil.intTypes.kingsW,
        '-11,26':typeutil.intTypes.pawnsW,
        '-11,27':typeutil.intTypes.pawnsB,
        '-10,16':typeutil.intTypes.bishopsB,
        '-10,25':typeutil.intTypes.bishopsW,
        '-9,14':typeutil.intTypes.pawnsW,
        '-9,15':typeutil.intTypes.pawnsB,
        '-9,16':typeutil.intTypes.pawnsW,
        '-9,17':typeutil.intTypes.pawnsB,
        '-9,18':typeutil.intTypes.pawnsW,
        '-9,19':typeutil.intTypes.pawnsB,
        '-9,20':typeutil.intTypes.pawnsW,
        '-9,21':typeutil.intTypes.pawnsB,
        '-9,22':typeutil.intTypes.pawnsW,
        '-9,23':typeutil.intTypes.pawnsB,
        '-9,24':typeutil.intTypes.pawnsW,
        '-9,25':typeutil.intTypes.pawnsB,
        '-9,26':typeutil.intTypes.pawnsW,
        '-9,27':typeutil.intTypes.pawnsB,
    };

    // Rook towers

    const startOfRookTowers = {
        '0,3': typeutil.intTypes.pawnsW,
        '0,4': typeutil.intTypes.pawnsB,
        '0,5': typeutil.intTypes.pawnsW,
        '0,6': typeutil.intTypes.pawnsB,
        '0,11': typeutil.intTypes.pawnsW,
        '0,12': typeutil.intTypes.pawnsB,
        '1,4': typeutil.intTypes.bishopsW,
        '1,12': typeutil.intTypes.bishopsW,
        '1,13': typeutil.intTypes.rooksB,
        '2,1': typeutil.intTypes.pawnsW,
        '2,2': typeutil.intTypes.pawnsB,
        '2,3': typeutil.intTypes.pawnsW,
        '2,4': typeutil.intTypes.pawnsB,
        '2,5': typeutil.intTypes.pawnsW,
        '2,6': typeutil.intTypes.pawnsB,
        '2,7': typeutil.intTypes.pawnsW,
        '2,8': typeutil.intTypes.pawnsW,
        '2,9': typeutil.intTypes.pawnsW,
        '2,10': typeutil.intTypes.pawnsW,
        '2,11': typeutil.intTypes.pawnsW,
        '2,12': typeutil.intTypes.pawnsB,
        '3,2': typeutil.intTypes.bishopsW,
        '3,4': typeutil.intTypes.bishopsB,
        '3,6': typeutil.intTypes.pawnsW,
        '3,7': typeutil.intTypes.pawnsB,
        '3,8': typeutil.intTypes.bishopsW,
        '3,9': typeutil.intTypes.pawnsW,
        '3,10': typeutil.intTypes.bishopsW,
        '3,12': typeutil.intTypes.bishopsW,
        '3,14': typeutil.intTypes.bishopsW,
        '4,1': typeutil.intTypes.pawnsW,
        '4,2': typeutil.intTypes.pawnsB,
        '4,3': typeutil.intTypes.pawnsW,
        '4,4': typeutil.intTypes.pawnsB,
        '4,7': typeutil.intTypes.pawnsW,
        '4,8': typeutil.intTypes.pawnsB,
        '4,9': typeutil.intTypes.bishopsW,
        '4,11': typeutil.intTypes.bishopsW,
        '4,13': typeutil.intTypes.bishopsW,
        '4,15': typeutil.intTypes.bishopsW,
        '4,16': typeutil.intTypes.rooksB,
        '5,4': typeutil.intTypes.pawnsW,
        '5,5': typeutil.intTypes.pawnsB,
        '5,8': typeutil.intTypes.pawnsW,
        '5,9': typeutil.intTypes.pawnsB,
        '5,10': typeutil.intTypes.pawnsW,
        '5,11': typeutil.intTypes.pawnsW,
        '5,12': typeutil.intTypes.pawnsW,
        '5,13': typeutil.intTypes.pawnsW,
        '5,14': typeutil.intTypes.pawnsW,
        '5,15': typeutil.intTypes.pawnsB,
    };

    const keys = Object.keys(startOfRookTowers);
    for (const key of keys) {
        startingPos[key] = startOfRookTowers[key];
    }

    appendPawnTower(startingPos, 0, 13, dist);
    appendPawnTower(startingPos, 2, 13, dist);
    appendPawnTower(startingPos, 3, 16, dist);
    appendPawnTower(startingPos, 5, 16, dist);

    spawnAllRookTowers(startingPos, 6, 3, dist + 3, dist);

    // Bishop Cannon Battery

    startingPos[coordutil.getKeyFromCoords([0,-6])] = typeutil.intTypes.pawnsB;
    startingPos[coordutil.getKeyFromCoords([0,-7])] = typeutil.intTypes.pawnsW;

    spawnAllBishopCannons(startingPos, 1, -7, dist, -dist);

    spawnAllWings(startingPos, -1, -7, -dist, -dist);

    addVoidSquaresToOmegaFourth(startingPos, -866, 500, 567, -426, -134);

    return startingPos;

    function appendPawnTower(startingPos, x, startY, endY) {
        if (endY < startY) return; // Don't do negative pawn towers
        
        for (let y = startY; y <= endY; y++) {
            const thisCoords = [x,y];
            const key = coordutil.getKeyFromCoords(thisCoords);
            startingPos[key] = typeutil.intTypes.pawnsW;
        }
    }
        
    function setAir(startingPos, coords) {
        const key = coordutil.getKeyFromCoords(coords);
        delete startingPos[key];
    }
        
    function spawnRookTower(startingPos, xStart, yStart, dist) {
        
        // First wall with 4 bishops
        startingPos[coordutil.getKeyFromCoords([xStart,yStart])] = typeutil.intTypes.pawnsW;
        startingPos[coordutil.getKeyFromCoords([xStart,yStart + 1])] = typeutil.intTypes.pawnsB;
        startingPos[coordutil.getKeyFromCoords([xStart,yStart + 2])] = typeutil.intTypes.pawnsW;
        if (yStart + 3 <= dist) startingPos[coordutil.getKeyFromCoords([xStart,yStart + 3])] = typeutil.intTypes.pawnsB;
        if (yStart + 6 <= dist) startingPos[coordutil.getKeyFromCoords([xStart,yStart + 6])] = typeutil.intTypes.pawnsW;
        if (yStart + 7 <= dist) startingPos[coordutil.getKeyFromCoords([xStart,yStart + 7])] = typeutil.intTypes.pawnsB;
        if (yStart + 8 <= dist) startingPos[coordutil.getKeyFromCoords([xStart,yStart + 8])] = typeutil.intTypes.bishopsW;
        if (yStart + 9 <= dist) startingPos[coordutil.getKeyFromCoords([xStart,yStart + 9])] = typeutil.intTypes.pawnsW;
        if (yStart + 10 <= dist) startingPos[coordutil.getKeyFromCoords([xStart,yStart + 10])] = typeutil.intTypes.bishopsW;
        if (yStart + 12 <= dist) startingPos[coordutil.getKeyFromCoords([xStart,yStart + 12])] = typeutil.intTypes.bishopsW;
        if (yStart + 14 <= dist) startingPos[coordutil.getKeyFromCoords([xStart,yStart + 14])] = typeutil.intTypes.bishopsW;
        appendPawnTower(startingPos, xStart, yStart + 16, dist);
        
        // Second wall with rook
        startingPos[coordutil.getKeyFromCoords([xStart + 1,yStart + 1])] = typeutil.intTypes.pawnsW;
        startingPos[coordutil.getKeyFromCoords([xStart + 1,yStart + 2])] = typeutil.intTypes.pawnsB;
        if (yStart + 3 <= dist) startingPos[coordutil.getKeyFromCoords([xStart + 1,yStart + 3])] = typeutil.intTypes.pawnsW;
        if (yStart + 4 <= dist) startingPos[coordutil.getKeyFromCoords([xStart + 1,yStart + 4])] = typeutil.intTypes.pawnsB;
        if (yStart + 7 <= dist) startingPos[coordutil.getKeyFromCoords([xStart + 1,yStart + 7])] = typeutil.intTypes.pawnsW;
        if (yStart + 8 <= dist) startingPos[coordutil.getKeyFromCoords([xStart + 1,yStart + 8])] = typeutil.intTypes.pawnsB;
        if (yStart + 9 <= dist) startingPos[coordutil.getKeyFromCoords([xStart + 1,yStart + 9])] = typeutil.intTypes.bishopsW;
        if (yStart + 11 <= dist) startingPos[coordutil.getKeyFromCoords([xStart + 1,yStart + 11])] = typeutil.intTypes.bishopsW;
        if (yStart + 13 <= dist) startingPos[coordutil.getKeyFromCoords([xStart + 1,yStart + 13])] = typeutil.intTypes.bishopsW;
        if (yStart + 15 <= dist) startingPos[coordutil.getKeyFromCoords([xStart + 1,yStart + 15])] = typeutil.intTypes.bishopsW;
        if (yStart + 16 <= dist) startingPos[coordutil.getKeyFromCoords([xStart + 1,yStart + 16])] = typeutil.intTypes.rooksB;
        
        // Third pawn wall
        startingPos[coordutil.getKeyFromCoords([xStart + 2,yStart + 2])] = typeutil.intTypes.pawnsW;
        if (yStart + 3 <= dist) startingPos[coordutil.getKeyFromCoords([xStart + 2,yStart + 3])] = typeutil.intTypes.pawnsB;
        if (yStart + 4 <= dist) startingPos[coordutil.getKeyFromCoords([xStart + 2,yStart + 4])] = typeutil.intTypes.pawnsW;
        if (yStart + 5 <= dist) startingPos[coordutil.getKeyFromCoords([xStart + 2,yStart + 5])] = typeutil.intTypes.pawnsB;
        if (yStart + 8 <= dist) startingPos[coordutil.getKeyFromCoords([xStart + 2,yStart + 8])] = typeutil.intTypes.pawnsW;
        if (yStart + 9 <= dist) startingPos[coordutil.getKeyFromCoords([xStart + 2,yStart + 9])] = typeutil.intTypes.pawnsB;
        if (yStart + 10 <= dist) startingPos[coordutil.getKeyFromCoords([xStart + 2,yStart + 10])] = typeutil.intTypes.pawnsW;
        if (yStart + 11 <= dist) startingPos[coordutil.getKeyFromCoords([xStart + 2,yStart + 11])] = typeutil.intTypes.pawnsW;
        if (yStart + 12 <= dist) startingPos[coordutil.getKeyFromCoords([xStart + 2,yStart + 12])] = typeutil.intTypes.pawnsW;
        if (yStart + 13 <= dist) startingPos[coordutil.getKeyFromCoords([xStart + 2,yStart + 13])] = typeutil.intTypes.pawnsW;
        if (yStart + 14 <= dist) startingPos[coordutil.getKeyFromCoords([xStart + 2,yStart + 14])] = typeutil.intTypes.pawnsW;
        if (yStart + 15 <= dist) startingPos[coordutil.getKeyFromCoords([xStart + 2,yStart + 15])] = typeutil.intTypes.pawnsB;
        appendPawnTower(startingPos, xStart + 2, yStart + 16, dist);
    }
    
    function spawnAllRookTowers(startingPos, xStart, yStart, xEnd, yEnd) {
        let y = yStart;
        for (let x = xStart; x < xEnd; x += 3) {
            spawnRookTower(startingPos, x, y, yEnd);
            y += 3; // Increment y as well!
        }
    }

    function spawnAllBishopCannons(startingPos, startX, startY, endX, endY) {
        const spacing = 7;

        let currX = startX;
        let currY = startY;
        let i = 0;
        do {
            genBishopCannon(startingPos, currX, currY, i);

            currX += spacing;
            currY -= spacing;
            i++;
        } while (currX < endX && currY > endY);
    }

    function genBishopCannon(startingPos, x, y, i) {

        // Pawn staples that never change
        startingPos[coordutil.getKeyFromCoords([x,y])] = typeutil.intTypes.pawnsB;
        startingPos[coordutil.getKeyFromCoords([x,y - 1])] = typeutil.intTypes.pawnsW;
        startingPos[coordutil.getKeyFromCoords([x + 1,y - 1])] = typeutil.intTypes.pawnsB;
        startingPos[coordutil.getKeyFromCoords([x + 1,y - 2])] = typeutil.intTypes.pawnsW;
        startingPos[coordutil.getKeyFromCoords([x + 2,y - 2])] = typeutil.intTypes.pawnsB;
        startingPos[coordutil.getKeyFromCoords([x + 2,y - 3])] = typeutil.intTypes.pawnsW;
        if (y - 3 - x + 3 > -980) startingPos[coordutil.getKeyFromCoords([x + 3,y - 3])] = typeutil.intTypes.pawnsB;
        if (y - 4 - x + 3 > -980) startingPos[coordutil.getKeyFromCoords([x + 3,y - 4])] = typeutil.intTypes.pawnsW;
        if (y - 5 - x + 4 > -980) startingPos[coordutil.getKeyFromCoords([x + 4,y - 4])] = typeutil.intTypes.pawnsB;
        if (y - 3 - x + 4 > -980) startingPos[coordutil.getKeyFromCoords([x + 4,y - 5])] = typeutil.intTypes.pawnsW;
        if (y - 4 - x + 5 > -980) startingPos[coordutil.getKeyFromCoords([x + 5,y - 3])] = typeutil.intTypes.pawnsB;
        if (y - 4 - x + 5 > -980) startingPos[coordutil.getKeyFromCoords([x + 5,y - 4])] = typeutil.intTypes.pawnsW;
        if (y - 2 - x + 6 > -980) startingPos[coordutil.getKeyFromCoords([x + 6,y - 2])] = typeutil.intTypes.pawnsB;
        if (y - 3 - x + 6 > -980) startingPos[coordutil.getKeyFromCoords([x + 6,y - 3])] = typeutil.intTypes.pawnsW;
        if (y - 1 - x + 7 > -980) startingPos[coordutil.getKeyFromCoords([x + 7,y - 1])] = typeutil.intTypes.pawnsB;
        if (y - 2 - x + 7 > -980) startingPos[coordutil.getKeyFromCoords([x + 7,y - 2])] = typeutil.intTypes.pawnsW;
        if (y + 1 - x + 7 > -980) startingPos[coordutil.getKeyFromCoords([x + 7,y + 1])] = typeutil.intTypes.pawnsB;
        if (y + 0 - x + 7 > -980) startingPos[coordutil.getKeyFromCoords([x + 7,y + 0])] = typeutil.intTypes.pawnsW;
        if (y - 2 - x + 8 > -980) startingPos[coordutil.getKeyFromCoords([x + 8,y - 2])] = typeutil.intTypes.bishopsB;
        
        if (y - 6 - x + 6 > -980) startingPos[coordutil.getKeyFromCoords([x + 6,y - 6])] = typeutil.intTypes.pawnsB;
        if (y - 7 - x + 6 > -980) startingPos[coordutil.getKeyFromCoords([x + 6,y - 7])] = typeutil.intTypes.pawnsW;
        if (y - 5 - x + 7 > -980) startingPos[coordutil.getKeyFromCoords([x + 7,y - 5])] = typeutil.intTypes.pawnsB;
        if (y - 6 - x + 7 > -980) startingPos[coordutil.getKeyFromCoords([x + 7,y - 6])] = typeutil.intTypes.pawnsW;
        if (y - 4 - x + 8 > -980) startingPos[coordutil.getKeyFromCoords([x + 8,y - 4])] = typeutil.intTypes.pawnsB;
        if (y - 5 - x + 8 > -980) startingPos[coordutil.getKeyFromCoords([x + 8,y - 5])] = typeutil.intTypes.pawnsW;
        if (y - 3 - x + 9 > -980) startingPos[coordutil.getKeyFromCoords([x + 9,y - 3])] = typeutil.intTypes.pawnsB;
        if (y - 4 - x + 9 > -980) startingPos[coordutil.getKeyFromCoords([x + 9,y - 4])] = typeutil.intTypes.pawnsW;

        // Generate bishop puzzle pieces.
        // it tells us how many to iteratively gen!
        const count = i + 2;

        let puzzleX = x + 8;
        let puzzleY = y + 2;
        const upDiag = puzzleY - puzzleX;
        if (upDiag > -990) {
            for (let a = 1; a <= count; a++) {
                const isLastIndex = a === count;
                genBishopPuzzlePiece(startingPos, puzzleX, puzzleY, isLastIndex);

                puzzleX += 1;
                puzzleY += 1;
            }
        }

        // White pawn strip
        let pawnX = x + 4;
        let pawnY = y;
        for (let a = 0; a < i; a++) {
            startingPos[coordutil.getKeyFromCoords([pawnX,pawnY])] = typeutil.intTypes.pawnsW;

            pawnX++;
            pawnY++;
        }
    }

    function genBishopPuzzlePiece(startingPos, x, y, isLastIndex) {
        startingPos[coordutil.getKeyFromCoords([x,y])] = typeutil.intTypes.pawnsB;
        startingPos[coordutil.getKeyFromCoords([x,y - 1])] = typeutil.intTypes.pawnsW;
        startingPos[coordutil.getKeyFromCoords([x,y - 2])] = typeutil.intTypes.bishopsB;
        startingPos[coordutil.getKeyFromCoords([x + 1,y - 2])] = typeutil.intTypes.pawnsB;
        startingPos[coordutil.getKeyFromCoords([x + 1,y - 3])] = typeutil.intTypes.bishopsB;
        startingPos[coordutil.getKeyFromCoords([x + 2,y - 4])] = typeutil.intTypes.pawnsB;
        startingPos[coordutil.getKeyFromCoords([x + 2,y - 5])] = typeutil.intTypes.pawnsW;

        if (!isLastIndex) return;

        // Is last index
        startingPos[coordutil.getKeyFromCoords([x + 1,y - 2])] = typeutil.intTypes.pawnsW;
        startingPos[coordutil.getKeyFromCoords([x + 1,y - 1])] = typeutil.intTypes.pawnsB;
        startingPos[coordutil.getKeyFromCoords([x + 2,y - 3])] = typeutil.intTypes.pawnsW;
        startingPos[coordutil.getKeyFromCoords([x + 2,y - 2])] = typeutil.intTypes.pawnsB;
    }

    function spawnAllWings(startingPos, startX, startY, endX, endY) {
        const spacing = 8;

        let currX = startX;
        let currY = startY;
        let i = 0;
        do {
            spawnWing(startingPos, currX, currY, i);

            currX -= spacing;
            currY -= spacing;
            i++;
        } while (currX > endX && currY > endY);
    }

    function spawnWing(startingPos, x, y, i) {
        startingPos[coordutil.getKeyFromCoords([x,y])] = typeutil.intTypes.pawnsB;
        startingPos[coordutil.getKeyFromCoords([x,y - 1])] = typeutil.intTypes.pawnsW;
        startingPos[coordutil.getKeyFromCoords([x - 1,y - 1])] = typeutil.intTypes.pawnsB;
        startingPos[coordutil.getKeyFromCoords([x - 1,y - 2])] = typeutil.intTypes.pawnsW;
        startingPos[coordutil.getKeyFromCoords([x - 2,y - 2])] = typeutil.intTypes.pawnsB;
        startingPos[coordutil.getKeyFromCoords([x - 2,y - 3])] = typeutil.intTypes.pawnsW;
        startingPos[coordutil.getKeyFromCoords([x - 3,y - 3])] = typeutil.intTypes.pawnsB;
        startingPos[coordutil.getKeyFromCoords([x - 3,y - 4])] = typeutil.intTypes.pawnsW;
        startingPos[coordutil.getKeyFromCoords([x - 4,y - 4])] = typeutil.intTypes.pawnsB;
        startingPos[coordutil.getKeyFromCoords([x - 4,y - 5])] = typeutil.intTypes.pawnsW;
        
        // Generate segments
        // it tells us how many to iteratively gen!
        const count = i + 1;
        const segSpacing = 6;

        let segX = x - 5;
        let segY = y - 8;
        for (let a = 1; a <= count; a++) {
            const isLastIndex = a === count;
            genWingSegment(startingPos, segX, segY, isLastIndex);

            segX -= segSpacing;
            segY += segSpacing;
        }

        setAir(startingPos, [x - 6,y - 8]);
        setAir(startingPos, [x - 6,y - 9]);
        setAir(startingPos, [x - 5,y - 9]);
        setAir(startingPos, [x - 5,y - 10]);
    }

    function genWingSegment(startingPos, x, y, isLastIndex) {
        startingPos[coordutil.getKeyFromCoords([x,y - 2])] = typeutil.intTypes.pawnsW;
        startingPos[coordutil.getKeyFromCoords([x,y - 1])] = typeutil.intTypes.pawnsB;
        startingPos[coordutil.getKeyFromCoords([x - 1,y - 1])] = typeutil.intTypes.pawnsW;
        startingPos[coordutil.getKeyFromCoords([x - 1,y + 0])] = typeutil.intTypes.pawnsB;
        startingPos[coordutil.getKeyFromCoords([x - 2,y + 0])] = typeutil.intTypes.pawnsW;
        startingPos[coordutil.getKeyFromCoords([x - 2,y + 1])] = typeutil.intTypes.pawnsB;
        startingPos[coordutil.getKeyFromCoords([x - 3,y + 1])] = typeutil.intTypes.pawnsW;
        startingPos[coordutil.getKeyFromCoords([x - 3,y + 2])] = typeutil.intTypes.pawnsB;
        startingPos[coordutil.getKeyFromCoords([x - 4,y + 2])] = typeutil.intTypes.pawnsW;
        startingPos[coordutil.getKeyFromCoords([x - 4,y + 3])] = typeutil.intTypes.pawnsB;
        startingPos[coordutil.getKeyFromCoords([x - 5,y + 3])] = typeutil.intTypes.pawnsW;
        startingPos[coordutil.getKeyFromCoords([x - 5,y + 4])] = typeutil.intTypes.pawnsB;

        startingPos[coordutil.getKeyFromCoords([x,y + 2])] = typeutil.intTypes.pawnsW;
        startingPos[coordutil.getKeyFromCoords([x,y + 3])] = typeutil.intTypes.pawnsB;
        startingPos[coordutil.getKeyFromCoords([x - 1,y + 3])] = typeutil.intTypes.pawnsW;
        startingPos[coordutil.getKeyFromCoords([x - 1,y + 4])] = typeutil.intTypes.pawnsB;
        startingPos[coordutil.getKeyFromCoords([x - 2,y + 4])] = typeutil.intTypes.pawnsW;
        startingPos[coordutil.getKeyFromCoords([x - 2,y + 5])] = typeutil.intTypes.pawnsB;
        startingPos[coordutil.getKeyFromCoords([x - 2,y + 6])] = typeutil.intTypes.pawnsW;
        startingPos[coordutil.getKeyFromCoords([x - 2,y + 7])] = typeutil.intTypes.pawnsW;
        startingPos[coordutil.getKeyFromCoords([x - 2,y + 8])] = typeutil.intTypes.pawnsW;
        startingPos[coordutil.getKeyFromCoords([x - 2,y + 9])] = typeutil.intTypes.pawnsB;
        startingPos[coordutil.getKeyFromCoords([x - 2,y + 10])] = typeutil.intTypes.pawnsW;
        startingPos[coordutil.getKeyFromCoords([x - 2,y + 11])] = typeutil.intTypes.pawnsB;
        startingPos[coordutil.getKeyFromCoords([x - 3,y + 11])] = typeutil.intTypes.pawnsW;
        startingPos[coordutil.getKeyFromCoords([x - 3,y + 12])] = typeutil.intTypes.pawnsB;
        startingPos[coordutil.getKeyFromCoords([x - 4,y + 12])] = typeutil.intTypes.pawnsW;
        startingPos[coordutil.getKeyFromCoords([x - 4,y + 13])] = typeutil.intTypes.pawnsB;
        startingPos[coordutil.getKeyFromCoords([x - 5,y + 11])] = typeutil.intTypes.pawnsW;
        startingPos[coordutil.getKeyFromCoords([x - 5,y + 12])] = typeutil.intTypes.pawnsB;
        startingPos[coordutil.getKeyFromCoords([x - 5,y + 10])] = typeutil.intTypes.pawnsB;
        startingPos[coordutil.getKeyFromCoords([x - 5,y + 9])] = typeutil.intTypes.pawnsW;
        startingPos[coordutil.getKeyFromCoords([x - 5,y + 8])] = typeutil.intTypes.pawnsB;
        startingPos[coordutil.getKeyFromCoords([x - 5,y + 7])] = typeutil.intTypes.pawnsW;
        startingPos[coordutil.getKeyFromCoords([x - 4,y + 7])] = typeutil.intTypes.pawnsB;
        startingPos[coordutil.getKeyFromCoords([x - 4,y + 6])] = typeutil.intTypes.pawnsW;
        startingPos[coordutil.getKeyFromCoords([x - 4,y + 10])] = typeutil.intTypes.bishopsW;

        if (!isLastIndex) return;

        // Is last wing segment!
        startingPos[coordutil.getKeyFromCoords([x - 5,y + 6])] = typeutil.intTypes.pawnsB;
        startingPos[coordutil.getKeyFromCoords([x - 5,y + 5])] = typeutil.intTypes.pawnsW;
    }
}

function addVoidSquaresToOmegaFourth(startingPos, left, top, right, bottomright, bottomleft) {

    for (let x = left; x <= right; x++) {
        const key = coordutil.getKeyFromCoords([x,top]);
        startingPos[key] = typeutil.intTypes.voidsN;
    }
    for (let y = top; y >= bottomright; y--) {
        const key = coordutil.getKeyFromCoords([right,y]);
        startingPos[key] = typeutil.intTypes.voidsN;
    }

    let y = bottomright;
    for (let x = right; x >= -3; x--) {
        let key = coordutil.getKeyFromCoords([x,y]);
        startingPos[key] = typeutil.intTypes.voidsN;
        key = coordutil.getKeyFromCoords([x,y - 1]);
        startingPos[key] = typeutil.intTypes.voidsN;
        y--;
    }

    for (let y = top; y >= bottomleft; y--) {
        const key = coordutil.getKeyFromCoords([left,y]);
        startingPos[key] = typeutil.intTypes.voidsN;
    }
    y = bottomleft;
    for (let x = left; x <= -4; x++) {
        let key = coordutil.getKeyFromCoords([x,y]);
        startingPos[key] = typeutil.intTypes.voidsN;
        key = coordutil.getKeyFromCoords([x,y - 1]);
        startingPos[key] = typeutil.intTypes.voidsN;
        y--;
    }

    startingPos[`492,493`] = typeutil.intTypes.voidsN;
}

export default {
    genPositionOfOmegaFourth
};