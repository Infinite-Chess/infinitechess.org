
// src/client/scripts/esm/game/rendering/starfield.ts

/**
 * Renders a starfield background inside voids and the world border
 */


import type { Color } from '../../util/math/math.js';
import type { DoubleCoords } from '../../chess/util/coordutil.js';


// @ts-ignore
import loadbalancer from '../misc/loadbalancer.js';
import camera from './camera.js';
import primitives from './primitives.js';
import preferences from '../../components/header/preferences.js';
import perspective from './perspective.js';
import frametracker from './frametracker.js';
import gameslot from '../chess/gameslot.js';
import boardutil from '../../chess/util/boardutil.js';
import boardtiles from './boardtiles.js';
import bounds from '../../util/math/bounds.js';
import gameloader from '../chess/gameloader.js';
import { AttributeInfoInstanced, createModel_Instanced_GivenAttribInfo } from './buffermodel.js';
import { rawTypes as r } from '../../chess/util/typeutil.js';



/** A sigle star particle. */
type Star = {
    /** Determines if the star should use the light or dark tile color theme. */
    isLight: boolean;
	/** Lifespan in milliseconds */
    lifespan: number;
    position: DoubleCoords;
	velocity: DoubleCoords;
    size: number;
    /** The maximum size offset for this star's pulse (the amplitude). */
    pulseSize: number;
    /** The speed of this star's pulse in radians per second. */
    pulseSpeed: number;
    /** The timestamp when the star was created. */
    createdAt: number;
};



/** The attribute info of our instanced models' vertex data. */
const ATTRIB_INFO: AttributeInfoInstanced = {
	vertexDataAttribInfo: [
		{ name: 'position', numComponents: 2 }
	],
	instanceDataAttribInfo: [
		{ name: 'instanceposition', numComponents: 2 },
		{ name: 'instancecolor', numComponents: 4 },
		{ name: 'instancesize', numComponents: 1 },
	]
};


/** Configuration variables for Star Field appearance. */
export const CONFIG = {
	/** The DENSITY of stars, measured in stars per square unit of world space. */
	starDensity: 0.07, // Default: 0.07
	// starDensity: 1,

	/** How many additional units of world space beyond the edges of the screen to spawn stars. */
	screenPadding: 3, // Units of world space

	/** Maximum opacity of a star. */
	opacity: 0.3, // Default: 0.3

	// --- Lifespan ---
	/** Average lifespan in seconds. */
	baseLifespan: 25.0,
	// baseLifespan: 5.0,
	/** How much the lifespan can vary from the base. */
	lifespanVariance: 5.0,
	// lifespanVariance: 0.0,

	// --- Size ---
	/** The average width of a star in world units. */
	baseWidth: 0.5,
	/** How much the width can vary from the base. */
	widthVariance: 0.2,

	// --- Motion ---
	/** Average speed in world units per second. */
	baseSpeed: 0.2,
	/** How much the speed can vary from the base. */
	speedVariance: 0.1,

	// --- Pulse Animation ---
	/**
	 * The average maximum amount a star's size will increase from its base due to the pulse.
	 * DOES NOT decrease the size below baseWidth, only pulses it LARGER.
	 */
	basePulseSize: 0.13,
	/** How much the pulse amplitude can vary. */
	pulseSizeVariance: 0.04,
	/** The average speed of the pulse in radians per second. Higher is faster. */
	basePulseSpeed: 1.5,
	/** How much the pulse speed can vary. */
	pulseSpeedVariance: 0.4,

	// --- Fading  ---
	/** The duration of the fade-in/out at the start/end of a star's life, in seconds. */
	fadeDuration: 3.0, 
	// fadeDuration: 0.0, 
};


// Module State ------------------------------------------------------------


/** All star objects. The entire star field. */
const stars: Star[] = [];
/** Whether the star field has been initialized or not. */
let isInitialized: boolean = false;
/**
 * This frame's desired number of stars.
 * This varies based on your screen area.
 */
let desiredNumStars: number = 0;


// Initialization -----------------------------------------------------------------------


/** Event listener for when we toggle Starfield in the settings dropdown. */
document.addEventListener('starfield-toggle', (e: CustomEvent) => {
	if (!gameloader.areInAGame()) return; // Not in a game => Starfield should not be initiated or terminated.
	const enabled: boolean = e.detail;
	if (enabled) init();
	else terminate();
});

