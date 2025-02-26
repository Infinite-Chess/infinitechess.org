
/**
 * This script stores our variants, and contains methods for
 * retrieving the game rules, or move sets of any given variant.
 */


import type { Coords, Movesets, PieceMoveset } from '../logic/movesets.js';
import type { Move } from '../logic/movepiece.js';
import type { Piece } from '../logic/boardchanges.js';
// @ts-ignore
import type gamefile from '../logic/gamefile.js';
// @ts-ignore
import type { GameRules } from './gamerules.js';


import jsutil from '../../util/jsutil.js';
import timeutil from '../../util/timeutil.js';
import colorutil from '../util/colorutil.js';
import fivedimensionalgenerator from './fivedimensionalgenerator.js';
import movesets from '../logic/movesets.js';
import fivedimensionalmoves from '../logic/fivedimensionalmoves.js';
// @ts-ignore
import formatconverter from '../logic/formatconverter.js';
// @ts-ignore
import omega3generator from './omega3generator.js';
// @ts-ignore
import omega4generator from './omega4generator.js';
// @ts-ignore
import typeutil from '../util/typeutil.js';
// @ts-ignore
import specialmove from '../logic/specialmove.js';



/** An object that describes what modifications to make to default gamerules in a variant. */
interface GameRuleModifications {
	promotionRanks?: { [color: string]: number[] } | null,
	moveRule?: number | null,
	turnOrder?: string[],
	promotionsAllowed?: ColorVariantProperty<string[]>
	winConditions?: ColorVariantProperty<string[]>
	slideLimit?: number
}

/** Keys (if present) should be timestamps */
type TimeVariantProperty<T> = T | {
	[timestamp: number]: T
}

/** Keys should be colors */
type ColorVariantProperty<T> = {
	[color: string]: T
}

/** A single variant entry object in the variant dictionary */
interface Variant {
	positionString?: TimeVariantProperty<string>,
	generator?: {
		algorithm: () => Position,
		rules: {
			pawnDoublePush: boolean,
			castleWith?: string
		}
	},
	/**
	 * A function that returns the movesetModifications for the variant.
	 * The movesetModifications do NOT need to contain the movesets of every piece,
	 * but only of the pieces you do not want to use their default movement!
	 */
	movesetGenerator?: TimeVariantProperty<() => Movesets>,
	gameruleModifications: TimeVariantProperty<GameRuleModifications>
	/** Special Move overrides */
	specialMoves?: TimeVariantProperty<{
		[piece: string]: SpecialMoveFunction
	}>
	/**
	 * Used for check calculation.
	 * If we have any overrides for specialMoves, we should have overrides for
	 * this, because it means the piece could make captures on different locations.
	 */
	specialVicinity?: TimeVariantProperty<SpecialVicinity>
}

/**
 * Function that queues all of the changes a special move makes when executed.
 * 
 * TODO: Move this to specialmove.ts when it's converted to typescript.
 */
// eslint-disable-next-line no-unused-vars
type SpecialMoveFunction = (gamefile: gamefile, piece: Piece, move: Move) => boolean;

/**
 * An object storing the squares in the immediate vicinity
 * a piece has a CHANCE of making a special-move capture from.
 * 
 * TODO: Move this to specialmove.ts when it's converted to typescript.
 */
interface SpecialVicinity {
	/**
	 * `piece` is the type without color information. (i.e. 'pawns')
	 * The value is a list of coordinates that it may be possible for that piece type to make a special capture from that distance.
	 */
	[piece: string]: Coords[]
}

/**
 * A position in keys format. Entries look like: `"5,2": "pawnsW"`
 * 
 * TODO: Move to organizedlines.ts
 */
interface Position {
	[coordKey: string]: string
}

"use strict";

const positionStringOfClassical = 'P1,2+|P2,2+|P3,2+|P4,2+|P5,2+|P6,2+|P7,2+|P8,2+|p1,7+|p2,7+|p3,7+|p4,7+|p5,7+|p6,7+|p7,7+|p8,7+|R1,1+|R8,1+|r1,8+|r8,8+|N2,1|N7,1|n2,8|n7,8|B3,1|B6,1|b3,8|b6,8|Q4,1|q4,8|K5,1+|k5,8+';
const positionStringOfCoaIP = 'P-2,1+|P-1,2+|P0,2+|P1,2+|P2,2+|P3,2+|P4,2+|P5,2+|P6,2+|P7,2+|P8,2+|P9,2+|P10,2+|P11,1+|P-4,-6+|P-3,-5+|P-2,-4+|P-1,-5+|P0,-6+|P9,-6+|P10,-5+|P11,-4+|P12,-5+|P13,-6+|p-2,8+|p-1,7+|p0,7+|p1,7+|p2,7+|p3,7+|p4,7+|p5,7+|p6,7+|p7,7+|p8,7+|p9,7+|p10,7+|p11,8+|p-4,15+|p-3,14+|p-2,13+|p-1,14+|p0,15+|p9,15+|p10,14+|p11,13+|p12,14+|p13,15+|HA-2,-6|HA11,-6|ha-2,15|ha11,15|R-1,1|R10,1|r-1,8|r10,8|CH0,1|CH9,1|ch0,8|ch9,8|GU1,1+|GU8,1+|gu1,8+|gu8,8+|N2,1|N7,1|n2,8|n7,8|B3,1|B6,1|b3,8|b6,8|Q4,1|q4,8|K5,1+|k5,8+';

const defaultWinConditions = { white: ['checkmate'], black: ['checkmate'] };
const KOTHWinConditions = { white: ['checkmate','koth'], black: ['checkmate','koth'] };
const defaultTurnOrder = ['white', 'black'];

const defaultPromotions = ['knights','bishops','rooks','queens'];
const defaultPromotionsAllowed = repeatPromotionsAllowedForEachColor(defaultPromotions);
const coaIPPromotions = [...defaultPromotions,'guards','chancellors','hawks'];
const coaIPPromotionsAllowed = repeatPromotionsAllowedForEachColor(coaIPPromotions);

const gameruleModificationsOfOmegaShowcasings = { promotionRanks: null, moveRule: null, turnOrder: ['black', 'white'] }; // No promotions, no 50-move rule, and reversed turn order.


/**
 * An object that contains each variant's positional and gamerule information:
 * 
 * A variant may contain either the `positionString` property, or `algorithm` property,
 * and may contain a `gameruleModifications` property (if not specified, default gamerules are used).
 * 
 * `positionString` is in the same format as ICN.
 * `algorithm` needs to contain properties `algorithm`, and `rules`, the first of which points to a function
 * that returns a position in key format `{ 'x,y':'type' }`, and the second of which is an object which may
 * contain `pawnDoublePush` and `castleWith` properties, seeing as that info is not present in positional data.
 * 
 * If either `positionString` or `gameruleModifications` has different values for different points
 * in time (variant has received an update), then it may contain nested UTC timestamps representing
 * the new values after that point in time.
 */
