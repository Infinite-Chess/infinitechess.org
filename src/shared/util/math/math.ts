// src/shared/util/math/math.ts

/**
 * This script contains extra general math operations.
 *
 * Most of the stuff in here were moved to either bounds.ts, vectors.ts, or geometry.ts.
 */

// Types ------------------------------------------------------

/** A color in a length-4 array: `[r,g,b,a]` */
type Color = [number, number, number, number];

// Operations -----------------------------------------------------------

/**
 * Clamps a value between a minimum and a maximum value.
 */
function clamp(value: number, min: number, max: number): number {
	return value < min ? min : value > max ? max : value;
}

/**
 * Computes the positive modulus of two numbers.
 * @param a - The dividend.
 * @param b - The divisor.
 * @returns The positive remainder of the division.
 */
function posMod(a: number, b: number): number {
	return a - Math.floor(a / b) * b;
}

// Easing Functions ---------------------------------------------------

/**
 * Applies an ease-in-out interpolation.
 * @param t - The interpolation factor (0 to 1).
 */
function easeInOut(t: number): number {
	return -0.5 * Math.cos(Math.PI * t) + 0.5;
}

/**
 * Applies an ease-in interpolation.
 * @param t - The interpolation factor (0 to 1).
 */
function easeIn(t: number): number {
	return t * t;
}

/**
 * Applies an ease-out interpolation.
 * @param t - The interpolation factor (0 to 1).
 */
function easeOut(t: number): number {
	return t * (2 - t);
}

// Other -------------------------------------------------------------

/** Returns a value smoothly oscillating between a min and max. */
function getSineWaveVariation(time: number, min: number, max: number): number {
	return min + (Math.sin(time) * 0.5 + 0.5) * (max - min);
}

// Exports -----------------------------------------------------

export default {
	// Operations
	clamp,
	posMod,
	// Easing Functions
	easeInOut,
	easeIn,
	easeOut,
	// Other
	getSineWaveVariation,
};

export type { Color };