/**
 * Initializes the starfield system, creating all the star objects.
 * This must be called once before `update`.
 */
function init(): void {
	if (isInitialized) throw Error("Starfield is already initialized.");

	// First, calculate the initial desired number of stars.
	desiredNumStars = getDesiredNumStars();

	for (let i = 0; i < desiredNumStars; i++) {
		const star: Star = createStar(true);
		stars.push(star);
	}

	isInitialized = true;
}

/** Closes the starfield system, resetting its state. */
function terminate(): void {
	if (!isInitialized) throw Error("Starfield is already terminated.");

	// Clear any existing stars
	stars.length = 0;
	isInitialized = false;
	desiredNumStars = 0;
}

/**
 * Creates a brand new star with random properties.
 * @param randomizeAge - If true, the star's age will be randomized to a value between 0 and its lifespan.
 * This is useful for initial population of stars, so they don't all fade in/out near the same time.
 */
function createStar(randomizeAge: boolean): Star {

	// Position
	const screenBox = camera.getScreenBoundingBox(false);
	// Apply padding
	screenBox.left -= CONFIG.screenPadding;
	screenBox.right += CONFIG.screenPadding;
	screenBox.bottom -= CONFIG.screenPadding;
	screenBox.top += CONFIG.screenPadding;
	const width = (screenBox.right - screenBox.left);
	const height = (screenBox.top - screenBox.bottom);
	const position: DoubleCoords = [
		Math.random() * width + screenBox.left,
		Math.random() * height + screenBox.bottom
	];

	// Velocity
	const speed: number = applyVariance(CONFIG.baseSpeed, CONFIG.speedVariance);
	const angle: number = Math.random() * 2 * Math.PI;
	const velocity: DoubleCoords = [
		Math.cos(angle) * speed,
		Math.sin(angle) * speed
	];

	// Lifespan
	let newLifespan = applyVariance(CONFIG.baseLifespan, CONFIG.lifespanVariance) * 1000; // Convert to milliseconds
	if (randomizeAge) newLifespan = Math.random() * newLifespan;

	return {
		isLight: Math.random() < 0.5,
		lifespan: newLifespan,
		position,
		velocity,
		size: Math.max(0.1, applyVariance(CONFIG.baseWidth, CONFIG.widthVariance)),
		pulseSize: applyVariance(CONFIG.basePulseSize, CONFIG.pulseSizeVariance),
		pulseSpeed: applyVariance(CONFIG.basePulseSpeed, CONFIG.pulseSpeedVariance),
		createdAt: performance.now(),
	};
}

/** Calculate's this frames desired number of stars, dependant on your screen area. */
function getDesiredNumStars(): number {
	const screenBox = camera.getScreenBoundingBox(false);
	const paddedWidth = (screenBox.right - screenBox.left) + (CONFIG.screenPadding * 2);
	const paddedHeight = (screenBox.top - screenBox.bottom) + (CONFIG.screenPadding * 2);
	const area = paddedWidth * paddedHeight;
	return Math.round(area * CONFIG.starDensity);
}

/**
 * A helper function to apply random variance to a base value.
 * @param base The central value.
 * @param variance The maximum amount the value can deviate from the base.
 * @returns A randomized value.
 */
function applyVariance(base: number, variance: number): number {
	return base + (Math.random() - 0.5) * 2 * variance;
}


// Updating ----------------------------------------------------------------------


/** Updates all stars motion, opacity, pulsing, birth, and death! */
function update(): void {
	if (!isInitialized) return;

	// Call for a render this frame if the starfield is visible
	if (isStarfieldVisible()) frametracker.onVisualChange();
	else console.log("Starfield not visible. Not rendering.")

	// Update the desired number of stars for this frame ---
	desiredNumStars = getDesiredNumStars();

	const deltaTimeSecs = loadbalancer.getDeltaTime();
	const now = performance.now(); // Get the current time once.

	// 1. Update existing stars and handle deaths
	for (let i = stars.length - 1; i >= 0; i--) {
		const star = stars[i]!;

		// Update position and size
		star.position[0] += star.velocity[0] * deltaTimeSecs;
		star.position[1] += star.velocity[1] * deltaTimeSecs;

		// Check for death based on actual elapsed time.
		const starAge = now - star.createdAt;
		if (starAge >= star.lifespan) {
			// A star has died. Check if we should replace it.
			if (stars.length > desiredNumStars) {
				// We have too many stars right now, so just remove this one.
				// This can happen if the user shrinks their window.
				stars.splice(i, 1);
			} else {
				// We need to keep the population up, so replace it with a new one.
				stars[i] = createStar(false);
			}
		}
	}

	// 2. Add new stars if we are below the desired count ---
	// This can happen if the user enlarges their window.```
	while (stars.length < desiredNumStars) {
		// Randomize the age (since we may be creating a lot at once)
		stars.push(createStar(true));
	}
}