const variantDictionary: { [variantName: string]: Variant } = {
	Classical: {
		positionString: positionStringOfClassical,
		gameruleModifications: { promotionsAllowed: defaultPromotionsAllowed }
	},
	Core: {
		positionString: 'p-1,10+|p3,10+|p4,10+|p5,10+|p6,10+|p10,10+|p0,9+|p9,9+|n0,8|r1,8+|n2,8|b3,8|q4,8|k5,8+|b6,8|n7,8|r8,8+|n9,8|p-2,7+|p1,7+|p2,7+|p3,7+|p4,7+|p5,7+|p6,7+|p7,7+|p8,7+|p11,7+|p-3,6+|p12,6+|p1,5+|P2,5+|P7,5+|p8,5+|P1,4+|p2,4+|p7,4+|P8,4+|P-3,3+|P12,3+|P-2,2+|P1,2+|P2,2+|P3,2+|P4,2+|P5,2+|P6,2+|P7,2+|P8,2+|P11,2+|N0,1|R1,1+|N2,1|B3,1|Q4,1|K5,1+|B6,1|N7,1|R8,1+|N9,1|P0,0+|P9,0+|P-1,-1+|P3,-1+|P4,-1+|P5,-1+|P6,-1+|P10,-1+',
		gameruleModifications: { promotionsAllowed: defaultPromotionsAllowed }
	},
	Standarch: {
		positionString: 'p4,11+|p5,11+|p1,10+|p2,10+|p3,10+|p6,10+|p7,10+|p8,10+|p0,9+|ar4,9|ch5,9|p9,9+|p0,8+|r1,8+|n2,8|b3,8|q4,8|k5,8+|b6,8|n7,8|r8,8+|p9,8+|p0,7+|p1,7+|p2,7+|p3,7+|p4,7+|p5,7+|p6,7+|p7,7+|p8,7+|p9,7+|P0,2+|P1,2+|P2,2+|P3,2+|P4,2+|P5,2+|P6,2+|P7,2+|P8,2+|P9,2+|P0,1+|R1,1+|N2,1|B3,1|Q4,1|K5,1+|B6,1|N7,1|R8,1+|P9,1+|P0,0+|AR4,0|CH5,0|P9,0+|P1,-1+|P2,-1+|P3,-1+|P6,-1+|P7,-1+|P8,-1+|P4,-2+|P5,-2+',
		gameruleModifications: { promotionsAllowed: repeatPromotionsAllowedForEachColor([...defaultPromotions,'chancellors','archbishops']) }
	},
	Space_Classic: {
		positionString: {
			// UTC Feb 27, 2024, 7:00
			1709017200000: 'p-3,18+|r2,18|b4,18|b5,18|r7,18|p12,18+|p-4,17+|p13,17+|p-5,16+|p14,16+|p3,9+|p4,9+|p5,9+|p6,9+|n3,8|k4,8|q5,8|n6,8|p-6,7+|p1,7+|p2,7+|p3,7+|p4,7+|p5,7+|p6,7+|p7,7+|p8,7+|p-8,6+|p-7,6+|p16,6+|p17,6+|p-9,5+|p18,5+|P-9,4+|P18,4+|P-8,3+|P-7,3+|P16,3+|P17,3+|P1,2+|P2,2+|P3,2+|P4,2+|P5,2+|P6,2+|P7,2+|P8,2+|P15,2+|N3,1|K4,1|Q5,1|N6,1|P3,0+|P4,0+|P5,0+|P6,0+|P-5,-7+|P14,-7+|P-4,-8+|P13,-8+|P-3,-9+|R2,-9|B4,-9|B5,-9|R7,-9|P12,-9+',
			0: 'p-3,15+|q4,15|p11,15+|p-4,14+|b4,14|p12,14+|p-5,13+|r2,13|b4,13|r6,13|p13,13+|p3,5+|p4,5+|p5,5+|n3,4|k4,4|n5,4|p-6,3+|p1,3+|p2,3+|p3,3+|p4,3+|p5,3+|p6,3+|p7,3+|p-8,2+|p-7,2+|p15,2+|p16,2+|p-9,1+|p17,1+|P-9,0+|P17,0+|P-8,-1+|P-7,-1+|P15,-1+|P16,-1+|P1,-2+|P2,-2+|P3,-2+|P4,-2+|P5,-2+|P6,-2+|P7,-2+|P14,-2+|N3,-3|K4,-3|N5,-3|P3,-4+|P4,-4+|P5,-4+|P-5,-12+|R2,-12|B4,-12|R6,-12|P13,-12+|P-4,-13+|B4,-13|P12,-13+|P-3,-14+|Q4,-14|P11,-14+'
		},
		gameruleModifications: {
			// UTC Feb 27, 2024, 7:00
			1709017200000: { promotionsAllowed: defaultPromotionsAllowed }, // Use standard [8,1] promotion lines
			0: { promotionRanks: { white: [4], black: [-3] }, promotionsAllowed: defaultPromotionsAllowed }
		}
	},
	CoaIP: {
		positionString: positionStringOfCoaIP,
		gameruleModifications: { promotionsAllowed: coaIPPromotionsAllowed },
	},
	Pawn_Horde: {
		positionString: 'k5,2+|q4,2|r1,2+|n7,2|n2,2|r8,2+|b3,2|b6,2|P2,-1+|P3,-1+|P6,-1+|P7,-1+|P1,-2+|P2,-2+|P4,-2+|P5,-2+|P6,-2+|P7,-2+|P8,-2+|P1,-3+|P2,-3+|P4,-3+|P5,-3+|P6,-3+|P7,-3+|P8,-3+|P1,-4+|P2,-4+|P4,-4+|P5,-4+|P6,-4+|P7,-4+|P8,-4+|P1,-5+|P2,-5+|P4,-5+|P5,-5+|P6,-5+|P7,-5+|P8,-5+|P1,-6+|P2,-6+|P4,-6+|P5,-6+|P6,-6+|P7,-6+|P8,-6+|P3,-2+|P3,-3+|P3,-4+|P3,-5+|P3,-6+|P1,-7+|P2,-7+|P3,-7+|P4,-7+|P5,-7+|P6,-7+|P7,-7+|P8,-7+|P0,-6+|P0,-7+|P9,-6+|P9,-7+|p9,2+|p1,1+|p2,1+|p3,1+|p4,1+|p5,1+|p6,1+|p7,1+|p8,1+|p0,2+',
		gameruleModifications: { winConditions: { white: ['checkmate'], black: ['allpiecescaptured'] }, promotionRanks: { white: [2], black: [-7] }, promotionsAllowed: defaultPromotionsAllowed }
	},
	Space: {
		positionString: 'q4,31|ch4,23|p-12,18+|b4,18|p20,18+|p-11,17+|ar-10,17|p0,17+|b4,17|p8,17+|ar18,17|p19,17+|p-11,16+|p-10,16+|p-1,16+|p9,16+|p18,16+|p19,16+|p-1,15+|r0,15|ha4,15|r8,15|p9,15+|p3,6+|p4,6+|p5,6+|p2,5+|k4,5|p6,5+|n1,4|ce4,4|n7,4|p-10,3+|p-1,3+|p0,3+|p2,3+|p3,3+|p4,3+|p5,3+|p6,3+|p8,3+|p9,3+|p-12,2+|p-11,2+|p19,2+|p20,2+|p-13,1+|p21,1+|P-13,0+|P21,0+|P-12,-1+|P-11,-1+|P19,-1+|P20,-1+|P-1,-2+|P0,-2+|P2,-2+|P3,-2+|P4,-2+|P5,-2+|P6,-2+|P8,-2+|P9,-2+|P18,-2+|N1,-3|CE4,-3|N7,-3|P2,-4+|K4,-4|P6,-4+|P3,-5+|P4,-5+|P5,-5+|P-1,-14+|R0,-14|HA4,-14|R8,-14|P9,-14+|P-11,-15+|P-10,-15+|P-1,-15+|P9,-15+|P18,-15+|P19,-15+|P-11,-16+|AR-10,-16|P0,-16+|B4,-16|P8,-16+|AR18,-16|P19,-16+|P-12,-17+|B4,-17|P20,-17+|CH4,-22|Q4,-30',
		gameruleModifications: { promotionRanks: { white: [4], black: [-3] }, promotionsAllowed: repeatPromotionsAllowedForEachColor([...defaultPromotions,'hawks','centaurs','archbishops','chancellors']) }
	},
	Obstocean: {
		positionString: 'vo-8,14|vo-7,14|vo-6,14|vo-5,14|vo-4,14|vo-3,14|vo-2,14|vo-1,14|vo0,14|vo1,14|vo2,14|vo3,14|vo4,14|vo5,14|vo6,14|vo7,14|vo8,14|vo9,14|vo10,14|vo11,14|vo12,14|vo13,14|vo14,14|vo15,14|vo16,14|vo17,14|vo-8,13|vo-7,13|vo-6,13|vo-5,13|vo-4,13|vo-3,13|vo-2,13|vo-1,13|vo0,13|vo1,13|vo2,13|vo3,13|vo4,13|vo5,13|vo6,13|vo7,13|vo8,13|vo9,13|vo10,13|vo11,13|vo12,13|vo13,13|vo14,13|vo15,13|vo16,13|vo17,13|vo-8,12|vo-7,12|ob-6,12|ob-5,12|ob-4,12|ob-3,12|ob-2,12|ob-1,12|ob0,12|ob1,12|ob2,12|ob3,12|ob4,12|ob5,12|ob6,12|ob7,12|ob8,12|ob9,12|ob10,12|ob11,12|ob12,12|ob13,12|ob14,12|ob15,12|vo16,12|vo17,12|vo-8,11|vo-7,11|ob-6,11|ob-5,11|ob-4,11|ob-3,11|ob-2,11|ob-1,11|ob0,11|ob1,11|ob2,11|ob3,11|ob4,11|ob5,11|ob6,11|ob7,11|ob8,11|ob9,11|ob10,11|ob11,11|ob12,11|ob13,11|ob14,11|ob15,11|vo16,11|vo17,11|vo-8,10|vo-7,10|ob-6,10|ob-5,10|ob-4,10|ob-3,10|ob-2,10|ob-1,10|ob0,10|ob1,10|ob2,10|ob3,10|ob4,10|ob5,10|ob6,10|ob7,10|ob8,10|ob9,10|ob10,10|ob11,10|ob12,10|ob13,10|ob14,10|ob15,10|vo16,10|vo17,10|vo-8,9|vo-7,9|ob-6,9|ob-5,9|ob-4,9|ob-3,9|ob-2,9|ob-1,9|ob0,9|ob1,9|ob2,9|ob3,9|ob4,9|ob5,9|ob6,9|ob7,9|ob8,9|ob9,9|ob10,9|ob11,9|ob12,9|ob13,9|ob14,9|ob15,9|vo16,9|vo17,9|vo-8,8|vo-7,8|ob-6,8|ob-5,8|ob-4,8|ob-3,8|ob-2,8|ob-1,8|ob0,8|r1,8+|n2,8|b3,8|q4,8|k5,8+|b6,8|n7,8|r8,8+|ob9,8|ob10,8|ob11,8|ob12,8|ob13,8|ob14,8|ob15,8|vo16,8|vo17,8|vo-8,7|vo-7,7|ob-6,7|ob-5,7|ob-4,7|ob-3,7|ob-2,7|ob-1,7|ob0,7|p1,7+|p2,7+|p3,7+|p4,7+|p5,7+|p6,7+|p7,7+|p8,7+|ob9,7|ob10,7|ob11,7|ob12,7|ob13,7|ob14,7|ob15,7|vo16,7|vo17,7|vo-8,6|vo-7,6|ob-6,6|ob-5,6|ob-4,6|ob-3,6|ob-2,6|ob-1,6|ob0,6|ob1,6|ob2,6|ob3,6|ob4,6|ob5,6|ob6,6|ob7,6|ob8,6|ob9,6|ob10,6|ob11,6|ob12,6|ob13,6|ob14,6|ob15,6|vo16,6|vo17,6|vo-8,5|vo-7,5|ob-6,5|ob-5,5|ob-4,5|ob-3,5|ob-2,5|ob-1,5|ob0,5|ob1,5|ob2,5|ob3,5|ob4,5|ob5,5|ob6,5|ob7,5|ob8,5|ob9,5|ob10,5|ob11,5|ob12,5|ob13,5|ob14,5|ob15,5|vo16,5|vo17,5|vo-8,4|vo-7,4|ob-6,4|ob-5,4|ob-4,4|ob-3,4|ob-2,4|ob-1,4|ob0,4|ob1,4|ob2,4|ob3,4|ob4,4|ob5,4|ob6,4|ob7,4|ob8,4|ob9,4|ob10,4|ob11,4|ob12,4|ob13,4|ob14,4|ob15,4|vo16,4|vo17,4|vo-8,3|vo-7,3|ob-6,3|ob-5,3|ob-4,3|ob-3,3|ob-2,3|ob-1,3|ob0,3|ob1,3|ob2,3|ob3,3|ob4,3|ob5,3|ob6,3|ob7,3|ob8,3|ob9,3|ob10,3|ob11,3|ob12,3|ob13,3|ob14,3|ob15,3|vo16,3|vo17,3|vo-8,2|vo-7,2|ob-6,2|ob-5,2|ob-4,2|ob-3,2|ob-2,2|ob-1,2|ob0,2|P1,2+|P2,2+|P3,2+|P4,2+|P5,2+|P6,2+|P7,2+|P8,2+|ob9,2|ob10,2|ob11,2|ob12,2|ob13,2|ob14,2|ob15,2|vo16,2|vo17,2|vo-8,1|vo-7,1|ob-6,1|ob-5,1|ob-4,1|ob-3,1|ob-2,1|ob-1,1|ob0,1|R1,1+|N2,1|B3,1|Q4,1|K5,1+|B6,1|N7,1|R8,1+|ob9,1|ob10,1|ob11,1|ob12,1|ob13,1|ob14,1|ob15,1|vo16,1|vo17,1|vo-8,0|vo-7,0|ob-6,0|ob-5,0|ob-4,0|ob-3,0|ob-2,0|ob-1,0|ob0,0|ob1,0|ob2,0|ob3,0|ob4,0|ob5,0|ob6,0|ob7,0|ob8,0|ob9,0|ob10,0|ob11,0|ob12,0|ob13,0|ob14,0|ob15,0|vo16,0|vo17,0|vo-8,-1|vo-7,-1|ob-6,-1|ob-5,-1|ob-4,-1|ob-3,-1|ob-2,-1|ob-1,-1|ob0,-1|ob1,-1|ob2,-1|ob3,-1|ob4,-1|ob5,-1|ob6,-1|ob7,-1|ob8,-1|ob9,-1|ob10,-1|ob11,-1|ob12,-1|ob13,-1|ob14,-1|ob15,-1|vo16,-1|vo17,-1|vo-8,-2|vo-7,-2|ob-6,-2|ob-5,-2|ob-4,-2|ob-3,-2|ob-2,-2|ob-1,-2|ob0,-2|ob1,-2|ob2,-2|ob3,-2|ob4,-2|ob5,-2|ob6,-2|ob7,-2|ob8,-2|ob9,-2|ob10,-2|ob11,-2|ob12,-2|ob13,-2|ob14,-2|ob15,-2|vo16,-2|vo17,-2|vo-8,-3|vo-7,-3|ob-6,-3|ob-5,-3|ob-4,-3|ob-3,-3|ob-2,-3|ob-1,-3|ob0,-3|ob1,-3|ob2,-3|ob3,-3|ob4,-3|ob5,-3|ob6,-3|ob7,-3|ob8,-3|ob9,-3|ob10,-3|ob11,-3|ob12,-3|ob13,-3|ob14,-3|ob15,-3|vo16,-3|vo17,-3|vo-8,-4|vo-7,-4|vo-6,-4|vo-5,-4|vo-4,-4|vo-3,-4|vo-2,-4|vo-1,-4|vo0,-4|vo1,-4|vo2,-4|vo3,-4|vo4,-4|vo5,-4|vo6,-4|vo7,-4|vo8,-4|vo9,-4|vo10,-4|vo11,-4|vo12,-4|vo13,-4|vo14,-4|vo15,-4|vo16,-4|vo17,-4|vo-8,-5|vo-7,-5|vo-6,-5|vo-5,-5|vo-4,-5|vo-3,-5|vo-2,-5|vo-1,-5|vo0,-5|vo1,-5|vo2,-5|vo3,-5|vo4,-5|vo5,-5|vo6,-5|vo7,-5|vo8,-5|vo9,-5|vo10,-5|vo11,-5|vo12,-5|vo13,-5|vo14,-5|vo15,-5|vo16,-5|vo17,-5',
		gameruleModifications: { promotionsAllowed: defaultPromotionsAllowed }
	},
	Abundance: {
		positionString: 'p-3,10+|ha-2,10|ha-1,10|r0,10|ha1,10|ha2,10|p3,10+|p-2,9+|p-1,9+|p1,9+|p2,9+|p-5,6+|gu-4,6|r-3,6+|b-2,6|b-1,6|k0,6+|b1,6|b2,6|r3,6+|gu4,6|p5,6+|p-4,5+|gu-3,5|n-1,5|q0,5|n1,5|gu3,5|p4,5+|p-3,4+|p-2,4+|gu-1,4|ch0,4|gu1,4|p2,4+|p3,4+|p-1,3+|p0,3+|p1,3+|P-1,-3+|P0,-3+|P1,-3+|P-3,-4+|P-2,-4+|GU-1,-4|CH0,-4|GU1,-4|P2,-4+|P3,-4+|P-4,-5+|GU-3,-5|N-1,-5|Q0,-5|N1,-5|GU3,-5|P4,-5+|P-5,-6+|GU-4,-6|R-3,-6+|B-2,-6|B-1,-6|K0,-6+|B1,-6|B2,-6|R3,-6+|GU4,-6|P5,-6+|P-2,-9+|P-1,-9+|P1,-9+|P2,-9+|P-3,-10+|HA-2,-10|HA-1,-10|R0,-10|HA1,-10|HA2,-10|P3,-10+',
		gameruleModifications: { promotionRanks: { white: [6], black: [-6] }, promotionsAllowed: repeatPromotionsAllowedForEachColor([...defaultPromotions, 'guards','hawks','chancellors']) }
	},
	// Amazon_Chandelier: {
	// 	positionString: 'p-1,26+|p1,26+|p-2,25+|p-1,25+|p0,25+|p1,25+|p2,25+|p-2,24+|p-1,24+|am0,24|p1,24+|p2,24+|p-2,23+|p-1,23+|p0,23+|p1,23+|p2,23+|p-2,22+|p-1,22+|p1,22+|p2,22+|p-5,21+|p-4,21+|p-3,21+|p-2,21+|p-1,21+|p1,21+|p2,21+|p3,21+|p4,21+|p5,21+|p-5,20+|q-4,20|p-3,20+|p-2,20+|p-1,20+|p1,20+|p2,20+|p3,20+|q4,20|p5,20+|p-5,19+|p-4,19+|p-3,19+|p-2,19+|p-1,19+|p1,19+|p2,19+|p3,19+|p4,19+|p5,19+|p-5,18+|p-3,18+|p-2,18+|p-1,18+|p1,18+|p2,18+|p3,18+|p5,18+|p-8,17+|p-5,17+|p-3,17+|p-2,17+|p-1,17+|p1,17+|p2,17+|p3,17+|p5,17+|p8,17+|p-11,16+|p-10,16+|gu-9,16|ha-8,16|p-7,16+|gu-6,16|p-5,16+|p-3,16+|p-2,16+|p-1,16+|p1,16+|p2,16+|p3,16+|p5,16+|gu6,16|p7,16+|ha8,16|gu9,16|p10,16+|p11,16+|p-11,15+|r-10,15|p-9,15+|p-8,15+|r-7,15|p-6,15+|p-5,15+|p-3,15+|p-2,15+|p-1,15+|p1,15+|p2,15+|p3,15+|p5,15+|p6,15+|r7,15|p8,15+|p9,15+|r10,15|p11,15+|gu-12,14|p-11,14+|p-10,14+|p-9,14+|p-8,14+|p-7,14+|p-6,14+|p-5,14+|p-3,14+|p-2,14+|p-1,14+|p1,14+|p2,14+|p3,14+|p5,14+|p6,14+|p7,14+|p8,14+|p9,14+|p10,14+|p11,14+|gu12,14|p-19,13+|p-17,13+|gu-16,13|p-14,13+|p-12,13+|p-11,13+|p-9,13+|p-8,13+|p-6,13+|p-5,13+|p-3,13+|p-2,13+|p-1,13+|p1,13+|p2,13+|p3,13+|p5,13+|p6,13+|p8,13+|p9,13+|p11,13+|p12,13+|p14,13+|gu16,13|p17,13+|p19,13+|p-19,12+|b-18,12|p-17,12+|gu-16,12|p-14,12+|b-13,12|p-12,12+|p-11,12+|p-9,12+|p-8,12+|p-6,12+|p-5,12+|p-3,12+|p-2,12+|p-1,12+|p1,12+|p2,12+|p3,12+|p5,12+|p6,12+|p8,12+|p9,12+|p11,12+|p12,12+|b13,12|p14,12+|gu16,12|p17,12+|b18,12|p19,12+|gu-20,11|p-19,11+|p-17,11+|p-14,11+|p-12,11+|p-11,11+|p-9,11+|p-8,11+|p-6,11+|p-5,11+|p-3,11+|p-2,11+|p-1,11+|p1,11+|p2,11+|p3,11+|p5,11+|p6,11+|p8,11+|p9,11+|p11,11+|p12,11+|p14,11+|p17,11+|p19,11+|gu20,11|ha-20,10|p-19,10+|p-17,10+|p-14,10+|p-12,10+|p-11,10+|p-9,10+|p-8,10+|p-6,10+|p-5,10+|p-3,10+|p-2,10+|p-1,10+|p1,10+|p2,10+|p3,10+|p5,10+|p6,10+|p8,10+|p9,10+|p11,10+|p12,10+|p14,10+|p17,10+|p19,10+|ha20,10|n-11,9|n11,9|n-10,7|gu-5,7|gu-4,7|gu4,7|gu5,7|n10,7|n-8,6|n8,6|n-6,5|n6,5|n-4,4|k0,4|n4,4|n-2,3|n2,3|n0,2|N0,-1|N-2,-2|N2,-2|N-4,-3|K0,-3|N4,-3|N-6,-4|N6,-4|N-8,-5|N8,-5|N-10,-6|GU-5,-6|GU-4,-6|GU4,-6|GU5,-6|N10,-6|N-11,-8|N11,-8|HA-20,-9|P-19,-9+|P-17,-9+|P-14,-9+|P-12,-9+|P-11,-9+|P-9,-9+|P-8,-9+|P-6,-9+|P-5,-9+|P-3,-9+|P-2,-9+|P-1,-9+|P1,-9+|P2,-9+|P3,-9+|P5,-9+|P6,-9+|P8,-9+|P9,-9+|P11,-9+|P12,-9+|P14,-9+|P17,-9+|P19,-9+|HA20,-9|GU-20,-10|P-19,-10+|P-17,-10+|P-14,-10+|P-12,-10+|P-11,-10+|P-9,-10+|P-8,-10+|P-6,-10+|P-5,-10+|P-3,-10+|P-2,-10+|P-1,-10+|P1,-10+|P2,-10+|P3,-10+|P5,-10+|P6,-10+|P8,-10+|P9,-10+|P11,-10+|P12,-10+|P14,-10+|P17,-10+|P19,-10+|GU20,-10|P-19,-11+|B-18,-11|P-17,-11+|GU-16,-11|P-14,-11+|B-13,-11|P-12,-11+|P-11,-11+|P-9,-11+|P-8,-11+|P-6,-11+|P-5,-11+|P-3,-11+|P-2,-11+|P-1,-11+|P1,-11+|P2,-11+|P3,-11+|P5,-11+|P6,-11+|P8,-11+|P9,-11+|P11,-11+|P12,-11+|B13,-11|P14,-11+|GU16,-11|P17,-11+|B18,-11|P19,-11+|P-19,-12+|P-17,-12+|GU-16,-12|P-14,-12+|P-12,-12+|P-11,-12+|P-9,-12+|P-8,-12+|P-6,-12+|P-5,-12+|P-3,-12+|P-2,-12+|P-1,-12+|P1,-12+|P2,-12+|P3,-12+|P5,-12+|P6,-12+|P8,-12+|P9,-12+|P11,-12+|P12,-12+|P14,-12+|GU16,-12|P17,-12+|P19,-12+|GU-12,-13|P-11,-13+|P-10,-13+|P-9,-13+|P-8,-13+|P-7,-13+|P-6,-13+|P-5,-13+|P-3,-13+|P-2,-13+|P-1,-13+|P1,-13+|P2,-13+|P3,-13+|P5,-13+|P6,-13+|P7,-13+|P8,-13+|P9,-13+|P10,-13+|P11,-13+|GU12,-13|P-11,-14+|R-10,-14|P-9,-14+|P-8,-14+|R-7,-14|P-6,-14+|P-5,-14+|P-3,-14+|P-2,-14+|P-1,-14+|P1,-14+|P2,-14+|P3,-14+|P5,-14+|P6,-14+|R7,-14|P8,-14+|P9,-14+|R10,-14|P11,-14+|P-11,-15+|P-10,-15+|GU-9,-15|HA-8,-15|P-7,-15+|GU-6,-15|P-5,-15+|P-3,-15+|P-2,-15+|P-1,-15+|P1,-15+|P2,-15+|P3,-15+|P5,-15+|GU6,-15|P7,-15+|HA8,-15|GU9,-15|P10,-15+|P11,-15+|P-8,-16+|P-5,-16+|P-3,-16+|P-2,-16+|P-1,-16+|P1,-16+|P2,-16+|P3,-16+|P5,-16+|P8,-16+|P-5,-17+|P-3,-17+|P-2,-17+|P-1,-17+|P1,-17+|P2,-17+|P3,-17+|P5,-17+|P-5,-18+|P-4,-18+|P-3,-18+|P-2,-18+|P-1,-18+|P1,-18+|P2,-18+|P3,-18+|P4,-18+|P5,-18+|P-5,-19+|Q-4,-19|P-3,-19+|P-2,-19+|P-1,-19+|P1,-19+|P2,-19+|P3,-19+|Q4,-19|P5,-19+|P-5,-20+|P-4,-20+|P-3,-20+|P-2,-20+|P-1,-20+|P1,-20+|P2,-20+|P3,-20+|P4,-20+|P5,-20+|P-2,-21+|P-1,-21+|P1,-21+|P2,-21+|P-2,-22+|P-1,-22+|P0,-22+|P1,-22+|P2,-22+|P-2,-23+|P-1,-23+|AM0,-23|P1,-23+|P2,-23+|P-2,-24+|P-1,-24+|P0,-24+|P1,-24+|P2,-24+|P-1,-25+|P1,-25+',
	// 	gameruleModifications: { promotionRanks: [10,-9], promotionsAllowed: repeatPromotionsAllowedForEachColor([...defaultPromotions,'hawks','guards','amazons']) }
	// },
	// Containment: {
	// 	positionString: 'K5,-5|k5,14|Q4,-5|q4,14|HA1,-6|HA8,-6|ha1,15|ha8,15|CH-6,-6|CH15,-6|ch-6,15|ch15,15|AR-6,-5|AR15,-5|ar-6,14|ar15,14|N-1,0|N1,0|N2,0|N4,-1|N5,-1|N7,0|N8,0|N10,0|n-1,9|n1,9|n2,9|n4,10|n5,10|n7,9|n8,9|n10,9|GU-2,-2|GU1,-3|GU3,-4|GU6,-4|GU8,-3|GU11,-2|gu-2,11|gu1,12|gu3,13|gu6,13|gu8,12|gu11,11|R-5,-6|R-5,-5|R-4,-5|R-4,-6|R13,-6|R13,-5|R14,-5|R14,-6|r-5,15|r-5,14|r-4,14|r-4,15|r13,15|r13,14|r14,14|r14,15|B-5,-2|B-4,-3|B-3,-2|B12,-2|B13,-3|B14,-2|b-5,11|b-4,12|b-3,11|b12,11|b13,12|b14,11|P-9,-8+|P-9,-6+|P-9,-4+|P-9,-2+|P-9,0+|P-9,2+|P-9,4+|P-9,6+|P-9,8+|P-9,10+|P-9,12+|P-9,14+|P-9,16+|P-8,-7+|P-8,-5+|P-8,-3+|P-8,-1+|P-8,1+|P-8,3+|P-8,5+|P-8,7+|P-8,9+|P-8,11+|P-8,13+|P-8,15+|P-8,17+|P17,-8+|P17,-6+|P17,-4+|P17,-2+|P17,0+|P17,2+|P17,4+|P17,6+|P17,8+|P17,10+|P17,12+|P17,14+|P17,16+|P18,-7+|P18,-5+|P18,-3+|P18,-1+|P18,1+|P18,3+|P18,5+|P18,7+|P18,9+|P18,11+|P18,13+|P18,15+|P18,17+|P-7,-8+|P-5,-8+|P-3,-8+|P-1,-8+|P1,-8+|P3,-8+|P5,-8+|P7,-8+|P9,-8+|P11,-8+|P13,-8+|P15,-8+|P-6,-7+|P-4,-7+|P-2,-7+|P0,-7+|P2,-7+|P4,-7+|P6,-7+|P8,-7+|P10,-7+|P12,-7+|P14,-7+|P16,-7+|P-7,16+|P-5,16+|P-3,16+|P-1,16+|P1,16+|P3,16+|P5,16+|P7,16+|P9,16+|P11,16+|P13,16+|P15,16+|P-6,17+|P-4,17+|P-2,17+|P0,17+|P2,17+|P4,17+|P6,17+|P8,17+|P10,17+|P12,17+|P14,17+|P16,17+|P-7,-6+|P-7,-4+|P-7,-2+|P-6,-2+|P-6,-1+|P-5,-1+|P-5,0+|P-5,-4+|P-4,-4+|P-4,-2+|P-4,-1+|P-3,-6+|P-3,-5+|P-3,-1+|P-3,0+|P-2,0+|P-2,1+|P-1,1+|P-1,-4+|P0,-3+|P1,-2+|P0,-1+|P0,1+|P1,1+|P2,1+|P3,1+|P3,0+|P3,-3+|P3,-5+|P4,-4+|P4,1+|P5,1+|P5,-4+|P6,-5+|P6,-3+|P6,0+|P6,1+|P7,1+|P8,1+|P9,1+|P9,-1+|P8,-2+|P9,-3+|P10,-4+|P10,1+|P11,1+|P11,0+|P12,0+|P12,-1+|P12,-5+|P12,-6+|P13,-4+|P13,-2+|P13,-1+|P14,0+|P14,-1+|P14,-4+|P15,-2+|P15,-1+|P16,-1+|P16,-3+|P16,-5+|p-9,-7+|p-9,-5+|p-9,-3+|p-9,-1+|p-9,1+|p-9,3+|p-9,5+|p-9,7+|p-9,9+|p-9,11+|p-9,13+|p-9,15+|p-9,17+|p-8,-8+|p-8,-6+|p-8,-4+|p-8,-2+|p-8,0+|p-8,2+|p-8,4+|p-8,6+|p-8,8+|p-8,10+|p-8,12+|p-8,14+|p-8,16+|p17,-7+|p17,-5+|p17,-3+|p17,-1+|p17,1+|p17,3+|p17,5+|p17,7+|p17,9+|p17,11+|p17,13+|p17,15+|p17,17+|p18,-8+|p18,-6+|p18,-4+|p18,-2+|p18,0+|p18,2+|p18,4+|p18,6+|p18,8+|p18,10+|p18,12+|p18,14+|p18,16+|p-6,-8+|p-4,-8+|p-2,-8+|p0,-8+|p2,-8+|p4,-8+|p6,-8+|p8,-8+|p10,-8+|p12,-8+|p14,-8+|p16,-8+|p-7,-7+|p-5,-7+|p-3,-7+|p-1,-7+|p1,-7+|p3,-7+|p5,-7+|p7,-7+|p9,-7+|p11,-7+|p13,-7+|p15,-7+|p-6,16+|p-4,16+|p-2,16+|p0,16+|p2,16+|p4,16+|p6,16+|p8,16+|p10,16+|p12,16+|p14,16+|p16,16+|p-7,17+|p-5,17+|p-3,17+|p-1,17+|p1,17+|p3,17+|p5,17+|p7,17+|p9,17+|p11,17+|p13,17+|p15,17+|p-7,15+|p-7,13+|p-7,11+|p-6,11+|p-6,10+|p-5,10+|p-5,9+|p-5,13+|p-4,13+|p-4,11+|p-4,10+|p-3,15+|p-3,14+|p-3,10+|p-3,9+|p-2,9+|p-2,8+|p-1,8+|p-1,13+|p0,12+|p1,11+|p0,10+|p0,8+|p1,8+|p2,8+|p3,8+|p3,9+|p3,12+|p3,14+|p4,13+|p4,8+|p5,8+|p5,13+|p6,14+|p6,12+|p6,9+|p6,8+|p7,8+|p8,8+|p9,8+|p9,10+|p8,11+|p9,12+|p10,13+|p10,8+|p11,8+|p11,9+|p12,9+|p12,10+|p12,14+|p12,15+|p13,13+|p13,11+|p13,10+|p14,9+|p14,10+|p14,13+|p15,11+|p15,10+|p16,10+|p16,12+|p16,14+',
	// 	gameruleModifications: { promotionRanks: null }
	// },
	// Classical_Limit_7: {
	// 	positionString: positionStringOfClassical,
	// 	gameruleModifications: { slideLimit: 7, promotionsAllowed: defaultPromotionsAllowed }
	// },
	// CoaIP_Limit_7: {
	// 	positionString: positionStringOfCoaIP,
	// 	gameruleModifications: { slideLimit: 7, promotionsAllowed: coaIPPromotionsAllowed }
	// },
	Chess: {
		positionString: 'vo-1,10|vo0,10|vo1,10|vo2,10|vo3,10|vo4,10|vo5,10|vo6,10|vo7,10|vo8,10|vo9,10|vo10,10|vo-1,9|vo0,9|vo1,9|vo2,9|vo3,9|vo4,9|vo5,9|vo6,9|vo7,9|vo8,9|vo9,9|vo10,9|vo-1,8|vo0,8|r1,8+|n2,8|b3,8|q4,8|k5,8+|b6,8|n7,8|r8,8+|vo9,8|vo10,8|vo-1,7|vo0,7|p1,7+|p2,7+|p3,7+|p4,7+|p5,7+|p6,7+|p7,7+|p8,7+|vo9,7|vo10,7|vo-1,6|vo0,6|vo9,6|vo10,6|vo-1,5|vo0,5|vo9,5|vo10,5|vo-1,4|vo0,4|vo9,4|vo10,4|vo-1,3|vo0,3|vo9,3|vo10,3|vo-1,2|vo0,2|P1,2+|P2,2+|P3,2+|P4,2+|P5,2+|P6,2+|P7,2+|P8,2+|vo9,2|vo10,2|vo-1,1|vo0,1|R1,1+|N2,1|B3,1|Q4,1|K5,1+|B6,1|N7,1|R8,1+|vo9,1|vo10,1|vo-1,0|vo0,0|vo1,0|vo2,0|vo3,0|vo4,0|vo5,0|vo6,0|vo7,0|vo8,0|vo9,0|vo10,0|vo-1,-1|vo0,-1|vo1,-1|vo2,-1|vo3,-1|vo4,-1|vo5,-1|vo6,-1|vo7,-1|vo8,-1|vo9,-1|vo10,-1',
		gameruleModifications: { promotionsAllowed: defaultPromotionsAllowed }
	},
	// Classical_KOTH: {
	// 	positionString: positionStringOfClassical,
	// 	gameruleModifications: { winConditions: KOTHWinConditions, promotionsAllowed: defaultPromotionsAllowed }
	// },
	// CoaIP_KOTH: {
	// 	positionString: positionStringOfCoaIP,
	// 	gameruleModifications: { winConditions: KOTHWinConditions, promotionsAllowed: coaIPPromotionsAllowed }
	// },
	Confined_Classical: {
		positionString: 'P1,2+|P2,2+|P3,2+|P4,2+|P5,2+|P6,2+|P7,2+|P8,2+|p1,7+|p2,7+|p3,7+|p4,7+|p5,7+|p6,7+|p7,7+|p8,7+|R1,1+|R8,1+|r1,8+|r8,8+|N2,1|N7,1|n2,8|n7,8|B3,1|B6,1|b3,8|b6,8|Q4,1|q4,8|K5,1+|k5,8+|ob0,0|ob0,1|ob0,2|ob0,7|ob0,8|ob0,9|ob9,0|ob9,1|ob9,2|ob9,7|ob9,8|ob9,9|ob1,0|ob2,0|ob3,0|ob4,0|ob5,0|ob6,0|ob7,0|ob8,0|ob1,9|ob2,9|ob3,9|ob4,9|ob5,9|ob6,9|ob7,9|ob8,9',
		gameruleModifications: { promotionsAllowed: defaultPromotionsAllowed }
	},
	Classical_Plus: {
		positionString: 'p1,9+|p2,9+|p3,9+|p6,9+|p7,9+|p8,9+|p0,8+|r1,8+|n2,8|b3,8|q4,8|k5,8+|b6,8|n7,8|r8,8+|p9,8+|p1,7+|p2,7+|p3,7+|p4,7+|p5,7+|p6,7+|p7,7+|p8,7+|p3,5+|p6,5+|P3,4+|P6,4+|P1,2+|P2,2+|P3,2+|P4,2+|P5,2+|P6,2+|P7,2+|P8,2+|P0,1+|R1,1+|N2,1|B3,1|Q4,1|K5,1+|B6,1|N7,1|R8,1+|P9,1+|P1,0+|P2,0+|P3,0+|P6,0+|P7,0+|P8,0+',
		gameruleModifications: { promotionsAllowed: defaultPromotionsAllowed }
	},
	Pawndard: {
		positionString: 'b4,14|b5,14|r4,12|r5,12|p2,10+|p3,10+|p6,10+|p7,10+|p1,9+|p8,9+|p0,8+|n2,8|n3,8|k4,8+|q5,8|n6,8|n7,8|p9,8+|p1,7+|p2,7+|p3,7+|p4,7+|p5,7+|p6,7+|p7,7+|p8,7+|P1,5+|p2,5+|P3,5+|p6,5+|P7,5+|p8,5+|p1,4+|P2,4+|p3,4+|P6,4+|p7,4+|P8,4+|P1,2+|P2,2+|P3,2+|P4,2+|P5,2+|P6,2+|P7,2+|P8,2+|P0,1+|N2,1|N3,1|Q4,1|K5,1+|N6,1|N7,1|P9,1+|P1,0+|P8,0+|P2,-1+|P3,-1+|P6,-1+|P7,-1+|R4,-3|R5,-3|B4,-5|B5,-5',
		gameruleModifications: { promotionsAllowed: defaultPromotionsAllowed }
	},
	Knightline: {
		positionString: 'k5,8+|n3,8|n4,8|n6,8|n7,8|p-5,7+|p-4,7+|p-3,7+|p-2,7+|p-1,7+|p0,7+|p1,7+|p2,7+|p3,7+|p4,7+|p5,7+|p6,7+|p7,7+|p8,7+|p9,7+|p10,7+|p11,7+|p12,7+|p13,7+|p14,7+|p15,7+|K5,1+|N3,1|N4,1|N6,1|N7,1|P-5,2+|P-4,2+|P-3,2+|P-2,2+|P-1,2+|P0,2+|P1,2+|P2,2+|P3,2+|P4,2+|P5,2+|P6,2+|P7,2+|P8,2+|P9,2+|P10,2+|P11,2+|P12,2+|P13,2+|P14,2+|P15,2+',
		gameruleModifications: { promotionsAllowed: repeatPromotionsAllowedForEachColor(['knights','queens']) }
	},
	Knighted_Chess: {
		positionString: {
			// UTC Aug 1, 2024, 12:00AM
			1722470400000: 'P1,2+|P2,2+|P3,2+|P4,2+|P5,2+|P6,2+|P7,2+|P8,2+|p1,7+|p2,7+|p3,7+|P0,1+|P1,0+|P2,0+|P3,0+|P6,0+|P7,0+|P8,0+|P9,1+|p4,7+|p5,7+|p6,7+|p7,7+|p8,7+|p0,8+|p1,9+|p2,9+|p3,9+|p6,9+|p7,9+|p8,9+|p9,8+|CH1,1+|CH8,1+|ch1,8+|ch8,8+|NR2,1|NR7,1|nr2,8|nr7,8|AR3,1|AR6,1|ar3,8|ar6,8|AM4,1|am4,8|RC5,1+|rc5,8+',
			0: 'P1,2+|P2,2+|P3,2+|P4,2+|P5,2+|P6,2+|P7,2+|P8,2+|p1,7+|p2,7+|p3,7+|P0,1+|P1,0+|P2,0+|P3,0+|P6,0+|P7,0+|P8,0+|P9,1+|p4,7+|p5,7+|p6,7+|p7,7+|p8,7+|p0,8+|p1,9+|p2,9+|p3,9+|p6,9+|p7,9+|p8,9+|p9,8+|CH1,1+|CH8,1+|ch1,8+|ch8,8+|N2,1|N7,1|n2,8|n7,8|AR3,1|AR6,1|ar3,8|ar6,8|AM4,1|am4,8|RC5,1+|rc5,8+'
		},
		gameruleModifications: { promotionsAllowed: repeatPromotionsAllowedForEachColor(['chancellors','knightriders','archbishops','amazons']) }
	},
	Omega: {
		positionString: 'r-2,4|r2,4|r-2,2|r2,2|r-2,0|r0,0|r2,0|k0,-1|R1,-2|P-2,-3|Q-1,-3|P2,-3|K0,-4',
		gameruleModifications: gameruleModificationsOfOmegaShowcasings
	},
	Omega_Squared: {
		positionString: 'K51,94|k46,80|Q30,148|Q32,148|Q29,3|q29,148|q24,98|q24,97|q24,92|q24,91|q24,86|q24,85|q24,80|q24,79|q46,78|q45,77|q46,77|q45,76|q46,76|q78,60|N15,84|n63,64|r53,96|r45,81|r46,81|r46,79|r47,79|r45,78|B27,152|B29,152|B27,151|B28,151|B30,151|B32,151|B27,150|B28,150|B29,150|B30,150|B31,150|B32,150|B32,149|B9,96|B11,96|B15,96|B20,96|B47,87|B43,86|B44,82|B50,82|B51,81|B8,79|B10,79|B8,78|B10,78|B14,78|B19,78|B49,77|B41,72|B43,72|B45,72|B47,72|B49,72|B51,72|B53,72|B68,72|B10,71|B14,71|B18,71|B20,71|B22,71|B24,71|B76,55|B78,55|B80,55|B82,55|B84,55|B27,20|B29,20|B29,4|b27,155|b29,155|b31,155|b32,154|b9,99|b11,99|b15,99|b20,97|b33,97|b24,96|b11,92|b13,92|b15,92|b19,92|b47,91|b48,91|b49,91|b50,91|b51,91|b24,90|b47,90|b49,90|b51,90|b48,89|b50,89|b51,89|b47,88|b49,88|b51,88|b37,87|b48,87|b50,87|b51,87|b19,86|b49,86|b51,86|b48,85|b50,85|b24,84|b49,84|b51,84|b9,83|b48,83|b50,83|b51,82|b18,80|b14,79|b24,78|b52,77|b53,77|b47,76|b49,76|b51,76|b52,76|b53,76|b66,76|b70,76|b45,75|b47,75|b49,75|b51,75|b53,75|b10,74|b14,74|b18,74|b20,74|b22,74|b24,74|b58,74|b75,71|b78,58|b80,58|b82,58|b84,58|b27,23|b29,23|P26,155|P28,155|P30,155|P32,155|P27,154|P29,154|P31,154|P33,154|P26,153|P28,153|P30,153|P32,153|P26,152|P28,152|P31,152|P33,152|P26,151|P29,151|P31,151|P33,151|P26,150|P33,150|P26,149|P27,149|P28,149|P29,149|P30,149|P31,149|P33,149|P31,148|P33,148|P26,147|P28,147|P30,147|P31,147|P32,147|P33,147|P15,146|P27,146|P29,146|P28,145|P25,111|P24,110|P23,109|P22,108|P21,107|P25,107|P20,106|P24,106|P19,105|P23,105|P20,104|P19,103|P25,103|P20,102|P24,102|P19,101|P23,101|P20,100|P4,99|P6,99|P8,99|P10,99|P12,99|P14,99|P16,99|P19,99|P3,98|P5,98|P7,98|P9,98|P11,98|P15,98|P20,98|P4,97|P6,97|P8,97|P10,97|P12,97|P14,97|P16,97|P19,97|P21,97|P32,97|P34,97|P3,96|P5,96|P8,96|P10,96|P12,96|P33,96|P35,96|P4,95|P6,95|P8,95|P9,95|P10,95|P11,95|P12,95|P14,95|P16,95|P19,95|P21,95|P32,95|P34,95|P36,95|P23,94|P33,94|P35,94|P37,94|P8,93|P9,93|P34,93|P36,93|P38,93|P4,92|P6,92|P8,92|P10,92|P12,92|P14,92|P16,92|P18,92|P20,92|P35,92|P37,92|P39,92|P3,91|P5,91|P7,91|P9,91|P11,91|P13,91|P15,91|P19,91|P21,91|P36,91|P38,91|P40,91|P4,90|P6,90|P8,90|P10,90|P12,90|P14,90|P16,90|P18,90|P20,90|P35,90|P39,90|P41,90|P3,89|P5,89|P7,89|P9,89|P11,89|P13,89|P15,89|P19,89|P21,89|P34,89|P40,89|P42,89|P4,88|P6,88|P8,88|P10,88|P12,88|P14,88|P16,88|P23,88|P33,88|P37,88|P41,88|P43,88|P46,88|P48,88|P3,87|P5,87|P7,87|P9,87|P11,87|P13,87|P15,87|P32,87|P36,87|P38,87|P42,87|P44,87|P4,86|P6,86|P8,86|P10,86|P12,86|P14,86|P18,86|P20,86|P31,86|P35,86|P37,86|P39,86|P42,86|P44,86|P46,86|P48,86|P3,85|P5,85|P7,85|P9,85|P11,85|P13,85|P15,85|P17,85|P19,85|P21,85|P32,85|P36,85|P38,85|P40,85|P42,85|P43,85|P44,85|P3,84|P5,84|P7,84|P9,84|P11,84|P13,84|P18,84|P20,84|P33,84|P37,84|P39,84|P42,84|P43,84|P44,84|P52,84|P4,83|P6,83|P8,83|P10,83|P12,83|P14,83|P16,83|P19,83|P21,83|P34,83|P38,83|P40,83|P42,83|P43,83|P44,83|P49,83|P51,83|P3,82|P5,82|P7,82|P9,82|P11,82|P13,82|P15,82|P23,82|P31,82|P35,82|P39,82|P42,82|P43,82|P52,82|P2,81|P4,81|P6,81|P8,81|P10,81|P12,81|P14,81|P32,81|P38,81|P40,81|P42,81|P43,81|P44,81|P49,81|P3,80|P5,80|P7,80|P9,80|P11,80|P17,80|P19,80|P21,80|P31,80|P33,80|P37,80|P39,80|P50,80|P52,80|P2,79|P4,79|P7,79|P9,79|P11,79|P13,79|P15,79|P18,79|P20,79|P32,79|P34,79|P36,79|P38,79|P40,79|P44,79|P3,78|P5,78|P7,78|P9,78|P11,78|P17,78|P21,78|P33,78|P35,78|P37,78|P39,78|P41,78|P43,78|P2,77|P4,77|P7,77|P8,77|P9,77|P10,77|P11,77|P13,77|P15,77|P18,77|P20,77|P34,77|P36,77|P38,77|P40,77|P42,77|P23,76|P35,76|P37,76|P39,76|P41,76|P65,76|P67,76|P69,76|P71,76|P7,75|P8,75|P36,75|P38,75|P40,75|P42,75|P64,75|P66,75|P70,75|P3,74|P5,74|P7,74|P9,74|P11,74|P13,74|P15,74|P17,74|P19,74|P21,74|P23,74|P25,74|P37,74|P39,74|P41,74|P57,74|P59,74|P63,74|P65,74|P67,74|P69,74|P71,74|P2,73|P4,73|P6,73|P8,73|P10,73|P14,73|P18,73|P20,73|P22,73|P24,73|P38,73|P40,73|P42,73|P44,73|P46,73|P48,73|P50,73|P52,73|P54,73|P58,73|P62,73|P64,73|P66,73|P70,73|P72,73|P3,72|P5,72|P7,72|P9,72|P11,72|P13,72|P15,72|P17,72|P19,72|P21,72|P23,72|P25,72|P39,72|P57,72|P59,72|P61,72|P63,72|P65,72|P71,72|P2,71|P4,71|P6,71|P8,71|P40,71|P42,71|P44,71|P46,71|P48,71|P50,71|P52,71|P54,71|P58,71|P62,71|P64,71|P66,71|P70,71|P72,71|P74,71|P76,71|P3,70|P5,70|P7,70|P9,70|P11,70|P13,70|P15,70|P17,70|P19,70|P21,70|P23,70|P25,70|P57,70|P59,70|P61,70|P63,70|P65,70|P71,70|P75,70|P77,70|P56,69|P58,69|P62,69|P64,69|P72,69|P74,69|P76,69|P78,69|P57,68|P59,68|P61,68|P63,68|P67,68|P69,68|P75,68|P77,68|P79,68|P56,67|P58,67|P62,67|P66,67|P70,67|P74,67|P76,67|P78,67|P80,67|P57,66|P59,66|P64,66|P67,66|P69,66|P71,66|P75,66|P77,66|P79,66|P81,66|P56,65|P59,65|P63,65|P66,65|P70,65|P76,65|P78,65|P80,65|P82,65|P57,64|P59,64|P62,64|P65,64|P67,64|P69,64|P71,64|P73,64|P77,64|P79,64|P81,64|P83,64|P56,63|P58,63|P66,63|P70,63|P74,63|P78,63|P80,63|P82,63|P84,63|P57,62|P59,62|P61,62|P63,62|P65,62|P67,62|P69,62|P71,62|P73,62|P75,62|P79,62|P81,62|P83,62|P85,62|P56,61|P58,61|P60,61|P62,61|P64,61|P66,61|P70,61|P74,61|P76,61|P82,61|P84,61|P57,60|P59,60|P61,60|P63,60|P65,60|P67,60|P69,60|P71,60|P73,60|P75,60|P80,60|P82,60|P56,59|P58,59|P60,59|P62,59|P64,59|P66,59|P70,59|P74,59|P57,58|P59,58|P61,58|P63,58|P65,58|P73,58|P75,58|P58,57|P60,57|P62,57|P64,57|P74,57|P73,56|P75,56|P77,56|P79,56|P81,56|P83,56|P85,56|P74,55|P75,54|P77,54|P79,54|P81,54|P83,54|P85,54|P26,23|P28,23|P30,23|P27,22|P29,22|P26,21|P28,21|P30,21|P26,19|P28,19|P30,19|P26,18|P30,18|P26,17|P30,17|P26,16|P28,16|P30,16|P26,15|P28,15|P30,15|P26,14|P28,14|P30,14|P26,13|P28,13|P30,13|P26,12|P28,12|P30,12|P26,11|P28,11|P30,11|P26,10|P28,10|P30,10|P26,9|P28,9|P30,9|P26,8|P28,8|P30,8|P26,7|P28,7|P30,7|P26,6|P28,6|P30,6|P26,5|P28,5|P30,5|P26,4|P28,4|P30,4|P26,3|P28,3|P30,3|P26,2|P27,2|P28,2|P29,2|P30,2|p26,156|p28,156|p30,156|p32,156|p33,155|p26,154|p28,154|p30,154|p31,153|p33,153|p15,147|p25,112|p24,111|p23,110|p22,109|p25,109|p21,108|p25,108|p20,107|p24,107|p19,106|p23,106|p20,105|p25,105|p19,104|p25,104|p20,103|p24,103|p19,102|p23,102|p20,101|p25,101|p4,100|p6,100|p8,100|p10,100|p12,100|p14,100|p16,100|p19,100|p24,100|p25,100|p3,99|p5,99|p7,99|p20,99|p23,99|p24,99|p25,99|p4,98|p6,98|p8,98|p10,98|p12,98|p14,98|p16,98|p19,98|p21,98|p23,98|p25,98|p32,98|p34,98|p3,97|p5,97|p15,97|p23,97|p25,97|p35,97|p4,96|p6,96|p14,96|p16,96|p19,96|p21,96|p23,96|p25,96|p32,96|p34,96|p36,96|p18,95|p23,95|p25,95|p33,95|p35,95|p37,95|p25,94|p34,94|p36,94|p38,94|p4,93|p6,93|p10,93|p12,93|p14,93|p16,93|p18,93|p20,93|p23,93|p24,93|p25,93|p35,93|p37,93|p39,93|p3,92|p5,92|p7,92|p9,92|p21,92|p23,92|p25,92|p36,92|p38,92|p40,92|p46,92|p47,92|p48,92|p49,92|p50,92|p51,92|p52,92|p4,91|p6,91|p8,91|p10,91|p12,91|p14,91|p16,91|p18,91|p20,91|p23,91|p25,91|p35,91|p39,91|p41,91|p46,91|p52,91|p3,90|p5,90|p7,90|p9,90|p11,90|p13,90|p15,90|p19,90|p21,90|p23,90|p25,90|p34,90|p40,90|p42,90|p46,90|p48,90|p50,90|p52,90|p4,89|p6,89|p8,89|p10,89|p12,89|p14,89|p16,89|p23,89|p25,89|p33,89|p37,89|p41,89|p43,89|p46,89|p52,89|p3,88|p5,88|p7,88|p9,88|p11,88|p13,88|p15,88|p25,88|p32,88|p36,88|p38,88|p42,88|p44,88|p50,88|p52,88|p4,87|p6,87|p8,87|p10,87|p12,87|p14,87|p18,87|p20,87|p23,87|p24,87|p25,87|p31,87|p35,87|p39,87|p46,87|p52,87|p3,86|p5,86|p7,86|p9,86|p11,86|p13,86|p15,86|p17,86|p21,86|p23,86|p25,86|p32,86|p36,86|p38,86|p40,86|p47,86|p50,86|p52,86|p18,85|p20,85|p23,85|p25,85|p33,85|p37,85|p39,85|p46,85|p47,85|p49,85|p52,85|p4,84|p6,84|p8,84|p10,84|p12,84|p14,84|p16,84|p19,84|p21,84|p23,84|p25,84|p34,84|p38,84|p40,84|p46,84|p47,84|p3,83|p5,83|p7,83|p11,83|p13,83|p15,83|p23,83|p25,83|p31,83|p35,83|p39,83|p46,83|p47,83|p52,83|p2,82|p4,82|p6,82|p8,82|p10,82|p12,82|p14,82|p25,82|p32,82|p38,82|p40,82|p46,82|p47,82|p49,82|p3,81|p5,81|p7,81|p9,81|p11,81|p13,81|p15,81|p17,81|p19,81|p21,81|p23,81|p24,81|p25,81|p31,81|p33,81|p37,81|p39,81|p47,81|p50,81|p52,81|p2,80|p4,80|p13,80|p15,80|p20,80|p23,80|p25,80|p32,80|p34,80|p36,80|p38,80|p40,80|p44,80|p47,80|p3,79|p5,79|p17,79|p19,79|p21,79|p23,79|p25,79|p33,79|p35,79|p37,79|p39,79|p41,79|p43,79|p45,79|p2,78|p4,78|p13,78|p15,78|p18,78|p20,78|p23,78|p25,78|p34,78|p36,78|p38,78|p40,78|p42,78|p44,78|p47,78|p49,78|p51,78|p52,78|p53,78|p54,78|p17,77|p23,77|p25,77|p35,77|p37,77|p39,77|p41,77|p44,77|p47,77|p48,77|p50,77|p51,77|p54,77|p65,77|p67,77|p69,77|p71,77|p25,76|p36,76|p38,76|p40,76|p42,76|p44,76|p48,76|p50,76|p54,76|p64,76|p3,75|p5,75|p9,75|p11,75|p13,75|p15,75|p17,75|p19,75|p21,75|p23,75|p25,75|p37,75|p39,75|p41,75|p44,75|p46,75|p48,75|p50,75|p52,75|p54,75|p57,75|p59,75|p63,75|p65,75|p67,75|p69,75|p71,75|p2,74|p4,74|p6,74|p8,74|p38,74|p40,74|p42,74|p44,74|p46,74|p48,74|p50,74|p52,74|p54,74|p62,74|p64,74|p66,74|p70,74|p72,74|p3,73|p5,73|p7,73|p9,73|p11,73|p13,73|p15,73|p17,73|p19,73|p21,73|p23,73|p25,73|p39,73|p41,73|p43,73|p45,73|p47,73|p49,73|p51,73|p53,73|p57,73|p59,73|p61,73|p63,73|p65,73|p71,73|p2,72|p4,72|p6,72|p8,72|p10,72|p14,72|p18,72|p20,72|p22,72|p24,72|p40,72|p42,72|p44,72|p46,72|p48,72|p50,72|p52,72|p54,72|p58,72|p62,72|p64,72|p66,72|p70,72|p72,72|p74,72|p76,72|p3,71|p5,71|p7,71|p9,71|p11,71|p13,71|p15,71|p17,71|p19,71|p21,71|p23,71|p25,71|p53,71|p57,71|p59,71|p61,71|p63,71|p65,71|p71,71|p77,71|p56,70|p58,70|p62,70|p64,70|p67,70|p69,70|p72,70|p74,70|p76,70|p78,70|p57,69|p59,69|p61,69|p63,69|p67,69|p69,69|p75,69|p77,69|p79,69|p56,68|p58,68|p62,68|p66,68|p70,68|p74,68|p76,68|p78,68|p80,68|p57,67|p59,67|p64,67|p67,67|p69,67|p71,67|p75,67|p77,67|p79,67|p81,67|p56,66|p63,66|p66,66|p70,66|p73,66|p76,66|p78,66|p80,66|p82,66|p57,65|p62,65|p65,65|p67,65|p69,65|p71,65|p73,65|p77,65|p79,65|p81,65|p83,65|p56,64|p58,64|p61,64|p66,64|p70,64|p74,64|p78,64|p80,64|p82,64|p84,64|p57,63|p59,63|p61,63|p63,63|p65,63|p67,63|p69,63|p71,63|p73,63|p75,63|p79,63|p81,63|p83,63|p85,63|p56,62|p58,62|p60,62|p62,62|p64,62|p66,62|p70,62|p74,62|p76,62|p80,62|p82,62|p84,62|p57,61|p59,61|p61,61|p63,61|p65,61|p67,61|p69,61|p71,61|p73,61|p75,61|p77,61|p78,61|p80,61|p56,60|p58,60|p60,60|p62,60|p64,60|p66,60|p70,60|p74,60|p77,60|p79,60|p57,59|p59,59|p61,59|p63,59|p65,59|p73,59|p75,59|p77,59|p78,59|p79,59|p80,59|p81,59|p82,59|p83,59|p84,59|p85,59|p58,58|p60,58|p62,58|p64,58|p74,58|p77,58|p79,58|p81,58|p83,58|p85,58|p73,57|p75,57|p77,57|p79,57|p81,57|p83,57|p85,57|p74,56|p76,56|p78,56|p80,56|p82,56|p84,56|p75,55|p77,55|p79,55|p81,55|p83,55|p85,55|p26,24|p28,24|p30,24|p26,22|p28,22|p30,22|p27,21|p29,21|p26,20|p28,20|p30,20|p28,17',
		gameruleModifications: gameruleModificationsOfOmegaShowcasings
	},
	Omega_Cubed: {
		generator: {
			algorithm: omega3generator.genPositionOfOmegaCubed,
			// Additional properties that are normally stored in the position string in the form of '+', but isn't present since it's a generated position.
			rules: { pawnDoublePush: false },
		},
		gameruleModifications: gameruleModificationsOfOmegaShowcasings
	},
	Omega_Fourth: {
		generator: {
			algorithm: omega4generator.genPositionOfOmegaFourth,
			// Additional properties that are normally stored in the position string in the form of '+', but isn't present since it's a generated position.
			rules: { pawnDoublePush: false },
		},
		gameruleModifications: gameruleModificationsOfOmegaShowcasings
	},
	// Chess on an Infinite Plane - Huygens Options
	CoaIP_HO: {
		positionString: 'p-4,14+|ha-2,14|p0,14+|p9,14+|ha11,14|p13,14+|p-3,13+|p-1,13+|p10,13+|p12,13+|p-2,12+|p11,12+|gu-1,9|hu0,9|ch1,9|ch8,9|hu9,9|gu10,9|p-1,8+|p0,8+|r1,8+|n2,8|b3,8|q4,8|k5,8+|b6,8|n7,8|r8,8+|p9,8+|p10,8+|p1,7+|p2,7+|p3,7+|p4,7+|p5,7+|p6,7+|p7,7+|p8,7+|P1,2+|P2,2+|P3,2+|P4,2+|P5,2+|P6,2+|P7,2+|P8,2+|P-1,1+|P0,1+|R1,1+|N2,1|B3,1|Q4,1|K5,1+|B6,1|N7,1|R8,1+|P9,1+|P10,1+|GU-1,0|HU0,0|CH1,0|CH8,0|HU9,0|GU10,0|P-2,-3+|P11,-3+|P-3,-4+|P-1,-4+|P10,-4+|P12,-4+|P-4,-5+|HA-2,-5|P0,-5+|P9,-5+|HA11,-5|P13,-5+',
		gameruleModifications: { promotionsAllowed: repeatPromotionsAllowedForEachColor([...coaIPPromotions,'huygens']) }
	},
	// Trappist_1: { // Also has the huygen featured in it!
	// 	positionString: 'p-6,16+|ha-4,16|p-2,16+|p11,16+|ha13,16|p15,16+|p-5,15+|p-3,15+|p12,15+|p14,15+|p-4,14+|p13,14+|p-3,9+|hu-2,9|n3,9|b4,9|b5,9|n6,9|hu11,9|p12,9+|p-2,8+|r-1,8+|ch0,8|gu1,8|n2,8|b3,8|q4,8|k5,8+|b6,8|n7,8|gu8,8|ch9,8|r10,8+|p11,8+|p-1,7+|p0,7+|p1,7+|p2,7+|p3,7+|p4,7+|p5,7+|p6,7+|p7,7+|p8,7+|p9,7+|p10,7+|P-1,2+|P0,2+|P1,2+|P2,2+|P3,2+|P4,2+|P5,2+|P6,2+|P7,2+|P8,2+|P9,2+|P10,2+|P-2,1+|R-1,1+|CH0,1|GU1,1|N2,1|B3,1|Q4,1|K5,1+|B6,1|N7,1|GU8,1|CH9,1|R10,1+|P11,1+|P-3,0+|HU-2,0|N3,0|B4,0|B5,0|N6,0|HU11,0|P12,0+|P-4,-5+|P13,-5+|P-5,-6+|P-3,-6+|P12,-6+|P14,-6+|P-6,-7+|HA-4,-7|P-2,-7+|P11,-7+|HA13,-7|P15,-7+',
	// 	gameruleModifications: { promotionsAllowed: repeatPromotionsAllowedForEachColor([...coaIPPromotions,'huygens']) }
	// },
	'8x8x8x8_Chess': {
		generator: {
			algorithm: () => { return fivedimensionalgenerator.genPositionOfFiveDimensional(8, 8, 9, 'P1,2+|P2,2+|P3,2+|P4,2+|P5,2+|P6,2+|P7,2+|P8,2+|p1,7+|p2,7+|p3,7+|p4,7+|p5,7+|p6,7+|p7,7+|p8,7+|R1,1+|R8,1+|r1,8+|r8,8+|N2,1|N7,1|n2,8|n7,8|B3,1|B6,1|b3,8|b6,8|Q4,1|q4,8|K5,1+|k5,8+') },
			rules: { pawnDoublePush: true, castleWith: 'rooks' }
		},
		movesetGenerator: () => { return fivedimensionalgenerator.genMovesetOfFiveDimensional(8, 8, 9) },
		gameruleModifications: { promotionsAllowed: defaultPromotionsAllowed, promotionRanks: { white: [8, 17, 26, 35, 44, 53, 62, 71], black: [1, 10, 19, 28, 37, 46, 55, 64] } },
		specialMoves: { pawns: fivedimensionalmoves.doFiveDimensionalPawnMove },
		specialVicinity: { pawns: [[1,1],[-1,1],[-1,-1],[1,-1],[9,9],[9,-9],[-9,-9],[-9,9]] }
	},
	//'4x4x4x4_Chess': {
	//	generator: {
	//		algorithm: () => { return fivedimensionalgenerator.genPositionOfFiveDimensional(4, 4, 10, 20) },
	//		rules: { pawnDoublePush: true, castleWith: 'rooks' }
	//	},
	//	movesetGenerator: () => { return fivedimensionalgenerator.genMovesetOfFiveDimensional(10) },
	//	gameruleModifications: { promotionsAllowed: defaultPromotionsAllowed, promotionRanks: { white: [8, 18, 28, 38, 48, 58, 68, 78], black: [1, 11, 21, 31, 41, 51, 61, 71] } },
	//	specialMoves: { pawns: fivedimensionalmoves.doFiveDimensionalPawnMove },
	//	specialVicinity: { pawns: [[1,1],[-1,1],[-1,-1],[1,-1],[10,10],[10,-10],[-10,-10],[-10,10]] }
	//}
};


