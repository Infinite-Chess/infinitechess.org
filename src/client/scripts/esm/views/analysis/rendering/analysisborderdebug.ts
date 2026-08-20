// src/client/scripts/esm/views/analysis/rendering/analysisborderdebug.ts

/**
 * DEBUG: Draws the Apeiron analysis-safe coordinate border on the board.
 */

import type { Color } from '../../../../../../shared/util/math/math.js';

import bd, { BigDecimal } from '@naviary/bigdecimal';

import bimath from '../../../../../../shared/util/math/bimath.js';

import boardpos from '../../../board/rendering/boardpos.js';
import gameslot from '../../../game/chess/gameslot.js';
import { GameBus } from '../../../board/GameBus.js';
import frametracker from '../../../board/rendering/frametracker.js';
import boardgeometry from '../../../board/rendering/boardgeometry.js';
import { createRenderable } from '../../../board/rendering/renderable.js';
import analysisenginebounds from '../analysisenginebounds.js';

const BORDER_COLOR: Color = [1, 0.05, 0.05, 0.9];
const HALF = bd.fromNumber(0.5);

let enabled = false;

GameBus.addEventListener('engine-debug', toggle);
GameBus.addEventListener('render-below-pieces', render);

function toggle(): void {
	enabled = !enabled;
	frametracker.onVisualChange();
}

function render(): void {
	if (!enabled) return;

	const gamefile = gameslot.getGamefile();
	if (!gamefile) return;

	const visible = boardgeometry.gboundingBox(false);
	const { left, right, bottom, top } = analysisenginebounds.getEngineWorldBorder(gamefile);
	const data: number[] = [];

	if (visible.left <= left && left <= visible.right) {
		addVerticalLine(data, left, bimath.max(bottom, visible.bottom), bimath.min(top, visible.top), true); // prettier-ignore
	}
	if (visible.left <= right && right <= visible.right) {
		addVerticalLine(data, right, bimath.max(bottom, visible.bottom), bimath.min(top, visible.top), false); // prettier-ignore
	}
	if (visible.bottom <= bottom && bottom <= visible.top) {
		addHorizontalLine(data, bottom, bimath.max(left, visible.left), bimath.min(right, visible.right), true); // prettier-ignore
	}
	if (visible.bottom <= top && top <= visible.top) {
		addHorizontalLine(data, top, bimath.max(left, visible.left), bimath.min(right, visible.right), false); // prettier-ignore
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
	return isMinEdge ? bd.subtract(center, HALF) : bd.add(center, HALF);
}

function toWorld(coord: BigDecimal, axis: 0 | 1): number {
	const boardPos = boardpos.getBoardPos();
	return bd.toNumber(bd.subtract(coord, boardPos[axis])) * boardpos.getBoardScaleAsNumber();
}

function pushLine(data: number[], x1: number, y1: number, x2: number, y2: number): void {
	data.push(x1, y1, ...BORDER_COLOR, x2, y2, ...BORDER_COLOR);
}
