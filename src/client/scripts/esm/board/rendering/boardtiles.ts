// src/client/scripts/esm/board/rendering/boardtiles.ts

/**
 * This script renders the board tiles, and changes their color.
 * It owns the tile textures (context-bound GPU objects) and draws the fractal boards.
 * The board's geometry queries (bounding box, tile width) live in {@link boardgeometry}.
 *
 * This is a FACTORY: {@link createBoardTiles} builds one tile renderer bound to a
 * {@link RenderContext}. The interactive game and each static preview own one, with
 * their own tile textures in their own gl context.
 */

import type { Color } from '../../../../../shared/types/color.js';
import type RenderContext from './RenderContext.js';
import type { DoubleCoords } from '../../../../../shared/util/coordutil.js';
import type { UniformValue } from '../../webgl/Renderable.js';
import type { AttributeInfo, Renderable, TextureInfo } from '../../webgl/Renderable.js';

import bd, { BigDecimal } from '@naviary/bigdecimal';

import math from '../../../../../shared/util/math/math.js';

import colorutil from '../../util/colorutil.js';
import primitives from './primitives.js';
import preferences from '../../util/preferences.js';
import frametracker from './frametracker.js';
import boardgeometry from './boardgeometry.js';
import TextureLoader from '../../webgl/TextureLoader.js';
import { SettingsBus } from '../../util/SettingsBus.js';
import checkerboardgenerator from '../../chess/rendering/checkerboardgenerator.js';

// Types -----------------------------------------------------------------------

/** One independent tile renderer, as returned by {@link createBoardTiles}. */
export interface BoardTiles {
	/** Loads and generates this context's tile textures. */
	init(): Promise<void>;
	/** Resolves once the textures match the current theme. Awaited before redrawing. */
	ready(): Promise<void>;
	/** Renders the board tiles (solid cover + fractal boards). */
	render(noiseTextures?: NoiseTextures, uniforms?: Record<string, UniformValue>): void;
	/** Renders the solid grey cover behind the tiles. */
	renderSolidCover(): void;
}

/**
 * Optional noise textures to bind during rendering,
 * for the uber shader to apply board Zone effects.
 */
type NoiseTextures = { perlinNoise?: WebGLTexture; whiteNoise?: WebGLTexture };

// Constants -------------------------------------------------------------------

/** Z level for perspective mode rendering of the board tiles. */
const PERSPECTIVE_MODE_Z = -0.01;

// BigDecimal constants
const ONE = bd.fromBigInt(1n);
const TWO = bd.fromBigInt(2n);
const TEN = bd.fromBigInt(10n);

// Factory ---------------------------------------------------------------------