/**
 * Takes a single list of possible promotions: `['rooks','queens'...]`,
 * repeats it for every color to produce the full `promotionsAllowed` gamerule:
 * `{ white: ['rooks','queens'...], black: ['rooks','queens'...] }`
 */
function repeatPromotionsAllowedForEachColor(promotions: string[]) {
	return { white: promotions, black: promotions };
}

/**
 * Tests if the provided variant is a valid variant
 * @param variantName - The name of the variant
 * @returns *true* if the variant is a valid variant
 */
function isVariantValid(variantName: string) {
	return variantDictionary[variantName] !== undefined;
}


/**
 * Given the Variant and Date, calculates the startingPosition,
 * positionString, and specialRights properties for the startSnapshot of the game.
 * @param options - An object containing the properties `Variant`, and if desired, `Date`.
 * @returns An object containing 3 properties: `position`, `positionString`, and `specialRights`.
 */
function getStartingPositionOfVariant({ Variant, UTCDate, UTCTime }: { Variant: string, UTCDate: string, UTCTime: string }) {
	if (!isVariantValid(Variant)) throw new Error(`Cannot get starting position of invalid variant "${Variant}"!`);
	const variantEntry: Variant = variantDictionary[Variant]!;

	let positionString: string;
	let startingPosition: { [coordKey: string]: string };

	// Does the entry have a `positionString` property, or a `generator` property?
	if (variantEntry.positionString) {

		// Does the positionString entry have multiple UTC timestamp position strings? Or just one?

		if (typeof variantEntry.positionString === 'string') { // Single position string
			positionString = variantEntry.positionString;
		} else { // Multiple position string entries for different timestamps
			positionString = getApplicableTimestampEntry(variantEntry.positionString, { UTCDate, UTCTime });
		}

		return getStartSnapshotPosition({ positionString });

	} else if (variantEntry.generator) {

		// Generate the starting position
		startingPosition = variantEntry.generator.algorithm();
		return getStartSnapshotPosition({ startingPosition, ...variantEntry.generator.rules }); // { `position`, `positionString`, `specialRights` }

	} else throw new Error(`Variant entry "${Variant}" NEEDS either a "positionString" or a "generator" property, cannot get the starting position!`);
}

