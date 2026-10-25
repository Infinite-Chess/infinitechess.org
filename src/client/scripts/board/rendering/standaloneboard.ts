// src/client/scripts/board/rendering/standaloneboard.ts

/**
 * A board on a canvas of its own, outside the interactive game — a variant preview, or a game
 * featured on the home page: assembling its render context, loading its piece images, and
 * drawing the layers every such board shares.
 */

import type { Mesh } from './piecemodels.js';
import type { MoveFull } from '../../../../shared/chess/logic/movepiece.js';
import type { Animation } from './animation/animation.js';
import type RenderContext from './RenderContext.js';
import type { BoardPreview } from '../../../../shared/chess/logic/boardpreviewer.js';
import type { RenderContextParams } from './RenderContext.js';

import webgl from './webgl.js';
import border from './border.js';
import imagecache from '../../chess/rendering/imagecache.js';
import piecemodels from './piecemodels.js';
import promotionlines from './promotionlines.js';
import { createCamera } from './camera.js';
import miniimagerenderer from './miniimagerenderer.js';
import { createBoardPos } from './boardpos.js';
import { ProgramManager } from '../../webgl/ProgramManager.js';
import { createMaskedDraw } from '../../webgl/maskeddraw.js';
import { createFrameTracker } from './frametracker.js';
import { createTextureCache } from '../../chess/rendering/texturecache.js';

// Constants -------------------------------------------------------------------

/** Size of mini image icons on a standalone board, in virtual pixels. */
const ENTITY_WIDTH_VPIXELS = 20;

// Building --------------------------------------------------------------------

/**
 * The parts of a render context on the given canvas, with its own WebGL context.
 * The canvas turns opaque black here, so a visible one must stay hidden until its first draw.
 */
function createContextParams(canvas: HTMLCanvasElement): RenderContextParams {
	const gl = webgl.createContext(canvas);
	const frames = createFrameTracker();
	const camera = createCamera({ onVisualChange: () => frames.onVisualChange() });
	camera.init(gl, canvas);
	const programManager = new ProgramManager(gl);
	return {
		gl,
		canvas,
		programManager,
		camera,
		boardpos: createBoardPos(camera, () => frames.onVisualChange()),
		textures: createTextureCache(),
		maskedDraw: createMaskedDraw(gl, programManager),
		frames,
	};
}

/** Loads any not-yet-cached images and textures the board needs into the context. */
async function load(ctx: RenderContext, boardsim: BoardPreview): Promise<void> {
	await imagecache.initImagesForGame(boardsim);
	ctx.textures.initTexturesForGame(ctx.gl, boardsim);
}

// Drawing ---------------------------------------------------------------------

/** Draws the board's tiles and promotion lines, masked to its playable region with voids cut out. */
function renderBoard(ctx: RenderContext, boardsim: BoardPreview, mesh: Mesh): void {
	const { gameRules } = boardsim;
	ctx.maskedDraw.execute(
		() => border.drawPlayableRegionMask(ctx, gameRules.worldBorder), // INCLUSION MASK: playable region
		() => piecemodels.renderVoids(ctx, mesh), // EXCLUSION MASK: voids
		() => {
			ctx.boardtiles.render();
			promotionlines.render(ctx, gameRules.promotion, boardsim.startSnapshot.box);
		},
		'and',
	);
}

/**
 * Draws the board's pieces: their models, or mini images once zoomed out. With too many pieces,
 * the models stay, and only the moved pieces get mini images.
 * @param moves - The board's moves, viewed at its move index. A static position has none.
 * @param animations - The pieces mid-animation, whose mini images draw where they are now.
 */
function renderPieces(
	ctx: RenderContext,
	boardsim: BoardPreview,
	mesh: Mesh,
	moves: MoveFull[],
	animations: Animation[],
): void {
	const zoomedOut = ctx.boardpos.areZoomedOut();
	if (!zoomedOut || miniimagerenderer.isOverPieceCap(boardsim)) piecemodels.renderAll(ctx, mesh);
	if (!zoomedOut) return;
	const instanceData = miniimagerenderer.buildInstanceData(ctx, boardsim, moves, animations);
	miniimagerenderer.render(ctx, boardsim.existingTypes, instanceData, {}, false, ENTITY_WIDTH_VPIXELS); // prettier-ignore
}

// Exports ---------------------------------------------------------------------

export default {
	// Constants
	ENTITY_WIDTH_VPIXELS,
	// Building
	createContextParams,
	load,
	// Drawing
	renderBoard,
	renderPieces,
};
