// src/client/scripts/esm/views/index/featured/featuredboard.ts

/**
 * One featured card's live board: loading each game it shows from the lobby's snapshot, the next
 * while it still draws the last, playing each incoming move, clock change and conclusion onto it,
 * and updating and drawing it every frame.
 */

import type { Mesh } from '../../../board/rendering/piecemodels.js';
import type { Player } from '../../../../../../shared/chess/util/typeutil.js';
import type { Framing } from './featuredframing.js';
import type { GameFile } from '../../../../../../shared/chess/logic/gamefile.js';
import type { ClockValues } from '../../../../../../shared/chess/util/clockutil.js';
import type {
	ClientboundLobbyMessage,
	FeaturedGame,
	OpponentsMoveMessage,
} from '../../../../../../shared/transport/clientbound.js';

import clock from '../../../../../../shared/chess/logic/clock.js';
import icnmoves from '../../../../../../shared/chess/logic/icn/icnmoves.js';
import clockutil from '../../../../../../shared/chess/util/clockutil.js';
import movepiece from '../../../../../../shared/chess/logic/movepiece.js';
import wincondition from '../../../../../../shared/chess/logic/wincondition.js';
import gameresultutil from '../../../../../../shared/chess/util/gameresultutil.js';
import movevalidation from '../../../../../../shared/chess/logic/movevalidation.js';
import gameformulator from '../../../../../../shared/chess/game/gameformulator.js';

import arrows from '../../../board/rendering/arrows/arrows.js';
import docutil from '../../../util/docutil.js';
import LiveBoard from '../../../board/rendering/LiveBoard.js';
import animation from '../../../board/rendering/animation/animation.js';
import piecemodels from '../../../board/rendering/piecemodels.js';
import arrowshifts from '../../../board/rendering/arrows/arrowshifts.js';
import WaterRipples from '../../../board/rendering/WaterRipples.js';
import boardgeometry from '../../../board/rendering/boardgeometry.js';
import arrowsgraphics from '../../../board/rendering/arrows/arrowsgraphics.js';
import featuredframing from './featuredframing.js';
import standaloneboard from '../../../board/rendering/standaloneboard.js';
import graphicalchanges from '../../../board/rendering/graphicalchanges.js';
import conclusionglyphs from '../../../board/rendering/glyphs/conclusionglyphs.js';
import positionhighlights from '../../../board/rendering/positionhighlights.js';

// Types -----------------------------------------------------------------------

/** A message updating one featured game. */
export type FeaturedUpdate = Extract<
	ClientboundLobbyMessage,
	{ action: 'featuredmove' | 'featuredclock' | 'featuredconclusion' }
>;

/** A game loaded onto a featured board, as it's drawn. */
interface Shown {
	/** The snapshot it was loaded from. */
	game: FeaturedGame;
	gamefile: GameFile;
	mesh: Mesh;
	framing: Framing;
}

/** A featured board loading its next game. */
interface Loading {
	kind: 'loading';
	/** The game drawn until the load finishes. Undefined during the board's first. */
	shown: Shown | undefined;
	/** Updates to the game loading that arrived mid-load, replayed in order once it finishes. */
	queue: FeaturedUpdate[];
}

/** One featured card's board. */
export interface FeaturedBoard {
	board: LiveBoard;
	state: Loading | { kind: 'loaded'; shown: Shown };
	/** Its tile textures' generation, run once at creation. */
	tilesReady: Promise<void>;
	/** Keeps the canvas's pixel buffer, and the framing that depends on it, matched to its size. */
	resizeObserver: ResizeObserver;
	/**
	 * Aborted on dispose: ends any load underway, and its watch on the pixel density, which the
	 * resize observer can't see.
	 */
	lifetime: AbortController;
}

// Lifecycle -------------------------------------------------------------------

/**
 * Builds a board on its canvas, which must already be in the page, and loads its first game.
 * It draws nothing until that has loaded.
 */
function create(canvas: HTMLCanvasElement, game: FeaturedGame): FeaturedBoard {
	const board = new LiveBoard({ ...standaloneboard.createContextParams(canvas), sound: false });
	const featuredBoard: FeaturedBoard = {
		board,
		state: { kind: 'loading', shown: undefined, queue: [] },
		tilesReady: board.boardtiles.init(),
		resizeObserver: new ResizeObserver(() => syncCanvasSize(featuredBoard)),
		lifetime: new AbortController(),
	};
	featuredBoard.resizeObserver.observe(canvas);
	docutil.onPixelDensityChange(() => syncCanvasSize(featuredBoard), featuredBoard.lifetime.signal); // prettier-ignore
	void load(featuredBoard, game);
	return featuredBoard;
}

/**
 * Loads a game onto the board in the background, superseding any load underway. The board keeps
 * drawing its current game until it's done, then switches and snaps onto the new one in a single
 * frame, and replays the updates that arrived meanwhile. A failed load, as from a lost fetch,
 * is left to the console as an unhandled rejection, the board staying on its current game.
 */
