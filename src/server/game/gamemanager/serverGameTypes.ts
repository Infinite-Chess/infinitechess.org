// src/server/game/gamemanager/serverGameTypes.ts

/**
 * The shape of a live game as the server holds it in memory.
 *
 * Pure vocabulary — no logic, no dependencies on sibling modules. `gameUtility.ts`
 * constructs these, `gameStateBuilder.ts` projects them outward, and `gameManager.ts`
 * drives their life cycle.
 */

import type { Board } from '../../../shared/chess/logic/boardinit.js';
import type { Rating } from '../../../shared/chess/util/metadatautil.js';
import type { GameRules } from '../../../shared/chess/util/gamerules.js';
import type { MoveRecord } from '../../../shared/chess/logic/movepiece.js';
import type { ValidEngine } from '../../../shared/chess/util/engine.js';
import type { SeekVariant } from '../../../shared/chess/util/variantselection.js';
import type { TimeControl } from '../../../shared/chess/util/clockutil.js';
import type { GameModifier } from '../../../shared/chess/util/modutil.js';
import type { AuthMemberInfo } from '../../types.js';
import type { CustomWebSocket } from '../../socket/socketTypes.js';
import type { Player, PlayerGroup } from '../../../shared/util/typeutil.js';
import type { Game, LoadedVariant, VariantOptions } from '../../../shared/chess/logic/gamefile.js';

// Types -----------------------------------------------------------------------

/**
 * Per-player rating outcome of a finalized rated game: the rating going in (at-game) + the delta.
 * Server-internal — the at-game rating feeds the SSR side bar; only the delta is sent to clients
 * (the base rating is always SSR'd, never needed on the wire).
 */
export type PlayerRatingResult = { ratingAtGame: Rating; change: number };

/** Contains information about this player's disconnection and claim-window timer. */
export type PlayerDisconnect = {
	/**
	 * The timeout id of the timer that will OPEN the opponent's claim window.
	 * This is triggered if their socket unexpectedly closes,
	 * and lasts for 5 seconds to give them a chance to reconnect.
	 */
	startID?: NodeJS.Timeout;
	/**
	 * The epoch-ms timestamp when the 5-second reconnection cushion expires.
	 * Set alongside startID when the cushion timer is started.
	 * Used for persistence: on server restart, this allows reviving the cushion timer.
	 */
	startTime?: number;
} & (
	| {
			/**
			 * The epoch-ms timestamp from which the OPPONENT is allowed to claim
			 * victory or a draw against this disconnected player. The claim is
			 * validated on-demand against this timestamp when it arrives. Once
			 * this is in the past, the opponent's claim window is open.
			 */
			timeOpponentMayClaim: number;
			/**
			 * Whether the player disconnected voluntarily.
			 * If not, they are given extra time to reconnect.
			 */
			voluntary: boolean;
	  }
	| {
			timeOpponentMayClaim: undefined;
			voluntary: undefined;
	  }
);

/** Information about a single player in an online game. */
export interface PlayerData {
	/**
	 * The identifier of each color.
	 *
	 * If they are signed in, their identifier is `{ member: string }`, where member is their username.
	 * If they are signed out, their identifier is `{ browser: string }`, where browser is their browser-id cookie.
	 *
	 */
	identifier: AuthMemberInfo;
	/** Player's socket, if they are connected. */
	socket?: CustomWebSocket;
	/** The last move ply this player extended a draw offer, if they have. 0-based, where 0 is the start of the game. */
	lastOfferPly?: number;
	/** Contains information about this players disconnection and opponent ability to claim victory. */
	disconnect: PlayerDisconnect;
}

/** Identifies the engine a human is playing against. */
export interface EngineInfo {
	engine: ValidEngine;
	version: string;
	strengthLevel: number;
}

/** The info for the server hosting the game */
export interface MatchInfo {
	/** The match's unique ID. This is also the same ID the game will have when logged to the database. */
	id: number;

	/** The variant of the game being played: a preset code, or a custom game's start position. */
	variant: SeekVariant;

