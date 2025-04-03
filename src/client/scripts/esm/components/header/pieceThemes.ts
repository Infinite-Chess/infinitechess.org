import { rawTypes, players } from "../../chess/util/typeutil.js";

import type { RawType, Player } from "../../chess/util/typeutil.js";
import type { Color } from "../../util/math.js";

type PieceColorGroup = {
	// eslint-disable-next-line no-unused-vars
	[team in Player]: Color
}

/** The default tints for a piece, if not provided. */
const defaultBaseColors: PieceColorGroup = {
	[players.WHITE]: [1, 1, 1, 1],
	[players.BLACK]: [1, 1, 1, 1],
	[players.NEUTRAL]: [0.5, 0.5, 0.5, 1]
};

/** Config for the SVGs of the pieces */
const SVGConfig: {
    // eslint-disable-next-line no-unused-vars
    [type in RawType]: {
		/** null if the raw type doesn't have an svg (VOID) */
        location: string | null
        colors?: PieceColorGroup
    }
} = {
	[rawTypes.VOID]: {
		location: null, // VOID has no svg
		colors: {
			[players.WHITE]: [1, 1, 1, 1],
			[players.BLACK]: [0.3, 0.3, 0.3, 1],
			[players.NEUTRAL]: [0, 0, 0, 1]
		}
	},
	[rawTypes.OBSTACLE]: {
		location: "fairy/obstacle",
		colors: {
			[players.WHITE]: [1, 1, 1, 1],
			[players.BLACK]: [0, 0, 0, 1],
			[players.NEUTRAL]: [0.08, 0.08, 0.08, 1]
		}
	},
	[rawTypes.KING]: { location: "classical" },
	[rawTypes.GIRAFFE]: { location: "fairy/giraffe" },
	[rawTypes.CAMEL]: { location: "fairy/camel" },
	[rawTypes.ZEBRA]: { location: "fairy/zebra" },
	[rawTypes.KNIGHTRIDER]: { location: "fairy/knightrider" },
	[rawTypes.AMAZON]: { location: "fairy/amazon" },
	[rawTypes.QUEEN]: { location: "classical" },
	[rawTypes.ROYALQUEEN]: { location: "fairy/royalQueen" },
	[rawTypes.HAWK]: { location: "fairy/hawk" },
	[rawTypes.CHANCELLOR]: { location: "fairy/chancellor" },
	[rawTypes.ARCHBISHOP]: { location: "fairy/archbishop" },
	[rawTypes.CENTAUR]: { location: "fairy/centaur" },
	[rawTypes.ROYALCENTAUR]: { location: "fairy/royalCentaur" },
	[rawTypes.ROSE]: { location: "fairy/rose" },
	[rawTypes.KNIGHT]: { location: "classical" },
	[rawTypes.GUARD]: { location: "fairy/guard" },
	[rawTypes.HUYGEN]: { location: "fairy/huygen" },
	[rawTypes.ROOK]: { location: "classical" },
	[rawTypes.BISHOP]: { location: "classical" },
	[rawTypes.PAWN]: { location: "classical" },
};

function getLocationsForTypes(types: Iterable<RawType>): Set<string> {
	const locations: Set<string> = new Set();
	for (const raw of types) {
		const location = getLocationForType(raw);
		if (location) locations.add(location);
	}
	return locations;
}

function getLocationForType(type: RawType): string | null {
	return SVGConfig[type].location;
}

function getBaseColorForType(type: RawType, team: Player): Color {
	return (SVGConfig[type].colors ?? defaultBaseColors)[team];
}

export type {
	PieceColorGroup,
};

export default {
	getLocationsForTypes,
	getLocationForType,
	getBaseColorForType,
};