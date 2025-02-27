
import { rawTypes, colors } from "../config";

/**
 * All piece types the game is currently compatible with (excluding neutrals).
 * 
 * They are arranged in this order for faster checkmate/draw detection,
 * as we should check if the kings have a legal move first.
 */
const strtypes = ['voids', 'obstacle', 'kings', 'giraffes', 'camels', 'zebras', 'knightriders', 'amazons', 'queens', 'royalQueens', 'hawks', 'chancellors', 'archbishops', 'centaurs', 'royalCentaurs', 'roses', 'knights', 'guards', 'huygens', 'rooks', 'bishops', 'pawns'];

const jumpingroyals = [rawTypes.KING, rawTypes.ROYALCENTAUR];

const slidingroyals = [rawTypes.ROYALQUEEN];

const royals = [...jumpingroyals, ...slidingroyals];

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

function buildType(type: RawType, color: TeamColor): number {
	return color * numTypes + type;
}

function splitType(type: number): [RawType, TeamColor] {
	return [getRawType(type), getColorFromType(type)];
}

// eslint-disable-next-line no-unused-vars
function forEachPieceType(callback: (pieceType: number) => void, colors: TeamColor[], includePieces: RawType[]) {
	for (let i = colors.length - 1; i >= 0; i--) {
		for (const r of includePieces) {
			callback(buildType(r, colors[i]));
		}
	}
}

function invertType(type: number): number {
	const c = getColorFromType(type);
	const r = getRawType(type);
	const newc = c === colors.WHITE ? colors.BLACK :
				 c === colors.BLACK ? colors.WHITE :
				 undefined;
	if ( newc === undefined ) return type;
	return buildType(r, newc);
}

function getRawTypeStr(type: RawType): string {
	return strtypes[type];
}

export type {
	RawType,
	TeamColor
};

export default {
	jumpingroyals,
	royals,

	getRawType,
	getColorFromType,
	getColorStringFromType,
	buildType,
	splitType,
	invertType,
	forEachPieceType,
	getRawTypeStr,
};