	/** The time this match was created. The number of milliseconds that have elapsed since the Unix epoch. */
	timeCreated: number;
	/** The time this game ended, the game conclusion was set and the clocks were stopped serverside. */
	timeEnded?: number;
	/** Whether the match is rated. */
	rated: boolean;
	/**
	 * The time control `s+s` of the game (e.g. `"600+5"` or `"-"` for untimed).
	 * Guaranteed defined here because we can't read it from MetaData since it is optional there.
	 */
	clock: TimeControl;
	/** The modifiers configuration applied to this game. Absent if none. */
	modifiers?: GameModifier[];
	/** The data held for each player */
	playerData: PlayerGroup<PlayerData>;
	/** Present only for games against an engine. Its moves arrive over the human's socket. */
	engineParticipant?: EngineInfo & { color: Player };

	/** The ID of the timeout which will auto-lose the player
	 * whos turn it currently is when they run out of time. */
	autoTimeLossTimeoutID?: NodeJS.Timeout;

	/** Whether a current draw offer is extended. If so, this is the color who extended it, otherwise null. */
	drawOfferState?: Player;

	/**
	 * Whether or not the game has concluded at all, which then frees players
	 * to join a new game, and logs the game into the db. Freed !== finalized.
	 */
	freed: boolean;
	/**
	 * Whether the game is finalized: its result is permanent and locked in — cheat reports no
	 * longer accepted, and it can never change. The game is logged to the database at conclusion
	 * (when it's freed), independent of this; finalizing just locks the already-logged result.
	 * Finalized !== evicted: it may linger in memory to host rematch handshake.
	 */
	finalized: boolean;

	/**
	 * The colors that have an outstanding rematch offer post-conclusion. When both are
	 * present, a rematch game is created. Ephemeral — never persisted (lost on restart).
	 */
	rematchOffers: Set<Player>;

	/**
	 * The ID of the timer that finalizes (locks in) the game's result after it ends. Only used by
	 * games without server-side validation, to give a cushion for cheat reports to overturn the
	 * result first. Can be cancelled if the game is finalized/evicted early.
	 */
	finalizeTimeoutID?: NodeJS.Timeout;

	/**
	 * The ID of the timer that concludes the game once BOTH players have been
	 * disconnected for too long (neither is present to claim victory/draw).
	 * Started when the second player disconnects; cancelled if either reconnects.
	 */
	bothDisconnectedTimeoutID?: NodeJS.Timeout;
	/**
	 * The epoch-ms timestamp the {@link bothDisconnectedTimeoutID} timer fires.
	 * Persisted so the timer can be revived (or fired) on server restart.
	 */
	bothDisconnectedEndTime?: number;
}

/** The game stored in the server */
export type ServerGame = Game & {
	match: MatchInfo;
	/** Determines turn order, win conditions, promotion, etc. */
	gameRules: GameRules;
	/** The color whose turn it currently is at the front of the game. */
	whosTurn: Player;
	/** Sockets spectating this game (non-participants). */
	spectators: Set<CustomWebSocket>;
	/**
	 * Per-player rating results (at-game rating + delta), retained once a rated game finalizes so
	 * late resyncers get the deltas AND the finalized side bar displays the at-game rating (the
	 * leaderboard is already post-calc by then).
	 */
	ratingResults?: PlayerGroup<PlayerRatingResult>;
} & ValidationDependant;

/** The servergame variables that depend on whether the server is performing legal move validation. */
export type ValidationDependant =
	| ({
			/**
			 * Whether the server is performing move validation for this game.
			 * If present, board state is fully tracked.
			 * True only for small variants.
			 * This also determines whether the server game is instantly deleted or not after conclusion.
			 */
			validateMoves: true;
	  } & Board)
	| {
			validateMoves: false;
			moves: MoveRecord[];
	  };

/** Everything a game's board is built from, resolved from the variant it's played with. */
export interface GameConstruction {
	/** The variant supplying the movesets. Undefined for a position declaring no source variant. */
	variant: LoadedVariant | undefined;
	/** The rules to play by. Owned by the caller until the board deep-copies them. */
	gameRules: GameRules;
	/** The explicit start position. Custom games only — a preset's comes off its variant module. */
	variantOptions?: VariantOptions;
	/** Whether the server tracks a board and validates every move against it. */
	validateMoves: boolean;
}

/**
 * The properties needed to start a game, distilled from either an accepted seek or an
 * existing game being rematched. Kept minimal so both the seek and rematch paths can share it.
 */
export interface GameSetup {
	variant: SeekVariant;
	time: TimeControl;
	rated: boolean;
	/** The modifiers to apply to the game. Absent if none. */
	modifiers?: GameModifier[];
	engineParticipant?: MatchInfo['engineParticipant'];
}