/**
 * Given the provided information, returns the `positionString`, `position`,
 * and `specialRights` properties for the gamefile's startSnapshot.
 * @param options - An object that may contain various properties, `positionString`,
 * `startingPosition`, `specialRights`, `pawnDoublePush`, `castleWith`. You can choose to
 * specify the positionString, startingPosition & specialRights, or startingPosition
 * & pawnDoublePush & castleWith properties.
 */
function getStartSnapshotPosition({ positionString, startingPosition, specialRights, pawnDoublePush = false, castleWith }: {
	positionString?: string,
	startingPosition?: { [coordKey: string]: string },
	specialRights?: { [coordKey: string]: boolean }
	pawnDoublePush?: boolean,
	castleWith?: string
}) {
	if (positionString) {
		if (!startingPosition) {
			const positionAndRights = formatconverter.getStartingPositionAndSpecialRightsFromShortPosition(positionString);
			startingPosition = positionAndRights.startingPosition;
			specialRights = positionAndRights.specialRights;
		}
	} else if (startingPosition && specialRights) {
		positionString = formatconverter.LongToShort_Position(startingPosition, specialRights);
	} else if (startingPosition) {
		specialRights = formatconverter.generateSpecialRights(startingPosition, pawnDoublePush, castleWith);
		positionString = formatconverter.LongToShort_Position(startingPosition, specialRights);
	} else throw new Error("Not enough information to calculate the positionString, position, and specialRights of variant.");

	// console.log({ positionString, position: startingPosition, specialRights });

	return { positionString, position: startingPosition, specialRights };
}

