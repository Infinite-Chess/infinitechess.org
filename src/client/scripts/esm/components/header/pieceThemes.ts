import { rawTypes, players } from "../../chess/config.js";
import typeutil from "../../chess/util/typeutil.js";
import jsutil from "../../util/jsutil.js";

import type { RawType, Player } from "../../chess/util/typeutil.js";
import type { Color } from "../../chess/util/colorutil.js";

type PieceColorGroup = {
	[team in Player]: Color
}

type PieceData<T> = {
	[type in RawType]: T
}

type PieceColorTheme = PieceData<PieceColorGroup>
type PieceSVGTheme = Partial<PieceData<string>>

interface ColorArgs {
	[type: number]: Color
}

const dualColors: PieceColorGroup = {
	[players.WHITE]: [1, 1, 1, 1],
	[players.BLACK]: [1, 1, 1, 1],
	[players.NEUTRAL]: [0.5, 0.5, 0.5, 1]
};

const pieceDefaultColors: PieceColorTheme = {
	[rawTypes.VOID]: {
		[players.WHITE]: [1, 1, 1, 1],
		[players.BLACK]: [0.3, 0.3, 0.3, 1],
		[players.NEUTRAL]: [0, 0, 0, 1]
	},
	[rawTypes.OBSTACLE]: {
		[players.WHITE]: [10, 10, 10, 1],
		[players.BLACK]: [0, 0, 0, 1],
		[players.NEUTRAL]: [1, 1, 1, 1]
	},
	[rawTypes.KING]: dualColors,
	[rawTypes.GIRAFFE]: dualColors,
	[rawTypes.CAMEL]: dualColors,
	[rawTypes.ZEBRA]: dualColors,
	[rawTypes.KNIGHTRIDER]: dualColors,
	[rawTypes.AMAZON]: dualColors,
	[rawTypes.QUEEN]: dualColors,
	[rawTypes.ROYALQUEEN]: dualColors,
	[rawTypes.HAWK]: dualColors,
	[rawTypes.CHANCELLOR]: dualColors,
	[rawTypes.ARCHBISHOP]: dualColors,
	[rawTypes.CENTAUR]: dualColors,
	[rawTypes.ROYALCENTAUR]: dualColors,
	[rawTypes.ROSE]: dualColors,
	[rawTypes.KNIGHT]: dualColors,
	[rawTypes.GUARD]: dualColors,
	[rawTypes.HUYGEN]: dualColors,
	[rawTypes.ROOK]: dualColors,
	[rawTypes.BISHOP]: dualColors,
	[rawTypes.PAWN]: dualColors,
};

const pieceDefaultSVGs = {
	[rawTypes.OBSTACLE]: "fairy/obstacle",
	[rawTypes.KING]: "classical",
	[rawTypes.GIRAFFE]: "fairy/giraffe",
	[rawTypes.CAMEL]: "fairy/camel",
	[rawTypes.ZEBRA]: "fairy/zebra",
	[rawTypes.KNIGHTRIDER]: "fairy/knightrider",
	[rawTypes.AMAZON]: "fairy/amazon",
	[rawTypes.QUEEN]: "classical",
	[rawTypes.ROYALQUEEN]: "fairy/royalQueen",
	[rawTypes.HAWK]: "fairy/hawk",
	[rawTypes.CHANCELLOR]: "fairy/chancellor",
	[rawTypes.ARCHBISHOP]: "fairy/archbishop",
	[rawTypes.CENTAUR]: "fairy/centaur",
	[rawTypes.ROYALCENTAUR]: "fairy/royalCentaur",
	[rawTypes.ROSE]: "fairy/rose",
	[rawTypes.KNIGHT]: "classical",
	[rawTypes.GUARD]: "fairy/guard",
	[rawTypes.HUYGEN]: "fairy/huygen",
	[rawTypes.ROOK]: "classical",
	[rawTypes.BISHOP]: "classical",
	[rawTypes.PAWN]: "classical",
};

function getPieceDataForTheme<T>(type: RawType, defaultTheme: Partial<PieceData<T>>, theme: Partial<PieceData<T>>): T | undefined {
	const data = theme[type];
	if (data === undefined) return defaultTheme[type];
	return data;
}

function generateThemeColorArgs(types: number[], themeOver: Partial<PieceColorTheme>): false | ColorArgs {
	const colorArgs: ColorArgs = {};
	for (const type of types) {
		const [raw, c] = typeutil.splitType(type);
		const colorgroup = getPieceDataForTheme(raw, pieceDefaultColors, themeOver);
		if (colorgroup === undefined) continue;
		const recolor = colorgroup[c];
		if (
			recolor[0] !== 1 ||
			recolor[1] !== 1 ||
			recolor[2] !== 1 ||
			recolor[3] !== 1
		) colorArgs[type] = recolor;
		
	}
	if (!jsutil.isEmpty(colorArgs)) return false;
	return colorArgs;
}

export type {
	ColorArgs,
	PieceColorTheme,
	PieceSVGTheme,
};

export default {
	pieceDefaultColors,
	pieceDefaultSVGs,

	getPieceDataForTheme,
	generateThemeColorArgs,
};