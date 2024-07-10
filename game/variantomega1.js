
const variant1 = require('./variant1')
const math1 = require('./math1');


// This extends variant.js, containing the init methods
// and generation aglorithms for all positions omega and above (showcasings)

'use strict';

const variantomega1 = (function(){

    /**
     * Inits the gamefile for Joel & Cory's "Omega". Sets the startSnapshot and gameRules properties.
     * @param {gamefile} gamefile - The gamefile
     */
    function initOmega(gamefile, { Variant, Date }) {
        const { position, positionString, specialRights } = variant1.getStartingPositionOfVariant({ Variant: 'Omega' })
        gamefile.startSnapshot = {
            position,
            positionString,
            specialRights,
            turn: 'black'
        }
        gamefile.gameRules = variant1.getGameRulesOfVariant({ Variant, Date }, position)
    }

    /**
     * Inits the gamefile for Andreas Tsevasa's "Omega^2". Sets the startSnapshot and gameRules properties.
     * @param {gamefile} gamefile - The gamefile
     */
    function initOmegaSquared(gamefile, { Variant, Date }) {
        const { position, positionString, specialRights } = variant1.getStartingPositionOfVariant({ Variant: 'Omega^2' })
        gamefile.startSnapshot = {
            position,
            positionString,
            specialRights,
            turn: 'black'
        }
        gamefile.gameRules = variant1.getGameRulesOfVariant({ Variant, Date }, position)
    }

    /**
     * Inits the gamefile for the Omega^3 position. Sets the startSnapshot and gameRules properties.
     * @param {gamefile} gamefile - The gamefile
     */
    function initOmegaCubed(gamefile, { Variant, Date }) {
        const { position, positionString, specialRights } = variant1.getStartingPositionOfVariant({ Variant: 'Omega^3' })
        gamefile.startSnapshot = {
            position,
            positionString,
            specialRights,
            turn: 'black'
        }
        gamefile.gameRules = variant1.getGameRulesOfVariant({ Variant, Date }, position)
    }

    /**
     * Inits the gamefile for the Omega^3 position. Sets the startSnapshot and gameRules properties.
     * @param {gamefile} gamefile - The gamefile
     */
    function initOmegaFourth(gamefile, { Variant, Date }) {
        const { position, positionString, specialRights } = variant1.getStartingPositionOfVariant({ Variant: 'Omega^4' })
        gamefile.startSnapshot = {
            position,
            positionString,
            specialRights,
            turn: 'black'
        }
        gamefile.gameRules = variant1.getGameRulesOfVariant({ Variant, Date }, position)
    }

    /**
     * Generates the Omega^3 position example
     * @returns {Object} The position in keys format
     */
    function genPositionOfOmegaCubed() {

        const dist = 500; // Generate Omega^3 up to a distance of 1000 tiles away

        const startingPos = { };

        startingPos[math1.getKeyFromCoords([3,15])] = 'kingsW';
        startingPos[math1.getKeyFromCoords([4,13])] = 'rooksB';

        // First few pawn walls
        apphendPawnTower(startingPos, 7, -dist, dist);
        apphendPawnTower(startingPos, 8, -dist, dist);

        // Third pawn wall
        apphendPawnTower(startingPos, 9, -dist, dist);
        startingPos[math1.getKeyFromCoords([9,10])] = 'bishopsW'; // Overwrite with bishop
        setAir(startingPos, [9,11])

        // Black king wall
        apphendPawnTower(startingPos, 10, -dist, dist);
        startingPos[math1.getKeyFromCoords([10,12])] = 'kingsB'; // Overwrite with king

        // Spawn rook towers
        spawnAllRookTowers(startingPos, 11, 8, dist, dist);

        startingPos[math1.getKeyFromCoords([11,6])] = 'bishopsW';
        apphendPawnTower(startingPos, 11, -dist, 5);

        apphendPawnTower(startingPos, 12, -dist, 7);
        startingPos[math1.getKeyFromCoords([12,8])] = 'pawnsB';

        startingPos[math1.getKeyFromCoords([13,9])] = 'pawnsB';
        startingPos[math1.getKeyFromCoords([13,8])] = 'pawnsW';
        startingPos[math1.getKeyFromCoords([13,6])] = 'bishopsB';

        startingPos[math1.getKeyFromCoords([14,10])] = 'pawnsB';
        startingPos[math1.getKeyFromCoords([14,9])] = 'pawnsW';
        startingPos[math1.getKeyFromCoords([14,6])] = 'pawnsB';
        startingPos[math1.getKeyFromCoords([14,5])] = 'pawnsB';
        startingPos[math1.getKeyFromCoords([14,4])] = 'pawnsW';

        genBishopTunnel(startingPos, 15, 6, dist, dist)

        surroundPositionInVoidBox(startingPos, { left: -500, right: 500, bottom: -500, top: 500 });
        startingPos[`499,492`] = 'voidsN';
        startingPos[`7,-500`] = 'pawnsW';
        startingPos[`8,-500`] = 'pawnsW';
        startingPos[`9,-500`] = 'pawnsW';
        startingPos[`10,-500`] = 'pawnsW';
        startingPos[`11,-500`] = 'pawnsW';
        startingPos[`12,-500`] = 'pawnsW';
        startingPos[`6,-501`] = 'voidsN';
        startingPos[`7,-501`] = 'voidsN';
        startingPos[`8,-501`] = 'voidsN';
        startingPos[`9,-501`] = 'voidsN';
        startingPos[`10,-501`] = 'voidsN';
        startingPos[`11,-501`] = 'voidsN';
        startingPos[`12,-501`] = 'voidsN';
        startingPos[`13,-501`] = 'voidsN';

        // Bishop box that prevents black stalemate ideas
        startingPos[`497,-497`] = 'voidsN';
        startingPos[`498,-497`] = 'voidsN';
        startingPos[`499,-497`] = 'voidsN';
        startingPos[`497,-498`] = 'voidsN';
        startingPos[`497,-499`] = 'voidsN';
        startingPos[`498,-498`] = 'voidsN';
        startingPos[`499,-499`] = 'voidsN';
        startingPos[`498,-499`] = 'bishopsB';

        return startingPos;

        function apphendPawnTower(startingPos, x, startY, endY) {
            if (endY < startY) return; // Don't do negative pawn towers
          
            for (let y = startY; y <= endY; y++) {
              const thisCoords = [x,y];
              const key = math1.getKeyFromCoords(thisCoords);
              startingPos[key] = "pawnsW";
            }
        }
          
        function setAir(startingPos, coords) {
            const key = math1.getKeyFromCoords(coords);
            delete startingPos[key]
        }
          
        function spawnRookTower(startingPos, xStart, yStart, dist) {
            
            // First wall with 4 bishops
            startingPos[math1.getKeyFromCoords([xStart,yStart])] = 'bishopsW';
            startingPos[math1.getKeyFromCoords([xStart,yStart+1])] = 'pawnsW';
            startingPos[math1.getKeyFromCoords([xStart,yStart+2])] = 'bishopsW';
            startingPos[math1.getKeyFromCoords([xStart,yStart+4])] = 'bishopsW';
            startingPos[math1.getKeyFromCoords([xStart,yStart+6])] = 'bishopsW';
            apphendPawnTower(startingPos, xStart, yStart+8, dist)
            
            // Second wall with rook
            startingPos[math1.getKeyFromCoords([xStart+1,yStart+1])] = 'bishopsW';
            startingPos[math1.getKeyFromCoords([xStart+1,yStart+3])] = 'bishopsW';
            startingPos[math1.getKeyFromCoords([xStart+1,yStart+5])] = 'bishopsW';
            if (yStart+7 <= dist) startingPos[math1.getKeyFromCoords([xStart+1,yStart+7])] = 'bishopsW';
            if (yStart+8 <= dist) startingPos[math1.getKeyFromCoords([xStart+1,yStart+8])] = 'rooksB';
            
            // Third pawn wall
            apphendPawnTower(startingPos, xStart+2, yStart+2, dist)
            if (yStart+7 <= dist) startingPos[math1.getKeyFromCoords([xStart+2,yStart+7])] = 'pawnsB';
        }
        
        function spawnAllRookTowers(startingPos, xStart, yStart, xEnd, yEnd) {
            let y = yStart;
            for (let x = xStart; x < xEnd; x += 3) {
                spawnRookTower(startingPos, x, y, yEnd);
                y += 3; // Increment y as well!
            }
        }
        
        function genBishopTunnel(startingPos, xStart, yStart, xEnd, yEnd) {
            let y = yStart;
            for (let x = xStart; x < xEnd; x++) {
                startingPos[math1.getKeyFromCoords([x,y])] = 'pawnsW';
                startingPos[math1.getKeyFromCoords([x,y+1])] = 'pawnsB';
                startingPos[math1.getKeyFromCoords([x,y+4])] = 'pawnsW';
                startingPos[math1.getKeyFromCoords([x,y+5])] = 'pawnsB';
            
                y++; // Increment y as well!
                if (y > yEnd) return;
            }
        }
    }

    /**
     * Generates the Omega^4 position example
     * @returns {Object} The position in keys format
     */
    function genPositionOfOmegaFourth() {
        const dist = 500; // Generate Omega^4 up to a distance of 50 tiles away

        // King chamber
        const startingPos = {
            '-14,17':'pawnsW',
            '-14,18':'pawnsB',
            '-13,14':'pawnsW',
            '-13,15':'pawnsB',
            '-13,16':'pawnsW',
            '-13,17':'pawnsB',
            '-13,20':'pawnsW',
            '-13,21':'pawnsB',
            '-13,22':'pawnsW',
            '-13,23':'pawnsB',
            '-13,24':'pawnsW',
            '-13,25':'pawnsB',
            '-13,26':'pawnsW',
            '-13,27':'pawnsB',
            '-12,16':'bishopsB',
            '-12,25':'bishopsW',
            '-11,14':'pawnsW',
            '-11,15':'pawnsB',
            '-11,16':'kingsB',
            '-11,17':'pawnsB',
            '-11,24':'pawnsW',
            '-11,25':'kingsW',
            '-11,26':'pawnsW',
            '-11,27':'pawnsB',
            '-10,16':'bishopsB',
            '-10,25':'bishopsW',
            '-9,14':'pawnsW',
            '-9,15':'pawnsB',
            '-9,16':'pawnsW',
            '-9,17':'pawnsB',
            '-9,18':'pawnsW',
            '-9,19':'pawnsB',
            '-9,20':'pawnsW',
            '-9,21':'pawnsB',
            '-9,22':'pawnsW',
            '-9,23':'pawnsB',
            '-9,24':'pawnsW',
            '-9,25':'pawnsB',
            '-9,26':'pawnsW',
            '-9,27':'pawnsB',
        }

        // Rook towers

        const startOfRookTowers = {
            '0,3': 'pawnsW',
            '0,4': 'pawnsB',
            '0,5': 'pawnsW',
            '0,6': 'pawnsB',
            '0,11': 'pawnsW',
            '0,12': 'pawnsB',
            '1,4': 'bishopsW',
            '1,12': 'bishopsW',
            '1,13': 'rooksB',
            '2,1': 'pawnsW',
            '2,2': 'pawnsB',
            '2,3': 'pawnsW',
            '2,4': 'pawnsB',
            '2,5': 'pawnsW',
            '2,6': 'pawnsB',
            '2,7': 'pawnsW',
            '2,8': 'pawnsW',
            '2,9': 'pawnsW',
            '2,10': 'pawnsW',
            '2,11': 'pawnsW',
            '2,12': 'pawnsB',
            '3,2': 'bishopsW',
            '3,4': 'bishopsB',
            '3,6': 'pawnsW',
            '3,7': 'pawnsB',
            '3,8': 'bishopsW',
            '3,9': 'pawnsW',
            '3,10': 'bishopsW',
            '3,12': 'bishopsW',
            '3,14': 'bishopsW',
            '4,1': 'pawnsW',
            '4,2': 'pawnsB',
            '4,3': 'pawnsW',
            '4,4': 'pawnsB',
            '4,7': 'pawnsW',
            '4,8': 'pawnsB',
            '4,9': 'bishopsW',
            '4,11': 'bishopsW',
            '4,13': 'bishopsW',
            '4,15': 'bishopsW',
            '4,16': 'rooksB',
            '5,4': 'pawnsW',
            '5,5': 'pawnsB',
            '5,8': 'pawnsW',
            '5,9': 'pawnsB',
            '5,10': 'pawnsW',
            '5,11': 'pawnsW',
            '5,12': 'pawnsW',
            '5,13': 'pawnsW',
            '5,14': 'pawnsW',
            '5,15': 'pawnsB',
        }

        let keys = Object.keys(startOfRookTowers);
        for (const key of keys) {
            startingPos[key] = startOfRookTowers[key]
        }

        apphendPawnTower(startingPos, 0, 13, dist)
        apphendPawnTower(startingPos, 2, 13, dist)
        apphendPawnTower(startingPos, 3, 16, dist)
        apphendPawnTower(startingPos, 5, 16, dist)

        spawnAllRookTowers(startingPos, 6, 3, dist+3, dist)

        // Bishop Cannon Battery

        startingPos[math1.getKeyFromCoords([0,-6])] = 'pawnsB';
        startingPos[math1.getKeyFromCoords([0,-7])] = 'pawnsW';

        spawnAllBishopCannons(startingPos, 1, -7, dist, -dist)

        spawnAllWings(startingPos, -1, -7, -dist, -dist)

        addVoidSquaresToOmegaFourth(startingPos, -866, 500, 567, -426, -134);

        return startingPos;

        function apphendPawnTower(startingPos, x, startY, endY) {
            if (endY < startY) return; // Don't do negative pawn towers
          
            for (let y = startY; y <= endY; y++) {
              const thisCoords = [x,y];
              const key = math1.getKeyFromCoords(thisCoords);
              startingPos[key] = "pawnsW";
            }
        }
          
        function setAir(startingPos, coords) {
            const key = math1.getKeyFromCoords(coords);
            delete startingPos[key]
        }
          
        function spawnRookTower(startingPos, xStart, yStart, dist) {
            
            // First wall with 4 bishops
            startingPos[math1.getKeyFromCoords([xStart,yStart])] = 'pawnsW';
            startingPos[math1.getKeyFromCoords([xStart,yStart+1])] = 'pawnsB';
            startingPos[math1.getKeyFromCoords([xStart,yStart+2])] = 'pawnsW';
            if (yStart+3 <= dist) startingPos[math1.getKeyFromCoords([xStart,yStart+3])] = 'pawnsB';
            if (yStart+6 <= dist) startingPos[math1.getKeyFromCoords([xStart,yStart+6])] = 'pawnsW';
            if (yStart+7 <= dist) startingPos[math1.getKeyFromCoords([xStart,yStart+7])] = 'pawnsB';
            if (yStart+8 <= dist) startingPos[math1.getKeyFromCoords([xStart,yStart+8])] = 'bishopsW';
            if (yStart+9 <= dist) startingPos[math1.getKeyFromCoords([xStart,yStart+9])] = 'pawnsW';
            if (yStart+10 <= dist) startingPos[math1.getKeyFromCoords([xStart,yStart+10])] = 'bishopsW';
            if (yStart+12 <= dist) startingPos[math1.getKeyFromCoords([xStart,yStart+12])] = 'bishopsW';
            if (yStart+14 <= dist) startingPos[math1.getKeyFromCoords([xStart,yStart+14])] = 'bishopsW';
            apphendPawnTower(startingPos, xStart, yStart+16, dist)
            
            // Second wall with rook
            startingPos[math1.getKeyFromCoords([xStart+1,yStart+1])] = 'pawnsW';
            startingPos[math1.getKeyFromCoords([xStart+1,yStart+2])] = 'pawnsB';
            if (yStart+3 <= dist) startingPos[math1.getKeyFromCoords([xStart+1,yStart+3])] = 'pawnsW';
            if (yStart+4 <= dist) startingPos[math1.getKeyFromCoords([xStart+1,yStart+4])] = 'pawnsB';
            if (yStart+7 <= dist) startingPos[math1.getKeyFromCoords([xStart+1,yStart+7])] = 'pawnsW';
            if (yStart+8 <= dist) startingPos[math1.getKeyFromCoords([xStart+1,yStart+8])] = 'pawnsB';
            if (yStart+9 <= dist) startingPos[math1.getKeyFromCoords([xStart+1,yStart+9])] = 'bishopsW';
            if (yStart+11 <= dist) startingPos[math1.getKeyFromCoords([xStart+1,yStart+11])] = 'bishopsW';
            if (yStart+13 <= dist) startingPos[math1.getKeyFromCoords([xStart+1,yStart+13])] = 'bishopsW';
            if (yStart+15 <= dist) startingPos[math1.getKeyFromCoords([xStart+1,yStart+15])] = 'bishopsW';
            if (yStart+16 <= dist) startingPos[math1.getKeyFromCoords([xStart+1,yStart+16])] = 'rooksB';
            
            // Third pawn wall
            startingPos[math1.getKeyFromCoords([xStart+2,yStart+2])] = 'pawnsW';
            if (yStart+3 <= dist) startingPos[math1.getKeyFromCoords([xStart+2,yStart+3])] = 'pawnsB';
            if (yStart+4 <= dist) startingPos[math1.getKeyFromCoords([xStart+2,yStart+4])] = 'pawnsW';
            if (yStart+5 <= dist) startingPos[math1.getKeyFromCoords([xStart+2,yStart+5])] = 'pawnsB';
            if (yStart+8 <= dist) startingPos[math1.getKeyFromCoords([xStart+2,yStart+8])] = 'pawnsW';
            if (yStart+9 <= dist) startingPos[math1.getKeyFromCoords([xStart+2,yStart+9])] = 'pawnsB';
            if (yStart+10 <= dist) startingPos[math1.getKeyFromCoords([xStart+2,yStart+10])] = 'pawnsW';
            if (yStart+11 <= dist) startingPos[math1.getKeyFromCoords([xStart+2,yStart+11])] = 'pawnsW';
            if (yStart+12 <= dist) startingPos[math1.getKeyFromCoords([xStart+2,yStart+12])] = 'pawnsW';
            if (yStart+13 <= dist) startingPos[math1.getKeyFromCoords([xStart+2,yStart+13])] = 'pawnsW';
            if (yStart+14 <= dist) startingPos[math1.getKeyFromCoords([xStart+2,yStart+14])] = 'pawnsW';
            if (yStart+15 <= dist) startingPos[math1.getKeyFromCoords([xStart+2,yStart+15])] = 'pawnsB';
            apphendPawnTower(startingPos, xStart+2, yStart+16, dist)
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
            } while (currX < endX && currY > endY)
        }

        function genBishopCannon(startingPos, x, y, i) {

            // Pawn staples that never change
            startingPos[math1.getKeyFromCoords([x,y])] = 'pawnsB';
            startingPos[math1.getKeyFromCoords([x,y-1])] = 'pawnsW';
            startingPos[math1.getKeyFromCoords([x+1,y-1])] = 'pawnsB';
            startingPos[math1.getKeyFromCoords([x+1,y-2])] = 'pawnsW';
            startingPos[math1.getKeyFromCoords([x+2,y-2])] = 'pawnsB';
            startingPos[math1.getKeyFromCoords([x+2,y-3])] = 'pawnsW';
            if (y-3 - x+3 > -980) startingPos[math1.getKeyFromCoords([x+3,y-3])] = 'pawnsB';
            if (y-4 - x+3 > -980) startingPos[math1.getKeyFromCoords([x+3,y-4])] = 'pawnsW';
            if (y-5 - x+4 > -980) startingPos[math1.getKeyFromCoords([x+4,y-4])] = 'pawnsB';
            if (y-3 - x+4 > -980) startingPos[math1.getKeyFromCoords([x+4,y-5])] = 'pawnsW';
            if (y-4 - x+5 > -980) startingPos[math1.getKeyFromCoords([x+5,y-3])] = 'pawnsB';
            if (y-4 - x+5 > -980) startingPos[math1.getKeyFromCoords([x+5,y-4])] = 'pawnsW';
            if (y-2 - x+6 > -980) startingPos[math1.getKeyFromCoords([x+6,y-2])] = 'pawnsB';
            if (y-3 - x+6 > -980) startingPos[math1.getKeyFromCoords([x+6,y-3])] = 'pawnsW';
            if (y-1 - x+7 > -980) startingPos[math1.getKeyFromCoords([x+7,y-1])] = 'pawnsB';
            if (y-2 - x+7 > -980) startingPos[math1.getKeyFromCoords([x+7,y-2])] = 'pawnsW';
            if (y+1 - x+7 > -980) startingPos[math1.getKeyFromCoords([x+7,y+1])] = 'pawnsB';
            if (y+0 - x+7 > -980) startingPos[math1.getKeyFromCoords([x+7,y+0])] = 'pawnsW';
            if (y-2 - x+8 > -980) startingPos[math1.getKeyFromCoords([x+8,y-2])] = 'bishopsB';
            
            if (y-6 - x+6 > -980) startingPos[math1.getKeyFromCoords([x+6,y-6])] = 'pawnsB';
            if (y-7 - x+6 > -980) startingPos[math1.getKeyFromCoords([x+6,y-7])] = 'pawnsW';
            if (y-5 - x+7 > -980) startingPos[math1.getKeyFromCoords([x+7,y-5])] = 'pawnsB';
            if (y-6 - x+7 > -980) startingPos[math1.getKeyFromCoords([x+7,y-6])] = 'pawnsW';
            if (y-4 - x+8 > -980) startingPos[math1.getKeyFromCoords([x+8,y-4])] = 'pawnsB';
            if (y-5 - x+8 > -980) startingPos[math1.getKeyFromCoords([x+8,y-5])] = 'pawnsW';
            if (y-3 - x+9 > -980) startingPos[math1.getKeyFromCoords([x+9,y-3])] = 'pawnsB';
            if (y-4 - x+9 > -980) startingPos[math1.getKeyFromCoords([x+9,y-4])] = 'pawnsW';

            // Generate bishop puzzle pieces.
            // i tells us how many to iteratavely gen!
            const count = i+2;

            let puzzleX = x+8;
            let puzzleY = y+2;
            const upDiag = puzzleY - puzzleX;
            if (upDiag > -990) {
                for (let a = 1; a <= count; a++) {
                    const isLastIndex = a === count;
                    genBishopPuzzlePiece(startingPos, puzzleX, puzzleY, isLastIndex)

                    puzzleX += 1;
                    puzzleY += 1;
                }
            }

            // White pawn strip
            let pawnX = x+4;
            let pawnY = y;
            for (let a = 0; a < i; a++) {
                startingPos[math1.getKeyFromCoords([pawnX,pawnY])] = 'pawnsW';

                pawnX++;
                pawnY++;
            }
        }

        function genBishopPuzzlePiece(startingPos, x, y, isLastIndex) {
            startingPos[math1.getKeyFromCoords([x,y])] = 'pawnsB';
            startingPos[math1.getKeyFromCoords([x,y-1])] = 'pawnsW';
            startingPos[math1.getKeyFromCoords([x,y-2])] = 'bishopsB';
            startingPos[math1.getKeyFromCoords([x+1,y-2])] = 'pawnsB';
            startingPos[math1.getKeyFromCoords([x+1,y-3])] = 'bishopsB';
            startingPos[math1.getKeyFromCoords([x+2,y-4])] = 'pawnsB';
            startingPos[math1.getKeyFromCoords([x+2,y-5])] = 'pawnsW';

            if (!isLastIndex) return;

            // Is last index
            startingPos[math1.getKeyFromCoords([x+1,y-2])] = 'pawnsW';
            startingPos[math1.getKeyFromCoords([x+1,y-1])] = 'pawnsB';
            startingPos[math1.getKeyFromCoords([x+2,y-3])] = 'pawnsW';
            startingPos[math1.getKeyFromCoords([x+2,y-2])] = 'pawnsB';
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
            } while (currX > endX && currY > endY)
        }

        function spawnWing(startingPos, x, y, i) {
            startingPos[math1.getKeyFromCoords([x,y])] = 'pawnsB';
            startingPos[math1.getKeyFromCoords([x,y-1])] = 'pawnsW';
            startingPos[math1.getKeyFromCoords([x-1,y-1])] = 'pawnsB';
            startingPos[math1.getKeyFromCoords([x-1,y-2])] = 'pawnsW';
            startingPos[math1.getKeyFromCoords([x-2,y-2])] = 'pawnsB';
            startingPos[math1.getKeyFromCoords([x-2,y-3])] = 'pawnsW';
            startingPos[math1.getKeyFromCoords([x-3,y-3])] = 'pawnsB';
            startingPos[math1.getKeyFromCoords([x-3,y-4])] = 'pawnsW';
            startingPos[math1.getKeyFromCoords([x-4,y-4])] = 'pawnsB';
            startingPos[math1.getKeyFromCoords([x-4,y-5])] = 'pawnsW';
            
            // Generate segments
            // i tells us how many to iteratavely gen!
            const count = i+1;
            const segSpacing = 6;

            let segX = x-5;
            let segY = y-8;
            for (let a = 1; a <= count; a++) {
                const isLastIndex = a === count;
                genWingSegment(startingPos, segX, segY, isLastIndex)

                segX -= segSpacing;
                segY += segSpacing;
            }

            setAir(startingPos, [x-6,y-8]);
            setAir(startingPos, [x-6,y-9]);
            setAir(startingPos, [x-5,y-9]);
            setAir(startingPos, [x-5,y-10]);
        }

        function genWingSegment(startingPos, x, y, isLastIndex) {
            startingPos[math1.getKeyFromCoords([x,y-2])] = 'pawnsW';
            startingPos[math1.getKeyFromCoords([x,y-1])] = 'pawnsB';
            startingPos[math1.getKeyFromCoords([x-1,y-1])] = 'pawnsW';
            startingPos[math1.getKeyFromCoords([x-1,y+0])] = 'pawnsB';
            startingPos[math1.getKeyFromCoords([x-2,y+0])] = 'pawnsW';
            startingPos[math1.getKeyFromCoords([x-2,y+1])] = 'pawnsB';
            startingPos[math1.getKeyFromCoords([x-3,y+1])] = 'pawnsW';
            startingPos[math1.getKeyFromCoords([x-3,y+2])] = 'pawnsB';
            startingPos[math1.getKeyFromCoords([x-4,y+2])] = 'pawnsW';
            startingPos[math1.getKeyFromCoords([x-4,y+3])] = 'pawnsB';
            startingPos[math1.getKeyFromCoords([x-5,y+3])] = 'pawnsW';
            startingPos[math1.getKeyFromCoords([x-5,y+4])] = 'pawnsB';

            startingPos[math1.getKeyFromCoords([x,y+2])] = 'pawnsW';
            startingPos[math1.getKeyFromCoords([x,y+3])] = 'pawnsB';
            startingPos[math1.getKeyFromCoords([x-1,y+3])] = 'pawnsW';
            startingPos[math1.getKeyFromCoords([x-1,y+4])] = 'pawnsB';
            startingPos[math1.getKeyFromCoords([x-2,y+4])] = 'pawnsW';
            startingPos[math1.getKeyFromCoords([x-2,y+5])] = 'pawnsB';
            startingPos[math1.getKeyFromCoords([x-2,y+6])] = 'pawnsW';
            startingPos[math1.getKeyFromCoords([x-2,y+7])] = 'pawnsW';
            startingPos[math1.getKeyFromCoords([x-2,y+8])] = 'pawnsW';
            startingPos[math1.getKeyFromCoords([x-2,y+9])] = 'pawnsB';
            startingPos[math1.getKeyFromCoords([x-2,y+10])] = 'pawnsW';
            startingPos[math1.getKeyFromCoords([x-2,y+11])] = 'pawnsB';
            startingPos[math1.getKeyFromCoords([x-3,y+11])] = 'pawnsW';
            startingPos[math1.getKeyFromCoords([x-3,y+12])] = 'pawnsB';
            startingPos[math1.getKeyFromCoords([x-4,y+12])] = 'pawnsW';
            startingPos[math1.getKeyFromCoords([x-4,y+13])] = 'pawnsB';
            startingPos[math1.getKeyFromCoords([x-5,y+11])] = 'pawnsW';
            startingPos[math1.getKeyFromCoords([x-5,y+12])] = 'pawnsB';
            startingPos[math1.getKeyFromCoords([x-5,y+10])] = 'pawnsB';
            startingPos[math1.getKeyFromCoords([x-5,y+9])] = 'pawnsW';
            startingPos[math1.getKeyFromCoords([x-5,y+8])] = 'pawnsB';
            startingPos[math1.getKeyFromCoords([x-5,y+7])] = 'pawnsW';
            startingPos[math1.getKeyFromCoords([x-4,y+7])] = 'pawnsB';
            startingPos[math1.getKeyFromCoords([x-4,y+6])] = 'pawnsW';
            startingPos[math1.getKeyFromCoords([x-4,y+10])] = 'bishopsW';

            if (!isLastIndex) return;

            // Is last wing segment!
            startingPos[math1.getKeyFromCoords([x-5,y+6])] = 'pawnsB';
            startingPos[math1.getKeyFromCoords([x-5,y+5])] = 'pawnsW';
        }
    }

    /**
     * Adds a huge void square around the provided pieces by key.
     * Then deletes any pieces outside it.
     * @param {Object} position - The position, in key format: `{ '1,2':'pawnsW' }`
     * @param {BoundingBox} box - The rectangle to which to form the void box.
     */
    function surroundPositionInVoidBox(position, box) {
        // Iterate through all pieces and make sure they don't go past the box edges.
        // for (const key in position) {
        //     const coords = math.getCoordsFromKey(key);
        //     if (!math.boxContainsSquare(box, coords)) delete position[key];
        // }

        for (let x = box.left; x <= box.right; x++) {
            let key = math1.getKeyFromCoords([x,box.bottom]);
            position[key] = 'voidsN';
            key = math1.getKeyFromCoords([x,box.top]);
            position[key] = 'voidsN';
        }
        for (let y = box.bottom; y <= box.top; y++) {
            let key = math1.getKeyFromCoords([box.left, y]);
            position[key] = 'voidsN';
            key = math1.getKeyFromCoords([box.right, y]);
            position[key] = 'voidsN';
        }
    }
    
    function addVoidSquaresToOmegaFourth(startingPos, left, top, right, bottomright, bottomleft) {

        for (let x = left; x <= right; x++) {
            const key = math1.getKeyFromCoords([x,top])
            startingPos[key] = 'voidsN';
        }
        for (let y = top; y >= bottomright; y--) {
            const key = math1.getKeyFromCoords([right,y])
            startingPos[key] = 'voidsN';
        }

        let y = bottomright;
        for (let x = right; x >= -3; x--) {
            let key = math1.getKeyFromCoords([x,y])
            startingPos[key] = 'voidsN';
            key = math1.getKeyFromCoords([x,y-1])
            startingPos[key] = 'voidsN';
            y--;
        }

        for (let y = top; y >= bottomleft; y--) {
            const key = math1.getKeyFromCoords([left,y])
            startingPos[key] = 'voidsN';
        }
        y = bottomleft;
        for (let x = left; x <= -4; x++) {
            let key = math1.getKeyFromCoords([x,y])
            startingPos[key] = 'voidsN';
            key = math1.getKeyFromCoords([x,y-1])
            startingPos[key] = 'voidsN';
            y--;
        }

        startingPos[`492,493`] = 'voidsN';
    }

    return Object.freeze({
        initOmega,
        initOmegaSquared,
        initOmegaCubed,
        initOmegaFourth,
        genPositionOfOmegaCubed,
        genPositionOfOmegaFourth
    })

})();

module.exports = variantomega1;