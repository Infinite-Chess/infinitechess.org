
// This script contains many of our useful
// type definitions for web sockets and our game.
// And has no other script module dependancies.

import { players } from "../../client/scripts/esm/chess/util/typeutil";


/** @typedef {import("../socket/socketUtility").CustomWebSocket} CustomWebSocket */
/** @typedef {import("../../client/scripts/esm/chess/util/typeutil").Player} Player */
/** @typedef {import("../../client/scripts/esm/chess/util/typeutil").PlayerGroup} PlayerGroup */
/** @typedef {import("../../client/scripts/esm/chess/util/typeutil").RawType} RawType */
/** @typedef {import("../../client/scripts/esm/chess/variants/gamerules").GameRules} GameRules */

function PlayerData() {
	/**
	 * The identifier of each color.
	 * 
	 * If they are signed in, their identifier is `{ member: string }`, where member is their username.
	 * If they are signed out, their identifier is `{ browser: string }`, where browser is their browser-id cookie.
	 * 
	 * TODO: CHANGE THE IDENTIFIER value to match the return type of socketUtility.getSignedInAndIdentifierOfSocket
	 * @type {{ member: string, user_id: number } | { browser: string }}
	 */
	this.identifier = undefined; // CHANGE TO { signedIn: boolean, identifier: string }
	/** Player's socket, if they are connected. @type {CustomWebSocket} */
	this.socket = undefined;
	/** The last move ply this player extended a draw offer, if they have. 0-based, where 0 is the start of the game. @type {number | null} */
	this.lastOfferPly = undefined;
	/** Players's current time remaining, in milliseconds, if the game is timed, otherwise undefined. @type {number | undefined}*/
	this.timer = undefined;
	/** Contains information about this players disconnection and auto resign timer. */
	this.disconnect = {
		/**
		 * The timeout id of the timer that will START the auto disconnection timer
		 * This is triggered if their socket unexpectedly closes,
		 * and lasts for 5 seconds to give them a chance to reconnect.
		 * @type {ReturnType<typeof setTimeout> | undefined}
		 */
		startID: undefined,
		/**
		 * The timeout id of the timer that will auto-resign the
		 * player if they are disconnected for too long.
		 * @type {ReturnType<typeof setTimeout> | undefined}
		 */
		timeoutID: undefined,
		/**
		 * The estimated timestamp that the player will
		 * be auto-resigned from being disconnected too long.
		 * @type {number | undefined}
		 */
		timeToAutoLoss: undefined,
		/**
		 * Whether the player was disconnected by choice or not.
		 * If not, they are given extra time to reconnect.
		 * @type {boolean}
		 */
		wasByChoice: undefined,
	};
}

/** The Game type definition. THIS SHOULD NOT be called, it is purely for JSDoc dropdowns. */
function Game() {
	console.error("THIS GAME CONSTRUCTOR should never be called! It is purely for the 'Game' type definition, for useful JSDoc dropdown info.");

	/** The game's unique ID */
	this.id = undefined;
	/** The time this game was created. The number of milliseconds that have elapsed since the Unix epoch. */
	this.timeCreated = undefined;
	/** Whether this game is "public" or "private". @type {'public' | 'private'} */
	this.publicity = undefined;
	/** The variant of this game. */
	this.variant = undefined;
	/** The clock value in s+s format (e.g. "600+4"). Untimed games are represented with a "-" */
	this.clock = undefined;
	/** Whether or not the game is untimed. Clock will be "-". @type {boolean} */
	this.untimed = undefined;
	/** The start time for both players, in milliseconds. */
	this.startTimeMillis = undefined;
	/** The increment amount, in seconds. */
	this.incrementMillis = undefined;
	/** Whether the game is rated. @type {boolean}*/
	this.rated = undefined;
	/** The moves list of the game. Each move is a string that looks like `8,1>16,1`. @type {string[]} */
	this.moves = undefined;
	/** The players in the game @type {PlayerGroup<PlayerData>}} */
	this.players = undefined;
	/** The gamerules of the variant. @type {GameRules} */
	this.gameRules = undefined;
	/** Whos turn it is currently. @type {Player | undefined} */
	this.whosTurn = undefined;
	/** If the game is over, this is a string. For example, "1 checkmate". Otherwise false. */
	this.gameConclusion = undefined;
	/** The amount of time remaining, in milliseconds, the current player had at the beginning of their turn. */
	this.timeRemainAtTurnStart = undefined;
	/** The time, in milliseconds, of the javascript process since the beginning of the current player's turn. */
	this.timeAtTurnStart = undefined;
	/** The ID of the timeout which will auto-lose the player
     * whos turn it currently is when they run out of time. */
	this.autoTimeLossTimeoutID = undefined;

	/** The ID of the timeout which will auto-lose the player
     * whos turn it currently is if they go AFK too long. */
	this.autoAFKResignTimeoutID = undefined;
	/** The time the current player will be auto-resigned by
     * AFK if they are currently AFK. */
	this.autoAFKResignTime = undefined;

	/** Whether a current draw offer is extended. If so, this is the color who extended it, otherwise undefined. @type {Player | undefined} */
	this.drawOfferState = undefined;

	/** The ID of the timer to delete the game after it has ended.
     * This can be used to cancel it in case a hacking was reported. */
	this.deleteTimeoutID = undefined;

	/**
	 * Whether a custom position was pasted in by either player.
	 * The game will NOT be logged, because it will crash if we try
	 * to paste it since we don't know the starting position.
	 * @type {boolean}
	 */
	this.positionPasted = undefined
}

export {
	Game,
	PlayerData,
};