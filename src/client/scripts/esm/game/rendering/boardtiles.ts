
/**
 * This script renders the board, and changes it's color.
 * We also keep track of what tile the mouse is currently hovering over.
 */

import type { AttributeInfo, Renderable, TextureInfo } from '../../webgl/Renderable.js';
import type { Color } from '../../../../../shared/util/math/math.js';
import type { BDCoords, DoubleCoords } from '../../../../../shared/chess/util/coordutil.js';
import type { BigDecimal } from '../../../../../shared/util/bigdecimal/bigdecimal.js';
import type { BoundingBox, BoundingBoxBD } from '../../../../../shared/util/math/bounds.js';

// @ts-ignore
import style from '../gui/style.js';
import camera from './camera.js';
import checkerboardgenerator from '../../chess/rendering/checkerboardgenerator.js';
import jsutil from '../../../../../shared/util/jsutil.js';
import imagecache from '../../chess/rendering/imagecache.js';
import frametracker from './frametracker.js';
import gamefileutility from '../../../../../shared/chess/util/gamefileutility.js';
import gameslot from '../chess/gameslot.js';
import preferences from '../../components/header/preferences.js';
import piecemodels from './piecemodels.js';
import guipromotion from '../gui/guipromotion.js';
import spritesheet from './spritesheet.js';
import boardpos from './boardpos.js';
import texturecache from '../../chess/rendering/texturecache.js';
import bd from '../../../../../shared/util/bigdecimal/bigdecimal.js';
import primitives from './primitives.js';
import TextureLoader from '../../webgl/TextureLoader.js';
import perspective from './perspective.js';
import math from '../../../../../shared/util/math/math.js';
import webgl, { gl } from './webgl.js';
import { createRenderable, createRenderable_GivenInfo } from '../../webgl/Renderable.js';


// Type Definitions ----------------------------------------------------------------

/**
 * Optional noise textures to bind during rendering,
 * for the uber shader to apply board Zone effects.
 */
type NoiseTextures = { perlinNoise?: WebGLTexture, whiteNoise?: WebGLTexture };


// Constants ---------------------------------------------------------------------------

/** Without this, the center of tiles would be their bottom-left corner. Range: 0-1 */
const squareCenter: number = 0.5;

/** Z level for perspective mode rendering of the board tiles. */
const perspectiveMode_z = -0.01;

// BigDecimal constants
const ONE = bd.FromNumber(1.0);
const TWO = bd.FromNumber(2.0);
const TEN = bd.FromNumber(10);


// Variables ---------------------------------------------------------------------------


/** 2x2 Opaque, no mipmaps. Used in perspective mode. Medium moire, medium blur, no antialiasing. */
let tilesTexture_2: WebGLTexture | undefined; // Opaque, no mipmaps
/** 256x256 Opaque, yes mipmaps. Used in 2D mode. Zero moire, yes antialiasing. */
let tilesTexture_256mips: WebGLTexture | undefined;

/**
 * A mask texture for the tiles, used to apply Zone effects to selective light/dark tiles.
 * White pixels represent light tile pixels, black pixels represent dark tile pixels.
 * Independent of theme.
 */
let tilesMask: WebGLTexture | undefined;


/**
 * The *exact* bounding box of the board currently visible on the canvas.
 * This differs from the camera's bounding box because this is effected by the camera's scale (zoom).
 */
let boundingBoxFloat: BoundingBoxBD;
/**
 * The bounding box of the board currently visible on the canvas,
 * rounded away from the center of the canvas to encapsulate the whole of any partially visible squares.
 * This differs from the camera's bounding box because this is effected by the camera's scale (zoom).
 * CONTAINS INTEGER SQUARE VALUES. No floating points!
 */
let boundingBox: BoundingBox;
/**
 * The bounding box of the board currently visible on the canvas when the CAMERA IS IN DEBUG MODE,
 * rounded away from the center of the canvas to encapsulate the whole of any partially visible squares.
 * This differs from the camera's bounding box because this is effected by the camera's scale (zoom).
 */
let boundingBox_debugMode: BoundingBox;

/** Color [r,g,b,a] of the light tiles. */
let lightTiles: Color;
/** Color [r,g,b,a] of the dark tiles. */
let darkTiles: Color;


// Initialization --------------------------------------------------------------------------------


