
// This script when called as a function using the new keyword, will return a new gamefile.

import organizedpieces from './organizedpieces.js';
import movepiece from './movepiece.js';
import gamefileutility from '../util/gamefileutility.js';
import initvariant from './initvariant.js';
import jsutil from '../../util/jsutil.js';
import clock from './clock.js';
import wincondition from './wincondition.js';
import gamerules from '../variants/gamerules.js';
import checkdetection from './checkdetection.js';
import legalmoves from './legalmoves.js';
// Type Definitions...

/** @typedef {import('../../util/math.js').Vec2} Vec2 */
/** @typedef {import('../../util/math.js').BoundingBox} BoundingBox */
/** @typedef {import('./movepiece.js').Move} Move */
/** @typedef {import('./movepiece.js').NullMove} NullMove */
/** @typedef {import('../../game/rendering/buffermodel.js').BufferModel} BufferModel */
/** @typedef {import('../../game/rendering/buffermodel.js').BufferModelInstanced} BufferModelInstanced */
/** @typedef {import('../variants/gamerules.js').GameRules} GameRules */
/** @typedef {import('../util/coordutil.js').CoordsKey} CoordsKey */
/** @typedef {import('../util/coordutil.js').Coords} Coords */
/** @typedef {import('../util/metadata.js').MetaData} MetaData */
/** @typedef {import('./clock.js').ClockValues} ClockValues */
/** @typedef {import('../util/coordutil.js').Coords} Coords */
/** @typedef {import('./organizedpieces.js').OrganizedPieces} OrganizedPieces*/
/** @typedef {import('../util/typeutil.js').Player} Player*/
/** @typedef {import('./state.js').EnPassant} EnPassant */
/** @typedef {import('../util/typeutil.js').RawType} RawType*/
/** @typedef {import('./checkdetection.js').Attacker} Attacker */
/** @typedef {import('../../game/rendering/piecemodels.js').MeshData} MeshData */
/** @typedef {import('../util/typeutil.js').Players} Players */
/** @typedef {import('../util/typeutil.js').TypeGroup} TypeGroup */
/** @typedef {import('../util/typeutil.js').PlayerGroup} PlayerGroup */
/** @typedef {import('./movesets.js').PieceMoveset} PieceMoveset */
/** @typedef {import('./clock.js').ClockData} ClockData*/

