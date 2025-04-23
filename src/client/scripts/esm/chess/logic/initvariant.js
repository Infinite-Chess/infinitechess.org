
/**
 * This script prepares our variant when a game is constructed
 */

import variant from '../variants/variant.js';

/** 
 * Type Definitions 
 * @typedef {import('./gamefile.js').gamefile} gamefile
 * @typedef {import('./gamefile.js').StartSnapshot} StartSnapshot
 * @typedef {import('../../game/chess/gameslot.js').VariantOptions} VariantOptions
 */

"use strict";


/**
 * Initializes gameRules of the provided gamefile.
 * And inits the piece movesets.
 * 
 * To load a custom position, include the options within the `options` parameter!
 * All options are a snapshot of the starting position, before any moves are forwarded.
 * @param {gamefile} gamefile - The gamefile to initialize
 * @param {Object} metadata - The metadata of the variant. This requires the "Variant" metadata, unless `options` is specified with a startingPosition. "UTCDate" & "UTCTime" are required if you want to load a different version of the desired variant.
 * @param {VariantOptions} [options] - An object that may contain various properties: `turn`, `fullMove`, `enpassant`, `moveRule`, `startingPosition`, `specialRights`, `gameRules`. If startingPosition is not specified, the metadata must contain the "Variant".
 */
function setupVariantGamerules(gamefile, metadata, options) {
	// Ignores the "Variant" metadata, and just uses the specified gameRules
	if (options) gamefile.gameRules = options.gameRules;
	// Default (built-in variant, not pasted)
	else gamefile.gameRules = variant.getGameRulesOfVariant(metadata); 

	initPieceMovesets(gamefile, metadata, options?.gameRules.slideLimit);
}

/**
 * Sets the pieceMovesets and specialMoves functions of the gamefile.
 * @param {gamefile} gamefile - The gamefile
 * @param {Object} metadata - The metadata of the variant. This requires the "Variant" metadata, unless `options` is specified with a startingPosition. "UTCDate" & "UTCTime" are required if you want to load a different version of the desired variant.
 * @param {number} [slideLimit] Overrides the slideLimit gamerule of the variant, if specified.
*/
function initPieceMovesets(gamefile, metadata, slideLimit) {
	// The movesets and methods for detecting and executing special moves
	// are attached to the gamefile. This is because different variants
	// can have different movesets for each piece. For example, the slideLimit gamerule.
	gamefile.pieceMovesets = variant.getMovesetsOfVariant(metadata, slideLimit);
	gamefile.specialMoves = variant.getSpecialMovesOfVariant(metadata);
}

/**
 * 
 * To load a custom position, include the options within the `options` parameter!
 * All options are a snapshot of the starting position, before any moves are forwarded.
 * @param {gamefile} gamefile - The gamefile to initialize
 * @param {Object} metadata - The metadata of the variant. This requires the "Variant" metadata, unless `options` is specified with a startingPosition. "UTCDate" & "UTCTime" are required if you want to load a different version of the desired variant.
 * @param {VariantOptions} [options] - An object that may contain various properties: `turn`, `fullMove`, `enpassant`, `moveRuleState`, `startingPosition`, `specialRights`, `gameRules`. If startingPosition is not specified, the metadata must contain the "Variant".
 * @returns {StartSnapshot} The starting snapshot of the game.
 */
function genStartSnapshot(gamefile, metadata, options) {
	let enpassant;
	let moveRuleState;
	let position;
	let specialRights;
	
	// Even IF options are provided. If the pasted game doesn't contain position information
	// then we still have to grab it from the Variant metadata!
	if (!options?.startingPosition) {
		({ position, specialRights } = variant.getStartingPositionOfVariant(metadata)); 
	} else {
		position = options.startingPosition;
		specialRights = options.state_global.specialRights;
	}

	if (options) {
		enpassant = options.state_global.enpassant;
		if (options.gameRules.moveRule) {
			if (options.state_global.moveRuleState === undefined) throw Error("moveRuleState is required with gameRule moveRule");
			moveRuleState = options.state_global.moveRuleState;
		}
	} else {
		// Every variant has the exact same initial moveRuleState value.
		if (gamefile.gameRules.moveRule) moveRuleState = 0;
	}
	
	return {
		position,
		specialRights,
		enpassant,
		moveRuleState,
		playerCount: new Set(gamefile.gameRules.turnOrder).size,
		fullMove: options?.fullMove ?? 1, // Every variant has the exact same fullMove value.
		pieceCount: position.size,
	};
}

// function setupCOAIP(gamefile) {

//     // const piecesByKey = getPositionOfCoaip()

//     // Performance statistics (ON NAVIARY'S MACHINE) when drastically increasing the piece count in the game:
//     // 1. Recalculating the piece models every frame:       *Phone lags after rendering 6,000 pieces. *Computer lags after 20,000
//     // 2. Recalculating the piece models only when needed:  *Phone lags after 400,000 pieces.         *Computer after 3.2 million
//     // This is great! This means the rendering method is very efficient. This will help make games with infinite pieces possible.

//     // A perspective view range of 1000 in each direction (4000x4000 maximum render range box)
//     // means at most, when a queen is selected, 8,000 squares are rendered (orthogonals are both 1 quad),
//     // which is only 3% of our PHONE CPU limit!!!!!! BUT the highlighted squares buffer models are now 3D..

//     // Uncomment the following to drastically lengthen the pawn frontlines (for testing purposes)
//     // Dev release
//     // const count = 25_000; // 81 Seconds
//     // const count = 20_000; // 39 Seconds
//     // const count = 15_000; // 20 Seconds
//     // const count = 10_000; // 8.4 Seconds   ~50,000 piece game
//     // const count = 5_000; // 2 Seconds
//     // const count = 2_000; // 2 Seconds

//     // Last release
//     // const count = 500; // 17- Seconds
//     // // const count = 300; // 5 Seconds   ~1500 piece game

//     // const count = 250000; // 5 Seconds   ~1500 piece game
//     // for (let i = 12; i <= count; i++) {
//     //     let key = coordutil.getKeyFromCoords([i, 2])
//     //     piecesByKey[key] = 'pawnsW';
//     //     key = coordutil.getKeyFromCoords([i, 7])
//     //     piecesByKey[key] = 'pawnsB';
//     // }
//     // for (let i = -3; i >= -count; i--) {
//     //     let key = coordutil.getKeyFromCoords([i, 2])
//     //     piecesByKey[key] = 'pawnsW';
//     //     key = coordutil.getKeyFromCoords([i, 7])
//     //     piecesByKey[key] = 'pawnsB';
//     // }

//     // const piecesByType = organizedlines.buildStateFromKeyList(piecesByKey)

//     // gamefile.startingPosition = piecesByType;

//     gamefile.gameRules = getGameRulesOfVariant(gamefile.variant)
//     initPieceMovesets(gamefile.gameRules)
// }

export default {
	setupVariantGamerules,
	genStartSnapshot,
};