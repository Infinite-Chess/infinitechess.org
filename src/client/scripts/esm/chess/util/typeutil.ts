
/**
 * All piece types the game is currently compatible with (excluding neutrals).
 * 
 * They are arranged in this order for faster checkmate/draw detection,
 * as we should check if the kings have a legal move first.
 */
const types = ['kings', 'giraffes', 'camels', 'zebras', 'knightriders', 'amazons', 'queens', 'royalQueens', 'hawks', 'chancellors', 'archbishops', 'centaurs', 'royalCentaurs', 'roses', 'knights', 'guards', 'huygens', 'rooks', 'bishops', 'pawns'];

const rawTypes = {
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
	PAWN: 21
} as const;

const jumpingroyals = [rawTypes.KING, rawTypes.ROYALCENTAUR];

const slidingroyals = [rawTypes.ROYALQUEEN];

const royals = [...jumpingroyals, ...slidingroyals];

const colors = {
	NEUTRAL: 0,
	WHITE: 1,
	BLACK: 2,
} as const;

const strcolors = ["neutral", "white", "black"];

type RawType = typeof rawTypes[keyof typeof rawTypes]
type TeamColor = typeof colors[keyof typeof colors]

const numTypes = Object.keys(rawTypes).length;

function getRawType(type: number): RawType {
	return type % numTypes as RawType;
}

function getColorFromType(type: number): TeamColor {
	return Math.floor(type / numTypes) as TeamColor;
}

function getColorStringFromType(type: number): string {
	return strcolors[getColorFromType(type)];
}

function buildType(type: RawType, color: number): number {
	return color * numTypes + type;
}

// eslint-disable-next-line no-unused-vars
function forEachPieceType(callback: (pieceType: number) => void, colors: TeamColor[], includePieces: RawType[]) {
	for (let i = colors.length - 1; i >= 0; i--) {
		for (const r of includePieces) {
			callback(buildType(r, colors[i]));
		}
	}
}

export type {
	RawType,
	TeamColor
};

export default {
	rawTypes,
	colors,
	jumpingroyals,
	royals,

	getRawType,
	getColorFromType,
	getColorStringFromType,
	buildType,
	forEachPieceType,
};