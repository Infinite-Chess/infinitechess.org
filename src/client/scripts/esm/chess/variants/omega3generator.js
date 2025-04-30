
import coordutil from '../util/coordutil.js';
import { ext as e, rawTypes as r } from '../util/typeutil.js';

/** 
 * Type Definitions 
 * @typedef {import('../../util/math.js').BoundingBox} BoundingBox
 * @typedef {import('../util/coordutil.js').CoordsKey} CoordsKey
 */

'use strict';


/**
 * Generates the Omega^3 position example
 * @returns {Map<CoordsKey, number>} The position in keys format
 */
function genPositionOfOmegaCubed() {

	const dist = 500; // Generate Omega^3 up to a distance of 1000 tiles away

	const startingPos = new Map();

	startingPos.set(coordutil.getKeyFromCoords([3,15]), r.KING + e.W);
	startingPos.set(coordutil.getKeyFromCoords([4,13]), r.ROOK + e.B);

	// First few pawn walls
	appendPawnTower(startingPos, 7, -dist, dist);
	appendPawnTower(startingPos, 8, -dist, dist);

	// Third pawn wall
	appendPawnTower(startingPos, 9, -dist, dist);
	startingPos.set(coordutil.getKeyFromCoords([9,10]), r.BISHOP + e.W); // Overwrite with bishop
	setAir(startingPos, [9,11]);

	// Black king wall
	appendPawnTower(startingPos, 10, -dist, dist);
	startingPos.set(coordutil.getKeyFromCoords([10,12]), r.KING + e.B); // Overwrite with king

	// Spawn rook towers
	spawnAllRookTowers(startingPos, 11, 8, dist, dist);

	startingPos.set(coordutil.getKeyFromCoords([11,6]), r.BISHOP + e.W);
	appendPawnTower(startingPos, 11, -dist, 5);

	appendPawnTower(startingPos, 12, -dist, 7);
	startingPos.set(coordutil.getKeyFromCoords([12,8]), r.PAWN + e.B);

	startingPos.set(coordutil.getKeyFromCoords([13,9]), r.PAWN + e.B);
	startingPos.set(coordutil.getKeyFromCoords([13,8]), r.PAWN + e.W);
	startingPos.set(coordutil.getKeyFromCoords([13,6]), r.BISHOP + e.B);

	startingPos.set(coordutil.getKeyFromCoords([14,10]), r.PAWN + e.B);
	startingPos.set(coordutil.getKeyFromCoords([14,9]), r.PAWN + e.W);
	startingPos.set(coordutil.getKeyFromCoords([14,6]), r.PAWN + e.B);
	startingPos.set(coordutil.getKeyFromCoords([14,5]), r.PAWN + e.B);
	startingPos.set(coordutil.getKeyFromCoords([14,4]), r.PAWN + e.W);

	genBishopTunnel(startingPos, 15, 6, dist, dist);

	surroundPositionInVoidBox(startingPos, { left: -500, right: 500, bottom: -500, top: 500 });
	startingPos.set(`499,492`, r.VOID + e.N);
	startingPos.set(`7,-500`, r.PAWN + e.W);
	startingPos.set(`8,-500`, r.PAWN + e.W);
	startingPos.set(`9,-500`, r.PAWN + e.W);
	startingPos.set(`10,-500`, r.PAWN + e.W);
	startingPos.set(`11,-500`, r.PAWN + e.W);
	startingPos.set(`12,-500`, r.PAWN + e.W);
	startingPos.set(`6,-501`, r.VOID + e.N);
	startingPos.set(`7,-501`, r.VOID + e.N);
	startingPos.set(`8,-501`, r.VOID + e.N);
	startingPos.set(`9,-501`, r.VOID + e.N);
	startingPos.set(`10,-501`, r.VOID + e.N);
	startingPos.set(`11,-501`, r.VOID + e.N);
	startingPos.set(`12,-501`, r.VOID + e.N);
	startingPos.set(`13,-501`, r.VOID + e.N);

	// Bishop box that prevents black stalemate ideas
	startingPos.set(`497,-497`, r.VOID + e.N);
	startingPos.set(`498,-497`, r.VOID + e.N);
	startingPos.set(`499,-497`, r.VOID + e.N);
	startingPos.set(`497,-498`, r.VOID + e.N);
	startingPos.set(`497,-499`, r.VOID + e.N);
	startingPos.set(`498,-498`, r.VOID + e.N);
	startingPos.set(`499,-499`, r.VOID + e.N);
	startingPos.set(`498,-499`, r.BISHOP + e.B);

	return startingPos;

	function appendPawnTower(position, x, startY, endY) {
		if (endY < startY) return; // Don't do negative pawn towers
		for (let y = startY; y <= endY; y++) {
			const thisCoords = [x, y];
			const key = coordutil.getKeyFromCoords(thisCoords);
			position.set(key, r.PAWN + e.W);
		}
	}
		
	function setAir(position, coords) {
		const key = coordutil.getKeyFromCoords(coords);
		position.delete(key);
	}
		
	function spawnRookTower(position, xStart, yStart, dist) {
		// First wall with 4 bishops
		position.set(coordutil.getKeyFromCoords([xStart, yStart]), r.BISHOP + e.W);
		position.set(coordutil.getKeyFromCoords([xStart, yStart + 1]), r.PAWN + e.W);
		position.set(coordutil.getKeyFromCoords([xStart, yStart + 2]), r.BISHOP + e.W);
		position.set(coordutil.getKeyFromCoords([xStart, yStart + 4]), r.BISHOP + e.W);
		position.set(coordutil.getKeyFromCoords([xStart, yStart + 6]), r.BISHOP + e.W);
		appendPawnTower(position, xStart, yStart + 8, dist);
		
		// Second wall with rook
		position.set(coordutil.getKeyFromCoords([xStart + 1, yStart + 1]), r.BISHOP + e.W);
		position.set(coordutil.getKeyFromCoords([xStart + 1, yStart + 3]), r.BISHOP + e.W);
		position.set(coordutil.getKeyFromCoords([xStart + 1, yStart + 5]), r.BISHOP + e.W);
		if (yStart + 7 <= dist) position.set(coordutil.getKeyFromCoords([xStart + 1, yStart + 7]), r.BISHOP + e.W);
		if (yStart + 8 <= dist) position.set(coordutil.getKeyFromCoords([xStart + 1, yStart + 8]), r.ROOK + e.B);
		
		// Third pawn wall
		appendPawnTower(position, xStart + 2, yStart + 2, dist);
		if (yStart + 7 <= dist) position.set(coordutil.getKeyFromCoords([xStart + 2, yStart + 7]), r.PAWN + e.B);
	}
	
	function spawnAllRookTowers(position, xStart, yStart, xEnd, yEnd) {
		let y = yStart;
		for (let x = xStart; x < xEnd; x += 3) {
			spawnRookTower(position, x, y, yEnd);
			y += 3; // Increment y as well!
		}
	}
	
	function genBishopTunnel(position, xStart, yStart, xEnd, yEnd) {
		let y = yStart;
		for (let x = xStart; x < xEnd; x++) {
			position.set(coordutil.getKeyFromCoords([x, y]), r.PAWN + e.W);
			position.set(coordutil.getKeyFromCoords([x, y + 1]), r.PAWN + e.B);
			position.set(coordutil.getKeyFromCoords([x, y + 4]), r.PAWN + e.W);
			position.set(coordutil.getKeyFromCoords([x, y + 5]), r.PAWN + e.B);
			y++; // Increment y as well!
			if (y > yEnd) return;
		}
	}
}

/**
 * Adds a huge void square around the provided pieces by key.
 * Then deletes any pieces outside it.
 * @param {Map<CoordsKey, number>} position - The position, in key format: Map with key/value pairs.
 * @param {BoundingBox} box - The rectangle to which to form the void box.
 */
function surroundPositionInVoidBox(position, box) {
	for (let x = box.left; x <= box.right; x++) {
		let key = coordutil.getKeyFromCoords([x, box.bottom]);
		position.set(key, r.VOID + e.N);
		key = coordutil.getKeyFromCoords([x, box.top]);
		position.set(key, r.VOID + e.N);
	}
	for (let y = box.bottom; y <= box.top; y++) {
		let key = coordutil.getKeyFromCoords([box.left, y]);
		position.set(key, r.VOID + e.N);
		key = coordutil.getKeyFromCoords([box.right, y]);
		position.set(key, r.VOID + e.N);
	}
}

export default {
	genPositionOfOmegaCubed,
};