/**
 * Returns the variant's gamerules at the provided date in time.
 * @param options - An object containing the metadata `Variant`, and if desired, `Date`.
 * @param options.Variant - The name of the variant for which to get the gamerules.
 * @returns The gamerules object for the variant.
 */
function getGameRulesOfVariant({ Variant, UTCDate = timeutil.getCurrentUTCDate(), UTCTime = timeutil.getCurrentUTCTime() }: {
	Variant: string,
	UTCDate: string,
	UTCTime: string
}, position: { [coordKey: string]: string }): GameRules {
	if (!isVariantValid(Variant)) throw new Error(`Cannot get starting position of invalid variant "${Variant}"!`);

	const gameruleModifications: GameRuleModifications = getVariantGameRuleModifications({ Variant, UTCDate, UTCTime });
	
	return getGameRules(gameruleModifications, position);
}

function getVariantGameRuleModifications({ Variant, UTCDate = timeutil.getCurrentUTCDate(), UTCTime = timeutil.getCurrentUTCTime() }: {
	Variant: string,
	UTCDate: string,
	UTCTime: string
}): GameRuleModifications {

	const variantEntry = variantDictionary[Variant];
	if (!variantEntry) throw Error(`Cannot get gameruleModifications of invalid variant "${Variant}".`);

	// Does the gameruleModifications entry have multiple UTC timestamps? Or just one?
	
	// We use hasOwnProperty() because it is true even if the property is set as `undefined`, which in this case would mean zero gamerule modifications.
	if (variantEntry.gameruleModifications?.hasOwnProperty(0)) { // Multiple UTC timestamps
		return getApplicableTimestampEntry(variantEntry.gameruleModifications, { UTCDate, UTCTime });
	} else { // Just one gameruleModifications entry
		return variantEntry.gameruleModifications;
	}
}

