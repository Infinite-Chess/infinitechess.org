
// Import Start
import webgl from './webgl.js';
import texture from './texture.js';
import style from '../gui/style.js';
import bufferdata from './bufferdata.js';
import input from '../input.js';
import perspective from './perspective.js';
import movement from './movement.js';
import options from './options.js';
import camera from './camera.js';
import math from '../../util/math.js';
import buffermodel from './buffermodel.js';
import game from '../chess/game.js';
import jsutil from '../../util/jsutil.js';
import space from '../misc/space.js';
import frametracker from './frametracker.js';
import checkerboardgenerator from '../../chess/rendering/checkerboardgenerator.js';
import gamefileutility from '../../chess/util/gamefileutility.js';
import { gl } from './webgl.js';
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

let tileWidth_Pixels; // Width of tiles in physical, not virtual screen pixels (greater for retina displays). Dependent on board scale.

let tile_MouseOver_Float; // [x, y]  The board location of the mouse, in floats.
let tile_MouseOver_Int; // [x, y]  The board location of the mouse, rounded to nearest tile.
let tiles_FingersOver_Float; // { touchID: [x, y], touchID: [x, y] }  Object with current touches as parameters, with touches containing their board location.
let tiles_FingersOver_Int; // Same as tiles_FingersOver_Float, but rounded to nearest tile.

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
 * The bounding box of the board currently visible on the canvas IN DEBUG MODE,
 * rounded away from the center of the canvas to encapsulate the whole of any partially visible squares.
 * This differs from the camera's bounding box because this is effected by the camera's scale (zoom).
 * @type {BoundingBox}
 */
let boundingBox_debugMode;

const perspectiveMode_z = -0.01;

const limitToDampScale = 0.000_01; // We need to soft limit the scale so the game doesn't break
//const limitToDampScale = 0.15; // FOR RECORDING. This slows down very fast.

let lightTiles; // [r,g,b,a]
let darkTiles;

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
	return tileWidth_Pixels;
}

function gtile_MouseOver_Float() {
	return tile_MouseOver_Float;
}

