/** The maximum number of pieces in-game to still use the checkmate algorithm. Above this uses "royalcapture". */
const pieceCountToDisableCheckmate = 50_000 as const;

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

const players = {
	NEUTRAL: 0,
	WHITE: 1,
	BLACK: 2,
} as const;

const listExtras = 20 as const;

export {
	rawTypes,
	listExtras,
	pieceCountToDisableCheckmate,
	players,
};