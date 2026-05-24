// src/shared/chess/util/clockutil.ts

/**
 * The clock value for the game, `s+s`, where the left side is
 * start time in seconds, and the right is increment in seconds.
 * Untimed = `-`
 */

import type { TimeControl } from '../../types.js';

// Constants -----------------------------------------------

/** Valid base time values in minutes, matching the game setup modal's base-time slider ticks. */
const VALID_BASE_MINUTES = [
	1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
	25, 30, 35, 40, 45,
	60,
]; // prettier-ignore

/** Valid increment values in seconds, matching the game setup modal's increment slider ticks. */
export const VALID_INCREMENT_SECS = [
	0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
	25, 30, 35, 40, 45,
	60,
]; // prettier-ignore

// Functions -----------------------------------------------

/**
 * Returns true if the time control string is valid for a lobby seek.
 * Untimed ("-") is always valid. Timed controls must have a base that is
 * a multiple of 60 whose minute-value is in {@link VALID_BASE_MINUTES},
 * and an increment in {@link VALID_INCREMENT_SECS}.
 */
function isTimedControlValid(time: TimeControl): boolean {
	if (time === '-') return true;
	const parsed = splitTimeControl(time);
	if (parsed.base_time_seconds === null || parsed.increment_seconds === null) return false;
	const baseTimeMinutes = parsed.base_time_seconds / 60;
	return (
		Number.isInteger(baseTimeMinutes) &&
		VALID_BASE_MINUTES.includes(baseTimeMinutes) &&
		VALID_INCREMENT_SECS.includes(parsed.increment_seconds)
	);
}

function getTextContentFromTimeRemain(time: number): string {
	let seconds = Math.ceil(time / 1000);
	let minutes = 0;
	while (seconds >= 60) {
		seconds -= 60;
		minutes++;
	}
	if (seconds < 0) seconds = 0;

	return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Returns true if the clock value is infinite. Internally, untimed games are represented with a "-".
 * @param clock - The clock value (e.g. "10+5").
 * @returns *true* if it's infinite.
 */
function isClockValueInfinite(clock: TimeControl): boolean {
	return clock === '-';
}

/**
 * Splits the clock from the form `10+5` into the `minutes` and `increment` properties.
 * If it is an untimed game (represented by `-`), then this will return null.
 * @param clock - The string representing the clock value: `10+5`
 * @returns An object with 2 properties: `minutes`, `increment`, or `null` if the clock is infinite.
 */
function getMinutesAndIncrementFromClock(
	clock: TimeControl,
): null | { minutes: number; increment: number } {
	if (isClockValueInfinite(clock)) return null;
	const [seconds, increment] = clock.split('+').map((part) => +part) as [number, number]; // Convert them into a number
	const minutes = seconds / 60;
	return { minutes, increment };
}

/**
 * Splits the clock from the form `s+s` into the `base_time_seconds` and `increment_seconds` properties.
 * @param time_control
 * @returns
 */
function splitTimeControl(time_control: TimeControl): {
	base_time_seconds: number | null;
	increment_seconds: number | null;
} {
	// Check for the untimed indicator first
	if (time_control === '-') return { base_time_seconds: null, increment_seconds: null };
	// Split the time control string into base time and increment
	const [base_time_seconds, increment_seconds] = time_control.split('+').map((part) => +part) as [
		number,
		number,
	]; // Convert them into a number
	// Throw error if either of them are Nan, or negative
	if (
		isNaN(base_time_seconds) ||
		isNaN(increment_seconds) ||
		base_time_seconds <= 0 ||
		increment_seconds < 0
	)
		throw new Error(`Invalid time control: ${time_control}`);
	return { base_time_seconds, increment_seconds };
}

/**
 * Returns the SVG symbol ID of the speed icon for the
 * given time control, or `undefined` if the game is untimed.
 * Estimates total game seconds as `base_time + 40 × increment` to determine
 * the speed category, matching lichess's classification ranges.
 */
function getSpeedIconId(time_control: TimeControl): string {
	if (isClockValueInfinite(time_control)) return 'svg-speed-infinite';
	const { base_time_seconds, increment_seconds } = splitTimeControl(time_control);
	const estimate = base_time_seconds! + 40 * increment_seconds!;
	// if (estimate < 30) return 'svg-speed-ultra-bullet'; // For now we don't have time controls < 1m
	if (estimate < 180) return 'svg-speed-bullet';
	if (estimate < 480) return 'svg-speed-blitz';
	if (estimate < 1500) return 'svg-speed-rapid';
	if (estimate < 21600) return 'svg-speed-classical';
	// return 'svg-speed-correspondence';
	return 'svg-speed-classical'; // This is the max for now
}

export default {
	// Constants
	VALID_BASE_MINUTES,
	VALID_INCREMENT_SECS,
	// Functions
	isTimedControlValid,
	getTextContentFromTimeRemain,
	isClockValueInfinite,
	getMinutesAndIncrementFromClock,
	splitTimeControl,
	getSpeedIconId,
};
