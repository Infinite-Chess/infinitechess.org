// src/client/scripts/esm/views/index/featuredboard.ts

/**
 * One featured game's live board: building its game from the lobby's snapshot, playing each
 * incoming move, clock change and conclusion onto it, and updating and drawing it every frame.
 */

import type { Mesh } from '../../board/rendering/piecemodels.js';
import type { Player } from '../../../../../shared/chess/util/typeutil.js';
import type { Framing } from './featuredframing.js';
import type { GameFile } from '../../../../../shared/chess/logic/gamefile.js';
import type { ClockValues } from '../../../../../shared/chess/util/clockutil.js';
import type {
	ClientboundLobbyMessage,
	FeaturedGame,
	OpponentsMoveMessage,
} from '../../../../../shared/transport/clientbound.js';

import clock from '../../../../../shared/chess/logic/clock.js';
import icnmoves from '../../../../../shared/chess/logic/icn/icnmoves.js';
import clockutil from '../../../../../shared/chess/util/clockutil.js';
import movepiece from '../../../../../shared/chess/logic/movepiece.js';
import wincondition from '../../../../../shared/chess/logic/wincondition.js';
import movevalidation from '../../../../../shared/chess/logic/movevalidation.js';
import gameformulator from '../../../../../shared/chess/game/gameformulator.js';

import arrows from '../../board/rendering/arrows/arrows.js';
import docutil from '../../util/docutil.js';
import LiveBoard from '../../board/rendering/LiveBoard.js';
import animation from '../../board/rendering/animation/animation.js';
import piecemodels from '../../board/rendering/piecemodels.js';
import arrowshifts from '../../board/rendering/arrows/arrowshifts.js';
import WaterRipples from '../../board/rendering/WaterRipples.js';
import boardgeometry from '../../board/rendering/boardgeometry.js';
import arrowsgraphics from '../../board/rendering/arrows/arrowsgraphics.js';
import featuredframing from './featuredframing.js';
import standaloneboard from '../../board/rendering/standaloneboard.js';
import graphicalchanges from '../../board/rendering/graphicalchanges.js';
import conclusionglyphs from '../../board/rendering/glyphs/conclusionglyphs.js';
import positionhighlights from '../../board/rendering/positionhighlights.js';

// Types -----------------------------------------------------------------------

/** A message updating one featured game. */
export type FeaturedUpdate = Extract<
	ClientboundLobbyMessage,
	{ action: 'featuredmove' | 'featuredclock' | 'featuredconclusion' }
>;

/** One featured game's board. */
export interface FeaturedBoard {
	board: LiveBoard;
	state:
		| {
				kind: 'loading';
				/** Updates that arrived mid-load, replayed in order once it finishes. */
				queue: FeaturedUpdate[];
		  }
		| { kind: 'loaded'; gamefile: GameFile; mesh: Mesh; framing: Framing }
		| { kind: 'disposed' };
	/** Keeps the canvas's pixel buffer, and the framing that depends on it, matched to its size. */
	resizeObserver: ResizeObserver;
	/** Ends its watch on the pixel density, which the resize observer can't see, on dispose. */
	densityWatch: AbortController;
}

/** The loaded state of a {@link FeaturedBoard}. */
type Loaded = Extract<FeaturedBoard['state'], { kind: 'loaded' }>;

// Lifecycle -------------------------------------------------------------------

/**
 * Builds a featured game's board on its canvas, which must already be in the page.
 * It loads in the background, and draws nothing until it has.
 */
function create(canvas: HTMLCanvasElement, game: FeaturedGame): FeaturedBoard {
	const board = new LiveBoard({ ...standaloneboard.createContextParams(canvas), sound: false });
	const featuredBoard: FeaturedBoard = {
		board,
		state: { kind: 'loading', queue: [] },
		resizeObserver: new ResizeObserver(() => syncCanvasSize(featuredBoard)),
		densityWatch: new AbortController(),
	};
	featuredBoard.resizeObserver.observe(canvas);
	docutil.onPixelDensityChange(() => syncCanvasSize(featuredBoard), featuredBoard.densityWatch.signal); // prettier-ignore
	void load(featuredBoard, game);
	return featuredBoard;
}

