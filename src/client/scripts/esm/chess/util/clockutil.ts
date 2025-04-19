
import type { MetaData } from "./metadata";

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
function isClockValueInfinite(clock: MetaData["TimeControl"]): boolean { return clock === '-'; }

/**
 * Returns the clock in a slightly more human-readable format: `10m+5s`
 * @param key - The clock string: `600+5`, where the left is the start time in seconds, right is increment in seconds.
 * @returns
 */
function getClockFromKey(key: MetaData["TimeControl"]): string { // ssss+ss  converted to  15m+15s
	const minutesAndIncrement = getMinutesAndIncrementFromClock(key);
	if (minutesAndIncrement === null) return translations['no_clock'];
	return `${minutesAndIncrement.minutes}m+${minutesAndIncrement.increment}s`;
}

/**
 * Splits the clock from the form `10+5` into the `minutes` and `increment` properties.
 * If it is an untimed game (represented by `-`), then this will return null.
 * @param clock - The string representing the clock value: `10+5`
 * @returns An object with 2 properties: `minutes`, `increment`, or `null` if the clock is infinite.
 */
function getMinutesAndIncrementFromClock(clock: MetaData["TimeControl"]): null | {minutes: number, increment: number} {
	if (isClockValueInfinite(clock)) return null;
	const [ seconds, increment ] = clock.split('+').map(part => +part) as [number, number]; // Convert them into a number
	const minutes = seconds / 60;
	return { minutes, increment };
}

/**
 * Splits the clock from the form `s+s` into the `base_time_seconds` and `increment_seconds` properties.
 * @param time_control
 * @returns
 */
function splitTimeControl(time_control: MetaData["TimeControl"]): { base_time_seconds: number | null, increment_seconds: number | null } {
	// Check for the untimed indicator first
	if (time_control === '-') return { base_time_seconds: null, increment_seconds: null };
	// Split the time control string into base time and increment
	const [ base_time_seconds, increment_seconds ] = time_control.split('+').map(part => +part) as [number, number]; // Convert them into a number
	// Throw error if either of them are Nan, or negative
	if (isNaN(base_time_seconds) || isNaN(increment_seconds) || base_time_seconds <= 0 || increment_seconds < 0) throw new Error(`Invalid time control: ${time_control}`);
	return { base_time_seconds, increment_seconds };
}

export default {
	getTextContentFromTimeRemain,
	isClockValueInfinite,
	getClockFromKey,
	getMinutesAndIncrementFromClock,
	splitTimeControl,
};