/** Creates one tile renderer bound to the given {@link RenderContext}. */
function createBoardTiles(ctx: RenderContext): BoardTiles {
	/** Theme-derived checkerboard textures. */
	let tileTextures:
		| {
				/** Non-mipmapped 2x2 texture used for fractal and perspective
				 * boards. Medium moire, medium blur, no antialiasing. */
				lowResolution: WebGLTexture;
				/** Mipmapped 256x256 texture used for the antialiased
				 * 2D board. Zero moire, yes antialiasing. */
				mipmapped: WebGLTexture;
		  }
		| undefined;

	/**
	 * A mask texture for the tiles, used to apply Zone effects to selective light/dark tiles.
	 * White pixels represent light tile pixels, black pixels represent dark tile pixels.
	 * Independent of theme.
	 */
	let tilesMask: WebGLTexture | undefined;

	/** Current light and dark tile colors in [r,g,b,a]. */
	let tileColors: { light: Color; dark: Color };

	/** The most recent texture generation. Replaced by every theme change. */
	let texturesReady: Promise<void> = Promise.resolve();

	SettingsBus.addEventListener('theme-change', () => {
		// console.log(`Board theme change event detected: ${preferences.getBoardColor()}`);
		texturesReady = resetColor();
	});

	function ready(): Promise<void> {
		return texturesReady;
	}

	// Initialization --------------------------------------------------------------

	async function init(): Promise<void> {
		// Generate the tiles mask texture
		const maskPromise = initMaskTexture();
		// Generation main tile textures
		texturesReady = resetColor();

		await Promise.all([maskPromise, texturesReady]);
	}

	/**
	 * Generates the tiles mask texture.
	 * Used for applying zone effects to selective light/dark tiles.
	 */
	async function initMaskTexture(): Promise<void> {
		// Using 256x256 instead of 2x2 avoids creating an ring of higher moire around the camera in perspective mode.

		const tilesMask_IMG: HTMLImageElement = await checkerboardgenerator.createCheckerboardIMG(
			'white',
			'black',
			256,
		);
		tilesMask = TextureLoader.loadTexture(ctx.gl, tilesMask_IMG, { mipmaps: false });
	}

	async function initTextures(): Promise<void> {
		const lightTilesCssColor = colorutil.arrayToCssColor(tileColors.light);
		const darkTilesCssColor = colorutil.arrayToCssColor(tileColors.dark);

		// Generate both images in parallel
		const [lowResolutionImage, mipmappedImage] = await Promise.all([
			checkerboardgenerator.createCheckerboardIMG(lightTilesCssColor, darkTilesCssColor, 2),
			checkerboardgenerator.createCheckerboardIMG(lightTilesCssColor, darkTilesCssColor, 256),
		]);

		tileTextures = {
			lowResolution: TextureLoader.loadTexture(ctx.gl, lowResolutionImage, { mipmaps: false }), // prettier-ignore
			mipmapped: TextureLoader.loadTexture(ctx.gl, mipmappedImage, { mipmaps: true }),
		};

		frametracker.onVisualChange();
	}

	/** Returns a promise that resolves when the new tiles textures have been generated. */
	function resetColor(
		newLightTiles = preferences.getColorOfLightTiles(),
		newDarkTiles = preferences.getColorOfDarkTiles(),
	): Promise<void> {
		tileColors = { light: newLightTiles, dark: newDarkTiles };
		updateSkyColor();
		frametracker.onVisualChange();
		return initTextures();
	}

	/** Updates the sky color to match the current board color. */
	function updateSkyColor(): void {
		const avgR = (tileColors.light[0] + tileColors.dark[0]) / 2;
		const avgG = (tileColors.light[1] + tileColors.dark[1]) / 2;
		const avgB = (tileColors.light[2] + tileColors.dark[2]) / 2;

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

		ctx.setClearColor([skyR, skyG, skyB]);
		// ctx.setClearColor([0,0,0]); // Solid Black
	}

	// Rendering -------------------------------------------------------------------

	/** Renders the board tiles. */
	function render(noiseTextures?: NoiseTextures, uniforms?: Record<string, UniformValue>): void {
		// This prevents tearing when rendering in the same z-level and in perspective.
		ctx.executeWithDepthFunc_ALWAYS(() => {
			renderSolidCover(); // This is needed even outside of perspective, so when we zoom out, the rendered fractal transprent boards look correct.
			renderFractalBoards(noiseTextures, uniforms);
		});
	}

	/** Renders a box tunnel and floor around the camera, tinted the average tile color. */
	function renderSolidCover(): void {
		// const dist = camera.DIST_TO_RENDER_BOARD;
		const dist = ctx.camera.getZFar() / Math.SQRT2;
		const z = getRelativeZ();
		const cameraZ = ctx.camera.getPosition(true)[2];

		const r = (tileColors.light[0] + tileColors.dark[0]) / 2;
		const g = (tileColors.light[1] + tileColors.dark[1]) / 2;
		const b = (tileColors.light[2] + tileColors.dark[2]) / 2;
		const a = (tileColors.light[3] + tileColors.dark[3]) / 2;

		const data = primitives.BoxTunnel(-dist, -dist, cameraZ, dist, dist, z, r, g, b, a);
		data.push(...primitives.Quad_Color3D(-dist, -dist, dist, dist, z, [r, g, b, a])); // Floor of the box

		const model = ctx.renderable.createRenderable(data, 3, 'TRIANGLES', 'color', true);

		model.render();
	}

	function renderFractalBoards(
		noiseTextures?: NoiseTextures,
		uniforms?: Record<string, UniformValue>,
	): void {
		const z = getRelativeZ();

		// Determine at what "e" the main boards tiles are 1 virtual pixel wide.
		const scaleWhen1TileIs1VirtualPixel = ctx.camera.getScaleWhenZoomedOut();
		const eWhen1TileIs1VirtualPixel = bd.log10(scaleWhen1TileIs1VirtualPixel);

		const currentE = bd.log10(ctx.boardpos.getBoardScale());

		// Board 1 (most zoomed in, always rendered, but may be fading out)
		const board1_E =
			Math.floor((currentE - eWhen1TileIs1VirtualPixel) / 3) * 3 + eWhen1TileIs1VirtualPixel;

		/**
		 * How many orders of magnitude of the scale to transition
		 * board 1's opacity from 1.0 to 0.0. Larger = slower fade.
		 */
		const E_FADE_DIST = 0.9;
		const board1_Opacity = Math.min(-(board1_E - currentE) / E_FADE_DIST, 1.0);
		const board1_Opacity_Eased = math.easeOut(board1_Opacity);

		// Board 2 (more zoomed out, always 1.0 opacity, but ONLY rendered when board 1 is fading out)
		const board2_E = board1_E - 3;

		// ONLY render board2 if the first board has started fading.
		// It's always rendered on bottom at 1.0 opacity.
		if (board1_Opacity_Eased < 1.0) {
			const power = -Math.round(board2_E - eWhen1TileIs1VirtualPixel); // Rounding is ONLY necessary due to correct tiny floating point inaccuracies. This MUST be an integer.
			const zoom = bd.pow(TEN, power);
			generateBoardModel(noiseTextures, zoom, 1.0)?.render([0, 0, z], undefined, uniforms);
		}

		// ALWAYS render board 1 (most zoomed in).
		// This is rendered on top, and may be fading out.
		const power = -Math.round(board1_E - eWhen1TileIs1VirtualPixel); // Rounding is ONLY necessary due to correct tiny floating point inaccuracies. This MUST be an integer.
		const zoom = bd.pow(TEN, power);
		generateBoardModel(noiseTextures, zoom, board1_Opacity_Eased)?.render(
			[0, 0, z],
			undefined,
			uniforms,
		);
	}

	/** Returns what Z level the board tiles should be rendered at this frame. */
	function getRelativeZ(): number {
		return ctx.camera.isCameraRotated() ? PERSPECTIVE_MODE_Z : 0;
	}

	/**
	 * Generates the buffer model of the light tiles.
	 * The dark tiles are rendered separately and underneath.
	 * @param noise - Noise textures for zone effects, if they are loaded.
	 * @param zoom - The zoom level to generate the board model at. Main board: 1.0
	 */
	function generateBoardModel(
		{ perlinNoise, whiteNoise }: NoiseTextures = {},
		zoom: BigDecimal,
		opacity: number = 1.0,
	): Renderable | undefined {
		if (!tilesMask) return; // Mask texture not loaded yet
		if (!tileTextures) return; // Tile textures not loaded yet

		const boardScale = ctx.boardpos.getBoardScale();

		/** Whether this is NOT the main board (zoom level 1.0) */
		const isFractal = !bd.areEqual(zoom, ONE);
		// Fractal boards get the texture with no antialiasing, but some moire.
		const boardTexture =
			isFractal || ctx.camera.isCameraRotated()
				? tileTextures.lowResolution
				: tileTextures.mipmapped;

		/** The scale of the RENDERED board. Final result should always be within a small, visible range. */
		const zoomTimesScale = bd.toNumber(bd.multiplyFloating(boardScale, zoom));
		const zoomTimesScaleTwo = zoomTimesScale * 2;

		const { left, right, bottom, top } = ctx.camera.getRespectiveScreenBox();

		const boardPos = ctx.boardpos.getBoardPos();

		/** Calculates the texture coords for one axis (X/Y) of the tiles model. */
		function getAxisTexCoords(boardPos: BigDecimal, start: number, end: number): DoubleCoords {
			const squareCenter = boardgeometry.getSquareCenter();

			const boardPosAdjusted: BigDecimal = bd.add(boardPos, squareCenter);
			const addend1: BigDecimal = bd.divide(boardPosAdjusted, zoom);
			const addend2: BigDecimal = bd.fromNumber(start / zoomTimesScale);

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

		// prettier-ignore
		const data = primitives.Quad_ColorTexture(left, bottom, right, top, texstartX, texstartY, texendX, texendY, 1, 1, 1, opacity);

		const attributeInfo: AttributeInfo = [
			{ name: 'a_position', numComponents: 2 },
			{ name: 'a_texturecoord', numComponents: 2 },
			{ name: 'a_color', numComponents: 4 },
		];
		const textures: TextureInfo[] = [
			{ texture: boardTexture, uniformName: 'u_colorTexture' },
			{ texture: tilesMask, uniformName: 'u_maskTexture' },
		];
		if (perlinNoise)
			textures.push({ texture: perlinNoise, uniformName: 'u_perlinNoiseTexture' });
		if (whiteNoise) textures.push({ texture: whiteNoise, uniformName: 'u_whiteNoiseTexture' });

		return ctx.renderable.createRenderable_GivenInfo(data, attributeInfo, 'TRIANGLES', 'board_uber_shader', textures); // prettier-ignore
	}

	return { init, ready, render, renderSolidCover };
}

export { createBoardTiles };