/** Builds the game, its images and its mesh, then replays any updates that arrived meanwhile. */
async function load(featuredBoard: FeaturedBoard, game: FeaturedGame): Promise<void> {
	const { board } = featuredBoard;
	const engineGame = Object.values(game.players).some((p) => p?.type === 'engine');
	const progress = {
		moves: game.moves,
		gameConclusion: game.gameConclusion,
		clockValues: game.clockValues,
	};
	const options = gameformulator.constructionOptionsFromSetup(game, engineGame, progress);
	const [gamefile] = await Promise.all([
		gameformulator.loadAndConstructGame(options),
		board.boardtiles.init(),
	]);
	await standaloneboard.load(board, gamefile);
	if (featuredBoard.state.kind !== 'loading') return; // Disposed mid-load

	if (arrows.isGameTooLarge(gamefile)) board.arrows.mode = 0;
	const framing = featuredframing.create(board, gamefile); // Before the mesh, which is offset from the camera
	const mesh: Mesh = { offset: [0n, 0n], inverted: false, types: {} };
	piecemodels.regenAll(board, gamefile, mesh);

	const { queue } = featuredBoard.state;
	featuredBoard.state = { kind: 'loaded', gamefile, mesh, framing };
	for (const update of queue) apply(featuredBoard, update);
}

/** Stops the board, and releases its WebGL context. */
function dispose(featuredBoard: FeaturedBoard): void {
	featuredBoard.state = { kind: 'disposed' };
	featuredBoard.resizeObserver.disconnect();
	featuredBoard.densityWatch.abort();
	animation.clearAnimations(featuredBoard.board); // Cancels their pending timers
	featuredBoard.board.dispose();
}

/** Resizes the pixel buffer to the canvas's size and pixel density, and reframes to its new shape. */
function syncCanvasSize(featuredBoard: FeaturedBoard): void {
	const { board, state } = featuredBoard;
	if (state.kind === 'disposed') return;
	board.camera.syncCanvasDimensions();
	board.resize(board.canvas.width, board.canvas.height);
	if (state.kind === 'loaded') featuredframing.retarget(board, state.gamefile, state.framing);
}

// Updates ---------------------------------------------------------------------

/** Plays an update onto the board, or queues it if the board is still loading. */
function apply(featuredBoard: FeaturedBoard, update: FeaturedUpdate): void {
	const { board, state } = featuredBoard;
	if (state.kind === 'disposed') return;
	if (state.kind === 'loading') return void state.queue.push(update);

	switch (update.action) {
		case 'featuredmove':
			applyMove(board, state, update.value);
			break;
		case 'featuredclock':
			applyClockValues(state.gamefile, update.value.clockValues);
			break;
		case 'featuredconclusion':
			wincondition.setGameConclusion(state.gamefile, update.value.gameConclusion);
			applyClockValues(state.gamefile, update.value.clockValues);
			break;
		default:
			throw new Error(`Unknown featured update: ${JSON.stringify(update satisfies never)}`);
	}
	board.frames.onVisualChange();
}

/**
 * Plays a move onto the board, animated. The server is authoritative, so its conclusion is
 * adopted as is. A move out of sequence, or one our board finds illegal, is dropped, leaving
 * the board behind until its game is replaced or the lobby resubscribes.
 */
