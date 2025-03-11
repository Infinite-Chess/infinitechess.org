
import { rawTypes, players, numTypes } from "../config";
import type { Piece } from "./boardutil";

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

const strcolors = ["neutral", "white", "black"] as const;

type StrPlayer = typeof strcolors[number]
type RawType = typeof rawTypes[keyof typeof rawTypes]
type Player = typeof players[keyof typeof players]

function getRawType(type: number): RawType {
	return type % numTypes as RawType;
}

function getColorFromType(type: number): Player {
	return Math.floor(type / numTypes) as Player;
}

function getColorStringFromType(type: number): string {
	return strcolors[getColorFromType(type)];
}

function buildType(type: RawType, color: Player): number {
	return color * numTypes + type;
}

function splitType(type: number): [RawType, Player] {
	return [getRawType(type), getColorFromType(type)];
}

// eslint-disable-next-line no-unused-vars
function forEachPieceType(callback: (pieceType: number) => void, players: Player[], includePieces: RawType[]) {
	for (let i = players.length - 1; i >= 0; i--) {
		for (const r of includePieces) {
			callback(buildType(r, players[i]!));
		}
	}
}

function invertType(type: number): number {
	const c = getColorFromType(type);
	const r = getRawType(type);
	const newc = c === players.WHITE ? players.BLACK :
				 c === players.BLACK ? players.WHITE :
				 undefined;
	if ( newc === undefined ) return type;
	return buildType(r, newc);
}

function invertPlayer(player: Player) {
	return player === players.WHITE ? players.BLACK :
				 player === players.BLACK ? players.WHITE :
				 undefined;
}

function getRawTypeStr(type: RawType): string {
	return strtypes[type];
}

function isRawType(piece: Piece, type: RawType) {
	return piece.type === type;
}

function getPlayerFromString(string: StrPlayer): Player {
	return strcolors.indexOf(string) as Player;
}

export type {
	RawType,
	Player
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
	invertPlayer,
	isRawType,
	getPlayerFromString
};