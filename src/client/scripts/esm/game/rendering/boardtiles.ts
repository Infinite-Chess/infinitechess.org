
/**
 * This script renders the board, and changes it's color.
 * We also keep track of what tile the mouse is currently hovering over.
 */

import type { BufferModel } from './buffermodel.js';
import type { Color } from '../../util/math/math.js';
import type { BDCoords } from '../../chess/util/coordutil.js';
import type { BigDecimal } from '../../util/bigdecimal/bigdecimal.js';
import type { BoundingBoxBD } from '../../util/math/bounds.js';

import checkerboardgenerator from '../../chess/rendering/checkerboardgenerator.js';
import jsutil from '../../util/jsutil.js';
import imagecache from '../../chess/rendering/imagecache.js';
import frametracker from './frametracker.js';
import gamefileutility from '../../chess/util/gamefileutility.js';
import gameslot from '../chess/gameslot.js';
import preferences from '../../components/header/preferences.js';
import piecemodels from './piecemodels.js';
import guipromotion from '../gui/guipromotion.js';
import spritesheet from './spritesheet.js';
import boardpos from './boardpos.js';
import texturecache from '../../chess/rendering/texturecache.js';
import bigdecimal from '../../util/bigdecimal/bigdecimal.js';
import primitives from './primitives.js';
import { createModel } from './buffermodel.js';
// @ts-ignore
import webgl from './webgl.js';
// @ts-ignore
import texture from './texture.js';
// @ts-ignore
import style from '../gui/style.js';
// @ts-ignore
import perspective from './perspective.js';
// @ts-ignore
import camera from './camera.js';
// @ts-ignore
import { gl } from './webgl.js';



const ONE = bigdecimal.FromNumber(1.0);
const TWO = bigdecimal.FromNumber(2.0);
const TEN = bigdecimal.FromNumber(10);


/** 2x2 Opaque, no mipmaps. Used in perspective mode. Medium moire, medium blur, no antialiasing. */
let tilesTexture_2: WebGLTexture; // Opaque, no mipmaps
/** 256x256 Opaque, yes mipmaps. Used in 2D mode. Zero moire, yes antialiasing. */
let tilesTexture_256mips: WebGLTexture;

const squareCenter: BigDecimal = bigdecimal.FromNumber(0.5); // WITHOUT this, the center of tiles would be their bottom-left corner.  Range: 0-1

/**
 * The *exact* bounding box of the board currently visible on the canvas.
 * This differs from the camera's bounding box because this is effected by the camera's scale (zoom).
 */
let boundingBoxFloat: BoundingBoxBD;
/**
 * The bounding box of the board currently visible on the canvas,
 * rounded away from the center of the canvas to encapsulate the whole of any partially visible squares.
 * This differs from the camera's bounding box because this is effected by the camera's scale (zoom).
 */
let boundingBox: BoundingBoxBD;
/**
 * The bounding box of the board currently visible on the canvas when the CAMERA IS IN DEBUG MODE,
 * rounded away from the center of the canvas to encapsulate the whole of any partially visible squares.
 * This differs from the camera's bounding box because this is effected by the camera's scale (zoom).
 */
let boundingBox_debugMode: BoundingBoxBD;

const perspectiveMode_z = -0.01;

//const limitToDampScale = 0.15; // FOR RECORDING. This slows down very fast.

let lightTiles: Color; // [r,g,b,a]
let darkTiles: Color;


(function() {
	document.addEventListener('theme-change', (event) => { // Custom Event listener.
		console.log(`Theme change event detected: ${preferences.getTheme()}`);
		updateTheme();
		const gamefile = gameslot.getGamefile();
		if (!gamefile) return;
		imagecache.deleteImageCache();
		// texturecache.deleteTextureCache(gl);
		imagecache.initImagesForGame(gamefile.boardsim).then(() => {
			// Regenerate the spritesheet with the new tinted images
			spritesheet.initSpritesheetForGame(gl, gamefile.boardsim);
			texturecache.initTexturesForGame(gl, gamefile.boardsim);
			piecemodels.regenAll(gamefile.boardsim, gameslot.getMesh());
		});
		// Reinit the promotion UI
		guipromotion.resetUI();
		guipromotion.initUI(gamefile.basegame.gameRules.promotionsAllowed);
	});
})();