function applyMove(board: LiveBoard, loaded: Loaded, message: OpponentsMoveMessage): void {
	const { gamefile, mesh, framing } = loaded;
	if (message.moveNumber !== gamefile.moves.length + 1) return;
	const parsed = icnmoves.parseTokenMove(message.move.token);
	// Attaches the move's special tags, which only a legal move can be found to have.
	const result = movevalidation.isOpponentsMoveLegal(gamefile, parsed, 'trusted');
	if (!result.valid) return;

	const move = movepiece.generateAndMakeMove(gamefile, result.tagged);
	wincondition.setGameConclusion(gamefile, message.gameConclusion);

	graphicalchanges.runMeshChanges(board, gamefile, mesh, move, true);
	graphicalchanges.animateMove(board, move.changes, true);
	applyClockValues(gamefile, message.clockValues);
	featuredframing.onMove(board, gamefile, framing, move);
}

/** Sets the game's clocks to the server's. Their flag deadline was stamped at receipt. */
function applyClockValues(gamefile: GameFile, clockValues: ClockValues | undefined): void {
	if (clockValues === undefined || gamefile.untimed) return;
	clock.edit(gamefile.clocks, clockValues);
}

// Frame -----------------------------------------------------------------------

/** Advances the board one frame, in the game page's update order. */
function update(featuredBoard: FeaturedBoard): void {
	const { board, state } = featuredBoard;
	if (state.kind !== 'loaded') return;
	const { boardpos } = board;

	board.camera.shake.update();
	featuredframing.glide(board, state.framing);
	const boundingBox = boardgeometry.getBoundingBoxOfBoard(board.camera, boardpos.getBoardPos(), boardpos.getBoardScale()); // prettier-ignore
	arrows.update(board, state.gamefile, boundingBox, []);
	WaterRipples.update(board, false);
	animation.update(board);
	arrowshifts.executeArrowShifts(board, state.gamefile, []);
	clock.update(state.gamefile);
}

/** Draws the board, if anything on it changed since its last draw. */
function render(featuredBoard: FeaturedBoard): void {
	const { board, state } = featuredBoard;
	if (state.kind !== 'loaded' || !board.frames.doWeRenderNextFrame()) return;
	const { gamefile, mesh } = state;

	const passes = WaterRipples.getPass(board);
	board.pipeline.setPasses(passes);
	if (passes.length > 0) board.pipeline.begin();

	board.clearScreen();
	board.maskedDraw.onFrameStart();
	standaloneboard.renderBoard(board, gamefile, mesh);
	board.executeWithDepthFunc_ALWAYS(() => {
		positionhighlights.render(board, gamefile);
		animation.renderTransparentSquares(board); // Hides the pieces mid-animation
	});
	standaloneboard.renderPieces(board, gamefile, mesh, board.animations);
	board.executeWithDepthFunc_ALWAYS(() => {
		animation.renderAnimations(board);
		arrowsgraphics.render(board, []);
		if (gamefile.gameConclusion)
			conclusionglyphs.render(board, gamefile, gamefile.gameConclusion);
	});

	if (passes.length > 0) board.pipeline.end();
	board.frames.onFrameRender();
	board.canvas.classList.remove('visibility-hidden');
}

// Display ---------------------------------------------------------------------

/**
 * What a player's bar shows beside their name: their score once the game has ended
 * (1, 0, or ½ each for a draw), otherwise their clock. Undefined while loading, or untimed.
 */
function getClockOrScore(featuredBoard: FeaturedBoard, color: Player): string | undefined {
	const { state } = featuredBoard;
	if (state.kind !== 'loaded') return undefined;
	const { gamefile } = state;
	const conclusion = gamefile.gameConclusion;
	if (conclusion !== undefined && conclusion.condition !== 'aborted') {
		return conclusion.victor === null ? '½' : conclusion.victor === color ? '1' : '0';
	}
	if (gamefile.untimed) return undefined;
	return clockutil.getTextContentFromTimeRemain(gamefile.clocks.currentTime[color]!);
}

// Exports ---------------------------------------------------------------------

export default {
	// Lifecycle
	create,
	dispose,
	// Updates
	apply,
	// Frame
	update,
	render,
	// Display
	getClockOrScore,
};
