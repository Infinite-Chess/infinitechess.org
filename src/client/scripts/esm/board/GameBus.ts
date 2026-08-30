// src/client/scripts/esm/board/GameBus.ts

/**
 * Typed event bus for the game board, covering both its logical and its
 * graphical events. Handlers self-register by listening; the board's modules
 * dispatch facts about game/piece/render state.
 */

import type { Piece } from '../../../../shared/chess/logic/boardutil';
import type { LegalMoves } from '../../../../shared/chess/logic/legalmoves';

import { EventBus } from '../../../../shared/util/EventBus';

interface GameBusEvents {
	// =========== Game Lifecycle ============

	/** Dispatched when the LOGICAL part of a game is finished loading (not GRAPHICAL). */
	'game-loaded': void;
	/** Dispatched when the GRAPHICAL part finishes successfully, so the game is now fully loaded. */
	'graphical-loaded': void;
	/**
	 * Dispatched whenever a load stops being in flight, whether it finished or
	 * failed — the moment `gamesession.isLoading()` goes false. Listen to this,
	 * not 'graphical-loaded', to resume work a load was blocking.
	 */
	'load-ended': void;
	'game-unloaded': void;
	/** Dispatched when games end, and the termination is shown on screen. */
	'game-concluded': void;

	// =========== Moves ============

	/** Dispatched when a physical (not premove or simulated) move is made by us, NOT our opponent. */
	'user-move-played': void;
	/** Dispatched when our opponent's move is applied to the board in an online game (live or during a resync). */
	'opponent-move-played': void;
	/** Dispatched after the local engine applies its move. */
	'engine-move-played': void;
	/**
	 * Dispatched when a physical move is made on the board by any player, even our own premoves, or making a board editor edit.
	 * Does NOT guarantee the viewed position changed, as we may be viewing earlier moves
	 * when we receive our opponent's move. For that, listen to 'view-move' instead.
	 */
	'physical-move': void;
	/**
	 * Dispatched when the committed move list changes — a real move was made, or
	 * moves were rewound (takeback / resync). Does not fire for premoves.
	 */
	'moves-changed': void;

	// =========== Viewed Position ============

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

	// =========== Piece Selection ============

	'piece-selected': { piece: Piece; legalMoves: LegalMoves };
	'piece-unselected': void;

	// =========== Board View ============

	/** Dispatched when the board's view orientation is flipped (white ⇄ black perspective). */
	'board-flipped': void;
	/** Dispatched when perspective view is enabled or disabled. */
	'perspective-toggle': void;
	/** Dispatched when the arrow indicators' mode changes. */
	'arrow-mode-change': void;
	/** Dispatched when a board transition (the animated pan/zoom to a target area) begins. */
	'transition-start': void;

	// =========== Annotations ============

	/** Dispatched when the number of drawn rays changes. Carries the new count. */
	'ray-count-change': number;

	// =========== Input ============

	/**
	 * Dispatched when the board is about to be pinched. Tells any
	 * single-pointer action using the given pointer (piece drag, annotation
	 * draw, board editor edit) to release it, since pinching takes priority.
	 */
	'steal-pointer': { pointerId: string };
	/** Fire at the very END of every frame, so the input listeners drop their per-frame state. */
	'reset-listener-events': void;

	// =========== Debug ============

	/** Fire when the keybind assigned to toggling the engine debug mode is pressed. */
	'engine-debug': void;
	/** Dispatched when the camera's debug view is toggled on or off. */
	'camera-debug-toggle': void;

	// =========== Rendering ============

	/** Dispatched when the canvas is resized. Carries its new dimensions, in pixels. */
	'canvas-resize': { width: number; height: number };
	/** Hooks for drawing extra content into the board's render pass, either side of the pieces. */
	'render-below-pieces': void;
	'render-above-pieces': void;
}

export const GameBus: EventBus<GameBusEvents> = new EventBus<GameBusEvents>();
