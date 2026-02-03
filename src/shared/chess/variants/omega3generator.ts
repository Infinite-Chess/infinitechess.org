// src/shared/chess/variants/omega3generator.ts

/**
 * Here lies the position generator for the Omega^3 Showcase variant.
 */

import coordutil from '../util/coordutil.js';
import { ext as e, rawTypes as r } from '../util/typeutil.js';

import type { Coords, CoordsKey } from '../util/coordutil.js';
import type { BoundingBox } from '../../util/math/bounds.js';

/**
 * Generates the Omega^3 position example
 * @returns The position in keys format
 */
function genPositionOfOmegaCubed(): Map<CoordsKey, number> {
	const dist = 500n; // Generate Omega^3 up to a distance of 1000 tiles away

	const startingPos: Map<CoordsKey, number> = new Map();

	startingPos.set(coordutil.getKeyFromCoords([3n, 15n]), r.KING + e.W);
	startingPos.set(coordutil.getKeyFromCoords([4n, 13n]), r.ROOK + e.B);

	// First few pawn walls
	appendPawnTower(startingPos, 7n, -dist, dist);
	appendPawnTower(startingPos, 8n, -dist, dist);

	// Third pawn wall
	appendPawnTower(startingPos, 9n, -dist, dist);
	startingPos.set(coordutil.getKeyFromCoords([9n, 10n]), r.BISHOP + e.W); // Overwrite with bishop
	setAir(startingPos, [9n, 11n]);

	// Black king wall
	appendPawnTower(startingPos, 10n, -dist, dist);
	startingPos.set(coordutil.getKeyFromCoords([10n, 12n]), r.KING + e.B); // Overwrite with king

	// Spawn rook towers
	spawnAllRookTowers(startingPos, 11n, 8n, dist, dist);

	startingPos.set(coordutil.getKeyFromCoords([11n, 6n]), r.BISHOP + e.W);
	appendPawnTower(startingPos, 11n, -dist, 5n);

	appendPawnTower(startingPos, 12n, -dist, 7n);
	startingPos.set(coordutil.getKeyFromCoords([12n, 8n]), r.PAWN + e.B);

	startingPos.set(coordutil.getKeyFromCoords([13n, 9n]), r.PAWN + e.B);
	startingPos.set(coordutil.getKeyFromCoords([13n, 8n]), r.PAWN + e.W);
	startingPos.set(coordutil.getKeyFromCoords([13n, 6n]), r.BISHOP + e.B);

	startingPos.set(coordutil.getKeyFromCoords([14n, 10n]), r.PAWN + e.B);
	startingPos.set(coordutil.getKeyFromCoords([14n, 9n]), r.PAWN + e.W);
	startingPos.set(coordutil.getKeyFromCoords([14n, 6n]), r.PAWN + e.B);
	startingPos.set(coordutil.getKeyFromCoords([14n, 5n]), r.PAWN + e.B);
	startingPos.set(coordutil.getKeyFromCoords([14n, 4n]), r.PAWN + e.W);

	genBishopTunnel(startingPos, 15n, 6n, dist, dist);

	surroundPositionInVoidBox(startingPos, { left: -500n, right: 500n, bottom: -500n, top: 500n });

	// Bottom blip of pawns to prevent black rook from capturing them
	startingPos.set(coordutil.getKeyFromCoords([499n, 492n]), r.VOID + e.N);
	startingPos.set(coordutil.getKeyFromCoords([7n, -500n]), r.PAWN + e.W);
	startingPos.set(coordutil.getKeyFromCoords([8n, -500n]), r.PAWN + e.W);
	startingPos.set(coordutil.getKeyFromCoords([9n, -500n]), r.PAWN + e.W);
	startingPos.set(coordutil.getKeyFromCoords([10n, -500n]), r.PAWN + e.W);
	startingPos.set(coordutil.getKeyFromCoords([11n, -500n]), r.PAWN + e.W);
	startingPos.set(coordutil.getKeyFromCoords([12n, -500n]), r.PAWN + e.W);
	startingPos.set(coordutil.getKeyFromCoords([6n, -501n]), r.VOID + e.N);
	startingPos.set(coordutil.getKeyFromCoords([7n, -501n]), r.VOID + e.N);
	startingPos.set(coordutil.getKeyFromCoords([8n, -501n]), r.VOID + e.N);
	startingPos.set(coordutil.getKeyFromCoords([9n, -501n]), r.VOID + e.N);
	startingPos.set(coordutil.getKeyFromCoords([10n, -501n]), r.VOID + e.N);
	startingPos.set(coordutil.getKeyFromCoords([11n, -501n]), r.VOID + e.N);
	startingPos.set(coordutil.getKeyFromCoords([12n, -501n]), r.VOID + e.N);
	startingPos.set(coordutil.getKeyFromCoords([13n, -501n]), r.VOID + e.N);

	// Bishop box that prevents black stalemate ideas
	startingPos.set(coordutil.getKeyFromCoords([497n, -497n]), r.VOID + e.N);
	startingPos.set(coordutil.getKeyFromCoords([498n, -497n]), r.VOID + e.N);
	startingPos.set(coordutil.getKeyFromCoords([499n, -497n]), r.VOID + e.N);
	startingPos.set(coordutil.getKeyFromCoords([497n, -498n]), r.VOID + e.N);
	startingPos.set(coordutil.getKeyFromCoords([497n, -499n]), r.VOID + e.N);
	startingPos.set(coordutil.getKeyFromCoords([498n, -498n]), r.VOID + e.N);
	startingPos.set(coordutil.getKeyFromCoords([499n, -499n]), r.VOID + e.N);
	startingPos.set(coordutil.getKeyFromCoords([498n, -499n]), r.BISHOP + e.B);

	return startingPos;

	function appendPawnTower(
		position: Map<CoordsKey, number>,
		x: bigint,
		startY: bigint,
		endY: bigint,
	): void {
		if (endY < startY) return; // Don't do negative pawn towers
		for (let y = startY; y <= endY; y++) {
			const thisCoords: Coords = [x, y];
			const key = coordutil.getKeyFromCoords(thisCoords);
			position.set(key, r.PAWN + e.W);
		}
	}

	function setAir(position: Map<CoordsKey, number>, coords: Coords): void {
		const key = coordutil.getKeyFromCoords(coords);
		position.delete(key);
	}

	function spawnRookTower(
		position: Map<CoordsKey, number>,
		xStart: bigint,
		yStart: bigint,
		dist: bigint,
	): void {
		// First wall with 4 bishops
		position.set(coordutil.getKeyFromCoords([xStart, yStart]), r.BISHOP + e.W);
		position.set(coordutil.getKeyFromCoords([xStart, yStart + 1n]), r.PAWN + e.W);
		position.set(coordutil.getKeyFromCoords([xStart, yStart + 2n]), r.BISHOP + e.W);
		position.set(coordutil.getKeyFromCoords([xStart, yStart + 4n]), r.BISHOP + e.W);
		position.set(coordutil.getKeyFromCoords([xStart, yStart + 6n]), r.BISHOP + e.W);
		appendPawnTower(position, xStart, yStart + 8n, dist);

		// Second wall with rook
		position.set(coordutil.getKeyFromCoords([xStart + 1n, yStart + 1n]), r.BISHOP + e.W);
		position.set(coordutil.getKeyFromCoords([xStart + 1n, yStart + 3n]), r.BISHOP + e.W);
		position.set(coordutil.getKeyFromCoords([xStart + 1n, yStart + 5n]), r.BISHOP + e.W);
		if (yStart + 7n <= dist)
			position.set(coordutil.getKeyFromCoords([xStart + 1n, yStart + 7n]), r.BISHOP + e.W);
		if (yStart + 8n <= dist)
			position.set(coordutil.getKeyFromCoords([xStart + 1n, yStart + 8n]), r.ROOK + e.B);

		// Third pawn wall
		appendPawnTower(position, xStart + 2n, yStart + 2n, dist);
		if (yStart + 7n <= dist)
			position.set(coordutil.getKeyFromCoords([xStart + 2n, yStart + 7n]), r.PAWN + e.B);
	}

	function spawnAllRookTowers(
		position: Map<CoordsKey, number>,
		xStart: bigint,
		yStart: bigint,
		xEnd: bigint,
		yEnd: bigint,
	): void {
		let y = yStart;
		for (let x = xStart; x < xEnd; x += 3n) {
			spawnRookTower(position, x, y, yEnd);
			y += 3n; // Increment y as well!
		}
	}

	function genBishopTunnel(
		position: Map<CoordsKey, number>,
		xStart: bigint,
		yStart: bigint,
		xEnd: bigint,
		yEnd: bigint,
	): void {
		let y = yStart;
		for (let x = xStart; x < xEnd; x++) {
			position.set(coordutil.getKeyFromCoords([x, y]), r.PAWN + e.W);
			position.set(coordutil.getKeyFromCoords([x, y + 1n]), r.PAWN + e.B);
			position.set(coordutil.getKeyFromCoords([x, y + 4n]), r.PAWN + e.W);
			position.set(coordutil.getKeyFromCoords([x, y + 5n]), r.PAWN + e.B);
			y++; // Increment y as well!
			if (y > yEnd) return;
		}
	}
}

/**
 * Adds a huge void square around the provided pieces by key.
 * Then deletes any pieces outside it.
 * @param position - The position, in key format: Map with key/value pairs.
 * @param box - The rectangle to which to form the void box.
 */
function surroundPositionInVoidBox(position: Map<CoordsKey, number>, box: BoundingBox): void {
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
