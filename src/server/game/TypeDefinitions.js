
// This script contains many of our useful
// type definitions for web sockets and our game.
// And has no other script module dependancies.




/** @typedef {import("./wsutility").CustomWebSocket} CustomWebSocket */


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
	/** The white player: `{ member }` or `{ browser }` */
	this.white = undefined;
	/** The black player: `{ member }` or `{ browser }` */
	this.black = undefined;
	/** The moves list of the game. Each move is a string that looks like `8,1>16,1`. @type {string[]} */
	this.moves = undefined;
	/** The gamerules of the variant. */
	this.gameRules = {
		/** An object containing lists of what win conditions each color can win by. This is REQUIRED. */
		winConditions: {
			/** A list of win conditions white can win by. REQUIRED. @type {string[]} */
			white: undefined,
			/** A list of win conditions black can win by. REQUIRED. @type {string[]} */
			black: undefined,
		},
		/** A list of colors that make up one full turn cycle. Normally: `['white','black']`. REQUIRED. */
		turnOrder: undefined,

		// Gamerules that also have dedicated slots in ICN notation...
        
		/**
         * A length-2 array: [rankWhitePromotes, rankBlackPromotes].
         * If one side can't promote, their rank is `null`.
         * If neither side can promote, this should be left as undefined.
         * @type {number[]}
         */
		promotionRanks: undefined,
		/**
         * An object containing arrays of types white and black can promote to, if it's legal for them to promote.
         * If one color can't promote, their list should be left undefined.
         * If no color can promote, this should be left undefined.
         */
		promotionsAllowed: {
			/** What piece types white can promote to: `['rooks','queens'...]`. If they can't promote, this should be left undefined. */
			white: undefined,
			/** What piece types black can promote to: `['rooks','queens'...]`. If they can't promote, this should be left undefined. */
			black: undefined,
		},
		/** How many plies (half-moves) can pass with no captures or pawn pushes until a draw is declared. */
		moveRule: undefined,
    
		// Gamerules that DON'T have a dedicated slot in ICN notation...
    
		/** The maximum number of steps any sliding piece can take. */
		slideLimit: undefined,
	};
	/** The turn order of the game. `["white", "black"]` @type {string[]} */
	this.turnOrder = undefined;
	/** Whos turn it is currently. */
	this.whosTurn = undefined;
	/** If the game is over, this is a string. For example, "white checkmate". Otherwise false. */
	this.gameConclusion = undefined;

	/** White's current time remaining, in milliseconds, if the game is timed, otherwise undefined. */
	this.timerWhite = undefined;
	/** Black's current time remaining, in milliseconds, if the game is timed, otherwise undefined. */
	this.timerBlack = undefined;

	/** The amount of time remaining, in milliseconds, the current player had at the beginning of their turn. */
	this.timeRemainAtTurnStart = undefined;
	/** The time, in milliseconds, of the javascript process since the beginning of the current player's turn. */
	this.timeAtTurnStart = undefined;
	/** The ID of the timeout which will auto-lose the player
     * whos turn it currently is when they run out of time. */
	this.autoTimeLossTimeoutID = undefined;

	/** Player white's socket, if they are connected. @type {CustomWebSocket} */
	this.whiteSocket = undefined;
	/** Player black's socket, if they are connected. @type {CustomWebSocket} */
	this.blackSocket = undefined;

	/** The ID of the timeout which will auto-lose the player
     * whos turn it currently is if they go AFK too long. */
	this.autoAFKResignTimeoutID = undefined;
	/** The time the current player will be auto-resigned by
     * AFK if they are currently AFK. */
	this.autoAFKResignTime = undefined;

	/** Information about the draw offers of the game. */
	this.drawOffers = {
		/** Whether a current draw offer is extended. If so, this is the color who extended it, otherwise undefined. @type {string | undefined} */
		state: undefined,
		/** Ply (half-move) numbers of when each color last extended a draw offer. Players may not extend draw offers too rapidly. */
		lastOfferPly: {
			/** The last ply (half-move) WHITE extended a draw offer, if they have, otherwise undefined. @type {number | undefined} */
			white: undefined,
			/** The last ply (half-move) BLACK extended a draw offer, if they have, otherwise undefined. @type {number | undefined} */
			black: undefined,
		},
	};

	/** Contains information about which sides are
     * about to lose by disconnection. */
	this.disconnect = {
		/** Contains the timeout ID's for the timer *that will start* the timer to auto-lose by disconnection. */
		startTimer: {
			/** The ID of the timeout which will start the auto-lose disconnection timer for white. */
			white: undefined,
			/** The ID of the timeout which will start the auto-lose disconnection timer for black. */
			black: undefined
		},
		/** Contains the timeout ID's for the timer that will auto-lose the player by disconnection. */
		autoResign: {
			white: {
				timeToAutoLoss: undefined,
				timeoutID: undefined,
				wasByChoice: undefined,
			},
			black: {
				timeToAutoLoss: undefined,
				timeoutID: undefined,
				wasByChoice: undefined,
			}
		}
	};

	/** The ID of the timer to delete the game after it has ended.
     * This can be used to cancel it in case a hacking was reported. */
	this.deleteTimeoutID = undefined;
}

export {
	Game
};