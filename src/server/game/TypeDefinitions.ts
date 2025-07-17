
// This script contains many of our useful
// type definitions for web sockets and our game.
// And has no other script module dependancies.

import type { CustomWebSocket } from "../socket/socketUtility.js";
import type { Player } from "../../client/scripts/esm/chess/util/typeutil.js";
import type { PlayerGroup } from "../../client/scripts/esm/chess/util/typeutil.js";
import type { GameRules } from "../../client/scripts/esm/chess/variants/gamerules.js";
import type { BaseMove } from "../../client/scripts/esm/chess/logic/movepiece.js";
import type { MetaData } from "../../client/scripts/esm/chess/util/metadata.js";
import type { MemberInfo } from "../../types.js";

interface PlayerData {
	/**
	 * The identifier of each color.
	 * 
	 * If they are signed in, their identifier is `{ member: string }`, where member is their username.
	 * If they are signed out, their identifier is `{ browser: string }`, where browser is their browser-id cookie.
	 * 
	 */
	identifier: MemberInfo;
	/** Player's socket, if they are connected. */
	socket?: CustomWebSocket;
	/** The last move ply this player extended a draw offer, if they have. 0-based, where 0 is the start of the game. */
	lastOfferPly: number;
	/** Players's current time remaining, in milliseconds, if the game is timed, otherwise undefined. */
	timer?: number;
	/** Contains information about this players disconnection and auto resign timer. */
	disconnect: {
		/**
		 * The timeout id of the timer that will START the auto disconnection timer
		 * This is triggered if their socket unexpectedly closes,
		 * and lasts for 5 seconds to give them a chance to reconnect.
		 */
		startID?: ReturnType<typeof setTimeout>,
		/**
		 * The timeout id of the timer that will auto-resign the
		 * player if they are disconnected for too long.
		 */
		timeoutID?: ReturnType<typeof setTimeout>,
		/**
		 * The estimated timestamp that the player will
		 * be auto-resigned from being disconnected too long.
		 */
		timeToAutoLoss?: number,
		/**
		 * Whether the player was disconnected by choice or not.
		 * If not, they are given extra time to reconnect.
		 */
		wasByChoice: boolean,
	};
}

/** The Game type definition. THIS SHOULD NOT be called, it is purely for JSDoc dropdowns. */
interface Game {
	/** The game's unique ID */
	id: number;
	/** The time this game was created. The number of milliseconds that have elapsed since the Unix epoch. */
	timeCreated: number;
	/** The time this game ended, the game conclusion was set and the clocks were stopped serverside. The number of milliseconds that have elapsed since the Unix epoch. @type {number | undefined} */
	timeEnded: undefined;
	/** Whether this game is "public" or "private". */
	publicity: 'public' | 'private';
	/** The variant of this game. */
	variant: string;
	/** The clock value in s+s format (e.g. "600+4"). Untimed games are represented with a "-" */
	clock: MetaData["TimeControl"];
	/** Whether or not the game is untimed. Clock will be "-". */
	untimed: boolean;
	/** The start time for both players, in milliseconds. */
	startTimeMillis: undefined;
	/** The increment amount, in seconds. */
	incrementMillis: undefined;
	/** Whether the game is rated. */
	rated: boolean;
	/**
	 * The moves list of the game.
	 * THE startCoords, endCoords, and promotion ARE ALL NEEDED for the formatconverter!!
	 */
	moves: BaseMove[];
	/** The players in the game */
	players: PlayerGroup<PlayerData>;
	/** The gamerules of the variant. */
	gameRules: GameRules;
	/** Whos turn it is currently. */
	whosTurn?: Player;
	/** If the game is over, this is a string. For example, "1 checkmate". Otherwise false. */
	gameConclusion: string;
	/** The amount of time remaining, in milliseconds, the current player had at the beginning of their turn. */
	timeRemainAtTurnStart?: number;
	/** The time, in milliseconds, of the javascript process since the beginning of the current player's turn. */
	timeAtTurnStart?: number;
	/** The ID of the timeout which will auto-lose the player
     * whos turn it currently is when they run out of time. */
	autoTimeLossTimeoutID: ReturnType<typeof setTimeout>;

	/** The ID of the timeout which will auto-lose the player
     * whos turn it currently is if they go AFK too long. */
	autoAFKResignTimeoutID: ReturnType<typeof setTimeout>;
	/** The time the current player will be auto-resigned by
     * AFK if they are currently AFK. */
	autoAFKResignTime: number;

	/** Whether a current draw offer is extended. If so, this is the color who extended it, otherwise undefined. */
	drawOfferState?: Player;

	/** The ID of the timer to delete the game after it has ended.
     * This can be used to cancel it in case a hacking was reported. */
	deleteTimeoutID: ReturnType<typeof setTimeout>;

	/**
	 * Whether a custom position was pasted in by either player.
	 * The game will NOT be logged, because it will crash if we try
	 * to paste it since we don't know the starting position.
	 */
	positionPasted: boolean;
}

export type {
	Game,
	PlayerData,
};