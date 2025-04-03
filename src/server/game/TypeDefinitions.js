
// This script contains many of our useful
// type definitions for web sockets and our game.
// And has no other script module dependancies.

import { players } from "../../client/scripts/esm/chess/util/typeutil";


/** @typedef {import("../socket/socketUtility").CustomWebSocket} CustomWebSocket */
/** @typedef {import("../../client/scripts/esm/chess/util/typeutil").Player} Player*/
/** @typedef {import("../../client/scripts/esm/chess/variants/variant").ColorVariantProperty} ColorVariantProperty*/
/** @typedef {import("../../client/scripts/esm/chess/util/typeutil").RawType} RawType*/

function PlayerData() {
	/**
	 * The identifier of each color.
	 * 
	 * If they are signed in, their identifier is `{ member: string }`, where member is their username.
	 * If they are signed out, their identifier is `{ browser: string }`, where browser is their browser-id cookie.
	 * 
	 * TODO: CHANGE THE IDENTIFIER value to match the return type of socketUtility.getSignedInAndIdentifierOfSocket
	 * @type {{ member: string } | { browser: string}}
	 */
	this.identifier = undefined; // CHANGE TO { signedIn: boolean, identifier: string }
	/** Player's socket, if they are connected. @type {CustomWebSocket} */
	this.socket = undefined;
	/** @type {number | null} */
	this.lastOfferPly = undefined;
	/** Players's current time remaining, in milliseconds, if the game is timed, otherwise undefined. @type {number|undefined}*/
	this.timer = undefined;
	/** Contains information about which sides are
     * about to lose by disconnection. */
	this.disconnect = {
		timeToAutoLoss: undefined,
		timeoutID: undefined,
		/** @type {boolean} */
		wasByChoice: undefined,
		/** @type {number} */
		startID: undefined
	};
}

/** The Game type definition. THIS SHOULD NOT be called, it is purely for JSDoc dropdowns. */
function Game() {
	console.error("THIS GAME CONSTRUCTOR should never be called! It is purely for the 'Game' type definition, for useful JSDoc dropdown info.");

	/** The game's unique ID */
	this.id = undefined;
	/** The time this game was created. The number of milliseconds that have elapsed since the Unix epoch. */
	this.timeCreated = undefined;
	/** Whether this game is "public" or "private". */
	this.publicity = undefined;
	/** The variant of this game. */
	this.variant = undefined;
	/** The clock value (e.g. "10+5"). Untimed games are represented with a "-".*/
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
	/** THe players in the game @type {{[player in Player]?: PlayerData}} */
	this.players = undefined;
	/** The gamerules of the variant. */
	this.gameRules = {
		/** An object containing lists of what win conditions each color can win by. This is REQUIRED. */
		winConditions: {
			/** A list of win conditions white can win by. REQUIRED. @type {string[]} */
			[players.WHITE]: undefined,
			/** A list of win conditions black can win by. REQUIRED. @type {string[]} */
			[players.BLACK]: undefined,
		},
		/** A list of colors that make up one full turn cycle. REQUIRED. @type {Player[]} */
		turnOrder: undefined,

		// Gamerules that also have dedicated slots in ICN notation...
        
		/**
         * A length-2 array: [rankWhitePromotes, rankBlackPromotes].
         * If one side can't promote, their rank is `null`.
         * If neither side can promote, this should be left as undefined.
         * @type {{ [players.WHITE]: number[], [players.BLACK]: number[]} | undefined}
         */
		promotionRanks: undefined,
		/**
         * An object containing arrays of types white and black can promote to, if it's legal for them to promote.
         * If one color can't promote, their list should be left undefined.
         * If no color can promote, this should be left undefined.
		 * @type {ColorVariantProperty<RawType[]> | undefined}
         */
		promotionsAllowed: {
			/** What piece types white can promote to: `['rooks','queens'...]`. If they can't promote, this should be left undefined. */
			[players.WHITE]: undefined,
			/** What piece types black can promote to: `['rooks','queens'...]`. If they can't promote, this should be left undefined. */
			[players.BLACK]: undefined,
		},
		/** How many plies (half-moves) can pass with no captures or pawn pushes until a draw is declared. */
		moveRule: undefined,
    
		// Gamerules that DON'T have a dedicated slot in ICN notation...
    
		/** The maximum number of steps any sliding piece can take. */
		slideLimit: undefined,
	};
	/** The turn order of the game. @type {Player[]} */
	this.turnOrder = undefined;
	/** Whos turn it is currently. @type {Player?} */
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
}

export {
	Game,
	PlayerData,
};