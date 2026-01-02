// src/client/scripts/esm/game/chess/GameBus.ts

// import type { FullGame } from '../../../../shared/chess/logic/gamefile';
import type { LegalMoves } from '../../../../shared/chess/logic/legalmoves';
import type { Piece } from '../../../../shared/chess/util/boardutil';

import { EventBus } from '../../../../shared/util/EventBus';

interface GameBusEvents {
	// =========== Logical Events ============
	'game-loaded': void;
	'game-unloaded': void;
	/** Dispatched when games end, and the termination is shown on screen. */
	'game-concluded': void;
	'piece-selected': { piece: Piece; legalMoves: LegalMoves };
	'piece-unselected': void;
	// /** Dispatched immediately before legal move generation. */
	// 'pre-move-gen': {
	// 	gamefile: FullGame;
	// 	piece: Piece;
	// 	/** Mod scripts should define this if they would like to totally override normal legal move gen. */
	// 	moveOverrides: LegalMoves | undefined;
	// };
	// /** Dispatched immediately after legal move gen. Mods may add additional legal moves. */
	// 'post-move-gen': { gamefile: FullGame; piece: Piece; legalMoves: LegalMoves };
	/** Dispatched when a physical (not premove or simulated) move is made by us, NOT our opponent. */
	'user-move-played': void;
	/** Dispatched when a physical move is made on the board by any player, even our own premoves. */
	'physical-move': void;
	// =========== Graphical Events ===========
	'render-below-pieces': void;
	'render-above-pieces': void;
}

export const GameBus: EventBus<GameBusEvents> = new EventBus<GameBusEvents>();