/** Only requests an animation frame if there's a good chance the starfield is visible. */
function isStarfieldVisible(): boolean {
	// If we're in perspective mode, there's a good chance we can
	// see the sky, which the starfield is visible in.
	if (perspective.getEnabled()) return true;

	// If voids are present in the game, there's also a good chance
	// we can see the starfield underneath them.
	// It would take too much effort to determine if the void mesh
	// overlaps with the screen, so just assume the're visible.
	const { boardsim } = gameslot.getGamefile()!; // Will be present since starfield is only initialized when we're in a game
	if (boardutil.getPieceCountOfType(boardsim.pieces, r.VOID) > 0) return true; // Voids are PRESENT

	// At this point, if there isn't a world border, we know starfield is NOT visible.
	if (boardsim.playableRegion === undefined) return false;

	// There IS a world border.
	// Last check is whether our screen is entirely contained within the playableRegion box.
	// If so, the starfield is NOT visible.
	const screenBox = boardtiles.gboundingBox(false);
	return !bounds.boxContainsBox(boardsim.playableRegion, screenBox);
}


// Rendering ----------------------------------------------------------------------


/** Renders the star field. */
function render(): void {
	const vertexData: number[] = primitives.Quad(-0.5, -0.5, 0.5, 0.5);
	const instanceData: number[] = []; // Per instance data: Position (2), Color (4), Size (1)

	const lightTileColor = preferences.getColorOfLightTiles();
	const darkTileColor = preferences.getColorOfDarkTiles();

	// Convert the fade duration from seconds to milliseconds.
	const fadeMillis = CONFIG.fadeDuration * 1000;

	const now = performance.now(); // Get current time once for this frame.

	stars.forEach(star => {
		const age = now - star.createdAt;
		const timeUntilDeath = star.lifespan - age;

		// Sinusoidal Pulsing Size Calculation
		const pulsingCycleSecs = timeUntilDeath / 1000;
		// Oscillates between 0 and 1 (only increasing size)
		const sinWave = -0.5 * Math.cos(pulsingCycleSecs * star.pulseSpeed) + 0.5;
		// The final size is the base size plus the scaled sine wave
		const currentSize = star.size + (sinWave * star.pulseSize);

		// Fade In/Out Alpha Calculation
		let fadeInAlpha = CONFIG.opacity;
		if (age < fadeMillis) fadeInAlpha = (age / fadeMillis) * CONFIG.opacity;

		let fadeOutAlpha = CONFIG.opacity;
		if (timeUntilDeath < fadeMillis) fadeOutAlpha = (timeUntilDeath / fadeMillis) * CONFIG.opacity;

		// Use the minimum of the two alphas.
		// If a star's lifespan is shorter than 2x fadeDuration,
		// this will prevent it from reaching full opacity.
		const currentAlpha = Math.max(0.0, Math.min(fadeInAlpha, fadeOutAlpha));

		// Select Color & Combine With Alpha
		const baseColor = star.isLight ? lightTileColor : darkTileColor;
		const currentColor: Color = [baseColor[0], baseColor[1], baseColor[2], currentAlpha];

		// Push instance data
		instanceData.push(...star.position, ...currentColor, currentSize);
	});

	perspective.renderWithoutPerspectiveRotations(() => {
		createModel_Instanced_GivenAttribInfo(vertexData, instanceData, ATTRIB_INFO, 'TRIANGLES').render();
	});
}


// Exports -----------------------------------------------------------------------


export default {
	init,
	terminate,
	update,
	render,
};
