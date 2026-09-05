// src/shared/chess/util/typeutil.ts

/**
 * This script contains lists of all piece types and players,
 * and utility methods for working with them.
 */

// Constants -------------------------------------------------------------------

/**
 * Every raw type of piece supported in the game.
 *
 * This exact arrangement affects the order of which
 * the checkmate algorithm searches for legal moves,
 * and it affects the order the miniimages of the
 * pieces are rendered when zoomed out.
 */
export const rawTypes = {
	VOID: 0,
	OBSTACLE: 1,
	KING: 2,
	GIRAFFE: 3,
	CAMEL: 4,
	ZEBRA: 5,
	KNIGHTRIDER: 6,
	AMAZON: 7,
	QUEEN: 8,
	ROYALQUEEN: 9,
	HAWK: 10,
	CHANCELLOR: 11,
	ARCHBISHOP: 12,
	CENTAUR: 13,
	ROYALCENTAUR: 14,
	ROSE: 15,
	KNIGHT: 16,
	GUARD: 17,
	HUYGEN: 18,
	ROOK: 19,
	BISHOP: 20,
	PAWN: 21,
} as const;

export const neutralRawTypes: RawType[] = [rawTypes.VOID, rawTypes.OBSTACLE];

/** All player colors suppored in the game. Multiply the raw type by this to get the colored type. */
export const players = {
	NEUTRAL: 0,
	WHITE: 1,
	BLACK: 2,
	// Colored players
	RED: 3,
	BLUE: 4,
	YELLOW: 5,
	GREEN: 6,
} as const;

export const numTypes = Object.keys(rawTypes).length;

/** Color extensions of all players. Add this to a raw type to get the colored type. */
export const ext = {
	N: players.NEUTRAL * numTypes,
	W: players.WHITE * numTypes,
	B: players.BLACK * numTypes,
	// Colored players
	R: players.RED * numTypes,
	BU: players.BLUE * numTypes,
	Y: players.YELLOW * numTypes,
	G: players.GREEN * numTypes,
} as const;

/**
 * The string representations of each raw type.
 *
 * MUST BE IN THE EXACT SAME ORDER AS {@link rawTypes}!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
 */
const strtypes = [
	'void',
	'obstacle',
	'king',
	'giraffe',
	'camel',
	'zebra',
	'knightrider',
	'amazon',
	'queen',
	'royalQueen',
	'hawk',
	'chancellor',
	'archbishop',
	'centaur',
	'royalCentaur',
	'rose',
	'knight',
	'guard',
	'huygen',
	'rook',
	'bishop',
	'pawn',
] as const;

/** Royals with no sliding movements. */
const jumpingRoyals: RawType[] = [rawTypes.KING, rawTypes.ROYALCENTAUR];
/** Royals that require special rules disabling them from sliding into check. */
const slidingRoyals: RawType[] = [rawTypes.ROYALQUEEN];
/**
 * A list of the royal pieces, without the color appended.
 * THIS SHOULD NOT CONTAIN DUPLICATES
 */
const royals: RawType[] = [...jumpingRoyals, ...slidingRoyals];

/**
 * The string representations of each player color.
 *
 * MUST BE IN THE EXACT SAME ORDER AS {@link players}!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
 */
const strcolors = ['neutral', 'white', 'black', 'red', 'blue', 'yellow', 'green'] as const;

// Types -----------------------------------------------------------------------

export type RawType = (typeof rawTypes)[keyof typeof rawTypes];
export type Player = (typeof players)[keyof typeof players];

/** A dictionary type with raw types for keys */
export type RawTypeGroup<T> = {
	[_t in RawType]?: T;
};

/** A dictionary type with all types for keys */
export type TypeGroup<T> = { [t: number]: T };

/** A dictionary type with player colors for keys */
export type PlayerGroup<T> = {
	[_p in Player]?: T;
};

// Functions -------------------------------------------------------------------

/** Strips the color off a colored type, leaving the raw piece kind. */
function getRawType(type: number): RawType {
	return (type % numTypes) as RawType;
}

/** The player a colored type belongs to. */
function getColorFromType(type: number): Player {
	return Math.floor(type / numTypes) as Player;
}

/** Combines a raw piece kind and a player into the colored type that encodes both. */
function buildType(type: RawType, color: Player): number {
	return type + color * numTypes;
}

/** Splits a type into its raw type and player */
function splitType(type: number): [RawType, Player] {
	return [getRawType(type), getColorFromType(type)];
}

/** Builds every combination of the given raw types and players, last player first. */
function buildAllTypesForPlayers(forPlayers: Player[], forRawTypes: RawType[]): number[] {
	const builtTypes: number[] = [];
	for (let i = forPlayers.length - 1; i >= 0; i--) {
		for (const r of forRawTypes) {
			builtTypes.push(buildType(r, forPlayers[i]!));
		}
	}
	return builtTypes;
}

/** Runs the callback over every combination of the given raw types and players, last player first. */
function forEachPieceType(
	callback: (pieceType: number) => void,
	forPlayers: Player[],
	includePieces: RawType[],
): void {
	for (let i = forPlayers.length - 1; i >= 0; i--) {
		for (const r of includePieces) {
			callback(buildType(r, forPlayers[i]!));
		}
	}
}

/** Inverts the type so it belongs to the opposite color. */
function invertType(type: number): number {
	const [r, p] = splitType(type);
	const newp = invertPlayer(p); // This will throw an error if the type is not invertible because of its color. (We should never attempt to invert it anyway)
	return buildType(r, newp);
}

/**
 * Inverts the player id. Neutral gets inverted to neutral.
 * @throws If any 4 Player color is provided.
 */
function invertPlayer(player: Player): Player {
	// prettier-ignore
	return player === players.NEUTRAL ? players.NEUTRAL :
		player === players.WHITE ? players.BLACK :
		player === players.BLACK ? players.WHITE :
		((): never => { throw Error(`Cannot invert player ${player}!`); })(); // No downsides to adding this, only more protection.
}

/** The english name of a raw piece kind, e.g. `"knightrider"`. */
function getRawTypeStr(type: RawType): string {
	return strtypes[type];
}

/** Prunes, IN PLACE, every entry of a raw-type group whose piece this game doesn't use. */
function deleteUnusedFromRawTypeGroup<T>(
	existingRawTypes: RawType[],
	group: RawTypeGroup<T>,
): void {
	for (const key in group) {
		const rawType = Number(key) as RawType;
		if (!existingRawTypes.includes(rawType)) delete group[rawType];
	}
}

/**
 * Returns the english string of a piece type.
 * 30 => "[30] queen(white)"
 */
function debugType(type: number): string {
	const [raw, c] = splitType(type);
	return `[${type}] ${getRawTypeStr(raw)}(${strcolors[c]})`;
}

// Exports ---------------------------------------------------------------------

export default {
	// Constants
	jumpingRoyals,
	royals,
	strcolors,
	// Functions
	getRawType,
	getColorFromType,
	buildType,
	splitType,
	buildAllTypesForPlayers,
	forEachPieceType,
	invertType,
	invertPlayer,
	getRawTypeStr,
	deleteUnusedFromRawTypeGroup,
	debugType,
};
