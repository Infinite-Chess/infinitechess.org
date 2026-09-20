// src/client/scripts/esm/board/rendering/previewrenderer.ts

/**
 * Draws static board previews: a position's start, framed to fit, onto a canvas of its own.
 *
 * Owns no state. Each preview builds its own render context here, so drawing it never
 * disturbs the interactive game's render state, and threads it through the rest.
 */

import type { Mesh } from './piecemodels.js';
import type { BoardPreview } from '../../../../../shared/chess/logic/boardpreviewer.js';

import boardutil from '../../../../../shared/chess/logic/boardutil.js';

import area from './area.js';
import webgl from './webgl.js';
import meshes from './meshes.js';
import border from './border.js';
import imagecache from '../../chess/rendering/imagecache.js';
import piecemodels from './piecemodels.js';
import RenderContext from './RenderContext.js';
import promotionlines from './promotionlines.js';
import { createCamera } from './camera.js';
import miniimagerenderer from './miniimagerenderer.js';
import { createBoardPos } from './boardpos.js';
import { ProgramManager } from '../../webgl/ProgramManager.js';
import { createMaskedDraw } from '../../webgl/maskeddraw.js';
import { createTextureCache } from '../../chess/rendering/texturecache.js';

// Constants -------------------------------------------------------------------

/** Size of mini image icons in a preview, in virtual pixels. */
const PREVIEW_ENTITY_WIDTH_VPIXELS = 20;

// Functions -------------------------------------------------------------------

/**
 * Builds a preview's render context on the given canvas, with its own WebGL context.
 * The canvas turns opaque black here, so a visible one must stay hidden until {@link render}.
 */
async function createContext(canvas: HTMLCanvasElement): Promise<RenderContext> {
	const gl = webgl.createContext(canvas);
	const camera = createCamera(); // No hooks; inert toward game-loop globals.
	camera.init(gl, canvas);
	const programManager = new ProgramManager(gl);

	const ctx = new RenderContext({
		gl,
		canvas,
		programManager,
		camera,
		boardpos: createBoardPos(camera),
		textures: createTextureCache(),
		maskedDraw: createMaskedDraw(gl, programManager),
	});

	await ctx.boardtiles.init();
	return ctx;
}

/** Loads any not-yet-cached images and textures the board needs into the context. */
async function load(ctx: RenderContext, boardsim: BoardPreview): Promise<void> {
	await imagecache.initImagesForGame(boardsim);
	ctx.textures.initTexturesForGame(ctx.gl, boardsim);
}

/** Draws the board's start position into the context, framed to fit its canvas. */
function render(ctx: RenderContext, boardsim: BoardPreview): void {
	// The canvas may have resized since the last draw
	ctx.camera.syncCanvasDimensions();

	const { gameRules } = boardsim;

	const mesh: Mesh = { offset: [0n, 0n], inverted: false, types: {} };
	piecemodels.regenAll(ctx, boardsim, mesh);

	const startBox = boardsim.startSnapshot.box;
	const boxFloating = meshes.expandTileBoundingBoxToEncompassWholeSquare(startBox);
	const centerArea = area.calculateFromUnpaddedBox(boxFloating, ctx.camera);

	ctx.boardpos.setBoardPos(centerArea.coords);
	ctx.boardpos.setBoardScale(centerArea.scale);

	ctx.clearScreen();
	ctx.maskedDraw.onFrameStart();

	// Render board and promotion lines
	ctx.maskedDraw.execute(
		() => border.drawPlayableRegionMask(ctx, gameRules.worldBorder), // INCLUSION MASK: playable region
		() => piecemodels.renderVoids(ctx, mesh), // EXCLUSION MASK: voids
		() => {
			ctx.boardtiles.render();
			promotionlines.render(ctx, gameRules.promotion, startBox);
		},
		'and',
	);
	// Render pieces
	if (
		!ctx.boardpos.areZoomedOut() ||
		boardutil.getPieceCountOfGame(boardsim.pieces) > miniimagerenderer.MAX_PIECE_COUNT
	) {
		piecemodels.renderAll(ctx, mesh);
	} else {
		const instanceData = miniimagerenderer.buildInstanceData(ctx, boardsim);
		miniimagerenderer.render(ctx, boardsim.existingTypes, instanceData, {}, false, PREVIEW_ENTITY_WIDTH_VPIXELS); // prettier-ignore
	}
}

// Exports ---------------------------------------------------------------------

export default {
	createContext,
	load,
	render,
};
