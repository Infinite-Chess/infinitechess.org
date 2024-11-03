
// This module stores our themes. Straight forward

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
		useColoredPieces: false,
		whitePiecesColor: [1, 1, 1, 1],
		blackPiecesColor: [1, 1, 1, 1],
		neutralPiecesColor: [1, 1, 1, 1]
	},
	sandstone: {
		whiteTiles: [239 / 255, 225 / 255, 199 / 255, 1],
		darkTiles: [188 / 255, 160 / 255, 136 / 255, 1],
	},
	lichess: {
		whiteTiles: [238 / 255, 216 / 255, 185 / 255, 1],
		darkTiles: [178 / 255, 136 / 255, 104 / 255, 1],
	},
	wood: {
		whiteTiles: [246 / 255, 207 / 255, 167 / 255, 1],
		darkTiles: [197 / 255, 141 / 255, 88 / 255, 1],
	},
	darkSandstone: {
		whiteTiles: [220 / 255, 193 / 255, 127 / 255, 1],
		darkTiles: [176 / 255, 140 / 255, 88 / 255, 1],
	},
	redWood: {
		whiteTiles: [245 / 255, 210 / 255, 178 / 255, 1],
		darkTiles: [193 / 255, 90 / 255, 60 / 255, 1],
	},
	beehive: {
		whiteTiles: [255 / 255, 219 / 255, 90 / 255, 1],
		darkTiles: [225 / 255, 132 / 255, 13 / 255, 1],
	},
	blue: {
		whiteTiles: [213 / 255, 231 / 255, 240 / 255, 1],
		darkTiles: [66 / 255, 140 / 255, 198 / 255, 1],
	},
	ocean: {
		whiteTiles: [106 / 255, 190 / 255, 246 / 255, 1],
		darkTiles: [63 / 255, 118 / 255, 186 / 255, 1],
	},
	cyanOcean: {
		whiteTiles: [15 / 255, 255 / 255, 255 / 255, 1],
		darkTiles: [45 / 255, 195 / 255, 200 / 255, 1],
	},
	green: {
		whiteTiles: [238 / 255, 238 / 255, 216 / 255, 1],
		darkTiles: [130 / 255, 146 / 255, 101 / 255, 1],
	},
	avocado: {
		whiteTiles: [213 / 255, 250 / 255, 127 / 255, 1],
		darkTiles: [159 / 255, 196 / 255, 89 / 255, 1],
	},
	lime: {
		whiteTiles: [204 / 255, 240 / 255, 100 / 255, 1],
		darkTiles: [100 / 255, 180 / 255, 15 / 255, 1],
	},
	pink: {
		whiteTiles: [250 / 255, 237 / 255, 236 / 255, 1],
		darkTiles: [243 / 255, 195 / 255, 194 / 255, 1],
	},
};



function getThemes() {
	return themeDictionary;
};

export default {
	getThemes,
};