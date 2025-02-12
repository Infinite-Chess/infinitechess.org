
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

type RawType = typeof rawTypes[keyof typeof rawTypes]

const numTypes = Object.keys(rawTypes).length;

function getRawType(type: number): RawType {
	return type % numTypes as RawType;
}

function getColorFromType(type: number): number {
	return Math.floor(type / numTypes);
}

function buildType(type: RawType, color: number): number {
	return color * numTypes + type;
}