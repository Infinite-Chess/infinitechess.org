
// Import Start
import webgl from './webgl.js';
import texture from './texture.js';
import style from '../gui/style.js';
import bufferdata from './bufferdata.js';
import perspective from './perspective.js';
import camera from './camera.js';
import math from '../../util/math.js';
import { createModel } from './buffermodel.js';
import jsutil from '../../util/jsutil.js';
import imagecache from '../../chess/rendering/imagecache.js';
import frametracker from './frametracker.js';
import checkerboardgenerator from '../../chess/rendering/checkerboardgenerator.js';
import gamefileutility from '../../chess/util/gamefileutility.js';
import { gl } from './webgl.js';
import gameslot from '../chess/gameslot.js';
import preferences from '../../components/header/preferences.js';
import piecemodels from './piecemodels.js';
import guipromotion from '../gui/guipromotion.js';
import spritesheet from './spritesheet.js';
import boardpos from './boardpos.js';
// Import End

/** 
 * Type Definitions
 * @typedef {import('./buffermodel.js').BufferModel} BufferModel
 * @typedef {import('../../util/math.js').BoundingBox} BoundingBox
 */

"use strict";

/**
 * This script renders the board, and changes it's color.
 * We also keep track of what tile the mouse is currently hovering over.
 */

/** 2x2 Opaque, no mipmaps. Used in perspective mode. Medium moire, medium blur, no antialiasing. */
let tilesTexture_2; // Opaque, no mipmaps
/** 256x256 Opaque, yes mipmaps. Used in 2D mode. Zero moire, yes antialiasing. */
let tilesTexture_256mips;

const squareCenter = 0.5; // WITHOUT this, the center of tiles would be their bottom-left corner.  Range: 0-1

/**
 * The *exact* bounding box of the board currently visible on the canvas.
 * This differs from the camera's bounding box because this is effected by the camera's scale (zoom).
 * @type {BoundingBox}
 */
let boundingBoxFloat;
/**
 * The bounding box of the board currently visible on the canvas,
 * rounded away from the center of the canvas to encapsulate the whole of any partially visible squares.
 * This differs from the camera's bounding box because this is effected by the camera's scale (zoom).
 * @type {BoundingBox}
 */
let boundingBox;
/**
 * The bounding box of the board currently visible on the canvas when the CAMERA IS IN DEBUG MODE,
 * rounded away from the center of the canvas to encapsulate the whole of any partially visible squares.
 * This differs from the camera's bounding box because this is effected by the camera's scale (zoom).
 * @type {BoundingBox}
 */
let boundingBox_debugMode;

const perspectiveMode_z = -0.01;

//const limitToDampScale = 0.15; // FOR RECORDING. This slows down very fast.

let lightTiles; // [r,g,b,a]
let darkTiles;