/**
 * Returns default gamerules with provided modifications
 * @param modifications - The modifications to the default gamerules. This can include `position` to determine the promotionsAllowed.
 * @returns The gamerules
 */
function getGameRules(modifications: GameRuleModifications = {}, position?: { [coordKey: string]: string }): GameRules { // { slideLimit, promotionRanks, position }
	const gameRules: any = {
		// REQUIRED gamerules
		winConditions: modifications.winConditions || defaultWinConditions,
		turnOrder: modifications.turnOrder || defaultTurnOrder,
	};

	// GameRules that have a dedicated ICN spot...
	if (modifications.promotionRanks !== null) { // Either undefined (use default), or custom
		gameRules.promotionRanks = modifications.promotionRanks || { white: [8], black: [1] };
		if (!modifications.promotionsAllowed && !position) throw new Error("Cannot set promotionsAllowed gamerule when getting gamerules. Must be specified in the modifications, or the position passed as an argument so it can be auto-calculated.");
		gameRules.promotionsAllowed = modifications.promotionsAllowed || getPromotionsAllowed(position!, gameRules.promotionRanks);
	}
	if (modifications.moveRule !== null) gameRules.moveRule = modifications.moveRule || 100;

	// GameRules that DON'T have a dedicated ICN spot...
	if (modifications.slideLimit !== undefined) gameRules.slideLimit = modifications.slideLimit;

	return jsutil.deepCopyObject(gameRules) as GameRules; // Copy it so the game doesn't modify the values in this module.
}

