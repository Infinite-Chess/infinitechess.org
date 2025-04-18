
/**
 * This script prepares our variant when a game is constructed
 */

import formatconverter from './formatconverter.js';
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
 * @param {VariantOptions} [options] - An object that may contain various properties: `turn`, `fullMove`, `enpassant`, `moveRule`, `positionString`, `startingPosition`, `specialRights`, `gameRules`. If startingPosition is not specified, the metadata must contain the "Variant".
 */
function setupVariantGamerules(gamefile, metadata, options) {
	if (options) {
		// Ignores the "Variant" metadata, and just uses the specified gameRules
		if (options.moveRule) {
			const [, max] = options.moveRule.split('/');
			options.gameRules.moveRule = Number(max);
		}
		gamefile.gameRules = options.gameRules;
	}
	else {
		// Default (built-in variant, not pasted)
		gamefile.gameRules = variant.getGameRulesOfVariant(metadata);
	}

	initPieceMovesets(gamefile, metadata);
}

/**
 * Sets the pieceMovesets and specialMoves functions of the gamefile.
 * @param {gamefile} gamefile - The gamefile
 * @param {Object} metadata - The metadata of the variant. This requires the "Variant" metadata, unless `options` is specified with a startingPosition. "UTCDate" & "UTCTime" are required if you want to load a different version of the desired variant.
 */
function initPieceMovesets(gamefile, metadata) {
	// The movesets and methods for detecting and executing special moves
	// are attached to the gamefile. This is because different variants
	// can have different movesets for each piece. For example, the slideLimit gamerule.
	gamefile.pieceMovesets = variant.getMovesetsOfVariant(metadata);
	gamefile.specialMoves = variant.getSpecialMovesOfVariant(metadata);
}

/**
 * 
 * To load a custom position, include the options within the `options` parameter!
 * All options are a snapshot of the starting position, before any moves are forwarded.
 * @param {gamefile} gamefile - The gamefile to initialize
 * @param {Object} metadata - The metadata of the variant. This requires the "Variant" metadata, unless `options` is specified with a startingPosition. "UTCDate" & "UTCTime" are required if you want to load a different version of the desired variant.
 * @param {VariantOptions} [options] - An object that may contain various properties: `turn`, `fullMove`, `enpassant`, `moveRule`, `positionString`, `startingPosition`, `specialRights`, `gameRules`. If startingPosition is not specified, the metadata must contain the "Variant".
 */
function genStartSnapshot(gamefile, metadata, options) {
	let fullMove;
	let enpassant;
	let moveRuleState;
	let positionString;
	let position;
	let specialRights;
	
	if (options) {
		({ fullMove, enpassant, positionString, specialRights } = options);
		position = options.startingPosition;
		if (options.moveRule) {
			const [state] = options.moveRule.split('/');
			moveRuleState = Number(state);
		}
	} else {
		({ positionString, position, specialRights } = variant.getStartingPositionOfVariant(metadata)); 
		// Every variant has the exact same initial moveRuleState value.
		if (gamefile.gameRules.moveRule) moveRuleState = 0;
		fullMove = 1; // Every variant has the exact same fullMove value.
	}
	
	const playerCount = new Set(gamefile.gameRules.turnOrder).size;
	
	return {
		position,
		positionString,
		specialRights,
		enpassant,
		moveRuleState,
		fullMove,
		playerCount,
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