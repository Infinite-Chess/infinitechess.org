
// This script when called as a function using the new keyword, will return a new gamefile.

import organizedlines from './organizedlines.js';
import movepiece from './movepiece.js';
import gamefileutility from '../util/gamefileutility.js';
import initvariant from './initvariant.js';
import jsutil from '../../util/jsutil.js';
import clock from './clock.js';
import wincondition from './wincondition.js';
import gamerules from '../variants/gamerules.js';
import checkdetection from './checkdetection.js';
// Type Definitions...

/** @typedef {import('../../util/math.js').Vec2} Vec2 */
/** @typedef {import('../../util/math.js').BoundingBox} BoundingBox */
/** @typedef {import('./movepiece.js').Move} Move */
/** @typedef {import('../../game/rendering/buffermodel.js').BufferModel} BufferModel */
/** @typedef {import('../../game/rendering/buffermodel.js').BufferModelInstanced} BufferModelInstanced */
/** @typedef {import('../variants/gamerules.js').GameRules} GameRules */
/** @typedef {import('../util/coordutil.js').CoordsKey} CoordsKey */
/** @typedef {import('../util/coordutil.js').Coords} Coords */
/** @typedef {import('../util/metadata.js').MetaData} MetaData */
/** @typedef {import('./clock.js').ClockValues} ClockValues */
/** @typedef {import('../util/coordutil.js').Coords} Coords */
/** @typedef {import('./organizedlines.js').PiecesByType} PiecesByType */
/** @typedef {import('./organizedlines.js').PiecesByKey} PiecesByKey */
/** @typedef {import('./organizedlines.js').LinesByStep} LinesByStep */
/** @typedef {import('./state.js').EnPassant} EnPassant */
/** @typedef {import('./checkdetection.js').Attacker} Attacker */
/** @typedef {import('../../game/rendering/piecemodels.js').MeshData} MeshData */

'use strict'; 

/**
 * Constructs a gamefile from provided arguments. Use the *new* keyword.
 * @param {MetaData} metadata - An object containing the property `Variant`, and optionally `UTCDate` and `UTCTime`, which can be used to extract the version of the variant. Without the date, the latest version will be used.
 * @param {Object} [options] - Options for constructing the gamefile.
 * @param {string[]} [options.moves=[]] - Existing moves, if any, to forward to the front of the game. Should be specified if reconnecting to an online game or pasting a game. Each move should be in the most compact notation, e.g., `['1,2>3,4','10,7>10,8Q']`.
 * @param {Object} [options.variantOptions] - If a custom position is needed, for instance, when pasting a game, then these options should be included.
 * @param {Object} [options.gameConclusion] - The conclusion of the game, if loading an online game that has already ended.
 * @param {ClockValues} [options.clockValues] - Any already existing clock values for the gamefile
 * @param {true} [options.editor] - Whether the gamefile is for the board editor. If true, the piece list will contain MUCH more undefined placeholders, and for every single type of piece, as pieces are added commonly in that!
 * @returns {Object} The gamefile
 */