async function load(featuredBoard: FeaturedBoard, game: FeaturedGame): Promise<void> {
	const { board } = featuredBoard;
	const loading: Loading = { kind: 'loading', shown: featuredBoard.state.shown, queue: [] };
	featuredBoard.state = loading;

	const engineGame = Object.values(game.players).some((p) => p?.type === 'engine');
	const progress = {
		moves: game.moves,
		gameConclusion: game.gameConclusion,
		clockValues: game.clockValues,
	};
	const options = gameformulator.constructionOptionsFromSetup(game, engineGame, progress);
	const gamefile = await gameformulator.loadAndConstructGame(options);
	await Promise.all([standaloneboard.load(board, gamefile), featuredBoard.tilesReady]);
	// Disposed, or replaced again, mid-load
	if (featuredBoard.lifetime.signal.aborted || featuredBoard.state !== loading) return;

	// The previous game's effects
	animation.clearAnimations(board);
	WaterRipples.clear(board);
	board.camera.shake.clear();
	board.arrows.mode = arrows.isGameTooLarge(gamefile) ? 0 : arrows.DEFAULT_MODE;
	const framing = featuredframing.create(board, gamefile); // Before the mesh, which is offset from the camera
	const mesh: Mesh = { offset: [0n, 0n], inverted: false, types: {} };
	piecemodels.regenAll(board, gamefile, mesh);

	featuredBoard.state = { kind: 'loaded', shown: { game, gamefile, mesh, framing } };
	for (const update of loading.queue) apply(featuredBoard, update);
}

/** Stops the board, and releases its WebGL context. */
function dispose(featuredBoard: FeaturedBoard): void {
	featuredBoard.resizeObserver.disconnect();
	featuredBoard.lifetime.abort();
	animation.clearAnimations(featuredBoard.board); // Cancels their pending timers
	featuredBoard.board.dispose();
}

/** Resizes the pixel buffer to the canvas's size and pixel density, and reframes to its new shape. */
function syncCanvasSize(featuredBoard: FeaturedBoard): void {
	const { board, state } = featuredBoard;
	board.camera.syncCanvasDimensions();
	board.resize(board.canvas.width, board.canvas.height);
	if (state.shown) featuredframing.retarget(board, state.shown.gamefile, state.shown.framing);
}

// Updates ---------------------------------------------------------------------

/** Plays an update onto the board, or queues it for the game loading, if one is. */
function apply(featuredBoard: FeaturedBoard, update: FeaturedUpdate): void {
	const { board, state } = featuredBoard;
	if (state.kind === 'loading') return void state.queue.push(update);
	const { shown } = state;

	switch (update.action) {
		case 'featuredmove':
			applyMove(board, shown, update.value);
			break;
		case 'featuredclock':
			applyClockValues(shown.gamefile, update.value.clockValues);
			break;
		case 'featuredconclusion':
			wincondition.setGameConclusion(shown.gamefile, update.value.gameConclusion);
			applyClockValues(shown.gamefile, update.value.clockValues);
			break;
		default:
			throw new Error(`Unknown featured update: ${JSON.stringify(update satisfies never)}`);
	}
	board.frames.onVisualChange();
}

/** Plays a move onto the board, animated, adopting the server's conclusion as authoritative. */
function applyMove(board: LiveBoard, shown: Shown, message: OpponentsMoveMessage): void {
	const { gamefile, mesh, framing } = shown;
	// Out of sequence only once an illegal move was dropped below
	if (message.moveNumber !== gamefile.moves.length + 1) return;
	const parsed = icnmoves.parseTokenMove(message.move.token);
	// Attaches the move's special tags, which only a legal move can be found to have.
	const result = movevalidation.isOpponentsMoveLegal(gamefile, parsed, 'trusted');
	if (!result.valid) return; // Leaves the board behind until its game is replaced or the lobby resubscribes

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
	const { shown } = state;
	if (shown === undefined) return;
	const { boardpos } = board;

	board.camera.shake.update();
	featuredframing.glide(board, shown.framing);
	const boundingBox = boardgeometry.getBoundingBoxOfBoard(board.camera, boardpos.getBoardPos(), boardpos.getBoardScale()); // prettier-ignore
	arrows.update(board, shown.gamefile, boundingBox, []);
	WaterRipples.update(board, false);
	animation.update(board);
	arrowshifts.executeArrowShifts(board, shown.gamefile, []);
	clock.update(shown.gamefile);
}

/** Draws the board, if anything on it changed since its last draw. */
function render(featuredBoard: FeaturedBoard): void {
	const { board, state } = featuredBoard;
	if (state.shown === undefined || !board.frames.doWeRenderNextFrame()) return;
	const { gamefile, mesh } = state.shown;

	board.clearScreen(); // BEFORE pipeline.begin(), whose clear needs the full stencil mask this restores
	board.maskedDraw.onFrameStart();

	const passes = WaterRipples.getPass(board);
	board.pipeline.setPasses(passes);
	if (passes.length > 0) board.pipeline.begin();

	standaloneboard.renderBoard(board, gamefile, mesh);
	board.executeWithDepthFunc_ALWAYS(() => {
		positionhighlights.render(board, gamefile);
		animation.renderTransparentSquares(board); // Hides the pieces mid-animation
	});
	standaloneboard.renderPieces(board, gamefile, mesh, gamefile.moves, board.animations);
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

/** The game drawn, once the board's first has loaded. */
function getShownGame(featuredBoard: FeaturedBoard): FeaturedGame | undefined {
	return featuredBoard.state.shown?.game;
}

/**
 * What a player's bar shows beside their name: their score once the game has ended, otherwise
 * their clock. Of the game drawn, so undefined until the board's first has loaded, or when untimed.
 */
function getClockOrScore(featuredBoard: FeaturedBoard, color: Player): string | undefined {
	const { shown } = featuredBoard.state;
	if (shown === undefined) return undefined;
	const { gamefile } = shown;
	const conclusion = gamefile.gameConclusion;
	const score = conclusion && gameresultutil.getScore(conclusion, color);
	if (score !== undefined) return score;
	if (gamefile.untimed) return undefined;
	return clockutil.getTextContentFromTimeRemain(gamefile.clocks.currentTime[color]!);
}

// Exports ---------------------------------------------------------------------

export default {
	// Lifecycle
	create,
	load,
	dispose,
	// Updates
	apply,
	// Frame
	update,
	render,
	// Display
	getShownGame,
	getClockOrScore,
};
