// src/client/scripts/esm/game/chess/GameBus.ts

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
	/** Dispatched when a physical (not premove or simulated) move is made by us, NOT our opponent. */
	'user-move-played': void;
	/** Dispatched when a physical move is made on the board by any player, even our own premoves. */
	'physical-move': void;
	// =========== Graphical Events ===========
	'render-below-pieces': void;
	'render-above-pieces': void;
}

export const GameBus: EventBus<GameBusEvents> = new EventBus<GameBusEvents>();