async function initTextures() {
	const lightTilesCssColor = style.arrayToCssColor(lightTiles);
	const darkTilesCssColor = style.arrayToCssColor(darkTiles);

	const element_tilesTexture2 = await checkerboardgenerator.createCheckerboardIMG(lightTilesCssColor, darkTilesCssColor, 2);
	tilesTexture_2 = texture.loadTexture(gl, element_tilesTexture2, { useMipmaps: false });

	const element_tilesTexture256mips = await checkerboardgenerator.createCheckerboardIMG(lightTilesCssColor, darkTilesCssColor, 256);
	tilesTexture_256mips = texture.loadTexture(gl, element_tilesTexture256mips, { useMipmaps: true });

	frametracker.onVisualChange();
}


/** Returns what Z level the board tiles should be rendered at this frame. */
function getRelativeZ() {
	return perspective.getEnabled() ? perspectiveMode_z : 0;
}

function gsquareCenter() {
	return squareCenter;
}

function gtileWidth_Pixels(): BigDecimal {
	// If we're in developer mode, our screenBoundingBox is different
	const screenBoundingBox = camera.getScreenBoundingBox();
	const factor1: BigDecimal = bigdecimal.FromNumber(camera.canvas.height * 0.5 / screenBoundingBox.top);
	const tileWidthPixels_Physical = bigdecimal.multiply_floating(factor1, boardpos.getBoardScale()); // Greater for retina displays

	const divisor = bigdecimal.FromNumber(window.devicePixelRatio);
	const tileWidthPixels_Virtual = bigdecimal.divide_floating(tileWidthPixels_Physical, divisor);

	return tileWidthPixels_Virtual;
}

/**
 * Returns a copy of the *exact* board bounding box.
 * @returns The board bounding box
 */
function gboundingBoxFloat(): BoundingBoxBD {
	return jsutil.deepCopyObject(boundingBoxFloat);
}

/**
 * Returns a copy of the board bounding box, rounded away from the center
 * of the canvas to encapsulate the whole of any partially visible squares.
 * @returns The board bounding box
 */
function gboundingBox(debugMode = camera.getDebug()): BoundingBoxBD {
	return debugMode ? jsutil.deepCopyObject(boundingBox_debugMode) : jsutil.deepCopyObject(boundingBox);
}

// Recalculate board velicity, scale, and other common variables.
function recalcVariables() {
	recalcBoundingBox();
}

function recalcBoundingBox() {

	boundingBoxFloat = getBoundingBoxOfBoard(boardpos.getBoardPos(), boardpos.getBoardScale(), false);
	boundingBox = roundAwayBoundingBox(boundingBoxFloat);

	const boundingBoxFloat_debugMode = getBoundingBoxOfBoard(boardpos.getBoardPos(), boardpos.getBoardScale(), true);
	boundingBox_debugMode = roundAwayBoundingBox(boundingBoxFloat_debugMode);
}

/**
 * Returns a new board bounding box, with its edges rounded away from the
 * center of the canvas to encapsulate the whole of any squares partially included.
 * @param src - The source board bounding box
 * @returns The rounded bounding box
 */
function roundAwayBoundingBox(src: BoundingBoxBD): BoundingBoxBD {
	const left = bigdecimal.floor(bigdecimal.add(src.left, squareCenter)); // floor(left + squareCenter)
	const right = bigdecimal.ceil(bigdecimal.add(bigdecimal.subtract(src.right, ONE), squareCenter)); // ceil(right - 1 + squareCenter)
	const bottom = bigdecimal.floor(bigdecimal.add(src.bottom, squareCenter)); // floor(bottom + squareCenter)
	const top = bigdecimal.ceil(bigdecimal.add(bigdecimal.subtract(src.top, ONE), squareCenter)); // ceil(top - 1 + squareCenter)
    
	return { left, right, bottom, top };
}

/**
 * Generates the buffer model of the light tiles.
 * The dark tiles are rendered separately and underneath.
 */