(function() {
	document.addEventListener('theme-change', (event) => { // Custom Event listener.
		console.log(`Theme change event detected: ${preferences.getTheme()}`);
		updateTheme();
		const gamefile = gameslot.getGamefile();
		if (!gamefile) return;
		imagecache.deleteImageCache();
		imagecache.initImagesForGame(gamefile).then(() => {
			piecemodels.regenAll(gamefile);
			// Regenerate the spritesheet with the new tinted images
			spritesheet.initSpritesheetForGame(gl, gamefile);
			texturecache.initTexturesForGame(gl, gamefile);
		});
		// Reinit the promotion UI
		guipromotion.resetUI();
		guipromotion.initUI(gamefile.gameRules.promotionsAllowed);
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


function gsquareCenter() {
	return squareCenter;
}

function gtileWidth_Pixels() {
	// If we're in developer mode, our screenBoundingBox is different
	const screenBoundingBox = camera.getScreenBoundingBox();
	const tileWidthPixels_Physical = (camera.canvas.height * 0.5 / screenBoundingBox.top) * boardpos.getBoardScale(); // Greater for retina displays
	const tileWidthPixels_Virtual = tileWidthPixels_Physical / window.devicePixelRatio;
	return tileWidthPixels_Virtual;
}

/**
 * Returns a copy of the *exact* board bounding box.
 * @returns {BoundingBox} The board bounding box
 */
function gboundingBoxFloat() {
	return jsutil.deepCopyObject(boundingBoxFloat);
}

/**
 * Returns a copy of the board bounding box, rounded away from the center
 * of the canvas to encapsulate the whole of any partially visible squares.
 * @returns {BoundingBox} The board bounding box
 */
function gboundingBox(debugMode = camera.getDebug()) {
	return debugMode ? jsutil.deepCopyObject(boundingBox_debugMode) : jsutil.deepCopyObject(boundingBox);
}

// Recalculate board velicity, scale, and other common variables.
function recalcVariables() {
	recalcBoundingBox();
}

function gtileCoordsOver(x, y) { // Takes xy in screen coords from center
	const n = perspective.getIsViewingBlackPerspective() ? -1 : 1;

	const tileWidthPixels = gtileWidth_Pixels();

	const boardPos = boardpos.getBoardPos();
	const tileXFloat = n * x / tileWidthPixels + boardPos[0];
	const tileYFloat = n * y / tileWidthPixels + boardPos[1];

	const tile_Float = [tileXFloat, tileYFloat];
	const tile_Int = [Math.floor(tileXFloat + squareCenter), Math.floor(tileYFloat + squareCenter)];

	return { tile_Float, tile_Int };
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
 * @param {BoundingBox} src - The source board bounding box
 * @returns {BoundingBox} The rounded bounding box
 */
function roundAwayBoundingBox(src) {

	const left = Math.floor(src.left + squareCenter);
	const right = Math.ceil(src.right - 1 + squareCenter);
	const bottom = Math.floor(src.bottom + squareCenter);
	const top = Math.ceil(src.top - 1 + squareCenter);
    
	return { left, right, bottom, top };
}

/**
 * Generates the buffer model of the light tiles.
 * The dark tiles are rendered separately and underneath.
 * @returns {BufferModel} The buffer model
 */
function regenBoardModel() {
	const boardTexture = perspective.getEnabled() ? tilesTexture_2 : tilesTexture_256mips;
	if (!boardTexture) return; // Can't create buffer model if texture not loaded.

	const boardScale = boardpos.getBoardScale();
	const TwoTimesScale = 2 * boardScale;

	const inPerspective = perspective.getEnabled();
	const distToRenderBoard = perspective.distToRenderBoard;

	const startX = inPerspective ? -distToRenderBoard : camera.getScreenBoundingBox(false).left;
	const endX = inPerspective ? distToRenderBoard : camera.getScreenBoundingBox(false).right;
	const startY = inPerspective ? -distToRenderBoard : camera.getScreenBoundingBox(false).bottom;
	const endY = inPerspective ? distToRenderBoard : camera.getScreenBoundingBox(false).top;

	const boardPos = boardpos.getBoardPos();
	// This processes the big number board positon to a range betw 0-2  (our texture is 2 tiles wide)
	const texCoordStartX = (((boardPos[0] + squareCenter) + startX / boardScale) % 2) / 2;
	const texCoordStartY = (((boardPos[1] + squareCenter) + startY / boardScale) % 2) / 2;
	const texCoordEndX = texCoordStartX + (endX - startX) / TwoTimesScale;
	const texCoordEndY = texCoordStartY + (endY - startY) / TwoTimesScale;

	const z = perspective.getEnabled() ? perspectiveMode_z : 0;
    
	const data = bufferdata.getDataQuad_ColorTexture3D(startX, startY, endX, endY, z, texCoordStartX, texCoordStartY, texCoordEndX, texCoordEndY, 1, 1, 1, 1);
	return createModel(data, 3, "TRIANGLES", true, boardTexture);
}

function renderMainBoard() {
	if (boardpos.isScaleSmallForInvisibleTiles()) return;

	// We'll need to generate a new board buffer model every frame, because the scale and repeat count changes!
	// The other option is to regenerate it as much as highlighted squares, with the bounding box.
	const model = regenBoardModel();
	if (!model) return; // Model not defined because the texture was not fully loaded yet
	model.render();
}

/** Resets the board color, sky, and navigation bars (the color changes when checkmate happens). */
function updateTheme() {
	const gamefile = gameslot.getGamefile();
	if (gamefile && gamefileutility.isGameOver(gamefile)) darkenColor(); // Reset to slightly darkened board
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

	const e = -math.getBaseLog10(boardpos.getBoardScale());

	const startE = 0.5; // 0.5   lower = starts coming in quicker
	if (e < startE) return;

	const interval = 3;
	const length = 6;

	let firstInterval = Math.floor((e - startE) / interval) * interval + startE;
	const zeroCount = 3 * (firstInterval - startE) / interval + 3; // Always a multiple of 3
	// console.log(firstInterval, zeroCount)

	const capOpacity = 0.7;

	// Most-zoomed out board
	let zoom = Math.pow(10, zeroCount);
	let x = (firstInterval - e) / length; // 0 - 1
	// console.log(`x: ${x}`)
	let opacity = capOpacity * Math.pow((-0.5 * Math.cos(2 * x * Math.PI) + 0.5), 0.7); // 0.7  the lower the pow, the faster the opacity
	renderZoomedBoard(zoom, opacity);

	// 2nd most-zoomed out board
	firstInterval -= interval;
	if (firstInterval < 0) return;
	zoom /= Math.pow(10, 3);
	x = (firstInterval - e) / length; // 0 - 1
	opacity = capOpacity * (-0.5 * Math.cos(2 * x * Math.PI) + 0.5);
	renderZoomedBoard(zoom, opacity);
}

// Renders an upside down grey cone centered around the camera, and level with the horizon.
function renderSolidCover() {
	// const dist = perspective.distToRenderBoard;
	const dist = camera.getZFar() / Math.SQRT2;
	const z = perspective.getEnabled() ? perspectiveMode_z : 0;
	const cameraZ = camera.getPosition(true)[2];

	const r = (lightTiles[0] + darkTiles[0]) / 2;
	const g = (lightTiles[1] + darkTiles[1]) / 2;
	const b = (lightTiles[2] + darkTiles[2]) / 2;
	const a = (lightTiles[3] + darkTiles[3]) / 2;

	const data = bufferdata.getDataBoxTunnel(-dist, -dist, cameraZ, dist, dist, z, r, g, b, a);
	const boundingBox = { left: -dist, right: dist, bottom: -dist, top: dist };
	data.push(...bufferdata.getDataQuad_Color3D(boundingBox, z, [r, g, b, a])); // Floor of the box

	const model = createModel(data, 3, "TRIANGLES", true);

	model.render();
}

function renderZoomedBoard(zoom, opacity) {
	const boardTexture = tilesTexture_2; 
	if (!boardTexture) return; // Can't create buffer model if texture not defined.

	const zoomTimesScale = zoom * boardpos.getBoardScale();
	const zoomTimesScaleTwo = zoomTimesScale * 2;

	const inPerspective = perspective.getEnabled();
	const distToRenderBoard = perspective.distToRenderBoard;

	const startX = inPerspective ? -distToRenderBoard : camera.getScreenBoundingBox(false).left;
	const endX =   inPerspective ?  distToRenderBoard : camera.getScreenBoundingBox(false).right;
	const startY = inPerspective ? -distToRenderBoard : camera.getScreenBoundingBox(false).bottom;
	const endY =   inPerspective ?  distToRenderBoard : camera.getScreenBoundingBox(false).top;

	const boardPos = boardpos.getBoardPos();
	// This processes the big number board positon to a range betw 0-2  (our texture is 2 tiles wide)
	const texleft = (((boardPos[0] + squareCenter) / zoom + (startX / zoomTimesScale)) % 2) / 2;
	const texbottom = (((boardPos[1] + squareCenter) / zoom + (startY / zoomTimesScale)) % 2) / 2;
	const texCoordDiffX = (endX - startX) / zoomTimesScaleTwo;
	const screenTexCoordDiffX = (camera.getScreenBoundingBox(false).right - camera.getScreenBoundingBox(false).left) / zoomTimesScaleTwo;
	const diffWhen1TileIs1Pixel = camera.canvas.width / 2;
	if (screenTexCoordDiffX > diffWhen1TileIs1Pixel) return; // STOP rendering to avoid glitches! Too small
	const texCoordDiffY = (endY - startY) / zoomTimesScaleTwo;
	const texright = texleft + texCoordDiffX;
	const textop = texbottom + texCoordDiffY;

	const z = perspective.getEnabled() ? perspectiveMode_z : 0;
    
	const data = bufferdata.getDataQuad_ColorTexture3D(startX, startY, endX, endY, z, texleft, texbottom, texright, textop, 1, 1, 1, opacity);
	const model = createModel(data, 3, "TRIANGLES", true, boardTexture);

	model.render();
}

/**
 * Calculates the bounding box of the board visible on screen,
 * when the camera is at the specified position.
 * This is different from the bounding box of the canvas, because
 * this is effected by the camera's scale (zoom) property.
 * 
 * Returns in float form. To round away from the origin to encapsulate
 * the whole of all tiles atleast partially visible, further use {@link roundAwayBoundingBox}
 * @param {number[]} [position] - The position of the camera.
 * @param {number} [scale] - The scale (zoom) of the camera.
 * @param {boolean} [debugMode] Whether developer mode is enabled.
 * @returns {BoundingBox} The bounding box
 */
function getBoundingBoxOfBoard(position = boardpos.getBoardPos(), scale = boardpos.getBoardScale(), debugMode) {

	const distToHorzEdgeDivScale = camera.getScreenBoundingBox(debugMode).right / scale;

	const left = position[0] - distToHorzEdgeDivScale;
	const right = position[0] + distToHorzEdgeDivScale;

	const distToVertEdgeDivScale = camera.getScreenBoundingBox(debugMode).top / scale;

	const bottom = position[1] - distToVertEdgeDivScale;
	const top = position[1] + distToVertEdgeDivScale;

	return { left, right, bottom, top };
}

/**
 * Returns the expected render range bounding box when we're in perspective mode.
 * @param {number} rangeOfView - The distance in tiles (when scale is 1) to render the legal move fields in perspective mode.
 * @returns {BoundingBox} The perspective mode render range bounding box
 */
function generatePerspectiveBoundingBox(rangeOfView) { // ~18
	const coords = boardpos.getBoardPos();
	const renderDistInSquares = rangeOfView / boardpos.getBoardScale();

	return {
		left: coords[0] - renderDistInSquares,
		right: coords[0] + renderDistInSquares,
		bottom: coords[1] - renderDistInSquares,
		top: coords[1] + renderDistInSquares,
	};
}

export default {
	gsquareCenter,
	gtileWidth_Pixels,
	recalcVariables,
	gtileCoordsOver,
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