/**
 * Information about the beginning of the game (position, positionString, specialRights, turn)
 * @typedef {Object} StartSnapshot
 * @property {Map<CoordsKey, number>} position - In key format 'x,y': type
 * @property {string} positionString
 * @property {Set<CoordsKey>} specialRights
 * @property {EnPassant | undefined} enpassant - What square coords, if legal, enpassant capture is possible in the starting position of the game.
 * @property {number | undefined} moveRuleState - The state of the move-rule at the start of the game (how many plies have passed since a capture or pawn push)
 * @property {number} fullMove - This is the full-move number at the start of the game. Used for converting to ICN notation.
 * @property {number} playerCount - The number of players in this game (the number of unique players in the turn order)
 * @property {number} pieceCount - The count of pieces the game started with.
 * @property {BoundingBox} box - The bounding box surrounding the starting position, without padding.
 *                               For the classical position this is `{ left: 1, bottom: 1, right: 8, top: 8 }
 */

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

	/** Information about the beginning of the game. This isn't present in editor games.
	 * Use the current state of the board instead. @type {StartSnapshot | undefined} */
	this.startSnapshot = undefined;
	
	/** @type {GameRules} */
	this.gameRules = undefined;

	/** All pieces on the board @type {OrganizedPieces} */
	this.pieces = undefined;
	
	/** The object that contains the buffer model to render the pieces */
	this.mesh = {
		/** The amount the mesh data has been linearly shifted to make it closer to the origin, in coordinates `[x,y]`.
		 * This helps require less severe uniform translations upon rendering when traveling massive distances.
		 * The amount it is shifted depends on the nearest `REGEN_RANGE`. @type {Coords} */
		offset: undefined,
		/** Whether the position data of each piece mesh is inverted. This will be true if we're viewing black's perspective. @type {boolean} */
		inverted: undefined,
		/** An object containing the mesh data for each type of piece in the game. One for every type in `pieces` @type {{ [type: string]: MeshData }} */
		types: {},
	};

	/** Contains the movesets of every piece for this game. 
     * When this object's parameters are called as a function,
     * it returns that piece's moveset as an object.
     * Pawns NOT included. @type {TypeGroup<() => PieceMoveset>} */
	this.pieceMovesets = undefined;
	/** Contains a list of square in the immediate vicinity with
     * the names of pieces that could capture you from the distance.
     * This is used for efficient calculating if a king move would put you in check.
     * In the format: `{ '1,2': ['knights', 'chancellors'], '1,0': ['guards', 'king']... }`
     * DOES NOT include pawn moves. @type {Record<CoordsKey, RawType[]>} */
	this.vicinity = undefined;
	/** A variant of `vicinity`, except this only contains squares that
	 * a special piece MIGHT be able to capture using a special move.
	 * To find out for sure we'll have to calculate its legal moves. @type {Record<CoordsKey, RawType[]>} */
	this.specialVicinity = undefined;
	/** Contains the methods for executing special moves for this game. */
	this.specialMoves = undefined;

	/** True if the game is not timed. @type {boolean}*/
	this.untimed = undefined;
	/** The clocks of the game, if the game is timed. @type {ClockData | undefined} */
	this.clocks = undefined;

	/** Whether the gamefile is for the board editor. If true, the piece list will contain MUCH more undefined placeholders, and for every single type of piece, as pieces are added commonly in that! */
	this.editor = editor;
	// JSDoc stuff over...

	// Init things related to the variant, and the startSnapshot of the position
	initvariant.setupVariantGamerules(this, metadata, variantOptions); // Initiates gameRules, and pieceMovesets
	const startSnapshot = initvariant.genStartSnapshot(this, metadata, variantOptions);
	
	/** The number of half-moves played since the last capture or pawn push. */
	this.moveRuleState = startSnapshot.moveRuleState;
	/** The move list. @type {(Move | NullMove)[]} */
	this.moves = [];
	/** Index of the move we're currently viewing in the moves list. -1 means we're looking at the very beginning of the game. */
	this.moveIndex = -1;
	/** If enpassant is allowed at the front of the game, this defines the coordinates. @type {EnPassant | undefined} */
	this.enpassant = startSnapshot.enpassant;
	/** An object containing the information if each individual piece has its special move rights. @type {Set<CoordsKey>} */
	this.specialRights = startSnapshot.specialRights;
	/** Whos turn it currently is at the FRONT of the game.
     * This is to be distinguished from the `turn` property in the startSnapshot,
     * which is whos turn it was at the *beginning* of the game. @type {Player}*/
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

	const { pieces, pieceCount, existingTypes, existingRawTypes } = organizedpieces.processInitialPosition(
		startSnapshot.position,
		this.pieceMovesets,
		this.gameRules.turnOrder,
		this.gameRules.promotionsAllowed,
		this.editor
	);

	this.pieces = pieces;
	/** An array of all piece types that are in this game. Including their color information.` @type {number[]} */
	this.existingTypes = existingTypes;
	/** An array of all RAW piece types that are in this game. @type {RawType[]} */
	this.existingRawTypes = existingRawTypes;
	
	if (!this.editor) {
		// startSnapshot is only available in non-editor games,
		// since it would be changing constantly with every board edit.
		this.startSnapshot = jsutil.deepCopyObject(startSnapshot);
		this.startSnapshot.pieceCount = pieceCount;
		this.startSnapshot.box = gamefileutility.getStartingAreaBox(this);
	}

	// We can set these now, since processInitialPosition() trims the movesets of all pieces not in the game.
	this.colinearsPresent = gamefileutility.areColinearSlidesPresentInGame(this.pieceMovesets, this.pieces.slides);
	this.vicinity = legalmoves.genVicinity(this.pieceMovesets);
	// We can set this now, since existingRawTypes is now set.
	this.specialVicinity = legalmoves.genSpecialVicinity(metadata, existingRawTypes);

	gamefileutility.deleteUnusedSpecialMoves(this);
	// THIS HAS TO BE BEFORE gamefileutility.doGameOverChecks() below!!!
	// Do we need to convert any checkmate win conditions to royalcapture?
	if (!wincondition.isCheckmateCompatibleWithGame(this)) gamerules.swapCheckmateForRoyalCapture(this.gameRules);

	{ // Set the game's `inCheck` and `attackers` properties at the front of the game.
		const trackAttackers = gamefileutility.isOpponentUsingWinCondition(this, this.whosTurn, 'checkmate');
		const checkResults = checkdetection.detectCheck(this, this.whosTurn, trackAttackers); // { check: boolean, royalsInCheck: Coords[], attackers?: Attacker[] }
		this.inCheck = checkResults.check ? checkResults.royalsInCheck : false;
		if (trackAttackers) this.attackers = checkResults.attackers;
	}
	
	movepiece.makeAllMovesInGame(this, moves);
	/** The game's conclusion, if it is over. For example, `'1 checkmate'`
     * Server's gameConclusion should overwrite preexisting gameConclusion. */
	if (gameConclusion) this.gameConclusion = gameConclusion;
	else gamefileutility.doGameOverChecks(this);

	clock.set(this, clockValues);
};

// Typedef export DO NOT USE
export { gamefile };

export default gamefile;