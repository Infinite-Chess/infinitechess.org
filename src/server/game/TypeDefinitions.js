
// This script contains many of our useful
// type definitions for web sockets and our game.
// And has no other script module dependancies.



/** A Socket constructor, **PURELY** for useful JSDoc dropdowns.
 * This should NEVER be called! Objects type's can be declared as this. */
function Socket() {
    console.error("THIS CONSTRUCTOR SHOULD NOT BE CALLED. It is purely for JSDoc info.");

    /** Our custom-entered information about this websocket.
     * To my knowledge (Naviary), the `metadata` property isn't already in use. */
    this.metadata = {
        /** What subscription lists they are subscribed to. Possible: "invites" / "game" */
        subscriptions: {
            /** Whether they are subscribed to the invites list. */
            invites: undefined,
            /** Will be defined if they are subscribed to, or in, a game. */
            game: {
                /** The id of the game they're in. @type {string} */
                id: undefined,
                /** The color they are playing as. @type {string} */
                color: undefined
            }
        },
        /** The user-agent property of the original websocket upgrade's req.headers */
        userAgent: undefined,
        /** The member's username, if they are signed in. This or {@link this.metadata['browser-id']} will always be defined. */
        user: undefined,
        /** The member's role, if they have one (e.g. "owner").*/
        role: undefined,
        /** The user's `browser-id` cookie, if they are not signed in. This or {@link this.metadata.user} will always be defined. */
        'browser-id': undefined,
        /** The id of their websocket. */
        id: undefined,
        /** The socket's IP address. */
        IP: undefined,
        /** The timeout ID that can be used to cancel the timer that will
         * expire the socket connection. This is useful if it closes early. */
        clearafter: undefined,
        /** A reference to websocketserver.js's `sendmessage` function.
         * Sends a message to the client. */
        sendmessage: undefined,
        /** The timeout ID to cancel the timer that will send an empty
         * message to this socket just to verify they are alive and thinking. */
        renewConnectionTimeoutID: undefined,
        /** A function that when called, returns true if this socket has an open invite. @type {Function} */
        hasInvite: undefined,
        /** Their preferred language. For example, 'en-US'. This is determined by their `i18next` cookie. */
        i18next: undefined,
    };
}


// I can declare this type definition like so, because there's no nesting.
/**
 * An incoming websocket server message.
 * @typedef {Object} WebsocketMessage
 * @property {string} route - What subscription/route the message should be forwarded to (e.g. "general", "invites", "game").
 * @property {string} action - What action to perform with this message's data (e.g. sub/unsub/createinvite/cancelinvite/acceptinvite).
 * @property {*} value - The message contents.
 * @property {number} id - The ID of the message to echo, so the client knows we're still connected.
 */


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
    /** The turn order of the game. `["white", "black"]` @type {string[]} */
    this.turnOrder = undefined
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
    /** The time, in milliseconds since the Unix epoch,
     * at which the current player will lose on time if they don't move,
     * IF THE GAME IS TIMED, otherwise undefined. */
    this.timeNextPlayerLosesAt = undefined;
    /** The ID of the timeout which will auto-lose the player
     * whos turn it currently is when they run out of time. */
    this.autoTimeLossTimeoutID = undefined;

    /** Player white's socket, if they are connected. @type {Socket} */
    this.whiteSocket = undefined;
    /** Player black's socket, if they are connected. @type {Socket} */
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

module.exports = {
    Socket,
    // WebsocketMessage, // Type definitions declared in this manner don't need to be exported for some reason? Other scripts can still import it
    Game
};