// Add event listener for theme changes
document.addEventListener('theme-change', (_event) => { // Custom Event listener.
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

/** Loads the tiles texture. */
function init(): void {
	// Generate the tiles mask texture
	// Using 256x256 instead of 2x2 avoids creating an ring of higher moire around the camera in perspective mode.
	checkerboardgenerator.createCheckerboardIMG('white', 'black', 256).then(tilesMask_IMG => { 
		tilesMask = TextureLoader.loadTexture(gl, tilesMask_IMG, { mipmaps: false });
	});

	// Initial generation of tile textures
	updateTheme();

	recalcVariables(); // Variables dependant on the board position & scale
}

async function initTextures(): Promise<void> {
	const lightTilesCssColor = style.arrayToCssColor(lightTiles);
	const darkTilesCssColor = style.arrayToCssColor(darkTiles);

	// Generate both images in parallel
	const [tilesTexture_2_IMG, tilesTexture_256mips_IMG] = await Promise.all([
		checkerboardgenerator.createCheckerboardIMG(lightTilesCssColor, darkTilesCssColor, 2),
		checkerboardgenerator.createCheckerboardIMG(lightTilesCssColor, darkTilesCssColor, 256)
	]);

	tilesTexture_2 = TextureLoader.loadTexture(gl, tilesTexture_2_IMG, { mipmaps: false });
	tilesTexture_256mips = TextureLoader.loadTexture(gl, tilesTexture_256mips_IMG, { mipmaps: true });

	frametracker.onVisualChange();
}


// Updating --------------------------------------------------------------------------------


// Recalculate board velicity, scale, and other common variables.
function recalcVariables(): void {
	recalcBoundingBox();
}

function recalcBoundingBox(): void {

	boundingBoxFloat = getBoundingBoxOfBoard(boardpos.getBoardPos(), boardpos.getBoardScale(), false);
	boundingBox = roundAwayBoundingBox(boundingBoxFloat);

	const boundingBoxFloat_debugMode = getBoundingBoxOfBoard(boardpos.getBoardPos(), boardpos.getBoardScale(), true);
	boundingBox_debugMode = roundAwayBoundingBox(boundingBoxFloat_debugMode);
}


// Public API ---------------------------------------------------------------------------------


function getSquareCenter(): BigDecimal {
	return bd.FromNumber(squareCenter);
}

function getSquareCenterAsNumber(): number {
	return squareCenter;
}

function gtileWidth_Pixels(debugMode = camera.getDebug()): BigDecimal {
	// If we're in developer mode, our screenBoundingBox is different
	const screenBoundingBox = camera.getScreenBoundingBox(debugMode);
	const factor1: BigDecimal = bd.FromNumber(camera.canvas.height * 0.5 / screenBoundingBox.top);
	const tileWidthPixels_Physical = bd.multiply_floating(factor1, boardpos.getBoardScale()); // Greater for retina displays

	const divisor = bd.FromNumber(window.devicePixelRatio);
	const tileWidthPixels_Virtual = bd.divide_floating(tileWidthPixels_Physical, divisor);

	return tileWidthPixels_Virtual;
}

/**
 * Returns a copy of the board bounding box, rounded away from the center
 * of the canvas to encapsulate the whole of any partially visible squares.
 * CONTAINS INTEGER SQUARE VALUES. No floating points!
 * @returns The board bounding box
 */
function gboundingBox(debugMode = camera.getDebug()): BoundingBox {
	return debugMode ? jsutil.deepCopyObject(boundingBox_debugMode) : jsutil.deepCopyObject(boundingBox);
}

/**
 * Returns a copy of the *exact* board bounding box.
 * @returns The board bounding box
 */
function gboundingBoxFloat(): BoundingBoxBD {
	return jsutil.deepCopyObject(boundingBoxFloat);
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
function getBoundingBoxOfBoard(position: BDCoords = boardpos.getBoardPos(), scale: BigDecimal = boardpos.getBoardScale(), debugMode?: boolean): BoundingBoxBD {
	const screenBoundingBox = camera.getScreenBoundingBox(debugMode);

	function getAxisEdges(position: BigDecimal, screenEnd: number): [BigDecimal, BigDecimal] {
		const screenEndBD = bd.FromNumber(screenEnd);
		const distToEdgeInSquares: BigDecimal = bd.divide_floating(screenEndBD, scale);
		const start = bd.subtract(position, distToEdgeInSquares);
		const end = bd.add(position, distToEdgeInSquares);
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
	const rangeOfViewBD = bd.FromNumber(rangeOfView);
	const renderDistInSquares = bd.divide_floating(rangeOfViewBD, scale);

	return {
		left: bd.subtract(position[0], renderDistInSquares),
		right: bd.add(position[0], renderDistInSquares),
		bottom: bd.subtract(position[1], renderDistInSquares),
		top: bd.add(position[1], renderDistInSquares),
	};
}

/**
 * Returns a new board bounding box, with its edges rounded away from the
 * center of the canvas to encapsulate the whole of any squares partially included.
 * STILL IS AN INTEGER BOUNDING BOX, 
 * @param src - The source board bounding box
 * @returns The rounded bounding box
 */
function roundAwayBoundingBox(src: BoundingBoxBD): BoundingBox {
	const squareCenter = getSquareCenter();
	const squareCenterMinusOne = bd.subtract(squareCenter, ONE);

	const left = bd.toBigInt(bd.floor(bd.add(src.left, squareCenter))); // floor(left + squareCenter)
	const right = bd.toBigInt(bd.ceil(bd.add(src.right, squareCenterMinusOne))); // ceil(right + squareCenter - 1)
	const bottom = bd.toBigInt(bd.floor(bd.add(src.bottom, squareCenter))); // floor(bottom + squareCenter)
	const top = bd.toBigInt(bd.ceil(bd.add(src.top, squareCenterMinusOne))); // ceil(top + squareCenter - 1)
    
	return { left, right, bottom, top };
}

/** Resets the board color, sky, and navigation bars (the color changes when checkmate happens). */
function updateTheme(): void {
	const gamefile = gameslot.getGamefile();
	if (gamefile && gamefileutility.isGameOver(gamefile.basegame)) darkenColor(); // Reset to slightly darkened board
	else resetColor(); // Reset to defaults
	updateSkyColor();
	updateNavColor();
}

function resetColor(newLightTiles = preferences.getColorOfLightTiles(), newDarkTiles = preferences.getColorOfDarkTiles()): void {
	lightTiles = newLightTiles; // true for white
	darkTiles = newDarkTiles; // false for dark
	initTextures();
	frametracker.onVisualChange();
}

// Updates sky color based on current board color
function updateSkyColor(): void {
	const avgR = (lightTiles[0] + darkTiles[0]) / 2;
	const avgG = (lightTiles[1] + darkTiles[1]) / 2;
	const avgB = (lightTiles[2] + darkTiles[2]) / 2;

	// BEFORE STAR FIELD ANIMATION
	// const dimAmount = 0.27; // Default: 0.27
	// const skyR = avgR - dimAmount;
	// const skyG = avgG - dimAmount;
	// const skyB = avgB - dimAmount;

	// AFTER STAR FIELD ANIMATION
	const baseDim = 0.27;
	const multiplierDim = 0.6;
	const skyR = (avgR - baseDim) * multiplierDim; 
	const skyG = (avgG - baseDim) * multiplierDim;
	const skyB = (avgB - baseDim) * multiplierDim;

	webgl.setClearColor([skyR, skyG, skyB]);
	// webgl.setClearColor([0,0,0]); // Solid Black
}

function updateNavColor(): void {
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

function darkenColor(): void {
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


// Rendering -------------------------------------------------------------------------


// Renders board tiles
function render(noiseTextures?: NoiseTextures, uniforms?: Record<string, any>): void {
	// This prevents tearing when rendering in the same z-level and in perspective.
	webgl.executeWithDepthFunc_ALWAYS(() => {
		renderSolidCover(); // This is needed even outside of perspective, so when we zoom out, the rendered fractal transprent boards look correct.
		// renderMainBoard(noiseTextures, uniforms);
		renderFractalBoards(noiseTextures, uniforms);
	});
}

// Renders an upside down grey cone centered around the camera, and level with the horizon.
function renderSolidCover(): void {
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

	const model = createRenderable(data, 3, 'TRIANGLES', 'color', true);

	model.render();
}

function renderFractalBoards(noiseTextures?: NoiseTextures, uniforms?: Record<string, any>): void {
	const z = getRelativeZ();

	// Determine at what "e" the main boards tiles are 1 virtual pixel wide.
	const scaleWhen1TileIs1VirtualPixel = camera.getScaleWhenZoomedOut();
	const eWhen1TileIs1VirtualPixel = bd.log10(scaleWhen1TileIs1VirtualPixel);

	const currentE = bd.log10(boardpos.getBoardScale());
	// console.log("currentE:", currentE);

	// Board 1 (most zoomed in, always rendered, but may be fading out)
	const board1_E = Math.floor((currentE - eWhen1TileIs1VirtualPixel) / 3) * 3 + eWhen1TileIs1VirtualPixel;
	// console.log("board1_E:", board1_E);

	/**
	 * How many orders of magnitude of the scale to transition
	 * board 1's opacity from 1.0 to 0.0. Larger = slower fade.
	 */
	const E_FADE_DIST = 0.9;
	const board1_Opacity = Math.min(-(board1_E - currentE) / E_FADE_DIST, 1.0);
	const board1_Opacity_Eased = math.easeOut(board1_Opacity);
	// console.log("nextZoomedInOpacity:", board1_Opacity_Eased);

	// Board 2 (more zoomed out, always 1.0 opacity, but ONLY rendered when board 1 is fading out)
	const board2_E = board1_E - 3;
	// console.log("board2_E:", board2_E);

	// ONLY render board2 if the first board has started fading.
	// It's always rendered on bottom at 1.0 opacity.
	if (board1_Opacity_Eased < 1.0) {
		// console.log("Rendering 2nd board");
		const power = -Math.round(board2_E - eWhen1TileIs1VirtualPixel); // Rounding is ONLY necessary due to correct tiny floating point inaccuracies. This MUST be an integer.
		const zoom = bd.powerInt(TEN, power);
		generateBoardModel(noiseTextures, zoom, 1.0)?.render([0,0,z], undefined, uniforms);
	}

	// ALWAYS render board 1 (most zoomed in).
	// This is rendered on top, and may be fading out.
	const power = -Math.round(board1_E - eWhen1TileIs1VirtualPixel); // Rounding is ONLY necessary due to correct tiny floating point inaccuracies. This MUST be an integer.
	const zoom = bd.powerInt(TEN, power);
	generateBoardModel(noiseTextures, zoom, board1_Opacity_Eased)?.render([0,0,z], undefined, uniforms);
}

/** Returns what Z level the board tiles should be rendered at this frame. */
function getRelativeZ(): number {
	return perspective.getEnabled() ? perspectiveMode_z : 0;
}

/**
 * Generates the buffer model of the light tiles.
 * The dark tiles are rendered separately and underneath.
 * @param noise - Noise textures for zone effects, if they are loaded.
 * @param zoom - The zoom level to generate the board model at. Main board: 1.0
 */
function generateBoardModel({ perlinNoise, whiteNoise }: NoiseTextures = {}, zoom: BigDecimal, opacity: number = 1.0): Renderable | undefined {
	if (!tilesMask) return; // Mask texture not loaded yet

	const boardScale = boardpos.getBoardScale();

	/** Whether this is NOT the main board (zoom level 1.0) */
	const isFractal = !bd.areEqual(zoom, ONE);
	// Fractal boards get the texture with no antialiasing, but some moire.
	const boardTexture = isFractal || perspective.getEnabled() ? tilesTexture_2 : tilesTexture_256mips;
	if (!boardTexture) return; // Texture not loaded yet

	/** The scale of the RENDERED board. Final result should always be within a small, visible range. */
	const zoomTimesScale = bd.toNumber(bd.multiply_floating(boardScale, zoom));
	const zoomTimesScaleTwo = zoomTimesScale * 2;

	const { left, right, bottom, top } = camera.getRespectiveScreenBox();

	const boardPos = boardpos.getBoardPos();

	/** Calculates the texture coords for one axis (X/Y) of the tiles model. */
	function getAxisTexCoords(boardPos: BigDecimal, start: number, end: number): DoubleCoords {
		const squareCenter = getSquareCenter();

		const boardPosAdjusted: BigDecimal = bd.add(boardPos, squareCenter);
		const addend1: BigDecimal = bd.divide_fixed(boardPosAdjusted, zoom);
		const addend2: BigDecimal = bd.FromNumber(start / zoomTimesScale);
		
		const sum: BigDecimal = bd.add(addend1, addend2);
		const mod2: number = bd.toNumber(bd.mod(sum, TWO));
		const texstart: number = mod2 / 2;

		const diff = end - start;
		const texdiff = diff / zoomTimesScaleTwo;
		const texend = texstart + texdiff;
		return [texstart, texend];
	}

	const [texstartX, texendX] = getAxisTexCoords(boardPos[0], left, right);
	const [texstartY, texendY] = getAxisTexCoords(boardPos[1], bottom, top);
	
	const data = primitives.Quad_ColorTexture(left, bottom, right, top, texstartX, texstartY, texendX, texendY, 1, 1, 1, opacity);

	const attributeInfo: AttributeInfo = [
		{ name: 'a_position', numComponents: 2 },
		{ name: 'a_texturecoord', numComponents: 2 },
		{ name: 'a_color', numComponents: 4 }
	];
	const textures: TextureInfo[] = [
		{ texture: boardTexture, uniformName: 'u_colorTexture' },
		{ texture: tilesMask, uniformName: 'u_maskTexture' }
	];
	if (perlinNoise) textures.push({ texture: perlinNoise, uniformName: 'u_perlinNoiseTexture' });
	if (whiteNoise) textures.push({ texture: whiteNoise, uniformName: 'u_whiteNoiseTexture' });
	
	return createRenderable_GivenInfo(data, attributeInfo, 'TRIANGLES', 'board_uber_shader', textures);
}


// Exports -------------------------------------------------------------------------


export default {
	// Initialization
	init,
	// Updating
	recalcVariables,
	// Public API
	getSquareCenter,
	getSquareCenterAsNumber,
	gtileWidth_Pixels,
	gboundingBox,
	gboundingBoxFloat,
	getBoundingBoxOfBoard,
	generatePerspectiveBoundingBox,
	roundAwayBoundingBox,
	updateTheme,
	resetColor,
	darkenColor,
	// Rendering
	render,
	renderSolidCover,
};