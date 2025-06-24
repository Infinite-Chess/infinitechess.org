
// @ts-ignore
import { DEV_BUILD } from "../config/config.js";

/** These are the allowed time controls in production. */
const validTimeControls = ['-','60+2','120+2','180+2','300+2','480+3','600+4','600+6','720+5','900+6','1200+8','1500+10','1800+15','2400+20']; 
/** These are only allowed in development. */
const devTimeControls = ['15+2'];

/**
 * Returns true if the provided time control is valid.
 * If false, that means somebody is time control (e.g. "600+6").
 * @returns {boolean} *true* if it is valid.
 */
function isClockValueValid(time_control) {
	return validTimeControls.includes(time_control) ||
	DEV_BUILD && devTimeControls.includes(time_control);
}

/**
 * Splits the clock from the form `10+5` into the `minutes` and `increment` properties.
 * If it is an untimed game (represented by `-`), then this will return null.
 * @param {string} clock - The string representing the clock value: `10+5`
 * @returns {Object} An object with 2 properties: `minutes`, `increment`, or `null` if the clock is infinite.
 */
function getMinutesAndIncrementFromClock(clock) {
	if (isClockValueInfinite(clock)) return null;
	const [ seconds, increment ] = clock.split('+').map(part => +part); // Convert them into a number
	const minutes = seconds / 60;
	return { minutes, increment };
}

/**
 * Returns true if the clock value is infinite. Internally, untimed games are represented with a "-".
 * @param {string} clock - The clock value (e.g. "10+5").
 * @returns {boolean} *true* if it's infinite.
 */
function isClockValueInfinite(clock) { return clock === '-'; }

export default {
	isClockValueValid,
	getMinutesAndIncrementFromClock,
	isClockValueInfinite,
};