/**
 * Returns the bare-minimum gamerules a game needs to function.
 * @returns {GameRules} The gameRules object
 */
function getBareMinimumGameRules(): GameRules {
	return getGameRules({ promotionRanks: null, moveRule: null }); // Erase the defaults to end up with only the required's
}

// /**
//  * Returns the turnOrder of the provided variant at the date (if specified).
//  */
// function getVariantTurnOrder({ Variant, UTCDate = timeutil.getCurrentUTCDate(), UTCTime = timeutil.getCurrentUTCTime() }: {
// 	Variant: string,
// 	UTCDate: string,
// 	UTCTime: string
// }): GameRules['turnOrder'] {

// 	const gameruleModifications = getVariantGameRuleModifications({ Variant, UTCDate, UTCTime });
// 	// If the gamerule modifications have a turnOrder modification, return that,
// 	// otherwise return the default instead.
// 	return gameruleModifications.turnOrder || defaultTurnOrder;
// }

/**
 * Returns the `promotionsAllowed` property of the variant's gamerules.
 * You can promote to whatever pieces the game starts with.
 * @param position - The starting position of the game, organized by key `{ '1,2': 'queensB' }`
 * @param promotionRanks - The `promotionRanks` gamerule of the variant. If one side's promotion rank is `null`, then we won't add legal promotions for them.
 * @returns The gamefile's `promotionsAllowed` gamerule.
 */
