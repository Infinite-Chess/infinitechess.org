// src/client/scripts/esm/views/analysis/analysisworldborder.ts

/**
 * Draws the HydroChess analysis-safe coordinate border on the analysis board.
 */

import type { Color } from '../../../../../shared/util/math/math.js';

import bd, { BigDecimal } from '@naviary/bigdecimal';

import boardpos from '../../game/rendering/boardpos.js';
import gameslot from '../../game/chess/gameslot.js';
import boardtiles from '../../game/rendering/boardtiles.js';
import { GameBus } from '../../game/GameBus.js';
import frametracker from '../../game/rendering/frametracker.js';
import { createRenderable } from '../../webgl/Renderable.js';
import analysisenginebounds from './analysisenginebounds.js';

const BORDER_COLOR: Color = [1, 0.05, 0.05, 0.9];
const HALF_SQUARE = bd.fromNumber(0.5);

let enabled = false;

function init(): void {
	GameBus.addEventListener('engine-debug', toggle);
	GameBus.addEventListener('render-below-pieces', render);
}

function toggle(): void {
	enabled = !enabled;
	frametracker.onVisualChange();
}

function render(): void {
	if (!enabled) return;

	const gamefile = gameslot.getGamefile();
	if (!gamefile) return;

	const visible = boardtiles.gboundingBox(false);
	const { left, right, bottom, top } = analysisenginebounds.getEngineWorldBorder(gamefile);
	const data: number[] = [];

	if (visible.left <= left && left <= visible.right) {
		addVerticalLine(
			data,
			left,
			maxBigInt(bottom, visible.bottom),
			minBigInt(top, visible.top),
			true,
		);
	}
	if (visible.left <= right && right <= visible.right) {
		addVerticalLine(
			data,
			right,
			maxBigInt(bottom, visible.bottom),
			minBigInt(top, visible.top),
			false,
		);
	}
	if (visible.bottom <= bottom && bottom <= visible.top) {
		addHorizontalLine(
			data,
			bottom,
			maxBigInt(left, visible.left),
			minBigInt(right, visible.right),
			true,
		);
	}
	if (visible.bottom <= top && top <= visible.top) {
		addHorizontalLine(
			data,
			top,
			maxBigInt(left, visible.left),
			minBigInt(right, visible.right),
			false,
		);
	}

	if (data.length > 0) createRenderable(data, 2, 'LINES', 'color', true).render();
}

function addVerticalLine(
	data: number[],
	xSquare: bigint,
	bottomSquare: bigint,
	topSquare: bigint,
	isMinEdge: boolean,
): void {
	if (bottomSquare > topSquare) return;
	const x = toWorld(edgeFromSquare(xSquare, isMinEdge), 0);
	const y1 = toWorld(edgeFromSquare(bottomSquare, true), 1);
	const y2 = toWorld(edgeFromSquare(topSquare, false), 1);
	pushLine(data, x, y1, x, y2);
}

function addHorizontalLine(
	data: number[],
	ySquare: bigint,
	leftSquare: bigint,
	rightSquare: bigint,
	isMinEdge: boolean,
): void {
	if (leftSquare > rightSquare) return;
	const y = toWorld(edgeFromSquare(ySquare, isMinEdge), 1);
	const x1 = toWorld(edgeFromSquare(leftSquare, true), 0);
	const x2 = toWorld(edgeFromSquare(rightSquare, false), 0);
	pushLine(data, x1, y, x2, y);
}

function edgeFromSquare(square: bigint, isMinEdge: boolean): BigDecimal {
	const center = bd.fromBigInt(square);
	return isMinEdge ? bd.subtract(center, HALF_SQUARE) : bd.add(center, HALF_SQUARE);
}

function toWorld(coord: BigDecimal, axis: 0 | 1): number {
	const boardPos = boardpos.getBoardPos();
	return bd.toNumber(bd.subtract(coord, boardPos[axis])) * boardpos.getBoardScaleAsNumber();
}

function pushLine(data: number[], x1: number, y1: number, x2: number, y2: number): void {
	data.push(x1, y1, ...BORDER_COLOR, x2, y2, ...BORDER_COLOR);
}

function minBigInt(a: bigint, b: bigint): bigint {
	return a < b ? a : b;
}

function maxBigInt(a: bigint, b: bigint): bigint {
	return a > b ? a : b;
}

export default {
	init,
};