function generateBoardModel(isFractal: boolean, zoom: BigDecimal = ONE, opacity: number = 1.0): BufferModel | undefined {
	const boardScale = boardpos.getBoardScale();
	const scaleWhen1TileIs1VirtualPixel = camera.getScaleWhenZoomedOut();
	const relativeScaleWhen1TileIs1VirtualPixel = bigdecimal.divide_floating(scaleWhen1TileIs1VirtualPixel, zoom);
	if (bigdecimal.compare(relativeScaleWhen1TileIs1VirtualPixel, scaleWhen1TileIs1VirtualPixel) < 0) {
		// STOP rendering to avoid glitches! Too small
		console.log(`Skipping generating board model of zoom ${bigdecimal.toNumber(zoom)}. Scale is too small.`);
		return;
	}

	const boardTexture = isFractal || perspective.getEnabled() ? tilesTexture_2 : tilesTexture_256mips;

	/** The scale of the RENDERED board. Final result should always be within a small, visible range. */
	const zoomTimesScale = bigdecimal.toNumber(bigdecimal.multiply_floating(boardScale, zoom));
	const zoomTimesScaleTwo = zoomTimesScale * 2;

	const inPerspective = perspective.getEnabled();
	const distToRenderBoard = perspective.distToRenderBoard;
	const screenBoundingBox = camera.getScreenBoundingBox(false);

	const startX = inPerspective ? -distToRenderBoard : screenBoundingBox.left;
	const endX =   inPerspective ?  distToRenderBoard : screenBoundingBox.right;
	const startY = inPerspective ? -distToRenderBoard : screenBoundingBox.bottom;
	const endY =   inPerspective ?  distToRenderBoard : screenBoundingBox.top;

	const boardPos = boardpos.getBoardPos();

	/** Calculates the texture coords for one axis (X/Y) of the tiles model. */
	function getAxisTexCoords(boardPos: BigDecimal, start: number, end: number) {
		const boardPosAdjusted: BigDecimal = bigdecimal.add(boardPos, squareCenter);
		const addend1: BigDecimal = bigdecimal.divide_fixed(boardPosAdjusted, zoom);
		const addend2: BigDecimal = bigdecimal.FromNumber(start / zoomTimesScale);
		
		const sum: BigDecimal = bigdecimal.add(addend1, addend2);
		const mod2: number = bigdecimal.toNumber(bigdecimal.mod(sum, TWO));
		const texstart: number = mod2 / 2;

		const diff = end - start;
		const texdiff = diff / zoomTimesScaleTwo;
		const texend = texstart + texdiff;
		return [texstart, texend];
	}

	const [texstartX, texendX] = getAxisTexCoords(boardPos[0], startX, endX);
	const [texstartY, texendY] = getAxisTexCoords(boardPos[1], startY, endY);
	
	const data = primitives.Quad_ColorTexture(startX, startY, endX, endY, texstartX, texstartY, texendX, texendY, 1, 1, 1, opacity);
	return createModel(data, 2, "TRIANGLES", true, boardTexture);
}

function renderMainBoard() {
	if (boardpos.isScaleSmallForInvisibleTiles()) return;

	// We'll need to generate a new board buffer model every frame, because the scale and repeat count changes!
	// The other option is to regenerate it as much as highlighted squares, with the bounding box.
	const model = generateBoardModel(false);
	if (!model) return; // Too small, would cause graphical glitches to render

	const z = getRelativeZ();
	model.render([0,0,z]);
}

/** Resets the board color, sky, and navigation bars (the color changes when checkmate happens). */
function updateTheme() {
	const gamefile = gameslot.getGamefile();
	if (gamefile && gamefileutility.isGameOver(gamefile.basegame)) darkenColor(); // Reset to slightly darkened board
	else resetColor(); // Reset to defaults
	updateSkyColor();
	updateNavColor();
}