function getPromotionsAllowed(position: { [coordKey: string]: string }, promotionRanks: GameRules['promotionRanks']): ColorVariantProperty<string[]> {
	console.log("Parsing position to get the promotionsAllowed gamerule..");

	// We can't promote to royals or pawns, whether we started the game with them.
	const unallowedPromotes = jsutil.deepCopyObject(typeutil.royals); // ['kings', 'royalQueens', 'royalCentaurs']
	unallowedPromotes.push('pawns'); // ['kings', 'royalQueens', 'royalCentaurs', 'pawns']

	const white: string[] = [];
	const black: string[] = [];

	if (!promotionRanks) return { white, black };

	for (const key in position) {
		const thisPieceType: string = position[key]!;
		if (thisPieceType.endsWith('N')) continue; // Skip
		const trimmedType = colorutil.trimColorExtensionFromType(thisPieceType); // Slices off W/B at the end
		if (unallowedPromotes.includes(trimmedType)) continue; // Not allowed
		if (white.includes(trimmedType)) continue; // Already added
		// Only add if the color's promotion ranks is not empty
		if (promotionRanks.white.length > 0) white.push(trimmedType);
		if (promotionRanks.black.length > 0) black.push(trimmedType);
	}

	return { white, black };
}

/**
 * Accepts either a `positionString` or `gameruleModifications` property of a variant entry,
 * and a date, returns the value that should be used according to the date.
 * @param object - Either `positionString` or `gameruleModifications`
 * @param options - An object containing `UTCDate`, and `UTCTime`.
 */
function getApplicableTimestampEntry<Inner>(object: TimeVariantProperty<Inner>, { UTCDate, UTCTime }: {
	UTCDate: string,
	UTCTime: string
}): Inner {
	if (!(object as Object).hasOwnProperty(0)) {
		return object as Inner;
	}
	const date = timeutil.convertUTCDateUTCTimeToTimeStamp(UTCDate, UTCTime);

	let timeStampKeys = Object.keys(object as Object);
	
	timeStampKeys = timeStampKeys.sort().reverse(); // [1709017200000, 0]
	let timestampToUse: number;
	for (const timestamp of timeStampKeys) {
		const thisTimestamp = Number.parseInt(timestamp);
		if (thisTimestamp <= date) {
			timestampToUse = thisTimestamp;
			break;
		}
	}
	return (object as { [timestamp: number]: Inner })[timestampToUse!]!;
}

/**
 * Gets the piece movesets for the given variant and time, such that each piece contains a function returning a copy of its moveset (to avoid modifying originals)
 * @param options - An object containing the metadata `Variant`, and if desired, `UTCDate` & `UTCTime`.
 * @param options.Variant - The name of the variant for which to get the moveset.
 * @param [options.UTCDate] - Optional. The UTCDate metadata for which to get the moveset, in the format `YYYY.MM.DD`. Defaults to the current date.
 * @param [options.UTCTime] - Optional. The UTCTime metadata for which to get the moveset, in the format `HH:MM:SS`. Defaults to the current time.
 * @returns {Object} The pieceMovesets property of the gamefile.
 */
function getMovesetsOfVariant({ Variant, UTCDate = timeutil.getCurrentUTCDate(), UTCTime = timeutil.getCurrentUTCTime() }: {
	Variant: string,
	UTCDate: string,
	UTCTime: string
}) {
	// Pasted games with no variant specified use the default movesets
	// TODO: Transfer the slide limit game rule of pasted games
	if (Variant === undefined) return getMovesets();
	if (!isVariantValid(Variant)) throw new Error(`Cannot get movesets of invalid variant "${Variant}"!`);
	const variantEntry: Variant = variantDictionary[Variant]!;

	if (!variantEntry.movesetGenerator) {
		// console.log(`Variant "${Variant}" does not have a moveset generator. Using default movesets.`);
		if (variantEntry.gameruleModifications?.hasOwnProperty(0)) { // Multiple UTC timestamps
			return getMovesets({}, getApplicableTimestampEntry(variantEntry.gameruleModifications, { UTCDate, UTCTime }).slideLimit);
		} else { // Just one movesetGenerator entry
			return getMovesets({}, (variantEntry.gameruleModifications as GameRuleModifications)?.slideLimit);
		}
	}

	let movesetModifications: Movesets;
	if (variantEntry.movesetGenerator?.hasOwnProperty(0)) { // Multiple UTC timestamps
		movesetModifications = getApplicableTimestampEntry(variantEntry.movesetGenerator, { UTCDate, UTCTime })();
	} else { // Just one movesetGenerator entry
		movesetModifications = (<() => Movesets>variantEntry.movesetGenerator)();
	}

	return getMovesets(movesetModifications);
}

/**
 * Returns default movesets with provided modifications such that each piece contains a function returning a copy of its moveset (to avoid modifying originals).
 * Any piece type present in the modifications will replace the default move that for that piece.
 * The slidelimit gamerule will only be applied to default movesets, not modified ones.
 * @param movesetModifications - The modifications to the default movesets.
 * @param [defaultSlideLimitForOldVariants] Optional. The slidelimit to use for default movesets, if applicable.
 * @returns The pieceMovesets property of the gamefile.
 */
function getMovesets(movesetModifications: Movesets = {}, defaultSlideLimitForOldVariants?: number) {
	const origMoveset = movesets.getPieceDefaultMovesets(defaultSlideLimitForOldVariants);
	// The running piece movesets property of the gamefile.
	const pieceMovesets: {
		[pieceType: string]: () => PieceMoveset
	} = {};

	for (const [piece, moves] of Object.entries(origMoveset)) {
		pieceMovesets[piece] = movesetModifications[piece] ? () => jsutil.deepCopyObject(movesetModifications[piece]!)
														   : () => jsutil.deepCopyObject(moves);
	}

	return pieceMovesets;
}

function getSpecialMovesOfVariant({ Variant, UTCDate = timeutil.getCurrentUTCDate(), UTCTime = timeutil.getCurrentUTCTime() }: { Variant: string, UTCDate: string, UTCTime: string }) {
	const defaultSpecialMoves = jsutil.deepCopyObject(specialmove.defaultSpecialMoves);
	// Pasted games with no variant specified use the default
	if (Variant === undefined) return defaultSpecialMoves;
	if (!isVariantValid(Variant)) throw new Error(`Cannot get specialMoves of invalid variant "${Variant}"!`);
	const variantEntry: Variant = variantDictionary[Variant]!;

	if (variantEntry.specialMoves === undefined) return defaultSpecialMoves;

	const overrides = getApplicableTimestampEntry(variantEntry.specialMoves, { UTCDate, UTCTime });
	jsutil.copyPropertiesToObject(overrides, defaultSpecialMoves);
	return defaultSpecialMoves;
}


function getSpecialVicinityOfVariant({ Variant, UTCDate = timeutil.getCurrentUTCDate(), UTCTime = timeutil.getCurrentUTCTime() }: { Variant: string, UTCDate: string, UTCTime: string }) {
	const defaultSpecialVicinityByPiece = specialmove.getDefaultSpecialVicinitiesByPiece();
	// Pasted games with no variant specified use the default
	if (Variant === undefined) return defaultSpecialVicinityByPiece;
	if (!isVariantValid(Variant)) throw new Error(`Cannot get specialVicinity of invalid variant "${Variant}"!`);
	const variantEntry: Variant = variantDictionary[Variant]!;

	if (variantEntry.specialVicinity === undefined) return defaultSpecialVicinityByPiece;

	const overrides = getApplicableTimestampEntry(variantEntry.specialVicinity, { UTCDate, UTCTime });
	jsutil.copyPropertiesToObject(overrides, defaultSpecialVicinityByPiece);
	return defaultSpecialVicinityByPiece;
}


export default {
	isVariantValid,
	getStartingPositionOfVariant,
	getGameRulesOfVariant,
	// getVariantTurnOrder,
	getPromotionsAllowed,
	getMovesetsOfVariant,
	getSpecialMovesOfVariant,
	getSpecialVicinityOfVariant,
	getBareMinimumGameRules,
};

export type {
	Position,
	SpecialMoveFunction
};