// src/client/scripts/board/rendering/previewrenderer.ts

/**
 * Draws static board previews: a position's start, framed to fit, onto a canvas of its own.
 *
 * Owns no state. Each preview builds its own render context here, so drawing it never
 * disturbs the interactive game's render state, and threads it through the rest.
 */

import type { Mesh } from './piecemodels.js';
import type { BoardBase } from '../../../../shared/chess/logic/boardbase.js';

import area from './area.js';
import piecemodels from './piecemodels.js';
import RenderContext from './RenderContext.js';
import standaloneboard from './standaloneboard.js';

// Functions -------------------------------------------------------------------

/**
 * Builds a preview's render context on the given canvas, with its own WebGL context.
 * The canvas turns opaque black here, so a visible one must stay hidden until {@link render}.
 */
async function createContext(canvas: HTMLCanvasElement): Promise<RenderContext> {
	const ctx = new RenderContext(standaloneboard.createContextParams(canvas));
	await ctx.boardtiles.init();
	return ctx;
}

/** Draws the board's start position into the context, framed to fit its canvas. */
function render(ctx: RenderContext, boardsim: BoardBase): void {
	// The canvas may have resized since the last draw
	ctx.camera.syncCanvasDimensions();

	const mesh: Mesh = { offset: [0n, 0n], inverted: false, types: {} };
	piecemodels.regenAll(ctx, boardsim, mesh);

	const startArea = area.calculateFromStartPosition(
		ctx.camera,
		boardsim,
		standaloneboard.ENTITY_WIDTH_VPIXELS,
	);
	ctx.boardpos.setBoardPos(startArea.coords);
	ctx.boardpos.setBoardScale(startArea.scale);

	ctx.clearScreen();
	ctx.maskedDraw.onFrameStart();

	standaloneboard.renderBoard(ctx, boardsim, mesh);
	standaloneboard.renderPieces(ctx, boardsim, mesh, [], []);
}

// Exports ---------------------------------------------------------------------

export default {
	createContext,
	render,
};
