
// This module stores our themes. Straight forward :P

const defaultTheme = 'sandstone';

const themeDictionary = {
	white: { // White/Grey
		whiteTiles: [1, 1, 1, 1], // RGBA
		darkTiles:  [0.78, 0.78, 0.78, 1],
		selectedPieceHighlightColor: [0, 0.5, 0.5, 0.3],
		legalMovesHighlightColor_Friendly: [0, 0, 1, 0.3],
		legalMovesHighlightColor_Opponent: [1, 0.7, 0, 0.35],
		legalMovesHighlightColor_Premove: [0.3, 0, 1, 0.3],
		lastMoveHighlightColor: [0, 1, 0, 0.25], // 0.17
		checkHighlightColor: [1, 0, 0, 0.7],
		// If this is false, we will render them white,
		// utilizing the more efficient color-less shader program!
		useColoredPieces: false,
		whitePiecesColor: [1, 1, 1, 1],
		blackPiecesColor: [1, 1, 1, 1],
		neutralPiecesColor: [1, 1, 1, 1],
	},
	sandstone: { // Sometimes thanksgiving uses this
		whiteTiles: [239 / 255, 225 / 255, 199 / 255, 1],
		darkTiles: [188 / 255, 160 / 255, 136 / 255, 1],
		selectedPieceHighlightColor: [0, 0.5, 0.5, 0.3],
		legalMovesHighlightColor_Friendly: [1, 0.2, 0, 0.35], // 0.5 for BIG positions   0.35 for SMALL
		legalMovesHighlightColor_Opponent: [1, 0.7, 0, 0.35],
		legalMovesHighlightColor_Premove: [0.25, 0, 0.7, 0.3],
		lastMoveHighlightColor: [0.3, 1, 0, 0.35], // 0.3 for small, 0.35 for BIG positions
		checkHighlightColor: [1, 0, 0, 0.7],
		useColoredPieces: false,
		whitePiecesColor: [1, 1, 1, 1],
		blackPiecesColor: [1, 1, 1, 1],
		neutralPiecesColor: [1, 1, 1, 1],
	},
	lichess: {
		whiteTiles: [238 / 255, 216 / 255, 185 / 255, 1],
		darkTiles: [178 / 255, 136 / 255, 104 / 255, 1],
		selectedPieceHighlightColor: [0, 0.5, 0.5, 0.3],
		legalMovesHighlightColor_Friendly: [0, 0, 1, 0.3],
		legalMovesHighlightColor_Opponent: [1, 0.7, 0, 0.35],
		legalMovesHighlightColor_Premove: [0.3, 0, 1, 0.3],
		lastMoveHighlightColor: [0, 1, 0, 0.25],
		checkHighlightColor: [1, 0, 0, 0.7],
		useColoredPieces: false,
		whitePiecesColor: [1, 1, 1, 1],
		blackPiecesColor: [1, 1, 1, 1],
		neutralPiecesColor: [1, 1, 1, 1],
	},
	wood: {
		whiteTiles: [246 / 255, 207 / 255, 167 / 255, 1],
		darkTiles: [197 / 255, 141 / 255, 88 / 255, 1],
		selectedPieceHighlightColor: [1, 1, 0,  0.25],
		legalMovesHighlightColor_Friendly: [1, 0.2, 0,  0.4], // 0.5 for BIG positions   0.35 for SMALL
		legalMovesHighlightColor_Opponent: [1, 0.7, 0, 0.35],
		legalMovesHighlightColor_Premove: [0.3, 0, 1, 0.3],
		lastMoveHighlightColor: [0, 1, 0, 0.25],
		checkHighlightColor: [1, 0, 0, 0.7],
		useColoredPieces: false,
		whitePiecesColor: [1, 1, 1, 1],
		blackPiecesColor: [1, 1, 1, 1],
		neutralPiecesColor: [1, 1, 1, 1],
	},
	darkSandstone: {
		whiteTiles: [220 / 255, 193 / 255, 127 / 255, 1],
		darkTiles: [176 / 255, 140 / 255, 88 / 255, 1],
		selectedPieceHighlightColor: [0, 0.5, 0.5, 0.3],
		legalMovesHighlightColor_Friendly: [0, 0, 1, 0.3],
		legalMovesHighlightColor_Opponent: [1, 0.7, 0, 0.35],
		legalMovesHighlightColor_Premove: [0.3, 0, 1, 0.3],
		lastMoveHighlightColor: [0, 1, 0, 0.25],
		checkHighlightColor: [1, 0, 0, 0.7],
		useColoredPieces: false,
		whitePiecesColor: [1, 1, 1, 1],
		blackPiecesColor: [1, 1, 1, 1],
		neutralPiecesColor: [1, 1, 1, 1],
	},
	redWood: {
		whiteTiles: [245 / 255, 210 / 255, 178 / 255, 1],
		darkTiles: [193 / 255, 90 / 255, 60 / 255, 1],
		selectedPieceHighlightColor: [0, 0.5, 0.5, 0.3],
		legalMovesHighlightColor_Friendly: [0, 0, 1, 0.3],
		legalMovesHighlightColor_Opponent: [1, 0.7, 0, 0.35],
		legalMovesHighlightColor_Premove: [0.3, 0, 1, 0.3],
		lastMoveHighlightColor: [0, 1, 0, 0.25],
		checkHighlightColor: [1, 0, 0, 0.7],
		useColoredPieces: false,
		whitePiecesColor: [1, 1, 1, 1],
		blackPiecesColor: [1, 1, 1, 1],
		neutralPiecesColor: [1, 1, 1, 1],
	},
	beehive: {
		whiteTiles: [255 / 255, 219 / 255, 90 / 255, 1],
		darkTiles: [225 / 255, 132 / 255, 13 / 255, 1],
		selectedPieceHighlightColor: [0, 0.5, 0.5, 0.3],
		legalMovesHighlightColor_Friendly: [0, 0, 1, 0.3],
		legalMovesHighlightColor_Opponent: [1, 0.7, 0, 0.35],
		legalMovesHighlightColor_Premove: [0.3, 0, 1, 0.3],
		lastMoveHighlightColor: [0, 1, 0, 0.25],
		checkHighlightColor: [1, 0, 0, 0.7],
		useColoredPieces: false,
		whitePiecesColor: [1, 1, 1, 1],
		blackPiecesColor: [1, 1, 1, 1],
		neutralPiecesColor: [1, 1, 1, 1],
	},
	blue: {
		whiteTiles: [213 / 255, 231 / 255, 240 / 255, 1],
		darkTiles: [66 / 255, 140 / 255, 198 / 255, 1],
		selectedPieceHighlightColor: [0, 0.5, 0.5, 0.3],
		legalMovesHighlightColor_Friendly: [0, 0, 1, 0.3],
		legalMovesHighlightColor_Opponent: [1, 0.7, 0, 0.35],
		legalMovesHighlightColor_Premove: [0.3, 0, 1, 0.3],
		lastMoveHighlightColor: [0, 1, 0, 0.25],
		checkHighlightColor: [1, 0, 0, 0.7],
		useColoredPieces: false,
		whitePiecesColor: [1, 1, 1, 1],
		blackPiecesColor: [1, 1, 1, 1],
		neutralPiecesColor: [1, 1, 1, 1],
	},
	ocean: {
		whiteTiles: [106 / 255, 190 / 255, 246 / 255, 1],
		darkTiles: [63 / 255, 118 / 255, 186 / 255, 1],
		selectedPieceHighlightColor: [0, 0.5, 0.5, 0.3],
		legalMovesHighlightColor_Friendly: [0, 0, 1, 0.3],
		legalMovesHighlightColor_Opponent: [1, 0.7, 0, 0.35],
		legalMovesHighlightColor_Premove: [0.3, 0, 1, 0.3],
		lastMoveHighlightColor: [0, 1, 0, 0.25],
		checkHighlightColor: [1, 0, 0, 0.7],
		useColoredPieces: false,
		whitePiecesColor: [1, 1, 1, 1],
		blackPiecesColor: [1, 1, 1, 1],
		neutralPiecesColor: [1, 1, 1, 1],
	},
	cyanOcean: {
		whiteTiles: [15 / 255, 255 / 255, 255 / 255, 1],
		darkTiles: [45 / 255, 195 / 255, 200 / 255, 1],
		selectedPieceHighlightColor: [0, 0.5, 0.5, 0.3],
		legalMovesHighlightColor_Friendly: [0, 0, 1, 0.3],
		legalMovesHighlightColor_Opponent: [1, 0.7, 0, 0.35],
		legalMovesHighlightColor_Premove: [0.3, 0, 1, 0.3],
		lastMoveHighlightColor: [0, 1, 0, 0.25],
		checkHighlightColor: [1, 0, 0, 0.7],
		useColoredPieces: false,
		whitePiecesColor: [1, 1, 1, 1],
		blackPiecesColor: [1, 1, 1, 1],
		neutralPiecesColor: [1, 1, 1, 1],
	},
	green: {
		whiteTiles: [238 / 255, 238 / 255, 216 / 255, 1],
		darkTiles: [130 / 255, 146 / 255, 101 / 255, 1],
		selectedPieceHighlightColor: [0, 0.5, 0.5, 0.3],
		legalMovesHighlightColor_Friendly: [0, 0, 1, 0.3],
		legalMovesHighlightColor_Opponent: [1, 0.7, 0, 0.35],
		legalMovesHighlightColor_Premove: [0.3, 0, 1, 0.3],
		lastMoveHighlightColor: [0, 1, 0, 0.25],
		checkHighlightColor: [1, 0, 0, 0.7],
		useColoredPieces: false,
		whitePiecesColor: [1, 1, 1, 1],
		blackPiecesColor: [1, 1, 1, 1],
		neutralPiecesColor: [1, 1, 1, 1],
	},
	avocado: {
		whiteTiles: [213 / 255, 250 / 255, 127 / 255, 1],
		darkTiles: [159 / 255, 196 / 255, 89 / 255, 1],
		selectedPieceHighlightColor: [0, 0.5, 0.5, 0.3],
		legalMovesHighlightColor_Friendly: [0, 0, 1, 0.3],
		legalMovesHighlightColor_Opponent: [1, 0.7, 0, 0.35],
		legalMovesHighlightColor_Premove: [0.3, 0, 1, 0.3],
		lastMoveHighlightColor: [0, 1, 0, 0.25],
		checkHighlightColor: [1, 0, 0, 0.7],
		useColoredPieces: false,
		whitePiecesColor: [1, 1, 1, 1],
		blackPiecesColor: [1, 1, 1, 1],
		neutralPiecesColor: [1, 1, 1, 1],
	},
	lime: {
		whiteTiles: [204 / 255, 240 / 255, 100 / 255, 1],
		darkTiles: [100 / 255, 180 / 255, 15 / 255, 1],
		selectedPieceHighlightColor: [0, 0.5, 0.5, 0.3],
		legalMovesHighlightColor_Friendly: [0, 0, 1, 0.3],
		legalMovesHighlightColor_Opponent: [1, 0.7, 0, 0.35],
		legalMovesHighlightColor_Premove: [0.3, 0, 1, 0.3],
		lastMoveHighlightColor: [0, 1, 0, 0.25],
		checkHighlightColor: [1, 0, 0, 0.7],
		useColoredPieces: false,
		whitePiecesColor: [1, 1, 1, 1],
		blackPiecesColor: [1, 1, 1, 1],
		neutralPiecesColor: [1, 1, 1, 1],
	},
	pink: {
		whiteTiles: [250 / 255, 237 / 255, 236 / 255, 1],
		darkTiles: [243 / 255, 195 / 255, 194 / 255, 1],
		selectedPieceHighlightColor: [0, 0.5, 0.5, 0.3],
		legalMovesHighlightColor_Friendly: [0, 0, 1, 0.3],
		legalMovesHighlightColor_Opponent: [1, 0.7, 0, 0.35],
		legalMovesHighlightColor_Premove: [0.3, 0, 1, 0.3],
		lastMoveHighlightColor: [0, 1, 0, 0.25],
		checkHighlightColor: [1, 0, 0, 0.7],
		useColoredPieces: false,
		whitePiecesColor: [1, 1, 1, 1],
		blackPiecesColor: [1, 1, 1, 1],
		neutralPiecesColor: [1, 1, 1, 1],
	},
	// Holiday themes
	// halloween: {
	// 	whiteTiles: [1, 0.65, 0.4, 1],
	// 	darkTiles:  [1, 0.4, 0, 1],
	// 	selectedPieceHighlightColor: [0, 0, 0, 0.5],
	// 	legalMovesHighlightColor_Friendly: [0.6, 0, 1, 0.55],
	// 	legalMovesHighlightColor_Opponent: [0, 0.5, 0, 0.35],
	// 	legalMovesHighlightColor_Premove: [1, 0.15, 0, 0.65],
	// 	lastMoveHighlightColor: [0.5, 0.2, 0, 0.75],
	// 	checkHighlightColor: [1, 0, 0.5, 0.76],
	// 	useColoredPieces: true,
	// 	whitePiecesColor: [0.6, 0.5, 0.45, 1],
	// 	blackPiecesColor: [0.8, 0, 1, 1],
	// 	neutralPiecesColor: [1, 1, 1, 1],
	// },
	// christmas: {
	// 	whiteTiles: [152 / 255, 238 / 255, 255 / 255, 1],
	// 	darkTiles: [0 / 255, 199 / 255, 238 / 255, 1],
	// 	selectedPieceHighlightColor: [0, 0.5, 0.5, 0.3],
	// 	legalMovesHighlightColor_Friendly: [0, 0, 1, 0.35],
	// 	legalMovesHighlightColor_Opponent: [1, 0.7, 0, 0.35],
	// 	legalMovesHighlightColor_Premove: [0.25, 0, 0.7, 0.3],
	// 	lastMoveHighlightColor: [0, 0, 0.3, 0.35],
	// 	checkHighlightColor: [1, 0, 0, 0.7],
	// 	useColoredPieces: true,
	// 	whitePiecesColor: [0.4, 1, 0.4, 1],
	// 	blackPiecesColor: [1, 0.2, 0.2, 1],
	// 	neutralPiecesColor: [1, 1, 1, 1],
	// }
};

export default {
	defaultTheme,
	themes: themeDictionary,
};