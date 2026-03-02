// src/shared/components/header/pieceThemes.ts

/**
 * This script stores the SVG locations and default tint colors for the pieces.
 */

import type { Color } from '../../util/math/math.js';
import type { RawType, Player } from '../../chess/util/typeutil.js';

import { rawTypes as r, players as p } from '../../chess/util/typeutil.js';

type PieceColorGroup = {
	[_team in Player]: Color;
};

/** The default tints for a piece, if not provided. */
const defaultBaseColors: PieceColorGroup = {
	[p.NEUTRAL]: [0.5, 0.5, 0.5, 1],
	[p.WHITE]: [1, 1, 1, 1],
	[p.BLACK]: [1, 1, 1, 1],
	// If these are solid color, they're quite saturated
	[p.RED]: [1, 0.17, 0.17, 1],
	[p.BLUE]: [0.23, 0.23, 1, 1],
	[p.YELLOW]: [1, 1, 0.1, 1],
	[p.GREEN]: [0.1, 1, 0.1, 1],
};

/** Config for the SVGs of the pieces */
const SVGConfig: {
	[_type in RawType]: {
		/** null if the raw type doesn't have an svg (VOID) */
		location: string | null;
		colors?: PieceColorGroup;
	};
} = {
	[r.VOID]: {
		location: null, // VOID has no svg
		colors: {
			[p.NEUTRAL]: [0, 0, 0, 1],
			[p.WHITE]: [1, 1, 1, 1],
			[p.BLACK]: [0.3, 0.3, 0.3, 1],
			[p.RED]: [1, 0, 0, 1],
			[p.BLUE]: [0, 0, 1, 1],
			[p.YELLOW]: [1, 1, 0, 1],
			[p.GREEN]: [0, 1, 0, 1],
		},
	},
	[r.OBSTACLE]: {
		location: 'fairy/obstacle',
		colors: {
			[p.NEUTRAL]: [0.08, 0.08, 0.08, 1],
			[p.WHITE]: [1, 1, 1, 1],
			[p.BLACK]: [0, 0, 0, 1],
			[p.RED]: [1, 0, 0, 1],
			[p.BLUE]: [0, 0, 1, 1],
			[p.YELLOW]: [1, 1, 0, 1],
			[p.GREEN]: [0, 1, 0, 1],
		},
	},
	[r.KING]: { location: 'classical' },
	[r.GIRAFFE]: { location: 'fairy/giraffe' },
	[r.CAMEL]: { location: 'fairy/camel' },
	[r.ZEBRA]: { location: 'fairy/zebra' },
	[r.KNIGHTRIDER]: { location: 'fairy/knightrider' },
	[r.AMAZON]: { location: 'fairy/amazon' },
	[r.QUEEN]: { location: 'classical' },
	[r.ROYALQUEEN]: { location: 'fairy/royalQueen' },
	[r.HAWK]: { location: 'fairy/hawk' },
	[r.CHANCELLOR]: { location: 'fairy/chancellor' },
	[r.ARCHBISHOP]: { location: 'fairy/archbishop' },
	[r.CENTAUR]: { location: 'fairy/centaur' },
	[r.ROYALCENTAUR]: { location: 'fairy/royalCentaur' },
	[r.ROSE]: { location: 'fairy/rose' },
	[r.KNIGHT]: { location: 'classical' },
	[r.GUARD]: { location: 'fairy/guard' },
	[r.HUYGEN]: { location: 'fairy/huygen' },
	[r.ROOK]: { location: 'classical' },
	[r.BISHOP]: { location: 'classical' },
	[r.PAWN]: { location: 'classical' },
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

export type { PieceColorGroup };

export default {
	getLocationsForTypes,
	getLocationForType,
	getBaseColorForType,
};
