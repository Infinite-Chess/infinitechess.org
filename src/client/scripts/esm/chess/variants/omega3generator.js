
import coordutil from '../util/coordutil.js';
import { ext as e, rawTypes as r } from '../config.js';

/** 
 * Type Definitions 
 * @typedef {import('../../util/math.js').BoundingBox} BoundingBox
 */

'use strict';


/**
 * Generates the Omega^3 position example
 * @returns {Object} The position in keys format
 */
function genPositionOfOmegaCubed() {

	const dist = 500; // Generate Omega^3 up to a distance of 1000 tiles away

	const startingPos = { };

	startingPos[coordutil.getKeyFromCoords([3,15])] = r.KING + e.W;
	startingPos[coordutil.getKeyFromCoords([4,13])] = r.ROOK + e.B;

	// First few pawn walls
	appendPawnTower(startingPos, 7, -dist, dist);
	appendPawnTower(startingPos, 8, -dist, dist);

	// Third pawn wall
	appendPawnTower(startingPos, 9, -dist, dist);
	startingPos[coordutil.getKeyFromCoords([9,10])] = r.BISHOP + e.W; // Overwrite with bishop
	setAir(startingPos, [9,11]);

	// Black king wall
	appendPawnTower(startingPos, 10, -dist, dist);
	startingPos[coordutil.getKeyFromCoords([10,12])] = r.KING + e.B; // Overwrite with king

	// Spawn rook towers
	spawnAllRookTowers(startingPos, 11, 8, dist, dist);

	startingPos[coordutil.getKeyFromCoords([11,6])] = r.BISHOP + e.W;
	appendPawnTower(startingPos, 11, -dist, 5);

	appendPawnTower(startingPos, 12, -dist, 7);
	startingPos[coordutil.getKeyFromCoords([12,8])] = r.PAWN + e.B;

	startingPos[coordutil.getKeyFromCoords([13,9])] = r.PAWN + e.B;
	startingPos[coordutil.getKeyFromCoords([13,8])] = r.PAWN + e.W;
	startingPos[coordutil.getKeyFromCoords([13,6])] = r.BISHOP + e.B;

	startingPos[coordutil.getKeyFromCoords([14,10])] = r.PAWN + e.B;
	startingPos[coordutil.getKeyFromCoords([14,9])] = r.PAWN + e.W;
	startingPos[coordutil.getKeyFromCoords([14,6])] = r.PAWN + e.B;
	startingPos[coordutil.getKeyFromCoords([14,5])] = r.PAWN + e.B;
	startingPos[coordutil.getKeyFromCoords([14,4])] = r.PAWN + e.W;

	genBishopTunnel(startingPos, 15, 6, dist, dist);

	surroundPositionInVoidBox(startingPos, { left: -500, right: 500, bottom: -500, top: 500 });
	startingPos[`499,492`] = r.VOID + e.N;
	startingPos[`7,-500`] = r.PAWN + e.W;
	startingPos[`8,-500`] = r.PAWN + e.W;
	startingPos[`9,-500`] = r.PAWN + e.W;
	startingPos[`10,-500`] = r.PAWN + e.W;
	startingPos[`11,-500`] = r.PAWN + e.W;
	startingPos[`12,-500`] = r.PAWN + e.W;
	startingPos[`6,-501`] = r.VOID + e.N;
	startingPos[`7,-501`] = r.VOID + e.N;
	startingPos[`8,-501`] = r.VOID + e.N;
	startingPos[`9,-501`] = r.VOID + e.N;
	startingPos[`10,-501`] = r.VOID + e.N;
	startingPos[`11,-501`] = r.VOID + e.N;
	startingPos[`12,-501`] = r.VOID + e.N;
	startingPos[`13,-501`] = r.VOID + e.N;

	// Bishop box that prevents black stalemate ideas
	startingPos[`497,-497`] = r.VOID + e.N;
	startingPos[`498,-497`] = r.VOID + e.N;
	startingPos[`499,-497`] = r.VOID + e.N;
	startingPos[`497,-498`] = r.VOID + e.N;
	startingPos[`497,-499`] = r.VOID + e.N;
	startingPos[`498,-498`] = r.VOID + e.N;
	startingPos[`499,-499`] = r.VOID + e.N;
	startingPos[`498,-499`] = r.BISHOP + e.B;

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
		startingPos[coordutil.getKeyFromCoords([xStart,yStart])] = r.BISHOP + e.W;
		startingPos[coordutil.getKeyFromCoords([xStart,yStart + 1])] = r.PAWN + e.W;
		startingPos[coordutil.getKeyFromCoords([xStart,yStart + 2])] = r.BISHOP + e.W;
		startingPos[coordutil.getKeyFromCoords([xStart,yStart + 4])] = r.BISHOP + e.W;
		startingPos[coordutil.getKeyFromCoords([xStart,yStart + 6])] = r.BISHOP + e.W;
		appendPawnTower(startingPos, xStart, yStart + 8, dist);
        
		// Second wall with rook
		startingPos[coordutil.getKeyFromCoords([xStart + 1,yStart + 1])] = r.BISHOP + e.W;
		startingPos[coordutil.getKeyFromCoords([xStart + 1,yStart + 3])] = r.BISHOP + e.W;
		startingPos[coordutil.getKeyFromCoords([xStart + 1,yStart + 5])] = r.BISHOP + e.W;
		if (yStart + 7 <= dist) startingPos[coordutil.getKeyFromCoords([xStart + 1,yStart + 7])] = r.BISHOP + e.W;
		if (yStart + 8 <= dist) startingPos[coordutil.getKeyFromCoords([xStart + 1,yStart + 8])] = r.ROOK + e.B;
        
		// Third pawn wall
		appendPawnTower(startingPos, xStart + 2, yStart + 2, dist);
		if (yStart + 7 <= dist) startingPos[coordutil.getKeyFromCoords([xStart + 2,yStart + 7])] = r.PAWN + e.B;
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
			startingPos[coordutil.getKeyFromCoords([x,y])] = r.PAWN + e.W;
			startingPos[coordutil.getKeyFromCoords([x,y + 1])] = r.PAWN + e.B;
			startingPos[coordutil.getKeyFromCoords([x,y + 4])] = r.PAWN + e.W;
			startingPos[coordutil.getKeyFromCoords([x,y + 5])] = r.PAWN + e.B;
        
			y++; // Increment y as well!
			if (y > yEnd) return;
		}
	}
}

/**
 * Adds a huge void square around the provided pieces by key.
 * Then deletes any pieces outside it.
 * @param {Object} position - The position, in key format: `{ '1,2':r.PAWN + e.W }`
 * @param {BoundingBox} box - The rectangle to which to form the void box.
 */
function surroundPositionInVoidBox(position, box) {
	for (let x = box.left; x <= box.right; x++) {
		let key = coordutil.getKeyFromCoords([x,box.bottom]);
		position[key] = r.VOID + e.N;
		key = coordutil.getKeyFromCoords([x,box.top]);
		position[key] = r.VOID + e.N;
	}
	for (let y = box.bottom; y <= box.top; y++) {
		let key = coordutil.getKeyFromCoords([box.left, y]);
		position[key] = r.VOID + e.N;
		key = coordutil.getKeyFromCoords([box.right, y]);
		position[key] = r.VOID + e.N;
	}
}

export default {
	genPositionOfOmegaCubed,
};