function gamefile(metadata, { moves = [], variantOptions, gameConclusion, clockValues, editor } = {}) {

	// Everything for JSDoc stuff...

	/** Information about the game @type {MetaData} */
	this.metadata = metadata;
    
	/** Information about the beginning of the game (position, positionString, specialRights, turn) */
	this.startSnapshot = {
		/** In key format 'x,y':'type' @type {PiecesByKey} */
		position: undefined,
		positionString: undefined,
		specialRights: undefined,
		/** What square coords, if legal, enpassant capture is possible in the starting position of the game. @type {EnPassant | undefined }*/
		enpassant: undefined,
		/** The state of the move-rule at the start of the game (how many plies have passed since a capture or pawn push) */
		moveRuleState: undefined,
		/** This is the full-move number at the start of the game. Used for converting to ICN notation. */
		fullMove: undefined,
		/** The number of players in this game (the number of unique colors in the turn order) */
		playerCount: undefined,
		/** The count of pieces the game started with. @type {number} */
		pieceCount: undefined,
		/** The bounding box surrounding the starting position, without padding.
		 * For the classical position this is `{ left: 1, bottom: 1, right: 8, top: 8 }`
         * @type {BoundingBox} */
		box: undefined,
		/** An array of all types of pieces that are in this game, without their color extension: `['pawns','queens']` @type {string[]} */
		existingTypes: undefined,
		/** Possible sliding moves in this game, dependant on what pieces there are: `[[1,1],[1,0]]` @type {Vec2[]}*/
		slidingPossible: undefined,
		/** Whether hippogonal lines, or greater, are present in the gamefile.
		 * True if there are knightriders, or greater, riders. @type {boolean} */
		hippogonalsPresent: undefined,
		/** Whether colinear lines are present in the gamefile.
		 * (e.g. [1,0] and [2,0] are colinear) @type {boolean} */
		colinearsPresent: undefined,
	};
    
	/** @type {GameRules} */
	this.gameRules = {
		winConditions: undefined,
		promotionRanks: undefined,
		promotionsAllowed: {
			/** An array of types white can promote to, with the W/B removed from the end: `['queens','rooks']` @type {Array} */
			white: undefined,
			/** An array of types black can promote to, with the W/B removed from the end: `['queens','rooks']` @type {Array} */
			black: undefined,
		},
		slideLimit: undefined,

		/** An array of teams: `['white','black']` @type {string[]} */
		turnOrder: undefined,

		/** How many plies (half-moves) may pass until a draw is automatically pronounced! */
		moveRule: undefined
	};

	/** Pieces organized by type: `{ queensW:[[1,2],[2,3]] }` @type {PiecesByType} */
	this.ourPieces = undefined;
	/** Pieces organized by key: `{ '1,2':'queensW', '2,3':'queensW' }` @type {PiecesByKey} */
	this.piecesOrganizedByKey = undefined;
	/** Pieces organized by lines: `{ '1,0' { 2:[{type:'queensW',coords:[1,2]}] } }` @type {LinesByStep} */
	this.piecesOrganizedByLines = undefined;
	
	/** The object that contains the buffer model to render the pieces */
	this.mesh = {
		/** The amount the mesh data has been linearly shifted to make it closer to the origin, in coordinates `[x,y]`.
		 * This helps require less severe uniform translations upon rendering when traveling massive distances.
		 * The amount it is shifted depends on the nearest `REGEN_RANGE`. @type {Coords} */
		offset: undefined,
		/** Whether the position data of each piece mesh is inverted. This will be true if we're viewing black's perspective. @type {boolean} */
		inverted: undefined,
		/** An object containing the mesh data for each type of piece in the game. One for every type in `ourPieces` @type {{ [type: string]: MeshData }} */
		types: {},
	};

	/** The object that contains the buffer model to render the voids */
	this.voidMesh = {
		/** High precision Float64Array for performing arithmetic. @type {Float64Array} */
		instanceData64: undefined,
		/** The buffer model of the void squares. These are rendered separately
         * from the pieces because if they used a texture they would form gridlines.
         * @type {BufferModelInstanced} */
		model: undefined,
	};

	/** Contains the movesets of every piece for this game. 
     * When this object's parameters are called as a function,
     * it returns that piece's moveset as an object.
     * Pawns NOT included. */
	this.pieceMovesets = undefined;
	/** Contains a list of square in the immediate vicinity with
     * the names of pieces that could capture you from the distance.
     * This is used for efficient calculating if a king move would put you in check.
     * In the format: `{ '1,2': ['knights', 'chancellors'], '1,0': ['guards', 'king']... }`
     * DOES NOT include pawn moves. @type {Record<CoordsKey, string[]>} */
	this.vicinity = undefined;
	/** A variant of `vicinity`, except this only contains squares that
	 * a special piece MIGHT be able to capture using a special move.
	 * To find out for sure we'll have to calculate its legal moves. @type {Record<CoordsKey, string[]>} */
	this.specialVicinity = undefined;
	/** Contains the methods for executing special moves for this game. */
	this.specialMoves = undefined;

	/** The clocks of the game, if the game is timed. */
	this.clocks = {
		/** The time each player has remaining, in milliseconds. @type {{ [color: string]: number | null }}*/
		currentTime: {
			white: undefined,
			black: undefined,
		},

		/** Contains information about the start time of the game. */
		startTime: {
			/** The number of minutes both sides started with. @type {null | number} */
			minutes: undefined,
			/** The number of miliseconds both sides started with. @type {null | number}  */
			millis: undefined,
			/** The increment used, in milliseconds. @type {null | number} */
			increment: undefined,
		},
		/** We need this separate from gamefile's "whosTurn", because when we are
		 * in an online game and we make a move, we want our Clock to continue
		 * ticking until we receive the Clock information back from the server! @type {string} */
		colorTicking: undefined,
		/** The amount of time in millis the current player had at the beginning of their turn, in milliseconds.
		 * When set to undefined no clocks are ticking @type {number | null} */
		timeRemainAtTurnStart: undefined,
		/** The time at the beginning of the current player's turn, in milliseconds elapsed since the Unix epoch. @type {number | undefined} */
		timeAtTurnStart: undefined,
		/** True if the game is not timed. @type {Boolean}*/
		untimed: undefined,
	};
	/** Whether the gamefile is for the board editor. If true, the piece list will contain MUCH more undefined placeholders, and for every single type of piece, as pieces are added commonly in that! */
	this.editor = editor;

	// JSDoc stuff over...

	// Init things related to the variant, and the startSnapshot of the position
	initvariant.setupVariant(this, metadata, variantOptions); // Initiates startSnapshot, gameRules, and pieceMovesets
	/** The number of half-moves played since the last capture or pawn push. */
	this.moveRuleState = this.gameRules.moveRule ? this.startSnapshot.moveRuleState : undefined;

	gamefileutility.initStartingAreaBox(this);

	/** The move list. @type {Move[]} */
	this.moves = [];
	/** Index of the move we're currently viewing in the moves list. -1 means we're looking at the very beginning of the game. */
	this.moveIndex = -1;
	/** If enpassant is allowed at the front of the game, this defines the coordinates. @type {EnPassant | undefined} */
	this.enpassant = jsutil.deepCopyObject(this.startSnapshot.enpassant);
	/** An object containing the information if each individual piece has its special move rights. */
	this.specialRights = jsutil.deepCopyObject(this.startSnapshot.specialRights);
	/** Whos turn it currently is at the FRONT of the game.
     * This is to be distinguished from the `turn` property in the startSnapshot,
     * which is whos turn it was at the *beginning* of the game. */
	this.whosTurn = this.gameRules.turnOrder[0];
	/** If the currently-viewed move is in check, this will be a list of coordinates
     * of all the royal pieces in check: `[[5,1],[10,1]]`, otherwise *false*. @type {Coords[] | false} */
	this.inCheck = false;
	/** List of maximum 2 pieces currently checking whoever's turn is next,
     * with their coords and slidingCheck property. ONLY USED with `checkmate` wincondition!!
     * Only used to calculate legal moves, and checkmate. @type {Attacker[]}*/
	this.attackers = undefined;
	/** If 3-Check is enabled, this is a running count of checks given: `{ white: 0, black: 0 }` */
	this.checksGiven = undefined;
	/** @type {false | string} */
	this.gameConclusion = false;

	this.ourPieces = organizedlines.buildStateFromKeyList(this);
	organizedlines.addMoreUndefineds(this); // Add several undefined placeholders in the lists, for when pieces are added (promotion, arrow addition, etc.)

	this.startSnapshot.pieceCount = gamefileutility.getPieceCountOfGame(this);
	gamefileutility.deleteUnusedMovesets(this);

	// THIS HAS TO BE BEFORE gamefileutility.doGameOverChecks() below!!!
	// Do we need to convert any checkmate win conditions to royalcapture?
	if (!wincondition.isCheckmateCompatibleWithGame(this)) gamerules.swapCheckmateForRoyalCapture(this.gameRules);
    
	organizedlines.initOrganizedPieceLists(this);

	{ // Set the game's `inCheck` and `attackers` properties at the front of the game.
		const trackAttackers = gamefileutility.isOpponentUsingWinCondition(this, this.whosTurn, 'checkmate');
		const checkResults = checkdetection.detectCheck(this, this.whosTurn, trackAttackers); // { check: boolean, royalsInCheck: Coords[], attackers?: Attacker[] }
		this.inCheck = checkResults.check ? checkResults.royalsInCheck : false;
		if (trackAttackers) this.attackers = checkResults.attackers;
	}

	movepiece.makeAllMovesInGame(this, moves);
	/** The game's conclusion, if it is over. For example, `'white checkmate'`
     * Server's gameConclusion should overwrite preexisting gameConclusion. */
	if (gameConclusion) this.gameConclusion = gameConclusion;
	else gamefileutility.doGameOverChecks(this);

	clock.set(this, clockValues);
};

// Typedef export DO NOT USE
export { gamefile };

export default gamefile;