// Updates sky color based on current board color
function updateSkyColor() {
	const avgR = (lightTiles[0] + darkTiles[0]) / 2;
	const avgG = (lightTiles[1] + darkTiles[1]) / 2;
	const avgB = (lightTiles[2] + darkTiles[2]) / 2;

	const dimAmount = 0.27; // Default: 0.27
	const skyR = avgR - dimAmount;
	const skyG = avgG - dimAmount;
	const skyB = avgB - dimAmount;

	webgl.setClearColor([skyR, skyG, skyB]);
}

function updateNavColor() {
	// Determine the new "white" color

	const avgR = (lightTiles[0] + darkTiles[0]) / 2;
	const avgG = (lightTiles[1] + darkTiles[1]) / 2;
	const avgB = (lightTiles[2] + darkTiles[2]) / 2;


	// With the default theme, these should be max
	let navR = 255;
	let navG = 255;
	let navB = 255;

	if (preferences.getTheme() !== 'white') {
		const brightAmount = 0.6; // 50% closer to white
		navR = (1 - (1 - avgR) * (1 - brightAmount)) * 255;
		navG = (1 - (1 - avgG) * (1 - brightAmount)) * 255;
		navB = (1 - (1 - avgB) * (1 - brightAmount)) * 255;
	}

	style.setNavStyle(`

        .navigation {
            background: linear-gradient(to top, rgba(${navR}, ${navG}, ${navB}, 0.104), rgba(${navR}, ${navG}, ${navB}, 0.552), rgba(${navR}, ${navG}, ${navB}, 0.216));
        }

        .footer {
            background: linear-gradient(to bottom, rgba(${navR}, ${navG}, ${navB}, 0.307), rgba(${navR}, ${navG}, ${navB}, 1), rgba(${navR}, ${navG}, ${navB}, 0.84));
        }
    `);
}

function resetColor(newLightTiles = preferences.getColorOfLightTiles(), newDarkTiles = preferences.getColorOfDarkTiles()) {
	lightTiles = newLightTiles; // true for white
	darkTiles = newDarkTiles; // false for dark
	initTextures();
	frametracker.onVisualChange();
}

function darkenColor() {
	const defaultLightTiles = preferences.getColorOfLightTiles();
	const defaultDarkTiles = preferences.getColorOfDarkTiles();

	const darkenBy = 0.09;
	const darkWR = Math.max(defaultLightTiles[0] - darkenBy, 0);
	const darkWG = Math.max(defaultLightTiles[1] - darkenBy, 0);
	const darkWB = Math.max(defaultLightTiles[2] - darkenBy, 0);
	const darkDR = Math.max(defaultDarkTiles[0] - darkenBy, 0);
	const darkDG = Math.max(defaultDarkTiles[1] - darkenBy, 0);
	const darkDB = Math.max(defaultDarkTiles[2] - darkenBy, 0);

	resetColor([darkWR, darkWG, darkWB, 1], [darkDR, darkDG, darkDB, 1]);
}

// Renders board tiles
function render() {
	// This prevents tearing when rendering in the same z-level and in perspective.
	webgl.executeWithDepthFunc_ALWAYS(() => {
		renderSolidCover(); // This is needed even outside of perspective, so when we zoom out, the rendered fractal transprent boards look correct.
		renderMainBoard();
		renderFractalBoards();
	});
}

function renderFractalBoards() {
	const z = getRelativeZ();

	const e = -bigdecimal.log10(boardpos.getBoardScale());

	const startE = 0.5; // 0.5   lower = starts coming in quicker
	if (e < startE) return;

	const interval = 3;
	const length = 6;
	const capOpacity = 0.7;

	let firstInterval = Math.floor((e - startE) / interval) * interval + startE;
	let zeroCount = 3 * (firstInterval - startE) / interval + 3; // Always a multiple of 3
	// console.log(firstInterval, zeroCount)

	// Most-zoomed out board
	let zoom = bigdecimal.power(TEN, zeroCount);
	let x = (firstInterval - e) / length;
	let opacity = capOpacity * Math.pow((-0.5 * Math.cos(2 * x * Math.PI) + 0.5), 0.7);
	generateBoardModel(true, zoom, opacity)?.render([0,0,z]);

	// 2nd most-zoomed out board
	firstInterval -= interval;
	if (firstInterval < 0) return;

	// To divide a bigdecimal by 10^3, we just subtract 3 from the exponent
	zeroCount -= 3;
	zoom = bigdecimal.power(TEN, zeroCount);
	x = (firstInterval - e) / length; // 0 - 1
	opacity = capOpacity * (-0.5 * Math.cos(2 * x * Math.PI) + 0.5);
	generateBoardModel(true, zoom, opacity)?.render([0,0,z]);
}

