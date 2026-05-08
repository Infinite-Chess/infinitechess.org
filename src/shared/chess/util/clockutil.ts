// src/shared/chess/util/clockutil.ts

/**
 * The clock value for the game, `s+s`, where the left side is
 * start time in seconds, and the right is increment in seconds.
 * Untimed = `-`
 */

import type { TimeControl } from '../../types.js';

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
function getSpeedIconId(time_control: TimeControl): string | undefined {
	if (isClockValueInfinite(time_control)) return undefined;
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
	getTextContentFromTimeRemain,
	isClockValueInfinite,
	getMinutesAndIncrementFromClock,
	splitTimeControl,
	getSpeedIconId,
};
