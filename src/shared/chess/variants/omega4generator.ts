// src/shared/chess/variants/omega4generator.ts

/**
 * Here lies the position generator for the Omega^4 Showcase variant.
 */

import { rawTypes as r, ext as e } from '../util/typeutil.js';
import coordutil, { CoordsKey, Coords } from '../util/coordutil.js';

/**
 * Generates the Omega^4 position example
 * @returns {Map<CoordsKey, number>} The position in Map format
 */
function genPositionOfOmegaFourth(): Map<CoordsKey, number> {
	const dist = 500n; // Generate Omega^4 up to a distance of 50 tiles away

	// Create a Map for the starting position.
	const startingPos: Map<CoordsKey, number> = new Map();

	// King chamber
	const kingChamber: Record<string, number> = {
		'-14,17': r.PAWN + e.W,
		'-14,18': r.PAWN + e.B,
		'-13,14': r.PAWN + e.W,
		'-13,15': r.PAWN + e.B,
		'-13,16': r.PAWN + e.W,
		'-13,17': r.PAWN + e.B,
		'-13,20': r.PAWN + e.W,
		'-13,21': r.PAWN + e.B,
		'-13,22': r.PAWN + e.W,
		'-13,23': r.PAWN + e.B,
		'-13,24': r.PAWN + e.W,
		'-13,25': r.PAWN + e.B,
		'-13,26': r.PAWN + e.W,
		'-13,27': r.PAWN + e.B,
		'-12,16': r.BISHOP + e.B,
		'-12,25': r.BISHOP + e.W,
		'-11,14': r.PAWN + e.W,
		'-11,15': r.PAWN + e.B,
		'-11,16': r.KING + e.B,
		'-11,17': r.PAWN + e.B,
		'-11,24': r.PAWN + e.W,
		'-11,25': r.KING + e.W,
		'-11,26': r.PAWN + e.W,
		'-11,27': r.PAWN + e.B,
		'-10,16': r.BISHOP + e.B,
		'-10,25': r.BISHOP + e.W,
		'-9,14': r.PAWN + e.W,
		'-9,15': r.PAWN + e.B,
		'-9,16': r.PAWN + e.W,
		'-9,17': r.PAWN + e.B,
		'-9,18': r.PAWN + e.W,
		'-9,19': r.PAWN + e.B,
		'-9,20': r.PAWN + e.W,
		'-9,21': r.PAWN + e.B,
		'-9,22': r.PAWN + e.W,
		'-9,23': r.PAWN + e.B,
		'-9,24': r.PAWN + e.W,
		'-9,25': r.PAWN + e.B,
		'-9,26': r.PAWN + e.W,
		'-9,27': r.PAWN + e.B,
	};
	for (const [key, value] of Object.entries(kingChamber)) {
		startingPos.set(key as CoordsKey, value);
	}

	// Rook towers
	const startOfRookTowers: Record<string, number> = {
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
	for (const [key, value] of Object.entries(startOfRookTowers)) {
		startingPos.set(key as CoordsKey, value);
	}

	appendPawnTower(startingPos, 0n, 13n, dist);
	appendPawnTower(startingPos, 2n, 13n, dist);
	appendPawnTower(startingPos, 3n, 16n, dist);
	appendPawnTower(startingPos, 5n, 16n, dist);

	spawnAllRookTowers(startingPos, 6n, 3n, dist + 3n, dist);

	// Bishop Cannon Battery
	startingPos.set(coordutil.getKeyFromCoords([0n, -6n]), r.PAWN + e.B);
	startingPos.set(coordutil.getKeyFromCoords([0n, -7n]), r.PAWN + e.W);

	spawnAllBishopCannons(startingPos, 1n, -7n, dist, -dist);
	spawnAllWings(startingPos, -1n, -7n, -dist, -dist);

	addVoidSquaresToOmegaFourth(startingPos, -866n, 500n, 567n, -426n, -134n);

	return startingPos;

	function appendPawnTower(
		startingPos: Map<CoordsKey, number>,
		x: bigint,
		startY: bigint,
		endY: bigint,
	): void {
		if (endY < startY) return; // Don't do negative pawn towers
		for (let y = startY; y <= endY; y++) {
			const thisCoords: Coords = [x, y];
			const key: CoordsKey = coordutil.getKeyFromCoords(thisCoords);
			startingPos.set(key, r.PAWN + e.W);
		}
	}

	function setAir(startingPos: Map<CoordsKey, number>, coords: Coords): void {
		const key: CoordsKey = coordutil.getKeyFromCoords(coords);
		startingPos.delete(key);
	}

	// prettier-ignore
	function spawnRookTower(
		startingPos: Map<CoordsKey, number>,
		xStart: bigint,
		yStart: bigint,
		dist: bigint,
	): void {
		// First wall with 4 bishops
		startingPos.set(coordutil.getKeyFromCoords([xStart, yStart]), r.PAWN + e.W);
		startingPos.set(coordutil.getKeyFromCoords([xStart, yStart + 1n]), r.PAWN + e.B);
		startingPos.set(coordutil.getKeyFromCoords([xStart, yStart + 2n]), r.PAWN + e.W);
		if (yStart + 3n <= dist) startingPos.set(coordutil.getKeyFromCoords([xStart, yStart + 3n]), r.PAWN + e.B);
		if (yStart + 6n <= dist) startingPos.set(coordutil.getKeyFromCoords([xStart, yStart + 6n]), r.PAWN + e.W);
		if (yStart + 7n <= dist) startingPos.set(coordutil.getKeyFromCoords([xStart, yStart + 7n]), r.PAWN + e.B);
		if (yStart + 8n <= dist) startingPos.set(coordutil.getKeyFromCoords([xStart, yStart + 8n]), r.BISHOP + e.W);
		if (yStart + 9n <= dist) startingPos.set(coordutil.getKeyFromCoords([xStart, yStart + 9n]), r.PAWN + e.W);
		if (yStart + 10n <= dist) startingPos.set(coordutil.getKeyFromCoords([xStart, yStart + 10n]), r.BISHOP + e.W);
		if (yStart + 12n <= dist) startingPos.set(coordutil.getKeyFromCoords([xStart, yStart + 12n]), r.BISHOP + e.W);
		if (yStart + 14n <= dist) startingPos.set(coordutil.getKeyFromCoords([xStart, yStart + 14n]), r.BISHOP + e.W);
		appendPawnTower(startingPos, xStart, yStart + 16n, dist);

		// Second wall with rook
		startingPos.set(coordutil.getKeyFromCoords([xStart + 1n, yStart + 1n]), r.PAWN + e.W);
		startingPos.set(coordutil.getKeyFromCoords([xStart + 1n, yStart + 2n]), r.PAWN + e.B);
		if (yStart + 3n <= dist) startingPos.set(coordutil.getKeyFromCoords([xStart + 1n, yStart + 3n]), r.PAWN + e.W);
		if (yStart + 4n <= dist) startingPos.set(coordutil.getKeyFromCoords([xStart + 1n, yStart + 4n]), r.PAWN + e.B);
		if (yStart + 7n <= dist) startingPos.set(coordutil.getKeyFromCoords([xStart + 1n, yStart + 7n]), r.PAWN + e.W);
		if (yStart + 8n <= dist) startingPos.set(coordutil.getKeyFromCoords([xStart + 1n, yStart + 8n]), r.PAWN + e.B);
		if (yStart + 9n <= dist) startingPos.set(coordutil.getKeyFromCoords([xStart + 1n, yStart + 9n]), r.BISHOP + e.W);
		if (yStart + 11n <= dist) startingPos.set(coordutil.getKeyFromCoords([xStart + 1n, yStart + 11n]), r.BISHOP + e.W);
		if (yStart + 13n <= dist) startingPos.set(coordutil.getKeyFromCoords([xStart + 1n, yStart + 13n]), r.BISHOP + e.W);
		if (yStart + 15n <= dist) startingPos.set(coordutil.getKeyFromCoords([xStart + 1n, yStart + 15n]), r.BISHOP + e.W);
		if (yStart + 16n <= dist) startingPos.set(coordutil.getKeyFromCoords([xStart + 1n, yStart + 16n]), r.ROOK + e.B);

		// Third pawn wall
		startingPos.set(coordutil.getKeyFromCoords([xStart + 2n, yStart + 2n]), r.PAWN + e.W);
		if (yStart + 3n <= dist) startingPos.set(coordutil.getKeyFromCoords([xStart + 2n, yStart + 3n]), r.PAWN + e.B);
		if (yStart + 4n <= dist) startingPos.set(coordutil.getKeyFromCoords([xStart + 2n, yStart + 4n]), r.PAWN + e.W);
		if (yStart + 5n <= dist) startingPos.set(coordutil.getKeyFromCoords([xStart + 2n, yStart + 5n]), r.PAWN + e.B);
		if (yStart + 8n <= dist) startingPos.set(coordutil.getKeyFromCoords([xStart + 2n, yStart + 8n]), r.PAWN + e.W);
		if (yStart + 9n <= dist) startingPos.set(coordutil.getKeyFromCoords([xStart + 2n, yStart + 9n]), r.PAWN + e.B);
		if (yStart + 10n <= dist) startingPos.set(coordutil.getKeyFromCoords([xStart + 2n, yStart + 10n]), r.PAWN + e.W);
		if (yStart + 11n <= dist) startingPos.set(coordutil.getKeyFromCoords([xStart + 2n, yStart + 11n]), r.PAWN + e.W);
		if (yStart + 12n <= dist) startingPos.set(coordutil.getKeyFromCoords([xStart + 2n, yStart + 12n]), r.PAWN + e.W);
		if (yStart + 13n <= dist) startingPos.set(coordutil.getKeyFromCoords([xStart + 2n, yStart + 13n]), r.PAWN + e.W);
		if (yStart + 14n <= dist) startingPos.set(coordutil.getKeyFromCoords([xStart + 2n, yStart + 14n]), r.PAWN + e.W);
		if (yStart + 15n <= dist) startingPos.set(coordutil.getKeyFromCoords([xStart + 2n, yStart + 15n]), r.PAWN + e.B);
		appendPawnTower(startingPos, xStart + 2n, yStart + 16n, dist);
	}

	function spawnAllRookTowers(
		startingPos: Map<CoordsKey, number>,
		xStart: bigint,
		yStart: bigint,
		xEnd: bigint,
		yEnd: bigint,
	): void {
		let y: bigint = yStart;
		for (let x = xStart; x < xEnd; x += 3n) {
			spawnRookTower(startingPos, x, y, yEnd);
			y += 3n; // Increment y as well!
		}
	}

	function spawnAllBishopCannons(
		startingPos: Map<CoordsKey, number>,
		startX: bigint,
		startY: bigint,
		endX: bigint,
		endY: bigint,
	): void {
		const spacing = 7n;
		let currX: bigint = startX;
		let currY: bigint = startY;
		let i = 0;
		do {
			genBishopCannon(startingPos, currX, currY, i);
			currX += spacing;
			currY -= spacing;
			i++;
		} while (currX < endX && currY > endY);
	}

	// prettier-ignore
	function genBishopCannon(
		startingPos: Map<CoordsKey, number>,
		x: bigint,
		y: bigint,
		i: number,
	): void {
		// Pawn staples that never change
		startingPos.set(coordutil.getKeyFromCoords([x, y]), r.PAWN + e.B);
		startingPos.set(coordutil.getKeyFromCoords([x, y - 1n]), r.PAWN + e.W);
		startingPos.set(coordutil.getKeyFromCoords([x + 1n, y - 1n]), r.PAWN + e.B);
		startingPos.set(coordutil.getKeyFromCoords([x + 1n, y - 2n]), r.PAWN + e.W);
		startingPos.set(coordutil.getKeyFromCoords([x + 2n, y - 2n]), r.PAWN + e.B);
		startingPos.set(coordutil.getKeyFromCoords([x + 2n, y - 3n]), r.PAWN + e.W);
		if (y - 3n - x + 3n > -980n) startingPos.set(coordutil.getKeyFromCoords([x + 3n, y - 3n]), r.PAWN + e.B);
		if (y - 4n - x + 3n > -980n) startingPos.set(coordutil.getKeyFromCoords([x + 3n, y - 4n]), r.PAWN + e.W);
		if (y - 5n - x + 4n > -980n) startingPos.set(coordutil.getKeyFromCoords([x + 4n, y - 4n]), r.PAWN + e.B);
		if (y - 3n - x + 4n > -980n) startingPos.set(coordutil.getKeyFromCoords([x + 4n, y - 5n]), r.PAWN + e.W);
		if (y - 4n - x + 5n > -980n) startingPos.set(coordutil.getKeyFromCoords([x + 5n, y - 3n]), r.PAWN + e.B);
		if (y - 4n - x + 5n > -980n) startingPos.set(coordutil.getKeyFromCoords([x + 5n, y - 4n]), r.PAWN + e.W);
		if (y - 2n - x + 6n > -980n) startingPos.set(coordutil.getKeyFromCoords([x + 6n, y - 2n]), r.PAWN + e.B);
		if (y - 3n - x + 6n > -980n) startingPos.set(coordutil.getKeyFromCoords([x + 6n, y - 3n]), r.PAWN + e.W);
		if (y - 1n - x + 7n > -980n) startingPos.set(coordutil.getKeyFromCoords([x + 7n, y - 1n]), r.PAWN + e.B);
		if (y - 2n - x + 7n > -980n) startingPos.set(coordutil.getKeyFromCoords([x + 7n, y - 2n]), r.PAWN + e.W);
		if (y + 1n - x + 7n > -980n) startingPos.set(coordutil.getKeyFromCoords([x + 7n, y + 1n]), r.PAWN + e.B);
		if (y + 0n - x + 7n > -980n) startingPos.set(coordutil.getKeyFromCoords([x + 7n, y + 0n]), r.PAWN + e.W);
		if (y - 2n - x + 8n > -980n) startingPos.set(coordutil.getKeyFromCoords([x + 8n, y - 2n]), r.BISHOP + e.B);
		if (y - 6n - x + 6n > -980n) startingPos.set(coordutil.getKeyFromCoords([x + 6n, y - 6n]), r.PAWN + e.B);
		if (y - 7n - x + 6n > -980n) startingPos.set(coordutil.getKeyFromCoords([x + 6n, y - 7n]), r.PAWN + e.W);
		if (y - 5n - x + 7n > -980n) startingPos.set(coordutil.getKeyFromCoords([x + 7n, y - 5n]), r.PAWN + e.B);
		if (y - 6n - x + 7n > -980n) startingPos.set(coordutil.getKeyFromCoords([x + 7n, y - 6n]), r.PAWN + e.W);
		if (y - 4n - x + 8n > -980n) startingPos.set(coordutil.getKeyFromCoords([x + 8n, y - 4n]), r.PAWN + e.B);
		if (y - 5n - x + 8n > -980n) startingPos.set(coordutil.getKeyFromCoords([x + 8n, y - 5n]), r.PAWN + e.W);
		if (y - 3n - x + 9n > -980n) startingPos.set(coordutil.getKeyFromCoords([x + 9n, y - 3n]), r.PAWN + e.B);
		if (y - 4n - x + 9n > -980n) startingPos.set(coordutil.getKeyFromCoords([x + 9n, y - 4n]), r.PAWN + e.W);

		// Generate bishop puzzle pieces.
		// it tells us how many to iteratively gen!
		const count: number = i + 2;
		let puzzleX: bigint = x + 8n;
		let puzzleY: bigint = y + 2n;
		const upDiag: bigint = puzzleY - puzzleX;
		if (upDiag > -990n) {
			for (let a = 1; a <= count; a++) {
				const isLastIndex: boolean = a === count;
				genBishopPuzzlePiece(startingPos, puzzleX, puzzleY, isLastIndex);
				puzzleX += 1n;
				puzzleY += 1n;
			}
		}

		// White pawn strip
		let pawnX: bigint = x + 4n;
		let pawnY: bigint = y;
		for (let a = 0; a < i; a++) {
			startingPos.set(coordutil.getKeyFromCoords([pawnX, pawnY]), r.PAWN + e.W);
			pawnX++;
			pawnY++;
		}
	}

	function genBishopPuzzlePiece(
		startingPos: Map<CoordsKey, number>,
		x: bigint,
		y: bigint,
		isLastIndex: boolean,
	): void {
		startingPos.set(coordutil.getKeyFromCoords([x, y]), r.PAWN + e.B);
		startingPos.set(coordutil.getKeyFromCoords([x, y - 1n]), r.PAWN + e.W);
		startingPos.set(coordutil.getKeyFromCoords([x, y - 2n]), r.BISHOP + e.B);
		startingPos.set(coordutil.getKeyFromCoords([x + 1n, y - 2n]), r.PAWN + e.B);
		startingPos.set(coordutil.getKeyFromCoords([x + 1n, y - 3n]), r.BISHOP + e.B);
		startingPos.set(coordutil.getKeyFromCoords([x + 2n, y - 4n]), r.PAWN + e.B);
		startingPos.set(coordutil.getKeyFromCoords([x + 2n, y - 5n]), r.PAWN + e.W);

		if (!isLastIndex) return;

		// Is last index
		startingPos.set(coordutil.getKeyFromCoords([x + 1n, y - 2n]), r.PAWN + e.W);
		startingPos.set(coordutil.getKeyFromCoords([x + 1n, y - 1n]), r.PAWN + e.B);
		startingPos.set(coordutil.getKeyFromCoords([x + 2n, y - 3n]), r.PAWN + e.W);
		startingPos.set(coordutil.getKeyFromCoords([x + 2n, y - 2n]), r.PAWN + e.B);
	}

	function spawnAllWings(
		startingPos: Map<CoordsKey, number>,
		startX: bigint,
		startY: bigint,
		endX: bigint,
		endY: bigint,
	): void {
		const spacing = 8n;
		let currX: bigint = startX;
		let currY: bigint = startY;
		let i = 0;
		do {
			spawnWing(startingPos, currX, currY, i);
			currX -= spacing;
			currY -= spacing;
			i++;
		} while (currX > endX && currY > endY);
	}

	function spawnWing(startingPos: Map<CoordsKey, number>, x: bigint, y: bigint, i: number): void {
		startingPos.set(coordutil.getKeyFromCoords([x, y]), r.PAWN + e.B);
		startingPos.set(coordutil.getKeyFromCoords([x, y - 1n]), r.PAWN + e.W);
		startingPos.set(coordutil.getKeyFromCoords([x - 1n, y - 1n]), r.PAWN + e.B);
		startingPos.set(coordutil.getKeyFromCoords([x - 1n, y - 2n]), r.PAWN + e.W);
		startingPos.set(coordutil.getKeyFromCoords([x - 2n, y - 2n]), r.PAWN + e.B);
		startingPos.set(coordutil.getKeyFromCoords([x - 2n, y - 3n]), r.PAWN + e.W);
		startingPos.set(coordutil.getKeyFromCoords([x - 3n, y - 3n]), r.PAWN + e.B);
		startingPos.set(coordutil.getKeyFromCoords([x - 3n, y - 4n]), r.PAWN + e.W);
		startingPos.set(coordutil.getKeyFromCoords([x - 4n, y - 4n]), r.PAWN + e.B);
		startingPos.set(coordutil.getKeyFromCoords([x - 4n, y - 5n]), r.PAWN + e.W);

		// Generate segments
		const count: number = i + 1;
		const segSpacing = 6n;
		let segX: bigint = x - 5n;
		let segY: bigint = y - 8n;
		for (let a = 1; a <= count; a++) {
			const isLastIndex: boolean = a === count;
			genWingSegment(startingPos, segX, segY, isLastIndex);
			segX -= segSpacing;
			segY += segSpacing;
		}

		setAir(startingPos, [x - 6n, y - 8n]);
		setAir(startingPos, [x - 6n, y - 9n]);
		setAir(startingPos, [x - 5n, y - 9n]);
		setAir(startingPos, [x - 5n, y - 10n]);
	}

	function genWingSegment(
		startingPos: Map<CoordsKey, number>,
		x: bigint,
		y: bigint,
		isLastIndex: boolean,
	): void {
		startingPos.set(coordutil.getKeyFromCoords([x, y - 2n]), r.PAWN + e.W);
		startingPos.set(coordutil.getKeyFromCoords([x, y - 1n]), r.PAWN + e.B);
		startingPos.set(coordutil.getKeyFromCoords([x - 1n, y - 1n]), r.PAWN + e.W);
		startingPos.set(coordutil.getKeyFromCoords([x - 1n, y + 0n]), r.PAWN + e.B);
		startingPos.set(coordutil.getKeyFromCoords([x - 2n, y + 0n]), r.PAWN + e.W);
		startingPos.set(coordutil.getKeyFromCoords([x - 2n, y + 1n]), r.PAWN + e.B);
		startingPos.set(coordutil.getKeyFromCoords([x - 3n, y + 1n]), r.PAWN + e.W);
		startingPos.set(coordutil.getKeyFromCoords([x - 3n, y + 2n]), r.PAWN + e.B);
		startingPos.set(coordutil.getKeyFromCoords([x - 4n, y + 2n]), r.PAWN + e.W);
		startingPos.set(coordutil.getKeyFromCoords([x - 4n, y + 3n]), r.PAWN + e.B);
		startingPos.set(coordutil.getKeyFromCoords([x - 5n, y + 3n]), r.PAWN + e.W);
		startingPos.set(coordutil.getKeyFromCoords([x - 5n, y + 4n]), r.PAWN + e.B);
		startingPos.set(coordutil.getKeyFromCoords([x, y + 2n]), r.PAWN + e.W);
		startingPos.set(coordutil.getKeyFromCoords([x, y + 3n]), r.PAWN + e.B);
		startingPos.set(coordutil.getKeyFromCoords([x - 1n, y + 3n]), r.PAWN + e.W);
		startingPos.set(coordutil.getKeyFromCoords([x - 1n, y + 4n]), r.PAWN + e.B);
		startingPos.set(coordutil.getKeyFromCoords([x - 2n, y + 4n]), r.PAWN + e.W);
		startingPos.set(coordutil.getKeyFromCoords([x - 2n, y + 5n]), r.PAWN + e.B);
		startingPos.set(coordutil.getKeyFromCoords([x - 2n, y + 6n]), r.PAWN + e.W);
		startingPos.set(coordutil.getKeyFromCoords([x - 2n, y + 7n]), r.PAWN + e.W);
		startingPos.set(coordutil.getKeyFromCoords([x - 2n, y + 8n]), r.PAWN + e.W);
		startingPos.set(coordutil.getKeyFromCoords([x - 2n, y + 9n]), r.PAWN + e.B);
		startingPos.set(coordutil.getKeyFromCoords([x - 2n, y + 10n]), r.PAWN + e.W);
		startingPos.set(coordutil.getKeyFromCoords([x - 2n, y + 11n]), r.PAWN + e.B);
		startingPos.set(coordutil.getKeyFromCoords([x - 3n, y + 11n]), r.PAWN + e.W);
		startingPos.set(coordutil.getKeyFromCoords([x - 3n, y + 12n]), r.PAWN + e.B);
		startingPos.set(coordutil.getKeyFromCoords([x - 4n, y + 12n]), r.PAWN + e.W);
		startingPos.set(coordutil.getKeyFromCoords([x - 4n, y + 13n]), r.PAWN + e.B);
		startingPos.set(coordutil.getKeyFromCoords([x - 5n, y + 11n]), r.PAWN + e.W);
		startingPos.set(coordutil.getKeyFromCoords([x - 5n, y + 12n]), r.PAWN + e.B);
		startingPos.set(coordutil.getKeyFromCoords([x - 5n, y + 10n]), r.PAWN + e.B);
		startingPos.set(coordutil.getKeyFromCoords([x - 5n, y + 9n]), r.PAWN + e.W);
		startingPos.set(coordutil.getKeyFromCoords([x - 5n, y + 8n]), r.PAWN + e.B);
		startingPos.set(coordutil.getKeyFromCoords([x - 5n, y + 7n]), r.PAWN + e.W);
		startingPos.set(coordutil.getKeyFromCoords([x - 4n, y + 7n]), r.PAWN + e.B);
		startingPos.set(coordutil.getKeyFromCoords([x - 4n, y + 6n]), r.PAWN + e.W);
		startingPos.set(coordutil.getKeyFromCoords([x - 4n, y + 10n]), r.BISHOP + e.W);

		if (!isLastIndex) return;

		// Is last wing segment!
		startingPos.set(coordutil.getKeyFromCoords([x - 5n, y + 6n]), r.PAWN + e.B);
		startingPos.set(coordutil.getKeyFromCoords([x - 5n, y + 5n]), r.PAWN + e.W);
	}

	function addVoidSquaresToOmegaFourth(
		startingPos: Map<CoordsKey, number>,
		left: bigint,
		top: bigint,
		right: bigint,
		bottomright: bigint,
		bottomleft: bigint,
	): void {
		for (let x = left; x <= right; x++) {
			const key: CoordsKey = coordutil.getKeyFromCoords([x, top]);
			startingPos.set(key, r.VOID + e.N);
		}
		for (let y = top; y >= bottomright; y--) {
			const key: CoordsKey = coordutil.getKeyFromCoords([right, y]);
			startingPos.set(key, r.VOID + e.N);
		}
		let y: bigint = bottomright;
		for (let x = right; x >= -3n; x--) {
			let key: CoordsKey = coordutil.getKeyFromCoords([x, y]);
			startingPos.set(key, r.VOID + e.N);
			key = coordutil.getKeyFromCoords([x, y - 1n]);
			startingPos.set(key, r.VOID + e.N);
			y--;
		}
		for (let y = top; y >= bottomleft; y--) {
			const key: CoordsKey = coordutil.getKeyFromCoords([left, y]);
			startingPos.set(key, r.VOID + e.N);
		}
		y = bottomleft;
		for (let x = left; x <= -4n; x++) {
			let key: CoordsKey = coordutil.getKeyFromCoords([x, y]);
			startingPos.set(key, r.VOID + e.N);
			key = coordutil.getKeyFromCoords([x, y - 1n]);
			startingPos.set(key, r.VOID + e.N);
			y--;
		}
		startingPos.set(coordutil.getKeyFromCoords([492n, 493n]), r.VOID + e.N);
	}
}

export default {
	genPositionOfOmegaFourth,
};
