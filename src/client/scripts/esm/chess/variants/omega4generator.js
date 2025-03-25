
import coordutil from '../util/coordutil.js';
import { rawTypes as r, ext as e } from '../config.js';

/** 
 * Type Definitions 
 * @typedef {import('../../util/math.js').BoundingBox} BoundingBox
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
		'-14,17':r.PAWN + e.W,
		'-14,18':r.PAWN + e.B,
		'-13,14':r.PAWN + e.W,
		'-13,15':r.PAWN + e.B,
		'-13,16':r.PAWN + e.W,
		'-13,17':r.PAWN + e.B,
		'-13,20':r.PAWN + e.W,
		'-13,21':r.PAWN + e.B,
		'-13,22':r.PAWN + e.W,
		'-13,23':r.PAWN + e.B,
		'-13,24':r.PAWN + e.W,
		'-13,25':r.PAWN + e.B,
		'-13,26':r.PAWN + e.W,
		'-13,27':r.PAWN + e.B,
		'-12,16':r.BISHOP + e.B,
		'-12,25':r.BISHOP + e.W,
		'-11,14':r.PAWN + e.W,
		'-11,15':r.PAWN + e.B,
		'-11,16':r.KING + e.B,
		'-11,17':r.PAWN + e.B,
		'-11,24':r.PAWN + e.W,
		'-11,25':r.KING + e.W,
		'-11,26':r.PAWN + e.W,
		'-11,27':r.PAWN + e.B,
		'-10,16':r.BISHOP + e.B,
		'-10,25':r.BISHOP + e.W,
		'-9,14':r.PAWN + e.W,
		'-9,15':r.PAWN + e.B,
		'-9,16':r.PAWN + e.W,
		'-9,17':r.PAWN + e.B,
		'-9,18':r.PAWN + e.W,
		'-9,19':r.PAWN + e.B,
		'-9,20':r.PAWN + e.W,
		'-9,21':r.PAWN + e.B,
		'-9,22':r.PAWN + e.W,
		'-9,23':r.PAWN + e.B,
		'-9,24':r.PAWN + e.W,
		'-9,25':r.PAWN + e.B,
		'-9,26':r.PAWN + e.W,
		'-9,27':r.PAWN + e.B,
	};

	// Rook towers

	const startOfRookTowers = {
		'0,3': r.PAWN + e.W,
		'0,4': r.PAWN + e.B,
		'0,5': r.PAWN + e.W,
		'0,6': r.PAWN + e.B,
		'0,11': r.PAWN + e.W,
		'0,12': r.PAWN + e.B,
		'1,4': r.BISHOP + e.W,
		'1,12': r.BISHOP + e.W,
		'1,13': r.ROOK + e.B,
		'2,1': r.PAWN + e.W,
		'2,2': r.PAWN + e.B,
		'2,3': r.PAWN + e.W,
		'2,4': r.PAWN + e.B,
		'2,5': r.PAWN + e.W,
		'2,6': r.PAWN + e.B,
		'2,7': r.PAWN + e.W,
		'2,8': r.PAWN + e.W,
		'2,9': r.PAWN + e.W,
		'2,10': r.PAWN + e.W,
		'2,11': r.PAWN + e.W,
		'2,12': r.PAWN + e.B,
		'3,2': r.BISHOP + e.W,
		'3,4': r.BISHOP + e.B,
		'3,6': r.PAWN + e.W,
		'3,7': r.PAWN + e.B,
		'3,8': r.BISHOP + e.W,
		'3,9': r.PAWN + e.W,
		'3,10': r.BISHOP + e.W,
		'3,12': r.BISHOP + e.W,
		'3,14': r.BISHOP + e.W,
		'4,1': r.PAWN + e.W,
		'4,2': r.PAWN + e.B,
		'4,3': r.PAWN + e.W,
		'4,4': r.PAWN + e.B,
		'4,7': r.PAWN + e.W,
		'4,8': r.PAWN + e.B,
		'4,9': r.BISHOP + e.W,
		'4,11': r.BISHOP + e.W,
		'4,13': r.BISHOP + e.W,
		'4,15': r.BISHOP + e.W,
		'4,16': r.ROOK + e.B,
		'5,4': r.PAWN + e.W,
		'5,5': r.PAWN + e.B,
		'5,8': r.PAWN + e.W,
		'5,9': r.PAWN + e.B,
		'5,10': r.PAWN + e.W,
		'5,11': r.PAWN + e.W,
		'5,12': r.PAWN + e.W,
		'5,13': r.PAWN + e.W,
		'5,14': r.PAWN + e.W,
		'5,15': r.PAWN + e.B,
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

	startingPos[coordutil.getKeyFromCoords([0,-6])] = r.PAWN + e.B;
	startingPos[coordutil.getKeyFromCoords([0,-7])] = r.PAWN + e.W;

	spawnAllBishopCannons(startingPos, 1, -7, dist, -dist);

	spawnAllWings(startingPos, -1, -7, -dist, -dist);

	addVoidSquaresToOmegaFourth(startingPos, -866, 500, 567, -426, -134);

	return startingPos;

	function appendPawnTower(startingPos, x, startY, endY) {
		if (endY < startY) return; // Don't do negative pawn towers
        
		for (let y = startY; y <= endY; y++) {
			const thisCoords = [x,y];
			const key = coordutil.getKeyFromCoords(thisCoords);
			startingPos[key] = r.PAWN + e.W;
		}
	}
        
	function setAir(startingPos, coords) {
		const key = coordutil.getKeyFromCoords(coords);
		delete startingPos[key];
	}
        
	function spawnRookTower(startingPos, xStart, yStart, dist) {
        
		// First wall with 4 bishops
		startingPos[coordutil.getKeyFromCoords([xStart,yStart])] = r.PAWN + e.W;
		startingPos[coordutil.getKeyFromCoords([xStart,yStart + 1])] = r.PAWN + e.B;
		startingPos[coordutil.getKeyFromCoords([xStart,yStart + 2])] = r.PAWN + e.W;
		if (yStart + 3 <= dist) startingPos[coordutil.getKeyFromCoords([xStart,yStart + 3])] = r.PAWN + e.B;
		if (yStart + 6 <= dist) startingPos[coordutil.getKeyFromCoords([xStart,yStart + 6])] = r.PAWN + e.W;
		if (yStart + 7 <= dist) startingPos[coordutil.getKeyFromCoords([xStart,yStart + 7])] = r.PAWN + e.B;
		if (yStart + 8 <= dist) startingPos[coordutil.getKeyFromCoords([xStart,yStart + 8])] = r.BISHOP + e.W;
		if (yStart + 9 <= dist) startingPos[coordutil.getKeyFromCoords([xStart,yStart + 9])] = r.PAWN + e.W;
		if (yStart + 10 <= dist) startingPos[coordutil.getKeyFromCoords([xStart,yStart + 10])] = r.BISHOP + e.W;
		if (yStart + 12 <= dist) startingPos[coordutil.getKeyFromCoords([xStart,yStart + 12])] = r.BISHOP + e.W;
		if (yStart + 14 <= dist) startingPos[coordutil.getKeyFromCoords([xStart,yStart + 14])] = r.BISHOP + e.W;
		appendPawnTower(startingPos, xStart, yStart + 16, dist);
        
		// Second wall with rook
		startingPos[coordutil.getKeyFromCoords([xStart + 1,yStart + 1])] = r.PAWN + e.W;
		startingPos[coordutil.getKeyFromCoords([xStart + 1,yStart + 2])] = r.PAWN + e.B;
		if (yStart + 3 <= dist) startingPos[coordutil.getKeyFromCoords([xStart + 1,yStart + 3])] = r.PAWN + e.W;
		if (yStart + 4 <= dist) startingPos[coordutil.getKeyFromCoords([xStart + 1,yStart + 4])] = r.PAWN + e.B;
		if (yStart + 7 <= dist) startingPos[coordutil.getKeyFromCoords([xStart + 1,yStart + 7])] = r.PAWN + e.W;
		if (yStart + 8 <= dist) startingPos[coordutil.getKeyFromCoords([xStart + 1,yStart + 8])] = r.PAWN + e.B;
		if (yStart + 9 <= dist) startingPos[coordutil.getKeyFromCoords([xStart + 1,yStart + 9])] = r.BISHOP + e.W;
		if (yStart + 11 <= dist) startingPos[coordutil.getKeyFromCoords([xStart + 1,yStart + 11])] = r.BISHOP + e.W;
		if (yStart + 13 <= dist) startingPos[coordutil.getKeyFromCoords([xStart + 1,yStart + 13])] = r.BISHOP + e.W;
		if (yStart + 15 <= dist) startingPos[coordutil.getKeyFromCoords([xStart + 1,yStart + 15])] = r.BISHOP + e.W;
		if (yStart + 16 <= dist) startingPos[coordutil.getKeyFromCoords([xStart + 1,yStart + 16])] = r.ROOK + e.B;
        
		// Third pawn wall
		startingPos[coordutil.getKeyFromCoords([xStart + 2,yStart + 2])] = r.PAWN + e.W;
		if (yStart + 3 <= dist) startingPos[coordutil.getKeyFromCoords([xStart + 2,yStart + 3])] = r.PAWN + e.B;
		if (yStart + 4 <= dist) startingPos[coordutil.getKeyFromCoords([xStart + 2,yStart + 4])] = r.PAWN + e.W;
		if (yStart + 5 <= dist) startingPos[coordutil.getKeyFromCoords([xStart + 2,yStart + 5])] = r.PAWN + e.B;
		if (yStart + 8 <= dist) startingPos[coordutil.getKeyFromCoords([xStart + 2,yStart + 8])] = r.PAWN + e.W;
		if (yStart + 9 <= dist) startingPos[coordutil.getKeyFromCoords([xStart + 2,yStart + 9])] = r.PAWN + e.B;
		if (yStart + 10 <= dist) startingPos[coordutil.getKeyFromCoords([xStart + 2,yStart + 10])] = r.PAWN + e.W;
		if (yStart + 11 <= dist) startingPos[coordutil.getKeyFromCoords([xStart + 2,yStart + 11])] = r.PAWN + e.W;
		if (yStart + 12 <= dist) startingPos[coordutil.getKeyFromCoords([xStart + 2,yStart + 12])] = r.PAWN + e.W;
		if (yStart + 13 <= dist) startingPos[coordutil.getKeyFromCoords([xStart + 2,yStart + 13])] = r.PAWN + e.W;
		if (yStart + 14 <= dist) startingPos[coordutil.getKeyFromCoords([xStart + 2,yStart + 14])] = r.PAWN + e.W;
		if (yStart + 15 <= dist) startingPos[coordutil.getKeyFromCoords([xStart + 2,yStart + 15])] = r.PAWN + e.B;
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
		startingPos[coordutil.getKeyFromCoords([x,y])] = r.PAWN + e.B;
		startingPos[coordutil.getKeyFromCoords([x,y - 1])] = r.PAWN + e.W;
		startingPos[coordutil.getKeyFromCoords([x + 1,y - 1])] = r.PAWN + e.B;
		startingPos[coordutil.getKeyFromCoords([x + 1,y - 2])] = r.PAWN + e.W;
		startingPos[coordutil.getKeyFromCoords([x + 2,y - 2])] = r.PAWN + e.B;
		startingPos[coordutil.getKeyFromCoords([x + 2,y - 3])] = r.PAWN + e.W;
		if (y - 3 - x + 3 > -980) startingPos[coordutil.getKeyFromCoords([x + 3,y - 3])] = r.PAWN + e.B;
		if (y - 4 - x + 3 > -980) startingPos[coordutil.getKeyFromCoords([x + 3,y - 4])] = r.PAWN + e.W;
		if (y - 5 - x + 4 > -980) startingPos[coordutil.getKeyFromCoords([x + 4,y - 4])] = r.PAWN + e.B;
		if (y - 3 - x + 4 > -980) startingPos[coordutil.getKeyFromCoords([x + 4,y - 5])] = r.PAWN + e.W;
		if (y - 4 - x + 5 > -980) startingPos[coordutil.getKeyFromCoords([x + 5,y - 3])] = r.PAWN + e.B;
		if (y - 4 - x + 5 > -980) startingPos[coordutil.getKeyFromCoords([x + 5,y - 4])] = r.PAWN + e.W;
		if (y - 2 - x + 6 > -980) startingPos[coordutil.getKeyFromCoords([x + 6,y - 2])] = r.PAWN + e.B;
		if (y - 3 - x + 6 > -980) startingPos[coordutil.getKeyFromCoords([x + 6,y - 3])] = r.PAWN + e.W;
		if (y - 1 - x + 7 > -980) startingPos[coordutil.getKeyFromCoords([x + 7,y - 1])] = r.PAWN + e.B;
		if (y - 2 - x + 7 > -980) startingPos[coordutil.getKeyFromCoords([x + 7,y - 2])] = r.PAWN + e.W;
		if (y + 1 - x + 7 > -980) startingPos[coordutil.getKeyFromCoords([x + 7,y + 1])] = r.PAWN + e.B;
		if (y + 0 - x + 7 > -980) startingPos[coordutil.getKeyFromCoords([x + 7,y + 0])] = r.PAWN + e.W;
		if (y - 2 - x + 8 > -980) startingPos[coordutil.getKeyFromCoords([x + 8,y - 2])] = r.BISHOP + e.B;
        
		if (y - 6 - x + 6 > -980) startingPos[coordutil.getKeyFromCoords([x + 6,y - 6])] = r.PAWN + e.B;
		if (y - 7 - x + 6 > -980) startingPos[coordutil.getKeyFromCoords([x + 6,y - 7])] = r.PAWN + e.W;
		if (y - 5 - x + 7 > -980) startingPos[coordutil.getKeyFromCoords([x + 7,y - 5])] = r.PAWN + e.B;
		if (y - 6 - x + 7 > -980) startingPos[coordutil.getKeyFromCoords([x + 7,y - 6])] = r.PAWN + e.W;
		if (y - 4 - x + 8 > -980) startingPos[coordutil.getKeyFromCoords([x + 8,y - 4])] = r.PAWN + e.B;
		if (y - 5 - x + 8 > -980) startingPos[coordutil.getKeyFromCoords([x + 8,y - 5])] = r.PAWN + e.W;
		if (y - 3 - x + 9 > -980) startingPos[coordutil.getKeyFromCoords([x + 9,y - 3])] = r.PAWN + e.B;
		if (y - 4 - x + 9 > -980) startingPos[coordutil.getKeyFromCoords([x + 9,y - 4])] = r.PAWN + e.W;

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
			startingPos[coordutil.getKeyFromCoords([pawnX,pawnY])] = r.PAWN + e.W;

			pawnX++;
			pawnY++;
		}
	}

	function genBishopPuzzlePiece(startingPos, x, y, isLastIndex) {
		startingPos[coordutil.getKeyFromCoords([x,y])] = r.PAWN + e.B;
		startingPos[coordutil.getKeyFromCoords([x,y - 1])] = r.PAWN + e.W;
		startingPos[coordutil.getKeyFromCoords([x,y - 2])] = r.BISHOP + e.B;
		startingPos[coordutil.getKeyFromCoords([x + 1,y - 2])] = r.PAWN + e.B;
		startingPos[coordutil.getKeyFromCoords([x + 1,y - 3])] = r.BISHOP + e.B;
		startingPos[coordutil.getKeyFromCoords([x + 2,y - 4])] = r.PAWN + e.B;
		startingPos[coordutil.getKeyFromCoords([x + 2,y - 5])] = r.PAWN + e.W;

		if (!isLastIndex) return;

		// Is last index
		startingPos[coordutil.getKeyFromCoords([x + 1,y - 2])] = r.PAWN + e.W;
		startingPos[coordutil.getKeyFromCoords([x + 1,y - 1])] = r.PAWN + e.B;
		startingPos[coordutil.getKeyFromCoords([x + 2,y - 3])] = r.PAWN + e.W;
		startingPos[coordutil.getKeyFromCoords([x + 2,y - 2])] = r.PAWN + e.B;
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
		startingPos[coordutil.getKeyFromCoords([x,y])] = r.PAWN + e.B;
		startingPos[coordutil.getKeyFromCoords([x,y - 1])] = r.PAWN + e.W;
		startingPos[coordutil.getKeyFromCoords([x - 1,y - 1])] = r.PAWN + e.B;
		startingPos[coordutil.getKeyFromCoords([x - 1,y - 2])] = r.PAWN + e.W;
		startingPos[coordutil.getKeyFromCoords([x - 2,y - 2])] = r.PAWN + e.B;
		startingPos[coordutil.getKeyFromCoords([x - 2,y - 3])] = r.PAWN + e.W;
		startingPos[coordutil.getKeyFromCoords([x - 3,y - 3])] = r.PAWN + e.B;
		startingPos[coordutil.getKeyFromCoords([x - 3,y - 4])] = r.PAWN + e.W;
		startingPos[coordutil.getKeyFromCoords([x - 4,y - 4])] = r.PAWN + e.B;
		startingPos[coordutil.getKeyFromCoords([x - 4,y - 5])] = r.PAWN + e.W;
        
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
		startingPos[coordutil.getKeyFromCoords([x,y - 2])] = r.PAWN + e.W;
		startingPos[coordutil.getKeyFromCoords([x,y - 1])] = r.PAWN + e.B;
		startingPos[coordutil.getKeyFromCoords([x - 1,y - 1])] = r.PAWN + e.W;
		startingPos[coordutil.getKeyFromCoords([x - 1,y + 0])] = r.PAWN + e.B;
		startingPos[coordutil.getKeyFromCoords([x - 2,y + 0])] = r.PAWN + e.W;
		startingPos[coordutil.getKeyFromCoords([x - 2,y + 1])] = r.PAWN + e.B;
		startingPos[coordutil.getKeyFromCoords([x - 3,y + 1])] = r.PAWN + e.W;
		startingPos[coordutil.getKeyFromCoords([x - 3,y + 2])] = r.PAWN + e.B;
		startingPos[coordutil.getKeyFromCoords([x - 4,y + 2])] = r.PAWN + e.W;
		startingPos[coordutil.getKeyFromCoords([x - 4,y + 3])] = r.PAWN + e.B;
		startingPos[coordutil.getKeyFromCoords([x - 5,y + 3])] = r.PAWN + e.W;
		startingPos[coordutil.getKeyFromCoords([x - 5,y + 4])] = r.PAWN + e.B;

		startingPos[coordutil.getKeyFromCoords([x,y + 2])] = r.PAWN + e.W;
		startingPos[coordutil.getKeyFromCoords([x,y + 3])] = r.PAWN + e.B;
		startingPos[coordutil.getKeyFromCoords([x - 1,y + 3])] = r.PAWN + e.W;
		startingPos[coordutil.getKeyFromCoords([x - 1,y + 4])] = r.PAWN + e.B;
		startingPos[coordutil.getKeyFromCoords([x - 2,y + 4])] = r.PAWN + e.W;
		startingPos[coordutil.getKeyFromCoords([x - 2,y + 5])] = r.PAWN + e.B;
		startingPos[coordutil.getKeyFromCoords([x - 2,y + 6])] = r.PAWN + e.W;
		startingPos[coordutil.getKeyFromCoords([x - 2,y + 7])] = r.PAWN + e.W;
		startingPos[coordutil.getKeyFromCoords([x - 2,y + 8])] = r.PAWN + e.W;
		startingPos[coordutil.getKeyFromCoords([x - 2,y + 9])] = r.PAWN + e.B;
		startingPos[coordutil.getKeyFromCoords([x - 2,y + 10])] = r.PAWN + e.W;
		startingPos[coordutil.getKeyFromCoords([x - 2,y + 11])] = r.PAWN + e.B;
		startingPos[coordutil.getKeyFromCoords([x - 3,y + 11])] = r.PAWN + e.W;
		startingPos[coordutil.getKeyFromCoords([x - 3,y + 12])] = r.PAWN + e.B;
		startingPos[coordutil.getKeyFromCoords([x - 4,y + 12])] = r.PAWN + e.W;
		startingPos[coordutil.getKeyFromCoords([x - 4,y + 13])] = r.PAWN + e.B;
		startingPos[coordutil.getKeyFromCoords([x - 5,y + 11])] = r.PAWN + e.W;
		startingPos[coordutil.getKeyFromCoords([x - 5,y + 12])] = r.PAWN + e.B;
		startingPos[coordutil.getKeyFromCoords([x - 5,y + 10])] = r.PAWN + e.B;
		startingPos[coordutil.getKeyFromCoords([x - 5,y + 9])] = r.PAWN + e.W;
		startingPos[coordutil.getKeyFromCoords([x - 5,y + 8])] = r.PAWN + e.B;
		startingPos[coordutil.getKeyFromCoords([x - 5,y + 7])] = r.PAWN + e.W;
		startingPos[coordutil.getKeyFromCoords([x - 4,y + 7])] = r.PAWN + e.B;
		startingPos[coordutil.getKeyFromCoords([x - 4,y + 6])] = r.PAWN + e.W;
		startingPos[coordutil.getKeyFromCoords([x - 4,y + 10])] = r.BISHOP + e.W;

		if (!isLastIndex) return;

		// Is last wing segment!
		startingPos[coordutil.getKeyFromCoords([x - 5,y + 6])] = r.PAWN + e.B;
		startingPos[coordutil.getKeyFromCoords([x - 5,y + 5])] = r.PAWN + e.W;
	}
}

function addVoidSquaresToOmegaFourth(startingPos, left, top, right, bottomright, bottomleft) {

	for (let x = left; x <= right; x++) {
		const key = coordutil.getKeyFromCoords([x,top]);
		startingPos[key] = r.VOID + e.N;
	}
	for (let y = top; y >= bottomright; y--) {
		const key = coordutil.getKeyFromCoords([right,y]);
		startingPos[key] = r.VOID + e.N;
	}

	let y = bottomright;
	for (let x = right; x >= -3; x--) {
		let key = coordutil.getKeyFromCoords([x,y]);
		startingPos[key] = r.VOID + e.N;
		key = coordutil.getKeyFromCoords([x,y - 1]);
		startingPos[key] = r.VOID + e.N;
		y--;
	}

	for (let y = top; y >= bottomleft; y--) {
		const key = coordutil.getKeyFromCoords([left,y]);
		startingPos[key] = r.VOID + e.N;
	}
	y = bottomleft;
	for (let x = left; x <= -4; x++) {
		let key = coordutil.getKeyFromCoords([x,y]);
		startingPos[key] = r.VOID + e.N;
		key = coordutil.getKeyFromCoords([x,y - 1]);
		startingPos[key] = r.VOID + e.N;
		y--;
	}

	startingPos[`492,493`] = r.VOID + e.N;
}

export default {
	genPositionOfOmegaFourth
};