function gtile_MouseOver_Int() {
	return tile_MouseOver_Int;
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
function gboundingBox(debugMode = options.isDebugModeOn()) {
	return debugMode ? jsutil.deepCopyObject(boundingBox_debugMode) : jsutil.deepCopyObject(boundingBox);
}

function glimitToDampScale() {
	return limitToDampScale;
}

// Recalculate board velicity, scale, and other common variables.
function recalcVariables() {
	recalcTileWidth_Pixels();
	recalcTile_MouseCrosshairOver();
	recalcTiles_FingersOver();
	recalcBoundingBox();
}

function recalcTile_MouseCrosshairOver() {
	recalcTile_MouseOver();
	recalcTile_CrosshairOver();
}

function recalcTileWidth_Pixels() {
	// If we're in developer mode, our screenBoundingBox is different
	const screenBoundingBox = options.isDebugModeOn() ? camera.getScreenBoundingBox(true) : camera.getScreenBoundingBox(false);
	// In physical pixels, not virtual. Physical pixels is greater for retina displays.
	const pixelsPerTile = (camera.canvas.height * 0.5 / screenBoundingBox.top) / camera.getPixelDensity(); // When scale is 1
	tileWidth_Pixels = pixelsPerTile * movement.getBoardScale();
}

function recalcTile_MouseOver() {
	if (perspective.isMouseLocked()) return;
	if (perspective.getEnabled()) return setTile_MouseOverToUndefined();

	const tile_MouseOver_IntAndFloat = getTileMouseOver();
    
	tile_MouseOver_Float = tile_MouseOver_IntAndFloat.tile_Float;
	tile_MouseOver_Int = tile_MouseOver_IntAndFloat.tile_Int;
}

function setTile_MouseOverToUndefined() {
	tile_MouseOver_Float = undefined;
	tile_MouseOver_Int = undefined;
}

function recalcTile_CrosshairOver() {
	if (!perspective.isMouseLocked()) return;

	const coords = space.convertWorldSpaceToCoords(input.getMouseWorldLocation());

	tile_MouseOver_Float = coords;
	tile_MouseOver_Int = [Math.floor(coords[0] + squareCenter), Math.floor(coords[1] + squareCenter)];
}

function recalcTiles_FingersOver() {
	tiles_FingersOver_Float = {};
	tiles_FingersOver_Int = {};
    
	for (let i = 0; i < input.getTouchHelds().length; i++) {
		const thisTouch = input.getTouchHelds()[i];
		const touchTileAndFloat = gtileCoordsOver(thisTouch.x, thisTouch.y);
    
		tiles_FingersOver_Float[thisTouch.id] = touchTileAndFloat.tile_Float;
		tiles_FingersOver_Int[thisTouch.id] = touchTileAndFloat.tile_Int;
	}
}

function gtileCoordsOver(x, y) { // Takes xy in screen coords from center
	const n = perspective.getIsViewingBlackPerspective() ? -1 : 1;

	const boardPos = movement.getBoardPos();
	const tileXFloat = n * x / tileWidth_Pixels + boardPos[0];
	const tileYFloat = n * y / tileWidth_Pixels + boardPos[1];

	const tile_Float = [tileXFloat, tileYFloat];
	const tile_Int = [Math.floor(tileXFloat + squareCenter), Math.floor(tileYFloat + squareCenter)];

	return { tile_Float, tile_Int };
}

// Works whether the mouse is virtual (touch screen) or not
function getTileMouseOver() {
	const mouseWorld = input.getMouseWorldLocation(); // [x, y]
	const tile_Float = space.convertWorldSpaceToCoords(mouseWorld);
	const tile_Int = [Math.floor(tile_Float[0] + squareCenter), Math.floor(tile_Float[1] + squareCenter)];

	if (options.isDebugModeOn()) console.log("Getting tile mouse over: " + JSON.stringify(mouseWorld) + "   " + JSON.stringify(tile_Float) + "   " + JSON.stringify(tile_Int));
    
	return { tile_Float, tile_Int };
}

// Takes in touchID, returns an object of the finger id, and x & y of tile
function gpositionFingerOver(touchID) {
	return {
		id: touchID,
		x: tiles_FingersOver_Float[touchID][0],
		y: tiles_FingersOver_Float[touchID][1]
	};
}

function recalcBoundingBox() {

	boundingBoxFloat = getBoundingBoxOfBoard(movement.getBoardPos(), movement.getBoardScale(), false);
	boundingBox = roundAwayBoundingBox(boundingBoxFloat);

	const boundingBoxFloat_debugMode = getBoundingBoxOfBoard(movement.getBoardPos(), movement.getBoardScale(), true);
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

	const boardScale = movement.getBoardScale();
	const TwoTimesScale = 2 * boardScale;

	const inPerspective = perspective.getEnabled();
	const distToRenderBoard = perspective.distToRenderBoard;

	const startX = inPerspective ? -distToRenderBoard : camera.getScreenBoundingBox(false).left;
	const endX = inPerspective ? distToRenderBoard : camera.getScreenBoundingBox(false).right;
	const startY = inPerspective ? -distToRenderBoard : camera.getScreenBoundingBox(false).bottom;
	const endY = inPerspective ? distToRenderBoard : camera.getScreenBoundingBox(false).top;

	const boardPos = movement.getBoardPos();
	// This processes the big number board positon to a range betw 0-2  (our texture is 2 tiles wide)
	const texCoordStartX = (((boardPos[0] + squareCenter) + startX / boardScale) % 2) / 2;
	const texCoordStartY = (((boardPos[1] + squareCenter) + startY / boardScale) % 2) / 2;
	const texCoordEndX = texCoordStartX + (endX - startX) / TwoTimesScale;
	const texCoordEndY = texCoordStartY + (endY - startY) / TwoTimesScale;

	const z = perspective.getEnabled() ? perspectiveMode_z : 0;
    
	const data = bufferdata.getDataQuad_ColorTexture3D(startX, startY, endX, endY, z, texCoordStartX, texCoordStartY, texCoordEndX, texCoordEndY, 1, 1, 1, 1);
	return buffermodel.createModel_ColorTextured(new Float32Array(data), 3, "TRIANGLES", boardTexture);
}

function renderMainBoard() {
	if (movement.isScaleLess1Pixel_Physical()) return;

	// We'll need to generate a new board buffer model every frame, because the scale and repeat count changes!
	// The other option is to regenerate it as much as highlighted squares, with the bounding box.
	const model = regenBoardModel();
	if (!model) return; // Model not defined because the texture was not fully loaded yet
	model.render();
}

// Checks if the board position is atleast regenRange-distance away from specified offset
function isOffsetOutOfRangeOfRegenRange(offset, regenRange) { // offset: [x,y]
	const boardPos = movement.getBoardPos();
	const xDiff = Math.abs(boardPos[0] - offset[0]);
	const yDiff = Math.abs(boardPos[1] - offset[1]);
	if (xDiff > regenRange || yDiff > regenRange) return true;
	return false;
}

/** Resets the board color, sky, and navigation bars (the color changes when checkmate happens). */
function updateTheme() {
	const gamefile = game.getGamefile();
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

	if (options.getTheme() !== 'white') {
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
        
        .switch {
            --switch-on-color: rgb(${avgR*255}, ${avgG*255}, ${avgB*255});
        }
    `);
}

function resetColor(newLightTiles = options.getDefaultTiles(true), newDarkTiles = options.getDefaultTiles(false)) {
	lightTiles = newLightTiles; // true for white
	darkTiles = newDarkTiles; // false for dark
	initTextures();
	frametracker.onVisualChange();
}

function darkenColor() {
	const defaultLightTiles = options.getDefaultTiles(true);
	const defaultDarkTiles = options.getDefaultTiles(false);

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

	const e = -math.getBaseLog10(movement.getBoardScale());

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

	const model = buffermodel.createModel_Colored(new Float32Array(data), 3, "TRIANGLES");

	model.render();
}

function renderZoomedBoard(zoom, opacity) {
	const boardTexture = tilesTexture_2; 
	if (!boardTexture) return; // Can't create buffer model if texture not defined.

	const zoomTimesScale = zoom * movement.getBoardScale();
	const zoomTimesScaleTwo = zoomTimesScale * 2;

	const inPerspective = perspective.getEnabled();
	const distToRenderBoard = perspective.distToRenderBoard;

	const startX = inPerspective ? -distToRenderBoard : camera.getScreenBoundingBox(false).left;
	const endX =   inPerspective ?  distToRenderBoard : camera.getScreenBoundingBox(false).right;
	const startY = inPerspective ? -distToRenderBoard : camera.getScreenBoundingBox(false).bottom;
	const endY =   inPerspective ?  distToRenderBoard : camera.getScreenBoundingBox(false).top;

	const boardPos = movement.getBoardPos();
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
	const model = buffermodel.createModel_ColorTextured(new Float32Array(data), 3, "TRIANGLES", boardTexture);

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
function getBoundingBoxOfBoard(position = movement.getBoardPos(), scale = movement.getBoardScale(), debugMode) {

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
	const coords = movement.getBoardPos();
	const renderDistInSquares = rangeOfView / movement.getBoardScale();

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
	gtile_MouseOver_Float,
	isOffsetOutOfRangeOfRegenRange,
	gpositionFingerOver,
	gtile_MouseOver_Int,
	recalcTileWidth_Pixels,
	gtileCoordsOver,
	roundAwayBoundingBox,
	gboundingBox,
	gboundingBoxFloat,
	updateTheme,
	resetColor,
	glimitToDampScale,
	darkenColor,
	render,
	getTileMouseOver,
	recalcTile_MouseCrosshairOver,
	recalcTiles_FingersOver,
	getBoundingBoxOfBoard,
	generatePerspectiveBoundingBox,
};