// src/client/scripts/esm/game/GameBus.ts

import type { Piece } from '../../../../shared/chess/util/boardutil';
import type { LegalMoves } from '../../../../shared/chess/logic/legalmoves';

import { EventBus } from '../../../../shared/util/EventBus';

interface GameBusEvents {
	// =========== Logical Events ============
	/** Dispatched when the LOGICAL part of a game is finished loading (not GRAPHICAL). */
	'game-loaded': void;
	/** Dispatched when the GRAPHICAL part finishes, so the game is now fully loaded. */
	'graphical-loaded': void;
	'game-unloaded': void;
	/** Dispatched when games end, and the termination is shown on screen. */
	'game-concluded': void;
	'piece-selected': { piece: Piece; legalMoves: LegalMoves };
	'piece-unselected': void;
	// /** Dispatched immediately before legal move generation. */
	// 'pre-move-gen': {
	// 	gamefile: GameFile;
	// 	piece: Piece;
	// 	/** Mod scripts should define this if they would like to totally override normal legal move gen. */
	// 	moveOverrides: LegalMoves | undefined;
	// };
	// /** Dispatched immediately after legal move gen. Mods may add additional legal moves. */
	// 'post-move-gen': { gamefile: GameFile; piece: Piece; legalMoves: LegalMoves };
	/** Dispatched when a physical (not premove or simulated) move is made by us, NOT our opponent. */
	'user-move-played': void;
	/** Dispatched when our opponent's move is applied to the board in an online game (live or during a resync). */
	'opponent-move-played': void;
	/**
	 * Dispatched when a physical move is made on the board by any player, even our own premoves, or making a board editor edit.
	 * Does NOT gaurantee the viewed position changed, as we may be viewing earlier moves
	 * when we receive our opponent's move. For that, listen to 'view-move' instead.
	 */
	'physical-move': void;
	/**
	 * Dispatched when the committed move list changes — a real move was made, or
	 * moves were rewound (takeback / resync). Does not fire for premoves.
	 */
	'moves-changed': void;
	/**
	 * Dispatched whenever the locally-viewed position changes: navigating history forward/backward
	 * (no game state change), or alongside 'physical-move' when an actual move changes it too.
	 */
	'view-move': void;
	/**
	 * The viewed position became the FRONT (jumped there, or
	 * a move made/taken back) — scroll moves list to follow.
	 */
	'view-front': void;
	/** Dispatched when the board's view orientation is flipped (white ⇄ black perspective). */
	'board-flipped': void;
	/**
	 * Dispatched when the board is about to be pinched. Tells any
	 * single-pointer action using the given pointer (piece drag, annotation
	 * draw, board editor edit) to release it, since pinching takes priority.
	 */
	'steal-pointer': { pointerId: string };
	/** Fire when the keybind assigned to toggling the engine debug mode is pressed. */
	'engine-debug': void;
	// =========== Graphical Events ===========
	'render-below-pieces': void;
	'render-above-pieces': void;
}

export const GameBus: EventBus<GameBusEvents> = new EventBus<GameBusEvents>();