// Renders an upside down grey cone centered around the camera, and level with the horizon.
function renderSolidCover() {
	// const dist = perspective.distToRenderBoard;
	const dist = camera.getZFar() / Math.SQRT2;
	const z = getRelativeZ();
	const cameraZ = camera.getPosition(true)[2];

	const r = (lightTiles[0] + darkTiles[0]) / 2;
	const g = (lightTiles[1] + darkTiles[1]) / 2;
	const b = (lightTiles[2] + darkTiles[2]) / 2;
	const a = (lightTiles[3] + darkTiles[3]) / 2;

	const data = primitives.BoxTunnel(-dist, -dist, cameraZ, dist, dist, z, r, g, b, a);
	data.push(...primitives.Quad_Color3D(-dist, -dist, dist, dist, z, [r, g, b, a])); // Floor of the box

	const model = createModel(data, 3, "TRIANGLES", true);

	model.render();
}

/**
 * Calculates the bounding box of the board visible on screen,
 * when the camera is at the specified position, up to a certain precision level.
 * 
 * This is different from the bounding box of the canvas, because
 * this is effected by the camera's scale (zoom) property.
 * 
 * Returns in float form. To round away from the origin to encapsulate
 * the whole of all tiles atleast partially visible, further use {@link roundAwayBoundingBox}
 * @param [position] The position of the camera.
 * @param [scale] The scale (zoom) of the camera.
 * @param debugMode - Whether developer mode is enabled.
 * @returns The bounding box
 */
function getBoundingBoxOfBoard(position: BDCoords = boardpos.getBoardPos(), scale: BigDecimal = boardpos.getBoardScale(), debugMode: boolean): BoundingBoxBD {
	const screenBoundingBox = camera.getScreenBoundingBox(debugMode);

	function getAxisEdges(position: BigDecimal, screenEnd: number): [BigDecimal, BigDecimal] {
		const screenEndBD = bigdecimal.FromNumber(screenEnd);
		const distToEdgeInSquares: BigDecimal = bigdecimal.divide_floating(screenEndBD, scale);
		const start = bigdecimal.subtract(position, distToEdgeInSquares);
		const end = bigdecimal.add(position, distToEdgeInSquares);
		return [start, end];
	}

	const [left, right] = getAxisEdges(position[0], screenBoundingBox.right);
	const [bottom, top] = getAxisEdges(position[1], screenBoundingBox.top);
	
	return { left, right, bottom, top };
}

/**
 * Returns the expected render range bounding box when we're in perspective mode.
 * @param {number} rangeOfView - The distance in tiles (when scale is 1) to render the legal move fields in perspective mode.
 * @returns {BoundingBox} The perspective mode render range bounding box
 */
function generatePerspectiveBoundingBox(rangeOfView: number): BoundingBoxBD { // ~18
	const position = boardpos.getBoardPos();
	const scale = boardpos.getBoardScale();
	const rangeOfViewBD = bigdecimal.FromNumber(rangeOfView);
	const renderDistInSquares = bigdecimal.divide_floating(rangeOfViewBD, scale);

	return {
		left: bigdecimal.subtract(position[0], renderDistInSquares),
		right: bigdecimal.add(position[0], renderDistInSquares),
		bottom: bigdecimal.subtract(position[1], renderDistInSquares),
		top: bigdecimal.add(position[1], renderDistInSquares),
	};
}

export default {
	gsquareCenter,
	gtileWidth_Pixels,
	recalcVariables,
	roundAwayBoundingBox,
	gboundingBox,
	gboundingBoxFloat,
	updateTheme,
	resetColor,
	darkenColor,
	render,
	getBoundingBoxOfBoard,
	generatePerspectiveBoundingBox,
};