
import coordutil from '../misc/coordutil.js';

/** 
 * Type Definitions 
 * @typedef {import('../misc/math.js').BoundingBox} BoundingBox
 */

'use strict';


/**
 * Generates the Omega^3 position example
 * @returns {Object} The position in keys format
 */
function genPositionOfOmegaCubed() {

	const dist = 500; // Generate Omega^3 up to a distance of 1000 tiles away

	const startingPos = { };

	startingPos[coordutil.getKeyFromCoords([3,15])] = 'kingsW';
	startingPos[coordutil.getKeyFromCoords([4,13])] = 'rooksB';

	// First few pawn walls
	appendPawnTower(startingPos, 7, -dist, dist);
	appendPawnTower(startingPos, 8, -dist, dist);

	// Third pawn wall
	appendPawnTower(startingPos, 9, -dist, dist);
	startingPos[coordutil.getKeyFromCoords([9,10])] = 'bishopsW'; // Overwrite with bishop
	setAir(startingPos, [9,11]);

	// Black king wall
	appendPawnTower(startingPos, 10, -dist, dist);
	startingPos[coordutil.getKeyFromCoords([10,12])] = 'kingsB'; // Overwrite with king

	// Spawn rook towers
	spawnAllRookTowers(startingPos, 11, 8, dist, dist);

	startingPos[coordutil.getKeyFromCoords([11,6])] = 'bishopsW';
	appendPawnTower(startingPos, 11, -dist, 5);

	appendPawnTower(startingPos, 12, -dist, 7);
	startingPos[coordutil.getKeyFromCoords([12,8])] = 'pawnsB';

	startingPos[coordutil.getKeyFromCoords([13,9])] = 'pawnsB';
	startingPos[coordutil.getKeyFromCoords([13,8])] = 'pawnsW';
	startingPos[coordutil.getKeyFromCoords([13,6])] = 'bishopsB';

	startingPos[coordutil.getKeyFromCoords([14,10])] = 'pawnsB';
	startingPos[coordutil.getKeyFromCoords([14,9])] = 'pawnsW';
	startingPos[coordutil.getKeyFromCoords([14,6])] = 'pawnsB';
	startingPos[coordutil.getKeyFromCoords([14,5])] = 'pawnsB';
	startingPos[coordutil.getKeyFromCoords([14,4])] = 'pawnsW';

	genBishopTunnel(startingPos, 15, 6, dist, dist);

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

	function appendPawnTower(startingPos, x, startY, endY) {
		if (endY < startY) return; // Don't do negative pawn towers
        
		for (let y = startY; y <= endY; y++) {
			const thisCoords = [x,y];
			const key = coordutil.getKeyFromCoords(thisCoords);
			startingPos[key] = "pawnsW";
		}
	}
        
	function setAir(startingPos, coords) {
		const key = coordutil.getKeyFromCoords(coords);
		delete startingPos[key];
	}
        
	function spawnRookTower(startingPos, xStart, yStart, dist) {
        
		// First wall with 4 bishops
		startingPos[coordutil.getKeyFromCoords([xStart,yStart])] = 'bishopsW';
		startingPos[coordutil.getKeyFromCoords([xStart,yStart + 1])] = 'pawnsW';
		startingPos[coordutil.getKeyFromCoords([xStart,yStart + 2])] = 'bishopsW';
		startingPos[coordutil.getKeyFromCoords([xStart,yStart + 4])] = 'bishopsW';
		startingPos[coordutil.getKeyFromCoords([xStart,yStart + 6])] = 'bishopsW';
		appendPawnTower(startingPos, xStart, yStart + 8, dist);
        
		// Second wall with rook
		startingPos[coordutil.getKeyFromCoords([xStart + 1,yStart + 1])] = 'bishopsW';
		startingPos[coordutil.getKeyFromCoords([xStart + 1,yStart + 3])] = 'bishopsW';
		startingPos[coordutil.getKeyFromCoords([xStart + 1,yStart + 5])] = 'bishopsW';
		if (yStart + 7 <= dist) startingPos[coordutil.getKeyFromCoords([xStart + 1,yStart + 7])] = 'bishopsW';
		if (yStart + 8 <= dist) startingPos[coordutil.getKeyFromCoords([xStart + 1,yStart + 8])] = 'rooksB';
        
		// Third pawn wall
		appendPawnTower(startingPos, xStart + 2, yStart + 2, dist);
		if (yStart + 7 <= dist) startingPos[coordutil.getKeyFromCoords([xStart + 2,yStart + 7])] = 'pawnsB';
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
			startingPos[coordutil.getKeyFromCoords([x,y])] = 'pawnsW';
			startingPos[coordutil.getKeyFromCoords([x,y + 1])] = 'pawnsB';
			startingPos[coordutil.getKeyFromCoords([x,y + 4])] = 'pawnsW';
			startingPos[coordutil.getKeyFromCoords([x,y + 5])] = 'pawnsB';
        
			y++; // Increment y as well!
			if (y > yEnd) return;
		}
	}
}

/**
 * Adds a huge void square around the provided pieces by key.
 * Then deletes any pieces outside it.
 * @param {Object} position - The position, in key format: `{ '1,2':'pawnsW' }`
 * @param {BoundingBox} box - The rectangle to which to form the void box.
 */
function surroundPositionInVoidBox(position, box) {
	for (let x = box.left; x <= box.right; x++) {
		let key = coordutil.getKeyFromCoords([x,box.bottom]);
		position[key] = 'voidsN';
		key = coordutil.getKeyFromCoords([x,box.top]);
		position[key] = 'voidsN';
	}
	for (let y = box.bottom; y <= box.top; y++) {
		let key = coordutil.getKeyFromCoords([box.left, y]);
		position[key] = 'voidsN';
		key = coordutil.getKeyFromCoords([box.right, y]);
		position[key] = 'voidsN';
	}
}

export default {
	genPositionOfOmegaCubed,
};