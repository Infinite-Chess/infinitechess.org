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

/**
 * Determines the priority of what player color gets what color of svg, depending on what's available.
 * For example, if player neutral needs a pawn svg, it will first look for a neutral svg,
 * but when it doesn't exist it will fallback to the white svg.
 * @param color - The player color code (0, 1, or 2).
 * @returns An array of SVG id suffixes, ordered by lookup priority.
 */
function getSVGColorPriority(color: Player): string[] {
	switch (color) {
		case 0: // Neutral: prioritize neutral svg over white
			return ['-neutral', '-white'];
		case 1: // White: prioritize white svg over black
			return ['-white', '-neutral'];
		case 2: // Black: prioritize black svg over neutral
			return ['-black', '-neutral'];
		// All higher player numbers are treated as tinted white pieces...
		case 3: // Red: prioritize white svg over neutral
			return ['-white', '-neutral'];
		case 4: // Blue: prioritize white svg over neutral
			return ['-white', '-neutral'];
		case 5: // Yellow: prioritize white svg over neutral
			return ['-white', '-neutral'];
		case 6: // Green: prioritize white svg over neutral
			return ['-white', '-neutral'];
		default:
			throw new Error(`Invalid color code: ${color satisfies never}`);
	}
}

export type { PieceColorGroup };

export default {
	getLocationsForTypes,
	getLocationForType,
	getBaseColorForType,
	getSVGColorPriority,
};
